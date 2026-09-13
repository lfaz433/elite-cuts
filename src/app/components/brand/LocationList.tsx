import React from 'react';
import { Building2, MapPin } from 'lucide-react';
import type { SalonLocation } from '../../lib/marketplace/types';

interface LocationListProps {
  locations: SalonLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function LocationList({ locations, selectedId, onSelect }: LocationListProps) {
  if (locations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 px-5 py-8 text-center text-sm text-white/45">
        Aucun salon disponible dans cet espace.
      </div>
    );
  }

  return (
    <div className="space-y-2" aria-label="Salons de la marque">
      {locations.map(location => {
        const active = location.id === selectedId;
        return (
          <button
            key={location.id}
            type="button"
            onClick={() => onSelect(location.id)}
            aria-current={active ? 'page' : undefined}
            className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
              active
                ? 'border-[#D4AF37]/60 bg-[#D4AF37]/10 shadow-[0_12px_40px_rgba(212,175,55,0.08)]'
                : 'border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]'
            }`}
          >
            <span className="flex items-center gap-3">
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${active ? 'bg-[#D4AF37] text-black' : 'bg-white/5 text-white/50'}`}>
                <Building2 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-white">{location.name}</span>
                <span className="mt-1 flex items-center gap-1 text-xs text-white/45">
                  <MapPin className="h-3 w-3" /> {location.city}, {location.countryCode}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
