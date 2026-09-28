-- ════════════════════════════════════════════════════════════════════════════
-- Homemade — Logique métier en base (triggers + RPC)
-- Principe : les tables critiques (meals, meal_allergens, orders, reviews) ne sont JAMAIS écrites
-- directement par le client. Toute écriture passe par ces fonctions, qui valident et journalisent.
-- Toutes les fonctions fixent search_path = '' et qualifient les objets (sécurité SECURITY DEFINER).
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────── Utilitaires
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger meals_touch    before update on public.meals    for each row execute function public.touch_updated_at();
create trigger orders_touch   before update on public.orders   for each row execute function public.touch_updated_at();

create or replace function public.normalize_name(p text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(trim(p), '\s+', ' ', 'g'))
$$;

-- ─────────────────────────────────────────────── Création de compte
-- Déclenché à l'inscription Supabase Auth : crée profil public, données privées et réglages.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)));
  insert into public.user_private (user_id, terms_accepted_at) values (new.id, now());
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────── Moteur de sécurité alimentaire (source de vérité)
-- Un plat est « sûr » pour un utilisateur si :
--   1. ses allergènes ont été confirmés par le Cooker ;
--   2. aucun allergène « contient » ne croise le profil ;
--   3. aucune « trace possible » ne croise une ALLERGIE (ou une intolérance si strict_traces) ;
--   4. il respecte tous les régimes du profil.
-- meal_allergens contient déjà les implications (blé ⇒ gluten) : la comparaison est une égalité simple.
create or replace function public.meal_is_safe_for(p_meal_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.meals m where m.id = p_meal_id and m.allergens_confirmed_at is not null)
    and not exists (
      select 1
      from public.user_allergens ua
      join public.meal_allergens ma on ma.allergen_code = ua.allergen_code and ma.meal_id = p_meal_id
      where ua.user_id = p_user_id
        and (
          ma.kind = 'contains'
          or ua.severity = 'allergy'
          or coalesce((select s.strict_traces from public.user_settings s where s.user_id = p_user_id), false)
        )
    )
    and not exists (
      select 1 from public.user_diets ud
      where ud.user_id = p_user_id
        and not exists (select 1 from public.meal_diets md where md.meal_id = p_meal_id and md.diet_code = ud.diet_code)
    )
$$;

