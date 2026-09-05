import React from 'react';
import { Loader2, MailCheck } from 'lucide-react';

interface EmailVerificationViewProps {
  email: string;
  busy: boolean;
  onResend: () => void;
  onRefresh: () => void;
}

export default function EmailVerificationView({
  email,
  busy,
  onResend,
  onRefresh,
}: EmailVerificationViewProps) {
  return (
    <section className="w-full max-w-xl rounded-3xl border border-[#D4AF37]/25 bg-[#111] p-8 text-center">
      <MailCheck className="mx-auto h-10 w-10 text-[#D4AF37]" />
      <h1 className="mt-4 text-2xl font-black">Vérifiez votre adresse e-mail</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/55">
        Le lien a été envoyé à <strong className="text-white/80">{email}</strong>. Vérifiez cette adresse avant d’ouvrir l’invitation.
      </p>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={busy} onClick={onResend} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-white/70 disabled:opacity-50">
          Renvoyer l’e-mail
        </button>
        <button type="button" disabled={busy} onClick={onRefresh} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3 text-sm font-black text-black disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          J’ai vérifié mon e-mail
        </button>
      </div>
    </section>
  );
}
