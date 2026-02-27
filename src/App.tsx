import { useState, useEffect, useCallback } from 'react';
import Map from './components/Map';
import type { MapStyleId } from './components/Map';
import Sidebar from './components/Sidebar';
import { findTransitRoute, fetchOSRMRoute, loadRoutesData } from './lib/transitRouter';

export type TransportMode = 'walking' | 'bicycle' | 'car' | 'transit';

const OSRM_PROFILES: Record<string, 'foot' | 'bike' | 'car'> = {
  walking: 'foot',
  bicycle: 'bike',
  car: 'car',
};

export default function App() {
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TransportMode>('transit');
  const [mapStyle, setMapStyle] = useState<MapStyleId>('streets');

  // Pre-load route data on mount so first search is instant
  useEffect(() => { loadRoutesData().catch(() => { }); }, []);

  const handleMapClick = (lat: number, lng: number) => {
    if (route) { setOrigin([lat, lng]); setDestination(null); setRoute(null); setError(null); return; }
    if (!origin) { setOrigin([lat, lng]); }
    else if (!destination) { setDestination([lat, lng]); }
    else { setOrigin([lat, lng]); setDestination(null); setRoute(null); }
  };

  const handleSelectPlace = (lat: number, lng: number, _label: string, field: 'origin' | 'destination') => {
    if (route) { setRoute(null); setError(null); }
    if (field === 'origin') setOrigin([lat, lng]);
    else setDestination([lat, lng]);
  };

  const findRoute = useCallback(async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'transit') {
        const result = await findTransitRoute(origin[0], origin[1], destination[0], destination[1]);
        if (!result) throw new Error('No se encontró una ruta de transporte cercana. Intenta con otra ubicación.');
        setRoute({ ...result, mode: 'transit' });
      } else {
        const profile = OSRM_PROFILES[mode];
        const result = await fetchOSRMRoute(profile, origin[0], origin[1], destination[0], destination[1]);
        setRoute(result);
      }
    } catch (err: any) {
      setError(err.message || 'Error al encontrar la ruta');
    } finally {
      setLoading(false);
    }
  }, [origin, destination, mode]);

  const clear = () => { setOrigin(null); setDestination(null); setRoute(null); setError(null); };
  const swap = () => { setOrigin(destination); setDestination(origin); setRoute(null); setError(null); };
  const handleModeChange = (newMode: TransportMode) => { setMode(newMode); setRoute(null); setError(null); };

  return (
    <main className="relative h-screen w-full overflow-hidden bg-gray-50 antialiased">
      {/* Map — full screen behind everything */}
      <div className="absolute inset-0 z-0 h-full w-full">
        <Map
          origin={origin}
          destination={destination}
          route={route}
          mode={mode}
          onMapClick={handleMapClick}
          mapStyle={mapStyle}
          onMapStyleChange={setMapStyle}
        />
      </div>

      {/* Sidebar — desktop: left panel | mobile: bottom sheet */}
      <Sidebar
        origin={origin}
        destination={destination}
        route={route}
        loading={loading}
        error={error}
        mode={mode}
        onModeChange={handleModeChange}
        onFindRoute={findRoute}
        onClear={clear}
        onSwap={swap}
        onSelectPlace={handleSelectPlace}
      />
    </main>
  );
}
