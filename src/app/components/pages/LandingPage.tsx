import { useState } from 'react';
import { motion } from 'motion/react';
import { Scissors, Star, Calendar, Clock, MapPin, Phone, Instagram, Award, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import LoginModal from '../modals/LoginModal';
import BookingModal from '../modals/BookingModal';

export default function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { services, barbers, gallery, businessInfo, products } = useBusiness();

  const stats = [
    { icon: Award, label: 'Années d\'expérience', value: '15+' },
    { icon: Star, label: 'Clients Satisfaits', value: '10K+' },
    { icon: Scissors, label: 'Services Réalisés', value: '50K+' },
    { icon: TrendingUp, label: 'Note des Clients', value: '4.9' },
  ];


  return (
    <div className="w-full">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-[#D4AF37]/20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <Scissors className="w-8 h-8 text-[#D4AF37]" />
            <span className="text-2xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
              Elite Cuts
            </span>
          </motion.div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#services" className="text-white/80 hover:text-[#D4AF37] transition-colors">Services</a>
            <a href="#team" className="text-white/80 hover:text-[#D4AF37] transition-colors">Équipe</a>
            <a href="#gallery" className="text-white/80 hover:text-[#D4AF37] transition-colors">Galerie</a>
            <a href="#contact" className="text-white/80 hover:text-[#D4AF37] transition-colors">Contact</a>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <button
                onClick={() => navigate(`/${user.role}`)}
                className="px-4 py-2 text-sm md:text-base md:px-6 md:py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all active:scale-95 font-bold"
              >
                Tableau de bord
              </button>
            ) : (
              <button
                onClick={() => setLoginOpen(true)}
                className="px-4 py-2 text-sm md:text-base md:px-6 md:py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all active:scale-95 font-bold"
              >
                Connexion
              </button>
            )}
          </div>
        </div>
      </nav>

      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-black to-[#1a1a1a]" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1920&h=1080&fit=crop')] bg-cover bg-center opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

        <div className="relative z-10 text-center max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-6xl md:text-8xl font-bold mb-6 bg-gradient-to-r from-[#FFD700] via-[#D4AF37] to-[#B8960A] bg-clip-text text-transparent">
              Soins Premium
            </h1>
            <p className="text-xl md:text-2xl text-white/80 mb-12 max-w-3xl mx-auto">
              Vivez une expérience de soins de luxe avec des maîtres barbiers dans un environnement premium
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setBookingOpen(true)}
                className="px-8 py-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-xl hover:shadow-2xl hover:shadow-[#D4AF37]/50 transition-all transform hover:scale-105 active:scale-95"
              >
                <Calendar className="w-5 h-5 inline mr-2" />
                Prendre Rendez-vous
              </button>
              <button
                onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white rounded-xl border border-[#D4AF37]/30 hover:bg-white/20 transition-all active:scale-95"
              >
                Voir les Services
              </button>
            </div>
          </motion.div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-[#D4AF37]/50 rounded-full flex items-start justify-center p-2">
            <div className="w-1.5 h-3 bg-[#D4AF37] rounded-full" />
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-black to-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/20 mb-4">
                  <stat.icon className="w-8 h-8 text-[#D4AF37]" />
                </div>
                <div className="text-4xl font-bold text-[#D4AF37] mb-2">{stat.value}</div>
                <div className="text-white/60">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="py-24 bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
              Nos Services
            </h2>
            <p className="text-white/60 text-lg">Des expériences de soins premium adaptées à votre style</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group relative bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl overflow-hidden border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 transition-all hover:shadow-xl hover:shadow-[#D4AF37]/20"
              >
                <div className="aspect-video overflow-hidden">
                  <img
                    src={service.image}
                    alt={service.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-white mb-2">{service.name}</h3>
                  <p className="text-white/60 mb-4">{service.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-[#D4AF37]">{service.price}</span>
                      <span className="text-white/40 flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {service.duration}
                      </span>
                    </div>
                    <button
                      onClick={() => setBookingOpen(true)}
                      className="px-4 py-2 bg-[#D4AF37] text-black rounded-lg hover:bg-[#FFD700] transition-colors active:scale-95 font-bold"
                    >
                      Réserver
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="team" className="py-24 bg-gradient-to-b from-[#0a0a0a] to-black">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
              Maîtres Barbiers
            </h2>
            <p className="text-white/60 text-lg">Découvrez notre équipe de professionnels expérimentés</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {barbers.map((barber, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group relative bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl overflow-hidden border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 transition-all hover:shadow-xl hover:shadow-[#D4AF37]/20"
              >
                <div className="aspect-square overflow-hidden">
                  <img
                    src={barber.image}
                    alt={barber.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-white mb-1">{barber.name}</h3>
                  <p className="text-[#D4AF37] mb-2">{barber.specialty}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">{barber.experience}</span>
                    <div className="flex items-center gap-1 text-[#FFD700]">
                      <Star className="w-4 h-4 fill-current" />
                      <span>{barber.rating}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Boutique Section */}
      <section id="boutique" className="py-24 bg-gradient-to-b from-black to-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex items-end justify-between mb-16"
          >
            <div>
              <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
                Notre Boutique
              </h2>
              <p className="text-white/60 text-lg">Produits d'entretien professionnels disponibles au salon</p>
            </div>
            <div className="hidden md:flex gap-2">
              <button className="p-3 rounded-full border border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button className="p-3 rounded-full border border-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors">
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </motion.div>

          <div className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-8 scrollbar-hide">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="min-w-[300px] md:min-w-[350px] snap-center bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl overflow-hidden border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 transition-all hover:shadow-xl hover:shadow-[#D4AF37]/20 group"
              >
                <div className="aspect-square overflow-hidden bg-white/5 p-8 flex items-center justify-center">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500 drop-shadow-2xl"
                  />
                </div>
                <div className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-white leading-tight">{product.name}</h3>
                    <span className="text-xl font-bold text-[#D4AF37]">€{product.sellPrice.toFixed(2)}</span>
                  </div>
                  <p className="text-white/60 text-sm mb-6 line-clamp-2">{product.description}</p>
                  <button 
                    onClick={() => {
                      alert(`Le produit "${product.name}" est disponible dans notre salon. Réservez une coupe et repartez avec !`);
                    }}
                    className="w-full py-3 bg-white/5 text-white rounded-lg hover:bg-[#D4AF37] hover:text-black transition-colors font-bold"
                  >
                    Voir en Boutique
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="gallery" className="py-24 bg-black">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
              Portfolio
            </h2>
            <p className="text-white/60 text-lg">Nos meilleures réalisations</p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {gallery.map((image, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group relative aspect-square rounded-2xl overflow-hidden border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 transition-all"
              >
                <img
                  src={image}
                  alt={`Gallery ${index + 1}`}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="py-24 bg-gradient-to-t from-[#0a0a0a] to-black">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
                Nous Rendre Visite
              </h2>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/20 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-6 h-6 text-[#D4AF37]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">Emplacement</h3>
                    <p className="text-white/60">{businessInfo.address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/20 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-6 h-6 text-[#D4AF37]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">Horaires</h3>
                    <p className="text-white/60">
                      Lun-Ven: {businessInfo.hours.weekdays}<br />
                      Sam-Dim: {businessInfo.hours.weekends}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/20 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-6 h-6 text-[#D4AF37]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">Contact</h3>
                    <p className="text-white/60">{businessInfo.phone}<br />{businessInfo.email}</p>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button className="w-12 h-12 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/20 flex items-center justify-center hover:from-[#D4AF37] hover:to-[#FFD700] transition-all group">
                    <Instagram className="w-6 h-6 text-[#D4AF37] group-hover:text-black" />
                  </button>
                  <button className="w-12 h-12 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/20 flex items-center justify-center hover:from-[#D4AF37] hover:to-[#FFD700] transition-all group">
                    <Phone className="w-6 h-6 text-[#D4AF37] group-hover:text-black" />
                  </button>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative rounded-2xl overflow-hidden border border-[#D4AF37]/20 h-[400px]"
            >
              <div className="w-full h-full bg-gradient-to-br from-[#141414] to-[#1a1a1a] flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="w-16 h-16 text-[#D4AF37] mx-auto mb-4" />
                  <p className="text-white/60">Map Integration</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <footer className="py-12 bg-black border-t border-[#D4AF37]/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Scissors className="w-6 h-6 text-[#D4AF37]" />
              <span className="text-xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
                Elite Cuts
              </span>
            </div>
            <p className="text-white/40 text-center">
              © 2026 Elite Cuts. Expérience de Soins Premium.
            </p>
          </div>
        </div>
      </footer>

      {/* Floating Mobile Booking Button */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] z-40">
        <button
          onClick={() => setBookingOpen(true)}
          className="w-full py-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-2xl font-bold text-lg shadow-2xl shadow-[#D4AF37]/30 active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          <Calendar className="w-5 h-5" />
          Réserver Maintenant
        </button>
      </div>

      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
      {bookingOpen && <BookingModal onClose={() => setBookingOpen(false)} />}
    </div>
  );
}
