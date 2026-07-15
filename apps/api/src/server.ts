import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp(env);
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  app.log.info(
    `API Posto Barato em http://${env.API_HOST}:${env.API_PORT}${'/api/v1'} — docs em /docs`,
  );
}

main().catch((err: unknown) => {
  console.error('Falha ao iniciar a API:', err);
  process.exit(1);
});
