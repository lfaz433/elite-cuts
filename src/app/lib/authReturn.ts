const INVITATION_RETURN_PATH = /^\/invitations\/[A-Za-z0-9_-]{1,128}$/;
const BOOKING_RETURN_PATH = '/book';
const FREELANCER_RETURN_PATH = '/freelancer';
const RETURN_STORAGE_KEY = 'barberboard.invitationReturnTo';

interface ReturnStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function safeInvitationReturnPath(value: string | null): string | null {
  if (!value || (
    value !== BOOKING_RETURN_PATH
    && value !== FREELANCER_RETURN_PATH
    && !INVITATION_RETURN_PATH.test(value)
  )) return null;
  return value;
}

export function loginPathForProtectedRoute(currentPath: string): string {
  const returnTo = safeInvitationReturnPath(currentPath);
  return returnTo
    ? `/?login=true&returnTo=${encodeURIComponent(returnTo)}`
    : '/?login=true';
}

export function captureInvitationReturn(search: string, storage: ReturnStorage): void {
  const params = new URLSearchParams(search);
  if (!params.has('returnTo')) return;
  const returnTo = safeInvitationReturnPath(params.get('returnTo'));
  if (returnTo) storage.setItem(RETURN_STORAGE_KEY, returnTo);
  else storage.removeItem(RETURN_STORAGE_KEY);
}

export function postLoginDestination(
  search: string,
  fallback: string,
  storage?: ReturnStorage,
): string {
  const queryReturn = safeInvitationReturnPath(new URLSearchParams(search).get('returnTo'));
  const storedReturn = storage
    ? safeInvitationReturnPath(storage.getItem(RETURN_STORAGE_KEY))
    : null;
  const destination = queryReturn ?? storedReturn;
  if (destination) storage?.removeItem(RETURN_STORAGE_KEY);
  return destination ?? fallback;
}
