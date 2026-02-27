import { useState, useEffect, useCallback, useRef } from 'react';
import Map from './components/Map';
import type { MapStyleId } from './components/Map';
import Sidebar from './components/Sidebar';
import { findTransitRoute, fetchOSRMRoute, loadRoutesData } from './lib/transitRouter';
import type { OsrmProfile } from './lib/transitRouter';

export type TransportMode = 'walking' | 'bicycle' | 'car' | 'transit';

const OSRM_PROFILES: Record<string, OsrmProfile> = {
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
  const autoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-load route data on mount so first search is instant
  useEffect(() => { loadRoutesData().catch(() => { }); }, []);

  // ── Auto-search: fires 900ms after both points are set ──────────────────
  useEffect(() => {
    if (!origin || !destination || route || loading) return;
    if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);
    autoSearchTimer.current = setTimeout(() => { doFindRoute(origin, destination, mode); }, 900);
    return () => { if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, mode]);

  const doFindRoute = useCallback(async (
    orig: [number, number],
    dest: [number, number],
    currentMode: TransportMode
  ) => {
    setLoading(true);
    setError(null);
    try {
      if (currentMode === 'transit') {
        const result = await findTransitRoute(orig[0], orig[1], dest[0], dest[1]);
        if (!result) {
          throw new Error(
            'No se encontró ninguna ruta de camión a menos de 1 km de tus puntos. ' +
            'Intenta mover el origen o el destino más cerca de una avenida principal, ' +
            'o cambia el modo a "Caminar".'
          );
        }
        setRoute({ ...result, mode: 'transit' });
      } else {
        const profile = OSRM_PROFILES[currentMode];
        const result = await fetchOSRMRoute(profile, orig[0], orig[1], dest[0], dest[1]);
        setRoute(result);
      }
    } catch (err: any) {
      setError(err.message || 'Error al calcular la ruta. ¿Tienes conexión a internet?');
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Called by sidebar "clear origin" / "clear destination" buttons
  const handleClearField = (field: 'origin' | 'destination') => {
    setRoute(null); setError(null);
    if (field === 'origin') setOrigin(null);
    else setDestination(null);
  };

  const findRoute = useCallback(() => {
    if (origin && destination) doFindRoute(origin, destination, mode);
  }, [origin, destination, mode, doFindRoute]);

  const clear = () => { setOrigin(null); setDestination(null); setRoute(null); setError(null); };
  const swap = () => { setOrigin(destination); setDestination(origin); setRoute(null); setError(null); };
  const handleModeChange = (newMode: TransportMode) => {
    setMode(newMode);
    setRoute(null); setError(null);
    // Re-trigger auto-search after mode change if both points set
    if (origin && destination) {
      setTimeout(() => doFindRoute(origin, destination, newMode), 400);
    }
  };

  return (
    <main className="relative h-screen w-full overflow-hidden bg-gray-50 antialiased">
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
        onClearField={handleClearField}
      />
    </main>
  );
}
