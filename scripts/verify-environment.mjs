const expected = { staging: 'elite-cuts-staging', production: 'elite-cuts-app' };

if (process.env.VITE_FIREBASE_PROJECT_ID !== expected[process.argv[2]]) {
  process.exit(1);
}
