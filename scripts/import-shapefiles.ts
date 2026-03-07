#!/usr/bin/env tsx
/**
 * scripts/import-shapefiles.ts
 *
 * Converts all shapefiles in routes/shapefiles-mapton-ciudadano/ to GeoJSON,
 * deduplicates against existing routes, and writes clean files to routes/.
 *
 * Run with: npx tsx scripts/import-shapefiles.ts
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SHP_BASE = path.join(ROOT, 'routes', 'shapefiles-mapton-ciudadano');
const ROUTES_DIR = path.join(ROOT, 'routes');
const TEMP_DIR = path.join(os.tmpdir(), 'city-transit-shp-import');

fs.mkdirSync(TEMP_DIR, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractRouteNumber(dirName: string): number {
  const m = dirName.match(/^(\d+)/);
  return m ? parseInt(m[1]) : -1;
}

/** Convert a .shp or .zip to GeoJSON via ogr2ogr. Returns parsed object or null. */
function convertToGeoJSON(src: string, tag: string): any | null {
  const tempFile = path.join(TEMP_DIR, `${tag}.geojson`);
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  try {
    const srcArg = src.endsWith('.zip') ? `/vsizip/${src}` : src;
    execSync(`ogr2ogr -f GeoJSON -t_srs EPSG:4326 "${tempFile}" "${srcArg}"`, { stdio: 'pipe' });
    if (!fs.existsSync(tempFile)) return null;
    return JSON.parse(fs.readFileSync(tempFile, 'utf8'));
  } catch {
    return null;
  }
}

/** Write a FeatureCollection to disk */
function writeGeoJSON(filePath: string, name: string, features: any[]): void {
  const fc = {
    type: 'FeatureCollection',
    name,
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features,
  };
  fs.writeFileSync(filePath, JSON.stringify(fc, null, 2));
}

function isRouteGeom(geojson: any): boolean {
  return geojson?.features?.some((f: any) =>
    f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'
  ) ?? false;
}

function isStopGeom(geojson: any): boolean {
  return geojson?.features?.some((f: any) => f.geometry?.type === 'Point') ?? false;
}

function normalizeRouteProps(p: any, routeNum: number, dirName: string) {
  return {
    fid: p.fid ?? 1,
    id: p.id ?? String(routeNum),
    name: p.name || p.Name || p.NAME || `Ruta ${routeNum}`,
    desc: p.desc || p.description || p.Description || dirName,
    notes: p.notes || p.Notes || '',
    peak_am: p.peak_am ?? null,
    midday: p.midday ?? null,
    peak_pm: p.peak_pm ?? null,
    night: p.night ?? null,
  };
}

function normalizeStopProps(p: any, idx: number) {
  return {
    fid: p.fid ?? idx + 1,
    id: p.id ?? String(idx),
    routeId: p.routeId ?? '',
    sequence: p.sequence ?? p.seq ?? idx,
    travelTime: p.travelTime ?? null,
    dwellTime: p.dwellTime ?? null,
    arrivalTim: p.arrivalTim ?? null,
    departureT: p.departureT ?? null,
  };
}

/** Find a shapefile (zip or shp) for a given type in a directory. */
function findSrc(dir: string, type: 'route' | 'stops'): string | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir).filter(e => !e.startsWith('.') && !e.startsWith('__MACOSX'));

  const keywords = type === 'route'
    ? ['route', 'cto', 'circuito', 'ruta', 'ogrgeo']
    : ['stop'];

  // Prefer .zip, then .shp
  for (const ext of ['.zip', '.shp']) {
    const hits = entries.filter(e => e.toLowerCase().endsWith(ext));
    // Try keyword match first
    const matched = hits.find(e => keywords.some(k => e.toLowerCase().includes(k)));
    if (matched) return path.join(dir, matched);
    // If only one file of this ext and we're looking for route, return it
    if (type === 'route' && hits.length === 1) return path.join(dir, hits[0]);
    if (type === 'stops' && hits.length === 1 && entries.filter(e => e.endsWith('.zip') || e.endsWith('.shp')).length <= 2) {
      // Two files total: one route, one stops
      const routeFile = findSrc(dir, 'route');
      if (routeFile && !routeFile.endsWith(hits[0])) return path.join(dir, hits[0]);
    }
  }
  return null;
}

// ─── Processing ───────────────────────────────────────────────────────────────

interface Written {
  routeNum: number;
  files: string[];
}
const written: Written[] = [];
const processedNums = new Set<number>();

