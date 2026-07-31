'use client';

import { useCallback, useEffect, useState } from 'react';

import { PostoBaratoApiError } from './http';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Carrega dados no cliente com estados de carregando/erro.
 *
 * O app é exportado estaticamente, então toda leitura acontece no navegador —
 * não há data fetching de servidor para reaproveitar.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // A identidade de `fn` muda a cada render; `deps` é quem controla o recarregamento.
  const run = useCallback(fn, deps);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    run()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof PostoBaratoApiError
            ? err.message
            : 'Não foi possível carregar os dados agora.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [run, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}
