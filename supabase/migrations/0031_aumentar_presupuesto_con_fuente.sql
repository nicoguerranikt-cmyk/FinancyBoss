-- ============================================================================
-- FinancyBoss — "Aumentar presupuesto este mes" ahora pide de dónde sale
-- ============================================================================
-- Antes, bumpFixedExpenseThisMonth (app/(app)/mi-dinero/actions.ts) metía un
-- "ingreso extra" directo a la categoría de Gasto sin preguntar de dónde
-- salía esa plata ni validar que existiera en algún lado — fabricaba plata
-- de la nada, violando el principio central de la app.
--
-- Ahora hay 2 fuentes posibles, elegidas explícitamente por el usuario:
--   1. Disponible general (Dinero libre): ya existía una función para esto
--      — allocate_free_money_to_category (migración 0028) ya permite
--      cualquier categoría como destino, Gasto incluido. No hace falta una
--      función nueva: la action en TS la llama directo.
--   2. Un ahorro puntual: función nueva de acá, fund_fixed_expense_from_savings.
--      Mismo patrón atómico que confirm_shared_payment/convert_usd_savings_to_bs/
--      allocate_free_money_to_category: las dos escrituras (restar del
--      ahorro, sumar el ingreso en Gasto) quedan las dos o ninguna.
-- ============================================================================

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
  v_today date := current_date;
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
