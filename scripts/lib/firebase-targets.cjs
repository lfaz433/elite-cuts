'use strict';

const EXPECTED_FIREBASE_PROJECTS = Object.freeze({
  default: 'elite-cuts-staging',
  staging: 'elite-cuts-staging',
  production: 'elite-cuts-app',
});

function assertFirebaseAliases(config) {
  if (config?.projects?.default !== EXPECTED_FIREBASE_PROJECTS.default) {
    throw new Error(`Firebase default alias must be ${EXPECTED_FIREBASE_PROJECTS.default}`);
  }
  if (config?.projects?.staging !== EXPECTED_FIREBASE_PROJECTS.staging) {
    throw new Error(`Firebase staging alias must be ${EXPECTED_FIREBASE_PROJECTS.staging}`);
  }
  if (config?.projects?.production !== EXPECTED_FIREBASE_PROJECTS.production) {
    throw new Error(`Firebase production alias must be ${EXPECTED_FIREBASE_PROJECTS.production}`);
  }
}

module.exports = { EXPECTED_FIREBASE_PROJECTS, assertFirebaseAliases };
