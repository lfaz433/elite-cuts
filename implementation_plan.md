# Barbeboard Demo System Implementation Plan

## Steps
1. Create scripts/seedDemo.ts (seed Firestore + Firebase Auth via Admin SDK)
2. Update TenantContext.tsx - add demo subdomain detection  
3. Update App.tsx - demo.barbeboard.pro → LandingPage
4. Update LoginModal.tsx - demo quick-access buttons
5. Add demo banner to AdminDashboard, BarberDashboard, ClientDashboard
6. Update TenantData type to include isDemo field
7. Update HomePage.tsx - "Voir la démo" → https://demo.barbeboard.pro
8. Add reset Cloud Function in functions/src/index.ts
9. Build, deploy, seed, push
