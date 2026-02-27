import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Navigation, Bus, Footprints, ArrowRight, X,
  Info, ArrowUpDown, Car, Bike, TramFront, Search, ChevronDown,
  ChevronUp, CornerUpRight, CornerUpLeft, MoveRight, CircleDot,
  Milestone, Flag, RotateCcw, List, ChevronRight, LocateFixed, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { TransportMode } from '../App';
import { getAllRoutes } from '../lib/transitRouter';

interface SidebarProps {
  origin: [number, number] | null;
  destination: [number, number] | null;
  route: any | null;
  loading: boolean;
  error: string | null;
  mode: TransportMode;
  onModeChange: (mode: TransportMode) => void;
  onFindRoute: () => void;
  onClear: () => void;
  onSwap?: () => void;
  onSelectPlace?: (lat: number, lng: number, label: string, field: 'origin' | 'destination') => void;
  onClearField?: (field: 'origin' | 'destination') => void;
}

const MODES: { id: TransportMode; label: string; Icon: any; color: string; bg: string; activeText: string }[] = [
  { id: 'walking', label: 'Caminar', Icon: Footprints, color: '#6b7280', bg: 'bg-gray-100', activeText: 'text-gray-700' },
  { id: 'bicycle', label: 'Bici', Icon: Bike, color: '#16a34a', bg: 'bg-green-100', activeText: 'text-green-700' },
  { id: 'car', label: 'Auto', Icon: Car, color: '#2563eb', bg: 'bg-blue-100', activeText: 'text-blue-700' },
  { id: 'transit', label: 'Camión', Icon: TramFront, color: '#7c3aed', bg: 'bg-purple-100', activeText: 'text-purple-700' },
];

const XALAPA_VIEWBOX = '-97.05,19.48,-96.74,19.65';

