import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Star, Calendar, Clock, MapPin, Phone, Instagram, Award, TrendingUp, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import LoginModal from '../modals/LoginModal';
import BookingModal from '../modals/BookingModal';

const STAT_ICONS: Record<string, any> = {
  experience: Award,
  clients: Star,
  services: Scissors,
  rating: TrendingUp,
};

// --- Helpers ---
const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-white/5 rounded-2xl ${className}`} />
);

const getOptimizedImage = (url: string, width: number = 800) => {
  if (!url) return '';
  if (url.startsWith('data:')) return url; // Don't optimize base64
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}auto=format&w=${width}&q=75`;
};

export default function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showStickyBtn, setShowStickyBtn] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { services, barbers, gallery, businessInfo, loading } = useBusiness();

  // Dynamic branding from admin
  const heroImage = businessInfo.heroImage || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1920&h=1080&fit=crop';
  const heroTitle = businessInfo.heroTitle || 'Soins Premium';
  const heroSubtitle = businessInfo.heroSubtitle || 'Vivez une expérience de soins de luxe avec des maîtres barbiers dans un environnement premium';
  const heroButtonText = businessInfo.heroButtonText || 'Prendre Rendez-vous';
  const logo = businessInfo.logo;
  const activeStats = (businessInfo.stats || [
    { id: 'experience', label: "Années d'expérience", value: '15+', enabled: true },
    { id: 'clients', label: 'Clients Satisfaits', value: '10K+', enabled: true },
    { id: 'services', label: 'Services Réalisés', value: '50K+', enabled: true },
    { id: 'rating', label: 'Note des Clients', value: '4.9', enabled: true },
  ]).filter(s => s.enabled);

  // Scroll-aware sticky button
  useEffect(() => {
    const handleScroll = () => {
      const heroHeight = heroRef.current?.offsetHeight || window.innerHeight;
      setShowStickyBtn(window.scrollY > heroHeight * 0.8);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="w-full">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-[#D4AF37]/20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
            {logo ? (
              <img src={getOptimizedImage(logo, 200)} alt="Logo" className="h-10 object-contain" loading="eager" />
            ) : (
              <div className="flex items-center gap-2">
                <Scissors className="w-8 h-8 text-[#D4AF37]" />
                <span className="text-2xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">{businessInfo.name || 'Elite Cuts'}</span>
              </div>
            )}
          </motion.div>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#services" className="text-white/80 hover:text-[#D4AF37] transition-colors font-medium">Services</a>
            <a href="#team" className="text-white/80 hover:text-[#D4AF37] transition-colors font-medium">Équipe</a>
            <a href="#gallery" className="text-white/80 hover:text-[#D4AF37] transition-colors font-medium">Galerie</a>
            <a href="#contact" className="text-white/80 hover:text-[#D4AF37] transition-colors font-medium">Contact</a>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <button onClick={() => navigate(`/${user.role}`)} className="hidden md:block px-6 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg font-bold transition-all hover:shadow-lg hover:shadow-[#D4AF37]/50 active:scale-95">
                Tableau de bord
              </button>
            ) : (
              <button onClick={() => setLoginOpen(true)} className="hidden md:block px-6 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg font-bold transition-all hover:shadow-lg hover:shadow-[#D4AF37]/50 active:scale-95">
                Connexion
              </button>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-[#D4AF37] hover:bg-white/10 rounded-lg transition-colors"
            >
              {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-black/95 border-b border-[#D4AF37]/20 overflow-hidden"
            >
              <div className="flex flex-col p-6 gap-6">
                <a href="#services" onClick={() => setMobileMenuOpen(false)} className="text-xl font-bold text-white">Services</a>
                <a href="#team" onClick={() => setMobileMenuOpen(false)} className="text-xl font-bold text-white">Équipe</a>
                <a href="#gallery" onClick={() => setMobileMenuOpen(false)} className="text-xl font-bold text-white">Galerie</a>
                <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="text-xl font-bold text-white">Contact</a>
                {user ? (
                  <button onClick={() => { navigate(`/${user.role}`); setMobileMenuOpen(false); }} className="w-full py-4 bg-[#D4AF37] text-black rounded-xl font-bold">Tableau de bord</button>
                ) : (
                  <button onClick={() => { setLoginOpen(true); setMobileMenuOpen(false); }} className="w-full py-4 bg-[#D4AF37] text-black rounded-xl font-bold">Connexion</button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section ref={heroRef} className="relative h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={getOptimizedImage(heroImage, 1920)}
            className="w-full h-full object-cover"
            alt="Hero"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-6xl md:text-8xl font-black text-white mb-6 tracking-tighter leading-none">
              {heroTitle.split(' ').map((word, i) => (
                <span key={i} className={i === 1 ? "text-[#D4AF37]" : ""}>{word} </span>
              ))}
            </h1>
            <p className="text-xl md:text-2xl text-white/80 mb-10 max-w-2xl mx-auto leading-relaxed">
              {heroSubtitle}
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <button
                onClick={() => setBookingOpen(true)}
                className="group relative px-10 py-5 bg-[#D4AF37] text-black font-black uppercase tracking-widest rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-[#D4AF37]/30"
              >
                <span className="relative z-10">{heroButtonText}</span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform" />
              </button>
              <a href="#services" className="text-white font-bold hover:text-[#D4AF37] transition-colors border-b-2 border-white/20 hover:border-[#D4AF37]">Explorer nos services</a>
            </div>
          </motion.div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce hidden md:block">
          <div className="w-6 h-10 border-2 border-[#D4AF37]/50 rounded-full flex items-start justify-center p-2">
            <div className="w-1.5 h-3 bg-[#D4AF37] rounded-full" />
          </div>
        </div>
      </section>

      {/* Stats */}
      {activeStats.length > 0 && (
        <section className="py-20 bg-gradient-to-b from-black to-[#0a0a0a]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {activeStats.map((stat, index) => {
                const Icon = STAT_ICONS[stat.id] || Award;
                return (
                  <motion.div key={stat.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }} className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/20 mb-4">
                      <Icon className="w-8 h-8 text-[#D4AF37]" />
                    </div>
                    <div className="text-4xl font-bold text-[#D4AF37] mb-2">{stat.value}</div>
                    <div className="text-white/60 font-medium">{stat.label}</div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Services */}
      <section id="services" className="py-24 bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">Nos Services</h2>
            <p className="text-white/60 text-lg">Des expériences de soins premium adaptées à votre style</p>
          </motion.div>

          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => <Skeleton key={i} className="aspect-video h-[350px]" />)}
            </div>
          ) : services.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {services.map((service, index) => (
                <motion.div key={service.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }} className="group relative bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl overflow-hidden border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 transition-all hover:shadow-xl hover:shadow-[#D4AF37]/20">
                  <div className="aspect-video overflow-hidden">
                    <img src={getOptimizedImage(service.image, 800)} alt={service.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                  </div>
                  <div className="p-6">
                    <h3 className="text-2xl font-bold text-white mb-2">{service.name}</h3>
                    <p className="text-white/60 mb-4 line-clamp-2">{service.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-2xl font-bold text-[#D4AF37]">{service.price}</span>
                        <span className="text-white/40 flex items-center gap-1 text-sm"><Clock className="w-4 h-4" />{service.duration}</span>
                      </div>
                      <button onClick={() => setBookingOpen(true)} className="px-4 py-2 bg-[#D4AF37] text-black rounded-lg hover:bg-[#FFD700] transition-colors active:scale-95 font-bold">Réserver</button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-[#D4AF37]/30">
              <Scissors className="w-12 h-12 text-[#D4AF37]/40 mx-auto mb-4" />
              <p className="text-white/40">Aucun service disponible pour le moment.</p>
            </div>
          )}
        </div>
      </section>

      {/* Team */}
      <section id="team" className="py-24 bg-gradient-to-b from-[#0a0a0a] to-black">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">Maîtres Barbiers</h2>
            <p className="text-white/60 text-lg">Découvrez notre équipe de professionnels expérimentés</p>
          </motion.div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="aspect-square" />)}
            </div>
          ) : barbers.filter(b => !b.archived).length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
              {barbers.filter(b => !b.archived).map((barber, index) => (
                <motion.div key={barber.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }} className="group relative bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl overflow-hidden border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 transition-all hover:shadow-xl hover:shadow-[#D4AF37]/20">
                  <div className="aspect-square overflow-hidden">
                    <img src={getOptimizedImage(barber.image, 400)} alt={barber.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-white mb-1">{barber.name}</h3>
                    <p className="text-[#D4AF37] mb-2 font-medium">{barber.specialty}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/60">{barber.experience}</span>
                      <div className="flex items-center gap-1 text-[#FFD700]"><Star className="w-4 h-4 fill-current" /><span>{barber.rating}</span></div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-white/40">Notre équipe s'agrandit prochainement.</p>
            </div>
          )}
        </div>
      </section>

      {/* Gallery */}
      <section id="gallery" className="py-24 bg-black">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">Portfolio</h2>
            <p className="text-white/60 text-lg">Nos meilleures réalisations</p>
          </motion.div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="aspect-square" />)}
            </div>
          ) : gallery.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {gallery.map((image, index) => (
                <motion.div key={index} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }} className="group relative aspect-square rounded-2xl overflow-hidden border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 transition-all">
                  <img src={getOptimizedImage(image, 600)} alt={`Gallery ${index + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                    <span className="text-white font-bold">Inspiration Elite</span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
             <div className="grid grid-cols-2 md:grid-cols-3 gap-4 opacity-40">
               {[1,2,3,4,5,6].map(i => <div key={i} className="aspect-square bg-white/5 rounded-2xl border border-white/10" />)}
             </div>
          )}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-24 bg-gradient-to-t from-[#0a0a0a] to-black">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <h2 className="text-4xl md:text-5xl font-bold mb-8 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">Nous Rendre Visite</h2>
              <div className="space-y-8">
                {[
                  { icon: MapPin, title: 'Emplacement', text: businessInfo.address },
                  { icon: Clock, title: 'Horaires', text: `Lun-Ven: ${businessInfo.hours?.weekdays || '9h-19h'}\nSam-Dim: ${businessInfo.hours?.weekends || '10h-17h'}` },
                  { icon: Phone, title: 'Contact', text: `${businessInfo.phone}\n${businessInfo.email}` },
                ].map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex items-start gap-6">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/20 flex items-center justify-center flex-shrink-0 border border-[#D4AF37]/20">
                      <Icon className="w-7 h-7 text-[#D4AF37]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                      <p className="text-white/60 whitespace-pre-line leading-relaxed">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="relative rounded-3xl overflow-hidden border border-[#D4AF37]/20 h-[450px] shadow-2xl shadow-[#D4AF37]/5">
              <div className="w-full h-full bg-gradient-to-br from-[#141414] to-[#1a1a1a] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 bg-[#D4AF37]/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#D4AF37]/20">
                    <MapPin className="w-10 h-10 text-[#D4AF37]" />
                  </div>
                  <p className="text-white/40 font-medium">Carte Interactive Elite Cuts</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-black border-t border-[#D4AF37]/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-3">
              {logo ? <img src={getOptimizedImage(logo, 200)} alt="Logo" className="h-10 object-contain" /> : <div className="flex items-center gap-2"><Scissors className="w-8 h-8 text-[#D4AF37]" /><span className="text-2xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">{businessInfo.name || 'Elite Cuts'}</span></div>}
            </div>
            <div className="flex gap-8 text-white/40 text-sm font-medium">
              <a href="#" className="hover:text-[#D4AF37] transition-colors">Mentions Légales</a>
              <a href="#" className="hover:text-[#D4AF37] transition-colors">Confidentialité</a>
              <a href="#" className="hover:text-[#D4AF37] transition-colors">CGV</a>
            </div>
            <p className="text-white/30 text-center">© 2026 Elite Cuts. Excellence en Coiffure Masculine.</p>
          </div>
        </div>
      </footer>

      {/* Mobile Sticky Booking Button — scroll-aware */}
      <AnimatePresence>
        {showStickyBtn && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="md:hidden fixed bottom-6 left-6 right-6 z-50"
          >
            <button
              onClick={() => setBookingOpen(true)}
              className="w-full py-4 bg-[#D4AF37] text-black font-black uppercase tracking-widest rounded-2xl shadow-2xl shadow-[#D4AF37]/40 active:scale-95 transition-transform"
            >
              {heroButtonText}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Suspense fallback={null}>
        {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
        {bookingOpen && <BookingModal onClose={() => setBookingOpen(false)} />}
      </Suspense>
    </div>
  );
}
