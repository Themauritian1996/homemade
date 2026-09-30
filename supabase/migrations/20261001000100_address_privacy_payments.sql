-- V7 : adresse privée du Cooker, zone publique par code postal, anti-contournement dans le chat, statut des paiements.
-- Principe : l'adresse exacte n'est lisible que par son propriétaire, puis par l'autre partie d'une commande ACCEPTÉE
-- (achat : pré-autorisation Stripe faite + acceptation du Cooker). Publiquement : 3 premiers caractères du code postal
-- (région de tri d'acheminement, ex. « H2J ») et un point décalé de 100 à 300 m.

-- ─────────────────────────────────────────────── Adresse privée
alter table public.user_private
  add column if not exists address_line text check (char_length(address_line) <= 200),
  add column if not exists postal_code  text check (postal_code ~ '^[A-Z][0-9][A-Z] [0-9][A-Z][0-9]$'),
  add column if not exists home_point   extensions.geography(point, 4326);

-- Colonnes sensibles : jamais lisibles directement, même par leur propriétaire (passer par get_my_address()).
revoke select on public.user_private from authenticated;
grant select (user_id, stripe_charges_enabled, terms_accepted_at, health_consent_at, updated_at) on public.user_private to authenticated;

/** Code postal canadien normalisé (« h2j1a1 » → « H2J 1A1 ») ; null s'il est invalide. */
create or replace function public.normalize_postal_code(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) ~ '^[A-Z][0-9][A-Z][0-9][A-Z][0-9]$'
    then substr(upper(regexp_replace(p, '[^A-Za-z0-9]', '', 'g')), 1, 3) || ' ' || substr(upper(regexp_replace(p, '[^A-Za-z0-9]', '', 'g')), 4, 3)
  end
$$;

create or replace function public.set_my_address(p_address text, p_postal_code text, p_lat double precision, p_lng double precision)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_postal text := public.normalize_postal_code(p_postal_code);
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if nullif(trim(p_postal_code), '') is not null and v_postal is null then raise exception 'INVALID_POSTAL_CODE'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'INVALID_LOCATION'; end if;
  update public.user_private
     set address_line = left(nullif(trim(p_address), ''), 200),
         postal_code  = v_postal,
         home_point   = extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
         updated_at   = now()
   where user_id = v_uid;
  -- Profil public : la zone postale remplace le quartier saisi à la main (jamais l'adresse).
  if v_postal is not null then update public.profiles set neighborhood = left(v_postal, 3) where id = v_uid; end if;
  return public.get_my_address();
end $$;

create or replace function public.get_my_address() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'address', up.address_line,
    'postalCode', up.postal_code,
    'zone', left(up.postal_code, 3),
    'latitude', extensions.st_y(up.home_point::extensions.geometry),
    'longitude', extensions.st_x(up.home_point::extensions.geometry))
  from public.user_private up where up.user_id = auth.uid()
$$;

-- Zone publique d'une annonce : région postale du Cooker (« H2J ») + repère facultatif sans chiffres (pas d'adresse).
create or replace function public.meals_public_zone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_zone text;
  v_hint text := nullif(trim(regexp_replace(regexp_replace(coalesce(new.pickup_area, ''), '[0-9]', '', 'g'), '\s+', ' ', 'g')), '');
begin
  select left(up.postal_code, 3) into v_zone from public.user_private up where up.user_id = new.cooker_id;
  if v_hint in ('Quartier communiqué après confirmation', 'Neighbourhood shared after confirmation') then v_hint := null; end if;
  if v_zone is not null then
    new.pickup_area := left(v_zone || coalesce(' · ' || left(v_hint, 40), ''), 120);
  elsif v_hint is not null then
    new.pickup_area := left(v_hint, 120);
  end if;
  return new;
end $$;
drop trigger if exists meals_public_zone on public.meals;
create trigger meals_public_zone before insert on public.meals for each row execute function public.meals_public_zone();

