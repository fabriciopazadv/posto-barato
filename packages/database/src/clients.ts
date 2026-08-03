/**
 * Conexões do banco, separadas por privilégio.
 *
 * A Fase 2 fala com um único PostgreSQL, mas nunca com um único usuário. Cada
 * papel recebe uma conexão própria, e é o banco — não o código — que impede uma
 * rota pública de preços de escrever:
 *
 *   readonly  → `price_reader`     preços, catálogo, municípios, histórico
 *   app       → `app_writer`       contas, sessões, assinatura e cobrança
 *   migration → `migration_admin`  exclusivo do comando de migração
 *
 * Prisma gera um cliente por schema, não um por conexão — a separação sai de
 * instanciar o MESMO cliente gerado com `datasourceUrl` diferente. Isso dá
 * pools independentes e credenciais independentes; o que ele não dá é
 * verificação em tempo de compilação de que um serviço não usou o cliente
 * errado. Quem garante isso é o grant no banco: `price_reader` não tem INSERT
 * em lugar nenhum, então um erro de import vira erro na hora, não vazamento.
 */
import { PrismaClient } from '@prisma/client';

export type DatabaseRole = 'readonly' | 'app' | 'migration';

const ENV_VAR: Record<DatabaseRole, string> = {
  readonly: 'DATABASE_READONLY_URL',
  app: 'DATABASE_APP_URL',
  migration: 'DATABASE_MIGRATION_URL',
};

/**
 * Esconde a senha de uma URL de conexão. Toda mensagem de erro e todo log que
 * mencione conexão passa por aqui: um "não consegui conectar" com a senha
 * inteira no texto vira credencial vazada em agregador de log.
 */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '<url de conexão inválida>';
  }
}

/**
 * Resolve a URL de um papel.
 *
 * Fora de produção, `DATABASE_URL` cobre os três — é o banco local do compose,
 * com um usuário só, e exigir quatro variáveis para rodar `pnpm dev:api` só
 * faria as pessoas apontarem todas para o mesmo lugar. Em produção a ausência é
 * erro: cair no genérico em silêncio é exatamente como uma API pública acaba
 * conectada com um superusuário.
 */
export function resolveDatabaseUrl(
  role: DatabaseRole,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const specific = env[ENV_VAR[role]]?.trim();
  if (specific) return specific;

  const generic = env.DATABASE_URL?.trim();
  if (env.NODE_ENV === 'production') {
    throw new Error(
      `${ENV_VAR[role]} não definida. Em produção cada papel usa a própria credencial; ` +
        'DATABASE_URL não substitui nenhuma delas.',
    );
  }
  if (!generic) {
    throw new Error(`${ENV_VAR[role]} não definida (nem DATABASE_URL como alternativa local).`);
  }
  return generic;
}

const cache = new Map<DatabaseRole, PrismaClient>();

function create(role: DatabaseRole): PrismaClient {
  return new PrismaClient({
    datasourceUrl: resolveDatabaseUrl(role),
    log: ['warn', 'error'],
  });
}

/** Conexão por papel, criada sob demanda e reaproveitada. */
export function db(role: DatabaseRole): PrismaClient {
  let client = cache.get(role);
  if (!client) {
    client = create(role);
    cache.set(role, client);
  }
  return client;
}

/** Leitura pública: preços, catálogo, municípios e histórico. Nunca escreve. */
export function readonlyDb(): PrismaClient {
  return db('readonly');
}

/** Contas, sessões, assinatura e cobrança. Única conexão da API que escreve. */
export function appDb(): PrismaClient {
  return db('app');
}

/**
 * Substitui um cliente — para testes apontarem os dois papéis a um banco
 * descartável, ou injetarem um dublê. Devolve uma função que restaura o
 * estado anterior.
 */
export function setDatabaseClient(role: DatabaseRole, client: PrismaClient): () => void {
  const previous = cache.get(role);
  cache.set(role, client);
  return () => {
    if (previous) cache.set(role, previous);
    else cache.delete(role);
  };
}

/** Encerra os pools abertos. Chamado no shutdown da API e no fim dos testes. */
export async function disconnectDatabases(): Promise<void> {
  const clients = [...cache.values()];
  cache.clear();
  await Promise.all(clients.map((c) => c.$disconnect()));
}
