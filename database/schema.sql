create extension if not exists "pgcrypto";

do $$ begin
  create type user_role as enum ('admin', 'student');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type student_status as enum ('ativo', 'inativo', 'teste', 'pendente');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type training_level as enum ('iniciante', 'intermediario', 'avancado');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_status as enum ('pago', 'pendente', 'atrasado');
exception when duplicate_object then null;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique,
  role user_role not null default 'student',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles add column if not exists email text;
create unique index if not exists profiles_email_unique on profiles (email) where email is not null;

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  full_name text not null,
  email text not null unique,
  phone text,
  birth_date date,
  sex text,
  goal text,
  level training_level not null default 'iniciante',
  status student_status not null default 'pendente',
  plan text,
  start_date date,
  internal_notes text,
  target text,
  initial_weight numeric(6,2) default 0,
  current_weight numeric(6,2) default 0,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  assessment_date date not null default current_date,
  weight numeric(6,2) not null default 0,
  height numeric(4,2) not null default 0,
  imc numeric(5,2) generated always as (weight / nullif(height * height, 0)) stored,
  body_fat numeric(5,2) default 0,
  lean_mass numeric(6,2) default 0,
  fat_mass numeric(6,2) default 0,
  abdomen numeric(6,2) default 0,
  waist numeric(6,2) default 0,
  hip numeric(6,2) default 0,
  right_arm numeric(6,2) default 0,
  left_arm numeric(6,2) default 0,
  right_thigh numeric(6,2) default 0,
  left_thigh numeric(6,2) default 0,
  right_calf numeric(6,2) default 0,
  left_calf numeric(6,2) default 0,
  photos text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists anamnesis (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  main_goal text,
  training_history text,
  injuries text,
  medications text,
  medical_restrictions text,
  work_routine text,
  stress_level int check (stress_level between 1 and 10),
  sleep_quality int check (sleep_quality between 1 and 10),
  sleep_hours numeric(4,2),
  eating_habits text,
  water_intake text,
  emotional_exercise_relation text,
  difficulties text,
  demotivators text,
  motivators text,
  weekly_availability text,
  training_location text,
  created_at timestamptz not null default now()
);

create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  name text not null,
  objective text,
  level training_level not null default 'iniciante',
  place text not null,
  estimated_duration text,
  weekly_frequency text,
  start_date date,
  end_date date,
  notes text,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  name text not null,
  muscle_group text,
  sets text,
  reps text,
  load text,
  rest text,
  technical_notes text,
  video_url text,
  status text not null default 'ativo' check (status in ('ativo', 'concluido')),
  position int not null default 0
);

create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  completed_at timestamptz not null default now(),
  status text not null default 'concluido' check (status in ('concluido')),
  notes text
);

alter table workout_logs add column if not exists profile_id uuid references profiles(id) on delete set null;
alter table workout_logs add column if not exists status text not null default 'concluido' check (status in ('concluido'));

create table if not exists periodizations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  duration_weeks int not null check (duration_weeks in (4, 8, 12)),
  phases jsonb not null default '[]'::jsonb,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  checkin_date date not null default current_date,
  trainings_done int not null default 0,
  food text,
  sleep text,
  energy text,
  motivation int check (motivation between 1 and 10),
  stress int check (stress between 1 and 10),
  current_weight numeric(6,2),
  difficulty text,
  victory text,
  notes text,
  photo_url text
);

create table if not exists financial_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  plan text not null,
  amount numeric(10,2) not null,
  method text not null check (method in ('Pix', 'cartao', 'dinheiro')),
  recurrence text not null check (recurrence in ('mensal', 'semanal', 'trimestral', 'avulso')),
  status payment_status not null default 'pendente',
  due_date date not null,
  notes text
);

create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  content text not null
);

create table if not exists marketing_ideas (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  content text not null
);

create table if not exists progress_photos (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  assessment_id uuid references assessments(id) on delete set null,
  storage_path text not null,
  public_url text,
  photo_date date not null default current_date,
  notes text
);

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function owns_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from students where id = target_student_id and profile_id = auth.uid());
$$;

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role_value user_role;
  user_full_name text;
begin
  user_role_value := coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'student'::user_role);
  user_full_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');

  insert into profiles (id, full_name, email, role)
  values (new.id, coalesce(user_full_name, new.email), new.email, user_role_value)
  on conflict (id) do update
    set full_name = case
          when user_full_name is null then profiles.full_name
          else excluded.full_name
        end,
        email = excluded.email,
        role = excluded.role,
        updated_at = now();

  if user_role_value = 'student' then
    insert into students (profile_id, full_name, email, goal, status, level)
    values (new.id, coalesce(user_full_name, new.email), new.email, 'Definir objetivo', 'pendente', 'iniciante')
    on conflict (email) do update
      set profile_id = excluded.profile_id,
          full_name = case
            when user_full_name is null then students.full_name
            when students.full_name is null or trim(students.full_name) = '' or students.full_name = students.email then excluded.full_name
            else students.full_name
          end,
          updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_auth_user();

alter table profiles enable row level security;
alter table students enable row level security;
alter table assessments enable row level security;
alter table anamnesis enable row level security;
alter table workouts enable row level security;
alter table workout_exercises enable row level security;
alter table workout_logs enable row level security;
alter table periodizations enable row level security;
alter table checkins enable row level security;
alter table financial_records enable row level security;
alter table message_templates enable row level security;
alter table marketing_ideas enable row level security;
alter table progress_photos enable row level security;

drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select using (is_admin() or id = auth.uid());
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles for insert with check (id = auth.uid());
drop policy if exists "profiles_update_own_or_admin" on profiles;
create policy "profiles_update_own_or_admin" on profiles for update using (is_admin() or id = auth.uid()) with check (is_admin() or id = auth.uid());

drop policy if exists "students_select" on students;
create policy "students_select" on students for select using (is_admin() or profile_id = auth.uid());
drop policy if exists "students_admin_all" on students;
create policy "students_admin_all" on students for all using (is_admin()) with check (is_admin());
drop policy if exists "students_update_own_profile_fields" on students;
create policy "students_update_own_profile_fields" on students for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "assessments_select" on assessments;
create policy "assessments_select" on assessments for select using (is_admin() or owns_student(student_id));
drop policy if exists "assessments_admin_all" on assessments;
create policy "assessments_admin_all" on assessments for all using (is_admin()) with check (is_admin());

drop policy if exists "anamnesis_select" on anamnesis;
create policy "anamnesis_select" on anamnesis for select using (is_admin() or owns_student(student_id));
drop policy if exists "anamnesis_admin_all" on anamnesis;
create policy "anamnesis_admin_all" on anamnesis for all using (is_admin()) with check (is_admin());

drop policy if exists "workouts_select" on workouts;
create policy "workouts_select" on workouts for select using (is_admin() or owns_student(student_id));
drop policy if exists "workouts_admin_all" on workouts;
create policy "workouts_admin_all" on workouts for all using (is_admin()) with check (is_admin());
drop policy if exists "workout_exercises_select" on workout_exercises;
create policy "workout_exercises_select" on workout_exercises for select using (
  is_admin() or exists (select 1 from workouts w where w.id = workout_id and owns_student(w.student_id))
);
drop policy if exists "workout_exercises_admin_all" on workout_exercises;
create policy "workout_exercises_admin_all" on workout_exercises for all using (is_admin()) with check (is_admin());

drop policy if exists "workout_logs_select" on workout_logs;
create policy "workout_logs_select" on workout_logs for select using (is_admin() or owns_student(student_id));
drop policy if exists "workout_logs_student_insert" on workout_logs;
create policy "workout_logs_student_insert" on workout_logs for insert with check (owns_student(student_id));

drop policy if exists "periodizations_select" on periodizations;
create policy "periodizations_select" on periodizations for select using (is_admin() or owns_student(student_id));
drop policy if exists "periodizations_admin_all" on periodizations;
create policy "periodizations_admin_all" on periodizations for all using (is_admin()) with check (is_admin());

drop policy if exists "checkins_select" on checkins;
create policy "checkins_select" on checkins for select using (is_admin() or owns_student(student_id));
drop policy if exists "checkins_student_write" on checkins;
create policy "checkins_student_write" on checkins for insert with check (owns_student(student_id));
drop policy if exists "checkins_student_update" on checkins;
create policy "checkins_student_update" on checkins for update using (owns_student(student_id)) with check (owns_student(student_id));
drop policy if exists "checkins_admin_all" on checkins;
create policy "checkins_admin_all" on checkins for all using (is_admin()) with check (is_admin());

drop policy if exists "financial_select" on financial_records;
create policy "financial_select" on financial_records for select using (is_admin() or owns_student(student_id));
drop policy if exists "financial_admin_all" on financial_records;
create policy "financial_admin_all" on financial_records for all using (is_admin()) with check (is_admin());

drop policy if exists "messages_select" on message_templates;
create policy "messages_select" on message_templates for select using (true);
drop policy if exists "messages_admin_all" on message_templates;
create policy "messages_admin_all" on message_templates for all using (is_admin()) with check (is_admin());

drop policy if exists "marketing_select" on marketing_ideas;
create policy "marketing_select" on marketing_ideas for select using (true);
drop policy if exists "marketing_admin_all" on marketing_ideas;
create policy "marketing_admin_all" on marketing_ideas for all using (is_admin()) with check (is_admin());

drop policy if exists "progress_photos_select" on progress_photos;
create policy "progress_photos_select" on progress_photos for select using (is_admin() or owns_student(student_id));
drop policy if exists "progress_photos_student_write" on progress_photos;
create policy "progress_photos_student_write" on progress_photos for insert with check (owns_student(student_id) or is_admin());
drop policy if exists "progress_photos_student_update" on progress_photos;
create policy "progress_photos_student_update" on progress_photos for update using (owns_student(student_id) or is_admin()) with check (owns_student(student_id) or is_admin());

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('progress-photos', 'progress-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects for insert with check (
  bucket_id = 'avatars' and (auth.uid()::text = (storage.foldername(name))[1] or is_admin())
);
drop policy if exists "progress_photos_owner_read" on storage.objects;
create policy "progress_photos_owner_read" on storage.objects for select using (
  bucket_id = 'progress-photos' and (auth.uid()::text = (storage.foldername(name))[1] or is_admin())
);
drop policy if exists "progress_photos_owner_write" on storage.objects;
create policy "progress_photos_owner_write" on storage.objects for insert with check (
  bucket_id = 'progress-photos' and (auth.uid()::text = (storage.foldername(name))[1] or is_admin())
);
