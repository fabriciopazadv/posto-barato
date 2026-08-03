# Integração com o banco operacional do coletor

Como a Fase 2 se conecta ao PostgreSQL onde o coletor já escreve, sem mover uma
tabela sequer dele.

## O desenho

Um único PostgreSQL 16 + PostGIS. Três camadas, três níveis de acesso.

```
public.*                     tabelas do coletor (Fase 1) — ninguém da Fase 2 lê direto
   │  views comuns, executadas com os privilégios de quem as criou
   ▼
collector.*                  views de compatibilidade, somente-leitura
   │  DISTINCT ON pela data de negócio
   ▼
app.public_latest_prices     projeção pública (matview + PostGIS)
   │  price_reader
   ▼
API Fastify /api/v1
   │  HTTPS
   ▼
PWA / mobile
```

O detalhe que sustenta a segurança inteira: **view comum não é
`security_invoker`**. Ela roda com os privilégios de quem a criou, então
conceder `SELECT` na view não exige conceder `SELECT` nas tabelas por baixo. É
por isso que `price_reader` lê preços e recebe "permissão negada" em
`public.collection_evidence` — não por disciplina do código, mas porque o
Postgres recusa.

Um único banco lógico, e não dois. Views não enxergam através de bancos: separar
`posto_barato` de um `posto_barato_app` quebraria a camada de compatibilidade.

## Regra adotada para observações expiradas

O coletor marca `EXPIRED` quando a observação passa de `expires_at`. Ela foi
validada um dia; o que mudou foi o relógio.

- **`PENDING` e `REJECTED` nunca são publicadas.** A view `collector.*` as
  descarta na origem — a Fase 2 não tem como enxergá-las nem por engano.
- **`EXPIRED` é publicada, com marca.** Esconder faz o posto sumir do mapa, e
  posto ausente é lido como "não existe", não como "não sabemos o preço de hoje".
  O app já sabe mostrar preço velho com aviso: `freshness` tem a faixa `EXPIRED`
  desde o primeiro incremento e o detalhe do posto emite aviso próprio.
- **O vencimento é avaliado na leitura, não no refresh.** As colunas
  `price_status` e `expires_at` viajam na projeção e a API deriva `is_expired` no
  instante da consulta. Um `now()` congelado no último refresh diria que o preço
  ainda vale horas depois de ter vencido.
- **A fonte vence o relógio.** Quando ela diz que expirou, a API responde
  `EXPIRED` mesmo que pelas faixas de frescor o preço fosse `RECENT`.

## Escolha da observação mais recente

Pela **data de negócio**: `COALESCE(observed_at, estimated_observed_at,
collected_at)` — quando o preço valia na bomba. `collected_at` e `created_at`
entram só como desempate.

Ordenar por `collected_at` faria uma recoleta de preço antigo passar na frente
de uma observação genuinamente mais nova. A mesma data governa `ageMinutes`, o
filtro `updatedWithinHours` e `sort=most_recent`, para o app não dizer "de 2
horas atrás" sobre um preço de três dias.

## Variáveis de ambiente

| Variável | Quem usa | Papel |
|---|---|---|
| `DATABASE_READONLY_URL` | API | `price_reader` — preços, catálogo, histórico |
| `DATABASE_APP_URL` | API | `app_writer` — contas, sessões, cobrança |
| `DATABASE_MIGRATION_URL` | `db:migrate`, `db:doctor` | `migration_admin` — DDL |
| `DATABASE_REFRESH_URL` | `db:refresh` | `price_refresher` — só o refresh |
| `DATABASE_URL` | desenvolvimento | cobre os três; **ignorada em produção** |
| `TEST_DATABASE_URL` | `test:integration` | banco descartável |
| `ALLOW_DESTRUCTIVE_RESET` | `db:reset` | trava local; nunca em produção |

