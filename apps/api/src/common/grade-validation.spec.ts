import { BadRequestException } from "@nestjs/common";
import { assertValidGrade } from "./grade-validation";

describe("assertValidGrade", () => {
  it("rejects invalid grade values", () => {
    expect(() => assertValidGrade("HACKED")).toThrow(BadRequestException);
  });

  it("accepts valid grade values", () => {
    expect(() => assertValidGrade("A+")).not.toThrow();
  });
});
