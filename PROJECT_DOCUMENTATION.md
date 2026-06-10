# Barberboard Project Technical Documentation

## 1. Project Overview
Barberboard is a multi-tenant SaaS application designed for barbershops. It provides a comprehensive suite of tools for managing bookings, staff (barbers), payroll, point-of-sale (POS) systems, and overall shop analytics. 

## 2. File Structure & Purposes (`src/`)

- `src/main.tsx`: Entry point of the React application.
- `src/app/App.tsx`: Main application component containing routing logic, layout wrappers, and global route guards (e.g., `ProtectedRoute`, `SuperAdminGuard`).
- `src/app/components/ErrorBoundary.tsx`: Catches and displays React rendering errors.
- `src/app/components/SubscriptionGuard.tsx`: Protects routes ensuring the tenant has an active subscription.
- `src/app/components/SuperAdminGuard.tsx`: Restricts access to SuperAdmin only.
- `src/app/components/admin/*`: Components specifically used in the Admin Dashboard (e.g., `AdminCharts.tsx`, `BarberAnalytics.tsx`, `FinanceReport.tsx`, `ProductManagement.tsx`).
- `src/app/components/context/AuthContext.tsx`: Manages authentication state, user roles, and Firebase Auth integration.
- `src/app/components/context/BusinessContext.tsx`: Central state management for business logic (bookings, barbers, services, payroll, expenses, deposits, caisse).
- `src/app/components/context/NotificationContext.tsx`: Manages global notification state.
- `src/app/components/context/TenantContext.tsx`: Resolves tenant by subdomain, managing the barbershop's specific branding, settings, and subscription state.
- `src/app/components/layouts/PublicLayout.tsx`: Layout for public-facing pages.
- `src/app/components/modals/*`: Various modal components for interactions (e.g., `BookingModal.tsx`, `SaleModal.tsx`, `SettlementModal.tsx`, `NotificationPermissionModal.tsx`).
- `src/app/components/pages/AdminDashboard.tsx`: Main dashboard for barbershop owners/admins.
- `src/app/components/pages/BarberDashboard.tsx`: Dashboard tailored for barbers to manage their schedule and payroll.
- `src/app/components/pages/ClientDashboard.tsx`: Portal for clients to view and manage their reservations.
- `src/app/components/pages/SuperAdmin.tsx`: Master dashboard for platform owners to manage all tenants and subscriptions.
- `src/app/components/pages/HomePage.tsx` & `LandingPage.tsx`: Marketing and booking portals.
- `src/app/components/pages/BoutiquePage.tsx`, `Billing.tsx`, `Onboarding.tsx`, `Register.tsx`, `DocsPage.tsx`: Other specific pages.
- `src/app/hooks/*`: Custom React hooks (e.g., `usePagination.ts`, `useSaveEntity.tsx`).
- `src/app/lib/firebase.ts`: Firebase configuration and initialization.
- `src/app/lib/adminAuth.ts`: Helper utilities for authentication.

## 3. Firestore Collections & Document Structure

1. **tenants**: Stores multi-tenant configurations.
   - `subdomain`, `name`, `branding` (colors, logos), `settings` (max barbers), `subscription` (status, planId, trialEndsAt).
2. **bookings**: Client reservations.
   - `tenantId`, `clientName`, `clientEmail`, `barberId`, `serviceId`, `date`, `time`, `status` (pending, approved, completed, rejected), `pricePaid`, `paymentStatus`.
3. **barbers**: Staff profiles.
   - `tenantId`, `name`, `specialty`, `email`, `commissionRate`, `status`, `workingDays`.
4. **services**: Barbershop services offered.
   - `tenantId`, `name`, `price`, `duration`, `description`.
5. **products**: Retail products sold in the shop.
   - `tenantId`, `name`, `buyPrice`, `sellPrice`, `stock`.
6. **sales**: POS transactions for products/services.
   - `tenantId`, `productId`, `sellerId`, `quantity`, `sellPrice`, `date`.
7. **expenses**: Shop expenses.
   - `tenantId`, `title`, `amount`, `category`.
