import { randomBytes, createHash } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export interface AccessTokenPayload {
  userId: string;
}

/**
 * Access token JWT de curta duração (stateless, seção 14). Assinado com
 * HS256; a chave nunca é logada.
 */
export async function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  return new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (typeof payload.userId === 'string') {
      return { userId: payload.userId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Refresh token opaco de alta entropia (256 bits). O valor cru só existe no
 * cliente; o servidor armazena apenas o hash (sha256 é suficiente aqui — o
 * token já tem entropia alta, diferente de senhas escolhidas por humanos).
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
