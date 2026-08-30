CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, note_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own purchases" ON public.purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own purchases" ON public.purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  headline TEXT,
  comment TEXT,
  author_name TEXT,
  author_city TEXT,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (note_id, user_id)
);
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create own reviews" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reviews" ON public.reviews FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reviews" ON public.reviews FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, email)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'avatar_url', NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

create type public.app_role as enum ('admin', 'moderator', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create policy "Users can view own roles" on public.user_roles
for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;
revoke execute on function public.has_role(uuid, public.app_role) from anon, public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

create or replace function public.grant_admin_to_known_emails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(NEW.email, '')) = 'devbratgouda29@gmail.com'
     or coalesce(NEW.raw_user_meta_data ->> 'role', '') = 'admin' then
    insert into public.user_roles (user_id, role)
    values (NEW.id, 'admin'::public.app_role)
    on conflict (user_id, role) do nothing;
  end if;
  return NEW;
end;
$$;

create trigger on_auth_user_created_grant_admin
after insert on auth.users
for each row execute function public.grant_admin_to_known_emails();

insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from auth.users
where lower(email) = 'devbratgouda29@gmail.com'
on conflict (user_id, role) do nothing;

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null default '',
  description text,
  thumbnail_url text,
  price_inr integer not null default 0,
  is_free boolean not null default false,
  is_pro boolean not null default false,
  pdf_path text,
  pdf_path_en text,
  language text not null default 'hinglish' check (language in ('hinglish','english','both')),
  pair_note_id uuid references public.notes(id) on delete set null,
  preview_images text[] not null default '{}',
  concepts text,
  page_count integer,
  page_count_en integer,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.notes to anon;
grant select, insert, update, delete on public.notes to authenticated;
grant all on public.notes to service_role;

alter table public.notes enable row level security;

create policy "Published notes are viewable by everyone" on public.notes
for select using (hidden = false);

create policy "Admins can view hidden notes" on public.notes
for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert notes" on public.notes
for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update notes" on public.notes
for update to authenticated using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete notes" on public.notes
for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create trigger update_notes_updated_at
before update on public.notes
for each row execute function public.update_updated_at_column();

insert into public.notes (title, subject, description, price_inr, is_free, is_pro, language, concepts, page_count)
values
  ('Electrostatics', 'Physics · 12', 'Complete chapter notes with derivations and solved PYQs.', 199, false, true, 'hinglish', E'Coulomb''s Law & Superposition\nElectric Field & Field Lines\nGauss''s Law Applications\nElectric Potential & Equipotential Surfaces\nCapacitors & Dielectrics', 42),
  ('Organic Basics', 'Chemistry · 12', 'Reaction mechanisms, GOC fundamentals and shortcuts.', 149, false, false, 'both', E'Inductive & Resonance Effects\nHyperconjugation\nCarbocation Stability\nNucleophiles vs Electrophiles\nReaction Intermediates', 36);

create table public.review_votes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (review_id, user_id)
);

grant select on public.review_votes to anon;
grant select, insert, update, delete on public.review_votes to authenticated;
grant all on public.review_votes to service_role;

alter table public.review_votes enable row level security;

create policy "Review votes are viewable by everyone" on public.review_votes
for select using (true);

create policy "Users can cast own vote" on public.review_votes
for insert to authenticated with check (auth.uid() = user_id);

create policy "Users can change own vote" on public.review_votes
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can remove own vote" on public.review_votes
for delete to authenticated using (auth.uid() = user_id);

insert into public.reviews (note_id, rating, headline, comment, author_name, author_city, created_at)
select n.id::text, v.rating, v.headline, v.comment, v.author_name, v.author_city, now() - (v.age_days || ' days')::interval
from public.notes n
cross join (values
  (5, 'Super detailed visual diagrams!', 'Every derivation is drawn out step by step. Revised the whole chapter in one sitting before my test.', 'Rahul S.', 'Kota', 14),
  (4, 'Great for quick revision', 'PYQs at the end are gold. Would love a few more numericals on the tougher topics.', 'Ananya M.', 'Pune', 32),
  (5, 'Handwriting is crystal clear', 'Printed it out and it still looks sharp. The colour coding for formulas really helps memory.', 'Imran K.', 'Hyderabad', 6),
  (3, 'Good, but a bit compressed', 'Concepts are correct and crisp, though beginners may need a textbook alongside for the basics.', 'Sneha R.', 'Lucknow', 58)
) as v(rating, headline, comment, author_name, author_city, age_days);

create table public.revision_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  chapter_name text not null,
  subject text not null default '',
  total_minutes_spent integer not null default 0,
  base_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.revision_logs to authenticated;
grant all on public.revision_logs to service_role;

alter table public.revision_logs enable row level security;

create policy "Users can view own revision logs" on public.revision_logs
for select to authenticated using (auth.uid() = user_id);

create policy "Users can insert own revision logs" on public.revision_logs
for insert to authenticated with check (auth.uid() = user_id);

create index revision_logs_user_completed_idx on public.revision_logs (user_id, completed_at desc);

revoke execute on function public.update_updated_at_column() from anon, authenticated, public;
revoke execute on function public.grant_admin_to_known_emails() from anon, authenticated, public;

create policy "Visible reviews are viewable by everyone" on public.reviews
for select using (hidden = false);

create policy "Admins can view hidden reviews" on public.reviews
for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can moderate reviews" on public.reviews
for update to authenticated using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete any review" on public.reviews
for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "Admins manage note pdfs"
on storage.objects for all to authenticated
using (bucket_id = 'notes-pdfs' and public.has_role(auth.uid(), 'admin'))
with check (bucket_id = 'notes-pdfs' and public.has_role(auth.uid(), 'admin'));

create policy "Signed-in users can read note pdfs"
on storage.objects for select to authenticated
using (bucket_id = 'notes-pdfs');

create policy "Signed-in users can read note previews"
on storage.objects for select to authenticated
using (bucket_id = 'note-previews');

create policy "Admins manage note previews"
on storage.objects for all to authenticated
using (bucket_id = 'note-previews' and public.has_role(auth.uid(), 'admin'))
with check (bucket_id = 'note-previews' and public.has_role(auth.uid(), 'admin'));