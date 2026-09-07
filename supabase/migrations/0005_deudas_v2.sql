-- ============================================================================
-- FinancyBoss — Deudas v2: pago real en vez de cuota automática mensual
-- ============================================================================
-- Acompaña la reescritura del modelo de Deudas (manual.md §6): crear una
-- deuda ya no descuenta nada del presupuesto — solo un PAGO registrado
-- (manual, o generado por un plan automático opcional) reduce
-- remaining_amount y, si la fuente es "plata líquida general", el ingreso
-- distribuible del mes en que se registra.
-- ============================================================================

-- monthly_payment pasa a ser la cuota del plan de pago automático OPCIONAL
-- (antes era obligatoria y se calculaba de total_amount/total_months). El
-- check "monthly_payment >= 0" ya es null-safe en Postgres, no hace falta
-- tocarlo.
alter table public.debts
  alter column monthly_payment drop not null,
  alter column monthly_payment drop default;

-- total_months ya no tiene sentido (una deuda no tiene plazo fijo en
-- meses). Su check "> 0" también es null-safe, con soltar el NOT NULL
-- alcanza.
alter table public.debts
  alter column total_months drop not null;

comment on column public.debts.monthly_payment is
  'Cuota fija del plan de pago automático (opcional). NULL = sin plan: el usuario paga esta deuda manualmente, cuando quiera (Deudas v2, manual.md §6).';
comment on column public.debts.total_months is
  'OBSOLETO desde Deudas v2: una deuda ya no tiene plazo fijo en meses. Columna sin uso, se deja sin borrar por prudencia.';
comment on column public.debts.interest_rate is
  'OBSOLETO desde Deudas v2: ya no hay amortización con interés en el MVP. Columna sin uso.';
comment on column public.debts.paid_months is
  'OBSOLETO desde Deudas v2: el progreso se trackea por remaining_amount, no por conteo de meses. Columna sin uso.';

alter table public.debts
  add column if not exists auto_pay_start_year integer
    check (auto_pay_start_year is null or auto_pay_start_year >= 2000),
  add column if not exists auto_pay_start_month integer
    check (auto_pay_start_month is null or auto_pay_start_month between 1 and 12),
  add column if not exists auto_pay_pillar_id uuid references public.pillars(id) on delete set null,
  add column if not exists auto_pay_category_id uuid references public.categories(id) on delete set null;

comment on column public.debts.auto_pay_pillar_id is
  'Fuente del plan de pago automático. NULL = "plata líquida general" (reduce ingresoDistribuible, ver lib/dashboard.ts). No-null = pago normal contra ese pilar/categoría (transactions.debt_id).';
comment on column public.debts.auto_pay_category_id is
  'Categoría específica (opcional) dentro de auto_pay_pillar_id. Solo tiene sentido si auto_pay_pillar_id no es null.';

-- Pago con fuente pilar/categoría específica: es un gasto normal, se marca
-- para trackear a qué deuda pertenece (progreso, futuro reporte en
-- Estadísticas).
alter table public.transactions
  add column if not exists debt_id uuid references public.debts(id) on delete set null;

comment on column public.transactions.debt_id is
  'Seteado cuando esta transacción es un pago de deuda con fuente pilar/categoría específica (Deudas v2). NULL en transacciones normales.';

-- Pagos con fuente "plata líquida general": no pertenecen a ningún pilar,
-- no pueden vivir en transactions. Historial inmutable, mismo criterio que
-- domino_events (se crea y se lee, nunca se edita/borra).
create table if not exists public.debt_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  debt_id     uuid not null references public.debts(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);

comment on table public.debt_payments is
  'Pagos de deuda con fuente "plata líquida general" (manual §6.2): reducen ingresoDistribuible del mes en que se registran (ver lib/dashboard.ts). Los pagos con fuente pilar/categoría van directo a transactions.debt_id, no acá.';

create index if not exists debt_payments_user_date_idx on public.debt_payments (user_id, date);

alter table public.debt_payments enable row level security;
create policy "debt_payments_owner_all" on public.debt_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Sin update/delete (mismo criterio que domino_events en 0003_grants.sql):
-- historial inmutable una vez escrito.
grant select, insert on public.debt_payments to authenticated;

-- No hace falta tocar RLS ni GRANT de debts/transactions: ya tienen CRUD
-- completo owner-only desde 0001/0003.
