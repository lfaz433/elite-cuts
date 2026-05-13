import { useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, User, Star, Heart, LogOut, Settings, History, CreditCard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router';

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('bookings');

  const upcomingBookings = [
    {
      id: 1,
      service: 'Premium Haircut',
      barber: 'Marcus Johnson',
      date: '2026-05-15',
      time: '10:00 AM',
      price: '€35',
      status: 'confirmed',
    },
    {
      id: 2,
      service: 'Beard Trim',
      barber: 'Andre Williams',
      date: '2026-05-20',
      time: '2:00 PM',
      price: '€20',
      status: 'pending',
    },
  ];

  const pastBookings = [
    {
      id: 3,
      service: 'Executive Fade',
      barber: 'David Chen',
      date: '2026-04-10',
      time: '3:00 PM',
      price: '€40',
      rating: 5,
    },
    {
      id: 4,
      service: 'Premium Haircut',
      barber: 'Marcus Johnson',
      date: '2026-03-22',
      time: '11:00 AM',
      price: '€35',
      rating: 5,
    },
  ];

  const favoriteBarbers = [
    { name: 'Marcus Johnson', visits: 12, image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop' },
    { name: 'David Chen', visits: 8, image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop' },
  ];

  const loyaltyPoints = 450;
  const nextReward = 500;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-[#0f0f0f] border-b border-[#D4AF37]/20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
            Elite Cuts
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-white">{user?.name}</p>
              <p className="text-white/40 text-sm">Client Account</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5 text-white/60" />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#FFD700] flex items-center justify-center mx-auto mb-4">
                <User className="w-10 h-10 text-black" />
              </div>
              <h3 className="text-center text-white mb-1">{user?.name}</h3>
              <p className="text-center text-white/60 text-sm mb-4">{user?.email}</p>
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/60 text-sm">Loyalty Points</span>
                  <span className="text-[#D4AF37]">{loyaltyPoints}</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2 mb-1">
                  <div
                    className="bg-gradient-to-r from-[#D4AF37] to-[#FFD700] h-2 rounded-full"
                    style={{ width: `${(loyaltyPoints / nextReward) * 100}%` }}
                  />
                </div>
                <p className="text-white/40 text-xs text-center">{nextReward - loyaltyPoints} points to next reward</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-2"
            >
              {[
                { id: 'bookings', icon: Calendar, label: 'My Bookings' },
                { id: 'history', icon: History, label: 'History' },
                { id: 'favorites', icon: Heart, label: 'Favorites' },
                { id: 'settings', icon: Settings, label: 'Settings' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black'
                      : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  <tab.icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </motion.div>
          </div>

          <div className="lg:col-span-3">
            {activeTab === 'bookings' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-bold text-white">Upcoming Bookings</h2>
                  <button
                    onClick={() => navigate('/')}
                    className="px-6 py-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all"
                  >
                    Book New
                  </button>
                </div>

                <div className="space-y-4">
                  {upcomingBookings.map((booking) => (
                    <motion.div
                      key={booking.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-white mb-1">{booking.service}</h3>
                          <p className="text-white/60 flex items-center gap-2">
                            <User className="w-4 h-4" />
                            {booking.barber}
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-sm ${
                            booking.status === 'confirmed'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          {booking.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="flex items-center gap-2 text-white/60">
                          <Calendar className="w-4 h-4 text-[#D4AF37]" />
                          {booking.date}
                        </div>
                        <div className="flex items-center gap-2 text-white/60">
                          <Clock className="w-4 h-4 text-[#D4AF37]" />
                          {booking.time}
                        </div>
                        <div className="flex items-center gap-2 text-white/60">
                          <CreditCard className="w-4 h-4 text-[#D4AF37]" />
                          {booking.price}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">
                          Reschedule
                        </button>
                        <button className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-bold text-white">Booking History</h2>
                <div className="space-y-4">
                  {pastBookings.map((booking) => (
                    <motion.div
                      key={booking.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-white mb-1">{booking.service}</h3>
                          <p className="text-white/60 mb-2 flex items-center gap-2">
                            <User className="w-4 h-4" />
                            {booking.barber}
                          </p>
                          <div className="flex items-center gap-4 text-white/60 text-sm">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4 text-[#D4AF37]" />
                              {booking.date}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4 text-[#D4AF37]" />
                              {booking.time}
                            </span>
                            <span className="flex items-center gap-1">
                              <CreditCard className="w-4 h-4 text-[#D4AF37]" />
                              {booking.price}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-[#FFD700] mb-2">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-5 h-5 ${i < booking.rating ? 'fill-current' : ''}`}
                              />
                            ))}
                          </div>
                          <button className="text-[#D4AF37] text-sm hover:underline">Book Again</button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'favorites' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-bold text-white">Favorite Barbers</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  {favoriteBarbers.map((barber, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                    >
                      <div className="flex items-center gap-4 mb-4">
                        <img
                          src={barber.image}
                          alt={barber.name}
                          className="w-16 h-16 rounded-full object-cover border-2 border-[#D4AF37]"
                        />
                        <div>
                          <h3 className="text-xl font-bold text-white">{barber.name}</h3>
                          <p className="text-white/60">{barber.visits} visits</p>
                        </div>
                      </div>
                      <button className="w-full px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all">
                        Book with {barber.name.split(' ')[0]}
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-bold text-white">Account Settings</h2>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                >
                  <div className="space-y-4">
                    <div>
                      <label className="block text-white mb-2">Full Name</label>
                      <input
                        type="text"
                        value={user?.name}
                        className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                        readOnly
                      />
                    </div>
                    <div>
                      <label className="block text-white mb-2">Email</label>
                      <input
                        type="email"
                        value={user?.email}
                        className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                        readOnly
                      />
                    </div>
                    <div>
                      <label className="block text-white mb-2">Phone Number</label>
                      <input
                        type="tel"
                        placeholder="+1 (555) 000-0000"
                        className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                      />
                    </div>
                    <button className="w-full px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all">
                      Save Changes
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
