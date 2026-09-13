import { MapPin, Scissors, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import type { PublicProfile } from '../../lib/marketplace/discovery';

interface ProfileCardProps {
  profile: PublicProfile;
}

export default function ProfileCard({ profile }: ProfileCardProps) {
  const cover = profile.portfolioUrls[0];

  return (
    <Link
      to={`/discover/${encodeURIComponent(profile.id)}`}
      className="group overflow-hidden rounded-3xl border border-white/10 bg-[#141414] transition hover:border-[#D4AF37]/50 hover:shadow-xl hover:shadow-[#D4AF37]/10"
    >
      <div className="aspect-[16/9] bg-white/[0.03]">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-[#D4AF37]"><Scissors /></div>
        )}
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-black text-white">{profile.displayName}</h2>
          {profile.kind === 'salon' ? <Scissors className="h-4 w-4 text-[#D4AF37]" /> : <UserRound className="h-4 w-4 text-[#D4AF37]" />}
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-white/55">{profile.serviceSummary}</p>
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/35"><MapPin className="h-3.5 w-3.5" /> {profile.cityId.replace('fr-', '')}</p>
        {profile.homeVisit && <span className="inline-flex rounded-full bg-[#D4AF37]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#D4AF37]">À domicile</span>}
      </div>
    </Link>
  );
}
