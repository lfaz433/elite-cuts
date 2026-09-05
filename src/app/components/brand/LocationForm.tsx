import React, { FormEvent, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Loader2, MapPin, X } from 'lucide-react';
import { functions } from '../../lib/firebase';

interface LocationFormProps {
  brandId: string;
  onCreated: (locationId: string) => void | Promise<void>;
  onCancel: () => void;
}

interface LocationCreationResult {
  locationId: string;
  membershipId: string;
}

export default function LocationForm({ brandId, onCreated, onCancel }: LocationFormProps) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [countryCode, setCountryCode] = useState('FR');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !city.trim() || !/^[A-Za-z]{2}$/.test(countryCode.trim())) {
      setError('Renseignez le nom, la ville et un code pays à deux lettres.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const createLocation = httpsCallable<Record<string, unknown>, LocationCreationResult>(
        functions,
        'createSalonLocation',
      );
      const response = await createLocation({
        brandId,
        name: name.trim(),
        city: city.trim(),
        countryCode: countryCode.trim().toUpperCase(),
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!response.data.locationId || !response.data.membershipId) {
        throw new Error('Le serveur a renvoyé un salon incomplet.');
      }
      await onCreated(response.data.locationId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de créer ce salon.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-3xl border border-[#D4AF37]/25 bg-[#111] p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#D4AF37]">Nouvel emplacement</p>
          <h2 className="mt-2 text-2xl font-black text-white">Ajouter un salon</h2>
        </div>
        <button type="button" onClick={onCancel} aria-label="Fermer" className="rounded-xl border border-white/10 p-2 text-white/50 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 sm:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">Nom du salon</span>
          <input value={name} onChange={event => setName(event.target.value)} required className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-[#D4AF37]" />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">Ville</span>
          <input value={city} onChange={event => setCity(event.target.value)} required className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-[#D4AF37]" />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">Code pays</span>
          <input value={countryCode} onChange={event => setCountryCode(event.target.value)} maxLength={2} required className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 uppercase text-white outline-none focus:border-[#D4AF37]" />
        </label>
        <label className="space-y-2 sm:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">Adresse</span>
          <input value={address} onChange={event => setAddress(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-[#D4AF37]" />
        </label>
        <label className="space-y-2 sm:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">Téléphone</span>
          <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-[#D4AF37]" />
        </label>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      <button type="submit" disabled={submitting} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3 font-black text-black hover:bg-[#e6c451] disabled:opacity-50">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
        {submitting ? 'Création…' : 'Créer le salon'}
      </button>
    </form>
  );
}
