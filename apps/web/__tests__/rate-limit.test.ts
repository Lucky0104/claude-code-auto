import { describe, it, expect, beforeEach } from "vitest";
import { checkCooldown, resetRateLimit } from "@/lib/rate-limit";

describe("rate-limit", () => {
  beforeEach(() => resetRateLimit());

  it("allows the first call, blocks the second within the window", () => {
    expect(checkCooldown("k", 100).allowed).toBe(true);
    const second = checkCooldown("k", 100);
    expect(second.allowed).toBe(false);
    expect(second.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("cooldown <= 0 disables limiting", () => {
    expect(checkCooldown("k", 0).allowed).toBe(true);
    expect(checkCooldown("k", 0).allowed).toBe(true);
  });

  it("keys are independent", () => {
    expect(checkCooldown("a", 100).allowed).toBe(true);
    expect(checkCooldown("b", 100).allowed).toBe(true);
  });
});