Em produção a ausência de `DATABASE_READONLY_URL` ou `DATABASE_APP_URL` derruba
a API no boot. A API **não** recebe `DATABASE_MIGRATION_URL`: um processo que
atende a internet não carrega credencial capaz de alterar schema.

## Matriz de papéis

| Papel | Enxerga | Escreve | Nunca alcança |
|---|---|---|---|
| `migration_admin` | tudo o que migra | DDL de `app`, views de `collector` | — (não é papel de runtime) |
| `collector_writer` | tabelas do coletor | tabelas do coletor | schema `app` |
| `price_reader` | `app.public_latest_prices`, `collector.*`, `app.demo_stations` | **nada** | tabelas-base de `public`, evidências, erros, `app.users` |
| `app_writer` | `app.users`, `refresh_tokens`, `subscriptions`, `billing_events` | as mesmas quatro | `collector.*`, `public.*`, `app.public_latest_prices` |
| `price_refresher` | `app.price_refresh_log` | o próprio log | a projeção, o coletor — só `EXECUTE` na função |

Nenhum recebe `SUPERUSER`, `CREATEDB`, `CREATEROLE` ou `BYPASSRLS`. Todos são
`NOINHERIT`. `apps/api/test/integration/roles.test.ts` verifica cada linha desta
tabela contra o banco.

## Comandos para o administrador do banco

Executados por quem administra o PostgreSQL, com `migration_admin`, nesta ordem.
Nenhum deles roda automaticamente.

```bash
# 1. Diagnóstico — só lê. Rode ANTES de qualquer coisa.
DATABASE_MIGRATION_URL=... pnpm db:doctor

# 2. Pré-requisito que exige superusuário (uma vez).
psql "$SUPERUSER_URL" -c 'CREATE EXTENSION IF NOT EXISTS postgis;'

# 3. Papéis. As senhas vêm do cofre, nunca do histórico do shell.
psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 \
  -v collector_writer_password="$(...)" -v price_reader_password="$(...)" \
  -v app_writer_password="$(...)"       -v price_refresher_password="$(...)" \
  -f packages/database/prisma/sql/operations/roles.sql

# 4. Migrações (schema app + views de compatibilidade + projeção).
DATABASE_MIGRATION_URL=... pnpm db:migrate

# 5. Privilégios. Rode depois de CADA migração.
psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 \
  -f packages/database/prisma/sql/operations/grants.sql

# 6. Primeira carga da projeção.
DATABASE_REFRESH_URL=... pnpm db:refresh -- --by=cli

# 7. Índices no coletor — PROPOSTA, para revisão de quem administra.
#    CONCURRENTLY: não pode rodar em transação, então nunca use -1.
psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 \
  -f packages/database/prisma/sql/operations/collector_indexes.sql

# 8. Confirmação.
DATABASE_MIGRATION_URL=... pnpm db:doctor
```

O passo 7 é o único que toca objetos do coletor, e é por isso que está separado:
adicionar índice muda o custo de escrita da coleta, e essa decisão é de quem é
dono daquelas tabelas.

## Refresh da projeção

Sem refresh, o app mostra o preço da última coleta que alguém propagou.

**Não existe rota HTTP de refresh, de propósito.** Um webhook público seria mais
uma superfície exposta na internet cujo único usuário é um processo que já tem
credencial do banco.

Duas formas de acionamento, que convivem — o refresh é idempotente e a
concorrência é resolvida por advisory lock dentro da função:

```bash
# 1. Direto, ao fim de uma coleta bem-sucedida. Preferido: o dado aparece assim
#    que existe. Exit code != 0 quando falha, para o chamador enxergar.
pnpm db:refresh -- --by=collector

# 2. Cron de contingência, para quando o gatilho da coleta falhar ou o coletor
#    rodar sem conhecer este repositório.
*/10 * * * * cd /srv/posto-barato && pnpm db:refresh -- --by=cron
```

