import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
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
  orderBy,
  where,
  getDocs,
  limit
} from 'firebase/firestore';
import { toast } from 'sonner';
import { useCallback } from 'react';
import { useTenant } from './TenantContext';

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
  phone?: string;
  email?: string;
  password?: string;
  mainServiceId?: string;
  secondaryServiceId?: string;
  archived?: boolean;
  commission?: number; // percentage
  commissionRate?: number;
  status?: 'available' | 'busy' | 'break' | 'offline';
}

export interface PayrollRequest {
  id: string;
  tenantId: string;
  barberId: string;
  barberName: string;
  amount: number;
  approvedAmount?: number;
  status: 'pending' | 'approved' | 'rejected';
  note?: string;
  requestedAt: number;
  processedAt?: number;
  processedBy?: string;
}

export interface PayrollPayment {
  id: string;
  tenantId: string;
  barberId: string;
  barberName: string;
  amount: number;
  requestId: string;
  paidAt: number;
  paidBy: string;
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
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'archived';
  createdAt: string;
  pricePaid?: number;
  tip?: number;
  paymentMethod?: 'cash' | 'card';
  notes?: string;
  paymentStatus?: 'paid' | 'unpaid';
  type?: 'avec-rdv' | 'sans-rdv';
  unreadAdmin?: boolean;
  unreadBarber?: boolean;
}

export interface Product {
  id: string;
  name: string;
  buyPrice: number;
  sellPrice: number;
  promoPrice?: number;
  image: string;
  description: string;
  stock?: number;
  category?: string;
  trackStock?: boolean;
  barcode?: string;
  lowStockThreshold?: number;
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
  customPrice?: number;
  discount?: number;
  paymentMethod?: 'cash' | 'card';
  notes?: string;
}

export interface DailyHours {
  isOpen: boolean;
  open: string;
  close: string;
}

export interface WeeklyHours {
  monday: DailyHours;
  tuesday: DailyHours;
  wednesday: DailyHours;
  thursday: DailyHours;
  friday: DailyHours;
  saturday: DailyHours;
  sunday: DailyHours;
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
  weeklyHours?: WeeklyHours;
  socials: {
    instagram?: string;
    facebook?: string;
  };
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  website?: string;
  mapUrl?: string;
  latitude?: number;
  longitude?: number;
  // Branding / Landing Page
  logo?: string; // base64 or URL
  heroImage?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroButtonText?: string;
  showStatsSection?: boolean;
  stats?: {
    id: string;
    label: string;
    value: string;
    enabled: boolean;
  }[];
}

export interface Expense {
  id: string;
  tenantId: string;
  title: string;
  amount: number;
  description?: string;
  category: 'facture' | 'materiel' | 'salaire' | 'achat' | 'autre';
  createdAt: number;
  createdBy: string; // admin user uid
  createdByName: string; // admin user name
}

export interface Deposit {
  id: string;
  tenantId: string;
  title: string;
  amount: number;
  category: 'fonds_caisse' | 'depot_especes' | 'remboursement' | 'autre';
  description?: string;
  createdAt: number;
  createdBy: string;
  createdByName: string;
}

export interface Campaign {
  id: string;
  title: string;
  description: string;
  couponCode?: string;
  discountAmount?: number;
  segment: 'all' | 'new' | 'inactive' | 'vip';
  status: 'active' | 'inactive';
  createdAt: string;
  tenantId: string;
}

export interface ClientNote {
  id: string;
  phone: string;
  notes: string;
  tenantId: string;
}

