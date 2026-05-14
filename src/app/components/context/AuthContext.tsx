import { createContext, useContext, useState, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'client' | 'admin' | 'barber';
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, role: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('barbershop_user');
    return saved ? JSON.parse(saved) : null;
  });

  const login = (email: string, password: string, role: string) => {
    const mockUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: role === 'admin' ? 'Admin User' : role === 'barber' ? (email.split('@')[0]) : 'Client Name',
      email,
      role: role as 'client' | 'admin' | 'barber',
    };
    setUser(mockUser);
    localStorage.setItem('barbershop_user', JSON.stringify(mockUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('barbershop_user');
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
