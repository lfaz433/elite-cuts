import React, { useState, type FormEvent } from 'react';
import type { MarketplaceBooking } from '../../lib/marketplace/bookingRecords';
import type { JobApplication, JobPost, RelationshipType } from '../../lib/marketplace/jobRecords';

export interface JobDraft {
  relationshipType: RelationshipType;
  title: string;
  description: string;
  serviceIds: string[];
  schedule: string;
  terms: string;
}

interface BookingViewProps {
  slotsText: string;
  bookings: MarketplaceBooking[];
  saving: boolean;
  onSlotsTextChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  onRespond: (bookingId: string, decision: 'accept' | 'decline') => void | Promise<void>;
}

export function SalonBookingManagerView({
  slotsText,
  bookings,
  saving,
  onSlotsTextChange,
  onSave,
  onRespond,
}: BookingViewProps) {
  return <section className="space-y-5 rounded-3xl border border-white/10 bg-[#111] p-6">
    <div><h3 className="text-xl font-black">Disponibilités du salon</h3><p className="mt-1 text-sm text-white/45">Un créneau par ligne, au format AAAA-MM-JJTHH:MM. Les créneaux déjà réservés ne sont jamais rouverts.</p></div>
    <textarea aria-label="Créneaux du salon" rows={5} value={slotsText} onChange={event => onSlotsTextChange(event.currentTarget.value)} className="w-full rounded-xl border border-white/10 bg-black p-3 font-mono text-sm text-white" />
    <button type="button" disabled={saving} onClick={() => void onSave()} className="rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">{saving ? 'Enregistrement…' : 'Enregistrer les disponibilités'}</button>
    <div><h3 className="text-lg font-black">Demandes marketplace</h3><div className="mt-3 space-y-3">{bookings.map(booking => <article key={booking.id} className="rounded-2xl border border-white/10 bg-black p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{booking.clientName} · {booking.serviceId}</p><p className="mt-1 text-sm text-white/50">{booking.date} à {booking.time} · {booking.status}</p>{booking.clientPhone && <p className="mt-1 text-xs text-white/40">{booking.clientPhone}</p>}</div>{booking.status === 'pending_approval' && <div className="flex gap-2"><button type="button" onClick={() => void onRespond(booking.id, 'decline')} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-200">Refuser</button><button type="button" onClick={() => void onRespond(booking.id, 'accept')} className="rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-black text-black">Accepter</button></div>}</div></article>)}{bookings.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/40">Aucune demande marketplace.</p>}</div></div>
  </section>;
}

interface HiringViewProps {
  jobs: JobPost[];
  applications: JobApplication[];
  canInviteWorkers: boolean;
  creating: boolean;
  onCreate: (draft: JobDraft) => void | Promise<void>;
  onReview: (applicationId: string, decision: 'reject' | 'invite') => void | Promise<void>;
}

export function SalonHiringManagerView({
  jobs,
  applications,
  canInviteWorkers,
  creating,
  onCreate,
  onReview,
}: HiringViewProps) {
  const [draft, setDraft] = useState<JobDraft>({
    relationshipType: 'employee', title: '', description: '', serviceIds: [], schedule: '', terms: '',
  });
  const update = <K extends keyof JobDraft>(key: K, value: JobDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); void onCreate(draft); };
  const field = 'rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white';
  return <section className="space-y-6 rounded-3xl border border-white/10 bg-[#111] p-6">
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><h3 className="text-xl font-black sm:col-span-2">Publier une offre</h3><select aria-label="Type de relation" value={draft.relationshipType} onChange={event => update('relationshipType', event.currentTarget.value as RelationshipType)} className={field}><option value="employee">Salarié</option><option value="chair_rental">Location de fauteuil</option></select><input required aria-label="Titre" value={draft.title} onChange={event => update('title', event.currentTarget.value)} placeholder="Titre" className={field} /><textarea required aria-label="Description" value={draft.description} onChange={event => update('description', event.currentTarget.value)} placeholder="Description" className={`${field} sm:col-span-2`} /><input aria-label="Services" value={draft.serviceIds.join(', ')} onChange={event => update('serviceIds', [...new Set(event.currentTarget.value.split(',').map(item => item.trim()).filter(Boolean))])} placeholder="Services : cut, beard" className={field} /><input required aria-label="Horaires" value={draft.schedule} onChange={event => update('schedule', event.currentTarget.value)} placeholder="Horaires" className={field} /><input required aria-label="Conditions" value={draft.terms} onChange={event => update('terms', event.currentTarget.value)} placeholder="Conditions" className={`${field} sm:col-span-2`} /><button disabled={creating} className="rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">{creating ? 'Publication…' : 'Publier'}</button></form>
    <div><h3 className="text-lg font-black">Offres actives</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{jobs.map(job => <article key={job.id} className="rounded-2xl border border-white/10 bg-black p-4"><p className="font-bold">{job.title}</p><p className="mt-1 text-xs text-white/45">{job.relationshipType === 'employee' ? 'Salarié' : 'Location de fauteuil'} · {job.schedule}</p><p className="mt-2 text-sm text-white/60">{job.description}</p></article>)}{jobs.length === 0 && <p className="text-sm text-white/40">Aucune offre publiée.</p>}</div></div>
    <div><h3 className="text-lg font-black">Candidatures</h3><div className="mt-3 space-y-3">{applications.map(application => <article key={application.id} className="rounded-2xl border border-white/10 bg-black p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{application.applicantName}</p><p className="text-xs text-white/45">{application.applicantEmail} · {application.status}</p><p className="mt-2 text-sm text-white/60">{application.message || 'Aucun message.'}</p></div>{application.status === 'submitted' && <div className="flex gap-2"><button type="button" onClick={() => void onReview(application.id, 'reject')} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-200">Refuser</button>{canInviteWorkers && <button type="button" onClick={() => void onReview(application.id, 'invite')} className="rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-black text-black">Inviter comme membre</button>}</div>}</div></article>)}{applications.length === 0 && <p className="text-sm text-white/40">Aucune candidature.</p>}</div></div>
  </section>;
}
