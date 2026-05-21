import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB455BHQ7ZIAcO0jwXYbYuzlcvXKt2Qpx4",
  authDomain: "elite-cuts-app.firebaseapp.com",
  projectId: "elite-cuts-app",
  storageBucket: "elite-cuts-app.firebasestorage.app",
  messagingSenderId: "499181564992",
  appId: "1:499181564992:web:afc888388b72144ccc9ba5",
  measurementId: "G-QDWD7EKPM7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TENANT_ID = 'barbeboard-demo';
const TODAY = new Date().toISOString().split('T')[0];
const getDateOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

async function clearDemoData() {
  console.log('🗑️ Clearing old demo data...');
  const collections = ['barbers', 'services', 'bookings', 'sales', 'expenses', 'users', 'products', 'gallery'];
  for (const col of collections) {
    try {
      const snap = await getDocs(query(collection(db, col), where('tenantId', '==', TENANT_ID)));
      if (snap.size === 0) continue;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`  Deleted ${snap.size} docs from ${col}`);
    } catch (err) {
      console.warn(`  ⚠️ Could not clear collection ${col}:`, err.message);
    }
  }
  // Delete the tenant doc (optional, may require elevated permissions)
  try {
    const tenantDocRef = doc(db, 'tenants', TENANT_ID);
    const batch = writeBatch(db);
    batch.delete(tenantDocRef);
    await batch.commit();
    console.log('  Deleted tenant document');
  } catch (err) {
    console.warn('  ⚠️ Could not delete tenant document (may lack permissions):', err.message);
  }
}

async function createAuthUser(email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log(`  ✅ Created new auth user: ${email} (UID: ${cred.user.uid})`);
    return cred.user.uid;
  } catch (err) {
    if (err.code === 'auth/email-already-exists' || err.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      console.log(`  ✅ Auth user already exists: ${email} (UID: ${cred.user.uid})`);
      return cred.user.uid;
    }
    throw err;
  }
}

