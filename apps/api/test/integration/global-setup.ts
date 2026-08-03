/**
 * Monta o banco descartável uma vez, antes de toda a suíte de integração.
 *
 * Roda `reset → fixture do coletor → migrações versionadas → papéis → grants`,
 * exatamente a sequência da implantação, para que o que os testes verificam
 * seja o schema que vai para produção.
 */
import { ADMIN_URL, prepareTestDatabase } from './helpers/database.js';

export async function setup(): Promise<void> {
  if (!ADMIN_URL) {
    throw new Error(
      'TEST_DATABASE_URL não definida. Os testes de integração precisam de um PostgreSQL 16 ' +
        'com PostGIS. Veja docs/operations/database-integration.md.',
    );
  }
  process.env.NODE_ENV = 'test';
  await prepareTestDatabase();
}