/** Process a route+stops pair from a directory, with a given output prefix. */
function processPair(srcDir: string, outPrefix: string, routeNum: number, dirName: string): string[] {
  const results: string[] = [];
  const tag = outPrefix.replace(/\//g, '_');

  // --- Route ---
  const routeSrc = findSrc(srcDir, 'route');
  if (routeSrc) {
    const raw = convertToGeoJSON(routeSrc, `${tag}_r`);
    if (raw) {
      if (isRouteGeom(raw)) {
        const features = raw.features
          .filter((f: any) => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString')
          .map((f: any) => ({ ...f, properties: normalizeRouteProps(f.properties, routeNum, dirName) }));
        if (features.length) {
          const outFile = path.join(ROUTES_DIR, `${outPrefix}_route.geojson`);
          writeGeoJSON(outFile, `${outPrefix}_route`, features);
          results.push(outFile);
        }
      } else if (isStopGeom(raw)) {
        // Zip named "route" but actually contains stops — save as stops
        const features = raw.features
          .filter((f: any) => f.geometry?.type === 'Point')
          .map((f: any, i: number) => ({ ...f, properties: normalizeStopProps(f.properties, i) }));
        if (features.length) {
          const outFile = path.join(ROUTES_DIR, `${outPrefix}_stops.geojson`);
          writeGeoJSON(outFile, `${outPrefix}_stops`, features);
          results.push(outFile);
        }
      }
    }
  }

  // --- Stops ---
  const stopsSrc = findSrc(srcDir, 'stops');
  if (stopsSrc && stopsSrc !== routeSrc) {
    const raw = convertToGeoJSON(stopsSrc, `${tag}_s`);
    if (raw && isStopGeom(raw)) {
      const features = raw.features
        .filter((f: any) => f.geometry?.type === 'Point')
        .map((f: any, i: number) => ({ ...f, properties: normalizeStopProps(f.properties, i) }));
      if (features.length) {
        const outFile = path.join(ROUTES_DIR, `${outPrefix}_stops.geojson`);
        writeGeoJSON(outFile, `${outPrefix}_stops`, features);
        if (!results.includes(outFile)) results.push(outFile);
      }
    }
  }

  return results;
}

const dirs = fs.readdirSync(SHP_BASE)
  .filter(d => {
    const full = path.join(SHP_BASE, d);
    return fs.statSync(full).isDirectory() && !d.startsWith('.');
  })
  .sort((a, b) => extractRouteNumber(a) - extractRouteNumber(b));

console.log(`\n📦 Processing ${dirs.length} shapefile directories…\n`);

for (const dirName of dirs) {
  const dirPath = path.join(SHP_BASE, dirName);
  const routeNum = extractRouteNumber(dirName);
  if (routeNum < 0) { console.log(`  ⚠  skip ${dirName} (no number)`); continue; }

  const numStr = String(routeNum).padStart(3, '0');
  const entries = fs.readdirSync(dirPath).filter(e => !e.startsWith('.') && e !== '__MACOSX');
  const subdirs = entries.filter(e => fs.statSync(path.join(dirPath, e)).isDirectory());

  const hasIda = subdirs.includes('ida');
  const hasVuelta = subdirs.includes('vuelta');
  const hasRuta1 = subdirs.includes('ruta_1');
  const hasRuta2 = subdirs.includes('ruta_2');
  const hasRoutes = subdirs.includes('routes');
  const hasStops = subdirs.includes('stops');

  const files: string[] = [];

  if (hasIda && hasVuelta) {
    files.push(...processPair(path.join(dirPath, 'ida'), `${numStr}_ida`, routeNum, dirName));
    files.push(...processPair(path.join(dirPath, 'vuelta'), `${numStr}_vuelta`, routeNum, dirName));
  } else if (hasRuta1 || hasRuta2) {
    if (hasRuta1) files.push(...processPair(path.join(dirPath, 'ruta_1'), `${numStr}a`, routeNum, dirName));
    if (hasRuta2) files.push(...processPair(path.join(dirPath, 'ruta_2'), `${numStr}b`, routeNum, dirName));
  } else if (hasRoutes && hasStops) {
    // Versioned (e.g. 68_circuito) — pick latest by sorting
    const routeVersionDir = path.join(dirPath, 'routes');
    const stopVersionDir = path.join(dirPath, 'stops');
    const latestRoute = fs.readdirSync(routeVersionDir).filter(f => f.endsWith('.zip')).sort().pop();
    const latestStop = fs.readdirSync(stopVersionDir).filter(f => f.endsWith('.zip')).sort().pop();

    // Build a tmp dir with just the latest zips so processPair can find them
    const tmpVersionDir = path.join(TEMP_DIR, `version_${numStr}`);
    fs.mkdirSync(tmpVersionDir, { recursive: true });
    if (latestRoute) fs.copyFileSync(path.join(routeVersionDir, latestRoute), path.join(tmpVersionDir, 'route.zip'));
    if (latestStop) fs.copyFileSync(path.join(stopVersionDir, latestStop), path.join(tmpVersionDir, 'stops.zip'));
    files.push(...processPair(tmpVersionDir, numStr, routeNum, dirName));
  } else {
    // Simple flat directory
    files.push(...processPair(dirPath, numStr, routeNum, dirName));
  }

  const success = files.length > 0;
  if (success) {
    processedNums.add(routeNum);
    written.push({ routeNum, files });
    const labels = files.map(f => path.basename(f)).join(', ');
    console.log(`  ✓ ${dirName} → ${labels}`);
  } else {
    console.log(`  ✗ ${dirName} — no files produced`);
  }
}

// ─── Clean up old GeoJSON files superseded by new conversions ─────────────────

console.log('\n🧹 Removing old GeoJSON files superseded by new conversions…\n');

const oldFiles = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.geojson'));
let deletedCount = 0;

for (const oldFile of oldFiles) {
  const m = oldFile.match(/^0*(\d+)/);
  if (!m) continue;
  const oldNum = parseInt(m[1]);

  if (!processedNums.has(oldNum)) continue;

  // Build the canonical new filename(s) for this route number
  const numStr = String(oldNum).padStart(3, '0');
  const newNames = written
    .filter(w => w.routeNum === oldNum)
    .flatMap(w => w.files.map(f => path.basename(f)));

  // If this old file is NOT one we just wrote, delete it
  if (!newNames.includes(oldFile)) {
    fs.unlinkSync(path.join(ROUTES_DIR, oldFile));
    console.log(`  🗑  Deleted old: ${oldFile}`);
    deletedCount++;
  }
}

// ─── Deduplication check ──────────────────────────────────────────────────────

console.log('\n🔍 Checking for duplicate routes…\n');

interface RouteSignature {
  file: string;
  firstCoord: [number, number] | null;
  lastCoord: [number, number] | null;
  bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
  coordCount: number;
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(sin2));
}

const signatures: RouteSignature[] = [];
const routeFiles = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('_route.geojson'));

