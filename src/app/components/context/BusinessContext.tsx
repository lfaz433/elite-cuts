import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from '../../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  query,
  orderBy
} from 'firebase/firestore';

export interface Service {
  id: string;
  name: string;
  price: string;
  duration: string;
  description: string;
  image: string;
}

export interface Barber {
  id: string;
  name: string;
  specialty: string;
  experience: string;
  rating: number;
  image: string;
  shiftStart?: string; // HH:MM
  shiftEnd?: string; // HH:MM
  workingDays?: number[]; // 0 = Sunday, 1 = Monday, etc.
  username?: string;
  password?: string;
  phone?: string;
  email?: string;
  archived?: boolean;
  commission?: number; // percentage
  status?: 'available' | 'busy' | 'break' | 'offline';
}

export interface Settlement {
  id: string;
  barberId: string;
  date: string;
  earnings: number; // Total generated (barber share)
  paid: number; // What barber actually took
  balance: number; // Remaining
  status: 'settled' | 'pending';
  createdAt: string;
}

export interface Attendance {
  id: string;
  barberId: string;
  date: string;
  checkInTime: string;
  location: string;
  status: 'on-time' | 'late';
}

export interface Booking {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  serviceId: string;
  barberId: string;
  date: string;
  time: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: string;
  pricePaid?: number;
  tip?: number;
  paymentMethod?: 'cash' | 'card';
}

export interface Product {
  id: string;
  name: string;
  buyPrice: number;
  sellPrice: number;
  image: string;
  description: string;
  stock?: number;
  category?: string;
  trackStock?: boolean;
}

export interface Sale {
  id: string;
  productId: string;
  sellerId: string;
  date: string;
  time: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
}

export interface BusinessInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  adminEmail?: string;
  adminPassword?: string;
  hours: {
    weekdays: string;
    weekends: string;
  };
  socials: {
    instagram?: string;
    facebook?: string;
  };
  latitude?: number;
  longitude?: number;
  // Branding / Landing Page
  logo?: string; // base64 or URL
  heroImage?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroButtonText?: string;
  stats?: {
    id: string;
    label: string;
    value: string;
    enabled: boolean;
  }[];
}

