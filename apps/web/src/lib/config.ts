/**
 * Origem dos dados do app.
 *
 * Com `NEXT_PUBLIC_API_URL` definida, o app fala com a API pública real. Sem
 * ela, cai para a camada de demonstração (`mock.ts`), que reproduz o seed de
 * Rondonópolis/MT usando as mesmas regras de domínio da API. Isso permite ter
 * o app navegável e publicado antes de a API estar no ar.
 *
 * A variável precisa do prefixo NEXT_PUBLIC_ porque é lida no navegador — o
 * app é exportado estaticamente e não tem lado servidor.
 */
const raw = process.env.NEXT_PUBLIC_API_URL?.trim();

export const API_BASE_URL: string | null =
  raw && raw.length > 0 ? raw.replace(/\/+$/, '') : null;

/** true quando não há API configurada e o app roda em modo demonstração. */
export const USING_MOCK = API_BASE_URL === null;

/** Origem apresentada ao usuário. Nunca a fonte interna da coleta. */
export const SOURCE_NAME = 'Banco de Dados Posto Barato';
