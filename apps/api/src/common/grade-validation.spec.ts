import { BadRequestException } from "@nestjs/common";
import { assertValidGrade } from "./grade-validation";

describe("assertValidGrade", () => {
  it("rejects invalid grade values", () => {
    expect(() => assertValidGrade("HACKED")).toThrow(BadRequestException);
  });

  it("accepts valid grade values", () => {
    expect(() => assertValidGrade("A+")).not.toThrow();
  });

  it("accepts lowercase by normalizing", () => {
    expect(() => assertValidGrade("a+")).not.toThrow();
  });

  it("rejects empty string", () => {
    expect(() => assertValidGrade("")).toThrow(BadRequestException);
  });

  it("accepts grade with spaces after trimming", () => {
    expect(() => assertValidGrade(" A ")).not.toThrow();
  });

  it("rejects numeric string", () => {
    expect(() => assertValidGrade("100")).toThrow(BadRequestException);
  });
});
