import type { ApiError } from '@posto-barato/shared-types';

import { API_BASE_URL } from './config';

/** Erro de API com o código da especificação (VALIDATION_ERROR, NOT_FOUND, …). */
export class PostoBaratoApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(code: string, message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'PostoBaratoApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

function isApiError(body: unknown): body is ApiError {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as ApiError).error?.code === 'string'
  );
}

export type QueryValue = string | number | boolean | undefined | null;

export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Chamada à API pública. Sempre `credentials: 'include'` — a autenticação web
 * usa refresh token em cookie HttpOnly (o access token vai no header).
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (API_BASE_URL === null) {
    throw new PostoBaratoApiError(
      'NO_API_CONFIGURED',
      'NEXT_PUBLIC_API_URL não está definida.',
      0,
    );
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new PostoBaratoApiError(
      'NETWORK_ERROR',
      'Não foi possível falar com o servidor. Verifique sua conexão.',
      0,
    );
  }

  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (isApiError(body)) {
      throw new PostoBaratoApiError(
        body.error.code,
        body.error.message,
        response.status,
        body.error.requestId,
      );
    }
    throw new PostoBaratoApiError(
      'INTERNAL_ERROR',
      `Erro inesperado (HTTP ${response.status}).`,
      response.status,
    );
  }

  return body as T;
}
