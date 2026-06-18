import { describe, it, expect } from "vitest";
import {
  sanitizeField,
  sanitizeTemplate,
  unknownPlaceholders,
  renderTemplate,
  DEFAULT_TEMPLATE,
} from "@/lib/templates";

describe("sanitizeField", () => {
  it("preserves normal values", () => {
    expect(sanitizeField("Dr. A")).toBe("Dr. A");
    expect(sanitizeField("+91 99999")).toBe("+91 99999");
  });
  it("none stays null", () => expect(sanitizeField(null)).toBeNull());
  it("strips control chars and trims", () => expect(sanitizeField("  Dr.\x00 A\t ")).toBe("Dr. A"));
  it("caps length", () => expect(sanitizeField("x".repeat(5000))!.length).toBe(300));
});

describe("sanitizeTemplate", () => {
  it("preserves placeholders + newlines", () =>
    expect(sanitizeTemplate("Hi {doctor_name}\nCall {phone}")).toBe("Hi {doctor_name}\nCall {phone}"));
  it("collapses blank lines + strips control", () =>
    expect(sanitizeTemplate("a\x07\n\n\n\nb")).toBe("a\n\nb"));
  it("caps length", () => expect(sanitizeTemplate("y".repeat(5000))!.length).toBe(2000));
});

describe("unknownPlaceholders", () => {
  it("flags unknown placeholders", () =>
    expect(unknownPlaceholders("Hi {doctor_name} {docter_name}")).toEqual(["docter_name"]));
  it("empty for none", () => expect(unknownPlaceholders("plain")).toEqual([]));
});

describe("renderTemplate", () => {
  it("substitutes allowed placeholders", () => {
    expect(
      renderTemplate("Dr {doctor_name} at {center_name}", {
        doctor_name: "Asha",
        center_name: "Bengaluru",
      }),
    ).toBe("Dr Asha at Bengaluru");
  });
  it("leaves unknown placeholders literal (no injection)", () => {
    expect(renderTemplate("Hi {evil} {doctor_name}", { doctor_name: "A" })).toBe("Hi {evil} A");
  });
  it("falls back to default template when empty", () => {
    const out = renderTemplate(null, { center_name: "Pune", doctor_name: "X", phone: "1", address: "Y" });
    expect(out).toContain("Pune");
    expect(out).toContain("Dr. X");
    expect(DEFAULT_TEMPLATE).toContain("{center_name}");
  });
  it("missing vars render as empty string", () => {
    expect(renderTemplate("[{whatsapp}]", {})).toBe("[]");
  });
});
