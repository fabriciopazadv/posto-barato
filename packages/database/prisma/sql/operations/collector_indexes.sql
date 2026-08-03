-- Índices recomendados nas tabelas do coletor — EXECUTADO PELO ADMINISTRADOR.
--
-- NÃO é migração e NÃO roda por `pnpm db:migrate`. A Fase 2 não altera as
-- tabelas do coletor por conta própria, nem para acrescentar índice: é o banco
-- de outro time, e um índice criado sem combinar muda o plano de escrita da
-- coleta. Este arquivo é a proposta, para revisão e execução de quem administra.
--
-- CONCURRENTLY em todos: nenhum destes comandos bloqueia a coleta em andamento.
-- Por isso o arquivo NÃO pode rodar dentro de transação —
--   psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f collector_indexes.sql
-- e nunca com `-1`/`--single-transaction`.
--
-- Se um índice ficar INVALID (falha no meio), remova-o antes de repetir:
--   SELECT c.relname FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
--   WHERE NOT i.indisvalid;

-- ---------------------------------------------------------------------------
-- 1. Observação mais recente por (posto, produto) pela data de negócio.
-- ---------------------------------------------------------------------------
-- É a consulta que constrói a projeção pública inteira: DISTINCT ON
-- (station_id, product_id) ORDER BY data_de_negócio DESC. Sem este índice o
-- refresh ordena o histórico completo em disco a cada execução.
--
-- A expressão precisa ser idêntica à usada na matview, ou o planner não a
-- reconhece.
CREATE INDEX CONCURRENTLY IF NOT EXISTS price_observations_latest_idx
  ON public.price_observations
     (station_id, product_id, (COALESCE(observed_at, estimated_observed_at, collected_at)) DESC);

-- ---------------------------------------------------------------------------
-- 2. Filtro por status.
-- ---------------------------------------------------------------------------
-- A view de compatibilidade filtra status IN ('APPROVED','EXPIRED'). Índice
-- parcial porque é sempre esse recorte que interessa à Fase 2, e um índice
-- parcial é menor e mais barato de manter do que um sobre a coluna inteira.
CREATE INDEX CONCURRENTLY IF NOT EXISTS price_observations_publishable_idx
  ON public.price_observations (station_id, product_id)
  WHERE status IN ('APPROVED', 'EXPIRED');

-- ---------------------------------------------------------------------------
-- 3. Histórico por posto e janela de tempo.
-- ---------------------------------------------------------------------------
-- GET /stations/:id/history agrega por dia dentro de 7/30/90 dias.
CREATE INDEX CONCURRENTLY IF NOT EXISTS price_observations_station_observed_idx
  ON public.price_observations
     (station_id, product_id, collected_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Município/UF.
-- ---------------------------------------------------------------------------
-- Usado pelo refresh ao juntar postos e por qualquer recorte regional.
CREATE INDEX CONCURRENTLY IF NOT EXISTS stations_municipality_state_idx
  ON public.stations (municipality, state);

-- ---------------------------------------------------------------------------
-- Verificação depois de criar
-- ---------------------------------------------------------------------------
-- Confirme que o refresh passou a usar o índice antes de considerar o trabalho
-- feito — índice que o planner ignora é custo de escrita sem contrapartida:
--
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT DISTINCT ON (po.station_id, po.product_id) po.id
--   FROM public.price_observations po
--   WHERE po.status IN ('APPROVED','EXPIRED')
--   ORDER BY po.station_id, po.product_id,
--            COALESCE(po.observed_at, po.estimated_observed_at, po.collected_at) DESC;
--
-- Espera-se "Index Scan"/"Index Only Scan" no lugar de "Seq Scan + Sort".
-- Em tabela pequena o planner escolhe Seq Scan de propósito, e está certo: o
-- ganho aparece com volume, e é com volume que a medição deve ser refeita.
