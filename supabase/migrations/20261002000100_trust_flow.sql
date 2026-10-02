-- V10 : déroulé de confiance entre voisins.
--  · Un plat dont la dernière portion est réservée reste visible « en cours » jusqu'à la remise (puis disparaît).
--  · L'adresse exacte n'est plus révélée à l'acceptation : le Cooker la partage d'un bouton, quand il le décide
--    (sinon, les deux conviennent d'un point de rencontre dans le chat).
--  · Échange « avec photo » : l'Eater propose un plat sans le publier (offre privée), vérifiée contre le profil
--    santé du Cooker par le serveur, comme un plat publié.
--  · Photo : date de prise de vue et origine (appareil photo / galerie), indice de fraîcheur affiché aux voisins.
--  · Avis : synthèse par critère ; conversations masquables après la transaction (auto au bout de 48 h) ;
--    voisins favoris.

-- ─────────────────────────────────────────────── Colonnes
alter table public.meals
  add column if not exists is_private     boolean not null default false,  -- offre d'échange privée (jamais dans le fil)
  add column if not exists photo_taken_at timestamptz,
  add column if not exists photo_source   text check (photo_source in ('camera', 'library'));

alter table public.orders add column if not exists address_shared_at timestamptz;

alter table public.conversation_participants add column if not exists hidden_at timestamptz;

create table if not exists public.favorite_people (
  user_id    uuid not null references auth.users(id) on delete cascade,
  person_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, person_id),
  check (user_id <> person_id)
);
alter table public.favorite_people enable row level security;
revoke insert, update, delete, truncate on public.favorite_people from anon, authenticated;
drop policy if exists "favorites read own" on public.favorite_people;
create policy "favorites read own" on public.favorite_people for select to authenticated using (user_id = auth.uid());

-- ─────────────────────────────────────────────── Commande en cours sur un plat
create or replace function public.meal_has_active_order(p_meal_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders o
                  where o.meal_id = p_meal_id and o.status in ('requested', 'paid', 'accepted', 'ready'))
$$;

-- ─────────────────────────────────────────────── Sérialisation (contrat = types TypeScript)
create or replace function public.meal_to_json(p_meal_id uuid, p_dist_m double precision default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id,
    'cooker', public.profile_to_json(m.cooker_id),
    'title', m.title,
    'description', m.description,
    'cuisine', m.cuisine_code,
    'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position) from public.meal_photos ph where ph.meal_id = m.id), '[]'::jsonb),
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', mi.raw_name,
        'source', mi.source,
        'allergens', coalesce((select jsonb_agg(mia.allergen_code) from public.meal_ingredient_allergens mia where mia.meal_ingredient_id = mi.id), '[]'::jsonb)
      ) order by mi.position)
      from public.meal_ingredients mi where mi.meal_id = m.id), '[]'::jsonb),
    'allergens', coalesce((select jsonb_agg(ma.allergen_code) from public.meal_allergens ma where ma.meal_id = m.id and ma.kind = 'contains'), '[]'::jsonb),
    'mayContain', coalesce((select jsonb_agg(ma.allergen_code) from public.meal_allergens ma where ma.meal_id = m.id and ma.kind = 'may_contain'), '[]'::jsonb),
    'diets', coalesce((select jsonb_agg(md.diet_code) from public.meal_diets md where md.meal_id = m.id), '[]'::jsonb),
    'mode', m.mode,
    'priceCents', m.price_cents,
    'currency', m.currency,
    'portionsTotal', m.portions_total,
    'portionsLeft', m.portions_left,
    'preparedAt', m.prepared_at,
    'availableUntil', m.available_until,
    'createdAt', m.created_at,
    'photoTakenAt', m.photo_taken_at,
    'photoSource', m.photo_source,
    'pickupLocation', jsonb_build_object(
      'latitude', extensions.st_y(m.pickup_point_public::extensions.geometry),
      'longitude', extensions.st_x(m.pickup_point_public::extensions.geometry)),
    'pickupArea', m.pickup_area,
    'distanceKm', case when p_dist_m is null then null else round((p_dist_m / 1000.0)::numeric, 2) end,
    'status', m.status,
    -- Toutes les portions sont réservées par des commandes pas encore remises : visible, mais « en cours ».
    'pending', m.portions_left = 0 and public.meal_has_active_order(m.id),
    'isPrivate', m.is_private,
    'aiAssisted', m.ai_analysis_id is not null
  )
  from public.meals m where m.id = p_meal_id
$$;

