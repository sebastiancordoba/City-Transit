import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapEvents({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (onClick) onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

interface MapProps {
  origin: [number, number] | null;
  destination: [number, number] | null;
  route: any | null;
  onMapClick?: (lat: number, lng: number) => void;
}

export default function Map({ origin, destination, route, onMapClick }: MapProps) {
  const center: [number, number] = [37.7749, -122.4194]; // Default to SF

  // Calculate bounds if we have a route or points
  useEffect(() => {
    // We could use map.fitBounds here if we had a ref to the map
  }, [origin, destination, route]);

  return (
    <MapContainer 
      center={center} 
      zoom={13} 
      style={{ height: '100%', width: '100%' }}
    >
      <MapEvents onClick={onMapClick} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {/* Origin Marker */}
      {origin && (
        <Marker position={origin}>
          <Popup>Origin</Popup>
        </Marker>
      )}

      {/* Destination Marker */}
      {destination && (
        <Marker position={destination}>
          <Popup>Destination</Popup>
        </Marker>
      )}

      {/* Route Path */}
      {route && (
        <>
          {/* Walk to origin stop */}
          <Polyline 
            positions={[origin!, [route.originStop.lat, route.originStop.lng]]} 
            color="gray" 
            dashArray="5, 10" 
            weight={4}
          />
          
          {/* Bus route */}
          <Polyline 
            positions={route.pathStops.map((s: any) => [s.lat, s.lng])} 
            color={route.routeColor} 
            weight={6}
          />

          {/* Walk from dest stop */}
          <Polyline 
            positions={[[route.destStop.lat, route.destStop.lng], destination!]} 
            color="gray" 
            dashArray="5, 10" 
            weight={4}
          />

          {/* Bus Stops */}
          {route.pathStops.map((stop: any, idx: number) => (
            <Marker 
              key={stop.id} 
              position={[stop.lat, stop.lng]}
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: ${route.routeColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
              })}
            >
              <Popup>{stop.name}</Popup>
            </Marker>
          ))}
        </>
      )}
    </MapContainer>
  );
}
