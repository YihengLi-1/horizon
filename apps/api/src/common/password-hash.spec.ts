import argon2 from "argon2";
import bcrypt from "bcryptjs";
import { verifyPasswordHash } from "./password-hash";

describe("verifyPasswordHash", () => {
  it("returns false for empty hash", async () => {
    await expect(verifyPasswordHash("", "anypassword")).resolves.toBe(false);
  });

  it("verifies a valid argon2 hash correctly", async () => {
    const hash = await argon2.hash("TestPass1!");
    await expect(verifyPasswordHash(hash, "TestPass1!")).resolves.toBe(true);
  });

  it("rejects wrong password for argon2 hash", async () => {
    const hash = await argon2.hash("TestPass1!");
    await expect(verifyPasswordHash(hash, "WrongPass")).resolves.toBe(false);
  });

  it("verifies a valid bcrypt hash correctly", async () => {
    const hash = await bcrypt.hash("BcryptPass1!", 4);
    await expect(verifyPasswordHash(hash, "BcryptPass1!")).resolves.toBe(true);
  });

  it("rejects wrong password for bcrypt hash", async () => {
    const hash = await bcrypt.hash("BcryptPass1!", 4);
    await expect(verifyPasswordHash(hash, "WrongPass")).resolves.toBe(false);
  });

  it("returns false for a malformed hash (not bcrypt, not valid argon2)", async () => {
    // A malformed hash should trigger the argon2 catch block → returns false
    await expect(verifyPasswordHash("not-a-valid-hash-at-all", "anypassword")).resolves.toBe(false);
  });
});