8. **deposits**: Cash drawer deposits.
   - `tenantId`, `title`, `amount`, `category`.
9. **payroll_requests**: Barbers requesting payouts.
   - `tenantId`, `barberId`, `amount`, `status` (pending, approved).
10. **payroll_payments**: Completed payouts to barbers.
    - `tenantId`, `barberId`, `amount`, `paidAt`.
11. **users**: Platform users and their roles.
    - `uid`, `email`, `role`, `tenantId`.
12. **manual_payments**: SuperAdmin records of manual subscription payments.
    - `tenantId`, `amount`, `status`, `planId`.
13. **notifications**: App notifications.
    - `tenantId`, `recipientId`, `message`, `type`, `read`.

*(Note: `business`, `attendance`, and `settlements` are deprecated/locked in firestore.rules)*

## 4. User Roles & Permissions
- **SuperAdmin**: Full platform access. Can manage tenants, subscriptions, revoke access, and view global MRR/Revenue.
- **Admin**: Shop owner. Can manage barbers, services, approve/reject bookings, manage POS, view shop analytics, and process payroll.
- **Barber**: Shop employee. Can view their own schedule, request payroll, and see their specific commissions.
- **Client**: End customer. Can book appointments, view past and upcoming bookings.

## 5. Pages & Routes
- `/`: Marketing page (`HomePage`) on main domain, booking portal (`LandingPage`) on tenant subdomains.
- `/boutique`: Public shop products viewing.
- `/register`: Tenant signup page.
- `/docs`: Documentation page.
- `/onboarding`: Initial setup for new admins.
- `/billing`: Tenant subscription management.
- `/superadmin/*`: SuperAdmin dashboard.
- `/admin/*`: Shop Owner dashboard.
- `/barber/*`: Barber dashboard.
- `/client/*`: Client dashboard.

## 6. Dashboards & Features
### Admin Dashboard
- **Dashboard**: High-level KPI overview (revenue, bookings).
- **Bookings**: Calendar and list view to approve/reject/complete appointments.
- **Barbers**: Manage staff profiles, commissions, and schedules.
- **Services**: Manage shop services and pricing.
- **Boutique & Caisse**: Point-of-sale system, inventory management, and register cash flow.
- **Reports**: Analytics and financial reports.
- **Paie**: Process and approve payroll requests from barbers.
- **Depenses**: Expense and deposit tracking.
- **Settings/Branding**: Customize the booking page (colors, logo, hours).

### Barber Dashboard
- **Gains (Dashboard)**: Track personal commission earnings and wallet balance.
- **Agenda (Reservations)**: View assigned upcoming and past bookings.
- **Rapports**: Personal performance metrics.
- **Boutique**: View shop products.
- **Horaires**: Shift management.

### Client Dashboard
- **Réservations**: View upcoming bookings and book new ones via `BookingModal`.
- **Historique**: View past completed bookings.

### SuperAdmin Dashboard
- **Dashboard**: Global KPIs (Total MRR, ARR, Active Shops).
- **Salons (Tenants)**: Manage tenants, suspend shops, delete duplicates.
- **Revenus**: Subscription revenue charts.
- **Paiements**: Manage manual payments for tenants not using Stripe.
- **Accès Gratuit**: Grant lifetime/free access to specific tenants.

## 7. Cloud Functions
Located in `functions/src/index.ts`:
- `createCheckoutSession`: Creates a Stripe Checkout session for a tenant upgrading their plan.
- `stripeWebhook`: Listens to Stripe events (`customer.subscription.created`, `updated`, `deleted`, `invoice.payment_failed`) and updates the tenant's subscription status in Firestore.
- `resetDemoDataHttp` & `resetDemoDataScheduled`: Resets the data for the `barberboard-demo` tenant (barbers, services, bookings) daily via Pub/Sub or manually via an HTTP trigger.

