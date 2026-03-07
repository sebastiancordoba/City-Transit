/**
 * scripts/generate-data.ts
 * Run with: npx tsx scripts/generate-data.ts
 *
 * Reads all GeoJSON files in /routes and writes
 * public/data/routes-data.json for the static client-side router.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = path.join(__dirname, '..', 'routes');
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'routes-data.json');

const PALETTE = [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
    '#14B8A6', '#A855F7', '#0EA5E9', '#22C55E', '#EAB308',
];

function lineStringToLatLng(coords: number[][]): [number, number][] {
    return coords.map(([lng, lat]) => [lat, lng]);
}
function multiLineStringToLatLng(ca: number[][][]): [number, number][] {
    return ca.flatMap(c => c.map(([lng, lat]) => [lat, lng] as [number, number]));
}
function extractGeometry(feature: any): [number, number][] {
    const g = feature.geometry;
    if (!g) return [];
    if (g.type === 'LineString') return lineStringToLatLng(g.coordinates);
    if (g.type === 'MultiLineString') return multiLineStringToLatLng(g.coordinates);
    return [];
}

// Discover file groups
const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.geojson'));
const groups = new Map<string, { route?: string; stops: string[] }>();

for (const file of files) {
    const stem = file.replace('.geojson', '');
    const isRoute = /(_routes?(_ida|_vuelta)?|_route)$/.test(stem);
    const isStop = /(_stops?(_ida|_vuelta)?)$/.test(stem);

    let key = stem
        .replace(/_routes?_ida$/, '_ida')
        .replace(/_routes?_vuelta$/, '_vuelta')
        .replace(/_routes?$/, '')
        .replace(/_stops?_ida$/, '_ida')
        .replace(/_stops?_vuelta$/, '_vuelta')
        .replace(/_stops?$/, '');

    if (!groups.has(key)) groups.set(key, { stops: [] });
    const g = groups.get(key)!;
    if (isRoute) g.route = file;
    else if (isStop) g.stops.push(file);
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
interface StopRecord {
    id: number;
    name: string;
    lat: number;
    lng: number;
    seq: number;
}

const output: RouteRecord[] = [];
let colorIdx = 0;
let routeId = 1;
let stopIdCounter = 1;
// coordinate → stop id dedup map
const stopMap = new Map<string, number>();
const allStops = new Map<number, StopRecord>();

for (const [key, { route, stops }] of groups) {
    if (!route) continue;

    const routeGeoJSON = JSON.parse(fs.readFileSync(path.join(ROUTES_DIR, route), 'utf8'));
    // Extract route number from the file key (e.g. "003_ida" → 3, "034a" → 34)
    const routeNumMatch = key.match(/^(\d+)/);
    const routeNumber = routeNumMatch ? parseInt(routeNumMatch[1]) : 0;

    for (const feature of routeGeoJSON.features) {
        const props = feature.properties || {};
        const name = props.name || props.desc || key;
        const desc = props.desc || null;
        const color = PALETTE[colorIdx++ % PALETTE.length];
        const geometry = extractGeometry(feature);
        if (geometry.length === 0) continue;

        const routeStops: StopRecord[] = [];

        for (const stopFile of stops) {
            const stopsGeoJSON = JSON.parse(fs.readFileSync(path.join(ROUTES_DIR, stopFile), 'utf8'));
            const features = stopsGeoJSON.features
                .filter((f: any) => f.geometry?.type === 'Point')
                .sort((a: any, b: any) => (a.properties?.sequence ?? 0) - (b.properties?.sequence ?? 0));

            for (const sf of features) {
                const [lng, lat] = sf.geometry.coordinates;
                const seq: number = sf.properties?.sequence ?? 0;
                const sname = sf.properties?.name || `Parada ${seq}`;
                const key2 = `${lat.toFixed(5)},${lng.toFixed(5)}`;

                let sid = stopMap.get(key2);
                if (!sid) {
                    sid = stopIdCounter++;
                    stopMap.set(key2, sid);
                    allStops.set(sid, { id: sid, name: sname, lat, lng, seq });
                }
                routeStops.push({ ...(allStops.get(sid)!), seq });
            }
        }

        // Sort by seq, dedup
        const seen = new Set<number>();
        const dedupedStops = routeStops
            .sort((a, b) => a.seq - b.seq)
            .filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });

        output.push({ id: routeId++, routeNumber, fileKey: key, name, description: desc, color, geometry, stops: dedupedStops });
    }
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(output));
console.log(`✓ Generated ${output.length} routes with ${allStops.size} unique stops → ${OUT_FILE}`);
