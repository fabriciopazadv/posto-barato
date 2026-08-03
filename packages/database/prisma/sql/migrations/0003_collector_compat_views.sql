-- 0003 — Views de compatibilidade `collector.*` sobre as tabelas do coletor.
--
-- O coletor (Fase 1) está operacional e escreve em `public.*`. A Fase 2 não
-- move, renomeia nem altera essas tabelas: cria sobre elas um schema `collector`
-- de views somente-leitura que expõem um contrato estável e limitado.
--
-- Por que views comuns e não `security_invoker`: uma view comum é executada com
-- os privilégios de quem a criou, então conceder SELECT na view NÃO exige
-- conceder SELECT nas tabelas-base. É isso que permite dar a `price_reader`
-- acesso aos preços sem lhe dar acesso a `public.collection_evidence`,
-- `public.observation_evidence` ou às colunas de payload bruto.
--
-- Nunca aparecem aqui, em nenhuma view: raw_payload, raw_registry_payload,
-- evidence_path, observation_fingerprint, source_record_hash, internal_name,
-- validation_method, collection_run_id, collection_errors, collection_evidence,
-- observation_evidence e qualquer caminho de screenshot/HTML.

CREATE SCHEMA IF NOT EXISTS collector;

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
-- Falhar cedo e por escrito é melhor do que criar uma view que quebra na
-- primeira consulta. Duas condições são verificadas:
--   1. os nomes `collector.*` já existem como TABELA (banco de desenvolvimento
--      antigo, criado pelo bootstrap que hoje vive em sql/dev/) — não apagamos
--      tabela de ninguém, então paramos e explicamos;
--   2. alguma coluna exigida não existe na tabela-base do coletor.
DO $$
DECLARE
  conflicting text;
  missing     text;
BEGIN
  SELECT string_agg(format('collector.%I', c.relname), ', ' ORDER BY c.relname)
    INTO conflicting
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'collector'
    AND c.relkind IN ('r', 'p')
    AND c.relname IN ('stations', 'products', 'price_observations', 'data_sources');

  IF conflicting IS NOT NULL THEN
    RAISE EXCEPTION
      'Os nomes % já existem como TABELA no schema collector. Esta migração cria views sobre public.*, e não remove tabelas. Em desenvolvimento use `pnpm db:reset`; em produção decida com o administrador o que fazer com essas tabelas antes de prosseguir.',
      conflicting;
  END IF;

  -- 2. Quem está migrando consegue LER as tabelas-base?
  --
  -- Vem ANTES da conferência de colunas de propósito: sem SELECT, a consulta de
  -- colunas não enxerga nada e acusaria as 39 colunas como ausentes, mandando
  -- o operador caçar um problema de schema que não existe.
  --
  -- E a verificação existe porque o Postgres não a faz: `CREATE VIEW` sobre uma
  -- tabela sem SELECT é aceito sem reclamação, e o erro "permission denied for
  -- table stations" só aparece quando alguém CONSULTA a view. Sem isto, a
  -- migração terminaria com sucesso, o ledger registraria tudo aplicado, e a
  -- API quebraria em produção na primeira requisição.
  SELECT string_agg(format('public.%s', v.t), ', ')
    INTO missing
  FROM (VALUES ('data_sources'), ('stations'), ('products'), ('price_observations')) AS v(t)
  WHERE NOT has_table_privilege(current_user, 'public.' || v.t, 'SELECT');

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'O papel % não tem SELECT em: %. As views de compatibilidade seriam criadas e falhariam na primeira consulta. Peça ao dono das tabelas do coletor para rodar operations/prerequisites.sql antes de migrar.',
      current_user, missing;
  END IF;

  -- 3. As colunas exigidas existem?
  --
  -- pg_attribute, e não information_schema: o catálogo padrão SQL é filtrado por
  -- privilégio. (A checagem acima já garante o acesso, mas ler o catálogo do
  -- Postgres mantém o diagnóstico correto mesmo se aquela mudar.)
  SELECT string_agg(format('public.%s.%s', t.tbl, t.col), ', ')
    INTO missing
  FROM (
    VALUES
      ('data_sources', 'id'), ('data_sources', 'public_name'),
      ('data_sources', 'source_type'), ('data_sources', 'active'),
      ('stations', 'id'), ('stations', 'display_name'), ('stations', 'display_address'),
      ('stations', 'neighborhood'), ('stations', 'municipality'), ('stations', 'state'),
      ('stations', 'postal_code'), ('stations', 'latitude'), ('stations', 'longitude'),
      ('stations', 'active'), ('stations', 'first_seen_at'), ('stations', 'last_seen_at'),
      ('products', 'id'), ('products', 'canonical_code'), ('products', 'canonical_name'),
      ('products', 'category'), ('products', 'unit'), ('products', 'active'),
      ('price_observations', 'id'), ('price_observations', 'station_id'),
      ('price_observations', 'product_id'), ('price_observations', 'data_source_id'),
      ('price_observations', 'price_decimal'), ('price_observations', 'currency'),
      ('price_observations', 'unit'), ('price_observations', 'relative_time_text'),
      ('price_observations', 'observed_at'), ('price_observations', 'estimated_observed_at'),
      ('price_observations', 'estimated_time'), ('price_observations', 'collected_at'),
      ('price_observations', 'source_position'), ('price_observations', 'confidence_score'),
      ('price_observations', 'status'), ('price_observations', 'expires_at'),
      ('price_observations', 'created_at')
  ) AS t(tbl, col)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t.tbl AND a.attname = t.col
      AND a.attnum > 0 AND NOT a.attisdropped
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'O banco do coletor não tem as colunas esperadas pela Fase 2: %. Rode `pnpm db:doctor` para o relatório completo antes de migrar.',
      missing;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- `internal_name` (ex.: NOTA_MT_MARKET_RESEARCH) fica de fora: a Fase 2 só
