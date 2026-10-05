-- ============================================================================
-- FinancyBoss — Asignar Dinero libre a una categoría
-- ============================================================================
-- Mismo patrón que convert_usd_savings_to_bs (migración 0027), pero al
-- revés: el origen es el pozo de Dinero libre (no un pozo en USD) y el
-- destino puede ser CUALQUIER categoría — Ahorro, Gasto o Inversión (la
-- conversión de USD solo dejaba elegir Ahorro; acá no hay esa restricción,
-- Dinero libre es plata sin destino, puede ir a cualquier lado).
--
-- Por qué una función de Postgres y no dos inserts sueltos desde la action:
-- las dos escrituras (restar del pozo, sumar el ingreso en la categoría)
-- tienen que quedar las dos o ninguna — mismo criterio que
-- confirm_shared_payment y convert_usd_savings_to_bs.
--
-- Disponible = lo ya acreditado en free_money_transactions (meses cerrados
-- + movimientos a mano) MÁS lo que sobra del mes en curso todavía sin
-- cerrar (ingreso - montos de pilares) — mismo cálculo que ya se usa para
-- MOSTRAR el total en el Dashboard/Mi Dinero/mi-dinero/libre (ver
-- app/(app)/page.tsx), para que lo que se puede asignar coincida con lo que
-- el usuario ve en pantalla.
-- ============================================================================

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
  v_date date := coalesce(p_date, current_date);
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
    raise exception 'Solo tenés % Bs de Dinero libre disponibles.', round(v_available, 2);
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
