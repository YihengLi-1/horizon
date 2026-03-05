import argon2 from "argon2";
import bcrypt from "bcryptjs";

function isBcryptHash(hash: string): boolean {
  return /^\$2[abyx]?\$/.test(hash);
}

export async function verifyPasswordHash(hash: string, password: string): Promise<boolean> {
  if (!hash) return false;

  if (isBcryptHash(hash)) {
    return bcrypt.compare(password, hash);
  }

  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