-- Recalcule l'ensemble final des allergènes d'un plat :
-- (allergènes par ingrédient) ∪ (dictionnaire curé) ∪ (déclarés) + implications ; traces à part.
create or replace function public.recompute_meal_allergens(p_meal_id uuid, p_declared text[], p_may_contain text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.meal_allergens where meal_id = p_meal_id;

  with base as (
    select mia.allergen_code as code, 'ingredient'::public.allergen_source as src
      from public.meal_ingredients mi join public.meal_ingredient_allergens mia on mia.meal_ingredient_id = mi.id
     where mi.meal_id = p_meal_id
    union
    select ia.allergen_code, 'dictionary'::public.allergen_source
      from public.meal_ingredients mi
      join public.ingredients i on i.id = mi.ingredient_id and i.is_curated
      join public.ingredient_allergens ia on ia.ingredient_id = i.id
     where mi.meal_id = p_meal_id
    union
    select unnest(coalesce(p_declared, '{}')), 'declared'::public.allergen_source
  ),
  expanded as (
    select code, src from base
    union
    select ai.implies, b.src from base b join public.allergen_implications ai on ai.code = b.code
  ),
  -- Une seule ligne par code : priorité ingredient > dictionary > declared (pour l'affichage de la provenance).
  ranked as (
    select distinct on (code) code, src from expanded
    order by code, case src when 'ingredient' then 1 when 'dictionary' then 2 else 3 end
  )
  insert into public.meal_allergens (meal_id, allergen_code, kind, source)
  select p_meal_id, code, 'contains', src from ranked;

  insert into public.meal_allergens (meal_id, allergen_code, kind, source)
  select p_meal_id, t.code, 'may_contain', 'declared'
    from (select unnest(coalesce(p_may_contain, '{}')) as code) t
   where not exists (select 1 from public.meal_allergens ma where ma.meal_id = p_meal_id and ma.allergen_code = t.code)
  on conflict do nothing;
end $$;

-- ─────────────────────────────────────────────── Sérialisation JSON (contrat = types TypeScript de l'app)
create or replace function public.profile_to_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'displayName', p.display_name,
    'avatarUrl', p.avatar_url,
    'neighborhood', p.neighborhood,
    'bio', p.bio,
    'cookerRating', p.cooker_rating_avg,
    'cookerRatingCount', p.cooker_rating_count,
    'eaterRating', p.eater_rating_avg,
    'eaterRatingCount', p.eater_rating_count,
    'badges', to_jsonb(array_remove(array[
        case when p.cooker_rating_avg >= 4.8 and p.cooker_rating_count >= 20 then 'Top Cooker' end,
        case when p.hygiene_certified_at is not null then 'Hygiène certifiée' end,
        case when p.meals_shared_count >= 25 then 'Zéro gaspi' end
      ], null)),
    'isVerified', p.cooker_verified_at is not null,
    'memberSince', p.created_at
  )
  from public.profiles p where p.id = p_id
$$;

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
    'pickupLocation', jsonb_build_object(
      'latitude', extensions.st_y(m.pickup_point_public::extensions.geometry),
      'longitude', extensions.st_x(m.pickup_point_public::extensions.geometry)),
    'pickupArea', m.pickup_area,
    'distanceKm', case when p_dist_m is null then null else round((p_dist_m / 1000.0)::numeric, 2) end,
    'status', m.status,
    'aiAssisted', m.ai_analysis_id is not null
  )
  from public.meals m where m.id = p_meal_id
$$;

-- ─────────────────────────────────────────────── Fil d'actualité géolocalisé + filtré santé
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
           extensions.st_distance(m.pickup_point_public, v_origin) as dist_m,
           -- Moyenne bayésienne : évite qu'un 5★ sur 1 avis passe devant un 4,9★ sur 200 avis.
           (coalesce(p.cooker_rating_avg, 0) * p.cooker_rating_count + 4.5 * 5) / (p.cooker_rating_count + 5) as score
      from public.meals m
      join public.profiles p on p.id = m.cooker_id and p.deleted_at is null
     where m.status = 'published'
       and m.available_until > now()
       and m.portions_left > 0
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
       case when p_sort = 'rating' then s.score end desc nulls last,
       case when p_sort = 'newest' then s.created_at end desc nulls last,
       case when p_sort = 'price'  then s.price_cents end asc nulls first,
       s.dist_m asc
     limit least(p_limit, 100)
  )
  select jsonb_build_object(
    'meals', coalesce((select jsonb_agg(public.meal_to_json(pg.id, pg.dist_m) order by
                         case when p_sort = 'rating' then pg.score end desc nulls last,
                         case when p_sort = 'newest' then pg.created_at end desc nulls last,
                         case when p_sort = 'price'  then pg.price_cents end asc nulls first,
                         pg.dist_m asc) from page pg), '[]'::jsonb),
    'hidden_for_health', (select count(*) from candidates) - (select count(*) from safe)
  ) into v_result;

  return v_result;
end $$;

create or replace function public.get_meal(p_meal_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.meal_to_json(m.id)
    from public.meals m
   where m.id = p_meal_id
     and (m.status in ('published', 'reserved', 'sold_out') or m.cooker_id = auth.uid())
$$;

-- ─────────────────────────────────────────────── Profil santé
create or replace function public.get_health_profile() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'allergens', coalesce((select jsonb_agg(jsonb_build_object('code', ua.allergen_code, 'severity', ua.severity))
                            from public.user_allergens ua where ua.user_id = auth.uid()), '[]'::jsonb),
    'diets', coalesce((select jsonb_agg(ud.diet_code) from public.user_diets ud where ud.user_id = auth.uid()), '[]'::jsonb),
    'strictTraces', coalesce((select s.strict_traces from public.user_settings s where s.user_id = auth.uid()), false)
  )
