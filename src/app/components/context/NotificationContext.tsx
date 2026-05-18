import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../../lib/firebase';
import { 
  collection, query, where, onSnapshot, orderBy, 
  limit, updateDoc, doc, writeBatch 
} from 'firebase/firestore';
import OneSignal from 'react-onesignal';

export type AppNotification = {
  id: string;
  recipientId: string;
  type: 'NEW_RESERVATION' | 'APPROVED' | 'REJECTED' | 'UPDATED' | 'CANCELLED';
  title: string;
  message: string;
  reservationId: string;
  read: boolean;
  createdAt: number;
  expiresAt: number;
};

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  permissionStatus: string;
  requestPermission: () => Promise<boolean>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Define your OneSignal App ID here
const ONESIGNAL_APP_ID = "812f9b44-12d9-4391-97b7-6f0b2798987d";

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<string>('default');
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize OneSignal
  useEffect(() => {
    const initOneSignal = async () => {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          safari_web_id: "web.onesignal.auto.184299bc-1c91-4dec-a5d4-b75cfd155372",
          allowLocalhostAsSecureOrigin: true, // Useful for testing on localhost
          notifyButton: {
            enable: false, // We'll use our custom modal instead of the floating bell
          },
        });
        
        setIsInitialized(true);
        
        // Listen for permission changes
        OneSignal.User.PushSubscription.addEventListener('change', (event) => {
           setPermissionStatus(event.current.optedIn ? 'granted' : 'denied');
        });

      } catch (error) {
        console.error("Error initializing OneSignal:", error);
      }
    };
    
    // Only init if we haven't already
    if (typeof window !== 'undefined' && !isInitialized) {
      initOneSignal();
    }
  }, [isInitialized]);

  // Login user to OneSignal when Auth changes
  useEffect(() => {
    if (isInitialized && user) {
      // Set external user ID so we can target them from the backend
      // Admin gets generic 'admin' ID, Barber gets barberId, Client gets their uid
      const externalId = user.role === 'admin' ? 'admin' : (user.barberId || user.uid);
      if (externalId) {
        OneSignal.login(externalId);
      }
    } else if (isInitialized && !user) {
      OneSignal.logout();
    }
  }, [user, isInitialized]);

  // Check initial permission status on load
  useEffect(() => {
    if (isInitialized) {
      const optedIn = OneSignal.User.PushSubscription.optedIn;
      if (optedIn) {
        setPermissionStatus('granted');
      } else {
        // Handle iOS Safari where Notification might be undefined
        const currentPermission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
        setPermissionStatus(currentPermission);
      }
    }
  }, [isInitialized]);

  const requestPermission = async () => {
    if (!isInitialized) return false;
    
    try {
      // For iOS Safari, native permission request is most reliable
      if (typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'default') {
         await window.Notification.requestPermission();
      }
      
      // Fallback/Sync with OneSignal API (v16)
      if (OneSignal.Notifications && OneSignal.Notifications.requestPermission) {
         await OneSignal.Notifications.requestPermission();
      }

      // Check if granted after prompt
      const hasPermission = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      setPermissionStatus(hasPermission ? 'granted' : 'denied');
      return hasPermission;
    } catch (e) {
      console.error("Permission request failed:", e);
      return false;
    }
  };

  // Sync internal UI notifications from Firestore
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const recipientId = user.role === 'admin' ? 'admin' : (user.barberId || user.uid);
    if (!recipientId) return;

    // Remove orderBy and limit from query to avoid Firebase Composite Index requirements
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', recipientId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: AppNotification[] = [];
      snapshot.forEach(doc => {
        notifs.push({ id: doc.id, ...doc.data() } as AppNotification);
      });
      // Sort in memory (newest first)
      notifs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      // Limit to 50 locally to prevent UI lag
      setNotifications(notifs.slice(0, 50));
    });

    return () => unsubscribe();
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;

    const batch = writeBatch(db);
    unread.forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });

    try {
      await batch.commit();
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      permissionStatus,
      requestPermission,
      markAsRead,
      markAllAsRead
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