-- apresenta a fonte pública, e nenhuma operação da API precisa do nome interno.
CREATE OR REPLACE VIEW collector.data_sources AS
SELECT
  ds.id,
  ds.public_name,
  ds.source_type,
  ds.active
FROM public.data_sources ds;

-- Campos de cadastro administrativo (cnpj, corporate_name, anp_*, registry_*,
-- raw_registry_payload) não entram: identificam o estabelecimento perante
-- órgãos, não ajudam o cliente a abastecer mais barato.
CREATE OR REPLACE VIEW collector.stations AS
SELECT
  s.id,
  s.display_name,
  s.display_address,
  s.neighborhood,
  s.municipality,
  s.state,
  s.postal_code,
  s.latitude,
  s.longitude,
  s.active,
  s.first_seen_at,
  s.last_seen_at
FROM public.stations s;

CREATE OR REPLACE VIEW collector.products AS
SELECT
  p.id,
  p.canonical_code,
  p.canonical_name,
  p.category,
  p.unit,
  p.active
FROM public.products p;

-- `status` é convertido para text para que a Fase 2 não dependa do tipo enum do
-- coletor — se a Fase 1 trocar o enum por outro, a view continua válida.
--
-- PENDING e REJECTED não atravessam esta view: observação não validada não é
-- dado, e a Fase 2 não deve nem ter como enxergá-la. EXPIRED atravessa por
-- decisão de produto documentada em 0004.
CREATE OR REPLACE VIEW collector.price_observations AS
SELECT
  po.id,
  po.station_id,
  po.product_id,
  po.data_source_id,
  po.price_decimal,
  po.currency,
  po.unit,
  po.relative_time_text,
  po.observed_at,
  po.estimated_observed_at,
  po.estimated_time,
  po.collected_at,
  po.source_position,
  po.confidence_score,
  po.status::text AS status,
  po.expires_at,
  po.created_at
FROM public.price_observations po
WHERE po.status::text IN ('APPROVED', 'EXPIRED');

COMMENT ON SCHEMA collector IS
  'Views somente-leitura da Fase 2 sobre as tabelas do coletor em public.*. Não contém tabelas.';
COMMENT ON VIEW collector.price_observations IS
  'Observações publicáveis (APPROVED e EXPIRED). PENDING e REJECTED nunca aparecem.';
