import { describe, expect, it } from "vitest";
import { canRecoverReactRuntime, isStaleReactRuntime } from "@/lib/react-runtime-recovery";

describe("stale React runtime recovery", () => {
  it("recognizes the reported null useState dispatcher", () => {
    expect(isStaleReactRuntime(new TypeError("Cannot read properties of null (reading 'useState')"))).toBe(true);
    expect(isStaleReactRuntime(new TypeError("Cannot read properties of null (reading 'name')"))).toBe(false);
  });
  it("reloads once and prevents an immediate reload loop", () => {
    expect(canRecoverReactRuntime(null, 1000)).toBe(true);
    expect(canRecoverReactRuntime(1000, 1001)).toBe(false);
    expect(canRecoverReactRuntime(1000, 61001)).toBe(true);
  });
});