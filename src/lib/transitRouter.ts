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
    routeNumber: number;
    fileKey: string;
    name: string;
    description: string | null;
    color: string;
    geometry: [number, number][];
    stops: StopRecord[];
}

let routesData: RouteRecord[] | null = null;
// Stop → routes index, built once after load
let stopToRoutes: Map<number, { route: RouteRecord; idx: number }[]> | null = null;
// All stops flattened (with route info), for spatial queries
let allStopsFlat: (StopRecord & { routeId: number })[] | null = null;

export async function loadRoutesData(): Promise<RouteRecord[]> {
    if (routesData) return routesData;
    const base = import.meta.env.BASE_URL ?? '/';
    const res = await fetch(`${base}data/routes-data.json`);
    if (!res.ok) throw new Error('Failed to load routes data');
    routesData = await res.json();

    // Build stop → routes index
    stopToRoutes = new Map();
    allStopsFlat = [];
    for (const route of routesData!) {
        for (let idx = 0; idx < route.stops.length; idx++) {
            const stop = route.stops[idx];
            if (!stopToRoutes.has(stop.id)) stopToRoutes.set(stop.id, []);
            stopToRoutes.get(stop.id)!.push({ route, idx });
            allStopsFlat!.push({ ...stop, routeId: route.id });
        }
    }

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

/** Returns stops within radiusM of (lat, lng), using bbox pre-filter. */
function stopsNear(lat: number, lng: number, radiusM: number): (StopRecord & { routeId: number })[] {
    if (!allStopsFlat) return [];
    const dLat = radiusM / 111_000;
    const dLng = radiusM / (111_000 * Math.cos((lat * Math.PI) / 180));
    return allStopsFlat.filter(s =>
        Math.abs(s.lat - lat) <= dLat &&
        Math.abs(s.lng - lng) <= dLng &&
        haversine(lat, lng, s.lat, s.lng) <= radiusM
    );
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

const MAX_RESULTS = 5;
const MAX_TRANSFER_WALK = 400; // metres between alighting stop A and boarding stop B
const MAX_TRANSFERS = 2;       // up to 3 buses total

// ── Direct single-bus candidates ──────────────────────────────────────────────

interface DirectCandidate {
    route: RouteRecord;
    oStop: StopRecord;
    dStop: StopRecord;
    walkTo: number;
    walkFrom: number;
    oi: number;
    di: number;
    estDuration: number;
}

function findDirectCandidates(
    routes: RouteRecord[],
    originLat: number, originLng: number,
    destLat: number, destLng: number,
    maxWalk: number
): DirectCandidate[] {
    const byRoute = new Map<number, DirectCandidate>();

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
                const estDuration = ((walkTo + walkFrom) / 80 + transitStops * 2) * 60;

                const prev = byRoute.get(route.id);
                if (!prev || estDuration < prev.estDuration) {
                    byRoute.set(route.id, { route, oStop, dStop, walkTo, walkFrom, oi, di, estDuration });
                }
            }
        }
    }

    return [...byRoute.values()].sort((a, b) => a.estDuration - b.estDuration);
}

// ── Multi-leg (transfer) candidates ───────────────────────────────────────────

interface LegInfo {
    route: RouteRecord;
    boardIdx: number;
    alightIdx: number;
    boardStop: StopRecord;
    alightStop: StopRecord;
    walkToBoard: number; // metres from previous alight (or origin) to this boarding stop
}

interface TransferCandidate {
    legs: LegInfo[];
    finalWalkFrom: number;
    estDuration: number;
}

interface OpenPath {
    legs: LegInfo[];
    lastLat: number;
    lastLng: number;
    usedRouteIds: Set<number>;
    estSoFar: number; // seconds so far (walks + transit)
}

function estLegDuration(walkToBoard: number, transitStops: number): number {
    return (walkToBoard / 80) * 60 + transitStops * 2 * 60;
}

