interface VerificationUser {
  emailVerified: boolean;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

export async function sendAccountVerification<T>(
  user: T,
  sender: (candidate: T) => Promise<unknown>,
): Promise<void> {
  await sender(user);
}

export async function refreshVerifiedEmail<T extends VerificationUser>(
  user: T,
  reloader: (candidate: T) => Promise<unknown>,
): Promise<boolean> {
  await reloader(user);
  if (!user.emailVerified) return false;
  await user.getIdToken(true);
  return true;
}
