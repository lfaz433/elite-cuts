export const LAUNCH_FIREBASE_PROJECT_ID = 'elitecuts-2fb0a';
export const FIREBASE_FUNCTIONS_REGION = 'europe-west1';

type FirebaseEnvironment = Record<string, string | undefined>;

const requiredFirebaseVariables = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

function readRequired(environment: FirebaseEnvironment, variableName: string): string {
  const value = environment[variableName]?.trim();
  if (!value) {
    throw new Error(`${variableName} must be configured for the Firebase launch environment.`);
  }
  return value;
}

export function shouldEnableFirebaseAppCheck(environment: FirebaseEnvironment): boolean {
  const enabled = environment.VITE_FIREBASE_APPCHECK_ENABLED?.trim().toLowerCase() === 'true';
  const projectId = environment.VITE_FIREBASE_PROJECT_ID?.trim();
  const siteKey = environment.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY?.trim() || '';

  return enabled
    && projectId === LAUNCH_FIREBASE_PROJECT_ID
    && /^6[A-Za-z0-9_-]{20,}$/.test(siteKey);
}

export function readFirebaseEnvironment(environment: FirebaseEnvironment) {
  const values = Object.fromEntries(
    requiredFirebaseVariables.map((variableName) => [variableName, readRequired(environment, variableName)]),
  ) as Record<(typeof requiredFirebaseVariables)[number], string>;

  if (values.VITE_FIREBASE_PROJECT_ID !== LAUNCH_FIREBASE_PROJECT_ID) {
    throw new Error(`VITE_FIREBASE_PROJECT_ID must be ${LAUNCH_FIREBASE_PROJECT_ID}.`);
  }

  const appCheckSiteKey = environment.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY?.trim() || '';
  return {
    config: {
      apiKey: values.VITE_FIREBASE_API_KEY,
      authDomain: values.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: values.VITE_FIREBASE_PROJECT_ID,
      storageBucket: values.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: values.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: values.VITE_FIREBASE_APP_ID,
      measurementId: environment.VITE_FIREBASE_MEASUREMENT_ID?.trim() || undefined,
    },
    appCheckEnabled: shouldEnableFirebaseAppCheck(environment),
    appCheckSiteKey,
  };
}

export function firebaseFunctionUrl(functionName: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(functionName)) {
    throw new Error('A valid Function name is required.');
  }

  return `https://${FIREBASE_FUNCTIONS_REGION}-${LAUNCH_FIREBASE_PROJECT_ID}.cloudfunctions.net/${functionName}`;
}
