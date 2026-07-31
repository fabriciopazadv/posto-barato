-- Autenticação e assinatura recorrente (schema `app`, Fase 2).
--
-- Conta do cliente final, tokens de sessão e assinatura do Premium com teste
-- grátis e ciclo mensal/semestral/anual. Nada aqui toca o schema `collector`.
--
-- Substitui o modelo anterior de compra única vitalícia (`app.purchases` +
-- `users.premium_since`), removido no fim deste arquivo.

CREATE TABLE IF NOT EXISTS app.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name          text,
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

-- ---------------------------------------------------------------------------
-- Assinatura
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app."SubscriptionPlan" AS ENUM ('MENSAL','SEMESTRAL','ANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE app."SubscriptionStatus" AS ENUM (
    'TRIAL','TRIAL_EXPIRADO','AGUARDANDO_PAGAMENTO','ATIVA','CANCELADA','INADIMPLENTE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS app.subscriptions (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES app.users(id),

  status app."SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  plano  app."SubscriptionPlan",

  -- Teste grátis: marcos gravados no cadastro e nunca reescritos depois.
  -- A cobrança só pode nascer depois de trial_ends_at (ver billing-policy).
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at    timestamptz NOT NULL,

  -- Intenção declarada durante o teste. Nada é criado no Asaas enquanto o teste
  -- corre — a cobrança é emitida na virada, pelo cron.
  plano_escolhido app."SubscriptionPlan",
  valor_centavos  int,               -- preço travado no ato da escolha

  primeira_cobranca_em timestamptz,  -- só quando a 1ª cobrança é criada
  proxima_cobranca_em  timestamptz,
  ultimo_pagamento_em  timestamptz,
  inadimplente_desde   timestamptz,  -- início da carência de 48h
  cancelada_em         timestamptz,
  acesso_ate           timestamptz,  -- cancelada: acesso até o fim do ciclo pago

  asaas_customer_id     text,
  asaas_subscription_id text UNIQUE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- O cron da virada varre exatamente este par.
CREATE INDEX IF NOT EXISTS subscriptions_status_trial_ends_at_idx
  ON app.subscriptions(status, trial_ends_at);
-- A reconciliação diária pega o lote conferido há mais tempo.
CREATE INDEX IF NOT EXISTS subscriptions_updated_at_idx ON app.subscriptions(updated_at);
CREATE INDEX IF NOT EXISTS subscriptions_asaas_customer_id_idx
  ON app.subscriptions(asaas_customer_id);

-- Idempotência do webhook: o Asaas reentrega em caso de falha, e o id do evento
-- é a chave primária. Registrar antes de agir garante que o segundo envio não
-- reprocesse nada.
CREATE TABLE IF NOT EXISTS app.billing_events (
  id            text PRIMARY KEY,
  user_id       uuid REFERENCES app.users(id),
  evento        text NOT NULL,
  payload       jsonb NOT NULL,
  processado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_events_user_id_idx ON app.billing_events(user_id);

-- ---------------------------------------------------------------------------
-- Remoção do modelo vitalício
-- ---------------------------------------------------------------------------
-- A API nunca foi publicada, então não existe compra real a preservar. Se
-- existisse, esta migração precisaria converter cada compra paga em assinatura
-- ATIVA sem próxima cobrança, e não simplesmente descartar a tabela.

DROP TABLE IF EXISTS app.purchases;
DROP TYPE IF EXISTS app."PurchaseStatus";
ALTER TABLE app.users DROP COLUMN IF EXISTS premium_since;