async function main() {
  console.log('\n🚀 Starting Barbeboard Demo Seed Script (Web SDK)...\n');

  // 1. Authenticate as Super Admin to have full Firestore access
  console.log('🔑 Authenticating as super admin...');
  await signInWithEmailAndPassword(auth, 'admin-elite@test.com', 'password123');
  console.log('✅ Super admin authenticated.');

  // 2. Clear Firestore demo data
  await clearDemoData();

  // 3. Create Firebase Auth users
  // (Creating new users signed in state will change, but that's fine, we will re-authenticate as admin if needed)
  console.log('👤 Seeding Firebase Auth users...');
  const adminUid = await createAuthUser('demo-admin@barbeboard.pro', 'Demo1234!');
  const barberUid = await createAuthUser('demo-barber@barbeboard.pro', 'Demo1234!');
  const clientUid = await createAuthUser('demo-client@barbeboard.pro', 'Demo1234!');

  // Re-authenticate as super admin to ensure we have permission to write Firestore docs
  console.log('🔑 Re-authenticating as super admin...');
  await signInWithEmailAndPassword(auth, 'admin-elite@test.com', 'password123');

  // 4. Create Tenant
  console.log('📦 Creating tenant document...');
  await setDoc(doc(db, 'tenants', TENANT_ID), {
    subdomain: 'demo',
    name: 'Gold Cuts Paris',
    ownerUid: adminUid,
    subscription: { status: 'active', planId: 'pro' },
    branding: { primaryColor: '#D4AF37', businessName: 'Gold Cuts Paris', logoUrl: '' },
    settings: { maxBarbersLimit: 8, allowOnlineBooking: true },
    onboardingComplete: true,
    isDemo: true,
    createdAt: Date.now(),
  });
  console.log('✅ Tenant created: barbeboard-demo');

  // 5. Create User Profiles in Firestore
  console.log('👤 Seeding user profiles in Firestore...');
  const usersToSeed = [
    { uid: adminUid, email: 'demo-admin@barbeboard.pro', name: 'Admin Demo', role: 'admin' },
    { uid: barberUid, email: 'demo-barber@barbeboard.pro', name: 'Karim B.', role: 'barber' },
    { uid: clientUid, email: 'demo-client@barbeboard.pro', name: 'Client Demo', role: 'client' },
  ];
  for (const u of usersToSeed) {
    await setDoc(doc(db, 'users', u.uid), {
      name: u.name,
      email: u.email,
      role: u.role,
      tenantId: TENANT_ID,
      createdAt: Date.now(),
    });
    console.log(`  ✅ Firestore user doc: ${u.email} (${u.role})`);
  }

  // 6. Seed barbers
  console.log('💈 Seeding barbers...');
  const barbersData = [
    { name: 'Karim B.', specialty: 'Spécialiste Dégradé', status: 'available', commission: 50, email: 'demo-barber@barbeboard.pro' },
    { name: 'Yassine M.', specialty: 'Expert Barbe & Rasage', status: 'available', commission: 55, email: 'yassine@demo.local' },
    { name: 'Marcus J.', specialty: 'Coloriste & Styling', status: 'available', commission: 60, email: 'marcus@demo.local' },
  ];

  const barberIds = {};
  for (const b of barbersData) {
    const docRef = doc(collection(db, 'barbers'));
    await setDoc(docRef, {
      ...b,
      tenantId: TENANT_ID,
      image: '',
      createdAt: Date.now(),
    });
    barberIds[b.name] = docRef.id;
    console.log(`  ✅ Barber: ${b.name} → ${docRef.id}`);
  }

  // 7. Seed services
  console.log('✂️ Seeding services...');
  const servicesData = [
    { name: 'Coupe Classique', price: '25', duration: '30 min', image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=300&h=300&fit=crop' },
    { name: 'Dégradé Américain', price: '35', duration: '45 min', image: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=300&h=300&fit=crop' },
    { name: 'Barbe & Rasage', price: '20', duration: '30 min', image: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=300&h=300&fit=crop' },
    { name: 'Coupe + Barbe', price: '50', duration: '60 min', image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=300&h=300&fit=crop' },
    { name: 'Coloration', price: '65', duration: '90 min', image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=300&h=300&fit=crop' },
  ];

  const serviceIds = {};
  for (const s of servicesData) {
    const docRef = doc(collection(db, 'services'));
    await setDoc(docRef, {
      ...s,
      tenantId: TENANT_ID,
      createdAt: Date.now(),
    });
    serviceIds[s.name] = docRef.id;
    console.log(`  ✅ Service: ${s.name} → ${docRef.id}`);
  }

  // 8. Seed bookings
  console.log('📅 Seeding bookings...');
  const clientNames = ['Ahmed D.', 'Thomas R.', 'Lucas M.', 'Bilal S.', 'Maxime L.', 'Noah B.', 'Amine K.', 'Kevin P.', 'Jordan T.', 'Clément V.', 'Samir A.', 'Romain C.', 'Dylan F.', 'Yanis H.', 'Jérémy N.'];
  const barberList = Object.values(barberIds);
  const serviceList = Object.entries(serviceIds);
  const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'];

  const bookings = [
    // 5 pending (today + tomorrow)
    { clientName: clientNames[0], date: TODAY, time: times[0], status: 'pending', barberId: barberList[0], serviceEntry: serviceList[0] },
    { clientName: clientNames[1], date: TODAY, time: times[2], status: 'pending', barberId: barberList[1], serviceEntry: serviceList[2] },
    { clientName: clientNames[2], date: TODAY, time: times[4], status: 'pending', barberId: barberList[2], serviceEntry: serviceList[1] },
    { clientName: clientNames[3], date: getDateOffset(1), time: times[6], status: 'pending', barberId: barberList[0], serviceEntry: serviceList[3] },
    { clientName: clientNames[4], date: getDateOffset(1), time: times[8], status: 'pending', barberId: barberList[1], serviceEntry: serviceList[4] },
    // 5 approved (this week)
    { clientName: clientNames[5], date: getDateOffset(2), time: times[1], status: 'approved', barberId: barberList[2], serviceEntry: serviceList[0] },
    { clientName: clientNames[6], date: getDateOffset(2), time: times[3], status: 'approved', barberId: barberList[0], serviceEntry: serviceList[2] },
    { clientName: clientNames[7], date: getDateOffset(3), time: times[5], status: 'approved', barberId: barberList[1], serviceEntry: serviceList[1] },
    { clientName: clientNames[8], date: getDateOffset(3), time: times[7], status: 'approved', barberId: barberList[2], serviceEntry: serviceList[3] },
    { clientName: clientNames[9], date: getDateOffset(4), time: times[9], status: 'approved', barberId: barberList[0], serviceEntry: serviceList[4] },
    // 5 completed (last week)
    { clientName: clientNames[10], date: getDateOffset(-2), time: times[10], status: 'completed', pricePaid: 25, barberId: barberList[1], serviceEntry: serviceList[0] },
    { clientName: clientNames[11], date: getDateOffset(-3), time: times[11], status: 'completed', pricePaid: 35, barberId: barberList[2], serviceEntry: serviceList[1] },
    { clientName: clientNames[12], date: getDateOffset(-4), time: times[12], status: 'completed', pricePaid: 20, barberId: barberList[0], serviceEntry: serviceList[2] },
    { clientName: clientNames[13], date: getDateOffset(-5), time: times[13], status: 'completed', pricePaid: 50, barberId: barberList[1], serviceEntry: serviceList[3] },
    { clientName: clientNames[14], date: getDateOffset(-6), time: times[14], status: 'completed', pricePaid: 65, barberId: barberList[2], serviceEntry: serviceList[4] },
  ];

  for (const b of bookings) {
    const [serviceName, serviceId] = b.serviceEntry;
    const servicePrice = serviceName === 'Coupe Classique' ? '25' : serviceName === 'Dégradé Américain' ? '35' : serviceName === 'Barbe & Rasage' ? '20' : serviceName === 'Coupe + Barbe' ? '50' : '65';
    const docRef = doc(collection(db, 'bookings'));
    await setDoc(docRef, {
      tenantId: TENANT_ID,
      clientName: b.clientName,
      clientEmail: `${b.clientName.toLowerCase().replace(/[^a-z]/g, '')}@demo.com`,
      clientPhone: `06${Math.floor(10000000 + Math.random() * 89999999)}`,
      clientId: b.clientName === 'Client Demo' ? clientUid : '',
      barberId: b.barberId,
      serviceId,
      date: b.date,
      time: b.time,
      status: b.status,
      pricePaid: b.pricePaid || 0,
      tip: 0,
      paymentMethod: 'cash',
      paymentStatus: b.status === 'completed' ? 'paid' : 'pending',
      notes: '',
      createdAt: Date.now(),
      unreadAdmin: b.status === 'pending',
      unreadBarber: b.status === 'pending',
    });
    console.log(`  ✅ Booking: ${b.clientName} - ${b.status} on ${b.date}`);
  }

  // 9. Seed sales
  console.log('💰 Seeding sales...');
  const salesBarberList = Object.values(barberIds);
  const salesServiceList = Object.values(serviceIds);
  const salesData = [
    { amount: 95, days: -1 }, { amount: 120, days: -3 }, { amount: 75, days: -5 },
    { amount: 155, days: -8 }, { amount: 85, days: -10 }, { amount: 110, days: -14 },
    { amount: 95, days: -18 }, { amount: 65, days: -22 },
  ];

  for (const s of salesData) {
    const docRef = doc(collection(db, 'sales'));
    await setDoc(docRef, {
      tenantId: TENANT_ID,
      barberId: salesBarberList[Math.floor(Math.random() * salesBarberList.length)],
      serviceId: salesServiceList[Math.floor(Math.random() * salesServiceList.length)],
      amount: s.amount,
      date: getDateOffset(s.days),
      paymentMethod: Math.random() > 0.5 ? 'cash' : 'card',
      createdAt: Date.now() + s.days * 86400000,
    });
    console.log(`  ✅ Sale: €${s.amount} on ${getDateOffset(s.days)}`);
  }

  // 10. Seed expenses
  console.log('🧾 Seeding expenses...');
  const expenses = [
    { description: 'Produits capillaires', amount: 45, category: 'Matériel', date: getDateOffset(-5) },
    { description: 'Loyer', amount: 800, category: 'Facture', date: getDateOffset(-10) },
    { description: 'Fournitures', amount: 30, category: 'Achat', date: getDateOffset(-15) },
  ];

  for (const e of expenses) {
    const docRef = doc(collection(db, 'expenses'));
    await setDoc(docRef, { ...e, tenantId: TENANT_ID, createdAt: Date.now() });
    console.log(`  ✅ Expense: ${e.description} — €${e.amount}`);
  }

  // 11. Seed Boutique products
  console.log('🛍️ Seeding boutique products...');
  const productsData = [
    { name: 'Gel Coiffant Pro', price: 12.99, description: 'Tenue forte 24h', category: 'Styling', stock: 25, image: 'https://placehold.co/300x300/111/D4AF37?text=Gel' },
    { name: 'Shampooing Barber', price: 8.99, description: 'Shampooing professionnel pour hommes', category: 'Soin', stock: 30, image: 'https://placehold.co/300x300/111/D4AF37?text=Shampoo' },
    { name: 'Cire Capillaire', price: 15.99, description: 'Finition mate naturelle', category: 'Styling', stock: 20, image: 'https://placehold.co/300x300/111/D4AF37?text=Wax' },
    { name: 'Energy Drink Barber', price: 3.50, description: 'Boisson énergisante premium', category: 'Boissons', stock: 50, image: 'https://placehold.co/300x300/111/D4AF37?text=Drink' },
    { name: 'Huile à Barbe', price: 18.99, description: 'Huile naturelle pour barbe', category: 'Soin', stock: 15, image: 'https://placehold.co/300x300/111/D4AF37?text=Oil' },
    { name: 'Pomade Brillante', price: 13.99, description: 'Finition brillante longue durée', category: 'Styling', stock: 18, image: 'https://placehold.co/300x300/111/D4AF37?text=Pomade' },
  ];

  for (const p of productsData) {
    const docRef = doc(collection(db, 'products'));
    await setDoc(docRef, { ...p, tenantId: TENANT_ID, createdAt: Date.now() });
    console.log(`  ✅ Product: ${p.name} — €${p.price}`);
  }

  // 12. Seed Portfolio gallery photos
  console.log('📸 Seeding portfolio gallery...');
  const galleryData = [
    { title: 'Dégradé Américain', barber: 'Karim B.', imageUrl: 'https://placehold.co/400x500/111/D4AF37?text=Degrade', category: 'Dégradé', likes: 24 },
    { title: 'Coupe + Barbe Soignée', barber: 'Yassine M.', imageUrl: 'https://placehold.co/400x500/111/D4AF37?text=Coupe+Barbe', category: 'Coupe', likes: 31 },
    { title: 'Fade Clean', barber: 'Marcus J.', imageUrl: 'https://placehold.co/400x500/111/D4AF37?text=Fade', category: 'Dégradé', likes: 18 },
    { title: 'Rasage Classique', barber: 'Yassine M.', imageUrl: 'https://placehold.co/400x500/111/D4AF37?text=Rasage', category: 'Barbe', likes: 15 },
    { title: 'Coloration Moderne', barber: 'Marcus J.', imageUrl: 'https://placehold.co/400x500/111/D4AF37?text=Color', category: 'Coloration', likes: 22 },
    { title: 'Coupe Texturée', barber: 'Karim B.', imageUrl: 'https://placehold.co/400x500/111/D4AF37?text=Texture', category: 'Coupe', likes: 19 },
  ];

  for (const g of galleryData) {
    const docRef = doc(collection(db, 'gallery'));
    await setDoc(docRef, { ...g, tenantId: TENANT_ID, createdAt: Date.now() });
    console.log(`  ✅ Gallery: ${g.title} (${g.category}) — ${g.likes} likes`);
  }

  console.log('\n✅ Demo seed complete!\n');
  console.log('Login credentials:');
  console.log('  Admin:  demo-admin@barbeboard.pro / Demo1234!');
  console.log('  Barber: demo-barber@barbeboard.pro / Demo1234!');
  console.log('  Client: demo-client@barbeboard.pro / Demo1234!\n');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
