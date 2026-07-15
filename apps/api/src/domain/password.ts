import argon2 from 'argon2';

/**
 * Hash de senha com Argon2id (seção 14). Nunca logar senha ou hash.
 */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password).catch(() => false);
}
