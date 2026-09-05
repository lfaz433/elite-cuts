import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import {
  parseFreelancerProfile,
  parsePortfolioItem,
  type FreelancerProfile,
  type FreelancerProfileInput,
  type PortfolioItem,
} from './freelancerRecords';
import { freelancerOwnerScope } from './freelancerWorkspace';

export * from './freelancerRecords';

const saveProfileCall = httpsCallable<FreelancerProfileInput, { uid: string }>(
  functions,
  'saveFreelancerProfile',
);
const createPortfolioCall = httpsCallable<
  { imageUrl: string; caption: string; visible: boolean },
  { portfolioItemId: string }
>(functions, 'createFreelancerPortfolioItem');
const deletePortfolioCall = httpsCallable<
  { portfolioItemId: string },
  { portfolioItemId: string }
>(functions, 'deleteFreelancerPortfolioItem');

export async function loadFreelancerProfile(uid: string): Promise<FreelancerProfile | null> {
  const snapshot = await getDoc(doc(db, 'freelancerProfiles', uid));
  return snapshot.exists() ? parseFreelancerProfile(uid, snapshot.data()) : null;
}

export async function saveFreelancerProfile(input: FreelancerProfileInput): Promise<void> {
  await saveProfileCall(input);
}

export async function listPortfolioItems(uid: string): Promise<PortfolioItem[]> {
  const scope = freelancerOwnerScope(uid);
  const snapshot = await getDocs(query(
    collection(db, 'portfolioItems'),
    ...scope.map(([field, operator, value]) => where(field, operator, value)),
  ));
  return snapshot.docs
    .map(item => parsePortfolioItem(item.id, uid, item.data()))
    .filter((item): item is PortfolioItem => item !== null);
}

export async function createPortfolioItem(input: {
  imageUrl: string;
  caption: string;
  visible: boolean;
}): Promise<string> {
  return (await createPortfolioCall(input)).data.portfolioItemId;
}

export async function deletePortfolioItem(portfolioItemId: string): Promise<void> {
  await deletePortfolioCall({ portfolioItemId });
}
