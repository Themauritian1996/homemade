-- Accueil : mes échanges et commandes en cours (Cooker comme Eater), avec ce qui attend MA réponse en premier.
create or replace function public.my_active_exchanges() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.needs_me desc, x.updated_at desc), '[]'::jsonb)
  from (
    select o.updated_at,
           y.needs_me,
           jsonb_build_object(
             'orderId', o.id,
             'kind', o.kind,
             'status', o.status,
             'role', case when o.cooker_id = auth.uid() then 'cooker' else 'eater' end,
             'needsMe', y.needs_me,
             'conversationId', (select c.id from public.conversations c where c.order_id = o.id),
             'mealId', m.id,
             'mealTitle', m.title,
             'mealPhoto', (select ph.storage_path from public.meal_photos ph where ph.meal_id = m.id order by ph.position limit 1),
             'other', public.profile_to_json(case when o.cooker_id = auth.uid() then o.eater_id else o.cooker_id end)
           ) as j
      from public.orders o
      join public.meals m on m.id = o.meal_id
      cross join lateral (
        select (o.cooker_id = auth.uid() and ((o.kind = 'swap' and o.status = 'requested') or (o.kind = 'purchase' and o.status = 'paid')))
            or (o.eater_id = auth.uid() and (o.status = 'ready' or (o.kind = 'swap' and o.status = 'accepted'))) as needs_me
      ) y
     where auth.uid() in (o.cooker_id, o.eater_id)
       and o.status in ('requested', 'paid', 'accepted', 'ready')
     order by y.needs_me desc, o.updated_at desc
     limit 20
  ) x
$$;

revoke execute on function public.my_active_exchanges() from public, anon, authenticated;
grant execute on function public.my_active_exchanges() to authenticated;
