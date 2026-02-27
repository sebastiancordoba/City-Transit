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

/**
 * From the stored route geometry (full LineString), extract only the segment
 * between two stops by finding the closest points on the polyline.
 */
function clampGeometryBetweenStops(
  geometry: [number, number][],
  startLat: number, startLng: number,
  endLat: number, endLng: number
): [number, number][] {
  if (geometry.length === 0) return [];

  let startIdx = 0;
  let endIdx = geometry.length - 1;
  let minStartDist = Infinity;
  let minEndDist = Infinity;

  for (let i = 0; i < geometry.length; i++) {
    const [lat, lng] = geometry[i];
    const dStart = getDistance(lat, lng, startLat, startLng);
    const dEnd = getDistance(lat, lng, endLat, endLng);
    if (dStart < minStartDist) { minStartDist = dStart; startIdx = i; }
    if (dEnd < minEndDist) { minEndDist = dEnd; endIdx = i; }
  }

  if (startIdx <= endIdx) return geometry.slice(startIdx, endIdx + 1);
  // Return direction — reversed route
  return [...geometry.slice(endIdx, startIdx + 1)].reverse();
}

export function findTransitRoute(originLat: number, originLng: number, destLat: number, destLng: number) {
  const directWalkDistance = getDistance(originLat, originLng, destLat, destLng);

  // If destination is walkable (< 800m), recommend walking directly
  const MAX_DIRECT_WALK_M = 800;
  if (directWalkDistance <= MAX_DIRECT_WALK_M) {
    return {
      type: 'direct_walk',
      distance: directWalkDistance,
      duration: (directWalkDistance / 80) * 60,
      geometry: [[originLat, originLng], [destLat, destLng]] as [number, number][],
      instructions: [
        {
          type: 'walk',
          text: `Walk directly to your destination`,
          subtext: `About ${Math.round(directWalkDistance)} m · ${Math.round(directWalkDistance / 80)} min`,
          icon: 'walk'
        }
      ],
      pathStops: []
    };
  }

  // --- Transit route search ---
  const stops = db.prepare('SELECT * FROM stops').all() as any[];
  const maxWalkDistance = 1000; // 1 km

  const originStops = stops.filter(s => getDistance(originLat, originLng, s.lat, s.lng) <= maxWalkDistance);
  const destStops = stops.filter(s => getDistance(destLat, destLng, s.lat, s.lng) <= maxWalkDistance);

  if (originStops.length === 0 || destStops.length === 0) {
    return null;
  }

  let bestRoute: any = null;
  let minScore = Infinity;

  for (const oStop of originStops) {
    for (const dStop of destStops) {
      if (oStop.id === dStop.id) continue;

      const routesQuery = `
        SELECT r.id, r.name, r.color, r.description, r.geometry,
               rs1.stop_order as o_order, rs2.stop_order as d_order
        FROM routes r
        JOIN route_stops rs1 ON r.id = rs1.route_id
        JOIN route_stops rs2 ON r.id = rs2.route_id
        WHERE rs1.stop_id = ? AND rs2.stop_id = ?
          AND rs1.stop_order < rs2.stop_order
      `;
      const routes = db.prepare(routesQuery).all(oStop.id, dStop.id) as any[];

      for (const route of routes) {
        const walkToOrigin = getDistance(originLat, originLng, oStop.lat, oStop.lng);
        const walkFromDest = getDistance(destLat, destLng, dStop.lat, dStop.lng);
        // Score: fewer walk metres + fewer transit stops = better
        const score = walkToOrigin * 2 + walkFromDest * 2 + (route.d_order - route.o_order) * 300;

        if (score < minScore) {
          minScore = score;
          bestRoute = {
            type: 'transit',
            routeId: route.id,
            routeName: route.name,
            routeDescription: route.description,
            routeColor: route.color,
            routeGeometry: JSON.parse(route.geometry) as [number, number][],
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

  // Get stops between origin and destination for display
  const intermediateStopsQuery = `
    SELECT s.id, s.name, s.lat, s.lng, rs.stop_order
    FROM stops s
    JOIN route_stops rs ON s.id = rs.stop_id
    WHERE rs.route_id = ? AND rs.stop_order >= ? AND rs.stop_order <= ?
    ORDER BY rs.stop_order ASC
  `;
  const pathStops = db.prepare(intermediateStopsQuery).all(
    bestRoute.routeId, bestRoute.oOrder, bestRoute.dOrder
  ) as any[];

  // Extract the section of the route geometry between the two stops
  const routeSegmentGeometry = clampGeometryBetweenStops(
    bestRoute.routeGeometry,
    bestRoute.originStop.lat, bestRoute.originStop.lng,
    bestRoute.destStop.lat, bestRoute.destStop.lng
  );

  const totalWalk = bestRoute.walkToOrigin + bestRoute.walkFromDest;
  const transitStops = bestRoute.dOrder - bestRoute.oOrder;
  const duration = (totalWalk / 80 + transitStops * 2) * 60;
  const distance = totalWalk + transitStops * 300;

  const instructions = [
    {
      type: 'walk',
      text: `Walk to ${bestRoute.originStop.name}`,
      subtext: `About ${Math.round(bestRoute.walkToOrigin)} m · ${Math.round(bestRoute.walkToOrigin / 80)} min`,
      icon: 'walk'
    },
    {
      type: 'board',
      text: `Board ${bestRoute.routeName}`,
      subtext: bestRoute.routeDescription
        ? `Direction: ${bestRoute.routeDescription}`
        : `Toward ${bestRoute.destStop.name}`,
      icon: 'bus',
      color: bestRoute.routeColor
    },
    {
      type: 'ride',
      text: `Ride for ${transitStops} stop${transitStops !== 1 ? 's' : ''}`,
      subtext: transitStops > 1
        ? `Passing ${transitStops - 1} intermediate stop${transitStops - 1 !== 1 ? 's' : ''}`
        : 'Next stop is your destination',
      icon: 'ride'
    },
    {
      type: 'alight',
      text: `Get off at ${bestRoute.destStop.name}`,
      subtext: `Your alighting stop`,
      icon: 'alight'
    },
    {
      type: 'walk',
      text: `Walk to your destination`,
      subtext: `About ${Math.round(bestRoute.walkFromDest)} m · ${Math.round(bestRoute.walkFromDest / 80)} min`,
      icon: 'walk'
    }
  ];

  return {
    ...bestRoute,
    routeSegmentGeometry,
    distance,
    duration,
    pathStops,
    instructions
  };
}
