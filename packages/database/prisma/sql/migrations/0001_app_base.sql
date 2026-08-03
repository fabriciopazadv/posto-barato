-- 0001 — Base do schema `app` (Fase 2).
--
-- Idempotente por construção: um banco que já rodou o antigo `01_app.sql`
-- atravessa esta migração sem alteração alguma. Nada aqui toca o coletor.

-- PostGIS é pré-requisito da projeção pública. Criar extensão exige privilégio
-- que `migration_admin` pode não ter em produção — nesse caso falhamos com uma
-- instrução clara em vez do erro cru do Postgres. Só a condição conhecida
-- (privilégio insuficiente) é tratada; qualquer outra falha sobe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    BEGIN
      CREATE EXTENSION postgis;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION
        'PostGIS não está instalado e este papel não pode criá-lo. Peça ao administrador: CREATE EXTENSION postgis;';
    END;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS app;

-- Postos demonstrativos (seed). Permite rotular "Dados demonstrativos" e nunca
-- misturar silenciosamente demo com produção.
CREATE TABLE IF NOT EXISTS app.demo_stations (
  station_id uuid PRIMARY KEY,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
