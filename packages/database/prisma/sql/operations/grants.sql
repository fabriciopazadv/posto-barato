-- Privilégios dos papéis de runtime — EXECUTADO PELO ADMINISTRADOR.
--
--   psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f grants.sql
--
-- Sem senha, sem parâmetro: pode ser versionado, revisado e reexecutado à
-- vontade. Rode DEPOIS de `roles.sql` e DEPOIS de cada `pnpm db:migrate`.
--
-- Princípio: ninguém recebe privilégio sobre `public.*`. As views `collector.*`
-- são views comuns, executadas com os privilégios de quem as criou, então
-- SELECT na view é suficiente e o acesso às tabelas-base continua fechado.
-- É por isso que `price_reader` enxerga preços e não enxerga evidências.
--
-- Cada bloco só age se o papel existir, para que um ambiente sem coletor local
-- (ou sem agendador) não derrube o script inteiro.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Dono das views: precisa ler as tabelas-base, e só elas.
-- ---------------------------------------------------------------------------
-- Sem isto as views de compatibilidade são criadas com sucesso e falham na
-- primeira consulta. O acesso é nominal — quatro tabelas, não o schema inteiro,
-- então nem o dono das views alcança collection_evidence ou collection_errors.
DO $$
DECLARE
  owner_role text := current_user;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['data_sources', 'stations', 'products', 'price_observations'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON public.%I TO %I', t, owner_role);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- price_reader — leitura pública. Nunca escreve, nunca vê tabela-base.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'price_reader') THEN RETURN; END IF;

  GRANT USAGE ON SCHEMA app       TO price_reader;
  GRANT USAGE ON SCHEMA collector TO price_reader;

  GRANT SELECT ON app.public_latest_prices    TO price_reader;
  -- Catálogo e histórico agregado. O histórico completo mora no coletor e é
  -- agregado no banco; o cliente nunca recebe observação bruta.
  GRANT SELECT ON collector.products          TO price_reader;
  GRANT SELECT ON collector.price_observations TO price_reader;
  -- Rótulo "Dados demonstrativos" na resposta pública.
  GRANT SELECT ON app.demo_stations           TO price_reader;

  -- Defensivo e idempotente: se um provisionamento anterior deu acesso amplo,
  -- ele é retirado aqui.
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM price_reader;
  REVOKE ALL ON SCHEMA public FROM price_reader;
  REVOKE ALL ON collector.stations    FROM price_reader;
  REVOKE ALL ON collector.data_sources FROM price_reader;
END $$;

-- ---------------------------------------------------------------------------
-- app_writer — contas, sessões e cobrança. Não toca em preço nem no coletor.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_writer') THEN RETURN; END IF;

  GRANT USAGE ON SCHEMA app TO app_writer;
  GRANT SELECT, INSERT, UPDATE ON app.users          TO app_writer;
  GRANT SELECT, INSERT, UPDATE ON app.subscriptions  TO app_writer;
  GRANT SELECT, INSERT         ON app.billing_events TO app_writer;
  -- DELETE só aqui: sessão revogada e expirada é lixo, e limpá-la é rotina.
  GRANT SELECT, INSERT, UPDATE, DELETE ON app.refresh_tokens TO app_writer;

  -- Sem acesso ao coletor nem à projeção pública: a conexão de escrita não tem
  -- por que ler preço, e não poder é melhor do que não precisar.
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_writer;
  REVOKE ALL ON SCHEMA public    FROM app_writer;
  REVOKE ALL ON SCHEMA collector FROM app_writer;
  REVOKE ALL ON app.public_latest_prices FROM app_writer;
END $$;

-- ---------------------------------------------------------------------------
-- price_refresher — só pede o refresh e registra o resultado.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'price_refresher') THEN RETURN; END IF;

  GRANT USAGE ON SCHEMA app TO price_refresher;
  -- A função é SECURITY DEFINER: EXECUTE basta, sem nenhum privilégio sobre a
  -- matview ou sobre o coletor.
  GRANT EXECUTE ON FUNCTION app.refresh_public_prices() TO price_refresher;
  GRANT SELECT, INSERT, UPDATE ON app.price_refresh_log TO price_refresher;
  GRANT USAGE ON SEQUENCE app.price_refresh_log_id_seq  TO price_refresher;

  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM price_refresher;
  REVOKE ALL ON SCHEMA public            FROM price_refresher;
  REVOKE ALL ON app.public_latest_prices FROM price_refresher;
END $$;

-- ---------------------------------------------------------------------------
-- collector_writer — escrita da coleta (Fase 1).
-- ---------------------------------------------------------------------------
-- A Fase 2 não administra o coletor; este bloco existe para a matriz de papéis
-- ficar completa e auditável em um só lugar. Concede nas tabelas que existirem,
-- nominalmente, e não no schema inteiro.
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'collector_writer') THEN RETURN; END IF;

  GRANT USAGE ON SCHEMA public TO collector_writer;
  FOREACH t IN ARRAY ARRAY[
    'data_sources', 'collection_runs', 'stations', 'products', 'station_products',
    'price_observations', 'collection_errors', 'collection_evidence', 'observation_evidence'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO collector_writer', t);
    END IF;
  END LOOP;

  -- O coletor não tem nada a fazer no schema da Fase 2.
  REVOKE ALL ON SCHEMA app FROM collector_writer;
END $$;
