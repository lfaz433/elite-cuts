const INVITATION_RETURN_PATH = /^\/invitations\/[A-Za-z0-9_-]{1,128}$/;

function safeInvitationReturnPath(value: string | null): string | null {
  if (!value || !INVITATION_RETURN_PATH.test(value)) return null;
  return value;
}

export function loginPathForProtectedRoute(currentPath: string): string {
  const returnTo = safeInvitationReturnPath(currentPath);
  return returnTo
    ? `/?login=true&returnTo=${encodeURIComponent(returnTo)}`
    : '/?login=true';
}

export function postLoginDestination(search: string, fallback: string): string {
  const returnTo = new URLSearchParams(search).get('returnTo');
  return safeInvitationReturnPath(returnTo) ?? fallback;
}
