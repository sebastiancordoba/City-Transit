import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = path.join(__dirname, '..', 'routes');

const db = new Database(':memory:');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL,
    geometry TEXT NOT NULL   -- JSON array of [lat,lng] pairs for the route line
  );

  CREATE TABLE IF NOT EXISTS stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS route_stops (
    route_id INTEGER,
    stop_id INTEGER,
    stop_order INTEGER,
    FOREIGN KEY(route_id) REFERENCES routes(id),
    FOREIGN KEY(stop_id) REFERENCES stops(id),
    PRIMARY KEY (route_id, stop_id)
  );
`);

// --- Prepared statements ---
const insertRoute = db.prepare('INSERT INTO routes (name, description, color, geometry) VALUES (?, ?, ?, ?)');
const insertStop = db.prepare('INSERT INTO stops (name, lat, lng) VALUES (?, ?, ?)');
const insertRouteStop = db.prepare('INSERT INTO route_stops (route_id, stop_id, stop_order) VALUES (?, ?, ?)');
const findStop = db.prepare('SELECT id FROM stops WHERE abs(lat - ?) < 0.0001 AND abs(lng - ?) < 0.0001 LIMIT 1');

// --- Color palette (cycles through routes) ---
const PALETTE = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  '#14B8A6', '#A855F7', '#0EA5E9', '#22C55E', '#EAB308',
];

// --- Geometry helpers ---
function lineStringToLatLng(coords: number[][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}

function multiLineStringToLatLng(coordsArray: number[][][]): [number, number][] {
  return coordsArray.flatMap(coords => coords.map(([lng, lat]) => [lat, lng] as [number, number]));
}

function extractGeometry(feature: any): [number, number][] {
  const geom = feature.geometry;
  if (!geom) return [];
  if (geom.type === 'LineString') return lineStringToLatLng(geom.coordinates);
  if (geom.type === 'MultiLineString') return multiLineStringToLatLng(geom.coordinates);
  return [];
}

// --- Discover all route files ---
function getRouteGroups(): Map<string, { route?: string; stops?: string[] }> {
  const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.geojson'));
  const groups = new Map<string, { route?: string; stops?: string[] }>();

  for (const file of files) {
    // Extract base key: e.g. "001", "003_ida", "020_routes_ida" -> just use filename stem as key
    const stem = file.replace('.geojson', '');
    const isRoute = stem.endsWith('_route') || stem.endsWith('_routes') || stem.endsWith('_routes_ida') || stem.endsWith('_routes_vuelta');
    const isStop = stem.endsWith('_stops') || stem.endsWith('_stop') || stem.endsWith('_stops_ida') || stem.endsWith('_stops_vuelta');

    // Determine group key by stripping the trailing _route/_stops/_stop/_routes suffix + direction
    let key = stem
      .replace(/_routes_ida$/, '_ida')
      .replace(/_routes_vuelta$/, '_vuelta')
      .replace(/_route$/, '')
      .replace(/_routes$/, '')
      .replace(/_stops_ida$/, '_ida')
      .replace(/_stops_vuelta$/, '_vuelta')
      .replace(/_stops$/, '')
      .replace(/_stop$/, '');

    if (!groups.has(key)) groups.set(key, { stops: [] });
    const g = groups.get(key)!;

    if (isRoute) g.route = file;
    else if (isStop) g.stops!.push(file);
  }

  return groups;
}

// --- Load all routes ---
let colorIndex = 0;

function loadRouteGroup(key: string, routeFile: string, stopFiles: string[]) {
  const routePath = path.join(ROUTES_DIR, routeFile);
  const routeGeoJSON = JSON.parse(fs.readFileSync(routePath, 'utf8'));

  for (const feature of routeGeoJSON.features) {
    const props = feature.properties || {};
    const name = props.name || props.desc || key;
    const description = props.desc || null;
    const color = PALETTE[colorIndex % PALETTE.length];
    colorIndex++;

    const geometry = extractGeometry(feature);
    if (geometry.length === 0) continue;

    const routeId = insertRoute.run(name, description, color, JSON.stringify(geometry)).lastInsertRowid;

    // Load stops for this route
    for (const stopFile of stopFiles) {
      const stopsPath = path.join(ROUTES_DIR, stopFile);
      const stopsGeoJSON = JSON.parse(fs.readFileSync(stopsPath, 'utf8'));

      // Sort by sequence
      const stopFeatures = stopsGeoJSON.features
        .filter((f: any) => f.geometry?.type === 'Point')
        .sort((a: any, b: any) => (a.properties?.sequence ?? 0) - (b.properties?.sequence ?? 0));

      for (const sf of stopFeatures) {
        const [lng, lat] = sf.geometry.coordinates;
        const seq: number = sf.properties?.sequence ?? 0;
        const stopName = sf.properties?.name || `Stop ${seq}`;

        // Deduplicate stops by position
        let existing = findStop.get(lat, lng) as any;
        let stopId: number | bigint;
        if (existing) {
          stopId = existing.id;
        } else {
          stopId = insertStop.run(stopName, lat, lng).lastInsertRowid;
        }

        // Ignore duplicate stop-route pairs
        try {
          insertRouteStop.run(routeId, stopId, seq);
        } catch {
          // Duplicate primary key — skip
        }
      }
    }
  }
}

// --- Main load ---
const groups = getRouteGroups();
let loaded = 0;
let skipped = 0;

for (const [key, { route, stops }] of groups) {
  if (!route) { skipped++; continue; }
  try {
    loadRouteGroup(key, route, stops || []);
    loaded++;
  } catch (err: any) {
    console.error(`[db] Failed to load route group "${key}":`, err.message);
    skipped++;
  }
}

const routeCount = (db.prepare('SELECT COUNT(*) as n FROM routes').get() as any).n;
const stopCount = (db.prepare('SELECT COUNT(*) as n FROM stops').get() as any).n;
console.log(`[db] Loaded ${routeCount} route variants, ${stopCount} stops (${skipped} groups skipped)`);

export default db;
