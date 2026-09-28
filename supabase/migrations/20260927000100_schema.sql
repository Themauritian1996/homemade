-- ════════════════════════════════════════════════════════════════════════════
-- Homemade — Schéma principal
-- Postgres 15+ (Supabase) · PostGIS pour la géolocalisation
-- Conventions : snake_case, uuid, timestamptz, montants en cents (int), codes de référence en text + FK
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ─────────────────────────────────────────────── Types énumérés
create type public.meal_mode          as enum ('sale', 'swap', 'both');
create type public.meal_status        as enum ('draft', 'published', 'reserved', 'sold_out', 'expired', 'archived', 'suspended');
create type public.allergen_severity  as enum ('allergy', 'intolerance');
create type public.allergen_kind      as enum ('contains', 'may_contain');
create type public.allergen_source    as enum ('ingredient', 'dictionary', 'declared');
create type public.ingredient_source  as enum ('ai', 'cooker');
create type public.order_kind         as enum ('purchase', 'swap');
create type public.order_status       as enum ('requested', 'paid', 'accepted', 'ready', 'picked_up', 'completed', 'cancelled', 'declined', 'disputed');
create type public.review_role        as enum ('cooker', 'eater');  -- rôle de la personne NOTÉE
create type public.ai_status          as enum ('ok', 'not_food', 'refused', 'failed');
create type public.report_reason      as enum ('allergen_incident', 'hygiene', 'no_show', 'misleading', 'fraud', 'harassment', 'other');

-- ─────────────────────────────────────────────── Référentiels (i18n-ready, extensibles par région)
create table public.allergens (
  code        text primary key,
  name_fr     text not null,
  name_en     text not null,
  emoji       text,
  regions     text[] not null default '{CA}',  -- ex. {CA,EU,US} : les listes réglementaires diffèrent selon le pays
  sort_order  smallint not null default 0
);

-- Implications : un allergène en entraîne un autre (blé ⇒ gluten).
create table public.allergen_implications (
  code     text not null references public.allergens(code),
  implies  text not null references public.allergens(code),
  primary key (code, implies),
  check (code <> implies)
);

create table public.diets (
  code     text primary key,
  name_fr  text not null,
  name_en  text not null
);

-- Un régime interdit certains allergènes (végane ⇒ pas de lait, œufs, poisson…) : sert à la validation.
create table public.diet_forbidden_allergens (
  diet_code      text not null references public.diets(code),
  allergen_code  text not null references public.allergens(code),
  primary key (diet_code, allergen_code)
);

create table public.cuisines (
  code     text primary key,
  name_fr  text not null,
  name_en  text not null,
  emoji    text
);

-- ─────────────────────────────────────────────── Dictionnaire d'ingrédients
-- Grossit au fil des publications ; les entrées curées portent des allergènes « par défaut »
-- qui s'ajoutent (jamais ne retirent) aux déclarations du Cooker : filet de sécurité.
create table public.ingredients (
  id              uuid primary key default gen_random_uuid(),
  canonical_name  text not null unique,           -- minuscule, singulier, fr (ex. « tahini »)
  name_fr         text not null,
  name_en         text,
  is_curated      boolean not null default false, -- validé par l'équipe Homemade
  created_at      timestamptz not null default now()
);

create table public.ingredient_aliases (
  alias          text primary key,                -- minuscule (ex. « tahina », « sesame paste »)
  ingredient_id  uuid not null references public.ingredients(id) on delete cascade
);

create table public.ingredient_allergens (
  ingredient_id  uuid not null references public.ingredients(id) on delete cascade,
  allergen_code  text not null references public.allergens(code),
  primary key (ingredient_id, allergen_code)
);

-- ─────────────────────────────────────────────── Utilisateurs
-- Profil PUBLIC (lisible par les membres). Les agrégats de notes sont maintenus par trigger uniquement.
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  display_name          text not null check (char_length(display_name) between 1 and 40),
  avatar_url            text,
  bio                   text check (char_length(bio) <= 400),
  neighborhood          text,
  locale                text not null default 'fr-CA',
  is_cooker             boolean not null default false,
  cooker_verified_at    timestamptz,               -- identité vérifiée
  hygiene_certified_at  timestamptz,               -- formation hygiène/salubrité déclarée et vérifiée
  cooker_rating_avg     numeric(3,2),
  cooker_rating_count   integer not null default 0,
  eater_rating_avg      numeric(3,2),
  eater_rating_count    integer not null default 0,
  meals_shared_count    integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- Données PRIVÉES (propriétaire + service role). Jamais exposées aux autres membres.
