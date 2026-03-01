import { useState, useEffect, useCallback, useRef } from 'react';
import Map from './components/Map';
import type { MapStyleId } from './components/Map';
import Sidebar from './components/Sidebar';
import { findTransitRoutes, fetchOSRMRoute, loadRoutesData } from './lib/transitRouter';
import type { OsrmProfile } from './lib/transitRouter';

export type TransportMode = 'walking' | 'bicycle' | 'car' | 'transit';

const OSRM_PROFILES: Record<string, OsrmProfile> = {
  walking: 'foot',
  bicycle: 'bike',
  car: 'car',
};

// Walk radius steps (metres) that the user can expand to
const RADIUS_STEPS = [1000, 1500, 2000, 3000];

export default function App() {
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<any | null>(null);
  const [transitAlts, setTransitAlts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When transit finds 0 results at this radius, we offer to expand
  const [noRoutesRadius, setNoRoutesRadius] = useState<number | null>(null);
  const [mode, setMode] = useState<TransportMode>('transit');
  const [mapStyle, setMapStyle] = useState<MapStyleId>('streets');
  const autoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadRoutesData().catch(() => { }); }, []);

  // Auto-search 900ms after both points are set
  useEffect(() => {
    if (!origin || !destination || route || loading) return;
    if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);
    autoSearchTimer.current = setTimeout(() => { doFindRoute(origin, destination, mode, 1000); }, 900);
    return () => { if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, mode]);

  const doFindRoute = useCallback(async (
    orig: [number, number],
    dest: [number, number],
    currentMode: TransportMode,
    radius = 1000
  ) => {
    setLoading(true);
    setError(null);
    setNoRoutesRadius(null);
    try {
      if (currentMode === 'transit') {
        const results = await findTransitRoutes(orig[0], orig[1], dest[0], dest[1], radius);
        if (!results.length) {
          // No results → offer expanding radius instead of an error
          setNoRoutesRadius(radius);
        } else {
          setTransitAlts(results);
          setRoute({ ...results[0], mode: 'transit' });
        }
      } else {
        setTransitAlts([]);
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

  // Called when the user taps "Ampliar búsqueda"
  const handleExpandRadius = useCallback(() => {
    if (!origin || !destination || noRoutesRadius == null) return;
    const nextIdx = RADIUS_STEPS.indexOf(noRoutesRadius) + 1;
    const nextRadius = RADIUS_STEPS[nextIdx] ?? RADIUS_STEPS[RADIUS_STEPS.length - 1];
    if (nextRadius === noRoutesRadius) {
      // Already at max — show a real error
      setError('No se encontraron rutas de camión incluso ampliando el radio a 3 km. Prueba con otro destino.');
      setNoRoutesRadius(null);
      return;
    }
    doFindRoute(origin, destination, mode, nextRadius);
  }, [origin, destination, mode, noRoutesRadius, doFindRoute]);

  const handleMapClick = (lat: number, lng: number) => {
    try { navigator.vibrate?.(10); } catch { }
    if (route) { setOrigin([lat, lng]); setDestination(null); resetResults(); return; }
    if (!origin) { setOrigin([lat, lng]); }
    else if (!destination) { setDestination([lat, lng]); }
    else { setOrigin([lat, lng]); setDestination(null); resetResults(); }
  };

  const resetResults = () => { setRoute(null); setTransitAlts([]); setError(null); setNoRoutesRadius(null); };

  const handleSelectPlace = (lat: number, lng: number, _label: string, field: 'origin' | 'destination') => {
    resetResults();
    if (field === 'origin') setOrigin([lat, lng]);
    else setDestination([lat, lng]);
  };

  const handleClearField = (field: 'origin' | 'destination') => {
    resetResults();
    if (field === 'origin') setOrigin(null);
    else setDestination(null);
  };

  const handleSelectAlt = useCallback((idx: number) => {
    if (transitAlts[idx]) setRoute({ ...transitAlts[idx], mode: 'transit' });
  }, [transitAlts]);

  const findRoute = useCallback(() => {
    if (origin && destination) doFindRoute(origin, destination, mode, 1000);
  }, [origin, destination, mode, doFindRoute]);

  const clear = () => { setOrigin(null); setDestination(null); resetResults(); };
  const swap = () => { setOrigin(destination); setDestination(origin); resetResults(); };
  const handleModeChange = (newMode: TransportMode) => {
    setMode(newMode);
    resetResults();
    if (origin && destination) {
      setTimeout(() => doFindRoute(origin, destination, newMode, 1000), 400);
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
        transitAlts={transitAlts}
        loading={loading}
        error={error}
        noRoutesRadius={noRoutesRadius}
        mode={mode}
        onModeChange={handleModeChange}
        onFindRoute={findRoute}
        onClear={clear}
        onSwap={swap}
        onSelectPlace={handleSelectPlace}
        onClearField={handleClearField}
        onSelectAlt={handleSelectAlt}
        onExpandRadius={handleExpandRadius}
      />
    </main>
  );
}
