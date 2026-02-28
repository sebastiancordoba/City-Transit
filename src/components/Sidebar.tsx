/// <reference types="vite/client" />
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
function vibrate(ms = 10) {
  try { navigator.vibrate?.(ms); } catch { }
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
  dropUp?: boolean;                  // open dropdown upward (when keyboard is open)
}

function PlaceSearchInput({ placeholder, value, onSelect, onClear, onLocate, showLocate, dropUp }: PlaceSearchProps) {
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
    vibrate();
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
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          className="w-full bg-gray-50 border-none rounded-xl py-3 pl-3.5 pr-8 text-[13px] font-semibold text-gray-700 placeholder:text-gray-400 placeholder:font-normal placeholder:text-[13px] outline-none touch-manipulation"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {/* Clear or search icon */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {hasValue ? (
            <button onClick={handleClear} className="text-gray-300 hover:text-rose-400 transition-colors p-1 rounded-full -mr-1 touch-manipulation">
              <X className="w-4 h-4" />
            </button>
          ) : searching ? (
            <div className="w-3.5 h-3.5 border border-gray-400 border-t-transparent rounded-full animate-spin pointer-events-none" />
          ) : (
            <Search className="w-3.5 h-3.5 text-gray-300 pointer-events-none" />
          )}
        </div>

        {/* Search results dropdown — opens upward when keyboard is likely open */}
        {open && results.length > 0 && (
          <div className={`absolute left-0 right-0 z-[2000] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden max-h-52 overflow-y-auto ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}>
            {results.map((item: any) => (
              <button key={item.place_id} onMouseDown={() => pick(item)} onTouchEnd={() => pick(item)}
                className="w-full text-left px-3.5 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-start gap-2.5 border-b border-gray-50 last:border-0 touch-manipulation">
                <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">{item.display_name.split(',')[0]}</p>
                  <p className="text-[11px] text-gray-400 truncate">{item.display_name.split(',').slice(1, 3).join(',')}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* GPS locate button — only on origin */}
      {showLocate && (
        <button onClick={onLocate}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-500 active:scale-90 transition-all touch-manipulation"
          title="Usar mi ubicación">
          <LocateFixed className="w-5 h-5" />
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
    <div className="rounded-3xl shadow-lg overflow-hidden pointer-events-auto bg-white/96">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center">
            <List className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-black text-gray-800">Rutas de Xalapa</p>
            <p className="text-[11px] text-gray-400 font-medium">{routes.length > 0 ? `${routes.length} rutas` : 'Todas las rutas de camión'}</p>
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="border-t border-gray-100 overflow-y-auto max-h-64 custom-scrollbar">
              {routes.length === 0 ? (
                <div className="flex items-center justify-center py-6 gap-2 text-gray-400 text-[13px]">
                  <div className="w-4 h-4 border-2 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
                  Cargando rutas…
                </div>
              ) : (
                <div className="p-2">
                  {routes.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                      <div className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm" style={{ background: r.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-gray-800 truncate">{r.name}</p>
                        {r.description && <p className="text-[11px] text-gray-400 truncate">{r.description}</p>}
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

// ── Compact Mode Bar (shown in mobile when route is displayed) ─────────────
function CompactModeBar({ mode, onModeChange }: { mode: TransportMode; onModeChange: (m: TransportMode) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl">
      {MODES.map(({ id, Icon, color, bg, activeText }) => (
        <button key={id} onClick={() => onModeChange(id)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-all active:scale-95 touch-manipulation ${mode === id ? `bg-white shadow-sm ${activeText}` : 'text-gray-400'
            }`}
          style={mode === id ? { color } : {}}>
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}

type SheetState = 'peek' | 'half' | 'full';
// peek = enough to see both input fields + mode tabs; half = ~55vh; full = ~92vh
const SHEET_HEIGHT: Record<SheetState, string> = {
  peek: '265px', half: '55vh', full: '92vh',
};

// ── GPS with reverse geocoding ─────────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es&zoom=18`;
    const res = await fetch(url);
    const data = await res.json();
    const a = data.address || {};
    if (a.road) return `${a.road}${a.house_number ? ' ' + a.house_number : ''}`;
    if (a.neighbourhood) return a.neighbourhood;
    if (a.suburb) return a.suburb;
  } catch { }
  return 'Mi ubicación';
}

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
  const [gpsError, setGpsError] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Track keyboard open state via visualViewport
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () => {
      const kbHeight = window.innerHeight - vv.height;
      const isOpen = kbHeight > 120;
      setKeyboardOpen(isOpen);
      if (isOpen) setSheet('full');   // expand sheet so fields are visible above keyboard
    };
    vv.addEventListener('resize', handler);
    return () => vv.removeEventListener('resize', handler);
  }, []);

  useEffect(() => { if (!origin) setOriginLabel(''); }, [origin]);
  useEffect(() => { if (!destination) setDestLabel(''); }, [destination]);
  useEffect(() => { if (route) setSheet('half'); }, [route]);
  useEffect(() => { if ((origin || destination) && sheet === 'peek') setSheet('half'); }, [origin, destination]);

  // ── Swipe/drag gesture on the handle area ─────────────────────────────
  const dragStart = useRef<{ y: number; sheet: SheetState } | null>(null);

  const onHandlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStart.current = { y: e.clientY, sheet };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [sheet]);

  const onHandlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const delta = dragStart.current.y - e.clientY; // positive = swipe up
    const from = dragStart.current.sheet;
    dragStart.current = null;
    if (Math.abs(delta) < 30) return; // too small a gesture, treat as tap
    if (delta > 0) {
      // swipe up → open more
      setSheet(s => s === 'peek' ? 'half' : 'full');
    } else {
      // swipe down → close
      setSheet(s => s === 'full' ? 'half' : 'peek');
    }
  }, []);

  const onHandleClick = useCallback(() => {
    if (dragStart.current !== null) return; // was a drag, not a tap
    setSheet(s => s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek');
  }, []);

  const handleOrigin = (lat: number, lng: number, label: string) => {
    setOriginLabel(label); onSelectPlace?.(lat, lng, label, 'origin'); vibrate(8);
  };
  const handleDest = (lat: number, lng: number, label: string) => {
    setDestLabel(label); onSelectPlace?.(lat, lng, label, 'destination'); vibrate(8);
  };
  const handleClearOrigin = () => { setOriginLabel(''); onClearField?.('origin'); };
  const handleClearDest = () => { setDestLabel(''); onClearField?.('destination'); };

  // GPS with reverse geocoding
  const handleLocate = async () => {
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsError('Tu navegador no soporta geolocalización');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        vibrate(15);
        const label = await reverseGeocode(latitude, longitude);
        setOriginLabel(label);
        onSelectPlace?.(latitude, longitude, label, 'origin');
        setGpsLoading(false);
      },
      err => {
        setGpsLoading(false);
        if (err.code === 1) setGpsError('Permiso de ubicación denegado. Habilítalo en la configuración de tu navegador.');
        else if (err.code === 2) setGpsError('No se pudo detectar tu ubicación.');
        else setGpsError('Tiempo de espera agotado al obtener tu ubicación.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const resultColor = route?.routeColor || activeMode.color;

  // ── Input panel (shared between desktop + mobile) ─────────────────────
  const inputPanel = (
    <div className="bg-white rounded-3xl shadow-lg p-4 pointer-events-auto">
      <div className="flex items-start gap-3 mb-3">
        {/* Connector line */}
        <div className="flex flex-col items-center gap-0.5 mt-3.5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full border-2 border-emerald-500 bg-white shadow-sm" />
          <div className="w-px h-9 border-l border-dashed border-gray-300" />
          <MapPin className="w-3.5 h-3.5 text-rose-500" />
        </div>
        {/* Inputs */}
        <div className="flex-1 space-y-2 min-w-0">
          <PlaceSearchInput
            placeholder="Origen (o toca el mapa)"
            value={origin ? (originLabel || `${origin[0].toFixed(4)}, ${origin[1].toFixed(4)}`) : ''}
            onSelect={handleOrigin}
            onClear={handleClearOrigin}
            onLocate={handleLocate}
            showLocate
            dropUp={keyboardOpen}
          />
          <PlaceSearchInput
            placeholder="Destino (o toca el mapa)"
            value={destination ? (destLabel || `${destination[0].toFixed(4)}, ${destination[1].toFixed(4)}`) : ''}
            onSelect={handleDest}
            onClear={handleClearDest}
            dropUp={keyboardOpen}
          />
        </div>
        {/* Action buttons */}
        <div className="flex flex-col gap-1.5 shrink-0">
          {gpsLoading ? (
            <div className="w-8 h-8 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <button onClick={onSwap}
              className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-blue-600 active:scale-90 touch-manipulation"
              title="Intercambiar">
              <ArrowUpDown className="w-4 h-4" />
            </button>
          )}
          {(origin || destination) && (
            <button onClick={onClear}
              className="w-8 h-8 flex items-center justify-center hover:bg-rose-50 rounded-xl transition-all text-gray-300 hover:text-rose-500 active:scale-90 touch-manipulation"
              title="Limpiar todo">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* GPS error */}
      {gpsError && (
        <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2 mb-3">
          <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-700 font-medium">{gpsError}</p>
        </div>
      )}

      {/* Mode tabs */}
      <div className="grid grid-cols-4 gap-1">
        {MODES.map(({ id, label, Icon, bg, activeText, color }) => (
          <button key={id} onClick={() => onModeChange(id)}
            className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-2xl text-[12px] font-bold transition-all active:scale-95 touch-manipulation ${mode === id ? `${bg} shadow-sm` : 'text-gray-400 hover:bg-gray-50'
              }`}
            style={mode === id ? { color } : {}}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 pt-3">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
          <span className="text-[13px] text-gray-400 font-medium">Buscando ruta…</span>
        </div>
      )}

      {/* Manual re-search */}
      {!loading && !route && origin && destination && (
        <button onClick={onFindRoute}
          className="w-full text-white font-black py-3.5 mt-3 rounded-2xl shadow-lg transition-all active:scale-[0.98] flex justify-center items-center gap-2 text-[14px] touch-manipulation"
          style={{
            background: `linear-gradient(135deg, ${activeMode.color}dd, ${activeMode.color})`,
            boxShadow: `0 8px 20px ${activeMode.color}40`,
          }}>
          <activeMode.Icon className="w-4 h-4" />Buscar ruta
        </button>
      )}
    </div>
  );

  // ── Route result card ──────────────────────────────────────────────────
  const routeResult = route && (
    <motion.div key="result"
      initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
      className="bg-white rounded-3xl shadow-lg overflow-hidden flex-1 pointer-events-auto flex flex-col min-h-0">
      <div className="p-4 pb-3 border-b border-gray-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: resultColor }} />
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: resultColor }}>
                {activeMode.label}{route.routeName ? ` · ${route.routeName}` : ''}
              </span>
            </div>
            <span className="text-4xl font-black text-gray-900 tracking-tighter">{formatDuration(route.duration)}</span>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-[13px] text-gray-400 font-medium">{formatDistance(route.distance)}</span>
              <div className="flex items-center gap-1 text-[13px] font-semibold text-gray-500">
                <Clock className="w-3.5 h-3.5" />
                <span>Llegas ~{arrivalTime(route.duration)}</span>
              </div>
            </div>
            {route.routeName && (
              <span className="mt-1.5 inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style={{ background: resultColor }}>
                {route.routeName}
              </span>
            )}
          </div>
          <div className="p-3 rounded-2xl shrink-0" style={{ background: `${resultColor}18`, color: resultColor }}>
            <activeMode.Icon className="w-6 h-6" />
          </div>
        </div>
      </div>
      {/* Step-by-step instructions */}
      <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
        <div className="relative">
          <div className="absolute left-[15px] top-3 bottom-3 w-px border-l border-dashed border-gray-200" />
          <div className="space-y-5">
            {route.instructions?.map((inst: any, idx: number) => (
              <div key={idx} className="relative flex gap-4">
                <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm border"
                  style={inst.color
                    ? { background: inst.color, borderColor: inst.color, color: 'white' }
                    : { background: 'white', borderColor: '#e5e7eb', color: '#6b7280' }}>
                  <InstructionIcon icon={inst.icon} />
                </div>
                <div className="pt-1.5 flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-800 leading-snug">{inst.text}</p>
                  {inst.subtext && <p className="text-[12px] text-gray-400 mt-0.5 font-medium">{inst.subtext}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="p-3 border-t border-gray-50 shrink-0">
        <button onClick={onClear}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-all touch-manipulation">
          <Navigation className="w-4 h-4" />Planear nueva ruta
        </button>
      </div>
    </motion.div>
  );

  // ── Desktop panel ──────────────────────────────────────────────────────
  const desktopPanel = (
    <div className="hidden md:flex absolute top-0 left-0 p-5 w-[400px] pointer-events-none z-[1001] flex-col gap-3 h-full">
      <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{inputPanel}</motion.div>
      {!route && <RouteBrowser />}
      <AnimatePresence>
        {error && (
          <motion.div key="err"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="bg-rose-50 border border-rose-200 p-4 rounded-2xl text-[13px] text-rose-700 font-semibold flex gap-3 items-start pointer-events-auto shadow-lg">
            <div className="p-1.5 bg-rose-100 rounded-xl shrink-0"><Info className="w-4 h-4 text-rose-600" /></div>
            {error}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{routeResult}</AnimatePresence>
    </div>
  );

  // ── Mobile bottom sheet ────────────────────────────────────────────────
  const mobileSheet = (
    <div className="md:hidden absolute bottom-0 left-0 right-0 z-[1001] pointer-events-none">
      <motion.div
        animate={{ height: keyboardOpen ? `calc(100vh - ${window.visualViewport?.height ?? window.innerHeight}px + ${window.innerHeight}px)` : SHEET_HEIGHT[sheet] }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="bg-white/98 backdrop-blur-xl rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.18)] pointer-events-auto flex flex-col overflow-hidden"
        style={{ maxHeight: '94vh' }}
      >
        {/* ── Drag handle area — covers full width for easy swipe ── */}
        <div
          className="flex flex-col items-center pt-2.5 pb-0 shrink-0 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={onHandlePointerDown}
          onPointerUp={onHandlePointerUp}
          onClick={onHandleClick}
          style={{ touchAction: 'none' }}
        >
          <div className="w-10 h-1.5 bg-gray-200 rounded-full mb-2" />
        </div>

        {/* Compact mode bar — always visible when route is shown */}
        {route && (
          <div className="px-4 pb-2 shrink-0">
            <CompactModeBar mode={mode} onModeChange={onModeChange} />
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3 custom-scrollbar overscroll-contain">
          {!route && inputPanel}
          {!route && <RouteBrowser />}
          {route && inputPanel}

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
