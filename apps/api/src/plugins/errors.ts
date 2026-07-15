import { randomUUID } from 'node:crypto';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/** Erro de API com código estável e status HTTP. */
export class ApiException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiException';
  }
}

export const notFound = (msg = 'Recurso não encontrado') =>
  new ApiException(404, 'NOT_FOUND', msg);
export const badRequest = (msg: string) => new ApiException(400, 'BAD_REQUEST', msg);

/**
 * Tratamento central de erros (seção 2/28). Nunca vaza stack traces ou detalhes
 * internos ao cliente; registra logs estruturados com request_id.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = (request.id as string) || randomUUID();

    if (error instanceof ApiException) {
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, requestId },
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          requestId,
        },
      });
      return;
    }

    if (error.statusCode === 429) {
      reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Tente novamente em instantes.', requestId },
      });
      return;
    }

    // Erro inesperado: loga completo no servidor, resposta genérica ao cliente.
    request.log.error({ err: error, requestId }, 'erro não tratado');
    reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente mais tarde.', requestId },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Rota não encontrada.', requestId: request.id },
    });
  });
}
