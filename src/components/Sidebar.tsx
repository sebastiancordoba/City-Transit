import { MapPin, Navigation, Bus, Footprints, ArrowRight } from 'lucide-react';

interface SidebarProps {
  origin: [number, number] | null;
  destination: [number, number] | null;
  route: any | null;
  loading: boolean;
  error: string | null;
  onFindRoute: () => void;
  onClear: () => void;
}

export default function Sidebar({ origin, destination, route, loading, error, onFindRoute, onClear }: SidebarProps) {
  return (
    <div className="w-full md:w-96 bg-white shadow-xl h-full flex flex-col z-[1000] relative">
      <div className="p-6 bg-blue-600 text-white">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Navigation className="w-6 h-6" />
          City Transit
        </h1>
        <p className="text-blue-100 text-sm mt-1">Find the best bus routes</p>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        <div className="space-y-4 mb-6">
          <div className="relative">
            <div className="absolute left-3 top-3 text-gray-400">
              <MapPin className="w-5 h-5 text-green-500" />
            </div>
            <div className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              {origin ? `${origin[0].toFixed(4)}, ${origin[1].toFixed(4)}` : 'Click on map to set origin'}
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-3 top-3 text-gray-400">
              <MapPin className="w-5 h-5 text-red-500" />
            </div>
            <div className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
              {destination ? `${destination[0].toFixed(4)}, ${destination[1].toFixed(4)}` : 'Click on map to set destination'}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onFindRoute}
              disabled={!origin || !destination || loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              {loading ? 'Finding route...' : 'Find Route'}
            </button>
            <button
              onClick={onClear}
              className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-6 border border-red-100">
            {error}
          </div>
        )}

        {route && (
          <div className="space-y-6">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
              <h2 className="font-semibold text-gray-900 mb-2">Route Summary</h2>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Footprints className="w-4 h-4" />
                  {Math.round(route.walkToOrigin + route.walkFromDest)}m
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Bus className="w-4 h-4" />
                  {route.dOrder - route.oOrder} stops
                </span>
              </div>
            </div>

            <div className="relative">
              <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-200"></div>
              
              <div className="space-y-6">
                {route.instructions.map((inst: any, idx: number) => (
                  <div key={idx} className="relative flex gap-4">
                    <div className="relative z-10 w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center shrink-0"
                         style={inst.color ? { borderColor: inst.color, backgroundColor: inst.color, color: 'white' } : {}}>
                      {inst.icon === 'walk' && <Footprints className="w-4 h-4 text-gray-500" />}
                      {inst.icon === 'bus' && <Bus className="w-4 h-4" />}
                      {inst.icon === 'ride' && <ArrowRight className="w-4 h-4 text-gray-500" />}
                      {inst.icon === 'alight' && <MapPin className="w-4 h-4 text-gray-500" />}
                    </div>
                    <div className="pt-1">
                      <p className="text-sm font-medium text-gray-900">{inst.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
