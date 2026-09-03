-- ============================================================================
-- FinancyBoss — Esquema inicial (Fase 1 MVP)
-- ============================================================================
-- Este archivo crea las 8 tablas del modelo, con:
--   * Los 3 ajustes aprobados (pillar_id en monthly_budgets, deleted_at en
--     categories, estado "archived" en debtors).
--   * RLS (Row Level Security) activado en TODAS las tablas desde el día 1:
--     cada usuario solo puede ver y tocar SUS propios datos.
--
-- Cómo usarlo: pegá todo este SQL en el editor SQL de Supabase y ejecutalo.
-- Es idempotente en lo posible (usa "if not exists" / "drop policy if exists"),
-- así que se puede volver a correr sin romper nada.
--
-- Moneda única: bolivianos (Bs). Sin multi-moneda en el MVP.
-- ============================================================================

-- gen_random_uuid() vive en la extensión pgcrypto. En Supabase suele estar
-- activa, pero la habilitamos por las dudas.
create extension if not exists pgcrypto;


-- ============================================================================
-- 1. profiles — datos extra del usuario (1 a 1 con auth.users)
-- ============================================================================
-- El id es EL MISMO que el de auth.users: así el perfil y la cuenta de login
-- son la misma identidad. Si se borra la cuenta, se borra el perfil (cascade).
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  name                text not null,
  base_income         numeric(12,2) not null default 0 check (base_income >= 0),
  auto_repeat_income  boolean not null default true,
  created_at          timestamptz not null default now()
);


-- ============================================================================
-- 2. pillars — los 3 pilares de cada usuario (siempre exactamente 3)
-- ============================================================================
create table if not exists public.pillars (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (name in ('ahorro', 'gasto', 'inversion')),
  percentage  numeric(5,2) not null default 0 check (percentage >= 0 and percentage <= 100),
  created_at  timestamptz not null default now(),
  -- Cada usuario tiene cada pilar una sola vez (no puede haber 2 "ahorro").
  unique (user_id, name)
);


-- ============================================================================
-- 3. categories — subcategorías dentro de cada pilar
-- ============================================================================
-- AJUSTE 2: deleted_at para borrado suave. Una categoría con deleted_at != null
-- desaparece de la UI, pero la fila (y sus transacciones históricas) se conservan
-- etiquetadas como "categoría eliminada". La app NUNCA hace DELETE real acá.
create table if not exists public.categories (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  pillar_id        uuid not null references public.pillars(id) on delete cascade,
  name             text not null,
  -- percentage puede ser null: la subcategoría existe pero sin % asignado todavía.
  percentage       numeric(5,2) check (percentage is null or (percentage >= 0 and percentage <= 100)),
  -- backup_priority: orden en que esta categoría absorbe excesos del efecto dominó
  -- (menor número = se usa primero). Null = no configurada como respaldo manual.
  backup_priority  integer,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now()
);


-- ============================================================================
-- 4. transactions — cada gasto o ingreso extra registrado
-- ============================================================================
-- amount: positivo = ingreso, negativo = gasto (según el manual).
-- category_id puede ser null: el movimiento va directo al pilar, sin subcategoría.
-- Si una categoría llegara a borrarse de verdad (solo en borrado de cuenta),
-- category_id queda en null pero la transacción NO se pierde (on delete set null).
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete set null,
  pillar_id    uuid not null references public.pillars(id) on delete cascade,
  amount       numeric(12,2) not null,
  type         text not null check (type in ('expense', 'extra_income')),
  description  text,
  date         date not null default current_date,
  created_at   timestamptz not null default now()
);


-- ============================================================================
-- 5. debts — deudas del usuario (lo que él debe)
-- ============================================================================
create table if not exists public.debts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  total_amount      numeric(12,2) not null check (total_amount >= 0),
  remaining_amount  numeric(12,2) not null check (remaining_amount >= 0),
  monthly_payment   numeric(12,2) not null default 0 check (monthly_payment >= 0),
  -- interest_rate: tasa mensual. 0 = sin interés (default del manual).
  interest_rate     numeric(6,4) not null default 0 check (interest_rate >= 0),
  total_months      integer not null check (total_months > 0),
  paid_months       integer not null default 0 check (paid_months >= 0),
  status            text not null default 'active' check (status in ('active', 'paid')),
  created_at        timestamptz not null default now()
);


-- ============================================================================
-- 6. debtors — personas que le deben al usuario
-- ============================================================================
-- AJUSTE 3: status ahora acepta 'archived' (al borrar un deudor con pagos
-- parciales, se archiva en vez de borrarse, para conservar el historial).
create table if not exists public.debtors (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  total_amount      numeric(12,2) not null check (total_amount >= 0),
  remaining_amount  numeric(12,2) not null check (remaining_amount >= 0),
  lent_date         date not null,
  expected_date     date,
  description       text,
  status            text not null default 'pending' check (status in ('pending', 'paid', 'archived')),
  created_at        timestamptz not null default now()
);


