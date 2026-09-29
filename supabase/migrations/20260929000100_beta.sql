-- ════════════════════════════════════════════════════════════════════════════
-- Homemade — Bêta fermée
--   · inscription sur code d'invitation (vérifié par le trigger d'inscription, fail-closed)
--   · codes personnels pour inviter ses voisins
--   · commentaires des testeurs
--   · espace Cooker : mes plats, retrait d'une annonce
--   · droits Loi 25 : export et suppression de mes données
--   · journal IA : distinction analyse de plat / lecture d'étiquette (OCR)
-- Migration additive : les migrations précédentes ne sont pas modifiées.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────── Configuration de l'app (lecture serveur uniquement)
create table public.app_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
-- Bêta fermée : un code d'invitation est exigé à l'inscription.
-- Pour ouvrir les inscriptions : update public.app_config set value = 'false' where key = 'invite_required';
insert into public.app_config (key, value) values ('invite_required', 'true'::jsonb) on conflict (key) do nothing;

-- ─────────────────────────────────────────────── Codes d'invitation
create table public.beta_invites (
  code        text primary key check (code ~ '^[A-Z0-9-]{4,24}$'),
  note        text check (char_length(note) <= 120),
  max_uses    integer not null default 10 check (max_uses between 0 and 10000),
  uses        integer not null default 0 check (uses >= 0),
  created_by  uuid references auth.users(id) on delete set null,  -- null = code créé par l'équipe
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
-- Un seul code personnel par membre.
create unique index beta_invites_owner_idx on public.beta_invites (created_by) where created_by is not null;

-- Code de lancement (à partager avec les premiers testeurs ; en créer d'autres depuis l'éditeur SQL).
insert into public.beta_invites (code, note, max_uses) values ('VOISINS2026', 'Code de lancement de la bêta fermée', 100)
on conflict (code) do nothing;

alter table public.profiles add column invited_with text;

-- ─────────────────────────────────────────────── Commentaires des testeurs
create table public.beta_feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('bug', 'idea', 'praise', 'other')),
  message      text not null check (char_length(message) between 3 and 2000),
  screen       text check (char_length(screen) <= 60),
  app_version  text check (char_length(app_version) <= 40),
  platform     text check (char_length(platform) <= 20),
  status       text not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at   timestamptz not null default now()
);
create index beta_feedback_created_idx on public.beta_feedback (created_at desc);

-- ─────────────────────────────────────────────── Journal IA : type de tâche
alter table public.ai_analyses add column task text not null default 'meal' check (task in ('meal', 'ocr'));

-- ─────────────────────────────────────────────── Sécurité des nouvelles tables
do $$
declare t text;
begin
  foreach t in array array['app_config', 'beta_invites', 'beta_feedback'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
-- app_config et beta_invites : aucune policy → illisibles par les clients (accès via les fonctions ci-dessous).
create policy "feedback create own" on public.beta_feedback for insert to authenticated with check (user_id = auth.uid());
create policy "feedback read own"   on public.beta_feedback for select to authenticated using (user_id = auth.uid());
grant insert (user_id, kind, message, screen, app_version, platform) on public.beta_feedback to authenticated;
grant select on public.beta_feedback to authenticated;

-- ─────────────────────────────────────────────── Invitations
create or replace function public.normalize_invite(p text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '\s', '', 'g'))
$$;

-- Fail-closed : sans configuration explicite, l'invitation est exigée.
create or replace function public.invite_required() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (c.value #>> '{}')::boolean from public.app_config c where c.key = 'invite_required'), true)
$$;

-- Vérification avant inscription (écran « Créer un compte ») : ne révèle rien d'autre que la validité.
create or replace function public.invite_status(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'required', public.invite_required(),
    'valid', exists (
      select 1 from public.beta_invites i
       where i.code = public.normalize_invite(p_code)
         and i.uses < i.max_uses
         and (i.expires_at is null or i.expires_at > now())))
$$;

-- Inscription : le code est consommé dans la même transaction que la création du compte.
-- Code manquant, invalide, expiré ou épuisé ⇒ l'inscription échoue (si l'invitation est exigée).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := nullif(public.normalize_invite(new.raw_user_meta_data ->> 'invite_code'), '');
  v_used text;
