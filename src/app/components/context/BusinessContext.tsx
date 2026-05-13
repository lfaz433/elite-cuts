import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
}

interface BusinessContextType {
  services: Service[];
  barbers: Barber[];
  bookings: Booking[];
  businessInfo: BusinessInfo;
  gallery: string[];
  products: Product[];
  sales: Sale[];
  addService: (service: Omit<Service, 'id'>) => void;
  updateService: (id: string, service: Partial<Service>) => void;
  deleteService: (id: string) => void;
  addBarber: (barber: Omit<Barber, 'id'>) => void;
  updateBarber: (id: string, barber: Partial<Barber>) => void;
  deleteBarber: (id: string) => void;
  addBooking: (booking: Omit<Booking, 'id' | 'createdAt'> & { status?: Booking['status'] }) => void;
  updateBookingStatus: (id: string, status: Booking['status']) => void;
  updateBooking: (id: string, updated: Partial<Booking>) => void;
  deleteBooking: (id: string) => void;
  updateBusinessInfo: (info: Partial<BusinessInfo>) => void;
  addToGallery: (url: string) => void;
  removeFromGallery: (url: string) => void;
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, updated: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  addSale: (sale: Omit<Sale, 'id' | 'date' | 'time'>) => void;
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
  },
  {
    id: '2',
    name: 'Andre Williams',
    specialty: 'Spécialiste Dégradé',
    experience: '8 ans',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&h=300&fit=crop',
  },
];

const defaultBusinessInfo: BusinessInfo = {
  name: 'Elite Cuts',
  address: '123 Rue Premium, Centre Ville, 12345',
  phone: '+33 1 23 45 67 89',
  email: 'info@elitecuts.fr',
  adminEmail: 'admin@elitecuts.fr',
  adminPassword: 'admin',
  hours: {
    weekdays: '9:00 - 20:00',
    weekends: '10:00 - 18:00',
  },
  socials: {
    instagram: 'elitecuts_officiel',
  },
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
  },
  {
    id: '2',
    name: 'Pommade Coiffante',
    buyPrice: 6.5,
    sellPrice: 15.0,
    image: 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=400&h=300&fit=crop',
    description: 'Fixation forte avec un fini mat naturel.',
    stock: 40,
  }
];

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Service[]>(() => {
    const saved = localStorage.getItem('barbershop_services');
    return saved ? JSON.parse(saved) : defaultServices;
  });

  const [barbers, setBarbers] = useState<Barber[]>(() => {
    const saved = localStorage.getItem('barbershop_barbers');
    return saved ? JSON.parse(saved) : defaultBarbers;
  });

  const [bookings, setBookings] = useState<Booking[]>(() => {
    const saved = localStorage.getItem('barbershop_bookings');
    return saved ? JSON.parse(saved) : [];
  });

  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(() => {
    const saved = localStorage.getItem('barbershop_info');
    return saved ? JSON.parse(saved) : defaultBusinessInfo;
  });

  const [gallery, setGallery] = useState<string[]>(() => {
    const saved = localStorage.getItem('barbershop_gallery');
    return saved ? JSON.parse(saved) : defaultGallery;
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('barbershop_products');
    return saved ? JSON.parse(saved) : defaultProducts;
  });

  const [sales, setSales] = useState<Sale[]>(() => {
    const saved = localStorage.getItem('barbershop_sales');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('barbershop_services', JSON.stringify(services));
  }, [services]);

  useEffect(() => {
    localStorage.setItem('barbershop_barbers', JSON.stringify(barbers));
  }, [barbers]);

  useEffect(() => {
    localStorage.setItem('barbershop_bookings', JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    localStorage.setItem('barbershop_info', JSON.stringify(businessInfo));
  }, [businessInfo]);

  useEffect(() => {
    localStorage.setItem('barbershop_gallery', JSON.stringify(gallery));
  }, [gallery]);

  useEffect(() => {
    localStorage.setItem('barbershop_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('barbershop_sales', JSON.stringify(sales));
  }, [sales]);

  const addService = (service: Omit<Service, 'id'>) => {
    const newService = { ...service, id: Math.random().toString(36).substr(2, 9) };
    setServices([...services, newService]);
  };

  const updateService = (id: string, updated: Partial<Service>) => {
    setServices(services.map(s => s.id === id ? { ...s, ...updated } : s));
  };

  const deleteService = (id: string) => {
    setServices(services.filter(s => s.id !== id));
  };

  const addBarber = (barber: Omit<Barber, 'id'>) => {
    const newBarber = { ...barber, id: Math.random().toString(36).substr(2, 9) };
    setBarbers([...barbers, newBarber]);
  };

  const updateBarber = (id: string, updated: Partial<Barber>) => {
    setBarbers(barbers.map(b => b.id === id ? { ...b, ...updated } : b));
  };

  const deleteBarber = (id: string) => {
    setBarbers(barbers.filter(b => b.id !== id));
  };

  const addBooking = (booking: Omit<Booking, 'id' | 'createdAt'> & { status?: Booking['status'] }) => {
    const newBooking: Booking = {
      ...booking,
      id: Math.random().toString(36).substr(2, 9),
      status: booking.status || 'pending',
      createdAt: new Date().toISOString(),
    };
    setBookings([newBooking, ...bookings]);
  };

  const updateBookingStatus = (id: string, status: Booking['status']) => {
    setBookings(bookings.map(b => b.id === id ? { ...b, status } : b));
  };

  const updateBooking = (id: string, updated: Partial<Booking>) => {
    setBookings(bookings.map(b => b.id === id ? { ...b, ...updated } : b));
  };

  const deleteBooking = (id: string) => {
    setBookings(bookings.filter(b => b.id !== id));
  };

  const updateBusinessInfo = (info: Partial<BusinessInfo>) => {
    setBusinessInfo({ ...businessInfo, ...info });
  };

  const addToGallery = (url: string) => {
    setGallery([...gallery, url]);
  };

  const removeFromGallery = (url: string) => {
    setGallery(gallery.filter(g => g !== url));
  };

  const addProduct = (product: Omit<Product, 'id'>) => {
    const newProduct = { ...product, id: Math.random().toString(36).substr(2, 9) };
    setProducts([...products, newProduct]);
  };

  const updateProduct = (id: string, updated: Partial<Product>) => {
    setProducts(products.map(p => p.id === id ? { ...p, ...updated } : p));
  };

  const deleteProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  const addSale = (sale: Omit<Sale, 'id' | 'date' | 'time'>) => {
    const newSale: Sale = {
      ...sale,
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0].substring(0, 5)
    };
    setSales([newSale, ...sales]);
  };

  return (
    <BusinessContext.Provider value={{
      services, barbers, bookings, businessInfo, gallery, products, sales,
      addService, updateService, deleteService,
      addBarber, updateBarber, deleteBarber,
      addBooking, updateBookingStatus, updateBooking, deleteBooking,
      updateBusinessInfo, addToGallery, removeFromGallery,
      addProduct, updateProduct, deleteProduct, addSale
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
