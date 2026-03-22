import { isPassingGrade, toDateOrNull } from "./grade.utils";

describe("isPassingGrade", () => {
  it("returns true for passing grades (>= 2.0 GPA)", () => {
    for (const g of ["A+", "A", "A-", "B+", "B", "B-", "C+", "C"]) {
      expect(isPassingGrade(g)).toBe(true);
    }
  });

  it("returns false for failing grades (< 2.0 GPA)", () => {
    for (const g of ["C-", "D+", "D", "F"]) {
      expect(isPassingGrade(g)).toBe(false);
    }
  });

  it("is case-insensitive", () => {
    expect(isPassingGrade("a")).toBe(true);
    expect(isPassingGrade("b+")).toBe(true);
    expect(isPassingGrade("f")).toBe(false);
  });

  it("trims whitespace", () => {
    expect(isPassingGrade("  A  ")).toBe(true);
    expect(isPassingGrade(" F ")).toBe(false);
  });

  it("returns false for null/undefined/empty", () => {
    expect(isPassingGrade(null)).toBe(false);
    expect(isPassingGrade(undefined)).toBe(false);
    expect(isPassingGrade("")).toBe(false);
  });

  it("returns false for unrecognized grade strings", () => {
    expect(isPassingGrade("Z")).toBe(false);
    expect(isPassingGrade("PASS")).toBe(false);
  });
});

describe("toDateOrNull", () => {
  it("converts a valid date string to Date", () => {
    const result = toDateOrNull("2024-01-15");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
  });

  it("returns null for null input", () => {
    expect(toDateOrNull(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(toDateOrNull(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(toDateOrNull("")).toBeNull();
  });
});
