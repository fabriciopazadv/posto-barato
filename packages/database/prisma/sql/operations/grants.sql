-- Privilégios dos papéis de runtime — EXECUTADO PELO PAPEL QUE MIGRA.
--
--   psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f grants.sql
--
-- Sem senha, sem parâmetro: pode ser versionado, revisado e reexecutado à
-- vontade. Rode DEPOIS de `roles.sql` e DEPOIS de cada `pnpm db:migrate`.
--
-- ---------------------------------------------------------------------------
-- O que este arquivo NÃO faz
-- ---------------------------------------------------------------------------
-- Ele não concede nem revoga nada em `public.*`. Não por escolha de estilo: em
-- produção quem é dono daquelas tabelas é o coletor, e um GRANT ou REVOKE feito
-- por quem não é dono falha com "permission denied for table" — derrubando o
-- script inteiro no meio, com metade dos privilégios aplicados.
--
-- O que precisa acontecer em `public.*` está em `prerequisites.sql`, executado
-- pelo dono das tabelas. Aqui, a fronteira com `public` é apenas VERIFICADA, no
-- bloco final.
--
-- ---------------------------------------------------------------------------
-- Princípio
-- ---------------------------------------------------------------------------
-- As views `collector.*` são views comuns, executadas com os privilégios de
-- quem as criou, então SELECT na view é suficiente e o acesso às tabelas-base
-- continua fechado. É por isso que `price_reader` enxerga preços e não enxerga
-- evidências.
--
-- Cada bloco só age se o papel existir, para que um ambiente sem coletor local
-- (ou sem agendador) não derrube o script inteiro.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Pré-condição: o dono das views consegue ler as tabelas-base?
-- ---------------------------------------------------------------------------
-- Só conferimos. Sem este acesso, as views são criadas com sucesso e falham na
-- primeira consulta — o Postgres não checa privilégio no CREATE VIEW.
DO $$
DECLARE
  sem_acesso text;
BEGIN
  SELECT string_agg(format('public.%s', v.t), ', ')
    INTO sem_acesso
  FROM (VALUES ('data_sources'), ('stations'), ('products'), ('price_observations')) AS v(t)
  WHERE to_regclass('public.' || v.t) IS NOT NULL
    AND NOT has_table_privilege(current_user, 'public.' || v.t, 'SELECT');

  IF sem_acesso IS NOT NULL THEN
    RAISE EXCEPTION
      'O papel % não tem SELECT em: %. Rode operations/prerequisites.sql (pelo dono das tabelas do coletor) antes deste script.',
      current_user, sem_acesso;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- price_reader — leitura pública. Nunca escreve, nunca vê tabela-base.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'price_reader') THEN RETURN; END IF;

  GRANT USAGE ON SCHEMA app       TO price_reader;
  GRANT USAGE ON SCHEMA collector TO price_reader;

  GRANT SELECT ON app.public_latest_prices     TO price_reader;
  -- Catálogo e histórico agregado. O histórico completo mora no coletor e é
  -- agregado no banco; o cliente nunca recebe observação bruta.
  GRANT SELECT ON collector.products           TO price_reader;
  GRANT SELECT ON collector.price_observations TO price_reader;
  -- Rótulo "Dados demonstrativos" na resposta pública.
  GRANT SELECT ON app.demo_stations            TO price_reader;

  -- Defensivo, e sobre objetos que ESTE papel possui. `collector.stations` e
  -- `collector.data_sources` não são lidas diretamente pela API: os dados do
  -- posto e o nome público da fonte já viajam na projeção.
  REVOKE ALL ON collector.stations     FROM price_reader;
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

  -- A conexão de escrita não tem por que ler preço, e não poder é melhor do
  -- que não precisar.
  REVOKE ALL ON SCHEMA collector         FROM app_writer;
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

  REVOKE ALL ON app.public_latest_prices FROM price_refresher;
  REVOKE ALL ON SCHEMA collector         FROM price_refresher;
END $$;

-- ---------------------------------------------------------------------------
-- collector_writer — o coletor não tem nada a fazer no schema da Fase 2.
-- ---------------------------------------------------------------------------
-- A escrita nas tabelas do coletor é concedida em `prerequisites.sql`, pelo
-- dono delas. Aqui só fechamos a porta do lado de cá.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'collector_writer') THEN RETURN; END IF;
  REVOKE ALL ON SCHEMA app FROM collector_writer;
END $$;

-- ---------------------------------------------------------------------------
-- Verificação final da fronteira com `public`
-- ---------------------------------------------------------------------------
-- Nenhum papel de runtime pode ter privilégio nas tabelas do coletor. Não
-- podemos revogar (não somos donos), então acusamos — e quem corrige é o dono.
DO $$
DECLARE
  vazamento text;
BEGIN
  SELECT string_agg(format('%s em public.%s (%s)', r.rolname, c.relname, a.privilege_type), '; ')
    INTO vazamento
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
  JOIN pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm')
    AND r.rolname IN ('price_reader', 'app_writer', 'price_refresher');

  IF vazamento IS NOT NULL THEN
    RAISE EXCEPTION
      'Papéis de runtime têm privilégio direto nas tabelas do coletor: %. O acesso deve passar pelas views collector.*. Peça ao dono das tabelas para revogar.',
      vazamento;
  END IF;
END $$;
