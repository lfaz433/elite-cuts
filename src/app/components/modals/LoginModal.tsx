import { useState } from 'react';
import { X, Eye, EyeOff, Scissors, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

// Demo accounts always available for testing
const DEMO_ACCOUNTS = [
  { role: 'admin' as const, label: 'Admin', emoji: '👑', email: 'admin@test.com', password: 'password123', color: '#D4AF37', description: 'Tableau de bord admin' },
  { role: 'barber' as const, label: 'Coiffeur', emoji: '✂️', email: 'barber@test.com', password: 'password123', color: '#818cf8', description: 'Marcus Johnson' },
  { role: 'client' as const, label: 'Client', emoji: '👤', email: 'client@test.com', password: 'password123', color: '#34d399', description: 'Accès client' },
];

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'client' | 'admin' | 'barber'>('client');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState<string | null>(null);

  const { login } = useAuth();
  const { businessInfo, barbers } = useBusiness();
  const navigate = useNavigate();

  // Core login logic
  const doLogin = async (loginEmail: string, loginPassword: string, loginRole: 'client' | 'admin' | 'barber') => {
    if (loginRole === 'admin') {
      // Check demo account OR configured credentials
      const isDemo = loginEmail === 'admin@test.com' && loginPassword === 'password123';
      const isConfigured = loginEmail === (businessInfo.adminEmail || 'admin@test.com') && loginPassword === (businessInfo.adminPassword || 'password123');
      if (!isDemo && !isConfigured) {
        toast.error('Identifiants admin incorrects.');
        return false;
      }
      login(loginEmail, loginPassword, 'admin', 'Administrateur');

    } else if (loginRole === 'barber') {
      // Demo barber shortcut
      if (loginEmail === 'barber@test.com' && loginPassword === 'password123') {
        const demoBarber = barbers.find(b => !b.archived) || barbers[0];
        if (demoBarber) {
          login(loginEmail, loginPassword, 'barber', demoBarber.name, demoBarber.id);
        } else {
          // No barbers in DB yet — create a virtual session
          login(loginEmail, loginPassword, 'barber', 'Marcus Johnson');
        }
      } else {
        // Match against real Firestore barbers
        const barber = barbers.find(
          b => (b.email === loginEmail || b.username === loginEmail) && b.password === loginPassword && !b.archived
        );
        if (!barber) {
          toast.error('Coiffeur introuvable ou mot de passe incorrect.');
          return false;
        }
        login(loginEmail, loginPassword, 'barber', barber.name, barber.id);
      }

    } else {
      // Client: always works
      const clientName = loginEmail.split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      login(loginEmail, loginPassword, 'client', clientName);
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const ok = await doLogin(email, password, role);
    setIsLoading(false);
    if (ok) { onClose(); navigate(`/${role}`); }
  };

  const handleDemoLogin = async (demo: typeof DEMO_ACCOUNTS[0]) => {
    setLoadingDemo(demo.role);
    await new Promise(r => setTimeout(r, 300));
    const ok = await doLogin(demo.email, demo.password, demo.role);
    setLoadingDemo(null);
    if (ok) { onClose(); navigate(`/${demo.role}`); }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'linear-gradient(135deg, #141414, #1c1c1c)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, padding: '32px 24px 40px', overflowY: 'auto', maxHeight: '95vh' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Scissors style={{ width: 22, height: 22, color: '#D4AF37' }} />
            <span style={{ fontSize: 18, fontWeight: 700, background: 'linear-gradient(to right, #D4AF37, #FFD700)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {businessInfo.name || 'Elite Cuts'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex' }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'white', marginBottom: 4 }}>Connexion</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 24 }}>Accédez à votre espace</p>

        {/* ⚡ DEMO QUICK LOGIN */}
        <div style={{ marginBottom: 24, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Zap style={{ width: 14, height: 14, color: '#D4AF37' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Comptes de test rapide</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {DEMO_ACCOUNTS.map(demo => (
              <button
                key={demo.role}
                type="button"
                onClick={() => handleDemoLogin(demo)}
                disabled={!!loadingDemo}
                style={{
                  padding: '12px 8px', borderRadius: 12, border: `1px solid ${demo.color}30`,
                  background: `${demo.color}10`, cursor: 'pointer', textAlign: 'center',
                  opacity: loadingDemo && loadingDemo !== demo.role ? 0.5 : 1, transition: 'all 0.2s',
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 4 }}>
                  {loadingDemo === demo.role ? '⏳' : demo.emoji}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: demo.color }}>{demo.label}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{demo.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>ou connectez-vous manuellement</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Role selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {(['client', 'barber', 'admin'] as const).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                style={{
                  padding: '9px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, textTransform: 'capitalize', transition: 'all 0.2s',
                  background: role === r ? 'linear-gradient(to right, #D4AF37, #FFD700)' : 'rgba(255,255,255,0.05)',
                  color: role === r ? 'black' : 'rgba(255,255,255,0.5)',
                }}
              >
                {r === 'client' ? 'Client' : r === 'barber' ? 'Coiffeur' : 'Admin'}
              </button>
            ))}
          </div>

          {/* Email */}
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 6 }}>Email / Identifiant</label>
            <input
              type={role === 'barber' ? 'text' : 'email'}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={role === 'admin' ? 'admin@test.com' : role === 'barber' ? 'barber@test.com' : 'client@test.com'}
              required
              style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, color: 'white', fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 6 }}>Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="password123"
                required
                style={{ width: '100%', padding: '12px 44px 12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, color: 'white', fontSize: 15, boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16 }}>
                {showPassword ? <EyeOff style={{ width: 18, height: 18 }} /> : <Eye style={{ width: 18, height: 18 }} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%', padding: '13px', background: 'linear-gradient(to right, #D4AF37, #FFD700)',
              border: 'none', borderRadius: 12, color: 'black', fontSize: 15, fontWeight: 700,
              cursor: isLoading ? 'wait' : 'pointer', opacity: isLoading ? 0.7 : 1, marginTop: 4,
            }}
          >
            {isLoading ? 'Connexion...' : 'Se Connecter'}
          </button>
        </form>

        {/* Credentials hint */}
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(212,175,55,0.05)', borderRadius: 10, border: '1px solid rgba(212,175,55,0.1)' }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.8, margin: 0 }}>
            👑 <strong style={{ color: 'rgba(212,175,55,0.7)' }}>Admin :</strong> admin@test.com / password123<br/>
            ✂️ <strong style={{ color: 'rgba(129,140,248,0.7)' }}>Coiffeur :</strong> barber@test.com / password123<br/>
            👤 <strong style={{ color: 'rgba(52,211,153,0.7)' }}>Client :</strong> n'importe quels identifiants
          </p>
        </div>
      </div>
    </div>
  );
}
