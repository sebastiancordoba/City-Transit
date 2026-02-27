import Database from 'better-sqlite3';

const db = new Database(':memory:'); // Use in-memory for prototype

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL
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

// Seed data
const insertRoute = db.prepare('INSERT INTO routes (name, color) VALUES (?, ?)');
const insertStop = db.prepare('INSERT INTO stops (name, lat, lng) VALUES (?, ?, ?)');
const insertRouteStop = db.prepare('INSERT INTO route_stops (route_id, stop_id, stop_order) VALUES (?, ?, ?)');

// Route 1: Market Street Line
const r1 = insertRoute.run('Market Street Line', '#F59E0B').lastInsertRowid;
const stopsR1 = [
  { name: 'Ferry Building', lat: 37.7955, lng: -122.3937 },
  { name: 'Montgomery', lat: 37.7893, lng: -122.4014 },
  { name: 'Powell', lat: 37.7844, lng: -122.4080 },
  { name: 'Civic Center', lat: 37.7796, lng: -122.4137 },
  { name: 'Van Ness', lat: 37.7753, lng: -122.4187 },
  { name: 'Castro', lat: 37.7625, lng: -122.4353 }
];

stopsR1.forEach((s, i) => {
  const stopId = insertStop.run(s.name, s.lat, s.lng).lastInsertRowid;
  insertRouteStop.run(r1, stopId, i + 1);
});

// Route 2: Mission Street Line
const r2 = insertRoute.run('Mission Street Line', '#EF4444').lastInsertRowid;
const stopsR2 = [
  { name: 'Transbay Terminal', lat: 37.7898, lng: -122.3972 },
  { name: '16th St Mission', lat: 37.7650, lng: -122.4197 },
  { name: '24th St Mission', lat: 37.7522, lng: -122.4184 },
  { name: 'Glen Park', lat: 37.7331, lng: -122.4338 }
];

stopsR2.forEach((s, i) => {
  const stopId = insertStop.run(s.name, s.lat, s.lng).lastInsertRowid;
  insertRouteStop.run(r2, stopId, i + 1);
});

// Route 3: Geary BRT
const r3 = insertRoute.run('Geary BRT', '#3B82F6').lastInsertRowid;
const stopsR3 = [
  { name: 'Transbay Terminal', lat: 37.7898, lng: -122.3972 },
  { name: 'Union Square', lat: 37.7879, lng: -122.4074 },
  { name: 'Japantown', lat: 37.7850, lng: -122.4296 },
  { name: 'Fillmore', lat: 37.7841, lng: -122.4330 },
  { name: 'Richmond', lat: 37.7808, lng: -122.4766 }
];

stopsR3.forEach((s, i) => {
  // Check if stop exists (e.g. Transbay Terminal)
  let stopId;
  const existing = db.prepare('SELECT id FROM stops WHERE name = ?').get(s.name) as any;
  if (existing) {
    stopId = existing.id;
  } else {
    stopId = insertStop.run(s.name, s.lat, s.lng).lastInsertRowid;
  }
  insertRouteStop.run(r3, stopId, i + 1);
});

export default db;
