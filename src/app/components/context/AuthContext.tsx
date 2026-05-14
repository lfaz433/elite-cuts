import { createContext, useContext, useState, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'client' | 'admin' | 'barber';
  barberId?: string; // for barber role: the Firestore barber document ID
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, role: string, name?: string, barberId?: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('barbershop_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const login = (email: string, _password: string, role: string, name?: string, barberId?: string) => {
    const resolvedName = name || email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const newUser: User = {
      id: barberId || Math.random().toString(36).substr(2, 9),
      name: resolvedName,
      email,
      role: role as 'client' | 'admin' | 'barber',
      barberId,
    };
    setUser(newUser);
    try {
      localStorage.setItem('barbershop_user', JSON.stringify(newUser));
    } catch {
      // localStorage might be full
    }
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem('barbershop_user');
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
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
