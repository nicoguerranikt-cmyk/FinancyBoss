-- ============================================================================
-- FinancyBoss — Operaciones atómicas y sin carreras (H06 y H07)
-- ============================================================================
-- H07. Varias operaciones hacían dos escrituras en pedidos separados:
--   - pagar una deuda:  insertar el movimiento, DESPUÉS bajar remaining_amount
--   - cobrar a un deudor: igual
--   - cerrar un mes: guardar monthly_budgets, DESPUÉS acreditar el sobrante
-- Si fallaba el segundo paso, quedaba un pago sin descontar de la deuda (y
-- reintentar lo duplicaba), o un mes cerrado sin su sobrante (y el siguiente
-- cierre ya no lo recuperaba). Ahora cada operación completa corre en UNA
-- función de Postgres: se completa entera o no se hace nada. Mismo patrón que
-- confirm_shared_payment.
--
-- H06. Dos pedidos simultáneos podían usar el mismo saldo: los dos calculaban
-- "hay 100", los dos aprobaban 80 y quedaba -60. Y la primera carga del mes en
-- dos pestañas podía generar el reparto mensual dos veces ("consultar si
-- existe" y después "insertar" no son atómicos). La solución es un bloqueo por
-- usuario (pg_advisory_xact_lock): una segunda operación del mismo usuario
-- espera a que termine la primera y recién entonces mira el saldo. El bloqueo
-- se suelta solo al terminar la transacción.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Pagar una deuda local (también la cuota del plan automático)
-- ----------------------------------------------------------------------------
-- p_dedupe_since: solo para "Ya la pagué" del plan automático. Si ya hay un
-- pago de esa deuda con fecha >= esa, se rechaza. Se comprueba DENTRO de la
-- función, con la deuda bloqueada, así un doble clic no registra dos cuotas.
create or replace function public.register_debt_payment(
  p_debt_id uuid,
  p_amount numeric,
  p_pillar_id uuid,
  p_category_id uuid,
  p_date date,
  p_dedupe_since date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_debt record;
  v_pillar record;
  v_category record;
  v_new_remaining numeric(12,2);
  v_new_status text;
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0.';
  end if;

  -- for update: dos pagos simultáneos de la misma deuda se atienden de a uno.
  select * into v_debt from public.debts where id = p_debt_id and user_id = v_caller for update;
  if v_debt.id is null then
    raise exception 'Deuda inválida.';
  end if;
  if v_debt.status = 'paid' then
    raise exception 'Esta deuda ya está saldada.';
  end if;
  if v_debt.status = 'archived' then
    raise exception 'Esta deuda está archivada.';
  end if;
  if p_amount > v_debt.remaining_amount + 0.005 then
    raise exception 'El pago no puede ser mayor al saldo pendiente.';
  end if;

  if p_dedupe_since is not null and exists (
    select 1 from public.transactions
      where debt_id = v_debt.id and user_id = v_caller and date >= p_dedupe_since
  ) then
    raise exception 'Ya confirmaste esta cuota.';
  end if;

  -- De dónde sale la plata: tiene que ser del usuario (mismas reglas que
  -- lib/pillarSource.ts).
  select * into v_pillar from public.pillars where id = p_pillar_id and user_id = v_caller;
  if v_pillar.id is null then
    raise exception 'Pilar inválido.';
  end if;
  if p_category_id is not null then
    select * into v_category from public.categories
      where id = p_category_id and user_id = v_caller and pillar_id = p_pillar_id and deleted_at is null;
    if v_category.id is null then
      raise exception 'Categoría inválida.';
    end if;
    if v_pillar.name = 'gasto' and v_category.fixed_amount is not null then
      raise exception 'Esa categoría es un gasto fijo — elige otra o déjala sin categoría.';
    end if;
  end if;

  v_new_remaining := round(greatest(v_debt.remaining_amount - p_amount, 0)::numeric, 2);
  v_new_status := case when v_new_remaining <= 0.005 then 'paid' else 'active' end;
  if v_new_status = 'paid' then
    v_new_remaining := 0;
  end if;

  insert into public.transactions (user_id, pillar_id, category_id, debt_id, amount, type, description, date)
  values (v_caller, p_pillar_id, p_category_id, v_debt.id, -p_amount, 'expense', null,
          coalesce(p_date, public.user_today()));

  update public.debts set remaining_amount = v_new_remaining, status = v_new_status where id = v_debt.id;
end;
$$;

revoke all on function public.register_debt_payment(uuid, numeric, uuid, uuid, date, date) from public;
grant execute on function public.register_debt_payment(uuid, numeric, uuid, uuid, date, date) to authenticated;

-- ----------------------------------------------------------------------------
-- Cobrar a un deudor local
-- ----------------------------------------------------------------------------
create or replace function public.register_debtor_collection(
  p_debtor_id uuid,
  p_amount numeric,
  p_pillar_id uuid,
  p_category_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_debtor record;
  v_pillar record;
  v_category record;
  v_new_remaining numeric(12,2);
  v_new_status text;
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0.';
  end if;

  select * into v_debtor from public.debtors where id = p_debtor_id and user_id = v_caller for update;
  if v_debtor.id is null then
    raise exception 'Deudor inválido.';
  end if;
  if v_debtor.status <> 'pending' then
    raise exception 'Este registro ya no está pendiente.';
  end if;
  if p_amount > v_debtor.remaining_amount + 0.005 then
    raise exception 'El cobro no puede ser mayor al saldo pendiente.';
  end if;

  select * into v_pillar from public.pillars where id = p_pillar_id and user_id = v_caller;
  if v_pillar.id is null then
    raise exception 'Pilar inválido.';
  end if;
  if p_category_id is not null then
    select * into v_category from public.categories
      where id = p_category_id and user_id = v_caller and pillar_id = p_pillar_id and deleted_at is null;
    if v_category.id is null then
      raise exception 'Categoría inválida.';
    end if;
    if v_pillar.name = 'gasto' and v_category.fixed_amount is not null then
      raise exception 'Esa categoría es un gasto fijo — elige otra o déjala sin categoría.';
    end if;
  end if;

  v_new_remaining := round(greatest(v_debtor.remaining_amount - p_amount, 0)::numeric, 2);
  v_new_status := case when v_new_remaining <= 0.005 then 'paid' else 'pending' end;
  if v_new_status = 'paid' then
    v_new_remaining := 0;
  end if;

  insert into public.transactions (user_id, pillar_id, category_id, debtor_id, amount, type, description, date)
  values (v_caller, p_pillar_id, p_category_id, v_debtor.id, p_amount, 'extra_income', null,
          coalesce(p_date, public.user_today()));

  update public.debtors set remaining_amount = v_new_remaining, status = v_new_status where id = v_debtor.id;
end;
$$;

revoke all on function public.register_debtor_collection(uuid, numeric, uuid, uuid, date) from public;
grant execute on function public.register_debtor_collection(uuid, numeric, uuid, uuid, date) to authenticated;

-- ----------------------------------------------------------------------------
-- Cierre de mes: el resumen de los pilares y el sobrante a Dinero libre, juntos
-- ----------------------------------------------------------------------------
-- p_rows: [{pillar_id, budgeted_amount, carried_over, spent_amount}, ...]
-- Es idempotente: si otra carga de página ya cerró ese mes, no duplica nada
-- (los índices únicos de monthly_budgets y free_money_transactions deciden).
create or replace function public.save_month_close(
  p_year integer,
  p_month integer,
  p_income numeric,
  p_rows jsonb,
  p_free_money numeric,
  p_end date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;

  -- Un cierre a la vez por usuario.
  perform pg_advisory_xact_lock(hashtextextended('financyboss:close:' || v_caller::text, 0));

  insert into public.monthly_budgets
    (user_id, pillar_id, category_id, month, year, budgeted_amount, carried_over, spent_amount, income_amount)
  select v_caller, r.pillar_id, null, p_month, p_year,
         r.budgeted_amount, r.carried_over, r.spent_amount, p_income
    from jsonb_to_recordset(p_rows) as r(pillar_id uuid, budgeted_amount numeric, carried_over numeric, spent_amount numeric)
    join public.pillars p on p.id = r.pillar_id and p.user_id = v_caller
  on conflict (user_id, pillar_id, month, year) where category_id is null do nothing;

  if p_free_money is not null and p_free_money > 0 then
    insert into public.free_money_transactions (user_id, amount, description, date, credit_month, credit_year)
    values (v_caller, p_free_money, 'Sobrante del mes', p_end, p_month, p_year)
    on conflict (user_id, credit_year, credit_month) where credit_month is not null do nothing;
  end if;
end;
$$;

revoke all on function public.save_month_close(integer, integer, numeric, jsonb, numeric, date) from public;
grant execute on function public.save_month_close(integer, integer, numeric, jsonb, numeric, date) to authenticated;

-- ----------------------------------------------------------------------------
-- Reparto mensual: generarlo UNA sola vez aunque lleguen dos pedidos a la vez
-- ----------------------------------------------------------------------------
-- p_rows: [{pillar_id, category_id, amount}, ...]. La app calcula los montos
-- (lib/monthlyAllocation.ts); acá se comprueba y se guarda bajo bloqueo.
create or replace function public.ensure_monthly_allocation(
  p_rows jsonb,
  p_month_start date,
  p_month_end date,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;

  -- El segundo pedido espera acá; cuando entra, el reparto ya existe y sale.
  perform pg_advisory_xact_lock(hashtextextended('financyboss:alloc:' || v_caller::text, 0));

  if exists (
    select 1 from public.transactions
      where user_id = v_caller and is_allocation and date between p_month_start and p_month_end
  ) then
    return;
  end if;

  insert into public.transactions (user_id, pillar_id, category_id, amount, type, is_allocation, description, date)
  select v_caller, r.pillar_id, r.category_id, r.amount, 'extra_income', true, null, p_date
    from jsonb_to_recordset(p_rows) as r(pillar_id uuid, category_id uuid, amount numeric)
    join public.categories c on c.id = r.category_id and c.user_id = v_caller and c.pillar_id = r.pillar_id
    where r.amount > 0;
end;
$$;

revoke all on function public.ensure_monthly_allocation(jsonb, date, date, date) from public;
grant execute on function public.ensure_monthly_allocation(jsonb, date, date, date) to authenticated;

-- ----------------------------------------------------------------------------
-- Funciones que gastan el mismo saldo: ahora se atienden de a una por usuario
-- ----------------------------------------------------------------------------
-- La lógica es la de la migración 0037; lo único nuevo es el bloqueo del
-- principio (pg_advisory_xact_lock), que hace que dos operaciones
-- simultáneas del mismo usuario no lean el mismo saldo.

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
  perform pg_advisory_xact_lock(hashtextextended('financyboss:money:' || v_caller::text, 0));
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
  perform pg_advisory_xact_lock(hashtextextended('financyboss:money:' || v_caller::text, 0));
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
  perform pg_advisory_xact_lock(hashtextextended('financyboss:money:' || v_caller::text, 0));
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
