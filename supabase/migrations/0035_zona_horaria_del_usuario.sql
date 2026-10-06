-- ============================================================================
-- FinancyBoss — Zona horaria por usuario
-- ============================================================================
-- Hasta ahora "hoy" era siempre la hora de Bolivia (America/La_Paz), fija en
-- el código y en bolivia_today() (migración 0034). Para que la app sirva en
-- cualquier país, cada usuario guarda SU zona horaria en el perfil y "hoy",
-- el cierre de mes y las fechas de los movimientos se calculan con ella —
-- tanto en la app (lib/dashboard.ts) como en la base (user_today()).
--
-- Se guarda en el perfil y no se detecta en cada pedido a propósito: si el
-- fin de mes siguiera al dispositivo, viajar movería de mes los movimientos
-- y dejaría inconsistentes los meses ya cerrados. La app la detecta una vez
-- (onboarding) y el usuario puede cambiarla en Más → Perfil.
--
-- Los usuarios existentes quedan en America/La_Paz, que es la que ya tenían.
-- ============================================================================

alter table public.profiles
  add column if not exists timezone text not null default 'America/La_Paz';

comment on column public.profiles.timezone is
  'Zona horaria IANA del usuario (ej. America/La_Paz). Define qué es "hoy" y dónde empieza y termina cada mes para él. La app la detecta en el onboarding y se puede cambiar en Más → Perfil.';

-- Una zona inválida rompería TODOS los inserts de ese usuario (user_today()
-- fallaría al usarla), así que se rechaza desde el perfil, no al usarla.
create or replace function public.profiles_timezone_guard()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Zona horaria inválida: %.', new.timezone;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_timezone_guard_trigger on public.profiles;
create trigger profiles_timezone_guard_trigger
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_timezone_guard();

-- "Hoy" en la zona del usuario que hace la operación. Es la única fuente de
-- "hoy" del lado de la base. Si no hay sesión (auth.uid() nulo) usa la de
-- Bolivia, igual que el valor por defecto de la columna.
create or replace function public.user_today()
returns date
language sql
stable
as $$
  select (
    now() at time zone coalesce(
      (select p.timezone from public.profiles p where p.id = auth.uid()),
      'America/La_Paz'
    )
  )::date;
$$;

alter table public.transactions
  alter column date set default public.user_today();
alter table public.free_money_transactions
  alter column date set default public.user_today();
alter table public.usd_savings_transactions
  alter column date set default public.user_today();

