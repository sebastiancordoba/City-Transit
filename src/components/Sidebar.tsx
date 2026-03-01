/// <reference types="vite/client" />
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin, Navigation, Bus, Footprints, ArrowRight, X,
  Info, ArrowUpDown, Car, Bike, TramFront, Search, ChevronDown,
  ChevronUp, CornerUpRight, CornerUpLeft, MoveRight, CircleDot,
  Milestone, Flag, RotateCcw, List, ChevronRight, LocateFixed,
  Clock, ZoomIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { TransportMode } from '../App';
import { getAllRoutes } from '../lib/transitRouter';

interface SidebarProps {
  origin: [number, number] | null;
  destination: [number, number] | null;
  route: any | null;
  transitAlts: any[];           // all transit alternatives (sorted by duration)
  loading: boolean;
  error: string | null;
  noRoutesRadius: number | null; // set when transit found 0 results at this radius
  mode: TransportMode;
  onModeChange: (mode: TransportMode) => void;
  onFindRoute: () => void;
  onClear: () => void;
  onSwap?: () => void;
  onSelectPlace?: (lat: number, lng: number, label: string, field: 'origin' | 'destination') => void;
  onClearField?: (field: 'origin' | 'destination') => void;
  onSelectAlt?: (idx: number) => void;
  onExpandRadius?: () => void;
}

const MODES: { id: TransportMode; label: string; Icon: any; color: string; bg: string }[] = [
  { id: 'walking', label: 'Caminar', Icon: Footprints, color: '#6b7280', bg: 'bg-gray-100' },
  { id: 'bicycle', label: 'Bici', Icon: Bike, color: '#16a34a', bg: 'bg-green-100' },
  { id: 'car', label: 'Auto', Icon: Car, color: '#2563eb', bg: 'bg-blue-100' },
  { id: 'transit', label: 'Camión', Icon: TramFront, color: '#7c3aed', bg: 'bg-purple-100' },
];

const XALAPA_VIEWBOX = '-97.05,19.48,-96.74,19.65';