-- ─────────────────────────────────────────────── Fil : les plats « en cours » restent visibles jusqu'à la remise
create or replace function public.feed_meals(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 5000,
  p_cuisines text[] default null,
  p_diets text[] default null,
  p_max_price_cents integer default null,
  p_mode text default 'all',
  p_sort text default 'distance',
  p_limit integer default 60
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_origin extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  with candidates as (
    select m.id, m.created_at, m.price_cents,
           m.portions_left = 0 as pending,
           extensions.st_distance(m.pickup_point_public, v_origin) as dist_m,
           (coalesce(p.cooker_rating_avg, 0) * p.cooker_rating_count + 4.5 * 5) / (p.cooker_rating_count + 5) as score
      from public.meals m
      join public.profiles p on p.id = m.cooker_id and p.deleted_at is null
     where not m.is_private
       and m.available_until > now()
       and (
         (m.status = 'published' and m.portions_left > 0)
         -- Dernière portion réservée : reste affiché (« en cours ») tant que la remise n'est pas faite.
         or (m.status in ('published', 'sold_out') and m.portions_left = 0 and public.meal_has_active_order(m.id))
       )
       and m.cooker_id <> v_uid
       and extensions.st_dwithin(m.pickup_point_public, v_origin, least(greatest(p_radius_m, 500), 50000))
       and (p_cuisines is null or m.cuisine_code = any (p_cuisines))
       and (p_max_price_cents is null or m.price_cents is null or m.price_cents <= p_max_price_cents)
       and (p_mode = 'all' or m.mode::text = p_mode or m.mode = 'both')
       and (p_diets is null or not exists (
             select 1 from unnest(p_diets) d
              where not exists (select 1 from public.meal_diets md where md.meal_id = m.id and md.diet_code = d)))
  ),
  safe as (
    select c.* from candidates c where public.meal_is_safe_for(c.id, v_uid)
  ),
  page as (
    select s.* from safe s
     order by
       s.pending asc,
       case when p_sort = 'rating' then s.score end desc nulls last,
       case when p_sort = 'newest' then s.created_at end desc nulls last,
       case when p_sort = 'price'  then s.price_cents end asc nulls first,
       s.dist_m asc
     limit least(p_limit, 100)
  )
  select jsonb_build_object(
    'meals', coalesce((select jsonb_agg(public.meal_to_json(pg.id, pg.dist_m) order by
                         pg.pending asc,
                         case when p_sort = 'rating' then pg.score end desc nulls last,
                         case when p_sort = 'newest' then pg.created_at end desc nulls last,
                         case when p_sort = 'price'  then pg.price_cents end asc nulls first,
                         pg.dist_m asc) from page pg), '[]'::jsonb),
    'hidden_for_health', (select count(*) from candidates) - (select count(*) from safe)
  ) into v_result;

  return v_result;
end $$;

-- Offres privées : visibles seulement par leur auteur et par le Cooker à qui elles sont proposées.
create or replace function public.get_meal(p_meal_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.meal_to_json(m.id)
    from public.meals m
   where m.id = p_meal_id
     and (
       m.cooker_id = auth.uid()
       or (not m.is_private and m.status in ('published', 'reserved', 'sold_out'))
       or (m.is_private and exists (select 1 from public.orders o where o.offered_meal_id = m.id and o.cooker_id = auth.uid()))
     )
$$;

-- ─────────────────────────────────────────────── Photo : date de prise de vue et origine
create or replace function public.set_meal_photo_meta(p_meal_id uuid, p_taken_at timestamptz, p_source text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_source not in ('camera', 'library') then raise exception 'INVALID_PHOTO_SOURCE'; end if;
  update public.meals
     set photo_source = p_source,
         -- Une date future ou absurde est ignorée ; « appareil photo » = prise à l'instant.
         photo_taken_at = case when p_source = 'camera' then now()
                               when p_taken_at between now() - interval '5 years' and now() + interval '10 minutes' then p_taken_at end
   where id = p_meal_id and cooker_id = auth.uid() and created_at > now() - interval '30 minutes';
end $$;

-- ─────────────────────────────────────────────── Échange avec une photo (offre privée)
-- L'Eater photographie ce qu'il propose ; l'IA pré-remplit, il atteste ingrédients et allergènes ; le serveur crée une
-- offre PRIVÉE (même filet de sécurité que publish_meal : dictionnaire, régimes) puis vérifie qu'elle convient au
-- profil santé du Cooker (propose_swap). Un refus annule tout : aucune offre orpheline.
create or replace function public.propose_swap_with_photo(p_meal_id uuid, p_offer jsonb, p_message text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_offer uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  v_offer := public.publish_meal(
    p_offer || jsonb_build_object('mode', 'swap', 'priceCents', null, 'portions', 1, 'availableHours', 72));
  update public.meals set is_private = true where id = v_offer;
  if p_offer ? 'photoSource' then
    perform public.set_meal_photo_meta(v_offer, nullif(p_offer ->> 'photoTakenAt', '')::timestamptz, p_offer ->> 'photoSource');
  end if;
  return public.propose_swap(p_meal_id, v_offer, p_message) || jsonb_build_object('offered_meal_id', v_offer);
end $$;

-- Une offre privée refusée, annulée ou expirée est retirée (elle n'a pas d'autre usage).
create or replace function public.orders_archive_private_offer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('cancelled', 'declined') and new.offered_meal_id is not null then
    update public.meals set status = 'archived' where id = new.offered_meal_id and is_private;
  end if;
  return new;
end $$;
drop trigger if exists orders_archive_private_offer on public.orders;
create trigger orders_archive_private_offer after update of status on public.orders
  for each row execute function public.orders_archive_private_offer();

-- Mes plats : sans les offres privées (elles vivent dans la conversation d'échange).
create or replace function public.my_meals() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.meal_to_json(x.id) || jsonb_build_object('activeOrders', x.active) order by x.created_at desc), '[]'::jsonb)
  from (
    select m.id, m.created_at,
           (select count(*) from public.orders o
             where (o.meal_id = m.id or o.offered_meal_id = m.id)
               and o.status in ('requested', 'paid', 'accepted', 'ready')) as active
      from public.meals m
     where m.cooker_id = auth.uid() and m.status <> 'archived' and not m.is_private
     order by m.created_at desc
     limit 50
  ) x
$$;

-- ─────────────────────────────────────────────── Adresse : partagée par le Cooker, d'un bouton
create or replace function public.share_pickup_address(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_conv uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.cooker_id <> auth.uid() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if o.status not in ('accepted', 'ready') then raise exception 'INVALID_TRANSITION: adresse partageable après acceptation'; end if;
  if o.address_shared_at is not null then return; end if;
  update public.orders set address_shared_at = now() where id = o.id;
  select c.id into v_conv from public.conversations c where c.order_id = o.id;
  if v_conv is not null then
    insert into public.messages (conversation_id, sender_id, kind, body)
    values (v_conv, null, 'system', '📍 Le Cooker a partagé son adresse de cueillette (en haut de la conversation).');
  end if;
end $$;

create or replace function public.get_pickup_details(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'latitude', extensions.st_y(m.pickup_point::extensions.geometry),
    'longitude', extensions.st_x(m.pickup_point::extensions.geometry),
    'area', m.pickup_area,
    'address', case when up.home_point is not null and extensions.st_dwithin(up.home_point, m.pickup_point, 60) then up.address_line end,
    'postalCode', case when up.home_point is not null and extensions.st_dwithin(up.home_point, m.pickup_point, 60) then up.postal_code end)
  from public.orders o
  join public.meals m on m.id = o.meal_id
  left join public.user_private up on up.user_id = o.cooker_id
  where o.id = p_order_id
    and o.status in ('accepted', 'ready', 'picked_up')
    -- Le Cooker voit toujours son point ; l'Eater, seulement une fois l'adresse partagée.
    and (auth.uid() = o.cooker_id or (auth.uid() = o.eater_id and o.address_shared_at is not null))
$$;

-- Messages système : l'acceptation n'annonce plus l'adresse ; le paiement reste une simple pré-autorisation.
create or replace function public.orders_on_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
  v_msg text;
  v_n integer;
begin
  if new.status = old.status then return new; end if;

  insert into public.order_events (order_id, from_status, to_status, actor_id, note)
  values (new.id, old.status, new.status, auth.uid(), new.cancel_reason);

  if new.kind = 'swap' and new.status = 'accepted' then
    update public.meals set portions_left = portions_left - 1
     where id in (new.meal_id, new.offered_meal_id) and portions_left > 0 and status = 'published';
    get diagnostics v_n = row_count;
    if v_n < 2 then raise exception 'SWAP_MEAL_NO_LONGER_AVAILABLE'; end if;
  elsif new.status in ('cancelled', 'declined') then
    if new.kind = 'purchase' then
      update public.meals set portions_left = least(portions_total, portions_left + new.quantity) where id = new.meal_id;
    elsif old.status in ('accepted', 'ready') then
      update public.meals set portions_left = least(portions_total, portions_left + 1) where id in (new.meal_id, new.offered_meal_id);
    end if;
  elsif new.status = 'completed' then
    update public.profiles set meals_shared_count = meals_shared_count + new.quantity where id = new.cooker_id;
    if new.kind = 'swap' then
      update public.profiles set meals_shared_count = meals_shared_count + 1 where id = new.eater_id;
    end if;
  end if;

  v_msg := case new.status
    when 'paid'      then 'Montant pré-autorisé ✅ (rien n''est débité avant la remise du plat). En attente du Cooker.'
    when 'accepted'  then 'Demande acceptée 🎉 Convenez du lieu ici : le Cooker peut partager son adresse d''un bouton, ou proposez un point de rencontre.'
    when 'declined'  then 'Demande refusée par le Cooker. Aucun montant ne sera débité.'
    when 'ready'     then 'Le plat est prêt à être récupéré 🍽️'
    when 'picked_up' then 'Remise confirmée : le paiement est débité maintenant. Merci ! Pensez à laisser un avis.'
    when 'completed' then 'Transaction terminée ✅ Laissez un avis pour aider la communauté ⭐'
    when 'cancelled' then 'Demande annulée.'
    when 'disputed'  then 'Un litige a été ouvert. L''équipe Homemade vous contactera.'
  end;
  select c.id into v_conv from public.conversations c where c.order_id = new.id;
  if v_conv is not null and v_msg is not null then
    insert into public.messages (conversation_id, sender_id, kind, body) values (v_conv, null, 'system', v_msg);
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────── Avis : détail par critère
create or replace function public.get_reviews_for_user(p_user_id uuid, p_role public.review_role, p_limit integer default 20) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) from (
    select r.created_at, jsonb_build_object(
      'id', r.id, 'author', public.profile_to_json(r.author_id), 'rating', r.rating,
      'comment', coalesce(r.comment, ''), 'tags', to_jsonb(r.tags), 'subScores', r.sub_scores, 'createdAt', r.created_at) as j
    from public.reviews r
    where r.subject_id = p_user_id and r.role = p_role and r.visible_at <= now()
    order by r.created_at desc
    limit least(p_limit, 50)
  ) x
$$;

create or replace function public.review_summary(p_user_id uuid, p_role public.review_role) returns jsonb
language sql stable security definer set search_path = '' as $$
  with r as (
    select * from public.reviews where subject_id = p_user_id and role = p_role and visible_at <= now()
  )
  select jsonb_build_object(
    'count', (select count(*) from r),
    'average', (select round(avg(rating)::numeric, 2) from r),
    'distribution', (select jsonb_object_agg(s::text, (select count(*) from r where rating = s)) from generate_series(1, 5) s),
    'criteria', coalesce((
      select jsonb_object_agg(k, avg_v) from (
        select kv.key as k, round(avg((kv.value)::numeric), 2) as avg_v
          from r, jsonb_each_text(r.sub_scores) kv
         where kv.value ~ '^[1-5](\.0+)?$'
         group by kv.key
      ) c), '{}'::jsonb),
    'tags', coalesce((
      select jsonb_object_agg(tag, n) from (
        select t as tag, count(*) as n from r, unnest(r.tags) t group by t order by count(*) desc limit 8
      ) tg), '{}'::jsonb)
  )
$$;

-- Profil public d'un voisin (page « voisin » : notes, plats en ligne compatibles avec MON profil santé).
create or replace function public.person_page(p_person_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', public.profile_to_json(p.id),
    'isFavorite', exists (select 1 from public.favorite_people f where f.user_id = auth.uid() and f.person_id = p.id),
    'tradedWith', exists (select 1 from public.orders o where (o.cooker_id = auth.uid() and o.eater_id = p.id) or (o.eater_id = auth.uid() and o.cooker_id = p.id)),
    'cookerSummary', public.review_summary(p.id, 'cooker'),
    'eaterSummary', public.review_summary(p.id, 'eater'),
    'meals', coalesce((
      select jsonb_agg(public.meal_to_json(m.id) order by m.created_at desc)
        from public.meals m
       where m.cooker_id = p.id and not m.is_private and m.status = 'published' and m.available_until > now()
         and (m.cooker_id = auth.uid() or public.meal_is_safe_for(m.id, auth.uid()))), '[]'::jsonb)
  )
  from public.profiles p where p.id = p_person_id and p.deleted_at is null
$$;

-- ─────────────────────────────────────────────── Voisins favoris
create or replace function public.toggle_favorite_person(p_person_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_person_id = v_uid then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if exists (select 1 from public.favorite_people where user_id = v_uid and person_id = p_person_id) then
    delete from public.favorite_people where user_id = v_uid and person_id = p_person_id;
    return false;
  end if;
  insert into public.favorite_people (user_id, person_id) values (v_uid, p_person_id);
  return true;
end $$;

create or replace function public.my_favorite_people() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.profile_to_json(f.person_id) || jsonb_build_object(
           'activeMeals', (select count(*) from public.meals m
                            where m.cooker_id = f.person_id and not m.is_private and m.status = 'published' and m.available_until > now()))
         order by f.created_at desc), '[]'::jsonb)
    from public.favorite_people f
    join public.profiles p on p.id = f.person_id and p.deleted_at is null
   where f.user_id = auth.uid()
$$;

-- ─────────────────────────────────────────────── Conversations : masquables après la transaction, auto 48 h
create or replace function public.conversation_is_closed(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select o.status in ('picked_up', 'completed', 'cancelled', 'declined')
      from public.conversations c join public.orders o on o.id = c.order_id
     where c.id = p_conversation_id), true)
$$;

create or replace function public.hide_conversation(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_participant(p_conversation_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not public.conversation_is_closed(p_conversation_id) then
    raise exception 'CONVERSATION_ACTIVE: terminez ou annulez la transaction avant de supprimer la conversation';
  end if;
  update public.conversation_participants set hidden_at = now()
   where conversation_id = p_conversation_id and user_id = auth.uid();
end $$;

create or replace function public.my_conversations() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.last_at desc), '[]'::jsonb) from (
    select lm.created_at as last_at, jsonb_build_object(
      'id', c.id,
      'orderId', c.order_id,
      'orderStatus', o.status,
      'closed', public.conversation_is_closed(c.id),
      'mealTitle', coalesce(m.title, ''),
      'mealPhoto', (select ph.storage_path from public.meal_photos ph where ph.meal_id = m.id order by ph.position limit 1),
      'other', public.profile_to_json(other.user_id),
      'lastMessage', lm.body,
      'lastMessageAt', lm.created_at,
      'unread', (select count(*) from public.messages mm where mm.conversation_id = c.id and mm.created_at > me.last_read_at and mm.sender_id is distinct from auth.uid())
    ) as j
    from public.conversation_participants me
    join public.conversations c on c.id = me.conversation_id
    join public.conversation_participants other on other.conversation_id = c.id and other.user_id <> me.user_id
    left join public.orders o on o.id = c.order_id
    left join public.meals m on m.id = c.meal_id
    left join lateral (select body, created_at from public.messages where conversation_id = c.id order by created_at desc limit 1) lm on true
    where me.user_id = auth.uid()
      and me.hidden_at is null
      -- Transaction terminée depuis plus de 48 h : la conversation disparaît d'elle-même.
      and not coalesce(o.status in ('picked_up', 'completed', 'cancelled', 'declined') and o.updated_at < now() - interval '48 hours', false)
  ) x
$$;

-- Données : conversations closes depuis 30 jours supprimées (le délai couvre litiges et signalements).
create or replace function public.purge_old_conversations() returns void
language sql security definer set search_path = '' as $$
  delete from public.conversations c
   using public.orders o
   where o.id = c.order_id
     and o.status in ('picked_up', 'completed', 'cancelled', 'declined')
     and o.updated_at < now() - interval '30 days'
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('homemade-purge-conversations', '40 3 * * *', 'select public.purge_old_conversations()');
  end if;
end $$;

-- ─────────────────────────────────────────────── Privilèges d'exécution
revoke execute on function
  public.meal_has_active_order(uuid),
  public.set_meal_photo_meta(uuid, timestamptz, text),
  public.propose_swap_with_photo(uuid, jsonb, text),
  public.orders_archive_private_offer(),
  public.share_pickup_address(uuid),
  public.review_summary(uuid, public.review_role),
  public.person_page(uuid),
  public.toggle_favorite_person(uuid),
  public.my_favorite_people(),
  public.conversation_is_closed(uuid),
  public.hide_conversation(uuid),
  public.purge_old_conversations()
from public, anon, authenticated;

grant execute on function
  public.set_meal_photo_meta(uuid, timestamptz, text),
  public.propose_swap_with_photo(uuid, jsonb, text),
  public.share_pickup_address(uuid),
  public.review_summary(uuid, public.review_role),
  public.person_page(uuid),
  public.toggle_favorite_person(uuid),
  public.my_favorite_people(),
  public.hide_conversation(uuid)
to authenticated;