function findMultiLegCandidates(
    originLat: number, originLng: number,
    destLat: number, destLng: number,
    maxWalk: number
): TransferCandidate[] {
    if (!stopToRoutes) return [];

    const results: TransferCandidate[] = [];
    // key = joined route ids, value = best estDuration
    const seen = new Map<string, number>();

    // Seed: paths of 0 legs, starting at origin
    let openPaths: OpenPath[] = [{
        legs: [],
        lastLat: originLat,
        lastLng: originLng,
        usedRouteIds: new Set(),
        estSoFar: 0,
    }];

    for (let transfer = 0; transfer < MAX_TRANSFERS; transfer++) {
        const nextPaths: OpenPath[] = [];
        const walkRadius = transfer === 0 ? maxWalk : MAX_TRANSFER_WALK;

        for (const path of openPaths) {
            const nearStops = stopsNear(path.lastLat, path.lastLng, walkRadius);

            // Group by route to avoid redundant inner loops
            const routeMap = new Map<number, { route: RouteRecord; entries: { stop: StopRecord; idx: number; walkToBoard: number }[] }>();
            for (const s of nearStops) {
                const entries = stopToRoutes!.get(s.id) ?? [];
                for (const { route, idx } of entries) {
                    if (path.usedRouteIds.has(route.id)) continue;
                    if (!routeMap.has(route.id)) routeMap.set(route.id, { route, entries: [] });
                    routeMap.get(route.id)!.entries.push({
                        stop: s,
                        idx,
                        walkToBoard: haversine(path.lastLat, path.lastLng, s.lat, s.lng),
                    });
                }
            }

            for (const { route, entries } of routeMap.values()) {
                // Best boarding option for this route (shortest walk)
                const best = entries.reduce((a, b) => a.walkToBoard < b.walkToBoard ? a : b);
                const { stop: boardStop, idx: boardIdx, walkToBoard } = best;

                const newUsed = new Set(path.usedRouteIds);
                newUsed.add(route.id);

                for (let di = boardIdx + 1; di < route.stops.length; di++) {
                    const alightStop = route.stops[di];
                    const transitStops = di - boardIdx;
                    const legEst = estLegDuration(walkToBoard, transitStops);

                    // Check if this alighting stop reaches destination
                    const walkFrom = haversine(destLat, destLng, alightStop.lat, alightStop.lng);
                    if (walkFrom <= maxWalk) {
                        const totalEst = path.estSoFar + legEst + (walkFrom / 80) * 60;
                        const newLegs = [...path.legs, { route, boardIdx, alightIdx: di, boardStop, alightStop, walkToBoard }];
                        // Only record if this is a multi-leg path (at least 2 buses)
                        if (newLegs.length >= 2) {
                            const key = newLegs.map(l => l.route.id).join('→');
                            if (!seen.has(key) || seen.get(key)! > totalEst) {
                                seen.set(key, totalEst);
                                results.push({ legs: newLegs, finalWalkFrom: walkFrom, estDuration: totalEst });
                            }
                        }
                    }

                    // Expand for next transfer level (only if more transfers allowed)
                    if (transfer < MAX_TRANSFERS - 1) {
                        const newEst = path.estSoFar + legEst;
                        nextPaths.push({
                            legs: [...path.legs, { route, boardIdx, alightIdx: di, boardStop, alightStop, walkToBoard }],
                            lastLat: alightStop.lat,
                            lastLng: alightStop.lng,
                            usedRouteIds: newUsed,
                            estSoFar: newEst,
                        });
                    }
                }
            }
        }

        // Prune open paths: keep best 150 by estSoFar to avoid combinatorial explosion
        nextPaths.sort((a, b) => a.estSoFar - b.estSoFar);
        openPaths = nextPaths.slice(0, 150);
    }

    return results.sort((a, b) => a.estDuration - b.estDuration);
}

// ── Result builders ────────────────────────────────────────────────────────────

async function buildDirectResult(
    c: DirectCandidate,
    originLat: number, originLng: number,
    destLat: number, destLng: number
) {
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
        isTransfer: false,
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
}