function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
function formatDuration(s: number) {
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}min`;
}
function arrivalTime(durationSec: number): string {
  const now = new Date();
  now.setSeconds(now.getSeconds() + durationSec);
  return now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function vibrate(ms = 10) { try { navigator.vibrate?.(ms); } catch { } }

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
  dropUp?: boolean;
}
function PlaceSearchInput({ placeholder, value, onSelect, onClear, onLocate, showLocate, dropUp }: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<any>(null);

  const doSearch = async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setBusy(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&viewbox=${XALAPA_VIEWBOX}&bounded=1&accept-language=es`);
      setResults(await res.json());
    } catch { setResults([]); }
    finally { setBusy(false); }
  };
  const pick = (item: any) => {
    const label = item.display_name.split(',').slice(0, 2).join(', ');
    setQuery(label); setResults([]); setOpen(false);
    onSelect(parseFloat(item.lat), parseFloat(item.lon), label);
    vibrate();
  };
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation(); setQuery(''); setResults([]); setOpen(false); onClear?.();
  };

  const display = query || value;
  return (
    <div className="relative flex-1 min-w-0 flex items-center gap-1.5">
      <div className="relative flex-1 min-w-0">
        <input
          type="text" placeholder={placeholder} value={display}
          onChange={e => { const v = e.target.value; setQuery(v); setOpen(true); clearTimeout(timer.current); timer.current = setTimeout(() => doSearch(v), 400); }}
          onFocus={() => { setQuery(''); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          className="w-full bg-gray-50 border-none rounded-xl py-3 pl-3.5 pr-8 font-semibold text-gray-700 placeholder:text-gray-400 placeholder:font-normal outline-none touch-manipulation"
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {display ? (
            <button onClick={handleClear} className="text-gray-300 hover:text-rose-400 transition-colors p-1 rounded-full touch-manipulation"><X className="w-4 h-4" /></button>
          ) : busy ? (
            <div className="w-3.5 h-3.5 border border-gray-400 border-t-transparent rounded-full animate-spin pointer-events-none" />
          ) : (
            <Search className="w-3.5 h-3.5 text-gray-300 pointer-events-none" />
          )}
        </div>
        {open && results.length > 0 && (
          <div className={`absolute left-0 right-0 z-[2000] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden max-h-52 overflow-y-auto ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
            {results.map(item => (
              <button key={item.place_id} onMouseDown={() => pick(item)} onTouchEnd={() => pick(item)}
                className="w-full text-left px-3.5 py-3 hover:bg-gray-50 active:bg-gray-100 flex items-start gap-2.5 border-b border-gray-50 last:border-0 touch-manipulation">
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
      {showLocate && (
        <button onClick={onLocate} className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-500 active:scale-90 transition-all touch-manipulation">
          <LocateFixed className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

// ── Transit Alternatives Strip ─────────────────────────────────────────────
function AlternativesStrip({ alts, selectedId, onSelect }: { alts: any[]; selectedId: number | null; onSelect: (idx: number) => void }) {
  if (alts.length <= 1) return null;
  return (
    <div className="mb-3">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Opciones de ruta</p>
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {alts.map((alt, idx) => {
          const isSelected = alt.routeId === selectedId;
          return (
            <button key={alt.routeId ?? idx} onClick={() => { onSelect(idx); vibrate(8); }}
              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-2xl border-2 transition-all active:scale-95 touch-manipulation text-left ${isSelected ? 'border-transparent shadow-md text-white' : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-200'
                }`}
              style={isSelected ? { background: alt.routeColor || '#7c3aed' } : {}}>
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: isSelected ? 'white' : (alt.routeColor || '#7c3aed'), opacity: isSelected ? 0.8 : 1 }} />
              <div>
                <p className={`text-[12px] font-black leading-none ${isSelected ? 'text-white' : 'text-gray-800'}`}>
                  {alt.routeName ?? 'Caminar'}
                </p>
                <p className={`text-[11px] font-semibold leading-tight mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                  {formatDuration(alt.duration)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Route Browser ──────────────────────────────────────────────────────────
function RouteBrowser() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (open && !fetched) { setFetched(true); getAllRoutes().then(setRoutes).catch(() => { }); }
  }, [open, fetched]);

  return (
    <div className="rounded-3xl shadow-lg overflow-hidden pointer-events-auto bg-white/96">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation">
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
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="border-t border-gray-100 overflow-y-auto max-h-64 custom-scrollbar">
              {routes.length === 0 ? (
                <div className="flex items-center justify-center py-6 gap-2 text-gray-400 text-[13px]">
                  <div className="w-4 h-4 border-2 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
                  Cargando rutas…
                </div>
              ) : routes.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 active:bg-gray-100">
                  <div className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white shadow-sm" style={{ background: r.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-gray-800 truncate">{r.name}</p>
                    {r.description && <p className="text-[11px] text-gray-400 truncate">{r.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Compact mode bar (when route is shown) ─────────────────────────────────
function CompactModeBar({ mode, onModeChange }: { mode: TransportMode; onModeChange: (m: TransportMode) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl">
      {MODES.map(({ id, Icon, color }) => (
        <button key={id} onClick={() => onModeChange(id)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-all active:scale-95 touch-manipulation ${mode === id ? 'bg-white shadow-sm' : 'text-gray-400'}`}
          style={mode === id ? { color } : {}}>
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}

// ── GPS reverse geocode ────────────────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es&zoom=18`);
    const d = await res.json();
    const a = d.address || {};
    if (a.road) return `${a.road}${a.house_number ? ' ' + a.house_number : ''}`;
    if (a.neighbourhood) return a.neighbourhood;
    if (a.suburb) return a.suburb;
  } catch { }
  return 'Mi ubicación';
}

type SheetState = 'peek' | 'half' | 'full';
const SHEET_H: Record<SheetState, string> = { peek: '265px', half: '55vh', full: '92vh' };

