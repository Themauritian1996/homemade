-- Données de référence Homemade. Doit rester synchronisé avec src/data/allergens.ts.
-- Exécuté par `supabase db reset` (local) ; à appliquer une fois en production.

-- Allergènes prioritaires de Santé Canada (+ gluten distinct du blé).
-- Les codes EU (céleri, lupin) sont prêts pour l'expansion européenne (14 allergènes du règlement INCO).
insert into public.allergens (code, name_fr, name_en, emoji, regions, sort_order) values
  ('peanut',     'Arachides',   'Peanuts',     '🥜', '{CA,US,EU}', 1),
  ('tree_nut',   'Noix',        'Tree nuts',   '🌰', '{CA,US,EU}', 2),
  ('sesame',     'Sésame',      'Sesame',      '⚪', '{CA,US,EU}', 3),
  ('milk',       'Lait',        'Milk',        '🥛', '{CA,US,EU}', 4),
  ('egg',        'Œufs',        'Eggs',        '🥚', '{CA,US,EU}', 5),
  ('fish',       'Poisson',     'Fish',        '🐟', '{CA,US,EU}', 6),
  ('crustacean', 'Crustacés',   'Crustaceans', '🦐', '{CA,US,EU}', 7),
  ('mollusc',    'Mollusques',  'Molluscs',    '🦪', '{CA,EU}',    8),
  ('soy',        'Soya',        'Soy',         '🫘', '{CA,US,EU}', 9),
  ('wheat',      'Blé',         'Wheat',       '🌾', '{CA,US,EU}', 10),
  ('gluten',     'Gluten',      'Gluten',      '🍞', '{CA,EU}',    11),
  ('mustard',    'Moutarde',    'Mustard',     '🟡', '{CA,EU}',    12),
  ('sulphite',   'Sulfites',    'Sulphites',   '🍷', '{CA,EU}',    13),
  ('celery',     'Céleri',      'Celery',      '🥬', '{EU}',       14),
  ('lupin',      'Lupin',       'Lupin',       '🌼', '{EU}',       15)
on conflict (code) do nothing;

insert into public.allergen_implications (code, implies) values ('wheat', 'gluten') on conflict do nothing;

insert into public.diets (code, name_fr, name_en) values
  ('vegetarian',  'Végétarien',  'Vegetarian'),
  ('vegan',       'Végane',      'Vegan'),
  ('halal',       'Halal',       'Halal'),
  ('kosher',      'Casher',      'Kosher'),
  ('pescatarian', 'Pescétarien', 'Pescatarian'),
  ('gluten_free', 'Sans gluten', 'Gluten-free'),
  ('dairy_free',  'Sans lactose','Dairy-free')
on conflict (code) do nothing;

insert into public.diet_forbidden_allergens (diet_code, allergen_code) values
  ('vegan', 'milk'), ('vegan', 'egg'), ('vegan', 'fish'), ('vegan', 'crustacean'), ('vegan', 'mollusc'),
  ('vegetarian', 'fish'), ('vegetarian', 'crustacean'), ('vegetarian', 'mollusc'),
  ('gluten_free', 'wheat'), ('gluten_free', 'gluten'),
  ('dairy_free', 'milk')
on conflict do nothing;

insert into public.cuisines (code, name_fr, name_en, emoji) values
  ('quebecois',      'Québécois',     'Québécois',      '⚜️'),
  ('italian',        'Italien',       'Italian',        '🍝'),
  ('asian',          'Asiatique',     'Asian',          '🥢'),
  ('indian',         'Indien',        'Indian',         '🍛'),
  ('mexican',        'Mexicain',      'Mexican',        '🌮'),
  ('middle_eastern', 'Moyen-Orient',  'Middle Eastern', '🧆'),
  ('african',        'Africain',      'African',        '🍲'),
  ('caribbean',      'Caribéen',      'Caribbean',      '🌴'),
  ('mediterranean',  'Méditerranéen', 'Mediterranean',  '🫒'),
  ('healthy_bowl',   'Bol santé',     'Healthy bowl',   '🥗'),
  ('dessert',        'Dessert',       'Dessert',        '🍰'),
  ('other',          'Autre',         'Other',          '🍽️')
on conflict (code) do nothing;

-- Dictionnaire curé (extrait) : ingrédients « pièges » dont l'allergène n'est pas évident.
-- Ces allergènes s'AJOUTENT automatiquement à la déclaration du Cooker (filet de sécurité).
with d(canonical, en, allergens, aliases) as (values
  ('tahini',            'tahini',            '{sesame}',        '{tahina,"crème de sésame","sesame paste"}'),
  ('pesto',             'pesto',             '{milk,tree_nut}', '{"pesto genovese","pesto basilic"}'),
  ('sauce soya',        'soy sauce',         '{soy,wheat}',     '{"sauce soja","soy sauce",shoyu}'),
  ('sauce worcestershire','worcestershire sauce','{fish}',      '{worcestershire}'),
  ('sauce poisson',     'fish sauce',        '{fish}',          '{"nuoc mam","nam pla","fish sauce"}'),
  ('mayonnaise',        'mayonnaise',        '{egg,mustard}',   '{mayo}'),
  ('ghee',              'ghee',              '{milk}',          '{"beurre clarifié"}'),
  ('miso',              'miso',              '{soy}',           '{"pâte miso"}'),
  ('panko',             'panko',             '{wheat}',         '{chapelure}'),
  ('seitan',            'seitan',            '{wheat,gluten}',  '{}'),
  ('orge',              'barley',            '{gluten}',        '{barley}'),
  ('praliné',           'praline',           '{tree_nut}',      '{praline}'),
  ('massepain',         'marzipan',          '{tree_nut}',      '{marzipan,"pâte d''amande"}'),
  ('nouilles de blé',   'wheat noodles',     '{wheat}',         '{ramen,udon}'),
  ('parmesan',          'parmesan',          '{milk}',          '{"parmigiano reggiano"}'),
  ('vin',               'wine',              '{sulphite}',      '{"vin rouge","vin blanc"}'),
  ('fruits séchés',     'dried fruit',       '{sulphite}',      '{"abricots secs","raisins secs"}'),
  ('huile de sésame',   'sesame oil',        '{sesame}',        '{"sesame oil"}'),
  ('sauce hoisin',      'hoisin sauce',      '{soy,wheat,sesame}','{hoisin}'),
  ('crevettes',         'shrimp',            '{crustacean}',    '{crevette,shrimp}')
),
ins as (
  insert into public.ingredients (canonical_name, name_fr, name_en, is_curated)
  select canonical, canonical, en, true from d
  on conflict (canonical_name) do update set is_curated = true
  returning id, canonical_name
),
alg as (
  insert into public.ingredient_allergens (ingredient_id, allergen_code)
  select ins.id, unnest(d.allergens::text[]) from ins join d on d.canonical = ins.canonical_name
  on conflict do nothing
)
insert into public.ingredient_aliases (alias, ingredient_id)
select public.normalize_name(a), ins.id
  from ins join d on d.canonical = ins.canonical_name, unnest(d.aliases::text[]) a
on conflict do nothing;
