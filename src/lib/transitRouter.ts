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

// Maps our internal profile names to OSRM's public API profile names
const OSRM_PROFILE_MAP = {
    foot: 'walking',
    bike: 'cycling',
    car: 'driving',
} as const;

export type OsrmProfile = keyof typeof OSRM_PROFILE_MAP;

export async function fetchOSRMRoute(
    profile: OsrmProfile,
    originLat: number, originLng: number,
    destLat: number, destLng: number
) {
    const osrmProfile = OSRM_PROFILE_MAP[profile];
    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
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

export async function findTransitRoute(
    originLat: number, originLng: number,
    destLat: number, destLng: number
) {
    const routes = await loadRoutesData();
    const directWalk = haversine(originLat, originLng, destLat, destLng);

    if (directWalk <= 800) {
        return {
            type: 'direct_walk',
            distance: directWalk,
            duration: (directWalk / 80) * 60,
            geometry: [[originLat, originLng], [destLat, destLng]] as [number, number][],
            instructions: [{
                type: 'walk', icon: 'walk',
                text: 'Camina directamente a tu destino',
                subtext: `~${Math.round(directWalk)} m · ${Math.round(directWalk / 80)} min`,
            }],
            pathStops: [],
        };
    }

    const MAX_WALK = 1000;
    let bestRoute: any = null;
    let minScore = Infinity;

    for (const route of routes) {
        const stops = route.stops;
        for (let oi = 0; oi < stops.length; oi++) {
            const oStop = stops[oi];
            const walkTo = haversine(originLat, originLng, oStop.lat, oStop.lng);
            if (walkTo > MAX_WALK) continue;

            for (let di = oi + 1; di < stops.length; di++) {
                const dStop = stops[di];
                const walkFrom = haversine(destLat, destLng, dStop.lat, dStop.lng);
                if (walkFrom > MAX_WALK) continue;

                const score = walkTo * 2 + walkFrom * 2 + (di - oi) * 300;
                if (score < minScore) {
                    minScore = score;
                    bestRoute = { route, oStop, dStop, walkTo, walkFrom, oi, di };
                }
            }
        }
    }

    if (!bestRoute) return null;

    const { route, oStop, dStop, walkTo, walkFrom, oi, di } = bestRoute;
    const pathStops: StopRecord[] = route.stops.slice(oi, di + 1);
    const transitStops = di - oi;
    const geometry = clampGeometry(route.geometry, oStop.lat, oStop.lng, dStop.lat, dStop.lng);

    // Fetch OSRM walk geometries in parallel (non-fatal if they fail)
    const [walkToResult, walkFromResult] = await Promise.allSettled([
        fetchOSRMRoute('foot', originLat, originLng, oStop.lat, oStop.lng),
        fetchOSRMRoute('foot', dStop.lat, dStop.lng, destLat, destLng),
    ]);
    const walkToGeometry = walkToResult.status === 'fulfilled' ? walkToResult.value.geometry : null;
    const walkFromGeometry = walkFromResult.status === 'fulfilled' ? walkFromResult.value.geometry : null;

    const instructions = [
        { type: 'walk', icon: 'walk', text: `Camina hasta ${oStop.name}`, subtext: `~${Math.round(walkTo)} m · ${Math.round(walkTo / 80)} min` },
        { type: 'board', icon: 'bus', text: `Aborda ${route.name}`, subtext: route.description ? `Dirección: ${route.description}` : `Hacia ${dStop.name}`, color: route.color },
        { type: 'ride', icon: 'ride', text: `Viaja ${transitStops} parada${transitStops !== 1 ? 's' : ''}`, subtext: transitStops > 1 ? `Pasando ${transitStops - 1} parada${transitStops - 1 !== 1 ? 's' : ''} intermedia${transitStops - 1 !== 1 ? 's' : ''}` : 'La siguiente parada es tu destino' },
        { type: 'alight', icon: 'alight', text: `Bájate en ${dStop.name}`, subtext: 'Tu parada de bajada' },
        { type: 'walk', icon: 'walk', text: 'Camina a tu destino', subtext: `~${Math.round(walkFrom)} m · ${Math.round(walkFrom / 80)} min` },
    ];

    return {
        type: 'transit',
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
        duration: ((walkTo + walkFrom) / 80 + transitStops * 2) * 60,
        instructions,
    };
}

export async function getAllRoutes(): Promise<{ id: number; name: string; description: string | null; color: string }[]> {
    const routes = await loadRoutesData();
    return routes
        .map(r => ({ id: r.id, name: r.name, description: r.description, color: r.color }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
