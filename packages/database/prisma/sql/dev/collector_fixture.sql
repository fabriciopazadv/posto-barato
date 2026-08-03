-- FIXTURE DE DESENVOLVIMENTO E TESTE — NÃO É O COLETOR.
--
-- Este arquivo NÃO faz parte das migrações e NUNCA roda contra o banco real. Ele
-- não é uma reprodução fiel do coletor da Fase 1: é o mínimo de estrutura, no
-- formato que a Fase 2 espera encontrar, para que `docker compose up` e os
-- testes de integração tenham o que ler. Colunas, tipos e restrições do coletor
-- real podem divergir — a fonte de verdade é o repositório da Fase 1.
--
-- Ele cria as tabelas em `public.*` (e não em `collector.*`) justamente porque é
-- ali que o coletor real escreve: assim o ambiente local exercita o mesmo
-- caminho de views de compatibilidade que a produção usa, em vez de um atalho
-- que só funciona em desenvolvimento.
--
-- As tabelas de evidência abaixo existem para um fim só: provar nos testes que
-- `price_reader` NÃO consegue lê-las.

DO $$ BEGIN
  CREATE TYPE public."ObservationStatus" AS ENUM ('PENDING','APPROVED','REJECTED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public."CollectionRunStatus" AS ENUM
    ('RUNNING','SUCCESS','PARTIAL_SUCCESS','FAILED','AUTH_REQUIRED','BLOCKED','CAPTCHA_DETECTED','SECURITY_CHALLENGE','PAGE_CHANGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.data_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_name text UNIQUE NOT NULL,
  public_name   text NOT NULL,
  source_type   text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collection_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  status             public."CollectionRunStatus" NOT NULL DEFAULT 'RUNNING',
  municipality       text NOT NULL,
  state              text NOT NULL,
  products_requested jsonb NOT NULL,
  screenshot_path    text,
  html_snapshot_path text,
  error_message      text,
  browser_version    text,
  collector_version  text NOT NULL,
  host_name          text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name      text NOT NULL,
  display_name         text NOT NULL,
  normalized_address   text NOT NULL,
  display_address      text NOT NULL,
  neighborhood         text,
  municipality         text NOT NULL,
  state                text NOT NULL,
  postal_code          text,
  latitude             numeric(9,6),
  longitude            numeric(9,6),
  fingerprint          text UNIQUE NOT NULL,
  active               boolean NOT NULL DEFAULT true,
  first_seen_at        timestamptz NOT NULL,
  last_seen_at         timestamptz NOT NULL,
  -- Cadastro administrativo: nada disto atravessa as views da Fase 2.
  cnpj                 text,
  corporate_name       text,
  trade_name           text,
  brand                text,
  anp_code             text,
  anp_authorization    text,
  anp_status           text,
  registry_source      text,
  station_type         text,
  last_registry_sync   timestamptz,
  raw_registry_payload jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_code text UNIQUE NOT NULL,
  canonical_name text NOT NULL,
  category       text NOT NULL,
  unit           text NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.station_products (
  station_id    uuid NOT NULL REFERENCES public.stations(id),
  product_id    uuid NOT NULL REFERENCES public.products(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.collection_evidence (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_run_id        uuid NOT NULL REFERENCES public.collection_runs(id),
  evidence_type            text NOT NULL,
  file_path                text NOT NULL,
  sha256                   text NOT NULL,
  contains_personal_header boolean NOT NULL DEFAULT false,
  collected_at             timestamptz NOT NULL,
  expires_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.price_observations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id              uuid NOT NULL REFERENCES public.stations(id),
  product_id              uuid NOT NULL REFERENCES public.products(id),
  data_source_id          uuid NOT NULL REFERENCES public.data_sources(id),
  collection_run_id       uuid NOT NULL REFERENCES public.collection_runs(id),
  original_product_name   text NOT NULL,
  original_price_text     text NOT NULL,
  price_decimal           numeric(10,3) NOT NULL,
  currency                text NOT NULL DEFAULT 'BRL',
  unit                    text NOT NULL DEFAULT 'L',
  relative_time_text      text,
  observed_at             timestamptz,
  estimated_observed_at   timestamptz,
  estimated_time          boolean NOT NULL DEFAULT false,
  collected_at            timestamptz NOT NULL,
  source_position         int NOT NULL,
  confidence_score        numeric(3,2) NOT NULL DEFAULT 1,
  status                  public."ObservationStatus" NOT NULL DEFAULT 'PENDING',
  validation_method       text,
  expires_at              timestamptz,
  source_record_hash      text,
  observation_fingerprint text UNIQUE NOT NULL,
  raw_payload             jsonb,
  evidence_path           text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.observation_evidence (
  observation_id uuid NOT NULL REFERENCES public.price_observations(id),
  evidence_id    uuid NOT NULL REFERENCES public.collection_evidence(id),
  PRIMARY KEY (observation_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS public.collection_errors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_run_id uuid NOT NULL REFERENCES public.collection_runs(id),
  stage             text NOT NULL,
  error_type        text NOT NULL,
  message           text NOT NULL,
  details           jsonb,
  screenshot_path   text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Espelham os índices recomendados ao administrador do banco real em
-- sql/operations/collector_indexes.sql, para que o plano de consulta local se
-- pareça com o de produção.
CREATE INDEX IF NOT EXISTS stations_municipality_state_idx
  ON public.stations (municipality, state);
CREATE INDEX IF NOT EXISTS price_observations_latest_idx
  ON public.price_observations
     (station_id, product_id, (COALESCE(observed_at, estimated_observed_at, collected_at)) DESC);
CREATE INDEX IF NOT EXISTS price_observations_status_idx
  ON public.price_observations (status);
CREATE INDEX IF NOT EXISTS price_observations_collected_at_idx
  ON public.price_observations (collected_at DESC);
