-- 0004 — Projeção pública `app.public_latest_prices` sobre as views do coletor.
--
-- Fronteira física: o que não existe como coluna aqui não tem como vazar pela
-- API, independentemente do que o código de projeção fizer.
--
-- ---------------------------------------------------------------------------
-- Regra adotada para observações EXPIRED
-- ---------------------------------------------------------------------------
-- O coletor marca uma observação como EXPIRED quando ela passa de `expires_at`.
-- Ela foi validada um dia — o que mudou foi o relógio, não a procedência.
--
-- Decisão: EXPIRED é PUBLICADA, com marca. PENDING e REJECTED nunca são
-- (a view collector.price_observations já as filtra na origem).
--
-- Por quê: esconder a observação expirada faz o posto sumir do mapa, e um posto
-- ausente é lido pelo usuário como "não existe", não como "não sabemos o preço
-- de hoje". Mostrar o último preço conhecido com aviso explícito é o que o app
-- já sabe fazer — a classificação de frescor tem a faixa EXPIRED desde o
-- primeiro incremento, e o detalhe do posto emite aviso próprio.
--
-- Como a marca chega à API: as colunas `price_status` e `expires_at` viajam na
-- projeção, e a API deriva o vencimento no instante da consulta. A avaliação
-- fica no momento da leitura de propósito: `now()` congelado no refresh diria
-- que um preço está válido horas depois de ter vencido.
--
-- ---------------------------------------------------------------------------
-- Escolha da observação mais recente
-- ---------------------------------------------------------------------------
-- Pela DATA DE NEGÓCIO — COALESCE(observed_at, estimated_observed_at,
-- collected_at) — que é quando o preço valia na bomba. `collected_at` e
-- `created_at` entram só como desempate: são quando *nós* vimos o dado, e
-- ordenar por eles faria uma recoleta de um preço antigo passar na frente de
-- uma observação genuinamente mais nova.

-- ---------------------------------------------------------------------------
-- Substituição preservando grants
-- ---------------------------------------------------------------------------
-- Postgres não tem CREATE OR REPLACE MATERIALIZED VIEW, então substituir exige
-- DROP + CREATE — e um DROP leva junto os privilégios concedidos. Salvamos os
-- grants antes e os reaplicamos depois, para que uma migração não deixe
-- `price_reader` sem acesso e a API fora do ar até alguém rodar grants.sql.
--
-- Sem CASCADE: se existir um objeto dependente que não conhecemos, queremos a
-- migração falhando e o administrador decidindo, não uma remoção em silêncio.
--
-- Tabela comum, e não TEMP ... ON COMMIT DROP: o migrador roda cada arquivo em
-- uma transação, mas um `psql -f` avulso roda em autocommit, e ali a temporária
-- desapareceria no commit da própria instrução que a criou — os grants sumiriam
-- em silêncio justamente no caminho manual.
-- pg_class.relacl, e não information_schema.role_table_grants: o catálogo padrão
-- SQL não lista materialized views. A consulta óbvia devolve ZERO linhas mesmo
-- com grants concedidos, e a "preservação" apagaria silenciosamente o acesso de
-- price_reader — derrubando a API no primeiro deploy que recriasse a projeção.
--
-- `grantee <> 0` descarta PUBLIC, que não é um papel nomeado e não é recriável
-- por GRANT ... TO %I.
DROP TABLE IF EXISTS app._migration_saved_grants;
CREATE TABLE app._migration_saved_grants AS
SELECT pg_get_userbyid(a.grantee) AS grantee,
       a.privilege_type,
       a.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
WHERE n.nspname = 'app'
  AND c.relname = 'public_latest_prices'
  AND a.grantee <> 0
  AND pg_get_userbyid(a.grantee) <> current_user;

DROP MATERIALIZED VIEW IF EXISTS app.public_latest_prices;

CREATE MATERIALIZED VIEW app.public_latest_prices AS
SELECT DISTINCT ON (po.station_id, po.product_id)
  po.station_id,
  po.product_id,
  s.display_name    AS station_name,
  s.display_address AS station_address,
  s.neighborhood,
  s.municipality,
  s.state,
  s.postal_code,
  s.latitude,
  s.longitude,
  CASE
    WHEN s.latitude IS NOT NULL AND s.longitude IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(s.longitude::float8, s.latitude::float8), 4326)::geography
    ELSE NULL
  END               AS geog,
  p.canonical_code  AS product_code,
  p.canonical_name  AS product_name,
  po.price_decimal  AS price,
  po.currency,
  po.unit,
  -- Data de negócio: quando o preço valia, não quando o coletamos.
  COALESCE(po.observed_at, po.estimated_observed_at, po.collected_at) AS observed_at,
  -- Só é hora firme quando o coletor leu a hora real da observação.
  (po.observed_at IS NULL) AS observed_at_estimated,
  po.collected_at,
  po.status         AS price_status,
  po.expires_at,
  po.confidence_score,
  ds.public_name    AS source_name,
  (dem.station_id IS NOT NULL) AS is_demo
FROM collector.price_observations po
JOIN collector.stations s    ON s.id = po.station_id AND s.active
JOIN collector.products p    ON p.id = po.product_id AND p.active
JOIN collector.data_sources ds ON ds.id = po.data_source_id
LEFT JOIN app.demo_stations dem ON dem.station_id = po.station_id
ORDER BY
  po.station_id,
  po.product_id,
  COALESCE(po.observed_at, po.estimated_observed_at, po.collected_at) DESC,
  po.collected_at DESC,
  po.created_at DESC;

-- Exigido por REFRESH ... CONCURRENTLY, e é a chave natural da projeção.
CREATE UNIQUE INDEX public_latest_prices_pk
  ON app.public_latest_prices (station_id, product_id);
-- Proximidade (ST_DWithin / KNN) sem varrer linha a linha.
CREATE INDEX public_latest_prices_geog_idx
  ON app.public_latest_prices USING GIST (geog);
-- Filtro mais comum do app: município + UF, frequentemente com produto.
CREATE INDEX public_latest_prices_muni_product_idx
  ON app.public_latest_prices (municipality, state, product_code);
-- Ordenação por menor preço dentro de um produto.
CREATE INDEX public_latest_prices_product_price_idx
  ON app.public_latest_prices (product_code, price);
-- `sort=most_recent` e o filtro `updatedWithinHours` usam a data de negócio.
CREATE INDEX public_latest_prices_observed_at_idx
  ON app.public_latest_prices (observed_at DESC);
-- Detalhe do posto e comparador buscam todas as linhas de um posto.
CREATE INDEX public_latest_prices_station_idx
  ON app.public_latest_prices (station_id);

DO $$
DECLARE
  g record;
BEGIN
  FOR g IN SELECT * FROM app._migration_saved_grants LOOP
    EXECUTE format(
      'GRANT %s ON app.public_latest_prices TO %I%s',
      g.privilege_type, g.grantee,
      CASE WHEN g.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END
    );
  END LOOP;
END $$;

DROP TABLE app._migration_saved_grants;

COMMENT ON MATERIALIZED VIEW app.public_latest_prices IS
  'Observação publicável mais recente por (posto, produto), pela data de negócio. Só colunas públicas. EXPIRED é publicada com marca; PENDING e REJECTED nunca chegam aqui.';
