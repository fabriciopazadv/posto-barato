import { prisma } from '@posto-barato/database';
import type { AuthUser, TokenPair } from '@posto-barato/shared-types';
import { hashPassword, verifyPassword } from '../domain/password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from '../domain/tokens.js';

export class UnauthorizedError extends Error {
  constructor(message = 'Não autenticado.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class EmailInUseError extends Error {
  constructor() {
    super('Este e-mail já tem conta. Tente entrar.');
    this.name = 'EmailInUseError';
  }
}

interface AuthTokenConfig {
  accessSecret: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
}

interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  premiumSince: Date | null;
  createdAt: Date;
}

export function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isPremium: user.premiumSince !== null,
    premiumSince: user.premiumSince ? user.premiumSince.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function registerUser(
  email: string,
  password: string,
  name: string | undefined,
): Promise<UserRecord> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new EmailInUseError();

  return prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), name },
    select: { id: true, email: true, name: true, premiumSince: true, createdAt: true },
  });
}

export async function authenticateUser(email: string, password: string): Promise<UserRecord> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new UnauthorizedError('E-mail ou senha incorretos.');
  }
  return user;
}

export async function getUserById(userId: string): Promise<UserRecord> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, premiumSince: true, createdAt: true },
  });
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Emite access + refresh token; persiste apenas o hash do refresh (rotativo). */
export async function issueTokenPair(userId: string, config: AuthTokenConfig): Promise<TokenPair> {
  const accessToken = await signAccessToken({ userId }, config.accessSecret, config.accessTtlSeconds);
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashRefreshToken(refreshToken), expiresAt },
  });

  return {
    accessToken,
    accessTokenExpiresAt: new Date(Date.now() + config.accessTtlSeconds * 1000).toISOString(),
    refreshToken,
  };
}

/**
 * Rotaciona o refresh token: revoga o usado e emite um novo par. Se o token
 * apresentado já estiver revogado, é sinal de reuso (possível roubo) — todas
 * as sessões do usuário são revogadas por precaução.
 */
export async function rotateRefreshToken(
  refreshToken: string,
  config: AuthTokenConfig,
): Promise<{ tokens: TokenPair; userId: string }> {
  const tokenHash = hashRefreshToken(refreshToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!record) throw new UnauthorizedError('Sessão inválida.');

  if (record.revokedAt || record.expiresAt.getTime() < Date.now()) {
    if (record.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw new UnauthorizedError('Sessão expirada. Faça login novamente.');
  }

  const tokens = await issueTokenPair(record.userId, config);
  const newHash = hashRefreshToken(tokens.refreshToken!);
  const newRecord = await prisma.refreshToken.findUnique({ where: { tokenHash: newHash } });
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date(), replacedById: newRecord?.id },
  });

  return { tokens, userId: record.userId };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function resolveUserFromAccessToken(
  token: string,
  secret: string,
): Promise<UserRecord> {
  const payload = await verifyAccessToken(token, secret);
  if (!payload) throw new UnauthorizedError();
  return getUserById(payload.userId);
}
