import { isValidObjectId } from "../../src/utils/validators";

describe("Validators Utility", () => {
  test("should return true for valid 24-character hex string", () => {
    expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);
    expect(isValidObjectId("65b0c9e6869a84a6a575084a")).toBe(true);
  });

  test("should return false for invalid formats", () => {
    expect(isValidObjectId("invalid-id")).toBe(false);
    expect(isValidObjectId("12345")).toBe(false);
    expect(isValidObjectId("")).toBe(false);
    expect(isValidObjectId("507f1f77bcf86cd79943901z")).toBe(false); // non-hex
  });

  test("should return false for null or undefined", () => {
    expect(isValidObjectId(null as any)).toBe(false);
    expect(isValidObjectId(undefined as any)).toBe(false);
  });
});
