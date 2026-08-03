import { disconnectDatabases } from '@posto-barato/database';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp(env);

  // Encerramento ordenado: fecha o servidor HTTP antes dos pools do banco, para
  // que nenhuma requisição em voo perca a conexão no meio.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void (async () => {
        app.log.info(`${signal} recebido; encerrando.`);
        await app.close();
        await disconnectDatabases();
        process.exit(0);
      })();
    });
  }

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  app.log.info(
    `API Posto Barato em http://${env.API_HOST}:${env.API_PORT}${'/api/v1'} — docs em /docs`,
  );
}

main().catch((err: unknown) => {
  console.error('Falha ao iniciar a API:', err);
  process.exit(1);
});
