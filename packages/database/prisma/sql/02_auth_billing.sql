-- Autenticação e assinatura vitalícia (schema `app`, Fase 2 incremento 2).
--
-- Conta do cliente final, tokens de sessão e compra única do Premium
-- (R$ 9,99, sem recorrência). Nada aqui toca o schema `collector`.

CREATE TABLE IF NOT EXISTS app.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name          text,
  premium_since timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.refresh_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES app.users(id),
  token_hash     text UNIQUE NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  replaced_by_id uuid
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON app.refresh_tokens(user_id);

DO $$ BEGIN
  CREATE TYPE app."PurchaseStatus" AS ENUM ('PENDING','PAID','FAILED','REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS app.purchases (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES app.users(id),
  amount_cents         int NOT NULL,
  currency             text NOT NULL DEFAULT 'BRL',
  status               app."PurchaseStatus" NOT NULL DEFAULT 'PENDING',
  provider             text NOT NULL DEFAULT 'asaas',
  provider_checkout_id text,
  provider_payment_id  text,
  paid_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchases_user_id_idx ON app.purchases(user_id);
CREATE INDEX IF NOT EXISTS purchases_provider_checkout_id_idx ON app.purchases(provider_checkout_id);
CREATE INDEX IF NOT EXISTS purchases_provider_payment_id_idx ON app.purchases(provider_payment_id);
