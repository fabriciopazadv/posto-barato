-- Provisionamento dos papéis de runtime — EXECUTADO PELO ADMINISTRADOR.
--
-- Não é uma migração e não roda por `pnpm db:migrate`: cria papéis com senha, e
-- senha não entra em arquivo versionado nem em pipeline automático.
--
-- Uso (as senhas vêm do cofre, nunca do histórico do shell):
--
--   psql "$DATABASE_MIGRATION_URL" \
--     -v ON_ERROR_STOP=1 \
--     -v collector_writer_password="$(vault ...)" \
--     -v price_reader_password="$(vault ...)" \
--     -v app_writer_password="$(vault ...)" \
--     -v price_refresher_password="$(vault ...)" \
--     -f roles.sql
--
-- Rode `grants.sql` em seguida: este arquivo só cria os papéis, quem dá
-- privilégio é o outro. Reexecutar é seguro — serve para rotacionar senha.
--
-- `migration_admin` NÃO é criado aqui: ele é quem executa este script.
--
-- Nenhum papel recebe SUPERUSER, CREATEDB, CREATEROLE ou BYPASSRLS. NOINHERIT
-- para que pertencer a um papel não conceda privilégio por acidente.

\set ON_ERROR_STOP on

-- Falha antes de criar qualquer coisa se alguma senha não foi passada. Sem isto,
-- psql deixaria a string ":price_reader_password" virar a senha do papel.
--
-- As checagens ficam fora de blocos $$ de propósito: psql não interpola :'var'
-- dentro de dollar-quoting, então um guard escrito como DO $$ … $$ compararia
-- textos literais e nunca dispararia.
\if :{?collector_writer_password} \else
  \echo 'Falta -v collector_writer_password=...'
  \quit
\endif
\if :{?price_reader_password} \else
  \echo 'Falta -v price_reader_password=...'
  \quit
\endif
\if :{?app_writer_password} \else
  \echo 'Falta -v app_writer_password=...'
  \quit
\endif
\if :{?price_refresher_password} \else
  \echo 'Falta -v price_refresher_password=...'
  \quit
\endif

SELECT 'DO $guard$ BEGIN RAISE EXCEPTION ''Senha com menos de 16 caracteres — use um valor gerado, não um digitado.''; END $guard$'
WHERE length(:'collector_writer_password') < 16
   OR length(:'price_reader_password') < 16
   OR length(:'app_writer_password') < 16
   OR length(:'price_refresher_password') < 16 \gexec

-- Escrita da coleta (Fase 1). Existe aqui só para a matriz de papéis ficar
-- completa e auditável; quem o usa é o coletor, não a Fase 2.
SELECT format(
  'CREATE ROLE collector_writer LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
  :'collector_writer_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'collector_writer') \gexec

-- Leitura pública: a conexão que a API usa para preços, catálogo e histórico.
SELECT format(
  'CREATE ROLE price_reader LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
  :'price_reader_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'price_reader') \gexec

-- Contas, sessões e cobrança: a única conexão da API que escreve.
SELECT format(
  'CREATE ROLE app_writer LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
  :'app_writer_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_writer') \gexec

-- Agendador do refresh. Só pede a atualização da projeção; não lê preço nenhum.
SELECT format(
  'CREATE ROLE price_refresher LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
  :'price_refresher_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'price_refresher') \gexec

-- Rotação de senha em reexecuções.
SELECT format('ALTER ROLE collector_writer PASSWORD %L', :'collector_writer_password') \gexec
SELECT format('ALTER ROLE price_reader     PASSWORD %L', :'price_reader_password') \gexec
SELECT format('ALTER ROLE app_writer        PASSWORD %L', :'app_writer_password') \gexec
SELECT format('ALTER ROLE price_refresher   PASSWORD %L', :'price_refresher_password') \gexec

-- Rede de segurança: se algum destes papéis já existia com privilégio elevado
-- (herdado de um provisionamento manual anterior), rebaixamos aqui.
ALTER ROLE collector_writer NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE price_reader     NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE app_writer       NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE price_refresher  NOSUPERUSER NOCREATEDB NOCREATEROLE;
