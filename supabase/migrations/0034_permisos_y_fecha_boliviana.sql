-- ============================================================================
-- FinancyBoss — Permisos de dinero libre / USD (C01) y fecha contable de
--                Bolivia en la base (C02)
-- ============================================================================
-- C01. 0003_grants.sql explica que en este proyecto la exposición automática
-- de tablas está desactivada: cada tabla necesita su GRANT explícito además
-- del RLS. Las tablas free_money_transactions (0021) y
-- usd_savings_transactions (0027) se crearon con RLS pero SIN GRANT, así que
-- una instalación desde cero fallaba con "permission denied" (42501) en el
-- Dashboard y en Ahorro en USD. Si en tu base ya funcionaban, es porque los
-- permisos se dieron a mano; este GRANT no cambia nada ahí y hace la
-- instalación reproducible. Solo select e insert: es lo único que usa la app
-- directamente (los débitos pasan por funciones security definer) y son
-- movimientos históricos, no se editan ni se borran. RLS sigue activo.
--
-- C02. La app calcula "hoy" con America/La_Paz, pero estas funciones y los
-- defaults de columna usaban current_date, que es la fecha de la sesión SQL
-- (normalmente UTC). Bolivia es UTC-4 todo el año: entre las 20:00 y las
-- 23:59 de Bolivia, UTC ya está en el día siguiente, y un movimiento de fin
-- de mes podía caer en el mes equivocado. bolivia_today() es la única fuente
-- de "hoy" del lado de la base.
-- ============================================================================

-- C01 ------------------------------------------------------------------------
grant select, insert on public.free_money_transactions to authenticated;
grant select, insert on public.usd_savings_transactions to authenticated;

-- C02 ------------------------------------------------------------------------
create or replace function public.bolivia_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/La_Paz')::date;
$$;

alter table public.transactions
  alter column date set default public.bolivia_today();
alter table public.free_money_transactions
  alter column date set default public.bolivia_today();
alter table public.usd_savings_transactions
  alter column date set default public.bolivia_today();

-- convert_usd_savings_to_bs (0027): misma lógica, solo cambia la fecha por
-- defecto. Los mensajes pasan a "tú", como el resto de la app.
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
  v_date date := coalesce(p_date, public.bolivia_today());
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

-- allocate_free_money_to_category (0028): misma lógica, fecha de Bolivia.
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
  v_date date := coalesce(p_date, public.bolivia_today());
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

-- fund_fixed_expense_from_savings (0031): misma lógica, fecha de Bolivia.
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
  v_today date := public.bolivia_today();
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
