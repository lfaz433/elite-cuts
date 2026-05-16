import { Clock, MapPin, User, CheckCircle } from 'lucide-react';

export const AttendanceHistory = ({ attendance, barbers }: any) => {
  const sortedAttendance = [...attendance].sort((a, b) => new Date(b.date + 'T' + b.checkInTime).getTime() - new Date(a.date + 'T' + a.checkInTime).getTime());

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Historique de Pointage</h2>
      <div className="bg-[#141414] border border-[#D4AF37]/10 rounded-3xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-white/40 text-xs uppercase tracking-widest border-b border-white/10">
              <th className="px-6 py-4">Coiffeur</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Heure</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sortedAttendance.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-white/20 italic">Aucun pointage enregistré</td>
              </tr>
            ) : sortedAttendance.map((record: any) => {
              const barber = barbers.find((b: any) => b.id === record.barberId);
              return (
                <tr key={record.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={barber?.image} className="w-8 h-8 rounded-full object-cover" />
                      <span className="font-medium">{barber?.name || 'Inconnu'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-white/60">{record.date}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-[#D4AF37]" />
                      <span>{record.checkInTime}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                      record.status === 'on-time' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {record.status === 'on-time' ? 'À l\'heure' : 'Retard'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
