-- ════════════════════════════════════════════════════════════════════════════
-- Homemade — Sécurité : RLS, privilèges, stockage, temps réel, tâches planifiées
-- Défense en profondeur : RLS partout + privilèges par colonne + écritures critiques via RPC uniquement.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────── RLS activée sur TOUTES les tables
do $$
declare t text;
begin
  foreach t in array array[
    'allergens','allergen_implications','diets','diet_forbidden_allergens','cuisines',
    'ingredients','ingredient_aliases','ingredient_allergens',
    'profiles','user_private','user_settings','user_allergens','user_diets',
    'ai_analyses','meals','meal_photos','meal_ingredients','meal_ingredient_allergens','meal_allergens','meal_diets',
    'orders','order_events','conversations','conversation_participants','messages','reviews','reports','stripe_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- Écritures directes interdites par défaut ; on ré-accorde au cas par cas plus bas.
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────── Référentiels : lecture publique
create policy "ref read" on public.allergens                for select to anon, authenticated using (true);
create policy "ref read" on public.allergen_implications    for select to anon, authenticated using (true);
create policy "ref read" on public.diets                    for select to anon, authenticated using (true);
create policy "ref read" on public.diet_forbidden_allergens for select to anon, authenticated using (true);
create policy "ref read" on public.cuisines                 for select to anon, authenticated using (true);
create policy "dict read" on public.ingredients             for select to authenticated using (true);
create policy "dict read" on public.ingredient_aliases      for select to authenticated using (true);
create policy "dict read" on public.ingredient_allergens    for select to authenticated using (true);

-- ─────────────────────────────────────────────── Utilisateurs
create policy "profiles read" on public.profiles for select to authenticated using (deleted_at is null or id = auth.uid());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Seuls les champs cosmétiques sont modifiables par l'utilisateur (notes, badges, vérifications : jamais).
grant update (display_name, avatar_url, bio, neighborhood, locale) on public.profiles to authenticated;

create policy "private read own" on public.user_private for select to authenticated using (user_id = auth.uid());

create policy "settings read own" on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy "settings update own" on public.user_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant update (default_radius_m, notify_new_nearby, notify_messages) on public.user_settings to authenticated;

-- Profil santé : lecture propriétaire uniquement ; écriture via set_health_profile() (consentement horodaté).
create policy "allergens read own" on public.user_allergens for select to authenticated using (user_id = auth.uid());
create policy "diets read own"     on public.user_diets     for select to authenticated using (user_id = auth.uid());

create policy "ai read own" on public.ai_analyses for select to authenticated using (user_id = auth.uid());

-- ─────────────────────────────────────────────── Repas
create policy "meals read visible" on public.meals for select to authenticated
  using (status in ('published', 'reserved', 'sold_out') or cooker_id = auth.uid());
-- Le point EXACT de cueillette n'est jamais lisible directement (voir get_pickup_details()).
revoke select on public.meals from anon, authenticated;
grant select (id, cooker_id, title, description, cuisine_code, mode, price_cents, currency, portions_total, portions_left,
              prepared_at, available_until, pickup_point_public, pickup_area, status, ai_analysis_id,
              allergens_confirmed_at, created_at, updated_at)
  on public.meals to authenticated;

create policy "meal children read" on public.meal_photos for select to authenticated
  using (exists (select 1 from public.meals m where m.id = meal_id and (m.status in ('published','reserved','sold_out') or m.cooker_id = auth.uid())));
create policy "meal children read" on public.meal_ingredients for select to authenticated
  using (exists (select 1 from public.meals m where m.id = meal_id and (m.status in ('published','reserved','sold_out') or m.cooker_id = auth.uid())));
create policy "meal children read" on public.meal_ingredient_allergens for select to authenticated
  using (exists (select 1 from public.meal_ingredients mi join public.meals m on m.id = mi.meal_id
                 where mi.id = meal_ingredient_id and (m.status in ('published','reserved','sold_out') or m.cooker_id = auth.uid())));
create policy "meal children read" on public.meal_allergens for select to authenticated
  using (exists (select 1 from public.meals m where m.id = meal_id and (m.status in ('published','reserved','sold_out') or m.cooker_id = auth.uid())));
create policy "meal children read" on public.meal_diets for select to authenticated
  using (exists (select 1 from public.meals m where m.id = meal_id and (m.status in ('published','reserved','sold_out') or m.cooker_id = auth.uid())));

-- ─────────────────────────────────────────────── Transactions
create policy "orders read party" on public.orders for select to authenticated using (auth.uid() in (eater_id, cooker_id));
create policy "order events read party" on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and auth.uid() in (o.eater_id, o.cooker_id)));

