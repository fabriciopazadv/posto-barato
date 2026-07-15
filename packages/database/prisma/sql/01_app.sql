-- Schema `app` da Fase 2 (Plataforma Posto Barato).
--
-- Habilita PostGIS (ausente na Fase 1 — seção 9) e cria a CAMADA PÚBLICA
-- DERIVADA (seção 8): uma materialized view que contém EXCLUSIVAMENTE campos
-- públicos. É a fronteira de segurança física — evidências, raw_visible_data,
-- caminhos de screenshot/HTML e nomes internos simplesmente não existem aqui.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS app;

-- Postos demonstrativos (seed). Permite rotular "Dados demonstrativos" e nunca
-- misturar silenciosamente demo com produção.
CREATE TABLE IF NOT EXISTS app.demo_stations (
  station_id uuid PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Observação válida mais recente por (posto, produto), já com geografia PostGIS.
DROP MATERIALIZED VIEW IF EXISTS app.public_latest_prices CASCADE;
CREATE MATERIALIZED VIEW app.public_latest_prices AS
SELECT DISTINCT ON (po.station_id, po.product_id)
  po.station_id,
  po.product_id,
  s.display_name        AS station_name,
  s.display_address     AS station_address,
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
  END                   AS geog,
  p.canonical_code      AS product_code,
  p.canonical_name      AS product_name,
  po.price_decimal      AS price,
  po.currency,
  po.unit,
  po.estimated_observed_at,
  po.estimated_time,
  po.collected_at,
  po.confidence_score,
  (ds.station_id IS NOT NULL) AS is_demo
FROM collector.price_observations po
JOIN collector.stations s ON s.id = po.station_id AND s.active
JOIN collector.products p ON p.id = po.product_id AND p.active
LEFT JOIN app.demo_stations ds ON ds.station_id = po.station_id
ORDER BY po.station_id, po.product_id, po.collected_at DESC, po.created_at DESC;

-- Índice único exigido para REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS public_latest_prices_pk
  ON app.public_latest_prices (station_id, product_id);
-- Índice geoespacial para consultas por proximidade (ST_DWithin / KNN).
CREATE INDEX IF NOT EXISTS public_latest_prices_geog_idx
  ON app.public_latest_prices USING GIST (geog);
-- Índices auxiliares para filtros/ordenações frequentes.
CREATE INDEX IF NOT EXISTS public_latest_prices_product_idx
  ON app.public_latest_prices (product_code);
CREATE INDEX IF NOT EXISTS public_latest_prices_muni_idx
  ON app.public_latest_prices (municipality, state);
CREATE INDEX IF NOT EXISTS public_latest_prices_price_idx
  ON app.public_latest_prices (price);

-- Refresh idempotente. Chamado pelo worker após cada coleta relevante
-- (seção 29: invalidar cache/derivados após novas observações).
CREATE OR REPLACE FUNCTION app.refresh_public_prices()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY app.public_latest_prices;
  EXCEPTION WHEN OTHERS THEN
    -- Primeira carga (matview ainda não populada) não aceita CONCURRENTLY.
    REFRESH MATERIALIZED VIEW app.public_latest_prices;
  END;
END $$;
