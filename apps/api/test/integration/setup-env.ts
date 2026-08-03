/**
 * Ambiente dos testes de integração, aplicado em cada worker antes dos testes.
 *
 * O ponto é apontar a API para as credenciais RESTRITAS, e não para o usuário
 * dono do banco: é isso que faz uma escrita indevida numa rota pública falhar
 * aqui em vez de em produção.
 */
import { TEST_PASSWORDS } from './helpers/database.js';

const adminUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl) {
  throw new Error(
    'TEST_DATABASE_URL não definida. Os testes de integração precisam de um PostgreSQL 16 ' +
      'com PostGIS e de um banco descartável — veja docs/operations/database-integration.md.',
  );
}

function urlFor(role: keyof typeof TEST_PASSWORDS): string {
  const url = new URL(adminUrl!);
  url.username = role;
  url.password = TEST_PASSWORDS[role];
  return url.toString();
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_READONLY_URL = urlFor('price_reader');
process.env.DATABASE_APP_URL = urlFor('app_writer');
// A API não recebe credencial de migração nem em teste.
delete process.env.DATABASE_MIGRATION_URL;

process.env.AUTH_ACCESS_SECRET ??= 'segredo-de-teste-com-pelo-menos-32-caracteres';
process.env.COOKIE_SECURE = 'false';
process.env.DEMO_MODE = 'false';
// Rate limit alto: os testes fazem muitas chamadas seguidas do mesmo IP e o
// objetivo aqui não é exercitar o limitador.
process.env.RATE_LIMIT_MAX = '10000';
// Uma linha de log por requisição afogaria o relatório do vitest.
process.env.LOG_LEVEL = 'fatal';
