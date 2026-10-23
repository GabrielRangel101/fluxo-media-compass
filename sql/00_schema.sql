-- Esquema do dataset sintético da Fluxo (fintech fictícia). Dialeto: SQLite (portável para Postgres/BigQuery
-- trocando date(...) por DATE_ADD/DATE_SUB). Datas em TEXT ISO (YYYY-MM-DD).

CREATE TABLE campaigns (
  campaign_id TEXT PRIMARY KEY,
  channel     TEXT NOT NULL,     -- google_ads | meta_ads | tiktok_ads | linkedin_ads | dv360
  name        TEXT NOT NULL,
  objective   TEXT NOT NULL
);

-- Export das plataformas de mídia: uma linha por campanha x plataforma x dia.
CREATE TABLE ad_spend_daily (
  date              TEXT NOT NULL,
  channel           TEXT NOT NULL,
  campaign_id       TEXT NOT NULL REFERENCES campaigns(campaign_id),
  platform          TEXT NOT NULL,  -- android | ios
  impressions       INTEGER NOT NULL,
  clicks            INTEGER NOT NULL,
  spend             REAL    NOT NULL,   -- R$
  platform_installs INTEGER NOT NULL,   -- o que a PLATAFORMA reporta (view-through e modelagem inclusos)
  platform_signups  INTEGER NOT NULL,
  PRIMARY KEY (date, campaign_id, platform)
);

-- Uma linha por usuário: atribuição do MMP (AppsFlyer) + eventos do backend.
CREATE TABLE users (
  user_id        INTEGER PRIMARY KEY,
  install_date   TEXT NOT NULL,
  channel        TEXT NOT NULL,     -- canal atribuído pelo MMP; 'organic' = sem atribuição paga
  campaign_id    TEXT NOT NULL,
  platform       TEXT NOT NULL,
  signup_date    TEXT,              -- NULL = não cadastrou (ou ainda não, na data de referência)
  kyc_date       TEXT,
  first_use_date TEXT,              -- primeiro uso do cartão = ativação
  rev_d30        REAL,              -- NULL = coorte ainda sem 30 dias de vida
  rev_d90        REAL,              -- NULL = coorte ainda sem 90 dias de vida
  utm_internal   TEXT               -- utm_source capturado pelo backend no cadastro ('unattributed' = sem UTM)
);
CREATE INDEX users_install ON users(install_date, channel);

-- Eventos de coleta contados por dia (SDK do AppsFlyer no app, GA4 na web).
CREATE TABLE events_daily (
  date        TEXT NOT NULL,
  event_name  TEXT NOT NULL,
  platform    TEXT NOT NULL,        -- android | ios | web
  source      TEXT NOT NULL,        -- af_sdk | ga4
  event_count INTEGER NOT NULL,
  PRIMARY KEY (date, event_name, platform)
);

CREATE TABLE experiments (
  test_id     TEXT NOT NULL,
  channel     TEXT NOT NULL,
  test_type   TEXT NOT NULL,        -- creative | audience | bid
  name        TEXT NOT NULL,
  variant     TEXT NOT NULL,        -- A | B
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  impressions INTEGER NOT NULL,
  clicks      INTEGER NOT NULL,
  installs    INTEGER NOT NULL,
  PRIMARY KEY (test_id, variant)
);

CREATE TABLE tagbook (
  event_name   TEXT PRIMARY KEY,
  area         TEXT NOT NULL,       -- app | web
  platforms    TEXT NOT NULL,
  trigger      TEXT NOT NULL,
  params       TEXT NOT NULL,
  is_conversion INTEGER NOT NULL,
  destinations TEXT NOT NULL,
  owner        TEXT NOT NULL,
  reference    TEXT NOT NULL
);
