import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { resolveUserFromAccessToken, UnauthorizedError } from '../services/auth.service.js';

interface AuthUserRecord {
  id: string;
  email: string;
  name: string | null;
  premiumSince: Date | null;
  createdAt: Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUserRecord;
  }
}

function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/**
 * Decora `request.user` quando há um access token válido, sem exigi-lo
 * (para rotas públicas que variam o comportamento se logado). Use
 * `requireAuth` como preHandler nas rotas que exigem sessão.
 */
export const registerAuthPlugin = fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('user', undefined);

  app.decorate('authenticateOptional', async (request: FastifyRequest) => {
    const token = extractBearerToken(request);
    if (!token) return;
    try {
      request.user = await resolveUserFromAccessToken(token, app.authSecret);
    } catch {
      // token ausente/expirado: segue sem usuário, rota decide o que fazer.
    }
  });

  app.decorate('requireAuth', async (request: FastifyRequest) => {
    const token = extractBearerToken(request);
    if (!token) throw new UnauthorizedError('Envie o access token em Authorization: Bearer.');
    request.user = await resolveUserFromAccessToken(token, app.authSecret);
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authSecret: string;
    authenticateOptional: (request: FastifyRequest) => Promise<void>;
    requireAuth: (request: FastifyRequest) => Promise<void>;
  }
}
