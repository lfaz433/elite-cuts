export const FREELANCER_WORKSPACE_VIEWS = ['overview', 'calendar', 'bookings', 'services', 'marketing', 'analytics', 'settings'] as const;
export type FreelancerWorkspaceView = typeof FREELANCER_WORKSPACE_VIEWS[number];

export function freelancerWorkspaceRedirect(pathname: string): string | null {
  return FREELANCER_WORKSPACE_VIEWS.some(view => pathname === `/freelancer/${view}`)
    ? null : '/freelancer/overview';
}

export function resolveFreelancerWorkspaceView(pathname: string): FreelancerWorkspaceView {
  return FREELANCER_WORKSPACE_VIEWS.find(view => pathname === `/freelancer/${view}`) ?? 'overview';
}