-- Las 3 funciones de 0034 pasan de bolivia_today() a user_today(); la lógica
-- es la misma.
create or replace function public.convert_usd_savings_to_bs(
  p_amount_usd numeric,
  p_bs_amount numeric,
  p_category_id uuid,
  p_description text,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_balance numeric;
  v_category record;
  v_pillar_name text;
  v_date date := coalesce(p_date, public.user_today());
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;
  if p_amount_usd is null or p_amount_usd <= 0 then
    raise exception 'El monto en USD debe ser mayor a 0.';
  end if;
  if p_bs_amount is null or p_bs_amount <= 0 then
    raise exception 'El monto en Bs debe ser mayor a 0.';
  end if;

  select coalesce(sum(amount_usd), 0) into v_balance
    from public.usd_savings_transactions where user_id = v_caller;
  if p_amount_usd > v_balance + 0.005 then
    raise exception 'Solo tienes % USD ahorrados.', round(v_balance, 2);
  end if;

  select c.id, c.pillar_id into v_category
    from public.categories c
    where c.id = p_category_id and c.user_id = v_caller and c.deleted_at is null;
  if v_category.id is null then
    raise exception 'Categoría inválida.';
  end if;

  select p.name into v_pillar_name
    from public.pillars p where p.id = v_category.pillar_id and p.user_id = v_caller;
  if v_pillar_name is distinct from 'ahorro' then
    raise exception 'Elige una categoría de Ahorro como destino.';
  end if;

  insert into public.usd_savings_transactions (user_id, amount_usd, bs_amount, description, date)
  values (v_caller, -p_amount_usd, p_bs_amount, p_description, v_date);

  insert into public.transactions (user_id, pillar_id, category_id, amount, type, description, date)
  values (v_caller, v_category.pillar_id, v_category.id, p_bs_amount, 'extra_income', p_description, v_date);
end;
$$;

revoke all on function public.convert_usd_savings_to_bs(numeric, numeric, uuid, text, date) from public;
grant execute on function public.convert_usd_savings_to_bs(numeric, numeric, uuid, text, date) to authenticated;

create or replace function public.allocate_free_money_to_category(
  p_amount numeric,
  p_category_id uuid,
  p_description text,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_accumulated numeric;
  v_committed numeric;
  v_base_income numeric;
  v_available numeric;
  v_category record;
  v_date date := coalesce(p_date, public.user_today());
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0.';
  end if;

  select coalesce(sum(amount), 0) into v_accumulated
    from public.free_money_transactions where user_id = v_caller;
  select coalesce(sum(monthly_amount), 0) into v_committed
    from public.pillars where user_id = v_caller;
  select base_income into v_base_income from public.profiles where id = v_caller;

  v_available := v_accumulated + greatest(0, coalesce(v_base_income, 0) - v_committed);
  if p_amount > v_available + 0.005 then
    raise exception 'Solo tienes % Bs de Dinero libre disponibles.', round(v_available, 2);
  end if;

  select c.id, c.pillar_id into v_category
    from public.categories c
    where c.id = p_category_id and c.user_id = v_caller and c.deleted_at is null;
  if v_category.id is null then
    raise exception 'Categoría inválida.';
  end if;

  insert into public.free_money_transactions (user_id, amount, description, date)
  values (v_caller, -p_amount, p_description, v_date);

  insert into public.transactions (user_id, pillar_id, category_id, amount, type, description, date)
  values (v_caller, v_category.pillar_id, v_category.id, p_amount, 'extra_income', p_description, v_date);
end;
$$;

revoke all on function public.allocate_free_money_to_category(numeric, uuid, text, date) from public;
grant execute on function public.allocate_free_money_to_category(numeric, uuid, text, date) to authenticated;

create or replace function public.fund_fixed_expense_from_savings(
  p_gasto_category_id uuid,
  p_ahorro_category_id uuid,
  p_amount numeric,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_gasto_category record;
  v_ahorro_category record;
  v_ahorro_balance numeric;
  v_today date := public.user_today();
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0.';
  end if;

  select c.id, c.pillar_id, c.name, c.fixed_amount into v_gasto_category
    from public.categories c
    join public.pillars p on p.id = c.pillar_id
    where c.id = p_gasto_category_id and c.user_id = v_caller and c.deleted_at is null and p.name = 'gasto';
  if v_gasto_category.id is null then
    raise exception 'Categoría de Gasto inválida.';
  end if;
  if v_gasto_category.fixed_amount is null then
    raise exception 'Esto solo aplica a gastos fijos.';
  end if;

  select c.id, c.pillar_id, c.name into v_ahorro_category
    from public.categories c
    join public.pillars p on p.id = c.pillar_id
    where c.id = p_ahorro_category_id and c.user_id = v_caller and c.deleted_at is null and p.name = 'ahorro';
  if v_ahorro_category.id is null then
    raise exception 'Categoría de Ahorro inválida.';
  end if;

  select coalesce(sum(amount), 0) into v_ahorro_balance
    from public.transactions
    where category_id = v_ahorro_category.id and user_id = v_caller;
  if p_amount > v_ahorro_balance + 0.005 then
    raise exception 'Esa categoría de Ahorro solo tiene % Bs disponibles.', round(v_ahorro_balance, 2);
  end if;

  insert into public.transactions (user_id, pillar_id, category_id, amount, type, description, date)
  values (
    v_caller, v_ahorro_category.pillar_id, v_ahorro_category.id, -p_amount, 'expense',
    coalesce(p_description, 'Transferido a ' || v_gasto_category.name), v_today
  );

  insert into public.transactions (user_id, pillar_id, category_id, amount, type, description, date)
  values (
    v_caller, v_gasto_category.pillar_id, v_gasto_category.id, p_amount, 'extra_income',
    coalesce(p_description, 'Aumento puntual de este mes (desde Ahorro: ' || v_ahorro_category.name || ')'), v_today
  );
end;
$$;

revoke all on function public.fund_fixed_expense_from_savings(uuid, uuid, numeric, text) from public;
grant execute on function public.fund_fixed_expense_from_savings(uuid, uuid, numeric, text) to authenticated;

-- bolivia_today() (0034) ya no lo usa nadie: los defaults de columna y las 3
-- funciones apuntan a user_today(). Se borra para no dejar dos fuentes de
-- "hoy".
drop function if exists public.bolivia_today();
