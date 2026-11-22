-- The Queen : base de données (Supabase > SQL Editor > New query > coller > Run)
-- Le serveur ne stocke que des messages chiffrés, et seulement jusqu'à leur réception.
-- On peut relancer ce fichier sans risque.

-- 1) Les deux seules adresses autorisées
create table if not exists public.membres (email text primary key);
alter table public.membres enable row level security;
-- Aucune règle d'accès : la liste est invisible depuis l'application.

create or replace function public.max_deux_membres() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.membres) >= 2 then
    raise exception 'The Queen : deux membres au maximum';
  end if;
  new.email := lower(trim(new.email));
  return new;
end $$;
drop trigger if exists max_deux_membres on public.membres;
create trigger max_deux_membres before insert on public.membres
  for each row execute function public.max_deux_membres();

create or replace function public.est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres m
                 where m.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.est_membre() from public, anon;
grant execute on function public.est_membre() to authenticated;

-- 2) Personne d'autre ne peut créer de compte
create or replace function public.bloquer_inconnus() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.membres m where m.email = lower(new.email)) then
    raise exception 'Inscription refusée';
  end if;
  return new;
end $$;
drop trigger if exists bloquer_inconnus on auth.users;
create trigger bloquer_inconnus before insert on auth.users
  for each row execute function public.bloquer_inconnus();

-- 3) Clés publiques (jamais de clé privée ici)
create table if not exists public.cles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 40),
  sign_pub text not null check (char_length(sign_pub) < 200),
  spk_pub text not null check (char_length(spk_pub) < 200),
  spk_id text not null check (char_length(spk_id) < 40),
  spk_sig text not null check (char_length(spk_sig) < 200),
  nk_pub text not null check (char_length(nk_pub) < 200),
  nk_sig text not null check (char_length(nk_sig) < 200),
  updated_at timestamptz not null default now()
);
alter table public.cles enable row level security;
drop policy if exists cles_lire on public.cles;
drop policy if exists cles_creer on public.cles;
drop policy if exists cles_maj on public.cles;
create policy cles_lire on public.cles for select to authenticated using (public.est_membre());
create policy cles_creer on public.cles for insert to authenticated
  with check (public.est_membre() and user_id = auth.uid());
create policy cles_maj on public.cles for update to authenticated
  using (user_id = auth.uid()) with check (public.est_membre() and user_id = auth.uid());

-- 4) Boîte aux lettres chiffrée
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  env jsonb not null check (pg_column_size(env) < 6000000),
  notif text check (char_length(notif) < 400),   -- aperçu chiffré (Photo, Vocal…)
  created_at timestamptz not null default now()
);
create index if not exists messages_dest on public.messages (recipient, created_at);
alter table public.messages enable row level security;
drop policy if exists msg_envoyer on public.messages;
drop policy if exists msg_lire on public.messages;
drop policy if exists msg_effacer on public.messages;
create policy msg_envoyer on public.messages for insert to authenticated
  with check (public.est_membre() and sender = auth.uid() and recipient <> auth.uid()
              and exists (select 1 from public.cles c where c.user_id = recipient));
create policy msg_lire on public.messages for select to authenticated
  using (public.est_membre() and (recipient = auth.uid() or sender = auth.uid()));
create policy msg_effacer on public.messages for delete to authenticated
  using (recipient = auth.uid() or sender = auth.uid());
-- Pas de règle "update" : un message déposé ne peut pas être modifié.

-- Arrivée instantanée des messages
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

-- 5) Vidéos chiffrées (coffre privé, 50 Mo max par vidéo). Chemin : <destinataire>/<expéditeur>-<id>
insert into storage.buckets (id, name, public, file_size_limit)
values ('coffre', 'coffre', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;
drop policy if exists coffre_depot on storage.objects;
drop policy if exists coffre_lire on storage.objects;
drop policy if exists coffre_effacer on storage.objects;
create policy coffre_depot on storage.objects for insert to authenticated
  with check (bucket_id = 'coffre' and public.est_membre()
              and split_part(name, '/', 2) like auth.uid()::text || '-%'
              and split_part(name, '/', 1) <> auth.uid()::text);
create policy coffre_lire on storage.objects for select to authenticated
  using (bucket_id = 'coffre' and public.est_membre()
         and (split_part(name, '/', 1) = auth.uid()::text or split_part(name, '/', 2) like auth.uid()::text || '-%'));
create policy coffre_effacer on storage.objects for delete to authenticated
  using (bucket_id = 'coffre' and public.est_membre()
         and (split_part(name, '/', 1) = auth.uid()::text or split_part(name, '/', 2) like auth.uid()::text || '-%'));

-- 6) Notifications : adresse de réveil de chaque téléphone
create table if not exists public.push_abonnements (
  endpoint text primary key check (endpoint like 'https://%' and char_length(endpoint) < 1000),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  created_at timestamptz not null default now()
);
alter table public.push_abonnements enable row level security;
drop policy if exists push_moi on public.push_abonnements;
create policy push_moi on public.push_abonnements for all to authenticated
  using (user_id = auth.uid()) with check (public.est_membre() and user_id = auth.uid());

-- 7) VOS DEUX ADRESSES (à remplacer, puis Run)
-- insert into public.membres (email) values ('ton-adresse@exemple.com'), ('adresse-de-ta-femme@exemple.com');