-- ─────────────────────────────────────────────── Messagerie
create policy "conv read participant" on public.conversations for select to authenticated using (public.is_participant(id));
create policy "participants read" on public.conversation_participants for select to authenticated using (public.is_participant(conversation_id));
create policy "messages read participant" on public.messages for select to authenticated using (public.is_participant(conversation_id));
create policy "messages send participant" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and kind = 'text' and public.is_participant(conversation_id));
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

-- ─────────────────────────────────────────────── Avis & signalements
create policy "reviews read visible" on public.reviews for select to authenticated
  using (visible_at <= now() or author_id = auth.uid());

create policy "reports create own" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "reports read own"   on public.reports for select to authenticated using (reporter_id = auth.uid());
grant insert (reporter_id, meal_id, order_id, subject_id, reason, details) on public.reports to authenticated;

-- ─────────────────────────────────────────────── Fonctions : exécution explicitement contrôlée
-- Supabase accorde EXECUTE par défaut à anon/authenticated : on retire tout, puis on ré-accorde.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.feed_meals(double precision, double precision, integer, text[], text[], integer, text, text, integer),
  public.get_meal(uuid),
  public.get_health_profile(),
  public.set_health_profile(jsonb, text[], boolean),
  public.publish_meal(jsonb),
  public.propose_swap(uuid, uuid, text),
  public.transition_order(uuid, public.order_status, text),
  public.submit_review(uuid, smallint, text, text[], jsonb),
  public.get_reviews_for_user(uuid, public.review_role, integer),
  public.my_conversations(),
  public.mark_conversation_read(uuid),
  public.get_pickup_details(uuid),
  public.is_participant(uuid)          -- utilisée par les policies RLS
to authenticated;

-- Réservées au service role (Edge Functions, webhooks, cron).
grant execute on function
  public.create_purchase_order(uuid, uuid, integer, numeric, numeric),
  public.apply_payment_event(text, public.order_status, text),
  public.meal_is_safe_for(uuid, uuid),   -- ne JAMAIS exposer : permettrait de sonder le profil santé d'autrui
  public.expire_meals(),
  public.reveal_stale_reviews(),
  public.cancel_stale_orders()
to service_role;

-- ─────────────────────────────────────────────── Stockage (photos de plats, avatars)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('meal-photos', 'meal-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars',     'avatars',     true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Chaque utilisateur n'écrit que dans son dossier `<uid>/...`.
create policy "photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('meal-photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos delete own folder" on storage.objects for delete to authenticated
  using (bucket_id in ('meal-photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);

-- ─────────────────────────────────────────────── Temps réel (chat + suivi de commande)
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.orders;

-- ─────────────────────────────────────────────── Tâches planifiées (pg_cron)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('homemade-expire-meals', '*/10 * * * *', 'select public.expire_meals()');
    perform cron.schedule('homemade-reveal-reviews', '15 * * * *', 'select public.reveal_stale_reviews()');
    perform cron.schedule('homemade-cancel-stale-orders', '*/5 * * * *', 'select public.cancel_stale_orders()');
  end if;
end $$;