// ── Main Sidebar ───────────────────────────────────────────────────────────
export default function Sidebar({
  origin, destination, route, transitAlts, loading, error, noRoutesRadius,
  mode, onModeChange, onFindRoute, onClear, onSwap, onSelectPlace,
  onClearField, onSelectAlt, onExpandRadius,
}: SidebarProps) {
  const activeMode = MODES.find(m => m.id === mode)!;
  const [originLabel, setOriginLabel] = useState('');
  const [destLabel, setDestLabel] = useState('');
  const [sheet, setSheet] = useState<SheetState>('peek');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const h = () => { const kb = window.innerHeight - vv.height; setKeyboardOpen(kb > 120); if (kb > 120) setSheet('full'); };
    vv.addEventListener('resize', h);
    return () => vv.removeEventListener('resize', h);
  }, []);

  useEffect(() => { if (!origin) setOriginLabel(''); }, [origin]);
  useEffect(() => { if (!destination) setDestLabel(''); }, [destination]);
  useEffect(() => { if (route || noRoutesRadius) setSheet('half'); }, [route, noRoutesRadius]);
  useEffect(() => { if ((origin || destination) && sheet === 'peek') setSheet('half'); }, [origin, destination]);

  // ── Swipe gesture ──────────────────────────────────────────────────────
  const dragStart = useRef<{ y: number } | null>(null);
  const onHandlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStart.current = { y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onHandlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const delta = dragStart.current.y - e.clientY;
    dragStart.current = null;
    if (Math.abs(delta) < 30) { setSheet(s => s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek'); return; }
    if (delta > 0) setSheet(s => s === 'peek' ? 'half' : 'full');
    else setSheet(s => s === 'full' ? 'half' : 'peek');
  }, []);

  const handleOrigin = (lat: number, lng: number, label: string) => { setOriginLabel(label); onSelectPlace?.(lat, lng, label, 'origin'); };
  const handleDest = (lat: number, lng: number, label: string) => { setDestLabel(label); onSelectPlace?.(lat, lng, label, 'destination'); };

  const handleLocate = async () => {
    setGpsError('');
    if (!navigator.geolocation) { setGpsError('Tu navegador no soporta geolocalización'); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        vibrate(15);
        const label = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setOriginLabel(label);
        onSelectPlace?.(pos.coords.latitude, pos.coords.longitude, label, 'origin');
        setGpsLoading(false);
      },
      err => {
        setGpsLoading(false);
        setGpsError(err.code === 1 ? 'Permiso denegado. Habilítalo en la configuración del navegador.' : err.code === 2 ? 'No se pudo detectar tu ubicación.' : 'Tiempo de espera agotado.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const resultColor = route?.routeColor || activeMode.color;
  const selectedRouteId = route?.routeId ?? null;

  // ── Next radius label ──────────────────────────────────────────────────
  const nextRadiusLabel = (() => {
    if (noRoutesRadius == null) return '';
    const steps = [1000, 1500, 2000, 3000];
    const next = steps[steps.indexOf(noRoutesRadius) + 1] ?? steps[steps.length - 1];
    return next === noRoutesRadius ? '3 km (máximo)' : `${next >= 1000 ? next / 1000 + ' km' : next + ' m'}`;
  })();

  // ── Input panel ────────────────────────────────────────────────────────
  const inputPanel = (
    <div className="bg-white rounded-3xl shadow-lg p-4 pointer-events-auto">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex flex-col items-center gap-0.5 mt-3.5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full border-2 border-emerald-500 bg-white shadow-sm" />
          <div className="w-px h-9 border-l border-dashed border-gray-300" />
          <MapPin className="w-3.5 h-3.5 text-rose-500" />
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <PlaceSearchInput
            placeholder="Origen (o toca el mapa)"
            value={origin ? (originLabel || `${origin[0].toFixed(4)}, ${origin[1].toFixed(4)}`) : ''}
            onSelect={handleOrigin}
            onClear={() => { setOriginLabel(''); onClearField?.('origin'); }}
            onLocate={handleLocate}
            showLocate
            dropUp={keyboardOpen}
          />
          <PlaceSearchInput
            placeholder="Destino (o toca el mapa)"
            value={destination ? (destLabel || `${destination[0].toFixed(4)}, ${destination[1].toFixed(4)}`) : ''}
            onSelect={handleDest}
            onClear={() => { setDestLabel(''); onClearField?.('destination'); }}
            dropUp={keyboardOpen}
          />
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {gpsLoading
            ? <div className="w-8 h-8 flex items-center justify-center"><div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" /></div>
            : <button onClick={onSwap} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-blue-600 active:scale-90 touch-manipulation"><ArrowUpDown className="w-4 h-4" /></button>
          }
          {(origin || destination) && (
            <button onClick={onClear} className="w-8 h-8 flex items-center justify-center hover:bg-rose-50 rounded-xl transition-all text-gray-300 hover:text-rose-500 active:scale-90 touch-manipulation"><X className="w-4 h-4" /></button>
          )}
        </div>
      </div>
      {gpsError && (
        <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2 mb-3">
          <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-700 font-medium">{gpsError}</p>
        </div>
      )}
      {/* Mode tabs */}
      <div className="grid grid-cols-4 gap-1">
        {MODES.map(({ id, label, Icon, color, bg }) => (
          <button key={id} onClick={() => onModeChange(id)}
            className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-2xl text-[12px] font-bold transition-all active:scale-95 touch-manipulation ${mode === id ? `${bg} shadow-sm` : 'text-gray-400 hover:bg-gray-50'}`}
            style={mode === id ? { color } : {}}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>
      {loading && (
        <div className="flex items-center justify-center gap-2 pt-3">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
          <span className="text-[13px] text-gray-400 font-medium">Buscando rutas…</span>
        </div>
      )}
      {!loading && !route && !noRoutesRadius && origin && destination && (
        <button onClick={onFindRoute}
          className="w-full text-white font-black py-3.5 mt-3 rounded-2xl shadow-lg transition-all active:scale-[0.98] flex justify-center items-center gap-2 text-[14px] touch-manipulation"
          style={{ background: `linear-gradient(135deg, ${activeMode.color}dd, ${activeMode.color})`, boxShadow: `0 8px 20px ${activeMode.color}40` }}>
          <activeMode.Icon className="w-4 h-4" />Buscar ruta
        </button>
      )}
    </div>
  );

  // ── "No routes found" expand-radius card ──────────────────────────────
  const noRoutesCard = noRoutesRadius && (
    <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      className="bg-amber-50 border border-amber-200 rounded-3xl p-4 pointer-events-auto">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
          <ZoomIn className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <p className="text-[13px] font-black text-amber-900">Sin camiones a {noRoutesRadius >= 1000 ? noRoutesRadius / 1000 + ' km' : noRoutesRadius + ' m'} de tus puntos</p>
          <p className="text-[12px] text-amber-700 mt-0.5">¿Quieres buscar con un radio más amplio?</p>
        </div>
      </div>
      <button onClick={onExpandRadius}
        className="w-full py-3 rounded-2xl font-black text-[13px] text-white transition-all active:scale-[0.98] touch-manipulation"
        style={{ background: 'linear-gradient(135deg, #d97706, #b45309)' }}>
        Ampliar búsqueda a {nextRadiusLabel}
      </button>
    </motion.div>
  );

  // ── Route result card ──────────────────────────────────────────────────
  const routeResult = route && (
    <motion.div key={route.routeId} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }}
      className="bg-white rounded-3xl shadow-lg overflow-hidden flex-1 pointer-events-auto flex flex-col min-h-0">
      <div className="p-4 pb-3 border-b border-gray-50">
        {/* Alternatives strip */}
        <AlternativesStrip alts={transitAlts} selectedId={selectedRouteId} onSelect={idx => onSelectAlt?.(idx)} />
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
      <div className="p-4 overflow-y-auto flex-1 custom-scrollbar overscroll-contain">
        <div className="relative">
          <div className="absolute left-[15px] top-3 bottom-3 w-px border-l border-dashed border-gray-200" />
          <div className="space-y-5">
            {route.instructions?.map((inst: any, idx: number) => (
              <div key={idx} className="relative flex gap-4">
                <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm border"
                  style={inst.color ? { background: inst.color, borderColor: inst.color, color: 'white' } : { background: 'white', borderColor: '#e5e7eb', color: '#6b7280' }}>
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
        <button onClick={onClear} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-all touch-manipulation">
          <Navigation className="w-4 h-4" />Planear nueva ruta
        </button>
      </div>
    </motion.div>
  );

  // ── Desktop ────────────────────────────────────────────────────────────
  const desktopPanel = (
    <div className="hidden md:flex absolute top-0 left-0 p-5 w-[400px] pointer-events-none z-[1001] flex-col gap-3 h-full">
      <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{inputPanel}</motion.div>
      {!route && !noRoutesRadius && <RouteBrowser />}
      <AnimatePresence>
        {noRoutesCard}
        {error && (
          <motion.div key="err" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="bg-rose-50 border border-rose-200 p-4 rounded-2xl text-[13px] text-rose-700 font-semibold flex gap-3 items-start pointer-events-auto shadow-lg">
            <div className="p-1.5 bg-rose-100 rounded-xl shrink-0"><Info className="w-4 h-4 text-rose-600" /></div>
            {error}
          </motion.div>
        )}
        {routeResult}
      </AnimatePresence>
    </div>
  );

  // ── Mobile bottom sheet ────────────────────────────────────────────────
  const mobileSheet = (
    <div className="md:hidden absolute bottom-0 left-0 right-0 z-[1001] pointer-events-none">
      <motion.div
        animate={{ height: SHEET_H[sheet] }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="bg-white/98 backdrop-blur-xl rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.18)] pointer-events-auto flex flex-col overflow-hidden"
        style={{ maxHeight: '94vh' }}
      >
        {/* Drag handle */}
        <div className="flex flex-col items-center pt-2.5 pb-0 shrink-0 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={onHandlePointerDown} onPointerUp={onHandlePointerUp} style={{ touchAction: 'none' }}>
          <div className="w-10 h-1.5 bg-gray-200 rounded-full mb-2" />
        </div>

        {/* Compact mode bar (only when route is shown) */}
        {(route || noRoutesRadius) && (
          <div className="px-4 pb-2 shrink-0">
            <CompactModeBar mode={mode} onModeChange={onModeChange} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3 custom-scrollbar overscroll-contain">
          {inputPanel}
          {!route && !noRoutesRadius && <RouteBrowser />}
          {noRoutesCard}
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

  return <>{desktopPanel}{mobileSheet}</>;
}