begin
  if v_code is not null then
    update public.beta_invites set uses = uses + 1
     where code = v_code and uses < max_uses and (expires_at is null or expires_at > now())
    returning code into v_used;
  end if;
  if v_used is null and public.invite_required() then
    raise exception 'INVITE_CODE_INVALID: code d''invitation manquant, invalide ou épuisé';
  end if;

  insert into public.profiles (id, display_name, invited_with)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), v_used);
  insert into public.user_private (user_id, terms_accepted_at) values (new.id, now());
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;

-- Code personnel d'un membre (créé à la première demande) : 5 invitations.
create or replace function public.my_invite_code() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.beta_invites%rowtype;
  v_try integer := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  loop
    select * into v_row from public.beta_invites where created_by = v_uid;
    exit when found;
    v_try := v_try + 1;
    if v_try > 10 then raise exception 'INVITE_CODE_GENERATION_FAILED'; end if;
    -- Alphabet sans caractères ambigus (0/O, 1/I/L).
    insert into public.beta_invites (code, note, max_uses, created_by)
    select 'HM-' || string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::integer, 1), ''), 'Code personnel', 5, v_uid
      from generate_series(1, 6)
    on conflict do nothing;
  end loop;
  return jsonb_build_object('code', v_row.code, 'uses', v_row.uses, 'maxUses', v_row.max_uses,
                            'remaining', greatest(v_row.max_uses - v_row.uses, 0));
end $$;

-- ─────────────────────────────────────────────── Ouverture de session
-- L'état « onboardé » vit sur le serveur (consentement santé horodaté) : il suit le compte, pas le téléphone.
create or replace function public.session_bootstrap() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'onboarded', coalesce((select up.health_consent_at is not null from public.user_private up where up.user_id = auth.uid()), false),
    'deleted', coalesce((select p.deleted_at is not null from public.profiles p where p.id = auth.uid()), true),
    'health', public.get_health_profile(),
    'defaultRadiusKm', coalesce((select round(s.default_radius_m / 1000.0) from public.user_settings s where s.user_id = auth.uid()), 5)
  )
$$;

-- ─────────────────────────────────────────────── Espace Cooker
create or replace function public.my_meals() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.meal_to_json(x.id) || jsonb_build_object('activeOrders', x.active) order by x.created_at desc), '[]'::jsonb)
  from (
    select m.id, m.created_at,
           (select count(*) from public.orders o
             where (o.meal_id = m.id or o.offered_meal_id = m.id)
               and o.status in ('requested', 'paid', 'accepted', 'ready')) as active
      from public.meals m
     where m.cooker_id = auth.uid() and m.status <> 'archived'
     order by m.created_at desc
     limit 50
  ) x
$$;

