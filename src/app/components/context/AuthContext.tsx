import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';

// Forced correct key for bootstrap
const CORRECT_API_KEY = "AIzaSyB455BHQ7ZIAcO0jwXYbYuzlcvXKt2Qpx4";

interface User {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: 'client' | 'admin' | 'barber';
  barberId?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);
      if (firebaseUser) {
        // Fetch additional profile data from Firestore
        try {
          // 1. Check if user is an admin
          let adminEmail = 'admin@test.com';
          try {
            const bizDoc = await getDoc(doc(db, 'settings', 'business'));
            if (bizDoc.exists()) adminEmail = bizDoc.data()?.adminEmail || 'admin@test.com';
          } catch (e) {
            console.warn("Could not fetch admin settings, using fallback", e);
          }
          const isAdmin = firebaseUser.email === adminEmail;

          // 2. Check if user is a barber (email matches a barber document)
          const barberQ = query(collection(db, 'barbers'), where('email', '==', firebaseUser.email), where('archived', '==', false));
          const barberSnap = await getDocs(barberQ);
          const isBarber = !barberSnap.empty;
          const barberData = isBarber ? barberSnap.docs[0].data() : null;
          const barberId = isBarber ? barberSnap.docs[0].id : undefined;

          // 3. Get profile from 'users' collection
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const userData = userDoc.exists() ? userDoc.data() : {};

          const resolvedRole = isAdmin ? 'admin' : (isBarber ? 'barber' : (userData.role || 'client'));
          
          console.log("Auth State Resolved:", { 
            email: firebaseUser.email, 
            isAdmin, 
            isBarber, 
            resolvedRole 
          });

          setUser({
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: userData.name || barberData?.name || firebaseUser.displayName || 'Administrateur',
            role: resolvedRole as 'admin' | 'barber' | 'client',
            barberId: barberId
          });
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signup = async (email: string, password: string, name: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    await updateProfile(firebaseUser, { displayName: name });
    
    // Create profile in Firestore
    const profile = {
      uid: firebaseUser.uid,
      email,
      name,
      role: 'client', // Default role for new signups
      createdAt: new Date().toISOString()
    };
    
    await setDoc(doc(db, 'users', firebaseUser.uid), profile);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