create table public.user_private (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  phone                    text,
  stripe_customer_id       text unique,
  stripe_account_id        text unique,           -- compte Stripe Connect Express (Cooker)
  stripe_charges_enabled   boolean not null default false,
  terms_accepted_at        timestamptz,
  health_consent_at        timestamptz,           -- consentement explicite (Loi 25 : renseignement de santé)
  updated_at               timestamptz not null default now()
);

create table public.user_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  strict_traces      boolean not null default false,
  default_radius_m   integer not null default 5000,
  notify_new_nearby  boolean not null default true,
  notify_messages    boolean not null default true
);

-- Profil santé (renseignements sensibles).
create table public.user_allergens (
  user_id        uuid not null references auth.users(id) on delete cascade,
  allergen_code  text not null references public.allergens(code),
  severity       public.allergen_severity not null default 'allergy',
  created_at     timestamptz not null default now(),
  primary key (user_id, allergen_code)
);

create table public.user_diets (
  user_id    uuid not null references auth.users(id) on delete cascade,
  diet_code  text not null references public.diets(code),
  primary key (user_id, diet_code)
);

-- ─────────────────────────────────────────────── IA : journal d'analyses (audit + jeu d'évaluation)
create table public.ai_analyses (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  photo_path       text not null,
  provider         text not null default 'anthropic',
  model            text not null,
  prompt_version   text not null,
  status           public.ai_status not null,
  result           jsonb,                          -- sortie structurée validée (contrat AiMealAnalysis)
  error            text,
  latency_ms       integer,
  input_tokens     integer,
  output_tokens    integer,
  -- Rempli à la publication : écart entre suggestion IA et validation humaine (précision/rappel allergènes).
  validation_diff  jsonb,
  created_at       timestamptz not null default now()
);
create index ai_analyses_user_created_idx on public.ai_analyses (user_id, created_at desc);

-- ─────────────────────────────────────────────── Repas
create table public.meals (
  id                      uuid primary key default gen_random_uuid(),
  cooker_id               uuid not null references public.profiles(id) on delete cascade,
  title                   text not null check (char_length(title) between 4 and 80),
  description             text not null default '' check (char_length(description) <= 500),
  cuisine_code            text not null references public.cuisines(code),
  mode                    public.meal_mode not null,
  price_cents             integer check (price_cents between 200 and 5000),
  currency                char(3) not null default 'CAD',
  portions_total          smallint not null check (portions_total between 1 and 20),
  portions_left           smallint not null,
  prepared_at             timestamptz not null default now(),
  available_until         timestamptz not null,
  -- Point exact (privé, révélé après confirmation) vs point public brouillé de 100-300 m (carte/fil).
  pickup_point            extensions.geography(point, 4326) not null,
  pickup_point_public     extensions.geography(point, 4326) not null,
  pickup_area             text not null,
  status                  public.meal_status not null default 'draft',
  ai_analysis_id          uuid references public.ai_analyses(id) on delete set null,
  allergens_confirmed_at  timestamptz,
  allergens_confirmed_by  uuid references auth.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint meals_price_required check (mode = 'swap' or price_cents is not null),
  constraint meals_portions_valid check (portions_left between 0 and portions_total),
  constraint meals_window_valid check (available_until > prepared_at and available_until <= prepared_at + interval '72 hours'),
  -- Règle d'or : aucun plat visible sans validation humaine des allergènes.
  constraint meals_published_requires_confirmation check (
    status in ('draft', 'archived') or (allergens_confirmed_at is not null and allergens_confirmed_by = cooker_id)
  )
);
create index meals_geo_idx          on public.meals using gist (pickup_point_public);
create index meals_feed_idx         on public.meals (status, available_until) where status = 'published';
create index meals_cooker_idx       on public.meals (cooker_id, created_at desc);
create index meals_title_trgm_idx   on public.meals using gin (title extensions.gin_trgm_ops);

create table public.meal_photos (
  id            uuid primary key default gen_random_uuid(),
  meal_id       uuid not null references public.meals(id) on delete cascade,
  storage_path  text not null,
  position      smallint not null default 0,
  unique (meal_id, position)
);

create table public.meal_ingredients (
  id             uuid primary key default gen_random_uuid(),
  meal_id        uuid not null references public.meals(id) on delete cascade,
  ingredient_id  uuid references public.ingredients(id),  -- null si non reconnu dans le dictionnaire
  raw_name       text not null check (char_length(raw_name) between 1 and 60),
  position       smallint not null default 0,
  source         public.ingredient_source not null,
  ai_confidence  numeric(3,2)
);
create index meal_ingredients_meal_idx on public.meal_ingredients (meal_id);

