import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMetaSignature, extractIgPostId, mediaTypeFromPermalink } from "@/lib/meta";

describe("verifyMetaSignature", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ object: "instagram", entry: [] });
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a valid signature", async () => {
    expect(await verifyMetaSignature(body, sig, secret)).toBe(true);
  });
  it("rejects a wrong signature", async () => {
    expect(await verifyMetaSignature(body, "sha256=deadbeef", secret)).toBe(false);
  });
  it("rejects a missing header", async () => {
    expect(await verifyMetaSignature(body, null, secret)).toBe(false);
  });
  it("rejects an empty secret", async () => {
    expect(await verifyMetaSignature(body, sig, "")).toBe(false);
  });
});

describe("permalink helpers", () => {
  it("extracts the post shortcode", () => {
    expect(extractIgPostId("https://www.instagram.com/p/Cabc123/")).toBe("Cabc123");
    expect(extractIgPostId("https://www.instagram.com/reel/Rxyz/")).toBe("Rxyz");
    expect(extractIgPostId(null)).toBeNull();
  });
  it("derives media type", () => {
    expect(mediaTypeFromPermalink("https://x/reel/a/")).toBe("REEL");
    expect(mediaTypeFromPermalink("https://x/tv/a/")).toBe("VIDEO");
    expect(mediaTypeFromPermalink("https://x/p/a/")).toBe("IMAGE");
  });
});
