/// <reference types="vite/client" />
/**
 * Client-side transit router.
 * Mirrors server-side route-algorithm.ts but works entirely in the browser
 * using the pre-built routes-data.json bundle (no Node/SQLite required).
 */

interface StopRecord {
    id: number;
    name: string;
    lat: number;
    lng: number;
    seq: number;
}
interface RouteRecord {
    id: number;
    name: string;
    description: string | null;
    color: string;
    geometry: [number, number][];
    stops: StopRecord[];
}

let routesData: RouteRecord[] | null = null;

export async function loadRoutesData(): Promise<RouteRecord[]> {
    if (routesData) return routesData;
    const base = import.meta.env.BASE_URL ?? '/';
    const res = await fetch(`${base}data/routes-data.json`);
    if (!res.ok) throw new Error('Failed to load routes data');
    routesData = await res.json();
    return routesData!;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clampGeometry(
    geometry: [number, number][],
    startLat: number, startLng: number,
    endLat: number, endLng: number
): [number, number][] {
    if (geometry.length === 0) return [];
    let si = 0, ei = geometry.length - 1;
    let minS = Infinity, minE = Infinity;
    for (let i = 0; i < geometry.length; i++) {
        const [lat, lng] = geometry[i];
        const ds = haversine(lat, lng, startLat, startLng);
        const de = haversine(lat, lng, endLat, endLng);
        if (ds < minS) { minS = ds; si = i; }
        if (de < minE) { minE = de; ei = i; }
    }
    if (si <= ei) return geometry.slice(si, ei + 1);
    return [...geometry.slice(ei, si + 1)].reverse();
}

// Each transport mode uses a DIFFERENT public routing server.
// router.project-osrm.org only runs the car/driving profile.
// For walking and cycling we use routing.openstreetmap.de which has
// separate OSRM instances built with the correct graph data.
const OSRM_ENDPOINTS: Record<OsrmProfile, string> = {
    foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
    bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
    car: 'https://router.project-osrm.org/route/v1/driving',
};

export type OsrmProfile = 'foot' | 'bike' | 'car';

export async function fetchOSRMRoute(
    profile: OsrmProfile,
    originLat: number, originLng: number,
    destLat: number, destLng: number
) {
    const base = OSRM_ENDPOINTS[profile];
    const url = `${base}/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM error: ${res.statusText}`);
    const data = await res.json() as any;
    if (!data.routes?.length) throw new Error('No route found');
    const route = data.routes[0];
    const geometry: [number, number][] = route.geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng]
    );
    const instructions = (route.legs[0]?.steps ?? []).map((step: any) => {
        const t = step.maneuver?.type ?? '';
        const mod = step.maneuver?.modifier ?? '';
        const iconMap: Record<string, string> = {
            'turn': mod.includes('left') ? 'turn-left' : 'turn-right',
            'new name': mod.includes('left') ? 'turn-left' : 'turn-right',
            'depart': 'start',
            'arrive': 'arrive',
            'roundabout': 'roundabout',
            'rotary': 'roundabout',
            'continue': 'straight',
            'merge': 'straight',
        };
        const textMap: Record<string, string> = {
            depart: 'Comienza en',
            arrive: 'Llegas a tu destino',
            roundabout: 'Toma la rotonda',
        };
        const streetName = step.name ? `${step.name}` : '';
        const text = textMap[t] ? `${textMap[t]}${streetName ? ` · ${streetName}` : ''}` : streetName || 'Continúa recto';
        return {
            type: t,
            icon: iconMap[t] ?? 'straight',
            text,
            subtext: `${Math.round(step.distance)} m · ${Math.round(step.duration / 60)} min`,
        };
    });
    return {
        mode: profile === 'foot' ? 'walking' : profile === 'bike' ? 'bicycle' : 'car',
        geometry,
        distance: route.distance,
        duration: route.duration,
        instructions,
    };
}

const MAX_RESULTS = 5;      // max alternative routes to return