interface BusinessContextType {
  services: Service[];
  barbers: Barber[];
  bookings: Booking[];
  businessInfo: BusinessInfo;
  gallery: { id: string, url: string }[];
  products: Product[];
  sales: Sale[];
  attendance: Attendance[];
  settlements: Settlement[];
  expenses: Expense[];
  deposits: Deposit[];
  payrollRequests: PayrollRequest[];
  payrollPayments: PayrollPayment[];
  campaigns: Campaign[];
  registeredClients: any[];
  clientNotes: ClientNote[];
  addCampaign: (campaign: Omit<Campaign, 'id' | 'createdAt' | 'tenantId'>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  updateClientNote: (phone: string, notes: string) => Promise<void>;
  loading: boolean;
  getBarberWalletBalance: (barberId: string) => number;
  addAttendance: (attendance: Omit<Attendance, 'id'>) => Promise<void>;
  addSettlement: (settlement: Omit<Settlement, 'id' | 'createdAt'>) => Promise<void>;
  resetBarberBalance: (barberId: string) => Promise<void>;
  resetAllBalances: () => Promise<void>;
  addService: (service: Omit<Service, 'id'>) => Promise<void>;
  updateService: (id: string, service: Partial<Service>) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  addBarber: (barber: Omit<Barber, 'id'>) => Promise<void>;
  updateBarber: (id: string, barber: Partial<Barber>) => Promise<void>;
  deleteBarber: (id: string) => Promise<void>;
  addBooking: (booking: Omit<Booking, 'id' | 'createdAt'> & { status?: Booking['status'] }) => Promise<void>;
  updateBookingStatus: (id: string, status: Booking['status'], actor?: 'admin' | 'barber') => Promise<void>;
  updateBooking: (id: string, updated: Partial<Booking>) => Promise<void>;
  deleteBooking: (id: string) => Promise<void>;
  updateBusinessInfo: (info: Partial<BusinessInfo>) => Promise<void>;
  addToGallery: (url: string) => Promise<void>;
  removeFromGallery: (id: string) => Promise<void>;
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (id: string, updated: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addSale: (sale: Omit<Sale, 'id' | 'date' | 'time'>) => Promise<void>;
  addExpense: (expense: Omit<Expense, 'id' | 'tenantId' | 'createdAt'>) => Promise<void>;
  addDeposit: (deposit: Omit<Deposit, 'id' | 'tenantId' | 'createdAt'>) => Promise<void>;
  totalExpenses: number;
  totalDeposits: number;
  caisseBalance: number;
  seedDatabase: () => Promise<void>;
  sendPush: (recipientId: string, title: string, message: string, redirectUrl: string) => Promise<void>;
  updateBarberStatus: (id: string, status: Barber['status']) => Promise<void>;
  getAvailableBarbers: (date: string, time: string, serviceId?: string) => Barber[];
  getAvailableTimeSlots: (date: string, barberId: string, serviceId?: string) => string[];
}

const defaultBusinessInfo: BusinessInfo = {
  name: 'Mon Salon',
  address: '',
  phone: '',
  email: '',
  hours: {
    weekdays: '9:00 - 18:00',
    weekends: 'Fermé',
  },
  weeklyHours: {
    monday: { isOpen: true, open: '09:00', close: '19:00' },
    tuesday: { isOpen: true, open: '09:00', close: '19:00' },
    wednesday: { isOpen: true, open: '09:00', close: '19:00' },
    thursday: { isOpen: true, open: '09:00', close: '19:00' },
    friday: { isOpen: true, open: '09:00', close: '19:00' },
    saturday: { isOpen: true, open: '09:00', close: '18:00' },
    sunday: { isOpen: false, open: '09:00', close: '18:00' },
  },
  socials: {},
  showStatsSection: false,
};

export const toLocalYYYYMMDD = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { tenantId, subdomain } = useTenant();
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(defaultBusinessInfo);
  const [gallery, setGallery] = useState<{ id: string, url: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [payrollRequests, setPayrollRequests] = useState<PayrollRequest[]>([]);
  const [payrollPayments, setPayrollPayments] = useState<PayrollPayment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [registeredClients, setRegisteredClients] = useState<any[]>([]);
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(true);

  const sendPush = async (recipientId: string, title: string, message: string, redirectUrl: string) => {
    if (!recipientId) return;
    try {
      await fetch('/api/send-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer internal'
        },
        body: JSON.stringify({ recipientId, title, body: message, data: { url: redirectUrl } })
      });
    } catch (e) {
      console.error('Push failed silently:', e);
      // Never throw — push failures must never break main flow
    }
  };

