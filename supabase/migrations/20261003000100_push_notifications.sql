-- Notifications push (Firebase Cloud Messaging), même quand l'app est fermée.
-- Chaque téléphone enregistre son jeton FCM ; à chaque nouveau message (texte ou étape de commande), un déclencheur
-- appelle l'Edge Function `push-notify` (via pg_net, sans bloquer l'écriture), qui envoie la notification par FCM.
-- Inactif tant que le robot de déploiement n'a pas reçu le compte de service Firebase (table push_config vide).

-- ─────────────────────────────────────────────── Jetons des appareils
create table if not exists public.push_tokens (
  token       text primary key check (char_length(token) between 20 and 4096),
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null check (platform in ('android', 'ios')),
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
-- Aucun accès direct : écriture par RPC, lecture par le serveur (service role) seulement.
revoke all on public.push_tokens from anon, authenticated;

-- Adresse de l'Edge Function et secret partagé (écrits par le robot de déploiement ; jamais lisibles par l'app).
create table if not exists public.push_config (
  id          boolean primary key default true check (id),
  endpoint    text not null,
  secret      text not null check (char_length(secret) >= 32),
  updated_at  timestamptz not null default now()
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

/** Le téléphone enregistre son jeton FCM (un même téléphone passe au dernier compte connecté). */
create or replace function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_platform not in ('android', 'ios') or char_length(coalesce(p_token, '')) not between 20 and 4096 then
    raise exception 'INVALID_INPUT';
  end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, v_uid, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  -- Au plus 10 appareils par compte : les plus anciens sont oubliés.
  delete from public.push_tokens where user_id = v_uid and token in (
    select token from public.push_tokens where user_id = v_uid order by updated_at desc offset 10);
end $$;

/** Déconnexion : ce téléphone ne reçoit plus les notifications du compte. */
create or replace function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid()
$$;

-- Suppression du compte : plus aucune notification vers ses téléphones.
create or replace function public.profiles_forget_push_tokens() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_tokens where user_id = new.id;
  return new;
end $$;
drop trigger if exists profiles_forget_push_tokens on public.profiles;
create trigger profiles_forget_push_tokens after update of deleted_at on public.profiles
  for each row when (new.deleted_at is not null) execute function public.profiles_forget_push_tokens();

-- ─────────────────────────────────────────────── Envoi à chaque nouveau message
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

create or replace function public.messages_push_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cfg public.push_config%rowtype;
begin
  select * into cfg from public.push_config where id;
  if not found then return new; end if;
  -- Personne à prévenir (aucun destinataire avec un téléphone enregistré) : pas d'appel.
  if not exists (
    select 1 from public.conversation_participants cp
      join public.push_tokens pt on pt.user_id = cp.user_id
     where cp.conversation_id = new.conversation_id and cp.user_id is distinct from new.sender_id
  ) then
    return new;
  end if;
  begin
    -- Appel asynchrone (pg_net) : le message est enregistré même si l'envoi échoue.
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using cfg.endpoint, jsonb_build_object('message_id', new.id),
            jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret);
  exception when others then
    raise warning 'push-notify : %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists messages_push_notify on public.messages;
create trigger messages_push_notify after insert on public.messages
  for each row execute function public.messages_push_notify();

-- ─────────────────────────────────────────────── Privilèges d'exécution
revoke execute on function
  public.register_push_token(text, text),
  public.unregister_push_token(text),
  public.messages_push_notify(),
  public.profiles_forget_push_tokens()
from public, anon, authenticated;

grant execute on function
  public.register_push_token(text, text),
  public.unregister_push_token(text)
to authenticated;