export async function findTransitRoutes(
    originLat: number, originLng: number,
    destLat: number, destLng: number,
    maxWalk = 1000            // configurable walk radius in metres
): Promise<any[]> {
    const routes = await loadRoutesData();
    const directWalk = haversine(originLat, originLng, destLat, destLng);

    // Short distances: just walk it
    if (directWalk <= 800) {
        return [{
            type: 'transit',
            routeId: -1,
            routeName: null,
            routeDescription: null,
            routeColor: '#6b7280',
            routeSegmentGeometry: [],
            walkToGeometry: null,
            walkFromGeometry: null,
            originStop: null,
            destStop: null,
            pathStops: [],
            distance: directWalk,
            duration: (directWalk / 80) * 60,
            instructions: [{
                type: 'walk', icon: 'walk',
                text: 'Camina directamente a tu destino',
                subtext: `~${Math.round(directWalk)} m · ${Math.round(directWalk / 80)} min`,
            }],
        }];
    }

    // ── Collect best stop-pair per unique route ──────────────────────────
    // key = route.id, value = best (lowest estimated duration) candidate
    const byRoute = new Map<number, { route: RouteRecord; oStop: StopRecord; dStop: StopRecord; walkTo: number; walkFrom: number; oi: number; di: number; estDuration: number }>();

    for (const route of routes) {
        const stops = route.stops;
        for (let oi = 0; oi < stops.length; oi++) {
            const oStop = stops[oi];
            const walkTo = haversine(originLat, originLng, oStop.lat, oStop.lng);
            if (walkTo > maxWalk) continue;

            for (let di = oi + 1; di < stops.length; di++) {
                const dStop = stops[di];
                const walkFrom = haversine(destLat, destLng, dStop.lat, dStop.lng);
                if (walkFrom > maxWalk) continue;

                const transitStops = di - oi;
                // Estimate: walking at 80 m/min + ~2 min per bus stop
                const estDuration = ((walkTo + walkFrom) / 80 + transitStops * 2) * 60;

                const prev = byRoute.get(route.id);
                if (!prev || estDuration < prev.estDuration) {
                    byRoute.set(route.id, { route, oStop, dStop, walkTo, walkFrom, oi, di, estDuration });
                }
            }
        }
    }

    if (byRoute.size === 0) return [];

    // Sort by estimated duration, keep top MAX_RESULTS
    const candidates = [...byRoute.values()]
        .sort((a, b) => a.estDuration - b.estDuration)
        .slice(0, MAX_RESULTS);

    // ── Fetch OSRM walk legs in parallel for all candidates ──────────────
    const results = await Promise.all(candidates.map(async c => {
        const { route, oStop, dStop, walkTo, walkFrom, oi, di } = c;
        const transitStops = di - oi;
        const pathStops: StopRecord[] = route.stops.slice(oi, di + 1);
        const geometry = clampGeometry(route.geometry, oStop.lat, oStop.lng, dStop.lat, dStop.lng);

        const [walkToRes, walkFromRes] = await Promise.allSettled([
            fetchOSRMRoute('foot', originLat, originLng, oStop.lat, oStop.lng),
            fetchOSRMRoute('foot', dStop.lat, dStop.lng, destLat, destLng),
        ]);

        const walkToGeometry = walkToRes.status === 'fulfilled' ? walkToRes.value.geometry : null;
        const walkFromGeometry = walkFromRes.status === 'fulfilled' ? walkFromRes.value.geometry : null;
        const walkToDuration = walkToRes.status === 'fulfilled' ? walkToRes.value.duration : (walkTo / 80) * 60;
        const walkFromDuration = walkFromRes.status === 'fulfilled' ? walkFromRes.value.duration : (walkFrom / 80) * 60;

        // Est. bus time: ~28 km/h average urban speed, 300 m per stop
        const busDuration = (transitStops * 300) / (28000 / 3600);
        const totalDuration = walkToDuration + busDuration + walkFromDuration;

        const instructions = [
            { type: 'walk', icon: 'walk', text: `Camina hasta ${oStop.name}`, subtext: `~${Math.round(walkTo)} m · ${Math.round(walkToDuration / 60)} min` },
            { type: 'board', icon: 'bus', text: `Aborda ${route.name}`, subtext: route.description ? `Dirección: ${route.description}` : `Hacia ${dStop.name}`, color: route.color },
            { type: 'ride', icon: 'ride', text: `Viaja ${transitStops} parada${transitStops !== 1 ? 's' : ''}`, subtext: transitStops > 1 ? `Pasando ${transitStops - 1} parada${transitStops - 1 !== 1 ? 's' : ''} intermedia${transitStops - 1 !== 1 ? 's' : ''}` : 'La siguiente parada es tu destino' },
            { type: 'alight', icon: 'alight', text: `Bájate en ${dStop.name}`, subtext: 'Tu parada de bajada' },
            { type: 'walk', icon: 'walk', text: 'Camina a tu destino', subtext: `~${Math.round(walkFrom)} m · ${Math.round(walkFromDuration / 60)} min` },
        ];

        return {
            type: 'transit' as const,
            routeId: route.id,
            routeName: route.name,
            routeDescription: route.description,
            routeColor: route.color,
            routeSegmentGeometry: geometry,
            walkToGeometry,
            walkFromGeometry,
            originStop: oStop,
            destStop: dStop,
            pathStops,
            distance: walkTo + walkFrom + transitStops * 300,
            duration: totalDuration,
            instructions,
        };
    }));

    // Final sort by actual computed duration
    return results.sort((a, b) => a.duration - b.duration);
}

/** @deprecated use findTransitRoutes */
export async function findTransitRoute(
    originLat: number, originLng: number,
    destLat: number, destLng: number
) {
    const results = await findTransitRoutes(originLat, originLng, destLat, destLng);
    return results[0] ?? null;
}


export async function getAllRoutes(): Promise<{ id: number; name: string; description: string | null; color: string }[]> {
    const routes = await loadRoutesData();
    return routes
        .map(r => ({ id: r.id, name: r.name, description: r.description, color: r.color }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
