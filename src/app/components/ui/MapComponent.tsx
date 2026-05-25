import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Create custom luxury pin
const customIcon = new L.DivIcon({
  className: 'custom-leaflet-icon',
  html: `
    <div style="
      width: 36px; 
      height: 36px; 
      background: radial-gradient(circle at top left, #FFD700, #D4AF37); 
      border-radius: 50% 50% 50% 0; 
      transform: rotate(-45deg); 
      display: flex; 
      box-shadow: 0 0 25px rgba(212, 175, 55, 0.6);
      border: 3px solid #141414;
    ">
      <div style="
        width: 12px; 
        height: 12px; 
        background: #141414; 
        border-radius: 50%; 
        margin: auto;
      "></div>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36]
});

// Component to recenter map when coords change
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

interface MapComponentProps {
  latitude: number;
  longitude: number;
  address: string;
}

export default function MapComponent({ latitude, longitude, address }: MapComponentProps) {
  const position: [number, number] = [latitude, longitude];

  // Fix Leaflet container size issues on initial render
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, []);

  return (
    <div className="w-full h-full rounded-[2rem] overflow-hidden border border-[#D4AF37]/20 shadow-2xl shadow-[#D4AF37]/5 relative z-0">
      <MapContainer 
        center={position} 
        zoom={15} 
        scrollWheelZoom={false}
        style={{ width: '100%', height: '100%', backgroundColor: '#141414' }}
        attributionControl={false}
      >
        <ChangeView center={position} />
        {/* CartoDB Dark Matter Base Map */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Marker position={position} icon={customIcon}>
          <Popup>
            <div className="text-center min-w-[120px]">
              <h3 className="font-black text-[#141414] uppercase tracking-widest text-sm mb-1">Barberboard</h3>
              <p className="text-gray-500 text-xs font-medium leading-tight">{address}</p>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
