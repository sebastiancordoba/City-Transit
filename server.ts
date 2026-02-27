import express from 'express';
import { createServer as createViteServer } from 'vite';
import { findTransitRoute } from './src/route-algorithm.js';
import db from './src/database.js';


const OSRM_PROFILES: Record<string, string> = {
  walking: 'foot',
  bicycle: 'bike',
  car: 'car',
};

async function fetchOSRMRoute(profile: string, originLat: number, originLng: number, destLat: number, destLng: number) {
  const url = `https://router.project-osrm.org/route/v1/${profile}/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM request failed: ${res.statusText}`);
  const data = await res.json() as any;

  if (!data.routes || data.routes.length === 0) {
    throw new Error('No route found');
  }

  const route = data.routes[0];
  const geometry: [number, number][] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);

  // Flatten all steps into instructions
  const instructions: any[] = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      if (!step.maneuver || step.distance < 1) continue;
      instructions.push({
        type: step.maneuver.type,
        text: formatManeuver(step),
        subtext: `${formatDistance(step.distance)} · ${formatDuration(step.duration)}`,
        icon: maneuverIcon(step.maneuver.type, step.maneuver.modifier),
      });
    }
  }

  return {
    mode: profile === 'foot' ? 'walking' : profile === 'bike' ? 'bicycle' : 'car',
    geometry,
    distance: route.distance,
    duration: route.duration,
    instructions,
  };
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}

function maneuverIcon(type: string, modifier?: string): string {
  if (type === 'depart') return 'start';
  if (type === 'arrive') return 'arrive';
  if (type === 'turn') {
    if (modifier?.includes('left')) return 'turn-left';
    if (modifier?.includes('right')) return 'turn-right';
    return 'straight';
  }
  if (type === 'roundabout' || type === 'rotary') return 'roundabout';
  return 'straight';
}

function formatManeuver(step: any): string {
  const name = step.name ? ` onto ${step.name}` : '';
  const mod = step.maneuver?.modifier ? ` ${step.maneuver.modifier}` : '';
  switch (step.maneuver.type) {
    case 'depart': return `Head${mod}${name}`;
    case 'arrive': return `Arrive at destination`;
    case 'turn': return `Turn${mod}${name}`;
    case 'continue': return `Continue${mod}${name}`;
    case 'merge': return `Merge${mod}${name}`;
    case 'ramp': return `Take ramp${name}`;
    case 'fork': return `Keep${mod}${name}`;
    case 'roundabout': return `Enter roundabout${name}`;
    case 'rotary': return `Enter rotary${name}`;
    case 'exit roundabout': return `Exit roundabout${name}`;
    default: return step.maneuver.type.charAt(0).toUpperCase() + step.maneuver.type.slice(1);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/routes', (req, res) => {
    const routes = db.prepare('SELECT id, name, description, color FROM routes ORDER BY name ASC').all();
    res.json(routes);
  });

  app.post('/api/route', async (req, res) => {
    const { originLat, originLng, destLat, destLng, mode = 'transit' } = req.body;

    if (!originLat || !originLng || !destLat || !destLng) {
      return res.status(400).json({ error: 'Missing coordinates' });
    }

    try {
      if (mode === 'transit') {
        const route = findTransitRoute(originLat, originLng, destLat, destLng);
        if (!route) {
          return res.status(404).json({ error: 'No transit route found nearby. Try a different location or transport mode.' });
        }

        // Enrich transit route with real OSRM walking geometry for both walk legs
        let walkToGeometry: [number, number][] | null = null;
        let walkFromGeometry: [number, number][] | null = null;

        if (route.type === 'transit' && route.originStop && route.destStop) {
          // Fetch both walk leg geometries in parallel
          const [walkToResult, walkFromResult] = await Promise.allSettled([
            fetchOSRMRoute('foot', originLat, originLng, route.originStop.lat, route.originStop.lng),
            fetchOSRMRoute('foot', route.destStop.lat, route.destStop.lng, destLat, destLng),
          ]);

          if (walkToResult.status === 'fulfilled') walkToGeometry = walkToResult.value.geometry;
          if (walkFromResult.status === 'fulfilled') walkFromGeometry = walkFromResult.value.geometry;
        }

        return res.json({ ...route, mode: 'transit', walkToGeometry, walkFromGeometry });
      }

      const osrmProfile = OSRM_PROFILES[mode];
      if (!osrmProfile) {
        return res.status(400).json({ error: `Unknown transport mode: ${mode}` });
      }

      const route = await fetchOSRMRoute(osrmProfile, originLat, originLng, destLat, destLng);
      return res.json(route);

    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to find route' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
