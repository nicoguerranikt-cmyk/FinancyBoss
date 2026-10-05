-- ============================================================================
-- FinancyBoss — Ahorro en USD (fase 1: un solo pozo, conversión manual)
-- ============================================================================
-- Primer paso hacia multi-moneda, a propósito acotado: NO es un pilar nuevo
-- ni currency por categoría — es un solo pozo en dólares, que vive dentro de
-- la pantalla de Ahorro. El usuario:
--   - Deposita USD (ahorra en esa moneda, sin tocar nada de Bs).
--   - Convierte a Bs cuando quiere: dice cuántos USD saca y a cuántos Bs
--     equivalen HOY (tipo de cambio manual, nunca automático — en Bolivia
--     varía día a día y no hay una fuente única confiable) — con destino a
--     una categoría de Ahorro puntual.
--
-- La conversión escribe DOS cosas: resta del pozo en USD (esta tabla) y
-- suma un ingreso normal en Bs a la categoría elegida (transactions) — nunca
-- "fabrica" plata, todo mismo criterio de contabilidad real que el resto
-- del proyecto.
-- ============================================================================

create table if not exists public.usd_savings_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Positivo = depósito en USD. Negativo = conversión a Bs (bs_amount tiene
  -- cuánto se declaró en ese momento).
  amount_usd   numeric(12,2) not null,
  bs_amount    numeric(12,2),
  description  text,
  date         date not null default current_date,
  created_at   timestamptz not null default now()
);

comment on table public.usd_savings_transactions is
  'Ahorro en USD (fase 1, migración 0027): un solo pozo en dólares por usuario, sin categorías propias. amount_usd positivo = depósito; negativo = conversión a Bs (bs_amount = cuánto se declaró manualmente en ese momento, va como ingreso a una categoría de Ahorro vía transactions — ver app/(app)/mi-dinero/[pillarId]/usd/actions.ts).';

create index if not exists usd_savings_transactions_user_date_idx
  on public.usd_savings_transactions (user_id, date);

alter table public.usd_savings_transactions enable row level security;

create policy "usd_savings_transactions_owner_all" on public.usd_savings_transactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Convertir USD -> Bs escribe DOS filas (resta del pozo en USD, suma un
-- ingreso en Bs) — tienen que quedar las dos o ninguna. Una función de
-- Postgres corre en una sola transacción, mismo criterio que ya usa
-- confirm_shared_payment (migración 0012) para el mismo tipo de problema.
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
  v_date date := coalesce(p_date, current_date);
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
    raise exception 'Solo tenés % USD ahorrados.', round(v_balance, 2);
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
    raise exception 'Elegí una categoría de Ahorro como destino.';
  end if;

  insert into public.usd_savings_transactions (user_id, amount_usd, bs_amount, description, date)
  values (v_caller, -p_amount_usd, p_bs_amount, p_description, v_date);

  insert into public.transactions (user_id, pillar_id, category_id, amount, type, description, date)
  values (v_caller, v_category.pillar_id, v_category.id, p_bs_amount, 'extra_income', p_description, v_date);
end;
$$;

revoke all on function public.convert_usd_savings_to_bs(numeric, numeric, uuid, text, date) from public;
grant execute on function public.convert_usd_savings_to_bs(numeric, numeric, uuid, text, date) to authenticated;
