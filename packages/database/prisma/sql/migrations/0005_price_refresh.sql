-- 0005 — Refresh da projeção pública: função controlada + registro de execução.

-- Histórico de refreshes. Existe para responder "o preço na tela é de quando?"
-- sem abrir o banco do coletor, e para o agendador saber se deve tentar de novo.
CREATE TABLE IF NOT EXISTS app.price_refresh_log (
  id           bigserial PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  duration_ms  integer,
  -- 'ok' | 'skipped' (outro refresh em curso) | 'error'
  outcome      text NOT NULL DEFAULT 'running',
  -- Mensagem do Postgres em caso de falha. Nunca recebe URL de conexão.
  error_text   text,
  -- Quem pediu: 'cli', 'cron', 'seed', 'collector'…
  triggered_by text NOT NULL DEFAULT 'cli',
  attempt      integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS price_refresh_log_started_at_idx
  ON app.price_refresh_log (started_at DESC);

-- ---------------------------------------------------------------------------
-- app.refresh_public_prices()
-- ---------------------------------------------------------------------------
-- Retorna true quando atualizou, false quando desistiu porque já havia um
-- refresh em curso. Erro real (permissão, SQL, matview ausente) SOBE — a versão
-- anterior capturava WHEN OTHERS para cair no refresh não-concorrente, o que
-- transformava "price_refresher não tem permissão" em uma varredura completa
-- silenciosa, ou em sucesso aparente sem nada ter sido atualizado.
--
-- A primeira carga não aceita CONCURRENTLY. Em vez de descobrir isso capturando
-- a exceção, perguntamos ao catálogo se a matview está populada — condição
-- conhecida, testada de frente.
--
-- SECURITY DEFINER com search_path fixo e todo objeto qualificado por schema:
-- é o que permite conceder EXECUTE a `price_refresher` sem lhe dar nenhum
-- privilégio sobre as tabelas, e o que impede um schema plantado no caminho de
-- sequestrar a resolução de nomes.
CREATE OR REPLACE FUNCTION app.refresh_public_prices()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  populated boolean;
BEGIN
  -- Lock de transação: liberado no commit/rollback, sem risco de ficar preso se
  -- a sessão morrer no meio. Chave arbitrária e fixa, exclusiva deste refresh.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(4021763) THEN
    RETURN false;
  END IF;

  SELECT c.relispopulated INTO populated
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'app' AND c.relname = 'public_latest_prices';

  IF populated IS NULL THEN
    RAISE EXCEPTION 'app.public_latest_prices não existe — rode as migrações antes do refresh.';
  END IF;

  IF populated THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY app.public_latest_prices;
  ELSE
    REFRESH MATERIALIZED VIEW app.public_latest_prices;
  END IF;

  RETURN true;
END $$;

COMMENT ON FUNCTION app.refresh_public_prices() IS
  'Atualiza app.public_latest_prices. true = atualizou, false = já havia refresh em curso. Erros sobem.';
