import { useState } from 'react';
import Map from './components/Map';
import Sidebar from './components/Sidebar';

export default function App() {
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMapClick = (lat: number, lng: number) => {
    if (!origin) {
      setOrigin([lat, lng]);
    } else if (!destination) {
      setDestination([lat, lng]);
    } else {
      setOrigin([lat, lng]);
      setDestination(null);
      setRoute(null);
    }
  };

  const findRoute = async () => {
    if (!origin || !destination) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originLat: origin[0],
          originLng: origin[1],
          destLat: destination[0],
          destLng: destination[1],
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to find route');
      }
      
      setRoute(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setOrigin(null);
    setDestination(null);
    setRoute(null);
    setError(null);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-gray-100 font-sans">
      <Sidebar 
        origin={origin} 
        destination={destination} 
        route={route} 
        loading={loading} 
        error={error} 
        onFindRoute={findRoute} 
        onClear={clear} 
      />
      <div className="flex-1 h-full relative z-0">
        <Map 
          origin={origin} 
          destination={destination} 
          route={route} 
          onMapClick={handleMapClick} 
        />
      </div>
    </div>
  );
}