$$;

create or replace function public.set_health_profile(p_allergens jsonb, p_diets text[], p_strict_traces boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  delete from public.user_allergens where user_id = v_uid;
  insert into public.user_allergens (user_id, allergen_code, severity)
  select v_uid, a ->> 'code', coalesce((a ->> 'severity')::public.allergen_severity, 'allergy')
    from jsonb_array_elements(coalesce(p_allergens, '[]'::jsonb)) a
  on conflict do nothing;

  delete from public.user_diets where user_id = v_uid;
  insert into public.user_diets (user_id, diet_code) select v_uid, unnest(coalesce(p_diets, '{}')) on conflict do nothing;

  update public.user_settings set strict_traces = coalesce(p_strict_traces, false) where user_id = v_uid;
  update public.user_private set health_consent_at = coalesce(health_consent_at, now()) where user_id = v_uid;
end $$;

-- ─────────────────────────────────────────────── Publication (validation humaine obligatoire)
create or replace function public.publish_meal(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid         uuid := auth.uid();
  v_meal_id     uuid;
  v_mode        public.meal_mode := (p_payload ->> 'mode')::public.meal_mode;
  v_price       integer := nullif(p_payload ->> 'priceCents', '')::integer;
  v_portions    smallint := (p_payload ->> 'portions')::smallint;
  v_hours       integer := least(greatest(coalesce((p_payload ->> 'availableHours')::integer, 24), 2), 72);
  v_lat         double precision := (p_payload -> 'pickup' ->> 'latitude')::double precision;
  v_lng         double precision := (p_payload -> 'pickup' ->> 'longitude')::double precision;
  v_point       extensions.geography;
  v_declared    text[];
  v_may_contain text[];
  v_diets       text[];
  v_analysis    uuid := nullif(p_payload ->> 'aiAnalysisId', '')::uuid;
  v_ing         jsonb;
  v_ing_id      uuid;
  v_mi_id       uuid;
  v_pos         smallint := 0;
  v_conflict    text;
  v_path        text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if coalesce((p_payload ->> 'cookerAttestation')::boolean, false) is not true then
    raise exception 'ATTESTATION_REQUIRED: le Cooker doit valider ingrédients et allergènes';
  end if;
  if jsonb_array_length(coalesce(p_payload -> 'ingredients', '[]'::jsonb)) = 0 then
    raise exception 'INGREDIENTS_REQUIRED';
  end if;
  if v_mode in ('sale', 'both') and not exists (
    select 1 from public.user_private up where up.user_id = v_uid and up.stripe_charges_enabled
  ) then
    raise exception 'STRIPE_ONBOARDING_REQUIRED: activez les paiements (Stripe) pour vendre';
  end if;
  if v_analysis is not null and not exists (select 1 from public.ai_analyses a where a.id = v_analysis and a.user_id = v_uid) then
    v_analysis := null;
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_declared    from jsonb_array_elements_text(coalesce(p_payload -> 'declaredAllergens', '[]')) x;
  select coalesce(array_agg(distinct x), '{}') into v_may_contain from jsonb_array_elements_text(coalesce(p_payload -> 'mayContain', '[]')) x;
  select coalesce(array_agg(distinct x), '{}') into v_diets       from jsonb_array_elements_text(coalesce(p_payload -> 'diets', '[]')) x;

  v_point := extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;

  insert into public.meals (
    cooker_id, title, description, cuisine_code, mode, price_cents, portions_total, portions_left,
    available_until, pickup_point, pickup_point_public, pickup_area, status, ai_analysis_id
  ) values (
    v_uid, trim(p_payload ->> 'title'), coalesce(trim(p_payload ->> 'description'), ''), p_payload ->> 'cuisine',
    v_mode, case when v_mode = 'swap' then null else v_price end, v_portions, v_portions,
    now() + make_interval(hours => v_hours), v_point,
    -- Brouillage de 100 à 300 m dans une direction aléatoire : protège l'adresse du Cooker.
    extensions.st_project(v_point, 100 + random() * 200, random() * 2 * pi()),
    left(coalesce(nullif(trim(p_payload ->> 'pickupArea'), ''), 'Quartier communiqué après confirmation'), 120),
    'draft', v_analysis
  ) returning id into v_meal_id;

  -- Ingrédients + allergènes par ingrédient ; rattachement au dictionnaire via alias/nom canonique.
  for v_ing in select * from jsonb_array_elements(p_payload -> 'ingredients') loop
    select coalesce(
      (select ia.ingredient_id from public.ingredient_aliases ia where ia.alias = public.normalize_name(v_ing ->> 'name')),
      (select i.id from public.ingredients i where i.canonical_name = public.normalize_name(v_ing ->> 'name'))
    ) into v_ing_id;

    insert into public.meal_ingredients (meal_id, ingredient_id, raw_name, position, source)
    values (v_meal_id, v_ing_id, left(trim(v_ing ->> 'name'), 60), v_pos, coalesce((v_ing ->> 'source')::public.ingredient_source, 'cooker'))
    returning id into v_mi_id;

    insert into public.meal_ingredient_allergens (meal_ingredient_id, allergen_code)
    select v_mi_id, a from jsonb_array_elements_text(coalesce(v_ing -> 'allergens', '[]')) a
    on conflict do nothing;

    v_pos := v_pos + 1;
  end loop;

  perform public.recompute_meal_allergens(v_meal_id, v_declared, v_may_contain);

  -- Cohérence régimes ↔ allergènes (ex. « végane » + lait interdit).
  select string_agg(dfa.diet_code || '/' || dfa.allergen_code, ', ') into v_conflict
    from public.diet_forbidden_allergens dfa
    join public.meal_allergens ma on ma.meal_id = v_meal_id and ma.kind = 'contains' and ma.allergen_code = dfa.allergen_code
   where dfa.diet_code = any (v_diets);
  if v_conflict is not null then
    raise exception 'DIET_CONFLICT: %', v_conflict;
  end if;
  insert into public.meal_diets (meal_id, diet_code) select v_meal_id, unnest(v_diets) on conflict do nothing;

  -- Photos : uniquement celles du dossier de l'utilisateur.
  v_pos := 0;
  for v_path in select * from jsonb_array_elements_text(coalesce(p_payload -> 'photoPaths', '[]')) loop
    if split_part(v_path, '/', 1) = v_uid::text then
      insert into public.meal_photos (meal_id, storage_path, position) values (v_meal_id, v_path, v_pos);
      v_pos := v_pos + 1;
    end if;
  end loop;

  -- Publication : l'attestation horodatée satisfait la contrainte meals_published_requires_confirmation.
  update public.meals
     set status = 'published', allergens_confirmed_at = now(), allergens_confirmed_by = v_uid
   where id = v_meal_id;

  update public.profiles set is_cooker = true where id = v_uid and not is_cooker;

  -- Boucle d'amélioration IA : écart entre suggestion et validation humaine.
  if v_analysis is not null then
    update public.ai_analyses a
       set validation_diff = (
         with ai as (select jsonb_array_elements(coalesce(a.result -> 'allergens', '[]')) ->> 'code' as code),
              fin as (select ma.allergen_code as code from public.meal_allergens ma where ma.meal_id = v_meal_id and ma.kind = 'contains')
         select jsonb_build_object(
           'meal_id', v_meal_id,
           'ai', coalesce((select jsonb_agg(distinct code) from ai), '[]'::jsonb),
           'final', coalesce((select jsonb_agg(code) from fin), '[]'::jsonb),
           'false_positives', coalesce((select jsonb_agg(distinct code) from ai where code not in (select code from fin)), '[]'::jsonb),
           'false_negatives', coalesce((select jsonb_agg(code) from fin where code not in (select code from ai)), '[]'::jsonb)
         ))
     where a.id = v_analysis;
  end if;

  return v_meal_id;
end $$;

-- Synchronise le statut avec le stock de portions.
create or replace function public.meals_sync_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.portions_left = 0 and new.status = 'published' then
    new.status := 'sold_out';
  elsif new.portions_left > 0 and new.status = 'sold_out' and new.available_until > now() then
    new.status := 'published';
  end if;
  return new;
end $$;
create trigger meals_stock before update of portions_left on public.meals for each row execute function public.meals_sync_stock();

-- Adresse exacte : révélée seulement aux participants d'une commande acceptée.
create or replace function public.get_pickup_details(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'latitude', extensions.st_y(m.pickup_point::extensions.geometry),
    'longitude', extensions.st_x(m.pickup_point::extensions.geometry),
    'area', m.pickup_area)
  from public.orders o join public.meals m on m.id = o.meal_id
  where o.id = p_order_id
    and auth.uid() in (o.eater_id, o.cooker_id)
    and o.status in ('accepted', 'ready', 'picked_up')
$$;

-- ─────────────────────────────────────────────── Commandes
create or replace function public.open_conversation(p_order_id uuid, p_meal_id uuid, p_a uuid, p_b uuid, p_first_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_conv uuid;
begin
  insert into public.conversations (order_id, meal_id) values (p_order_id, p_meal_id) returning id into v_conv;
  insert into public.conversation_participants (conversation_id, user_id) values (v_conv, p_a), (v_conv, p_b);
  insert into public.messages (conversation_id, sender_id, kind, body) values (v_conv, null, 'system', p_first_message);
  return v_conv;
end $$;

-- Achat : appelée UNIQUEMENT par l'Edge Function `create-payment-intent` (service role).
-- Réserve les portions de façon atomique (verrou de ligne) avant la création du PaymentIntent.
create or replace function public.create_purchase_order(
  p_meal_id uuid, p_eater_id uuid, p_quantity integer, p_service_fee_rate numeric, p_platform_fee_rate numeric
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.meals%rowtype;
  v_order uuid;
  v_conv uuid;
  v_subtotal integer;
  v_service integer;
  v_platform integer;
begin
  select * into m from public.meals where id = p_meal_id for update;
  if not found or m.status <> 'published' or m.available_until <= now() then raise exception 'MEAL_UNAVAILABLE'; end if;
  if m.mode = 'swap' then raise exception 'MEAL_NOT_FOR_SALE'; end if;
  if m.cooker_id = p_eater_id then raise exception 'CANNOT_BUY_OWN_MEAL'; end if;
  if p_quantity < 1 or p_quantity > m.portions_left then raise exception 'NOT_ENOUGH_PORTIONS'; end if;
  if not public.meal_is_safe_for(p_meal_id, p_eater_id) then raise exception 'HEALTH_PROFILE_CONFLICT'; end if;

  v_subtotal := m.price_cents * p_quantity;
  v_service  := round(v_subtotal * p_service_fee_rate);
  v_platform := round(v_subtotal * p_platform_fee_rate);

  insert into public.orders (kind, meal_id, cooker_id, eater_id, quantity, unit_price_cents, subtotal_cents,
                             service_fee_cents, platform_fee_cents, total_cents, status)
  values ('purchase', m.id, m.cooker_id, p_eater_id, p_quantity, m.price_cents, v_subtotal, v_service, v_platform,
          v_subtotal + v_service, 'requested')
  returning id into v_order;

  update public.meals set portions_left = portions_left - p_quantity where id = m.id;

  v_conv := public.open_conversation(v_order, m.id, p_eater_id, m.cooker_id,
    format('Commande de %s portion(s) · en attente de pré-autorisation du paiement', p_quantity));

  return jsonb_build_object(
    'order_id', v_order,
    'conversation_id', v_conv,
    'cooker_id', m.cooker_id,
    'total_cents', v_subtotal + v_service,
    'application_fee_cents', v_service + v_platform,
    'currency', m.currency);
end $$;

-- Échange : proposition par l'Eater, sécurité santé vérifiée DANS LES DEUX SENS.
create or replace function public.propose_swap(p_meal_id uuid, p_offered_meal_id uuid, p_message text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  target public.meals%rowtype;
  offered public.meals%rowtype;
  v_order uuid;
  v_conv uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select * into target  from public.meals where id = p_meal_id;
  select * into offered from public.meals where id = p_offered_meal_id;

  if target.id is null or target.status <> 'published' or target.mode = 'sale' then raise exception 'MEAL_NOT_SWAPPABLE'; end if;
  if offered.id is null or offered.cooker_id <> v_uid or offered.status <> 'published' or offered.mode = 'sale' then
    raise exception 'OFFERED_MEAL_INVALID';
  end if;
  if target.cooker_id = v_uid then raise exception 'CANNOT_SWAP_WITH_SELF'; end if;
  if not public.meal_is_safe_for(target.id, v_uid) then raise exception 'HEALTH_PROFILE_CONFLICT'; end if;
  if not public.meal_is_safe_for(offered.id, target.cooker_id) then raise exception 'OFFER_CONFLICTS_WITH_COOKER_HEALTH_PROFILE'; end if;

  insert into public.orders (kind, meal_id, cooker_id, eater_id, offered_meal_id, swap_message, status)
  values ('swap', target.id, target.cooker_id, v_uid, offered.id, left(p_message, 300), 'requested')
  returning id into v_order;

  v_conv := public.open_conversation(v_order, target.id, v_uid, target.cooker_id,
    format('Proposition d''échange : « %s » contre « %s »', offered.title, target.title));
  if nullif(trim(p_message), '') is not null then
    insert into public.messages (conversation_id, sender_id, body) values (v_conv, v_uid, left(trim(p_message), 300));
  end if;

  return jsonb_build_object('order_id', v_order, 'conversation_id', v_conv);
end $$;

-- Machine d'états. Appelée avec le JWT de l'utilisateur (via l'Edge Function `order-action`).
--   achat  : requested →(webhook) paid → accepted → ready → picked_up →(webhook capture) completed
--   échange: requested → accepted → ready → picked_up(=completed)
--   annulations : requested/paid → cancelled (Eater) · paid → declined (Cooker) · accepted → cancelled (les deux)
create or replace function public.transition_order(p_order_id uuid, p_to public.order_status, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  o public.orders%rowtype;
  v_role text;
  v_to public.order_status := p_to;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_role := case when v_uid = o.cooker_id then 'cooker' when v_uid = o.eater_id then 'eater' end;
  if v_role is null then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  v_allowed := case
    when o.kind = 'purchase' then (o.status, v_to, v_role) in (
      ('requested', 'cancelled', 'eater'),
      ('paid', 'accepted', 'cooker'), ('paid', 'declined', 'cooker'), ('paid', 'cancelled', 'eater'),
      ('accepted', 'ready', 'cooker'), ('accepted', 'cancelled', 'eater'), ('accepted', 'cancelled', 'cooker'),
      ('ready', 'picked_up', 'eater'))
    else (o.status, v_to, v_role) in (
      ('requested', 'accepted', 'cooker'), ('requested', 'declined', 'cooker'), ('requested', 'cancelled', 'eater'),
      ('accepted', 'ready', 'cooker'), ('accepted', 'cancelled', 'eater'), ('accepted', 'cancelled', 'cooker'),
      ('accepted', 'picked_up', 'eater'), ('ready', 'picked_up', 'eater'))
  end;
  if not v_allowed then raise exception 'INVALID_TRANSITION: % → % (%)', o.status, v_to, v_role; end if;

  -- Un échange n'a pas de capture de paiement : la cueillette le complète.
  if o.kind = 'swap' and v_to = 'picked_up' then v_to := 'completed'; end if;

  update public.orders
     set status = v_to,
         cancel_reason = case when v_to in ('cancelled', 'declined') then left(p_reason, 300) else cancel_reason end,
         completed_at = case when v_to = 'completed' then now() else completed_at end
   where id = o.id;

  return jsonb_build_object('id', o.id, 'kind', o.kind, 'from', o.status, 'to', v_to,
                            'stripe_payment_intent_id', o.stripe_payment_intent_id, 'total_cents', o.total_cents);
end $$;

-- Transitions « système » déclenchées par Stripe (service role uniquement).
create or replace function public.apply_payment_event(p_payment_intent_id text, p_to public.order_status, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where stripe_payment_intent_id = p_payment_intent_id for update;
  if not found then return; end if;
  -- Idempotent et monotone : on ignore les événements qui feraient reculer l'état.
  if (o.status, p_to) in (('requested', 'paid'), ('picked_up', 'completed'), ('ready', 'completed'))
     or (p_to = 'cancelled' and o.status in ('requested', 'paid', 'accepted'))
     or (p_to = 'disputed' and o.status not in ('cancelled', 'declined')) then
    update public.orders
       set status = p_to,
           completed_at = case when p_to = 'completed' then now() else completed_at end,
           cancel_reason = coalesce(p_note, cancel_reason)
     where id = o.id;
  end if;
end $$;

-- Effets de bord de chaque changement d'état : audit, stock, messages système, compteurs.
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

  -- Stock : échange réservé à l'acceptation ; achat réservé dès la création (voir create_purchase_order).
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
    when 'paid'      then 'Paiement pré-autorisé ✅ En attente de confirmation du Cooker.'
    when 'accepted'  then 'Commande acceptée 🎉 L''adresse exacte de cueillette est maintenant visible.'
    when 'declined'  then 'Commande refusée par le Cooker. Aucun montant ne sera débité.'
    when 'ready'     then 'Le plat est prêt à être récupéré 🍽️'
    when 'picked_up' then 'Cueillette confirmée. Merci ! Pensez à laisser un avis.'
    when 'completed' then 'Transaction terminée. Laissez un avis pour aider la communauté ⭐'
    when 'cancelled' then 'Commande annulée.'
    when 'disputed'  then 'Un litige a été ouvert. L''équipe Homemade vous contactera.'
  end;
  select c.id into v_conv from public.conversations c where c.order_id = new.id;
  if v_conv is not null and v_msg is not null then
    insert into public.messages (conversation_id, sender_id, kind, body) values (v_conv, null, 'system', v_msg);
  end if;
  return new;
end $$;
create trigger orders_status_change after update of status on public.orders for each row execute function public.orders_on_status_change();

-- ─────────────────────────────────────────────── Réputation bidirectionnelle (double-aveugle)
create or replace function public.refresh_profile_ratings(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  update public.profiles p set
    cooker_rating_avg   = (select round(avg(r.rating)::numeric, 2) from public.reviews r where r.subject_id = p_user and r.role = 'cooker' and r.visible_at <= now()),
    cooker_rating_count = (select count(*) from public.reviews r where r.subject_id = p_user and r.role = 'cooker' and r.visible_at <= now()),
    eater_rating_avg    = (select round(avg(r.rating)::numeric, 2) from public.reviews r where r.subject_id = p_user and r.role = 'eater' and r.visible_at <= now()),
    eater_rating_count  = (select count(*) from public.reviews r where r.subject_id = p_user and r.role = 'eater' and r.visible_at <= now())
  where p.id = p_user
$$;

create or replace function public.submit_review(
  p_order_id uuid, p_rating smallint, p_comment text default null, p_tags text[] default '{}', p_sub_scores jsonb default '{}'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  o public.orders%rowtype;
  v_subject uuid;
  v_role public.review_role;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select * into o from public.orders where id = p_order_id;
  if not found or o.status not in ('picked_up', 'completed') then raise exception 'ORDER_NOT_REVIEWABLE'; end if;
  if o.completed_at is not null and o.completed_at < now() - interval '14 days' then raise exception 'REVIEW_WINDOW_CLOSED'; end if;

  if v_uid = o.eater_id then v_subject := o.cooker_id; v_role := 'cooker';
  elsif v_uid = o.cooker_id then v_subject := o.eater_id; v_role := 'eater';
  else raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.reviews (order_id, author_id, subject_id, role, rating, comment, tags, sub_scores)
  values (o.id, v_uid, v_subject, v_role, p_rating, left(p_comment, 600), coalesce(p_tags[1:8], '{}'), coalesce(p_sub_scores, '{}'));

  -- Les deux avis sont là : on les révèle simultanément.
  if (select count(*) from public.reviews where order_id = o.id) = 2 then
    update public.reviews set visible_at = now() where order_id = o.id and visible_at is null;
    perform public.refresh_profile_ratings(o.cooker_id);
    perform public.refresh_profile_ratings(o.eater_id);
  end if;
end $$;

-- Tâche planifiée : révèle les avis restés seuls après 7 jours.
create or replace function public.reveal_stale_reviews() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in update public.reviews set visible_at = now()
            where visible_at is null and created_at < now() - interval '7 days'
        returning subject_id loop
    perform public.refresh_profile_ratings(r.subject_id);
  end loop;
end $$;

create or replace function public.get_reviews_for_user(p_user_id uuid, p_role public.review_role, p_limit integer default 20) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) from (
    select r.created_at, jsonb_build_object(
      'id', r.id, 'author', public.profile_to_json(r.author_id), 'rating', r.rating,
      'comment', coalesce(r.comment, ''), 'tags', to_jsonb(r.tags), 'createdAt', r.created_at) as j
    from public.reviews r
    where r.subject_id = p_user_id and r.role = p_role and r.visible_at <= now()
    order by r.created_at desc
    limit least(p_limit, 50)
  ) x
$$;

-- ─────────────────────────────────────────────── Messagerie
create or replace function public.my_conversations() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.last_at desc), '[]'::jsonb) from (
    select lm.created_at as last_at, jsonb_build_object(
      'id', c.id,
      'orderId', c.order_id,
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
    left join public.meals m on m.id = c.meal_id
    left join lateral (select body, created_at from public.messages where conversation_id = c.id order by created_at desc limit 1) lm on true
    where me.user_id = auth.uid()
  ) x
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_participants set last_read_at = now()
   where conversation_id = p_conversation_id and user_id = auth.uid()
$$;

create or replace function public.is_participant(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_participants cp where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid())
$$;

-- ─────────────────────────────────────────────── Tâches planifiées
create or replace function public.expire_meals() returns void
language sql security definer set search_path = '' as $$
  update public.meals set status = 'expired'
   where status in ('published', 'sold_out') and available_until <= now()
$$;

-- ─────────────────────────────────────────────── Signalement : un incident allergène suspend le plat immédiatement
create or replace function public.reports_on_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.reason in ('allergen_incident', 'hygiene') and new.meal_id is not null then
    update public.meals set status = 'suspended' where id = new.meal_id and status in ('published', 'sold_out', 'reserved');
  end if;
  return new;
end $$;
create trigger reports_after_insert after insert on public.reports for each row execute function public.reports_on_insert();

-- Commandes jamais finalisées : libère les portions réservées.
create or replace function public.cancel_stale_orders() returns void
language sql security definer set search_path = '' as $$
  update public.orders set status = 'cancelled', cancel_reason = 'Paiement non finalisé (expiration)'
   where status = 'requested' and kind = 'purchase' and created_at < now() - interval '30 minutes';
  update public.orders set status = 'cancelled', cancel_reason = 'Proposition d''échange expirée'
   where status = 'requested' and kind = 'swap' and created_at < now() - interval '24 hours';
$$;