interface BusinessContextType {
  services: Service[];
  barbers: Barber[];
  bookings: Booking[];
  businessInfo: BusinessInfo;
  gallery: string[];
  products: Product[];
  sales: Sale[];
  attendance: Attendance[];
  settlements: Settlement[];
  loading: boolean;
  addAttendance: (attendance: Omit<Attendance, 'id'>) => Promise<void>;
  addSettlement: (settlement: Omit<Settlement, 'id' | 'createdAt'>) => Promise<void>;
  resetBarberBalance: (barberId: string) => Promise<void>;
  addService: (service: Omit<Service, 'id'>) => Promise<void>;
  updateService: (id: string, service: Partial<Service>) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  addBarber: (barber: Omit<Barber, 'id'>) => Promise<void>;
  updateBarber: (id: string, barber: Partial<Barber>) => Promise<void>;
  deleteBarber: (id: string) => Promise<void>;
  addBooking: (booking: Omit<Booking, 'id' | 'createdAt'> & { status?: Booking['status'] }) => Promise<void>;
  updateBookingStatus: (id: string, status: Booking['status']) => Promise<void>;
  updateBooking: (id: string, updated: Partial<Booking>) => Promise<void>;
  deleteBooking: (id: string) => Promise<void>;
  updateBusinessInfo: (info: Partial<BusinessInfo>) => Promise<void>;
  addToGallery: (url: string) => Promise<void>;
  removeFromGallery: (url: string) => Promise<void>;
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (id: string, updated: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addSale: (sale: Omit<Sale, 'id' | 'date' | 'time'>) => Promise<void>;
  seedDatabase: () => Promise<void>;
  updateBarberStatus: (id: string, status: Barber['status']) => Promise<void>;
  getAvailableBarbers: (date: string, time: string) => Barber[];
  getAvailableTimeSlots: (date: string, barberId: string) => string[];
}

// ... skipping to defaultServices
const defaultServices: Service[] = [
  {
    id: '1',
    name: 'Coupe cheveux et barbe',
    price: '15€',
    duration: '45 min',
    description: 'Coupe de cheveux professionnelle et entretien de la barbe',
    image: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&h=300&fit=crop',
  },
  {
    id: '2',
    name: 'Barbe',
    price: '7€',
    duration: '20 min',
    description: 'Entretien et taille de la barbe experte',
    image: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400&h=300&fit=crop',
  }
];

const defaultBarbers: Barber[] = [
  {
    id: '1',
    name: 'Marcus Johnson',
    specialty: 'Maître Barbier',
    experience: '12 ans',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop',
    shiftStart: '09:00',
    shiftEnd: '18:00',
    workingDays: [1, 2, 3, 4, 5, 6],
    username: 'marcus',
    password: 'password123',
    phone: '+33 6 12 34 56 78',
    email: 'barber@test.com',
    commission: 50,
    archived: false
  },
  {
    id: '2',
    name: 'Andre Williams',
    specialty: 'Spécialiste Dégradé',
    experience: '8 ans',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&h=300&fit=crop',
    shiftStart: '09:30',
    shiftEnd: '18:30',
    workingDays: [1, 2, 3, 4, 5],
    username: 'andre',
    password: 'password123',
    phone: '+33 6 87 65 43 21',
    email: 'andre@test.com',
    status: 'available',
    commission: 50
  }
];



const defaultBusinessInfo: BusinessInfo = {
  name: 'Elite Cuts',
  address: '123 Rue Premium, Centre Ville, 12345',
  phone: '+33 1 23 45 67 89',
  email: 'info@elitecuts.fr',
  adminEmail: 'admin@test.com',
  adminPassword: 'password123',
  hours: {
    weekdays: '9:00 - 20:00',
    weekends: '10:00 - 18:00',
  },
  socials: {
    instagram: 'elitecuts_officiel',
  },
  latitude: 48.8566,
  longitude: 2.3522,
  heroImage: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1920&h=1080&fit=crop',
  heroTitle: 'Soins Premium',
  heroSubtitle: 'Vivez une expérience de soins de luxe avec des maîtres barbiers dans un environnement premium',
  heroButtonText: 'Prendre Rendez-vous',
  stats: [
    { id: 'experience', label: "Années d'expérience", value: '15+', enabled: true },
    { id: 'clients', label: 'Clients Satisfaits', value: '10K+', enabled: true },
    { id: 'services', label: 'Services Réalisés', value: '50K+', enabled: true },
    { id: 'rating', label: 'Note des Clients', value: '4.9', enabled: true },
  ],
};

const defaultGallery = [
  'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=400&h=400&fit=crop',
];

const defaultProducts: Product[] = [
  {
    id: '1',
    name: 'Huile à Barbe Premium',
    buyPrice: 8.0,
    sellPrice: 19.99,
    image: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400&h=300&fit=crop',
    description: 'Nourrit et adoucit la barbe au quotidien.',
    stock: 25,
    category: 'Shampoo',
    trackStock: true
  },
  {
    id: '2',
    name: 'Pommade Coiffante',
    buyPrice: 6.5,
    sellPrice: 15.0,
    image: 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=400&h=300&fit=crop',
    description: 'Fixation forte avec un fini mat naturel.',
    stock: 40,
    category: 'Gel',
    trackStock: true
  }
];

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(defaultBusinessInfo);
  const [gallery, setGallery] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let loaded = 0;
    const total = 9;
    const markLoaded = () => { loaded++; if (loaded >= total) setLoading(false); };

    // Safety timeout — never stay loading forever
    const timeout = setTimeout(() => setLoading(false), 8000);