function formatDistance(m: number) {
  if (!m) return '—';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
function formatDuration(s: number) {
  if (!s) return '—';
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}min`;
}
function arrivalTime(durationSec: number): string {
  const now = new Date();
  now.setSeconds(now.getSeconds() + durationSec);
  return now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function InstructionIcon({ icon }: { icon: string }) {
  const cls = 'w-4 h-4';
  if (icon === 'turn-left') return <CornerUpLeft className={cls} />;
  if (icon === 'turn-right') return <CornerUpRight className={cls} />;
  if (icon === 'straight') return <MoveRight className={cls} />;
  if (icon === 'roundabout') return <RotateCcw className={cls} />;
  if (icon === 'start') return <CircleDot className={cls} />;
  if (icon === 'arrive') return <Flag className={cls} />;
  if (icon === 'walk') return <Footprints className={cls} />;
  if (icon === 'bus') return <Bus className={cls} />;
  if (icon === 'ride') return <ArrowRight className={cls} />;
  if (icon === 'alight') return <MapPin className={cls} />;
  return <Milestone className={cls} />;
}

// ── Place Search Input ─────────────────────────────────────────────────────
interface PlaceSearchProps {
  placeholder: string;
  value: string;
  onSelect: (lat: number, lng: number, label: string) => void;
  onClear?: () => void;
  onLocate?: () => void;
  showLocate?: boolean;
}

function PlaceSearchInput({ placeholder, value, onSelect, onClear, onLocate, showLocate }: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<any>(null);

  const doSearch = async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&viewbox=${XALAPA_VIEWBOX}&bounded=1&accept-language=es`;
      const res = await fetch(url);
      setResults(await res.json());
    } catch { setResults([]); }
    finally { setSearching(false); }
  };
  const onType = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value; setQuery(v); setOpen(true);
    clearTimeout(timer.current); timer.current = setTimeout(() => doSearch(v), 400);
  };
  const pick = (item: any) => {
    const label = item.display_name.split(',').slice(0, 2).join(', ');
    setQuery(label); setResults([]); setOpen(false);
    onSelect(parseFloat(item.lat), parseFloat(item.lon), label);
  };
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuery(''); setResults([]); setOpen(false);
    onClear?.();
  };

  const display = query || value;
  const hasValue = Boolean(display);

  return (
    <div className="relative flex-1 min-w-0 flex items-center gap-1.5">
      <div className="relative flex-1 min-w-0">
        <input
          type="text" placeholder={placeholder} value={display}
          onChange={onType}
          onFocus={() => { setQuery(''); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full bg-gray-50 border-none rounded-xl py-2.5 pl-3.5 pr-8 text-[13px] font-semibold text-gray-700 placeholder:text-gray-400 placeholder:font-normal outline-none"
        />
        {/* Clear or search icon */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {hasValue ? (
            <button onClick={handleClear} className="text-gray-300 hover:text-rose-400 transition-colors p-0.5 rounded-full -mr-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : searching ? (
            <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin pointer-events-none" />
          ) : (
            <Search className="w-3.5 h-3.5 text-gray-300 pointer-events-none" />
          )}
        </div>
        {open && results.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-[2000] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden max-h-52 overflow-y-auto">
            {results.map((item: any) => (
              <button key={item.place_id} onMouseDown={() => pick(item)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 transition-colors flex items-start gap-2.5 border-b border-gray-50 last:border-0">
                <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-gray-800 truncate">{item.display_name.split(',')[0]}</p>
                  <p className="text-[10px] text-gray-400 truncate">{item.display_name.split(',').slice(1, 3).join(',')}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* GPS locate button — only on origin */}
      {showLocate && (
        <button onClick={onLocate}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-500 active:scale-90 transition-all"
          title="Usar mi ubicación">
          <LocateFixed className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ── Route Browser ──────────────────────────────────────────────────────────
function RouteBrowser() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (open && !fetched) {
      setFetched(true);
      getAllRoutes().then(setRoutes).catch(() => { });
    }
  }, [open, fetched]);

  return (
    <div className="glass-panel rounded-3xl shadow-lg overflow-hidden pointer-events-auto border-none bg-white/96">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center">
            <List className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-black text-gray-800">Rutas de Xalapa</p>
            <p className="text-[10px] text-gray-400 font-medium">{routes.length > 0 ? `${routes.length} rutas cargadas` : 'Todas las rutas de camión'}</p>
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="border-t border-gray-100 overflow-y-auto max-h-52 custom-scrollbar">
              {routes.length === 0 ? (
                <div className="flex items-center justify-center py-6 gap-2 text-gray-400 text-[12px]">
                  <div className="w-4 h-4 border-2 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
                  Cargando rutas…
                </div>
              ) : (
                <div className="p-2 grid grid-cols-1 gap-0.5">
                  {routes.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm" style={{ background: r.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-bold text-gray-800 truncate">{r.name}</p>
                        {r.description && <p className="text-[10px] text-gray-400 truncate">{r.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type SheetState = 'peek' | 'half' | 'full';
const SHEET_HEIGHT: Record<SheetState, string> = {
  peek: '180px', half: '55vh', full: '92vh',
};

// ── Main Sidebar ───────────────────────────────────────────────────────────
export default function Sidebar({
  origin, destination, route, loading, error,
  mode, onModeChange, onFindRoute, onClear, onSwap, onSelectPlace, onClearField
}: SidebarProps) {
  const activeMode = MODES.find(m => m.id === mode)!;
  const [originLabel, setOriginLabel] = useState('');
  const [destLabel, setDestLabel] = useState('');
  const [sheet, setSheet] = useState<SheetState>('peek');
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => { if (!origin) setOriginLabel(''); }, [origin]);
  useEffect(() => { if (!destination) setDestLabel(''); }, [destination]);
  useEffect(() => { if (route) setSheet('half'); }, [route]);
  useEffect(() => { if (origin || destination) setSheet('half'); }, [origin, destination]);

  const handleOrigin = (lat: number, lng: number, label: string) => {
    setOriginLabel(label); onSelectPlace?.(lat, lng, label, 'origin');
  };
  const handleDest = (lat: number, lng: number, label: string) => {
    setDestLabel(label); onSelectPlace?.(lat, lng, label, 'destination');
  };
  const handleClearOrigin = () => { setOriginLabel(''); onClearField?.('origin'); };
  const handleClearDest = () => { setDestLabel(''); onClearField?.('destination'); };

  // GPS geolocation for origin
  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsLoading(false);
        const { latitude, longitude } = pos.coords;
        setOriginLabel('Mi ubicación');
        onSelectPlace?.(latitude, longitude, 'Mi ubicación', 'origin');
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Determine the accent color for route result
  const resultColor = route?.routeColor || activeMode.color;

  const inputPanel = (
    <div className="glass-panel p-4 rounded-3xl shadow-2xl pointer-events-auto border-none bg-white/96">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex flex-col items-center gap-0.5 mt-3.5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full border-2 border-emerald-500 bg-white shadow-sm" />
          <div className="w-px h-9 border-l border-dashed border-gray-300" />
          <MapPin className="w-3.5 h-3.5 text-rose-500" />
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <PlaceSearchInput
            placeholder="Busca o toca el mapa (origen)"
            value={origin ? (originLabel || `${origin[0].toFixed(5)}, ${origin[1].toFixed(5)}`) : ''}
            onSelect={handleOrigin}
            onClear={handleClearOrigin}
            onLocate={handleLocate}
            showLocate
          />
          <PlaceSearchInput
            placeholder="Busca o toca el mapa (destino)"
            value={destination ? (destLabel || `${destination[0].toFixed(5)}, ${destination[1].toFixed(5)}`) : ''}
            onSelect={handleDest}
            onClear={handleClearDest}
          />
        </div>
        <div className="flex flex-col gap-2 mt-1 shrink-0">
          {gpsLoading && <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mx-auto mt-2" />}
          {!gpsLoading && (
            <button onClick={onSwap} className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400 hover:text-blue-600 active:scale-90" title="Intercambiar">
              <ArrowUpDown className="w-4 h-4" />
            </button>
          )}
          {(origin && destination) && (
            <button onClick={onClear} className="p-2 hover:bg-rose-50 rounded-full transition-all text-gray-400 hover:text-rose-500 active:scale-90" title="Limpiar todo">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Mode tabs */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {MODES.map(({ id, label, Icon }) => {
          const m = MODES.find(m => m.id === id)!;
          return (
            <button key={id} onClick={() => onModeChange(id)}
              className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-2xl text-[11px] font-bold transition-all active:scale-95 ${mode === id ? `${m.bg} ${m.activeText} shadow-sm` : 'text-gray-400 hover:bg-gray-50'
                }`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Loading indicator (auto-search) */}
      {loading && (
        <div className="flex items-center gap-2 py-3 justify-center">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
          <span className="text-[12px] text-gray-400 font-medium">Buscando ruta…</span>
        </div>
      )}

      {/* Manual re-search button — only shows when no auto-search is pending */}
      {!loading && !route && origin && destination && (
        <button onClick={onFindRoute}
          className="w-full text-white font-black py-3.5 px-4 rounded-2xl shadow-lg transition-all active:scale-[0.98] flex justify-center items-center gap-2 text-[14px]"
          style={{
            background: `linear-gradient(135deg, ${activeMode.color}dd, ${activeMode.color})`,
            boxShadow: `0 8px 20px ${activeMode.color}40`,
          }}>
          <activeMode.Icon className="w-4 h-4" />Buscar ruta<ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  const routeResult = route && (
    <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
      className="glass-panel rounded-3xl shadow-2xl overflow-hidden flex-1 pointer-events-auto flex flex-col border-none bg-white/96 min-h-0">
      <div className="p-5 border-b border-gray-50/80">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: resultColor }} />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: resultColor }}>
                {activeMode.label}
                {route.routeName ? ` · ${route.routeName}` : ''}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-gray-900 tracking-tighter">{formatDuration(route.duration)}</span>
            </div>
            {/* Estimated arrival time */}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-[12px] text-gray-400 font-medium">{formatDistance(route.distance)}</span>
              <div className="flex items-center gap-1 text-[12px] font-semibold text-gray-500">
                <Clock className="w-3 h-3" />
                <span>Llegas ~{arrivalTime(route.duration)}</span>
              </div>
              {route.routeName && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white inline-block" style={{ background: resultColor }}>
                  {route.routeName}
                </span>
              )}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl" style={{ background: `${resultColor}18`, color: resultColor }}>
            <activeMode.Icon className="w-6 h-6" />
          </div>
        </div>
      </div>
      <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
        <div className="relative">
          <div className="absolute left-[15px] top-3 bottom-3 w-px border-l border-dashed border-gray-200" />
          <div className="space-y-6">
            {route.instructions?.map((inst: any, idx: number) => (
              <div key={idx} className="relative flex gap-4 group">
                <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm border transition-transform group-hover:scale-110"
                  style={inst.color ? { background: inst.color, borderColor: inst.color, color: 'white' }
                    : { background: 'white', borderColor: '#e5e7eb', color: '#6b7280' }}>
                  <InstructionIcon icon={inst.icon} />
                </div>
                <div className="pt-1.5 flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-800 leading-snug group-hover:text-blue-600 transition-colors">{inst.text}</p>
                  {inst.subtext && <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{inst.subtext}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="p-4 border-t border-gray-50">
        <button onClick={onClear} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[13px] font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all">
          <Navigation className="w-4 h-4" />Planear nueva ruta
        </button>
      </div>
    </motion.div>
  );

  // ── Desktop ──────────────────────────────────────────────────────────────
  const desktopPanel = (
    <div className="hidden md:flex absolute top-0 left-0 p-5 w-[400px] pointer-events-none z-[1001] flex-col gap-3 h-full">
      <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{inputPanel}</motion.div>
      {!route && <RouteBrowser />}
      <AnimatePresence>
        {error && (
          <motion.div key="err" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="glass-panel border-rose-200 bg-rose-50/95 p-4 rounded-2xl text-[13px] text-rose-700 font-semibold flex gap-3 items-start pointer-events-auto shadow-lg">
            <div className="p-1.5 bg-rose-100 rounded-xl shrink-0"><Info className="w-4 h-4 text-rose-600" /></div>
            {error}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{routeResult}</AnimatePresence>
    </div>
  );

  // ── Mobile bottom sheet ──────────────────────────────────────────────────
  const mobileSheet = (
    <div className="md:hidden absolute bottom-0 left-0 right-0 z-[1001] pointer-events-none">
      <motion.div
        animate={{ height: SHEET_HEIGHT[sheet] }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative bg-white/98 backdrop-blur-xl rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.18)] pointer-events-auto flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
      >
        <div className="flex flex-col items-center pt-3 pb-1 gap-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
          <button onClick={() => setSheet(s => s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek')}
            className="mt-1 p-1 text-gray-400 active:scale-90 transition-transform">
            {sheet === 'full' ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3 custom-scrollbar">
          {inputPanel}
          {!route && <RouteBrowser />}
          {error && (
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl text-[13px] text-rose-700 font-semibold flex gap-3 items-start">
              <div className="p-1.5 bg-rose-100 rounded-xl shrink-0"><Info className="w-4 h-4 text-rose-600" /></div>
              {error}
            </div>
          )}
          <AnimatePresence>{routeResult}</AnimatePresence>
        </div>
      </motion.div>
    </div>
  );

  return (
    <>
      {desktopPanel}
      {mobileSheet}
    </>
  );
}