for (const rFile of routeFiles) {
  const gc = JSON.parse(fs.readFileSync(path.join(ROUTES_DIR, rFile), 'utf8'));
  const allCoords: number[][] = gc.features.flatMap((f: any) => {
    const g = f.geometry;
    if (!g) return [];
    if (g.type === 'LineString') return g.coordinates;
    if (g.type === 'MultiLineString') return g.coordinates.flat();
    return [];
  });
  if (allCoords.length === 0) continue;

  const lngs = allCoords.map((c: number[]) => c[0]);
  const lats = allCoords.map((c: number[]) => c[1]);
  signatures.push({
    file: rFile,
    firstCoord: [allCoords[0][0], allCoords[0][1]],
    lastCoord: [allCoords[allCoords.length - 1][0], allCoords[allCoords.length - 1][1]],
    bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
    coordCount: allCoords.length,
  });
}

const DISTANCE_THRESHOLD_M = 100; // 100m for start/end match = likely duplicate
const duplicatePairs: [string, string][] = [];

for (let i = 0; i < signatures.length; i++) {
  for (let j = i + 1; j < signatures.length; j++) {
    const a = signatures[i];
    const b = signatures[j];
    if (!a.firstCoord || !a.lastCoord || !b.firstCoord || !b.lastCoord) continue;

    const startDist = haversineM(a.firstCoord, b.firstCoord);
    const endDist = haversineM(a.lastCoord, b.lastCoord);
    const coordRatio = Math.min(a.coordCount, b.coordCount) / Math.max(a.coordCount, b.coordCount);

    // Same start AND same end AND similar number of coordinates → likely duplicate
    if (startDist < DISTANCE_THRESHOLD_M && endDist < DISTANCE_THRESHOLD_M && coordRatio > 0.8) {
      duplicatePairs.push([a.file, b.file]);
      console.log(`  ⚠  Possible duplicate: ${a.file} ↔ ${b.file} (start: ${startDist.toFixed(0)}m, end: ${endDist.toFixed(0)}m, coord ratio: ${coordRatio.toFixed(2)})`);
    }
  }
}

if (duplicatePairs.length === 0) {
  console.log('  ✅ No duplicates found.');
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════');
console.log(`✅ Done!`);
console.log(`   Converted: ${processedNums.size} route groups`);
console.log(`   Files written: ${written.flatMap(w => w.files).length}`);
console.log(`   Old files deleted: ${deletedCount}`);
console.log(`   Possible duplicates: ${duplicatePairs.length}`);
if (duplicatePairs.length > 0) {
  console.log(`\n   Review these files manually and remove duplicates if needed.`);
}
console.log('');
