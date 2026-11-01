const expected = { launch: 'elitecuts-2fb0a' };
const target = process.argv[2];

if (!Object.hasOwn(expected, target)) {
  console.error(`Unsupported environment target: ${target ?? '(missing)'}`);
  process.exit(2);
}

if (process.env.VITE_FIREBASE_PROJECT_ID !== expected[target]) {
  console.error(`VITE_FIREBASE_PROJECT_ID does not match ${target}`);
  process.exit(1);
}