async function buildTransferResult(
    tc: TransferCandidate,
    originLat: number, originLng: number,
    destLat: number, destLng: number
) {
    const { legs, finalWalkFrom } = tc;

    // Fetch OSRM for all walk segments in parallel:
    // [origin → leg0.board, leg0.alight → leg1.board, ..., lastAlight → dest]
    const walkFetches = legs.map((leg, i) => {
        const fromLat = i === 0 ? originLat : legs[i - 1].alightStop.lat;
        const fromLng = i === 0 ? originLng : legs[i - 1].alightStop.lng;
        return fetchOSRMRoute('foot', fromLat, fromLng, leg.boardStop.lat, leg.boardStop.lng);
    });
    const lastAlight = legs[legs.length - 1].alightStop;
    const finalWalkFetch = fetchOSRMRoute('foot', lastAlight.lat, lastAlight.lng, destLat, destLng);

    const [legWalkResults, finalWalkRes] = await Promise.all([
        Promise.allSettled(walkFetches),
        finalWalkFetch.catch(() => null),
    ]);

    let totalDuration = 0;
    const builtLegs = legs.map((leg, i) => {
        const walkRes = legWalkResults[i];
        const walkGeometry = walkRes.status === 'fulfilled' ? walkRes.value.geometry : null;
        const walkDist = leg.walkToBoard;
        const walkDur = walkRes.status === 'fulfilled' ? walkRes.value.duration : (walkDist / 80) * 60;
        const transitStops = leg.alightIdx - leg.boardIdx;
        const busDur = (transitStops * 300) / (28000 / 3600);
        totalDuration += walkDur + busDur;

        return {
            routeId: leg.route.id,
            routeName: leg.route.name,
            routeDescription: leg.route.description,
            routeColor: leg.route.color,
            routeSegmentGeometry: clampGeometry(leg.route.geometry, leg.boardStop.lat, leg.boardStop.lng, leg.alightStop.lat, leg.alightStop.lng),
            walkGeometry,
            walkDuration: walkDur,
            walkDistance: walkDist,
            originStop: leg.boardStop,
            destStop: leg.alightStop,
            pathStops: leg.route.stops.slice(leg.boardIdx, leg.alightIdx + 1),
            transitStops,
        };
    });

    const finalWalkDur = finalWalkRes ? finalWalkRes.duration : (finalWalkFrom / 80) * 60;
    totalDuration += finalWalkDur;

    // Build instructions
    const instructions: any[] = [];
    for (let i = 0; i < builtLegs.length; i++) {
        const leg = builtLegs[i];
        if (i === 0) {
            instructions.push({ type: 'walk', icon: 'walk', text: `Camina hasta ${leg.originStop.name}`, subtext: `~${Math.round(leg.walkDistance)} m · ${Math.round(leg.walkDuration / 60)} min` });
        } else {
            instructions.push({ type: 'transfer', icon: 'transfer', text: `Camina al siguiente camión`, subtext: `~${Math.round(leg.walkDistance)} m · ${Math.round(leg.walkDuration / 60)} min` });
        }
        instructions.push({ type: 'board', icon: 'bus', text: `Aborda ${leg.routeName}`, subtext: leg.routeDescription ? `Dirección: ${leg.routeDescription}` : `Hacia ${leg.destStop.name}`, color: leg.routeColor });
        instructions.push({ type: 'ride', icon: 'ride', text: `Viaja ${leg.transitStops} parada${leg.transitStops !== 1 ? 's' : ''}`, subtext: leg.transitStops > 1 ? `Pasando ${leg.transitStops - 1} parada${leg.transitStops - 1 !== 1 ? 's' : ''} intermedia${leg.transitStops - 1 !== 1 ? 's' : ''}` : 'La siguiente parada es tu destino' });
    }
    const lastLeg = builtLegs[builtLegs.length - 1];
    instructions.push({ type: 'alight', icon: 'alight', text: `Bájate en ${lastLeg.destStop.name}`, subtext: 'Tu parada de bajada' });
    instructions.push({ type: 'walk', icon: 'walk', text: 'Camina a tu destino', subtext: `~${Math.round(finalWalkFrom)} m · ${Math.round(finalWalkDur / 60)} min` });

    const routeName = builtLegs.map(l => l.routeName).join(' → ');

    return {
        type: 'transit' as const,
        isTransfer: true,
        legs: builtLegs,
        // Backward-compat fields for AlternativesStrip and Map:
        routeId: builtLegs[0].routeId,
        routeName,
        routeDescription: builtLegs[0].routeDescription,
        routeColor: builtLegs[0].routeColor,
        // For non-isTransfer rendering fallback:
        routeSegmentGeometry: builtLegs[0].routeSegmentGeometry,
        walkToGeometry: builtLegs[0].walkGeometry,
        walkFromGeometry: finalWalkRes?.geometry ?? null,
        originStop: builtLegs[0].originStop,
        destStop: lastLeg.destStop,
        pathStops: builtLegs.flatMap(l => l.pathStops),
        distance: builtLegs.reduce((s, l) => s + l.walkDistance + l.transitStops * 300, 0) + finalWalkFrom,
        duration: totalDuration,
        instructions,
    };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function findTransitRoutes(
    originLat: number, originLng: number,
    destLat: number, destLng: number,
    maxWalk = 1000
): Promise<any[]> {
    const routes = await loadRoutesData();
    const directWalk = haversine(originLat, originLng, destLat, destLng);

    // Short distances: just walk it
    if (directWalk <= 800) {
        return [{
            type: 'transit',
            isTransfer: false,
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
            legs: null,
            distance: directWalk,
            duration: (directWalk / 80) * 60,
            instructions: [{
                type: 'walk', icon: 'walk',
                text: 'Camina directamente a tu destino',
                subtext: `~${Math.round(directWalk)} m · ${Math.round(directWalk / 80)} min`,
            }],
        }];
    }

    // Find direct and transfer candidates
    const directCandidates = findDirectCandidates(routes, originLat, originLng, destLat, destLng, maxWalk);
    const transferCandidates = findMultiLegCandidates(originLat, originLng, destLat, destLng, maxWalk);

    // Merge and sort by estimated duration, keep top MAX_RESULTS
    type AnyCandidate = { estDuration: number; kind: 'direct'; data: DirectCandidate } | { estDuration: number; kind: 'transfer'; data: TransferCandidate };
    const merged: AnyCandidate[] = [
        ...directCandidates.map(d => ({ estDuration: d.estDuration, kind: 'direct' as const, data: d })),
        ...transferCandidates.map(t => ({ estDuration: t.estDuration, kind: 'transfer' as const, data: t })),
    ];
    merged.sort((a, b) => a.estDuration - b.estDuration);
    const top = merged.slice(0, MAX_RESULTS);

    if (top.length === 0) return [];

    // Fetch OSRM walk geometries in parallel for all top candidates
    const results = await Promise.all(top.map(c =>
        c.kind === 'direct'
            ? buildDirectResult(c.data, originLat, originLng, destLat, destLng)
            : buildTransferResult(c.data, originLat, originLng, destLat, destLng)
    ));

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


export interface RoutePreview {
    geometry: [number, number][];
    color: string;
    name: string;
    stops: { lat: number; lng: number; seq: number }[];
}

export interface RouteListItem {
    id: number;
    routeNumber: number;
    fileKey: string;
    name: string;
    description: string | null;
    color: string;
    geometry: [number, number][];
    stops: { id: number; lat: number; lng: number; seq: number }[];
}

export async function getAllRoutes(): Promise<RouteListItem[]> {
    const routes = await loadRoutesData();
    return routes
        .map(r => ({
            id: r.id,
            routeNumber: r.routeNumber,
            fileKey: r.fileKey,
            name: r.name,
            description: r.description,
            color: r.color,
            geometry: r.geometry,
            stops: r.stops.map(s => ({ id: s.id, lat: s.lat, lng: s.lng, seq: s.seq })),
        }))
        .sort((a, b) => a.routeNumber - b.routeNumber || a.fileKey.localeCompare(b.fileKey));
}
