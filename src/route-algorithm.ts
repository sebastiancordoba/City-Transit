import db from './database.js';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function findRoute(originLat: number, originLng: number, destLat: number, destLng: number) {
  // Find all stops
  const stops = db.prepare('SELECT * FROM stops').all() as any[];

  // Find nearby stops for origin and destination
  const maxWalkDistance = 2000; // 2km
  const originStops = stops.filter(s => getDistance(originLat, originLng, s.lat, s.lng) <= maxWalkDistance);
  const destStops = stops.filter(s => getDistance(destLat, destLng, s.lat, s.lng) <= maxWalkDistance);

  if (originStops.length === 0 || destStops.length === 0) {
    return null; // No nearby stops
  }

  let bestRoute = null;
  let minScore = Infinity;

  // Find a direct route
  for (const oStop of originStops) {
    for (const dStop of destStops) {
      if (oStop.id === dStop.id) continue;

      // Find routes that contain both stops
      const routesQuery = `
        SELECT r.id, r.name, r.color, rs1.stop_order as o_order, rs2.stop_order as d_order
        FROM routes r
        JOIN route_stops rs1 ON r.id = rs1.route_id
        JOIN route_stops rs2 ON r.id = rs2.route_id
        WHERE rs1.stop_id = ? AND rs2.stop_id = ? AND rs1.stop_order < rs2.stop_order
      `;
      const routes = db.prepare(routesQuery).all(oStop.id, dStop.id) as any[];

      for (const route of routes) {
        const walkToOrigin = getDistance(originLat, originLng, oStop.lat, oStop.lng);
        const walkFromDest = getDistance(destLat, destLng, dStop.lat, dStop.lng);
        
        // Score: walking distance is heavily penalized compared to bus distance
        const score = walkToOrigin * 2 + walkFromDest * 2 + (route.d_order - route.o_order) * 500;

        if (score < minScore) {
          minScore = score;
          bestRoute = {
            routeId: route.id,
            routeName: route.name,
            routeColor: route.color,
            originStop: oStop,
            destStop: dStop,
            oOrder: route.o_order,
            dOrder: route.d_order,
            walkToOrigin,
            walkFromDest
          };
        }
      }
    }
  }

  if (!bestRoute) return null;

  // Get all intermediate stops for the best route to draw the path
  const intermediateStopsQuery = `
    SELECT s.id, s.name, s.lat, s.lng, rs.stop_order
    FROM stops s
    JOIN route_stops rs ON s.id = rs.stop_id
    WHERE rs.route_id = ? AND rs.stop_order >= ? AND rs.stop_order <= ?
    ORDER BY rs.stop_order ASC
  `;
  const pathStops = db.prepare(intermediateStopsQuery).all(bestRoute.routeId, bestRoute.oOrder, bestRoute.dOrder) as any[];

  // Generate instructions
  const instructions = [
    {
      type: 'walk',
      text: `Walk ${Math.round(bestRoute.walkToOrigin)}m to ${bestRoute.originStop.name}`,
      icon: 'walk'
    },
    {
      type: 'board',
      text: `Board the ${bestRoute.routeName}`,
      icon: 'bus',
      color: bestRoute.routeColor
    },
    {
      type: 'ride',
      text: `Ride for ${bestRoute.dOrder - bestRoute.oOrder} stops`,
      icon: 'ride'
    },
    {
      type: 'alight',
      text: `Get off at ${bestRoute.destStop.name}`,
      icon: 'alight'
    },
    {
      type: 'walk',
      text: `Walk ${Math.round(bestRoute.walkFromDest)}m to your destination`,
      icon: 'walk'
    }
  ];

  return {
    ...bestRoute,
    pathStops,
    instructions
  };
}
