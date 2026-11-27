import React, { useCallback, useEffect, useState } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Check, Loader2, LockKeyhole, Plus, Save, Scissors, Trash2 } from 'lucide-react';
import { db, functions } from '../../lib/firebase';
import { parseSalonCatalog, serviceDraftPayload, type ServiceDraftRow, type SalonService } from '../../lib/marketplace/salonServices';

const saveCatalog = httpsCallable<
  { locationId: string; expectedRevision: number; services: SalonService[] },
  { locationId: string; revision: number; currency: string; services: SalonService[] }
>(functions, 'saveSalonServiceCatalog');
const inputClass = 'mt-2 w-full min-w-0 rounded-xl border border-white/15 bg-[#090909] px-3 py-3 text-base text-white outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20';

export default function SalonServiceCatalog({ locationId }: { locationId: string }) {
  const [rows, setRows] = useState<ServiceDraftRow[]>([]);
  const [revision, setRevision] = useState(0);
  const [savedRows, setSavedRows] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setReady(false); setError(''); setSaved(false);
    void getDocFromServer(doc(db, 'salonLocations', locationId)).then(snapshot => {
      if (cancelled) return;
      if (!snapshot.exists()) throw new Error('Salon introuvable.');
      const catalog = parseSalonCatalog(snapshot.data().serviceCatalogDraft);
      setRows(catalog.rows); setRevision(catalog.revision); setSavedRows(JSON.stringify(catalog.rows)); setReady(true);
    }).catch(() => { if (!cancelled) setError('Impossible de charger les prestations. Réessayez pour éviter d’écraser des données.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [locationId, loadAttempt]);
  const dirty = JSON.stringify(rows) !== savedRows;
  const updateRow = useCallback((id: string, patch: Partial<ServiceDraftRow>) => {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
    setSaved(false); setError('');
  }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || saving) return;
    setError(''); setSaved(false);
    let services: SalonService[];
    try { services = serviceDraftPayload(rows); } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Vérifiez les prestations.'); return;
    }
    setSaving(true);
    try {
      const result = await saveCatalog({ locationId, expectedRevision: revision, services });
      const catalog = parseSalonCatalog(result.data);
      setRows(catalog.rows); setRevision(catalog.revision); setSavedRows(JSON.stringify(catalog.rows)); setSaved(true);
    } catch (reason) {
      const code = (reason as { code?: string }).code;
      setError(code === 'functions/aborted' ? 'Les prestations ont été modifiées ailleurs. Rechargez les valeurs enregistrées avant de réessayer.'
        : code === 'functions/permission-denied' ? 'Votre accès ne permet plus de modifier ces prestations.'
        : 'Enregistrement impossible. Vos modifications sont conservées ici : réessayez.');
    } finally { setSaving(false); }
  };
  return (
    <section className="rounded-3xl border border-white/10 bg-[#111] p-4 sm:p-7" aria-labelledby="salon-services-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="salon-services-title" className="flex items-center gap-2 text-xl font-bold"><Scissors className="h-5 w-5 text-[#D4AF37]" /> Vos prestations</h3>
          <p className="mt-2 max-w-lg text-sm leading-6 text-white/60">Définissez vos services, leurs prix et le temps nécessaire pour chacun.</p></div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70"><LockKeyhole className="h-3.5 w-3.5" /> Brouillon privé</span>
      </div>
      <p className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-sm leading-6 text-white/60">Ces prestations sont en préparation. Enregistrer ne publie pas votre salon et n’ouvre pas les réservations.</p>
      {loading ? <p role="status" className="py-10 text-center text-white/60">Chargement des prestations…</p> : (
        <form onSubmit={save} className="mt-6">
          <fieldset disabled={!ready || saving} className="min-w-0 space-y-4 disabled:opacity-60">
            <legend className="sr-only">Prestations du salon</legend>
            {rows.length === 0 && ready && <div className="rounded-2xl border border-dashed border-white/20 p-6 text-center"><p className="font-semibold">Votre catalogue commence ici</p><p className="mt-2 text-sm text-white/60">Ajoutez votre première prestation pour préparer votre offre.</p></div>}
            {rows.map((row, index) => (
              <div key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-white/50">Prestation {index + 1}</span>
                  <button type="button" aria-label={`Retirer la prestation ${index + 1}`} onClick={() => { setRows(current => current.filter(item => item.id !== row.id)); setSaved(false); }} className="grid h-11 w-11 place-items-center rounded-xl text-white/50 hover:bg-red-400/10 hover:text-red-200 focus-visible:outline focus-visible:outline-[#D4AF37]"><Trash2 className="h-4 w-4" /></button></div>
                <div className="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="col-span-2 min-w-0 text-sm font-medium text-white/75 sm:col-span-1">Nom de la prestation<input aria-label={`Nom de la prestation ${index + 1}`} className={inputClass} value={row.label} onChange={e => updateRow(row.id, { label: e.target.value })} placeholder="Ex. Coupe" maxLength={80} required /></label>
                  <label className="min-w-0 text-sm font-medium text-white/75">Prix (€)<input aria-label={`Prix de la prestation ${index + 1} en euros`} className={inputClass} value={row.price} onChange={e => updateRow(row.id, { price: e.target.value })} inputMode="decimal" placeholder="20,00" required /></label>
                  <label className="min-w-0 text-sm font-medium text-white/75">Durée (min)<input aria-label={`Durée de la prestation ${index + 1} en minutes`} className={inputClass} value={row.duration} onChange={e => updateRow(row.id, { duration: e.target.value })} type="number" min={5} max={480} step={1} placeholder="30" required /></label>
                </div>
              </div>
            ))}
            <button type="button" disabled={rows.length >= 50} onClick={() => { setRows(current => [...current, {id: crypto.randomUUID(), label:'', price:'', duration:'30'}]); setSaved(false); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/40 px-4 py-3 text-sm font-semibold text-[#D4AF37] hover:bg-[#D4AF37]/10 disabled:opacity-40"><Plus className="h-4 w-4" /> Ajouter une prestation</button>
          </fieldset>
          {error && <div role="alert" className="mt-4 rounded-xl bg-red-400/10 p-4 text-sm leading-6 text-red-200"><p>{error}</p><button type="button" disabled={saving} onClick={() => setLoadAttempt(value => value + 1)} className="mt-2 min-h-11 underline">Recharger les valeurs enregistrées</button></div>}
          <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" className="flex items-center gap-2 text-sm text-white/60">{saved ? <><Check className="h-4 w-4 text-emerald-400" /> Prestations enregistrées</> : dirty ? 'Modifications non enregistrées' : revision > 0 ? 'Toutes les modifications sont enregistrées' : 'Votre brouillon reste privé'}</p>
            <button type="submit" disabled={!ready || saving || !dirty} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3 text-sm font-bold text-black hover:bg-[#e5c452] disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Enregistrement…' : 'Enregistrer les prestations'}</button>
          </div>
        </form>
      )}
    </section>
  );
}
