-- ============================================================================
-- FinancyBoss — Distinguir traslados y saldos iniciales de un ingreso real (H09)
-- ============================================================================
-- Estadísticas sumaba como "ingreso del mes" todo movimiento extra_income. Pero
-- cuatro cosas se guardan así y NO son plata nueva:
--   1. Asignar Dinero libre a una categoría   (allocate_free_money_to_category)
--   2. Aumentar un gasto fijo desde Ahorro    (fund_fixed_expense_from_savings)
--   3. Convertir USD a Bs                     (convert_usd_savings_to_bs)
--   4. "Ahorro previo" / "Inversión previa"   (plata que ya tenías al empezar)
-- Mover plata propia aparecía como ingreso nuevo, y el lado de Ahorro de un
-- aumento aparecía como gasto.
--
-- Dos campos nuevos, en transactions, free_money_transactions y
-- usd_savings_transactions:
--   kind        'transfer'        un lado de un traslado entre cuentas propias
--               'opening_balance' saldo inicial (solo en transactions)
--               null              un movimiento normal (ingreso o gasto real)
--   transfer_id el MISMO uuid en los dos lados de un traslado, para poder
--               vincularlos (null si no es un traslado)
-- Estadísticas deja afuera de ingresos y gastos todo lo que tenga kind. Los
-- saldos de los pilares no cambian: un traslado SÍ mueve plata entre cuentas.
--
-- Datos viejos: los dos lados de un traslado hecho por esas funciones se
-- crearon dentro de una misma transacción, así que tienen EXACTAMENTE el mismo
-- created_at (now() no cambia dentro de una transacción) y montos opuestos.
-- Con eso se identifican con certeza y se marcan. Los saldos iniciales tienen
-- una descripción fija. Lo que no encaje exacto no se toca.
-- ============================================================================

alter table public.transactions
  add column if not exists kind text check (kind in ('transfer', 'opening_balance')),
  add column if not exists transfer_id uuid;

alter table public.free_money_transactions
  add column if not exists kind text check (kind in ('transfer')),
  add column if not exists transfer_id uuid;

alter table public.usd_savings_transactions
  add column if not exists kind text check (kind in ('transfer')),
  add column if not exists transfer_id uuid;

comment on column public.transactions.kind is
  'transfer = un lado de un traslado entre cuentas propias (no es ingreso ni gasto); opening_balance = saldo inicial que el usuario ya tenía; null = movimiento normal. Estadísticas excluye los que tienen kind.';
comment on column public.transactions.transfer_id is
  'Mismo uuid en los dos lados de un traslado (para vincularlos). Null si kind no es transfer.';

-- ----------------------------------------------------------------------------
-- Datos viejos
-- ----------------------------------------------------------------------------

-- 4. Saldos iniciales (descripción fija en registerPastAmount).
update public.transactions
  set kind = 'opening_balance'
  where type = 'extra_income'
    and kind is null
    and not is_allocation
    and description in ('Ahorro previo', 'Inversión previa');

-- 2. Ahorro -> Gasto: un gasto y un ingreso extra del MISMO usuario, mismo
--    created_at, montos opuestos y en pilares distintos. "materialized" para
--    que gen_random_uuid() se evalúe UNA vez por par (los dos lados reciben el
--    mismo id).
with pairs as materialized (
  select a.id as a_id, b.id as b_id, gen_random_uuid() as tid
  from public.transactions a
  join public.transactions b
    on b.user_id = a.user_id
   and b.created_at = a.created_at
   and b.amount = -a.amount
   and b.pillar_id <> a.pillar_id
  where a.type = 'expense' and a.amount < 0 and a.kind is null
    and b.type = 'extra_income' and b.kind is null and not b.is_allocation
    and a.debt_id is null and a.shared_debt_id is null
    and b.debtor_id is null and b.shared_debt_id is null
)
update public.transactions t
  set kind = 'transfer', transfer_id = p.tid
  from pairs p
  where t.id = p.a_id or t.id = p.b_id;

