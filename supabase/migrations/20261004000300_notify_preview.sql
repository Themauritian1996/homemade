-- Notifications : le texte d'un message n'apparaît sur l'écran verrouillé (et ne transite par Firebase/Google) que si
-- la personne l'a choisi. Par défaut : « Nouveau message de Camille » (confidentialité par défaut, Loi 25).
alter table public.user_settings add column if not exists notify_preview boolean not null default false;
grant update (notify_preview) on public.user_settings to authenticated;
