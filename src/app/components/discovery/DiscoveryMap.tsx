import MapComponent, { type MapPoint } from '../ui/MapComponent';
import type { PublicProfile } from '../../lib/marketplace/discovery';

interface DiscoveryMapProps {
  profiles: PublicProfile[];
}

export default function DiscoveryMap({ profiles }: DiscoveryMapProps) {
  const points: MapPoint[] = profiles.map(profile => ({
    id: profile.id,
    latitude: profile.latitude,
    longitude: profile.longitude,
    label: profile.displayName,
    description: profile.serviceSummary,
  }));

  return <MapComponent points={points} />;
}
