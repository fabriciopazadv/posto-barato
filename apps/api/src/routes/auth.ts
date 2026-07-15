import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AuthResponse } from '@posto-barato/shared-types';
import type { AppContext } from '../context.js';
import { badRequest } from '../plugins/errors.js';
import { loginBody, refreshBody, registerBody } from '../auth-schemas.js';
import {
  authenticateUser,
  EmailInUseError,
  getUserById,
  issueTokenPair,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
  toAuthUser,
  UnauthorizedError,
} from '../services/auth.service.js';

const REFRESH_COOKIE = 'pb_refresh';

function cookiePath(): string {
  return '/api/v1/auth';
}

function setRefreshCookie(reply: FastifyReply, token: string, ctx: AppContext): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: ctx.auth.cookieSecure,
    sameSite: 'lax',
    path: cookiePath(),
    maxAge: ctx.auth.refreshTtlDays * 24 * 60 * 60,
  });
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, { path: cookiePath() });
}

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post(
    '/auth/register',
    {
      schema: { tags: ['auth'], summary: 'Cria uma conta' },
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (request, reply) => {
      const body = registerBody.parse(request.body);
      let user;
      try {
        user = await registerUser(body.email, body.password, body.name);
      } catch (err) {
        if (err instanceof EmailInUseError) throw badRequest(err.message);
        throw err;
      }
      const tokens = await issueTokenPair(user.id, ctx.auth);
      const response = respond(user, tokens, body.clientType, reply, ctx);
      reply.status(201);
      return response;
    },
  );

  app.post(
    '/auth/login',
    {
      schema: { tags: ['auth'], summary: 'Login' },
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (request, reply) => {
      const body = loginBody.parse(request.body);
      const user = await authenticateUser(body.email, body.password);
      const tokens = await issueTokenPair(user.id, ctx.auth);
      return respond(user, tokens, body.clientType, reply, ctx);
    },
  );

  app.post(
    '/auth/refresh',
    { schema: { tags: ['auth'], summary: 'Renova o access token (rotaciona o refresh token)' } },
    async (request, reply) => {
      const body = refreshBody.parse(request.body ?? {});
      const cookieToken = request.cookies[REFRESH_COOKIE];
      const presentedToken = body.clientType === 'mobile' ? body.refreshToken : cookieToken;
      if (!presentedToken) {
        throw new UnauthorizedError('Refresh token ausente.');
      }

      const { tokens, userId } = await rotateRefreshToken(presentedToken, ctx.auth);
      const user = await getUserById(userId);
      return respond(user, tokens, body.clientType, reply, ctx);
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], summary: 'Encerra a sessão atual' } },
    async (request, reply) => {
      const body = refreshBody.parse(request.body ?? {});
      const cookieToken = request.cookies[REFRESH_COOKIE];
      const presentedToken = body.clientType === 'mobile' ? body.refreshToken : cookieToken;
      if (presentedToken) {
        await revokeRefreshToken(presentedToken);
      }
      clearRefreshCookie(reply);
      reply.status(204);
    },
  );

  app.get(
    '/auth/me',
    {
      schema: { tags: ['auth'], summary: 'Dados da conta autenticada' },
      preHandler: app.requireAuth,
    },
    async (request) => toAuthUser(request.user!),
  );
}

function respond(
  user: Parameters<typeof toAuthUser>[0],
  tokens: Awaited<ReturnType<typeof issueTokenPair>>,
  clientType: 'web' | 'mobile',
  reply: FastifyReply,
  ctx: AppContext,
): AuthResponse {
  if (clientType === 'mobile') {
    return { user: toAuthUser(user), tokens };
  }
  setRefreshCookie(reply, tokens.refreshToken!, ctx);
  return {
    user: toAuthUser(user),
    tokens: { accessToken: tokens.accessToken, accessTokenExpiresAt: tokens.accessTokenExpiresAt },
  };
}