-- Retrait d'une annonce par son Cooker. Refusé si une commande payée ou un échange accepté est en cours ;
-- les propositions d'échange en attente sont refusées/annulées automatiquement.
create or replace function public.withdraw_meal(p_meal_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  m public.meals%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select * into m from public.meals where id = p_meal_id for update;
  if not found or m.cooker_id <> v_uid then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if exists (
    select 1 from public.orders o
     where (o.meal_id = m.id or o.offered_meal_id = m.id)
       and (o.status in ('paid', 'accepted', 'ready') or (o.kind = 'purchase' and o.status = 'requested'))
  ) then
    raise exception 'ACTIVE_ORDERS: une commande ou un échange accepté est en cours pour ce plat';
  end if;

  update public.orders set status = 'declined', cancel_reason = 'Plat retiré par le Cooker'
   where kind = 'swap' and status = 'requested' and meal_id = m.id;
  update public.orders set status = 'cancelled', cancel_reason = 'Plat proposé retiré'
   where kind = 'swap' and status = 'requested' and offered_meal_id = m.id;
  update public.meals set status = 'archived' where id = m.id;
end $$;

-- ─────────────────────────────────────────────── Loi 25 : accès et suppression
create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'private', (select jsonb_build_object('phone', up.phone, 'terms_accepted_at', up.terms_accepted_at,
                                          'health_consent_at', up.health_consent_at, 'payments_enabled', up.stripe_charges_enabled)
                  from public.user_private up where up.user_id = auth.uid()),
    'settings', (select to_jsonb(s) - 'user_id' from public.user_settings s where s.user_id = auth.uid()),
    'health', public.get_health_profile(),
    'meals', coalesce((select jsonb_agg(public.meal_to_json(m.id) order by m.created_at) from public.meals m where m.cooker_id = auth.uid()), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', o.id, 'kind', o.kind, 'role', case when o.cooker_id = auth.uid() then 'cooker' else 'eater' end,
                 'status', o.status, 'quantity', o.quantity, 'total_cents', o.total_cents, 'created_at', o.created_at) order by o.created_at)
               from public.orders o where auth.uid() in (o.cooker_id, o.eater_id)), '[]'::jsonb),
    'reviews_written', coalesce((select jsonb_agg(jsonb_build_object('order_id', r.order_id, 'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at))
               from public.reviews r where r.author_id = auth.uid()), '[]'::jsonb),
    'reviews_received', coalesce((select jsonb_agg(jsonb_build_object('order_id', r.order_id, 'rating', r.rating, 'comment', r.comment, 'created_at', r.created_at))
               from public.reviews r where r.subject_id = auth.uid() and r.visible_at <= now()), '[]'::jsonb),
    'messages_sent', coalesce((select jsonb_agg(jsonb_build_object('conversation_id', mm.conversation_id, 'body', mm.body, 'created_at', mm.created_at) order by mm.created_at)
               from public.messages mm where mm.sender_id = auth.uid()), '[]'::jsonb),
    'ai_analyses', coalesce((select jsonb_agg(jsonb_build_object('task', a.task, 'status', a.status, 'model', a.model, 'created_at', a.created_at) order by a.created_at)
               from public.ai_analyses a where a.user_id = auth.uid()), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg(jsonb_build_object('kind', f.kind, 'message', f.message, 'created_at', f.created_at))
               from public.beta_feedback f where f.user_id = auth.uid()), '[]'::jsonb)
  )
$$;

-- Suppression du compte : données santé et privées effacées, profil anonymisé, annonces retirées.
-- Les avis et messages restent visibles de l'autre partie sous « Membre supprimé » (intégrité des échanges).
-- Refusée tant qu'une commande payante est en cours (l'argent suit la remise du plat).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if exists (select 1 from public.orders o
              where v_uid in (o.cooker_id, o.eater_id) and o.kind = 'purchase'
                and o.status in ('requested', 'paid', 'accepted', 'ready', 'picked_up', 'disputed')) then
    raise exception 'ACTIVE_PAID_ORDERS: terminez ou annulez d''abord vos commandes payantes en cours';
  end if;

  update public.orders
     set status = case when cooker_id = v_uid and status = 'requested' then 'declined'::public.order_status else 'cancelled'::public.order_status end,
         cancel_reason = 'Compte supprimé'
   where kind = 'swap' and v_uid in (cooker_id, eater_id) and status in ('requested', 'accepted', 'ready');

  update public.meals set status = 'archived' where cooker_id = v_uid and status <> 'archived';

  delete from public.user_allergens where user_id = v_uid;
  delete from public.user_diets where user_id = v_uid;
  delete from public.ai_analyses where user_id = v_uid;
  delete from public.beta_feedback where user_id = v_uid;
  update public.user_settings set strict_traces = false, notify_new_nearby = false, notify_messages = false where user_id = v_uid;
  update public.user_private set phone = null, health_consent_at = null where user_id = v_uid;
  update public.beta_invites set max_uses = uses where created_by = v_uid;
  update public.profiles
     set display_name = 'Membre supprimé', avatar_url = null, bio = null, neighborhood = null, deleted_at = now()
   where id = v_uid;
end $$;

-- ─────────────────────────────────────────────── Privilèges d'exécution
revoke execute on function
  public.normalize_invite(text),
  public.invite_required(),
  public.invite_status(text),
  public.my_invite_code(),
  public.session_bootstrap(),
  public.my_meals(),
  public.withdraw_meal(uuid),
  public.export_my_data(),
  public.delete_my_account()
from public, anon, authenticated;

grant execute on function public.invite_status(text) to anon, authenticated;
grant execute on function
  public.my_invite_code(),
  public.session_bootstrap(),
  public.my_meals(),
  public.withdraw_meal(uuid),
  public.export_my_data(),
  public.delete_my_account()
to authenticated;
