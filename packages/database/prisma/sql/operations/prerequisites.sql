-- Pré-requisitos da integração — EXECUTADO PELO DONO DAS TABELAS DO COLETOR
-- (ou por um superusuário). Roda ANTES de tudo.
--
-- Por que este arquivo existe, e por que ele não podia estar em grants.sql:
--
-- As views `collector.*` são views comuns, executadas com os privilégios de
-- quem as criou. Para que `price_reader` leia preços através delas sem receber
-- acesso às tabelas-base, quem precisa conseguir ler as tabelas-base é o DONO
-- das views — `migration_admin`.
--
-- E `migration_admin` não pode conceder isso a si mesmo: em produção quem é dono
-- de `public.stations` é o coletor, e `GRANT SELECT ... TO migration_admin`
-- executado por quem não é dono falha com "permission denied for table". Só o
-- dono das tabelas (ou um superusuário) pode dar esse acesso.
--
-- O que acontece se este arquivo for pulado: a migração 0003 falha com uma
-- mensagem explicando exatamente isto (a verificação foi acrescentada lá
-- justamente porque o Postgres, sozinho, CRIA a view sem reclamar e só recusa
-- quando alguém tenta consultá-la — a migração pareceria ter dado certo e a API
-- quebraria em produção).
--
-- Uso:
--   psql "$OWNER_URL" -v ON_ERROR_STOP=1 -v migration_role=migration_admin \
--     -f prerequisites.sql
--
-- O acesso concedido é NOMINAL — quatro tabelas, e não o schema inteiro. Nem o
-- dono das views alcança collection_evidence, observation_evidence,
-- collection_errors ou collection_runs.

\set ON_ERROR_STOP on

\if :{?migration_role} \else
  \echo 'Falta -v migration_role=... (o papel que executa as migrações)'
  \quit
\endif

SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'migration_role') \gexec

SELECT format('GRANT SELECT ON public.%I TO %I', t, :'migration_role')
FROM (VALUES ('data_sources'), ('stations'), ('products'), ('price_observations')) AS v(t)
WHERE to_regclass('public.' || t) IS NOT NULL \gexec

-- ---------------------------------------------------------------------------
-- Escrita da coleta (opcional)
-- ---------------------------------------------------------------------------
-- Só se a Fase 1 for passar a usar o papel `collector_writer` criado por
-- roles.sql. Se o coletor já tem credencial própria, PULE esta parte — ela está
-- aqui porque, assim como o bloco acima, só o dono das tabelas pode concedê-la,
-- e não o papel que roda as migrações.
--
--   psql ... -v migration_role=migration_admin -v grant_collector_writer=1 -f prerequisites.sql
\if :{?grant_collector_writer}
SELECT format('GRANT SELECT, INSERT, UPDATE ON public.%I TO collector_writer', t)
FROM (VALUES
  ('data_sources'), ('collection_runs'), ('stations'), ('products'), ('station_products'),
  ('price_observations'), ('collection_errors'), ('collection_evidence'), ('observation_evidence')
) AS v(t)
WHERE to_regclass('public.' || t) IS NOT NULL
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'collector_writer') \gexec
\endif

-- Confirmação: lista o que o papel passou a enxergar. Espera-se quatro linhas
-- com `t`. Qualquer `f` significa que este script não fez efeito e que a
-- migração 0003 vai recusar prosseguir.
SELECT v.t AS tabela,
       has_table_privilege(:'migration_role', 'public.' || v.t, 'SELECT') AS pode_ler
FROM (VALUES ('data_sources'), ('stations'), ('products'), ('price_observations')) AS v(t)
WHERE to_regclass('public.' || v.t) IS NOT NULL;
