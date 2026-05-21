import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../../lib/firebase';
import { 
  collection, query, where, onSnapshot, orderBy, 
  limit, updateDoc, doc, writeBatch, getDocs 
} from 'firebase/firestore';
import OneSignal from 'react-onesignal';
import { useTenant } from './TenantContext';

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
  const { tenantId } = useTenant();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<string>('default');
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize OneSignal
  useEffect(() => {
    const initOneSignal = async () => {
      if (typeof window === 'undefined') return;
      if ((window as any).__onesignal_initialized) return;
      (window as any).__onesignal_initialized = true;

      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          safari_web_id: "web.onesignal.auto.184299bc-1c91-4dec-a5d4-b75cfd155372",
          allowLocalhostAsSecureOrigin: true, // Useful for testing on localhost
          notifyButton: {
            enable: false, // We'll use our custom modal instead of the floating bell
          },
          serviceWorkerParam: { scope: "/" },
        });
        
        setIsInitialized(true);
        
        // Listen for permission changes
        OneSignal.User.PushSubscription.addEventListener('change', (event) => {
           setPermissionStatus(event.current.optedIn ? 'granted' : 'denied');
        });

      } catch (error) {
        console.error("Error initializing OneSignal:", error);
        (window as any).__onesignal_initialized = false; // allow retry
      }
    };
    
    if (typeof window !== 'undefined') {
      initOneSignal();
    }
  }, []);

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

  // Check initial permission status on load (even before OneSignal finishes initializing)
  useEffect(() => {
    const checkPermissionStatus = () => {
      if (isInitialized) {
        const optedIn = OneSignal.User.PushSubscription.optedIn;
        if (optedIn) {
          setPermissionStatus('granted');
          return;
        }
      }
      // Handle iOS Safari where Notification might be undefined
      const currentPermission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
      setPermissionStatus(currentPermission);
    };

    checkPermissionStatus();
  }, [isInitialized]);

  const requestPermission = async () => {
    try {
      let hasPermission = false;

      // 1. Try standard browser Notification request if available
      if (typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'default') {
         const status = await window.Notification.requestPermission();
         hasPermission = status === 'granted';
      } else if (typeof window !== 'undefined' && window.Notification) {
         hasPermission = window.Notification.permission === 'granted';
      }
      
      // 2. If OneSignal is initialized, request permission and sync with OneSignal
      if (isInitialized) {
        if (OneSignal.Notifications && OneSignal.Notifications.requestPermission) {
           await OneSignal.Notifications.requestPermission();
        }
        
        if (OneSignal.Notifications) {
           hasPermission = OneSignal.Notifications.permission;
        }
      }
      
      setPermissionStatus(hasPermission ? 'granted' : 'denied');
      return hasPermission;
    } catch (e) {
      console.error("Permission request failed:", e);
      return false;
    }
  };

  // Sync internal UI notifications from Firestore
  useEffect(() => {
    if (!tenantId) return;
    if (!user) {
      setNotifications([]);
      return;
    }

    const recipientId = user.role === 'admin' ? 'admin' : (user.barberId || user.uid);
    if (!recipientId) return;

    // Merge and deduplicate notifications from both snapshots
    const mergeAndSet = (byUid: AppNotification[], byEmail: AppNotification[]) => {
      const seen = new Set<string>();
      const merged: AppNotification[] = [];
      for (const n of [...byUid, ...byEmail]) {
        if (!seen.has(n.id)) {
          seen.add(n.id);
          merged.push(n);
        }
      }
      // Fix 1: filter expired notifications
      const valid = merged.filter(n => !n.expiresAt || n.expiresAt > Date.now());
      // Sort in memory (newest first)
      valid.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      // Limit to 50 locally to prevent UI lag
      setNotifications(valid.slice(0, 50));
    };

    let byUidNotifs: AppNotification[] = [];
    let byEmailNotifs: AppNotification[] = [];

    // Primary query: match by uid / 'admin' / barberId
    const qByUid = query(
      collection(db, 'notifications'),
      where('recipientId', '==', recipientId),
      where('tenantId', '==', tenantId)
    );

    const unsubUid = onSnapshot(qByUid, (snapshot) => {
      byUidNotifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
      mergeAndSet(byUidNotifs, byEmailNotifs);
    });

    // Fix 2: Secondary query for client users — match by email to catch guest-booking notifications
    let unsubEmail: (() => void) | null = null;
    if (user.role === 'client' && user.email) {
      const qByEmail = query(
        collection(db, 'notifications'),
        where('recipientId', '==', user.email),
        where('tenantId', '==', tenantId)
      );
      unsubEmail = onSnapshot(qByEmail, (snapshot) => {
        byEmailNotifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
        mergeAndSet(byUidNotifs, byEmailNotifs);
      });
    }

    return () => {
      unsubUid();
      if (unsubEmail) unsubEmail();
    };
  }, [user?.uid, user?.role, user?.barberId, user?.email, tenantId]);

  // Fix 2: Handle mobile browser background throttling
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Force refresh notifications when app comes back to foreground
        if (!user || !tenantId) return;
        
        const recipientId = user.role === 'admin' ? 'admin' : (user.barberId || user.uid);
        if (!recipientId) return;

        try {
          const snapshotUid = await getDocs(query(
            collection(db, 'notifications'),
            where('recipientId', '==', recipientId),
            where('tenantId', '==', tenantId)
          ));
          let merged = snapshotUid.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));

          if (user.role === 'client' && user.email) {
            const snapshotEmail = await getDocs(query(
              collection(db, 'notifications'),
              where('recipientId', '==', user.email),
              where('tenantId', '==', tenantId)
            ));
            const emailNotifs = snapshotEmail.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
            merged = [...merged, ...emailNotifs];
          }

          const seen = new Set<string>();
          const deduped: AppNotification[] = [];
          for (const n of merged) {
            if (!seen.has(n.id)) {
              seen.add(n.id);
              deduped.push(n);
            }
          }
          
          const valid = deduped.filter(n => !n.expiresAt || n.expiresAt > Date.now());
          valid.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setNotifications(valid.slice(0, 50));
        } catch (error) {
          console.error("Error refreshing notifications:", error);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user?.uid, user?.role, user?.barberId, user?.email, tenantId]);

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