-- Adresse exacte : seulement pour les deux parties d'une commande acceptée (achat : déjà pré-autorisé par Stripe).
create or replace function public.get_pickup_details(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'latitude', extensions.st_y(m.pickup_point::extensions.geometry),
    'longitude', extensions.st_x(m.pickup_point::extensions.geometry),
    'area', m.pickup_area,
    -- L'adresse écrite n'est jointe que si le plat se récupère au domicile enregistré (à moins de 60 m).
    'address', case when up.home_point is not null and extensions.st_dwithin(up.home_point, m.pickup_point, 60) then up.address_line end,
    'postalCode', case when up.home_point is not null and extensions.st_dwithin(up.home_point, m.pickup_point, 60) then up.postal_code end)
  from public.orders o
  join public.meals m on m.id = o.meal_id
  left join public.user_private up on up.user_id = o.cooker_id
  where o.id = p_order_id
    and auth.uid() in (o.eater_id, o.cooker_id)
    and o.status in ('accepted', 'ready', 'picked_up')
$$;

-- Suppression du compte : l'adresse est effacée avec le reste.
create or replace function public.profiles_forget_address() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.user_private set address_line = null, postal_code = null, home_point = null where user_id = new.id;
  return new;
end $$;
drop trigger if exists profiles_forget_address on public.profiles;
create trigger profiles_forget_address after update of deleted_at on public.profiles
  for each row when (new.deleted_at is not null) execute function public.profiles_forget_address();

-- ─────────────────────────────────────────────── Anti-contournement (chat)
-- Les coordonnées (téléphone, courriel, liens) et les moyens de paiement hors app sont masqués : la transaction, l'adresse
-- et la protection (remboursement, avis, assurance) passent par Homemade.
alter table public.messages add column if not exists masked boolean not null default false;

create or replace function public.mask_off_platform(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p, ''),
          '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '•••', 'g'),                    -- courriels
        '(https?://|www\.)\S+', '•••', 'gi'),                                                  -- liens
      '(\+?1[\s.-]?)?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}', '•••', 'g'),              -- téléphones
    '\m(interac|virements?|e-?transferts?|etransferts?|paypal|venmo|wise|zelle|lydia|comptant|cash|argent liquide|en liquide|hors (de )?l.?app|off[- ]?app)\M',
    '•••', 'gi')
$$;

create or replace function public.messages_mask_off_platform() returns trigger
language plpgsql set search_path = '' as $$
declare v_masked text;
begin
  if new.kind <> 'text' then return new; end if;
  v_masked := public.mask_off_platform(new.body);
  if v_masked is distinct from new.body then
    new.body := v_masked;
    new.masked := true;
  end if;
  return new;
end $$;
drop trigger if exists messages_mask_off_platform on public.messages;
create trigger messages_mask_off_platform before insert on public.messages for each row execute function public.messages_mask_off_platform();

create or replace function public.orders_mask_swap_message() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.swap_message is not null then new.swap_message := public.mask_off_platform(new.swap_message); end if;
  return new;
end $$;
drop trigger if exists orders_mask_swap_message on public.orders;
create trigger orders_mask_swap_message before insert or update of swap_message on public.orders
  for each row execute function public.orders_mask_swap_message();

alter type public.report_reason add value if not exists 'off_platform';

-- ─────────────────────────────────────────────── Paiements (statut pour l'écran Paramètres)
create or replace function public.my_payment_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'hasAccount', up.stripe_account_id is not null,
    'chargesEnabled', up.stripe_charges_enabled,
    'hasCustomer', up.stripe_customer_id is not null)
  from public.user_private up where up.user_id = auth.uid()
$$;

-- ─────────────────────────────────────────────── Privilèges d'exécution
revoke execute on function
  public.normalize_postal_code(text),
  public.set_my_address(text, text, double precision, double precision),
  public.get_my_address(),
  public.meals_public_zone(),
  public.profiles_forget_address(),
  public.mask_off_platform(text),
  public.messages_mask_off_platform(),
  public.orders_mask_swap_message(),
  public.my_payment_status()
from public, anon, authenticated;

grant execute on function
  public.set_my_address(text, text, double precision, double precision),
  public.get_my_address(),
  public.my_payment_status(),
  public.normalize_postal_code(text),
  public.mask_off_platform(text)
to authenticated;
