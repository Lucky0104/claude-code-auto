/** Role-based access control. Pure module shared by app + tests. */
export const ROLES = ["OWNER", "ADMIN", "MANAGER", "AGENT", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = {
  OWNER: 5,
  ADMIN: 4,
  MANAGER: 3,
  AGENT: 2,
  VIEWER: 1,
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** True if `role` is exactly one of the allowed roles. */
export function hasRole(role: Role, ...allowed: Role[]): boolean {
  return allowed.includes(role);
}

/** True if `role` is at least as privileged as `min`. */
export function atLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

export const canManageTeam = (role: Role) => atLeast(role, "ADMIN");
export const canManageBilling = (role: Role) => atLeast(role, "OWNER");
export const canConfigureCampaigns = (role: Role) => atLeast(role, "MANAGER");
export const canSyncCampaigns = (role: Role) => atLeast(role, "MANAGER");
export const canToggleMonitoring = (role: Role) => atLeast(role, "AGENT");
export const canViewDashboard = (role: Role) => atLeast(role, "VIEWER");
