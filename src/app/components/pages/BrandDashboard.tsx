import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { Building2, LayoutDashboard, LockKeyhole, LogOut, Plus, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { db } from '../../lib/firebase';
import { DEFAULT_WORKER_PERMISSIONS, PERMISSION_KEYS } from '../../lib/marketplace/permissions';
import type { PermissionKey, SalonLocation } from '../../lib/marketplace/types';
import { isManagerEligibleMembership, managerLocationForRoute, managerLocationIds } from '../../lib/marketplace/access';
import LocationForm from '../brand/LocationForm';
import LocationList from '../brand/LocationList';
import PermissionEditor from '../brand/PermissionEditor';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';

function locationRecord(id: string, data: Record<string, unknown>): SalonLocation | null {
  if (
    typeof data.brandId !== 'string'
    || typeof data.name !== 'string'
    || typeof data.city !== 'string'
    || typeof data.countryCode !== 'string'
  ) return null;
  return {
    id,
    brandId: data.brandId,
    name: data.name,
    city: data.city,
    countryCode: data.countryCode,
    ...(typeof data.address === 'string' ? { address: data.address } : {}),
    ...(typeof data.phone === 'string' ? { phone: data.phone } : {}),
    ...(typeof data.timezone === 'string' ? { timezone: data.timezone } : {}),
  };
}

export default function BrandDashboard() {
  const { user, logout, refreshSession } = useAuth();
  const { brandId, locationId, selectLocation } = useWorkspace();
  const navigate = useNavigate();
  const route = useLocation();
  const [locations, setLocations] = useState<SalonLocation[]>([]);
  const [brandName, setBrandName] = useState('Espace multi-salon');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLocationForm, setShowLocationForm] = useState(false);

  const isPrincipal = user?.memberships.some(membership => (
    membership.brandId === brandId
    && membership.role === 'principal_admin'
    && !membership.locationId
  )) ?? false;
  const assignedLocationIds = useMemo(() => (
    user && brandId ? managerLocationIds(user.memberships, brandId) : []
  ), [brandId, user?.memberships]);

  const loadLocations = useCallback(async () => {
    if (!brandId) {
      setLocations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (isPrincipal) {
        const [brandSnapshot, locationSnapshot] = await Promise.all([
          getDoc(doc(db, 'brands', brandId)),
          getDocs(query(collection(db, 'salonLocations'), where('brandId', '==', brandId))),
        ]);
        const brand = brandSnapshot.data();
        if (brandSnapshot.exists() && typeof brand?.name === 'string') setBrandName(brand.name);
        setLocations(locationSnapshot.docs
          .map(item => locationRecord(item.id, item.data()))
          .filter((item): item is SalonLocation => item !== null)
          .sort((left, right) => left.city.localeCompare(right.city)));
      } else {
        const snapshots = await Promise.all(assignedLocationIds.map(id => (
          getDoc(doc(db, 'salonLocations', id))
        )));
        setLocations(snapshots
          .filter(item => item.exists())
          .map(item => locationRecord(item.id, item.data()))
          .filter((item): item is SalonLocation => item !== null && item.brandId === brandId)
          .sort((left, right) => left.city.localeCompare(right.city)));
      }
    } catch (reason) {
      console.error('Failed to load salon locations:', reason);
      setError('Impossible de charger les salons autorisés.');
    } finally {
      setLoading(false);
    }
  }, [assignedLocationIds, brandId, isPrincipal]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    if (locations.length === 0) return;
    const routeLocationId = route.pathname.match(/^\/brand\/locations\/([^/]+)/)?.[1];
    const accessibleLocationId = managerLocationForRoute(
      routeLocationId,
      locations.map(location => location.id),
      locationId,
    );
    if (!accessibleLocationId) return;
    selectLocation(accessibleLocationId);
    if (routeLocationId !== accessibleLocationId) {
      navigate(`/brand/locations/${accessibleLocationId}`, { replace: true });
    }
  }, [locationId, locations, navigate, route.pathname, selectLocation]);

  const selectedLocation = locations.find(location => location.id === locationId) ?? null;
  const selectedMembership = user?.memberships.find(membership => (
    membership.brandId === brandId
    && membership.locationId === selectedLocation?.id
    && isManagerEligibleMembership(membership)
  ));
  const permissionValue = {
    ...DEFAULT_WORKER_PERMISSIONS,
    ...(selectedMembership?.permissions ?? {}),
  } as Record<PermissionKey, boolean>;
  const permissionsView = route.pathname.endsWith('/permissions');

  const openLocation = (id: string) => {
    selectLocation(id);
    navigate(`/brand/locations/${id}`);
  };

  const handleCreated = async (id: string) => {
    await refreshSession();
    await loadLocations();
    setShowLocationForm(false);
    selectLocation(id);
    navigate(`/brand/locations/${id}`);
  };

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <header className="border-b border-white/10 bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#D4AF37] text-black"><Building2 className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#D4AF37]">Barberboard Brands</p>
              <h1 className="text-lg font-black">{brandName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-3 py-1.5 text-xs font-bold text-[#D4AF37] sm:inline-flex">
              {isPrincipal ? 'Principal Admin' : 'Salon Admin'}
            </span>
            <button type="button" onClick={() => void logout()} aria-label="Se déconnecter" className="rounded-xl border border-white/10 p-2.5 text-white/55 hover:border-white/20 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-7 lg:grid-cols-[290px_1fr] lg:px-8">
        <aside className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Vos salons</p>
            {isPrincipal && (
              <button type="button" onClick={() => setShowLocationForm(true)} className="flex items-center gap-1 rounded-lg bg-[#D4AF37] px-2.5 py-1.5 text-xs font-black text-black">
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(item => <div key={item} className="h-[74px] animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />)}
            </div>
          ) : <LocationList locations={locations} selectedId={selectedLocation?.id ?? null} onSelect={openLocation} />}
          {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
        </aside>

        <main className="min-w-0">
          {showLocationForm && brandId ? (
            <LocationForm brandId={brandId} onCreated={handleCreated} onCancel={() => setShowLocationForm(false)} />
          ) : selectedLocation ? (
            <div className="space-y-6">
              <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#171717] to-[#0d0d0d]">
                <div className="border-b border-white/10 px-6 py-7 sm:px-8">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#D4AF37]">{selectedLocation.city}</p>
                  <h2 className="mt-2 text-3xl font-black">{selectedLocation.name}</h2>
                  <p className="mt-2 text-sm text-white/45">{selectedLocation.address || `${selectedLocation.city}, ${selectedLocation.countryCode}`}</p>
                </div>
                <nav className="flex gap-2 p-3" aria-label="Navigation du salon">
                  <button type="button" onClick={() => navigate(`/brand/locations/${selectedLocation.id}`)} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${!permissionsView ? 'bg-[#D4AF37] text-black' : 'text-white/55 hover:bg-white/5'}`}>
                    <LayoutDashboard className="h-4 w-4" /> Vue d’ensemble
                  </button>
                  <button type="button" onClick={() => navigate(`/brand/locations/${selectedLocation.id}/permissions`)} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${permissionsView ? 'bg-[#D4AF37] text-black' : 'text-white/55 hover:bg-white/5'}`}>
                    <LockKeyhole className="h-4 w-4" /> Permissions
                  </button>
                </nav>
              </section>

              {permissionsView ? (
                <section className="rounded-3xl border border-white/10 bg-[#111] p-6 sm:p-8">
                  <div className="mb-6 flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-[#D4AF37]" />
                    <div>
                      <h3 className="font-black">Droits de votre accès</h3>
                      <p className="mt-1 text-sm text-white/45">Ces autorisations sont attribuées côté serveur et affichées en lecture seule.</p>
                    </div>
                  </div>
                  <PermissionEditor value={permissionValue} onChange={() => undefined} disabledKeys={PERMISSION_KEYS} showRole={false} />
                </section>
              ) : (
                <section className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="text-xs uppercase tracking-wider text-white/40">Ville</p><p className="mt-2 text-lg font-black">{selectedLocation.city}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="text-xs uppercase tracking-wider text-white/40">Pays</p><p className="mt-2 text-lg font-black">{selectedLocation.countryCode}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="text-xs uppercase tracking-wider text-white/40">Périmètre</p><p className="mt-2 text-lg font-black">Emplacement actif</p></div>
                </section>
              )}
            </div>
          ) : !loading && !error ? (
            <div className="rounded-3xl border border-dashed border-white/15 px-8 py-16 text-center">
              <Building2 className="mx-auto h-8 w-8 text-white/25" />
              <h2 className="mt-4 text-xl font-black">Aucun salon accessible</h2>
              <p className="mt-2 text-sm text-white/45">{isPrincipal ? 'Ajoutez votre premier emplacement.' : 'Demandez à votre Principal Admin de vous attribuer un salon.'}</p>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