Cada tentativa é registrada em `app.price_refresh_log` com horário, duração,
desfecho (`ok` / `skipped` / `error`) e mensagem de erro. Retentativas com espera
dobrada (`--retries=N`, padrão 2).

`REFRESH MATERIALIZED VIEW CONCURRENTLY` aproveita o índice único
`(station_id, product_id)` e **não bloqueia leitura** — a API continua
respondendo durante a atualização, o que
`apps/api/test/integration/api.test.ts` verifica.

A função não captura `WHEN OTHERS`. A versão anterior fazia isso para cair no
refresh não-concorrente na primeira carga, e o efeito colateral era transformar
"`price_refresher` não tem permissão" em sucesso aparente. Agora a primeira
carga é detectada perguntando ao catálogo (`pg_class.relispopulated`), e erro de
permissão ou de SQL sobe.

## Migrações

`app.schema_migrations` registra versão, nome, checksum, horário e duração. Cada
arquivo roda **uma vez**, em transação própria, sob advisory lock de sessão.

- Editar uma migração já aplicada é erro: o checksum muda e o migrador para,
  em vez de produzir dois bancos com a mesma versão e schemas diferentes.
- Falha reverte o arquivo inteiro e não avança o registro — não existe estado
  parcial silencioso.
- `pnpm db:migrate:status` lista aplicadas, pendentes, alteradas e órfãs sem
  escrever nada.

A projeção pública é substituída **preservando grants**: Postgres não tem
`CREATE OR REPLACE MATERIALIZED VIEW`, então a migração salva os privilégios,
recria e os reaplica. `DROP` sem `CASCADE`: se houver dependente desconhecido, a
migração falha e o administrador decide.

`sql/dev/collector_fixture.sql` **não é migração** e nunca roda contra o banco
real — `NODE_ENV=production` e `SKIP_COLLECTOR_BOOTSTRAP=true` o bloqueiam. Ele
não é reprodução fiel do coletor: é o mínimo de estrutura, no formato esperado,
para o ambiente local ter o que ler. A fonte de verdade é o repositório da Fase 1.

## Trocar a imagem do PostgreSQL em um banco com dados

Editar `image:` no compose **não migra o volume**. Subir PostgreSQL 17 sobre um
`PGDATA` escrito pelo 16 faz o container encerrar com erro de incompatibilidade;
o risco pior é apontar para um caminho de volume diferente, quando o servidor
inicializa um cluster vazio e o banco parece ter sido apagado.

Procedimento obrigatório:

1. **Backup antes de qualquer alteração**, e teste de restauração em outro host.
   `pg_dumpall` para papéis e senhas, `pg_dump -Fc` por banco.
2. **Validar o volume**: confirmar o caminho do `PGDATA` e a versão gravada
   (`cat /var/lib/postgresql/data/PG_VERSION`).
3. **Subir e verificar o PostGIS**: `SELECT PostGIS_Version();` — a extensão é
   compilada contra a versão do servidor e precisa da imagem correspondente.
4. **Verificar as migrações**: `pnpm db:migrate:status` e `pnpm db:doctor`.
5. **Plano de rollback escrito antes de começar**: qual snapshot, quem executa,
   quanto tempo leva, como o app se comporta enquanto isso.

Este repositório não executa nenhum desses passos e não remove volumes.
`docker compose down -v` apaga os dados do banco — não faz parte de nenhum
procedimento aqui.

## Testes de integração

Precisam de PostgreSQL 16 com PostGIS e um banco descartável:

```bash
createdb posto_barato_test
psql posto_barato_test -c 'CREATE EXTENSION postgis;'
TEST_DATABASE_URL=postgresql://user:senha@localhost:5432/posto_barato_test \
  pnpm test:integration
```

O `globalSetup` monta o banco pela sequência real da implantação — reset,
fixture, migrações versionadas, papéis, `grants.sql` — e a API sobe com as
credenciais restritas de `price_reader` e `app_writer`. Uma rota pública que
tentasse gravar falha no teste, não em produção.
