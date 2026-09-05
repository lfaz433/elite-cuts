import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { managerLocationIds } from '../../lib/marketplace/access';

interface WorkspaceContextValue {
  brandId: string | null;
  locationId: string | null;
  selectLocation: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [selection, setSelection] = useState<{ brandId: string; locationId: string } | null>(null);

  const brandId = user?.brandId ?? null;
  const locationId = selection?.brandId === brandId ? selection.locationId : null;
  const locationIds = useMemo(() => (
    user && brandId ? managerLocationIds(user.memberships, brandId) : []
  ), [brandId, user?.memberships]);
  const isPrincipal = user?.memberships.some(membership => (
    membership.brandId === brandId
    && membership.role === 'principal_admin'
    && !membership.locationId
  )) ?? false;

  useEffect(() => {
    if (!brandId) {
      setSelection(null);
      return;
    }
    if (locationId && (isPrincipal || locationIds.includes(locationId))) return;
    const firstLocation = locationIds[0];
    setSelection(firstLocation ? { brandId, locationId: firstLocation } : null);
  }, [brandId, isPrincipal, locationId, locationIds]);

  const selectLocation = useCallback((id: string) => {
    if (!id || !brandId) return;
    if (isPrincipal || locationIds.includes(id)) setSelection({ brandId, locationId: id });
  }, [brandId, isPrincipal, locationIds]);

  const value = useMemo(() => ({ brandId, locationId, selectLocation }), [
    brandId,
    locationId,
    selectLocation,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}
