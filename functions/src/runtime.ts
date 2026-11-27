import * as functions from 'firebase-functions';

export const FUNCTIONS_REGION = 'europe-west1';
export const createEuropeFunctions = () => functions.region(FUNCTIONS_REGION);
// Firebase v1 runWith mutates its builder. Configure individual functions on
// fresh builders so App Check and scaling options never leak to other handlers.
export const europeFunctions = createEuropeFunctions();