-- ============================================================================
-- 7. monthly_budgets — estado de cada mes por categoría (o por pilar)
-- ============================================================================
-- AJUSTE 1: pillar_id agregado (not null: todo presupuesto pertenece a un pilar).
-- category_id ahora es NULLABLE: si es null, la fila representa el saldo LIBRE
-- del pilar (la parte del pilar no asignada a ninguna subcategoría).
create table if not exists public.monthly_budgets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  pillar_id        uuid not null references public.pillars(id) on delete cascade,
  category_id      uuid references public.categories(id) on delete set null,
  month            integer not null check (month between 1 and 12),
  year             integer not null check (year >= 2000),
  budgeted_amount  numeric(12,2) not null default 0,
  spent_amount     numeric(12,2) not null default 0,
  -- carried_over: saldo acumulado que vino del mes anterior.
  carried_over     numeric(12,2) not null default 0,
  created_at       timestamptz not null default now()
);

-- Un presupuesto por categoría por mes (cuando hay categoría)...
create unique index if not exists monthly_budgets_category_unique
  on public.monthly_budgets (user_id, category_id, month, year)
  where category_id is not null;

-- ...y una sola fila de "saldo libre" por pilar por mes (cuando category_id es null).
create unique index if not exists monthly_budgets_pillar_free_unique
  on public.monthly_budgets (user_id, pillar_id, month, year)
  where category_id is null;


-- ============================================================================
-- 8. domino_events — registro de cada activación del efecto dominó
-- ============================================================================
-- Guarda: qué categoría se excedió (source), cuál absorbió el exceso (affected)
-- y cuánto se transfirió. Si se borra la transacción que lo causó, el evento
-- se va con ella (cascade).
create table if not exists public.domino_events (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  transaction_id        uuid references public.transactions(id) on delete cascade,
  source_category_id    uuid references public.categories(id) on delete set null,
  affected_category_id  uuid references public.categories(id) on delete set null,
  amount                numeric(12,2) not null,
  created_at            timestamptz not null default now()
);


-- ============================================================================
-- Índices para acelerar las consultas más comunes (por usuario y por fecha).
-- ============================================================================
create index if not exists categories_user_id_idx        on public.categories (user_id);
create index if not exists categories_pillar_id_idx       on public.categories (pillar_id);
create index if not exists transactions_user_date_idx     on public.transactions (user_id, date);
create index if not exists transactions_category_id_idx   on public.transactions (category_id);
create index if not exists transactions_pillar_id_idx     on public.transactions (pillar_id);
create index if not exists debts_user_id_idx              on public.debts (user_id);
create index if not exists debtors_user_id_idx            on public.debtors (user_id);
create index if not exists monthly_budgets_user_period_idx on public.monthly_budgets (user_id, year, month);
create index if not exists domino_events_user_id_idx      on public.domino_events (user_id);


-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- 1) Prendemos RLS en cada tabla. Con RLS prendido y SIN políticas, la tabla
--    queda bloqueada para todos: nadie ve nada. Por eso, abajo, creamos una
--    política por tabla que abre el acceso SOLO a las filas propias del usuario.
-- 2) auth.uid() devuelve el id del usuario logueado (viene del token de Supabase).
-- 3) Usamos "for all" (cubre SELECT/INSERT/UPDATE/DELETE en una sola política):
--      using       -> qué filas puede LEER/afectar (las suyas)
--      with check  -> qué filas puede CREAR/dejar tras editar (solo suyas)
--    Así un usuario nunca puede leer ni crear datos a nombre de otro.
-- ============================================================================

alter table public.profiles        enable row level security;
alter table public.pillars         enable row level security;
alter table public.categories      enable row level security;
alter table public.transactions    enable row level security;
alter table public.debts           enable row level security;
alter table public.debtors         enable row level security;
alter table public.monthly_budgets enable row level security;
alter table public.domino_events   enable row level security;

-- profiles: la identidad está en "id" (no en user_id), porque el perfil ES el usuario.
drop policy if exists "profiles_owner_all" on public.profiles;
create policy "profiles_owner_all" on public.profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- El resto de las tablas usan user_id.
drop policy if exists "pillars_owner_all" on public.pillars;
create policy "pillars_owner_all" on public.pillars
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "categories_owner_all" on public.categories;
create policy "categories_owner_all" on public.categories
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "transactions_owner_all" on public.transactions;
create policy "transactions_owner_all" on public.transactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "debts_owner_all" on public.debts;
create policy "debts_owner_all" on public.debts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "debtors_owner_all" on public.debtors;
create policy "debtors_owner_all" on public.debtors
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "monthly_budgets_owner_all" on public.monthly_budgets;
create policy "monthly_budgets_owner_all" on public.monthly_budgets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "domino_events_owner_all" on public.domino_events;
create policy "domino_events_owner_all" on public.domino_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- FIN del esquema inicial.
-- ============================================================================