## 8. Context Providers & State Management
- **AuthContext**: Manages Firebase Auth. Intercepts hardcoded admin emails, checks Firestore for `users` roles, and provides `user`, `login()`, `logout()`, `signup()`.
- **TenantContext**: Analyzes the URL subdomain to fetch the correct `tenantId` and branding settings from Firestore. Applies CSS variables for theming.
- **BusinessContext**: The core business state engine. Subscribes to Firestore collections (`bookings`, `barbers`, `services`, `expenses`, `payroll_requests`) scoped by `tenantId`. Provides mutation functions (`addBooking`, `updateBookingStatus`, etc.).
- **NotificationContext**: Manages reading and dismissing notifications for the current user.

## 9. Business Logic Flows
### Booking Flow
1. Client selects a service, barber, and timeslot in `LandingPage` or `ClientDashboard`.
2. `BusinessContext.addBooking` checks for conflicts (if type is `avec-rdv`).
3. If no conflict, saves to Firestore and creates notification documents for Admin/Barber.
4. Triggers `/api/send-push` to send a OneSignal push notification.
5. Admin/Barber approves or rejects the booking, triggering another push notification back to the Client.

### Payment & Caisse Flow
1. **Caisse Balance** is calculated dynamically in `BusinessContext`: 
   `Caisse = Total Revenus (Sales + Completed Bookings) + Total Deposits - Total Expenses`
2. Admins can log manual expenses (e.g., Rent, Supplies) and manual deposits (e.g., Drawer funds).

### Payroll Flow
1. **Wallet Balance Calculation**: For each completed booking, `Earned = (Price * CommissionRate) + Tip`.
2. `Current Balance = Earned - Total Payroll Payments received`.
3. Barber requests a payout from their dashboard (`payroll_requests`).
4. Admin reviews in `Paie` tab and approves it.
5. Approval creates a `payroll_payments` record, which deducts from the Barber's Wallet Balance.

## 10. Environment Variables Needed
Backend / Functions:
- `STRIPE_SECRET_KEY`: Stripe API key for creating sessions.
- `STRIPE_PRICE_BASIC`: Stripe Price ID for the Basic plan.
- `STRIPE_PRICE_PRO`: Stripe Price ID for the Pro plan.
- `STRIPE_WEBHOOK_SECRET`: Secret to verify Stripe webhook signatures.

Vercel Serverless (`api/send-push.ts` & `api/provision-subdomain.ts`):
- `ONESIGNAL_REST_API_KEY`: OneSignal REST API key for push notifications.
- `VERCEL_TOKEN`: Vercel API token to manage project domains dynamically.
- `VERCEL_PROJECT_ID`: ID of the Vercel project.
- `VERCEL_TEAM_ID`: (Optional) ID of the Vercel team if applicable.
- `VITE_MAIN_DOMAIN`: The apex domain (e.g., `barberboard.pro`).

*(Note: Firebase client configuration is hardcoded in `src/app/lib/firebase.ts` and does not require local `.env` variables for the frontend).*

## 11. Automated Subdomain Provisioning & Manual Setup
To enable zero-touch subdomain provisioning for tenants, Vercel requires specific DNS and environment configuration:

### Manual Setup Steps (One-time)
1. **Namecheap (DNS)**: Add a `CNAME` record with Host `*` pointing to the Vercel project target (e.g., `cname.vercel-dns.com`). This enables dynamic routing to Vercel for any `*.maindomain.com`.
2. **Vercel Settings**: Generate a `VERCEL_TOKEN` from Account/Team Settings and add it as an Environment Variable alongside `VERCEL_PROJECT_ID` and `VITE_MAIN_DOMAIN`.
3. **Provisioning Flow**: When a tenant registers, `/api/provision-subdomain` is called. Because the wildcard CNAME exists, Vercel automatically fulfills the HTTP-01 challenge and provisions the SSL certificate without further intervention.

## 12. Third-Party Services
- **Firebase**: Authentication (Email/Password), Firestore (NoSQL Database), Cloud Functions (Backend logic).
- **Stripe**: Handles SaaS subscription billing and checkout sessions.
- **OneSignal**: Handles push notifications for admins, barbers, and clients (via Vercel Serverless Function).
- **Vercel**: Hosts the React frontend and serverless API endpoints (`/api/send-push`).
