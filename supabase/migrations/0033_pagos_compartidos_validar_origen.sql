-- ============================================================================
-- FinancyBoss — Pagos compartidos: validar el ORIGEN también en la base (H13)
--                y no confundir un aporte de Ahorro con un gasto fijo (H12)
-- ============================================================================
-- H13. La app valida, al proponer un pago, que el pilar/categoría de origen
-- sean del deudor (lib/pillarSource.ts). Pero RLS y confirm_shared_payment no:
--   - la política INSERT de shared_debt_payments solo miraba que el
--     proponente fuera el deudor de la deuda, no que proposer_pillar_id y
--     proposer_category_id fueran suyos; una llamada directa a la API podía
--     guardar el pilar o la categoría de OTRA persona;
--   - confirm_shared_payment revalidaba solo el lado del acreedor y después
--     escribía la transacción del deudor con esas referencias sin repetir la
--     comprobación — un gasto de un usuario apuntando a un pilar ajeno.
-- RLS limita filas, no garantiza las reglas del negocio: se repiten acá, en
-- las dos puertas (al insertar y al confirmar).
--
-- H12. Desde la migración 0023 TODA categoría puede tener fixed_amount: en
-- Ahorro/Inversión es el aporte mensual, no un gasto fijo. La función seguía
-- rechazando cualquier categoría con fixed_amount, dejando inservible como
-- destino a una categoría de Ahorro con aporte mensual. Ahora solo se
-- rechaza si la categoría es de Gasto (mismo criterio que lib/fixedExpense.ts
-- isFixedExpenseCategory).
-- ============================================================================

-- 1. INSERT: el origen tiene que ser del proponente.
drop policy if exists "shared_debt_payments_insert" on public.shared_debt_payments;
create policy "shared_debt_payments_insert" on public.shared_debt_payments
  for insert with check (
    auth.uid() = proposer_user_id
    and status = 'pending'
    and confirmer_pillar_id is null
    and confirmer_category_id is null
    and resolved_at is null
    and exists (
      select 1 from public.shared_debts sd
      where sd.id = shared_debt_id and sd.status = 'active' and sd.debtor_user_id = auth.uid()
    )
    and exists (
      select 1 from public.pillars p
      where p.id = proposer_pillar_id and p.user_id = auth.uid()
    )
    and (
      proposer_category_id is null
      or exists (
        select 1 from public.categories c
        where c.id = proposer_category_id
          and c.user_id = auth.uid()
          and c.pillar_id = proposer_pillar_id
          and c.deleted_at is null
      )
    )
  );

-- 2. CONFIRMAR: se revalidan los dos lados, y el aporte de Ahorro/Inversión
--    deja de tratarse como gasto fijo.
create or replace function public.confirm_shared_payment(
  p_payment_id uuid,
  p_confirmer_pillar_id uuid,
  p_confirmer_category_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_payment record;
  v_debt record;
  v_pillar record;
  v_category record;
  v_new_remaining numeric(12,2);
  v_new_status text;
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;

  select * into v_payment from public.shared_debt_payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Pago inválido.';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Este pago ya fue resuelto.';
  end if;

  select * into v_debt from public.shared_debts where id = v_payment.shared_debt_id for update;
  if v_debt.id is null or v_debt.status <> 'active' then
    raise exception 'Deuda vinculada inválida.';
  end if;
  if v_caller <> v_debt.creditor_user_id then
    raise exception 'Solo quien recibe el pago puede confirmarlo.';
  end if;
  if v_payment.amount > v_debt.remaining_amount + 0.005 then
    raise exception 'El pago supera el saldo pendiente de la deuda.';
  end if;

  -- Revalidación del PROPONENTE (deudor): el origen guardado en la propuesta
  -- tiene que seguir siendo suyo y coherente. Nunca se confía en lo que quedó
  -- guardado al proponer.
  if not exists (
    select 1 from public.pillars where id = v_payment.proposer_pillar_id and user_id = v_debt.debtor_user_id
  ) then
    raise exception 'El pilar de origen del pago ya no es válido. Recházalo y pide que lo propongan de nuevo.';
  end if;
  if v_payment.proposer_category_id is not null and not exists (
    select 1 from public.categories
      where id = v_payment.proposer_category_id
        and user_id = v_debt.debtor_user_id
        and pillar_id = v_payment.proposer_pillar_id
        and deleted_at is null
  ) then
    raise exception 'La categoría de origen del pago ya no es válida. Recházalo y pide que lo propongan de nuevo.';
  end if;

  -- Revalidación del CONFIRMADOR (acreedor) — mismas reglas que
  -- lib/pillarSource.ts (nunca confiar solo en la validación de la action).
  select * into v_pillar from public.pillars
    where id = p_confirmer_pillar_id and user_id = v_debt.creditor_user_id;
  if v_pillar.id is null then
    raise exception 'Pilar inválido.';
  end if;
  if p_confirmer_category_id is not null then
    select * into v_category from public.categories
      where id = p_confirmer_category_id
        and user_id = v_debt.creditor_user_id
        and pillar_id = p_confirmer_pillar_id
        and deleted_at is null;
    if v_category.id is null then
      raise exception 'Categoría inválida.';
    end if;
    -- Solo un gasto fijo de Gasto se rechaza: en Ahorro/Inversión fixed_amount
    -- es el aporte mensual (migración 0023), no un gasto programado.
    if v_pillar.name = 'gasto' and v_category.fixed_amount is not null then
      raise exception 'Esa categoría es un gasto fijo — elige otra o déjala sin categoría.';
    end if;
  end if;

  perform set_config('financyboss.internal_write', 'on', true); -- true = solo dura esta transacción

  v_new_remaining := round(greatest(v_debt.remaining_amount - v_payment.amount, 0)::numeric, 2);
  v_new_status := case when v_new_remaining <= 0.005 then 'paid' else 'active' end;
  if v_new_status = 'paid' then
    v_new_remaining := 0;
  end if;

  insert into public.transactions (user_id, pillar_id, category_id, shared_debt_id, amount, type, description, date)
  values (
    v_debt.debtor_user_id, v_payment.proposer_pillar_id, v_payment.proposer_category_id,
    v_debt.id, -v_payment.amount, 'expense', null, p_date
  );

  insert into public.transactions (user_id, pillar_id, category_id, shared_debt_id, amount, type, description, date)
  values (
    v_debt.creditor_user_id, p_confirmer_pillar_id, p_confirmer_category_id,
    v_debt.id, v_payment.amount, 'extra_income', null, p_date
  );

  update public.shared_debts set remaining_amount = v_new_remaining, status = v_new_status where id = v_debt.id;

  update public.shared_debt_payments
    set status = 'confirmed', confirmer_pillar_id = p_confirmer_pillar_id, confirmer_category_id = p_confirmer_category_id
    where id = v_payment.id;
end;
$$;

revoke all on function public.confirm_shared_payment(uuid, uuid, uuid, date) from public;
grant execute on function public.confirm_shared_payment(uuid, uuid, uuid, date) to authenticated;
