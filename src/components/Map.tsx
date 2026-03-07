import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import { useEffect, useState, Fragment } from 'react';
import L from 'leaflet';
import type { TransportMode } from '../App';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Map Styles ──────────────────────────────────────────────────────────────
export const MAP_STYLES = [
  {
    id: 'light',
    label: 'Light',
    emoji: '☀️',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  {
    id: 'dark',
    label: 'Dark',
    emoji: '🌙',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  {
    id: 'streets',
    label: 'Streets',
    emoji: '🗺️',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: 'satellite',
    label: 'Satellite',
    emoji: '🛰️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
  {
    id: 'topo',
    label: 'Topo',
    emoji: '⛰️',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
] as const;

export type MapStyleId = typeof MAP_STYLES[number]['id'];

// ── Custom Markers ───────────────────────────────────────────────────────────
const createCustomMarker = (color: string) => L.divIcon({
  className: 'custom-marker',
  html: `<div style="
    background-color: ${color};
    width: 22px;
    height: 22px;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

const MODE_COLORS: Record<TransportMode, string> = {
  walking: '#6b7280',
  bicycle: '#16a34a',
  car: '#2563eb',
  transit: '#7c3aed',
};

// ── Map internals ────────────────────────────────────────────────────────────
function MapEvents({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (onClick) onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapUpdater({ origin, destination, route }: { origin: any; destination: any; route: any }) {
  const map = useMap();

  useEffect(() => {
    if (origin && destination) {
      const bounds = L.latLngBounds([origin, destination]);
      if (route?.geometry) route.geometry.forEach((pt: [number, number]) => bounds.extend(pt));
      if (route?.routeSegmentGeometry) route.routeSegmentGeometry.forEach((pt: [number, number]) => bounds.extend(pt));
      if (route?.isTransfer && route?.legs) {
        for (const leg of route.legs) {
          leg.routeSegmentGeometry?.forEach((pt: [number, number]) => bounds.extend(pt));
        }
      }
      map.fitBounds(bounds, { padding: [80, 80], animate: true, maxZoom: 16 });
    }
  }, [origin, destination, route, map]);

  return null;
}

// Marker icon helpers
function stopDotIcon(color: string, size = 8) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:2px solid rgba(255,255,255,0.9);box-shadow:0 1px 4px rgba(0,0,0,0.25)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function boardAlightIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="background:white;width:14px;height:14px;border-radius:50%;border:3px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,0.2)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function transferIcon(colorA: string, colorB: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:white;border:3px solid ${colorA};box-shadow:0 2px 8px rgba(0,0,0,0.28);display:flex;align-items:center;justify-content:center">
      <div style="width:8px;height:8px;border-radius:50%;background:${colorB}"></div>
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

// Style switcher overlay (sits on top-right of map)
function StyleSwitcher({ activeStyle, onChange }: { activeStyle: MapStyleId; onChange: (id: MapStyleId) => void }) {
  const [open, setOpen] = useState(false);
  const active = MAP_STYLES.find(s => s.id === activeStyle)!;

  return (
    <div className="absolute bottom-12 right-3 z-[1000] flex flex-col items-end gap-1.5" style={{ zIndex: 1000 }}>
      {open && (
        <div className="flex flex-col gap-1 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl p-2 border border-gray-100">
          {MAP_STYLES.map(style => (
            <button
              key={style.id}
              onClick={() => { onChange(style.id); setOpen(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${activeStyle === style.id
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <span>{style.emoji}</span>
              {style.label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md text-gray-700 text-[12px] font-bold px-3 py-2 rounded-xl shadow-lg border border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
        title="Change map style"
      >
        <span>{active.emoji}</span>
        {active.label}
      </button>
    </div>
  );
}

function PreviewFitter({ geometry }: { geometry: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (geometry.length < 2) return;
    const bounds = L.latLngBounds(geometry);
    map.fitBounds(bounds, { padding: [80, 80], animate: true, maxZoom: 16 });
  }, [geometry, map]);
  return null;
}

// ── Main Map Component ─────────────────────────────────────────────────────
interface MapProps {
  origin: [number, number] | null;
  destination: [number, number] | null;
  route: any | null;
  mode: TransportMode;
  onMapClick?: (lat: number, lng: number) => void;
  mapStyle: MapStyleId;
  onMapStyleChange: (id: MapStyleId) => void;
  previewRoute?: { geometry: [number, number][]; color: string; name: string } | null;
}

export default function Map({ origin, destination, route, mode, onMapClick, mapStyle, onMapStyleChange, previewRoute }: MapProps) {
  const center: [number, number] = [19.5438, -96.9270]; // Xalapa, Veracruz
  const routeColor = route?.routeColor || MODE_COLORS[mode];
  const activeTile = MAP_STYLES.find(s => s.id === mapStyle) ?? MAP_STYLES[0];

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        className="z-0"
      >
        <ZoomControl position="bottomright" />
        <MapUpdater origin={origin} destination={destination} route={route} />
        {!route && previewRoute && <PreviewFitter geometry={previewRoute.geometry} />}
        <MapEvents onClick={onMapClick} />

        <TileLayer
          key={activeTile.id}
          attribution={activeTile.attribution}
          url={activeTile.url}
          maxZoom={19}
        />

        {/* Origin marker (green) */}
        {origin && (
          <Marker position={origin} icon={createCustomMarker('#10b981')}>
            <Popup>Origin</Popup>
          </Marker>
        )}

        {/* Destination marker (red) */}
        {destination && (
          <Marker position={destination} icon={createCustomMarker('#ef4444')}>
            <Popup>Destination</Popup>
          </Marker>
        )}

        {/* ── Route rendering ── */}
        {route && (
          <>
            {/* OSRM routes (walk / bicycle / car) */}
            {route.geometry && (
              <Polyline
                positions={route.geometry}
                color={routeColor}
                weight={mode === 'walking' ? 5 : 6}
                opacity={0.85}
                dashArray={mode === 'walking' ? '1, 10' : undefined}
                lineCap="round"
                lineJoin="round"
              />
            )}

            {/* Transit route: single-bus (direct) */}
            {route.type === 'transit' && !route.isTransfer && route.originStop && route.destStop && (
              <>
                <Polyline
                  positions={route.walkToGeometry ?? [origin!, [route.originStop.lat, route.originStop.lng]]}
                  color={mapStyle === 'dark' ? '#d1d5db' : '#9ca3af'}
                  dashArray="1, 10" weight={5} opacity={0.85} lineCap="round"
                />
                {(route.routeSegmentGeometry?.length > 1) && (
                  <Polyline
                    positions={route.routeSegmentGeometry}
                    color={route.routeColor || '#7c3aed'}
                    weight={6} opacity={0.9} lineCap="round" lineJoin="round"
                    className="route-line-animated"
                  />
                )}
                <Polyline
                  positions={route.walkFromGeometry ?? [[route.destStop.lat, route.destStop.lng], destination!]}
                  color={mapStyle === 'dark' ? '#d1d5db' : '#9ca3af'}
                  dashArray="1, 10" weight={5} opacity={0.85} lineCap="round"
                />
                {route.pathStops?.slice(1, -1).map((stop: any, i: number) => (
                  <Marker key={`mid-${stop.id}-${i}`} position={[stop.lat, stop.lng]} icon={stopDotIcon(route.routeColor || '#7c3aed')}>
                    <Tooltip direction="top" offset={[0, -6]} opacity={0.95}><span style={{ fontSize: 12, fontWeight: 600 }}>{stop.name}</span></Tooltip>
                    <Popup>{stop.name}</Popup>
                  </Marker>
                ))}
                {[route.originStop, route.destStop].map((stop: any, i: number) => (
                  <Marker key={`ba-${stop.id}-${i}`} position={[stop.lat, stop.lng]} icon={boardAlightIcon(route.routeColor || '#7c3aed')}>
                    <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{i === 0 ? '🛑 Abordaje' : '📍 Bajada'}: {stop.name}</span>
                    </Tooltip>
                    <Popup>{stop.name}</Popup>
                  </Marker>
                ))}
              </>
            )}

            {/* Transit route: multi-bus (transfer) */}
            {route.type === 'transit' && route.isTransfer && route.legs?.map((leg: any, i: number) => {
              const walkColor = mapStyle === 'dark' ? '#d1d5db' : '#9ca3af';
              const prevAlight: [number, number] = i === 0
                ? origin!
                : [route.legs[i - 1].destStop.lat, route.legs[i - 1].destStop.lng];
              const isLastLeg = i === route.legs.length - 1;
              const nextColor = !isLastLeg ? route.legs[i + 1].routeColor : '';
              return (
                <Fragment key={`leg-${i}`}>
                  {/* Walk to this leg's boarding stop */}
                  <Polyline
                    positions={leg.walkGeometry ?? [prevAlight, [leg.originStop.lat, leg.originStop.lng]]}
                    color={walkColor} dashArray="1, 10" weight={5} opacity={0.85} lineCap="round"
                  />
                  {/* Bus segment */}
                  {leg.routeSegmentGeometry?.length > 1 && (
                    <Polyline
                      positions={leg.routeSegmentGeometry}
                      color={leg.routeColor} weight={6} opacity={0.9}
                      lineCap="round" lineJoin="round" className="route-line-animated"
                    />
                  )}
                  {/* Intermediate stop dots */}
                  {leg.pathStops?.slice(1, -1).map((stop: any, j: number) => (
                    <Marker key={`dot-${i}-${j}`} position={[stop.lat, stop.lng]} icon={stopDotIcon(leg.routeColor)}>
                      <Tooltip direction="top" offset={[0, -6]} opacity={0.95}><span style={{ fontSize: 12, fontWeight: 600 }}>{stop.name}</span></Tooltip>
                    </Marker>
                  ))}
                  {/* Boarding marker */}
                  <Marker position={[leg.originStop.lat, leg.originStop.lng]} icon={boardAlightIcon(leg.routeColor)}>
                    <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>🛑 Abordaje: {leg.originStop.name}</span>
                    </Tooltip>
                    <Popup>{leg.originStop.name}</Popup>
                  </Marker>
                  {/* Alighting marker: transfer icon between buses, regular alight for last */}
                  <Marker
                    position={[leg.destStop.lat, leg.destStop.lng]}
                    icon={!isLastLeg ? transferIcon(leg.routeColor, nextColor) : boardAlightIcon(leg.routeColor)}
                  >
                    <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        {!isLastLeg ? `🔄 Transbordo: ${leg.destStop.name}` : `📍 Bajada: ${leg.destStop.name}`}
                      </span>
                    </Tooltip>
                    <Popup>{leg.destStop.name}</Popup>
                  </Marker>
                </Fragment>
              );
            })}
            {/* Final walk for transfer routes */}
            {route.type === 'transit' && route.isTransfer && route.legs && (
              <Polyline
                positions={route.walkFromGeometry ?? [[route.legs.at(-1).destStop.lat, route.legs.at(-1).destStop.lng], destination!]}
                color={mapStyle === 'dark' ? '#d1d5db' : '#9ca3af'}
                dashArray="1, 10" weight={5} opacity={0.85} lineCap="round"
              />
            )}

            {/* Transit direct_walk type */}
            {route.type === 'direct_walk' && route.geometry && (
              <Polyline
                positions={route.geometry}
                color="#6b7280"
                weight={5}
                opacity={0.8}
                dashArray="1, 10"
                lineCap="round"
              />
            )}
          </>
        )}
        {/* Preview route (route browser click) — only when no routing result */}
        {!route && previewRoute && previewRoute.geometry.length > 1 && (
          <Polyline
            positions={previewRoute.geometry}
            color={previewRoute.color}
            weight={6}
            opacity={0.85}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapContainer>

      {/* Style switcher (outside MapContainer to avoid Leaflet z-index issues) */}
      <StyleSwitcher activeStyle={mapStyle} onChange={onMapStyleChange} />
    </div>
  );
}