  useEffect(() => {
    if (!tenantId) return;

    let loaded = 0;
    const total = 14;
    const essential = ['services', 'barbers', 'businessInfo'];
    const loadedEssential = new Set<string>();

    const markLoaded = (name?: string) => { 
      loaded++; 
      if (name && essential.includes(name)) loadedEssential.add(name);
      
      // Either all are loaded, or at least the essential ones are loaded
      if (loaded >= total || loadedEssential.size >= essential.length) {
        setLoading(false); 
      }
    };

    // Safety timeout — never stay loading forever
    const timeout = setTimeout(() => setLoading(false), 3000);

    // Real-time Listeners (Immediate)
    const unsubServices = onSnapshot(query(collection(db, 'services'), where('tenantId', '==', tenantId)), (snapshot) => {
      setServices(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Service)));
      markLoaded('services');
    }, () => markLoaded('services'));

    const unsubBarbers = onSnapshot(query(collection(db, 'barbers'), where('tenantId', '==', tenantId)), (snapshot) => {
      setBarbers(snapshot.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          ...data,
          commissionRate: Number(data.commissionRate || data.commission || 50),
          commission: Number(data.commissionRate || data.commission || 50),
        } as Barber;
      }));
      markLoaded('barbers');
    }, () => markLoaded('barbers'));

    // Business info is stored per-tenant under tenants/{tenantId}/businessInfo/info
    const unsubInfo = onSnapshot(doc(db, 'tenants', tenantId, 'businessInfo', 'info'), (snap) => {
      if (snap.exists()) setBusinessInfo(snap.data() as BusinessInfo);
      markLoaded('businessInfo');
    }, () => markLoaded('businessInfo'));

    const unsubBookings = onSnapshot(query(collection(db, 'bookings'), where('tenantId', '==', tenantId)), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setBookings(data);
      markLoaded();
    }, () => markLoaded());

    const unsubGallery = onSnapshot(query(collection(db, 'gallery'), where('tenantId', '==', tenantId)), (snapshot) => {
      setGallery(snapshot.docs.map(d => {
        const data = d.data() as any;
        // Support both 'url' and 'imageUrl' field names (seeded docs may use either)
        const resolvedUrl = typeof data.url === 'string' ? data.url
          : typeof data.imageUrl === 'string' ? data.imageUrl
          : '';
        return { id: d.id, url: resolvedUrl };
      }));
      markLoaded();
    }, () => markLoaded());

    const unsubProducts = onSnapshot(query(collection(db, 'products'), where('tenantId', '==', tenantId)), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      markLoaded();
    }, () => markLoaded());

    const unsubSales = onSnapshot(query(collection(db, 'sales'), where('tenantId', '==', tenantId)), (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
      markLoaded();
    }, () => markLoaded());

    const unsubAttendance = onSnapshot(query(collection(db, 'attendance'), where('tenantId', '==', tenantId)), (snapshot) => {
      setAttendance(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Attendance)));
      markLoaded();
    }, () => markLoaded());

    const unsubSettlements = onSnapshot(query(collection(db, 'settlements'), where('tenantId', '==', tenantId)), (snapshot) => {
      setSettlements(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Settlement)));
      markLoaded();
    }, () => markLoaded());

    const unsubExpenses = onSnapshot(query(collection(db, 'expenses'), where('tenantId', '==', tenantId)), (snapshot) => {
      setExpenses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Expense)));
      markLoaded();
    }, () => markLoaded());

    const unsubDeposits = onSnapshot(query(collection(db, 'deposits'), where('tenantId', '==', tenantId)), (snapshot) => {
      setDeposits(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Deposit)));
      markLoaded();
    }, () => markLoaded());

    const unsubPayrollReqs = onSnapshot(query(collection(db, 'payroll_requests'), where('tenantId', '==', tenantId)), (snapshot) => {
      setPayrollRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRequest)));
      markLoaded();
    }, () => markLoaded());

    const unsubPayrollPays = onSnapshot(query(collection(db, 'payroll_payments'), where('tenantId', '==', tenantId)), (snapshot) => {
      setPayrollPayments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PayrollPayment)));
      markLoaded();
    }, () => markLoaded());

    const unsubCampaigns = onSnapshot(query(collection(db, 'campaigns'), where('tenantId', '==', tenantId)), (snapshot) => {
      setCampaigns(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Campaign)));
      markLoaded();
    }, () => markLoaded());

    const unsubClients = onSnapshot(query(collection(db, 'users'), where('tenantId', '==', tenantId), where('role', '==', 'client')), (snapshot) => {
      setRegisteredClients(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      markLoaded();
    }, () => markLoaded());

    const unsubNotes = onSnapshot(query(collection(db, 'client_notes'), where('tenantId', '==', tenantId)), (snapshot) => {
      setClientNotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClientNote)));
      markLoaded();
    }, () => markLoaded());

    return () => {
      clearTimeout(timeout);
      unsubServices(); unsubBarbers(); unsubBookings(); unsubInfo();
      unsubGallery(); unsubProducts(); unsubSales(); unsubAttendance(); unsubSettlements(); unsubExpenses(); unsubDeposits();
      unsubPayrollReqs(); unsubPayrollPays(); unsubCampaigns(); unsubClients(); unsubNotes();
    };
  }, [tenantId]);



  const addService = async (service: Omit<Service, 'id'>) => {
    await addDoc(collection(db, 'services'), { ...service, tenantId });
  };

  const updateService = async (id: string, updated: Partial<Service>) => {
    await updateDoc(doc(db, 'services', id), updated);
  };

  const deleteService = async (id: string) => {
    await deleteDoc(doc(db, 'services', id));
  };

  const addBarber = async (barber: Omit<Barber, 'id'>) => {
    const cleanedBarber = {
      ...barber,
      email: barber.email?.trim().toLowerCase() || '',
      archived: false,
      tenantId
    };
    // Add a 35s timeout to allow slow connections to complete successfully
    await Promise.race([
      addDoc(collection(db, 'barbers'), cleanedBarber),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore Timeout")), 35000))
    ]);
  };

  const updateBarber = async (id: string, updated: Partial<Barber>) => {
    const cleanedUpdate = { ...updated };
    if (cleanedUpdate.email) {
      cleanedUpdate.email = cleanedUpdate.email.trim().toLowerCase();
    }
    await updateDoc(doc(db, 'barbers', id), cleanedUpdate);
  };

  const deleteBarber = async (id: string) => {
    await deleteDoc(doc(db, 'barbers', id));
  };

  const updateBarberStatus = async (id: string, status: Barber['status']) => {
    await updateDoc(doc(db, 'barbers', id), { status });
  };

  const addBooking = async (booking: Omit<Booking, 'id' | 'createdAt'> & { status?: Booking['status'] }) => {
    // Conflict prevention check for scheduled appointments (avec-rdv)
    if (booking.type !== 'sans-rdv') {
      const [bh, bm] = booking.time.split(':').map(Number);
      const startMin = bh * 60 + bm;
      const targetService = services.find(s => s.id === booking.serviceId);
      const duration = targetService ? parseInt(targetService.duration) : 30;
      const endMin = startMin + duration;

      const hasConflict = bookings.some(b => {
        if (b.barberId !== booking.barberId || b.date !== booking.date || b.status === 'rejected' || b.type === 'sans-rdv') return false;
        const [h, m] = b.time.split(':').map(Number);
        const bStart = h * 60 + m;
        const bService = services.find(s => s.id === b.serviceId);
        const bDuration = bService ? parseInt(bService.duration) : 30;
        const bEnd = bStart + bDuration;
        return (startMin < bEnd && endMin > bStart);
      });

      if (hasConflict) {
        throw new Error("ConflictError: Ce créneau est déjà réservé pour ce coiffeur.");
      }
    }

    const docRef = await addDoc(collection(db, 'bookings'), {
      ...booking,
      status: booking.status || 'pending',
      createdAt: new Date().toISOString(),
      unreadAdmin: true,
      unreadBarber: true,
      tenantId
    });

    try {
      const targetService = services.find(s => s.id === booking.serviceId);
      
      // 1. Write to Admin UI Notifications
      await addDoc(collection(db, 'notifications'), {
        recipientId: 'admin',
        type: 'NEW_RESERVATION',
        title: 'Nouvelle Réservation',
        message: `${booking.clientName} a réservé pour le ${booking.date} à ${booking.time}`,
        reservationId: docRef.id,
        read: false,
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
        tenantId
      });

      // 2. Write to Barber UI Notifications
      if (booking.barberId) {
        await addDoc(collection(db, 'notifications'), {
          recipientId: booking.barberId,
          type: 'NEW_RESERVATION',
          title: 'Nouvelle Réservation',
          message: `${booking.clientName} a réservé pour le ${booking.date} à ${booking.time}`,
          reservationId: docRef.id,
          read: false,
          createdAt: Date.now(),
          expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
          tenantId
        });
      }

      // 3. Send Push
      await sendPush(
        'admin',
        '📅 Nouvelle réservation',
        `${booking.clientName} — ${targetService?.name || 'Service'} le ${booking.date} à ${booking.time}`,
        `/admin/bookings`
      );
      
      if (booking.barberId && booking.barberId !== 'any') {
        await sendPush(
          booking.barberId,
          '📅 Nouveau rendez-vous',
          `${booking.clientName} — ${targetService?.name || 'Service'} le ${booking.date} à ${booking.time}`,
          `/barber/reservations`
        );
      }
    } catch (error) {
      console.error("Error creating booking notifications:", error);
    }
  };

  const updateBookingStatus = async (id: string, status: Booking['status'], actor?: 'admin' | 'barber') => {
    const updateData: any = { status };
    if (actor === 'admin') updateData.unreadBarber = true;
    if (actor === 'barber') updateData.unreadAdmin = true;
    await updateDoc(doc(db, 'bookings', id), updateData);

    try {
      const booking = bookings.find(b => b.id === id);
      if (booking && (status === 'approved' || status === 'rejected' || status === 'completed')) {
        const clientAlias = booking.clientId || booking.clientEmail || booking.clientPhone;
        
        // Write to Notifications
        if (clientAlias) {
          await addDoc(collection(db, 'notifications'), {
            recipientId: clientAlias,
            type: status.toUpperCase(),
            title: status === 'approved' ? 'Réservation Confirmée' : 'Réservation Rejetée',
            message: status === 'approved' ? `Votre rdv du ${booking.date} est confirmé!` : `Désolé, votre rdv a été rejeté.`,
            reservationId: id,
            read: false,
            createdAt: Date.now(),
            expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
            tenantId
          });
        }

        // Push Notifications
        try {
          if (status === 'approved' && booking.clientId) {
            await sendPush(
              booking.clientId,
              '✅ Réservation confirmée',
              `Votre réservation est confirmée pour le ${booking.date} à ${booking.time}`,
              `/client`
            );
          } else if (status === 'rejected' && booking.clientId) {
            await sendPush(
              booking.clientId,
              '❌ Réservation annulée',
              `Votre réservation du ${booking.date} à ${booking.time} a été annulée`,
              `/client`
            );
          } else if (status === 'completed') {
            await sendPush(
              booking.barberId,
              '💰 Service enregistré',
              `Service ${booking.pricePaid ? `€${booking.pricePaid}` : ''} ajouté à votre portefeuille`,
              `/barber/gains`
            );
          }
        } catch (e) {
          console.error("Error sending push on status update:", e);
        }
      }
    } catch (e) {
      console.error('Failed to trigger push notification:', e);
    }
  };

  const updateBooking = async (id: string, updated: Partial<Booking>) => {
    await updateDoc(doc(db, 'bookings', id), updated);
  };

  const deleteBooking = async (id: string) => {
    await deleteDoc(doc(db, 'bookings', id));
  };

  const updateBusinessInfo = async (info: Partial<BusinessInfo>) => {
    // Write to tenant-scoped path to keep each salon's data isolated
    await setDoc(doc(db, 'tenants', tenantId, 'businessInfo', 'info'), { ...businessInfo, ...info }, { merge: true });
  };

  const addToGallery = async (url: string) => {
    await addDoc(collection(db, 'gallery'), { url, tenantId });
  };

  const removeFromGallery = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'gallery', id));
    } catch (error) {
      console.error("Error removing from gallery:", error);
      throw error;
    }
  };

  const addProduct = async (product: Omit<Product, 'id'>) => {
    await addDoc(collection(db, 'products'), { ...product, tenantId });
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
      date: toLocalYYYYMMDD(new Date()),
      time: new Date().toTimeString().split(' ')[0].substring(0, 5),
      tenantId
    });
  };

  const addCampaign = async (campaign: Omit<Campaign, 'id' | 'createdAt' | 'tenantId'>) => {
    if (!tenantId) return;
    await addDoc(collection(db, 'campaigns'), {
      ...campaign,
      tenantId,
      createdAt: new Date().toISOString()
    });
  };

  const deleteCampaign = async (id: string) => {
    await deleteDoc(doc(db, 'campaigns', id));
  };

  const updateClientNote = async (phone: string, notes: string) => {
    if (!tenantId) return;
    const normalized = phone.replace(/[^0-9+]/g, '');
    if (!normalized) return;
    const docId = `${tenantId}_${normalized}`;
    await setDoc(doc(db, 'client_notes', docId), {
      phone: normalized,
      notes,
      tenantId
    });
  };

  const addExpense = async (expense: Omit<Expense, 'id' | 'tenantId' | 'createdAt'>) => {
    if (!tenantId) {
      toast.error("Erreur: Tenant non identifié.");
      return;
    }
    await addDoc(collection(db, 'expenses'), {
      ...expense,
      tenantId,
      createdAt: Date.now()
    });
  };

  const addDeposit = async (deposit: Omit<Deposit, 'id' | 'tenantId' | 'createdAt'>) => {
    if (!tenantId) {
      toast.error("Erreur: Tenant non identifié.");
      return;
    }
    await addDoc(collection(db, 'deposits'), {
      ...deposit,
      tenantId,
      createdAt: Date.now()
    });
  };

  const addAttendance = async (record: Omit<Attendance, 'id'>) => {
    await addDoc(collection(db, 'attendance'), { ...record, tenantId });
  };

  const addSettlement = async (settlement: Omit<Settlement, 'id' | 'createdAt'>) => {
    await addDoc(collection(db, 'settlements'), {
      ...settlement,
      tenantId,
      createdAt: new Date().toISOString()
    });
  };

  const seedDatabase = async () => {};

  const resetBarberBalance = async (barberId: string) => {
    try {
      const barberBookings = bookings.filter(b => b.barberId === barberId && (b.status === 'completed' || b.status === 'approved'));
      for (const b of barberBookings) {
        await updateDoc(doc(db, 'bookings', b.id), { status: 'archived' });
      }
    } catch (error) {
      console.error("Error resetting balance:", error);
      throw error;
    }
  };

  const resetAllBalances = async () => {
    try {
      const activeBookings = bookings.filter(b => b.status === 'completed' || b.status === 'approved');
      for (const b of activeBookings) {
        await updateDoc(doc(db, 'bookings', b.id), { status: 'archived' });
      }
    } catch (error) {
      console.error("Error resetting all balances:", error);
      throw error;
    }
  };

  const getAvailableBarbers = (date: string, time: string, serviceId?: string) => {
    const [year, month, day] = date.split('-').map(Number);
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayNames[dayOfWeek];

    const weeklyHours = businessInfo.weeklyHours || defaultBusinessInfo.weeklyHours;
    const dayHours = weeklyHours ? (weeklyHours as any)[dayKey] : null;
    const salonOpen = dayHours && dayHours.isOpen ? dayHours.open : '09:00';
    const salonClose = dayHours && dayHours.isOpen ? dayHours.close : '18:00';

    return barbers.filter(barber => {
      if (barber.archived || barber.status === 'offline' || barber.status === 'break') return false;

      // 1. Working Days Check
      const activeDays = barber.workingDays || [1, 2, 3, 4, 5, 6];
      if (!activeDays.includes(dayOfWeek)) return false;

      // 2. Working Hours (Shift) Check — support "+1" suffix for after-midnight shifts
      const shiftStartRaw = (barber.shiftStart || salonOpen).replace('+1', '');
      const shiftEndRaw = (barber.shiftEnd || salonClose).replace('+1', '');
      const isShiftEndNextDay = (barber.shiftEnd || salonClose).includes('+1');
      const [sh, sm] = shiftStartRaw.split(':').map(Number);
      const [eh, em] = shiftEndRaw.split(':').map(Number);
      const shiftStartMin = sh * 60 + sm;
      const shiftEndMin = isShiftEndNextDay ? (eh * 60 + em) + 24 * 60 : eh * 60 + em;

      const [rh, rm] = time.split(':').map(Number);
      let slotStartMin = rh * 60 + rm;
      const targetService = serviceId ? services.find(s => s.id === serviceId) : null;
      const duration = targetService ? parseInt(targetService.duration) : 30;
      // If shift crosses midnight and slot time is before shift start, it's a next-day slot
      if (isShiftEndNextDay && slotStartMin < shiftStartMin) slotStartMin += 24 * 60;
      const slotEndMin = slotStartMin + duration;

      if (slotStartMin < shiftStartMin || slotEndMin > shiftEndMin) return false;

      // 3. Multi-Service Selection Enforcer (main & secondary service check)
      if (serviceId && barber.mainServiceId) {
        if (barber.mainServiceId !== serviceId && barber.secondaryServiceId !== serviceId) {
          return false;
        }
      }

      // 4. Overlap & Conflict Reservation Checking
      const isBooked = bookings.some(b => {
        if (b.barberId !== barber.id || b.date !== date || b.status === 'rejected' || b.type === 'sans-rdv') return false;
        const [bh, bm] = b.time.split(':').map(Number);
        const bStart = bh * 60 + bm;
        const bService = services.find(s => s.id === b.serviceId);
        const bDuration = bService ? parseInt(bService.duration) : 30;
        const bEnd = bStart + bDuration;
        return (slotStartMin < bEnd && slotEndMin > bStart);
      });

      return !isBooked;
    });
  };

  const getAvailableTimeSlots = (date: string, barberId: string, serviceId?: string) => {
    const [year, month, day] = date.split('-').map(Number);
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayNames[dayOfWeek];

    const weeklyHours = businessInfo.weeklyHours || defaultBusinessInfo.weeklyHours;
    const dayHours = weeklyHours ? (weeklyHours as any)[dayKey] : null;

    if (!dayHours || !dayHours.isOpen) {
      return []; // Salon is closed on this day
    }

    const baseSlots: string[] = [];
    // Parse open/close times — support "+1" suffix for after-midnight (next day)
    const openRaw = (dayHours.open || '09:00').replace('+1', '');
    const closeRaw = (dayHours.close || '19:00').replace('+1', '');
    const isCloseNextDay = (dayHours.close || '').includes('+1');
    const [openH, openM] = openRaw.split(':').map(Number);
    const [closeH, closeM] = closeRaw.split(':').map(Number);
    const startMin = openH * 60 + openM;
    const endMin = isCloseNextDay ? (closeH * 60 + closeM) + 24 * 60 : closeH * 60 + closeM;

    // Use service duration as the slot generation interval step (Option A)
    const targetService = serviceId ? services.find(s => s.id === serviceId) : null;
    const duration = targetService ? parseInt(targetService.duration) : 30;
    const stepMin = duration > 0 ? duration : 30;

    for (let m = startMin; m + stepMin <= endMin; m += stepMin) {
      const actualH = Math.floor(m / 60) % 24;
      const actualM = m % 60;
      baseSlots.push(`${actualH.toString().padStart(2, '0')}:${actualM.toString().padStart(2, '0')}`);
    }

    // Filter out past slots if the date is today
    const today = toLocalYYYYMMDD(new Date());
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const filtered = date === today
      ? baseSlots.filter(slot => {
          const [h, m] = slot.split(':').map(Number);
          let slotMin = h * 60 + m;
          // If the slot wraps past midnight (e.g. 01:00), treat it as next-day for "past" filtering
          if (isCloseNextDay && slotMin < startMin) slotMin += 24 * 60;
          return slotMin > nowMinutes + 30; // must be at least 30min in the future
        })
      : baseSlots;

    return filtered.filter(time => {
      if (barberId === 'any') {
        return getAvailableBarbers(date, time, serviceId).length > 0;
      }
      return getAvailableBarbers(date, time, serviceId).some(b => b.id === barberId);
    });
  };

  const totalExpenses = useMemo(() => {
    return expenses
      .filter(e => e.category !== 'salaire' && !e.isPayroll)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const totalDeposits = useMemo(() => {
    return deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  }, [deposits]);

  const totalRevenus = useMemo(() => {
    // Service revenue (pricePaid + tips — all goes to caisse)
    const serviceRev = (bookings || [])
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + Number(b.pricePaid || 0) + Number(b.tip || 0), 0);
    
    // Product revenue (100% to salon)
    const productRev = (sales || []).reduce((sum, s) => {
      const price = s.amount != null ? s.amount : 
                    (s.customPrice != null ? s.customPrice : (s.sellPrice || 0));
      const qty = Number(s.quantity || 1);
      const disc = Number(s.discount || 0);
      return sum + (price * qty * (1 - disc / 100));
    }, 0);
    
    return serviceRev + productRev;
  }, [bookings, sales]);

  const totalDepenses = useMemo(() => {
    return (expenses || [])
      .filter(e => e.category !== 'salaire' && !e.isPayroll)
      .reduce((sum, e) => {
        return sum + Number(e.amount || 0);
      }, 0);
  }, [expenses]);

  const caisseBalance = useMemo(() => {
    const totalPaidPayroll = (payrollPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    return totalRevenus + totalDeposits - totalDepenses - totalPaidPayroll;
  }, [totalRevenus, totalDeposits, totalDepenses, payrollPayments]);

  const completedBookings = useMemo(() => {
    // Only 'completed' bookings represent real paid revenue — 'approved' are pending appointments
    return bookings.filter(b => b.status === 'completed');
  }, [bookings]);

  const totalSales = useMemo(() => {
    const serviceRev = completedBookings.reduce((sum, b) => sum + (b.pricePaid || 0), 0);
    const productRev = sales.reduce((sum, s) => sum + (s.sellPrice * s.quantity), 0);
    return serviceRev + productRev;
  }, [completedBookings, sales]);

  const totalTips = useMemo(() => {
    return completedBookings.reduce((sum, b) => sum + (b.tip || 0), 0);
  }, [completedBookings]);

  const getBarberWalletBalance = (barberId: string): number => {
    const barber = barbers.find(b => b.id === barberId);
    const rate = (barber?.commissionRate || 50) / 100;
    
    const earned = (bookings || [])
      .filter(b => b.barberId === barberId && b.status === 'completed')
      .reduce((sum, b) => {
        const commission = Number(b.pricePaid || 0) * rate;
        const tip = Number(b.tip || 0);
        return sum + commission + tip;
      }, 0);

    const paid = (payrollPayments || [])
      .filter(p => p.barberId === barberId)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    return earned - paid;
  };

  const value = useMemo(() => ({
    services, barbers, bookings, businessInfo, gallery, products, sales,
    attendance, settlements, expenses, deposits, payrollRequests, payrollPayments, loading,
    campaigns, registeredClients, addCampaign, deleteCampaign,
    clientNotes, updateClientNote,
    addService, updateService, deleteService,
    addBarber, updateBarber, deleteBarber,
    addBooking, updateBookingStatus, updateBooking, deleteBooking,
    updateBusinessInfo, addToGallery, removeFromGallery,
    addProduct, updateProduct, deleteProduct,
    addSale, addExpense, addDeposit,
    totalExpenses, totalDeposits, caisseBalance, seedDatabase,
    sendPush,
    addAttendance, addSettlement, resetBarberBalance, resetAllBalances,
    updateBarberStatus,
    getAvailableBarbers, getAvailableTimeSlots, getBarberWalletBalance
  }), [
    services, barbers, bookings, businessInfo, gallery, products, sales,
    attendance, settlements, expenses, deposits, payrollRequests, payrollPayments, loading, totalExpenses, totalDeposits, caisseBalance,
    campaigns, registeredClients, clientNotes
  ]);

  return (
    <BusinessContext.Provider value={value}>
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
