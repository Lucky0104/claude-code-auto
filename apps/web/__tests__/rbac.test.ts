import { describe, it, expect } from "vitest";
import {
  hasRole,
  atLeast,
  canManageTeam,
  canConfigureCampaigns,
  canToggleMonitoring,
  isRole,
} from "@/lib/rbac";

describe("rbac", () => {
  it("hasRole matches exact roles", () => {
    expect(hasRole("ADMIN", "OWNER", "ADMIN")).toBe(true);
    expect(hasRole("VIEWER", "OWNER", "ADMIN")).toBe(false);
  });
  it("atLeast respects hierarchy", () => {
    expect(atLeast("OWNER", "MANAGER")).toBe(true);
    expect(atLeast("AGENT", "MANAGER")).toBe(false);
  });
  it("capability helpers", () => {
    expect(canManageTeam("ADMIN")).toBe(true);
    expect(canManageTeam("MANAGER")).toBe(false);
    expect(canConfigureCampaigns("MANAGER")).toBe(true);
    expect(canToggleMonitoring("AGENT")).toBe(true);
    expect(canToggleMonitoring("VIEWER")).toBe(false);
  });
  it("isRole guards", () => {
    expect(isRole("OWNER")).toBe(true);
    expect(isRole("SUPERUSER")).toBe(false);
  });
});