-- 1. Dinero libre -> categoría.
with pairs as materialized (
  select f.id as f_id, t.id as t_id, gen_random_uuid() as tid
  from public.free_money_transactions f
  join public.transactions t
    on t.user_id = f.user_id
   and t.created_at = f.created_at
   and t.amount = -f.amount
  where f.amount < 0 and f.credit_month is null and f.kind is null
    and t.type = 'extra_income' and t.kind is null and not t.is_allocation
),
upd_free as (
  update public.free_money_transactions fm
    set kind = 'transfer', transfer_id = p.tid
    from pairs p
    where fm.id = p.f_id
    returning fm.id
)
update public.transactions tr
  set kind = 'transfer', transfer_id = p.tid
  from pairs p
  where tr.id = p.t_id;

-- 3. USD -> Bs: el lado en USD tiene bs_amount = el monto del ingreso en Bs.
with pairs as materialized (
  select u.id as u_id, t.id as t_id, gen_random_uuid() as tid
  from public.usd_savings_transactions u
  join public.transactions t
    on t.user_id = u.user_id
   and t.created_at = u.created_at
   and t.amount = u.bs_amount
  where u.amount_usd < 0 and u.bs_amount is not null and u.kind is null
    and t.type = 'extra_income' and t.kind is null and not t.is_allocation
),
upd_usd as (
  update public.usd_savings_transactions us
    set kind = 'transfer', transfer_id = p.tid
    from pairs p
    where us.id = p.u_id
    returning us.id
)
update public.transactions tr
  set kind = 'transfer', transfer_id = p.tid
  from pairs p
  where tr.id = p.t_id;

-- ----------------------------------------------------------------------------
-- Funciones: de ahora en más marcan sus dos lados. La lógica es la misma que
-- en 0035; solo cambia que cada lado lleva kind = 'transfer' y el mismo
-- transfer_id.
-- ----------------------------------------------------------------------------

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
  v_transfer uuid := gen_random_uuid();
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

  insert into public.usd_savings_transactions (user_id, amount_usd, bs_amount, description, date, kind, transfer_id)
  values (v_caller, -p_amount_usd, p_bs_amount, p_description, v_date, 'transfer', v_transfer);

  insert into public.transactions (user_id, pillar_id, category_id, amount, type, description, date, kind, transfer_id)
  values (v_caller, v_category.pillar_id, v_category.id, p_bs_amount, 'extra_income', p_description, v_date, 'transfer', v_transfer);
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
  v_transfer uuid := gen_random_uuid();
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

  insert into public.free_money_transactions (user_id, amount, description, date, kind, transfer_id)
  values (v_caller, -p_amount, p_description, v_date, 'transfer', v_transfer);

  insert into public.transactions (user_id, pillar_id, category_id, amount, type, description, date, kind, transfer_id)
  values (v_caller, v_category.pillar_id, v_category.id, p_amount, 'extra_income', p_description, v_date, 'transfer', v_transfer);
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
  v_transfer uuid := gen_random_uuid();
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

  insert into public.transactions (user_id, pillar_id, category_id, amount, type, description, date, kind, transfer_id)
  values (
    v_caller, v_ahorro_category.pillar_id, v_ahorro_category.id, -p_amount, 'expense',
    coalesce(p_description, 'Transferido a ' || v_gasto_category.name), v_today, 'transfer', v_transfer
  );

  insert into public.transactions (user_id, pillar_id, category_id, amount, type, description, date, kind, transfer_id)
  values (
    v_caller, v_gasto_category.pillar_id, v_gasto_category.id, p_amount, 'extra_income',
    coalesce(p_description, 'Aumento puntual de este mes (desde Ahorro: ' || v_ahorro_category.name || ')'), v_today,
    'transfer', v_transfer
  );
end;
$$;

revoke all on function public.fund_fixed_expense_from_savings(uuid, uuid, numeric, text) from public;
grant execute on function public.fund_fixed_expense_from_savings(uuid, uuid, numeric, text) to authenticated;