-- Allergènes déclarés PAR ingrédient (validés par le Cooker).
create table public.meal_ingredient_allergens (
  meal_ingredient_id  uuid not null references public.meal_ingredients(id) on delete cascade,
  allergen_code       text not null references public.allergens(code),
  primary key (meal_ingredient_id, allergen_code)
);

-- Ensemble FINAL dénormalisé, recalculé par `recompute_meal_allergens()`. C'est lui qui sert au filtrage.
create table public.meal_allergens (
  meal_id        uuid not null references public.meals(id) on delete cascade,
  allergen_code  text not null references public.allergens(code),
  kind           public.allergen_kind not null,
  source         public.allergen_source not null,
  primary key (meal_id, allergen_code, kind)
);
create index meal_allergens_code_idx on public.meal_allergens (allergen_code, meal_id);

create table public.meal_diets (
  meal_id    uuid not null references public.meals(id) on delete cascade,
  diet_code  text not null references public.diets(code),
  primary key (meal_id, diet_code)
);

-- ─────────────────────────────────────────────── Transactions (achat & échange)
create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  kind                      public.order_kind not null,
  meal_id                   uuid not null references public.meals(id),
  cooker_id                 uuid not null references public.profiles(id),
  eater_id                  uuid not null references public.profiles(id),
  quantity                  smallint not null default 1 check (quantity between 1 and 10),
  -- Achat
  unit_price_cents          integer,
  subtotal_cents            integer,
  service_fee_cents         integer,    -- payé par l'Eater
  platform_fee_cents        integer,    -- commission prélevée sur le Cooker
  total_cents               integer,    -- montant débité à l'Eater
  currency                  char(3) not null default 'CAD',
  stripe_payment_intent_id  text unique,
  -- Échange
  offered_meal_id           uuid references public.meals(id),
  swap_message              text check (char_length(swap_message) <= 300),

  status                    public.order_status not null default 'requested',
  pickup_at                 timestamptz,
  cancel_reason             text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  completed_at              timestamptz,

  check (cooker_id <> eater_id),
  check ((kind = 'purchase' and total_cents is not null) or (kind = 'swap' and offered_meal_id is not null))
);
create index orders_eater_idx  on public.orders (eater_id, created_at desc);
create index orders_cooker_idx on public.orders (cooker_id, created_at desc);
create index orders_meal_idx   on public.orders (meal_id);

create table public.order_events (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders(id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status not null,
  actor_id     uuid references auth.users(id),
  note         text,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────── Messagerie
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid unique references public.orders(id) on delete cascade,
  meal_id     uuid references public.meals(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  last_read_at     timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid references auth.users(id) on delete set null,  -- null = message système
  kind             text not null default 'text' check (kind in ('text', 'system')),
  body             text not null check (char_length(body) between 1 and 2000),
  created_at       timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ─────────────────────────────────────────────── Réputation bidirectionnelle
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  author_id    uuid not null references public.profiles(id) on delete cascade,
  subject_id   uuid not null references public.profiles(id) on delete cascade,
  role         public.review_role not null,          -- rôle du sujet noté
  rating       smallint not null check (rating between 1 and 5),
  -- Cooker : taste, hygiene, accuracy, punctuality · Eater : punctuality, communication, respect
  sub_scores   jsonb not null default '{}'::jsonb,
  tags         text[] not null default '{}',
  comment      text check (char_length(comment) <= 600),
  -- Double-aveugle : visible quand les 2 parties ont noté, ou 7 jours après la cueillette.
  visible_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (order_id, author_id),
  check (author_id <> subject_id)
);
create index reviews_subject_idx on public.reviews (subject_id, role, created_at desc);

-- ─────────────────────────────────────────────── Confiance & sécurité
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references auth.users(id) on delete cascade,
  meal_id      uuid references public.meals(id) on delete set null,
  order_id     uuid references public.orders(id) on delete set null,
  subject_id   uuid references public.profiles(id) on delete set null,
  reason       public.report_reason not null,
  details      text check (char_length(details) <= 2000),
  status       text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  created_at   timestamptz not null default now()
);

-- Idempotence des webhooks Stripe.
create table public.stripe_events (
  id            text primary key,
  type          text not null,
  payload       jsonb not null,
  processed_at  timestamptz not null default now()
);
