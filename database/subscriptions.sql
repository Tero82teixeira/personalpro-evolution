-- PersonalPro Evolution - Mercado Pago subscription persistence
-- Execute este SQL no Supabase apenas quando quiser ativar persistencia real via webhook.
-- O webhook funciona sem estas tabelas, mas apenas registra logs e responde 200.

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  plan_id text not null,
  plan_name text not null,
  status text not null default 'Vencida',
  gateway text not null default 'Mercado Pago',
  payment_method text not null default 'Pix',
  mercado_pago_payment_id text,
  mercado_pago_preapproval_id text,
  external_reference text,
  amount numeric(10,2) not null default 0,
  started_at timestamptz,
  current_period_end timestamptz,
  last_event_type text,
  last_event_status text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists subscriptions_profile_id_unique
  on subscriptions (profile_id);

create index if not exists subscriptions_external_reference_idx
  on subscriptions (external_reference);

create index if not exists subscriptions_mercado_pago_payment_id_idx
  on subscriptions (mercado_pago_payment_id);

create index if not exists subscriptions_mercado_pago_preapproval_id_idx
  on subscriptions (mercado_pago_preapproval_id);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  event_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_provider_event_idx
  on payment_events (provider, event_type, event_id);

alter table subscriptions enable row level security;
alter table payment_events enable row level security;

drop policy if exists "subscriptions_select_own_or_admin" on subscriptions;
create policy "subscriptions_select_own_or_admin"
  on subscriptions for select
  using (is_admin() or profile_id = auth.uid());

drop policy if exists "subscriptions_admin_all" on subscriptions;
create policy "subscriptions_admin_all"
  on subscriptions for all
  using (is_admin())
  with check (is_admin());

drop policy if exists "payment_events_admin_select" on payment_events;
create policy "payment_events_admin_select"
  on payment_events for select
  using (is_admin());

-- Inserts/updates feitos pelo webhook usam SUPABASE_SERVICE_ROLE_KEY no backend,
-- portanto bypassam RLS com seguranca. Nao exponha essa chave no frontend.