    // Real-time Listeners
    const unsubServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      setServices(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Service)));
      markLoaded();
    }, () => markLoaded());

    const unsubBarbers = onSnapshot(collection(db, 'barbers'), (snapshot) => {
      setBarbers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Barber)));
      markLoaded();
    }, () => markLoaded());

    const unsubBookings = onSnapshot(query(collection(db, 'bookings'), orderBy('createdAt', 'desc')), (snapshot) => {
      setBookings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
      markLoaded();
    }, () => markLoaded());

    const unsubInfo = onSnapshot(doc(db, 'business', 'info'), (doc) => {
      if (doc.exists()) setBusinessInfo(doc.data() as BusinessInfo);
      markLoaded();
    }, () => markLoaded());

    const unsubGallery = onSnapshot(collection(db, 'gallery'), (snapshot) => {
      setGallery(snapshot.docs.map(d => (d.data() as any).url));
      markLoaded();
    }, () => markLoaded());

    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      markLoaded();
    }, () => markLoaded());

    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('date', 'desc')), (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
      markLoaded();
    }, () => markLoaded());

    const unsubAttendance = onSnapshot(query(collection(db, 'attendance'), orderBy('date', 'desc')), (snapshot) => {
      setAttendance(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      markLoaded();
    }, () => markLoaded());

    const unsubSettlements = onSnapshot(query(collection(db, 'settlements'), orderBy('createdAt', 'desc')), (snapshot) => {
      setSettlements(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Settlement)));
      markLoaded();
    }, () => markLoaded());

    return () => {
      clearTimeout(timeout);
      unsubServices(); unsubBarbers(); unsubBookings(); unsubInfo();
      unsubGallery(); unsubProducts(); unsubSales(); unsubAttendance(); unsubSettlements();
    };
  }, []);

  const addService = async (service: Omit<Service, 'id'>) => {
    await addDoc(collection(db, 'services'), service);
  };

  const updateService = async (id: string, updated: Partial<Service>) => {
    await updateDoc(doc(db, 'services', id), updated);
  };

  const deleteService = async (id: string) => {
    await deleteDoc(doc(db, 'services', id));
  };

  const addBarber = async (barber: Omit<Barber, 'id'>) => {
    await addDoc(collection(db, 'barbers'), { ...barber, archived: false });
  };

  const updateBarber = async (id: string, updated: Partial<Barber>) => {
    await updateDoc(doc(db, 'barbers', id), updated);
  };

  const deleteBarber = async (id: string) => {
    await deleteDoc(doc(db, 'barbers', id));
  };

  const updateBarberStatus = async (id: string, status: Barber['status']) => {
    await updateDoc(doc(db, 'barbers', id), { status });
  };

  const addBooking = async (booking: Omit<Booking, 'id' | 'createdAt'> & { status?: Booking['status'] }) => {
    await addDoc(collection(db, 'bookings'), {
      ...booking,
      status: booking.status || 'pending',
      createdAt: new Date().toISOString(),
    });
  };

  const updateBookingStatus = async (id: string, status: Booking['status']) => {
    await updateDoc(doc(db, 'bookings', id), { status });
  };

  const updateBooking = async (id: string, updated: Partial<Booking>) => {
    await updateDoc(doc(db, 'bookings', id), updated);
  };

  const deleteBooking = async (id: string) => {
    await deleteDoc(doc(db, 'bookings', id));
  };

  const updateBusinessInfo = async (info: Partial<BusinessInfo>) => {
    await setDoc(doc(db, 'business', 'info'), { ...businessInfo, ...info }, { merge: true });
  };

  const addToGallery = async (url: string) => {
    await addDoc(collection(db, 'gallery'), { url });
  };

  const removeFromGallery = async (url: string) => {
    // Find the doc with this url
    const snap = gallery.find(g => g === url);
    // Note: This needs a more robust approach in production (searching by field)
    // For now we'll assume the user deletes via the UI which has access to the ID if we provided it.
  };

  const addProduct = async (product: Omit<Product, 'id'>) => {
    await addDoc(collection(db, 'products'), product);
  };

  const updateProduct = async (id: string, updated: Partial<Product>) => {
    await updateDoc(doc(db, 'products', id), updated);
  };

  const deleteProduct = async (id: string) => {
    await deleteDoc(doc(db, 'products', id));
  };

  const addSale = async (sale: Omit<Sale, 'id' | 'date' | 'time'>) => {
    await addDoc(collection(db, 'sales'), {
      ...sale,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0].substring(0, 5)
    });
  };

  const addAttendance = async (record: Omit<Attendance, 'id'>) => {
    await addDoc(collection(db, 'attendance'), record);
  };

  const addSettlement = async (settlement: Omit<Settlement, 'id' | 'createdAt'>) => {
    await addDoc(collection(db, 'settlements'), {
      ...settlement,
      createdAt: new Date().toISOString()
    });
  };

  const seedDatabase = async () => {
    // We will bypass checks to force generating data for testing.
    const hasServices = services.length > 0;
    const hasBarbers = barbers.length > 0;

    if (!hasServices) {
      for (const s of defaultServices) {
        const { id: _id, ...data } = s;
        await addDoc(collection(db, 'services'), data);
      }
    }
    if (!hasBarbers) {
      for (const b of defaultBarbers) {
        const { id: _id, ...data } = b;
        await addDoc(collection(db, 'barbers'), { ...data, archived: false });
      }
    }
    if (true) { // Force seed products
      for (const p of defaultProducts) {
        const { id: _id, ...data } = p;
        await addDoc(collection(db, 'products'), data);
      }
    }
    
    // Seed dummy bookings if services and barbers exist
    if (services.length > 0 && barbers.length > 0) {
      const statuses = ['completed', 'completed', 'completed', 'pending', 'approved'];
      for (let i = 0; i < 20; i++) {
        const d = new Date();
        d.setDate(d.getDate() - Math.floor(Math.random() * 14)); // Past 14 days
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const service = services[Math.floor(Math.random() * services.length)];
        const b: any = {
          clientName: `Client Test ${i+1}`,
          clientEmail: `client${i}@test.com`,
          clientPhone: '0600000000',
          serviceId: service.id,
          barberId: barbers[0].id,
          date: d.toISOString().split('T')[0],
          time: '14:00',
          status: status,
          createdAt: new Date().toISOString()
        };
        if (status === 'completed') {
          b.pricePaid = parseInt(service.price.replace(/[^0-9]/g, '')) || 15;
          b.tip = Math.floor(Math.random() * 5);
          b.paymentMethod = Math.random() > 0.5 ? 'cash' : 'card';
        }
        await addDoc(collection(db, 'bookings'), b);
      }
    }

    // Seed business info
    await setDoc(doc(db, 'business', 'info'), defaultBusinessInfo, { merge: true });
    
    // Notify user
    alert("Les données de test ont été générées avec succès !");
  };

  const resetBarberBalance = async (barberId: string) => {
    // In Firestore we can't easily bulk delete without fetching. 
    // We'll iterate through filtered settlements and delete them.
    const toDelete = settlements.filter(s => s.barberId === barberId);
    for (const s of toDelete) {
      await deleteDoc(doc(db, 'settlements', s.id));
    }
  };

  const getAvailableBarbers = (date: string, time: string, serviceId?: string) => {
    return barbers.filter(barber => {
      if (barber.archived || barber.status === 'offline' || barber.status === 'break') return false;

      const isBooked = bookings.some(b => {
        if (b.barberId !== barber.id || b.date !== date || b.status === 'rejected') return false;
        
        // Calculate overlap with buffer
        const bookingTime = new Date(`${date}T${b.time}`).getTime();
        const service = services.find(s => s.id === b.serviceId);
        const durationMin = service ? parseInt(service.duration) : 30;
        const bookingEndTime = bookingTime + (durationMin + 10) * 60000; // +10min buffer
        
        const requestedTime = new Date(`${date}T${time}`).getTime();
        const requestedDuration = serviceId ? (parseInt(services.find(s => s.id === serviceId)?.duration || '30')) : 30;
        const requestedEndTime = requestedTime + (requestedDuration + 10) * 60000;

        return (requestedTime < bookingEndTime && requestedEndTime > bookingTime);
      });
      
      return !isBooked;
    });
  };

  const getAvailableTimeSlots = (date: string, barberId: string, serviceId?: string) => {
    const baseSlots = [];
    for (let h = 9; h <= 18; h++) {
      baseSlots.push(`${h.toString().padStart(2, '0')}:00`);
      baseSlots.push(`${h.toString().padStart(2, '0')}:30`);
    }

    // Filter out past slots if the date is today
    const today = new Date().toISOString().split('T')[0];
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const filtered = date === today
      ? baseSlots.filter(slot => {
          const [h, m] = slot.split(':').map(Number);
          return h * 60 + m > nowMinutes + 30; // must be at least 30min in the future
        })
      : baseSlots;

    return filtered.filter(time => {
      if (barberId === 'any') {
        return getAvailableBarbers(date, time, serviceId).length > 0;
      }
      return getAvailableBarbers(date, time, serviceId).some(b => b.id === barberId);
    });
  };

  return (
    <BusinessContext.Provider value={{
      services, barbers, bookings, businessInfo, gallery, products, sales,
      attendance, settlements, loading,
      addService, updateService, deleteService,
      addBarber, updateBarber, deleteBarber,
      addBooking, updateBookingStatus, updateBooking, deleteBooking,
      updateBusinessInfo, addToGallery, removeFromGallery,
      addProduct, updateProduct, deleteProduct, addSale,
      addAttendance, addSettlement, resetBarberBalance, seedDatabase,
      updateBarberStatus,
      getAvailableBarbers, getAvailableTimeSlots
    }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusiness must be used within BusinessProvider');
  }
  return context;
}
