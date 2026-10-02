-- Ce que contient une portion : le prix est « par portion », et une portion peut être 1 assiette, 200 ml, 10 pièces…
-- Référentiel synchronisé avec src/data/portions.ts.
alter table public.meals
  add column if not exists portion_qty  numeric(8, 2) not null default 1 check (portion_qty > 0 and portion_qty <= 10000),
  add column if not exists portion_unit text not null default 'plate'
    check (portion_unit in ('plate', 'bowl', 'box', 'item', 'slice', 'jar', 'ml', 'l', 'g', 'kg'));

-- Représentation JSON d'un plat : + portionQty / portionUnit.
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
    'portionQty', m.portion_qty,
    'portionUnit', m.portion_unit,
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
    'pending', m.portions_left = 0 and public.meal_has_active_order(m.id),
    'isPrivate', m.is_private,
    'aiAssisted', m.ai_analysis_id is not null
  )
  from public.meals m where m.id = p_meal_id
$$;

-- Publication complète en UNE transaction : le plat (mêmes règles que publish_meal), ce que contient une portion et
-- l'origine de la photo. Une valeur invalide annule toute la publication.
create or replace function public.publish_meal_with_details(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id   uuid;
  -- Arrondi à 2 décimales comme la colonne : 0,001 kg est refusé proprement (INVALID_PORTION), pas par la contrainte.
  v_qty  numeric := round(coalesce(nullif(p_payload ->> 'portionQty', '')::numeric, 1), 2);
  v_unit text := coalesce(nullif(p_payload ->> 'portionUnit', ''), 'plate');
begin
  if v_qty <= 0 or v_qty > 10000 or v_unit not in ('plate', 'bowl', 'box', 'item', 'slice', 'jar', 'ml', 'l', 'g', 'kg') then
    raise exception 'INVALID_PORTION';
  end if;
  v_id := public.publish_meal(p_payload);
  update public.meals set portion_qty = v_qty, portion_unit = v_unit where id = v_id;
  if coalesce(p_payload ->> 'photoSource', '') <> '' then
    perform public.set_meal_photo_meta(v_id, nullif(p_payload ->> 'photoTakenAt', '')::timestamptz, p_payload ->> 'photoSource');
  end if;
  return v_id;
end $$;

revoke execute on function public.publish_meal_with_details(jsonb) from public, anon, authenticated;
grant execute on function public.publish_meal_with_details(jsonb) to authenticated;
