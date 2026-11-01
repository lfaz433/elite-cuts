'use strict';

const EXPECTED_FIREBASE_PROJECTS = Object.freeze({
  default: 'elitecuts-2fb0a',
  launch: 'elitecuts-2fb0a',
});

function assertFirebaseAliases(config) {
  if (config?.projects?.default !== EXPECTED_FIREBASE_PROJECTS.default) {
    throw new Error(`Firebase default alias must be ${EXPECTED_FIREBASE_PROJECTS.default}`);
  }
  if (config?.projects?.launch !== EXPECTED_FIREBASE_PROJECTS.launch) {
    throw new Error(`Firebase launch alias must be ${EXPECTED_FIREBASE_PROJECTS.launch}`);
  }
}

module.exports = { EXPECTED_FIREBASE_PROJECTS, assertFirebaseAliases };
