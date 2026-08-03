/**
 * Ponto de entrada do pacote de banco.
 *
 * Não existe mais um `prisma` genérico exportado daqui. Havia um, e ele era a
 * mesma conexão para ler preço público e para gravar cobrança — um import
 * distraído bastava para uma rota de leitura ganhar permissão de escrita.
 * Agora quem consome escolhe o papel explicitamente:
 *
 *   readonlyDb()  preços, catálogo, municípios, histórico  (price_reader)
 *   appDb()       contas, sessões, assinatura, cobrança     (app_writer)
 *
 * A escolha errada não é pega pelo TypeScript — é pega pelo Postgres, que não
 * concede INSERT a `price_reader` em lugar nenhum.
 */
export * from '@prisma/client';

export {
  appDb,
  db,
  disconnectDatabases,
  readonlyDb,
  redactDatabaseUrl,
  resolveDatabaseUrl,
  setDatabaseClient,
  type DatabaseRole,
} from './clients.js';

/** Projeção pública derivada — a fronteira física entre o coletor e o cliente. */
export const PUBLIC_PRICES_VIEW = 'app.public_latest_prices';
