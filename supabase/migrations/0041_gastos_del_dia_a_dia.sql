-- ============================================================================
-- FinancyBoss — Gastos del día a día: sin presupuesto, con origen elegido
-- ============================================================================
-- Modelo (decidido por el usuario):
--   - El pilar Gasto son SOLO los gastos fijos: su monto es la suma de ellos.
--   - Los gastos del día a día son categorías para registrar en qué se gasta.
--     No llevan monto ni presupuesto, y NO bajan el saldo de Gasto.
--   - Al registrar uno se elige de dónde sale la plata: Dinero libre o una
--     categoría de Ahorro. Si el origen no tiene suficiente, se rechaza ("no
--     se puede fabricar plata de la nada").
--   - "Puedes gastar hoy" sale del Dinero libre ÷ días restantes.
--
-- Cada gasto del día a día guarda DOS movimientos que comparten transfer_id:
--   - kind 'daily_spend': el gasto en su categoría de Gasto. Es el gasto real
--     (Estadísticas lo cuenta) pero no mueve el saldo del pilar Gasto.
--   - kind 'funding': el lado del origen (Dinero libre o Ahorro). Baja ese
--     saldo, pero no es un gasto aparte (Estadísticas lo deja afuera).
--
-- Además, complete_onboarding vuelve a la firma de 5 argumentos: ya no recibe
-- un monto de Gasto aparte (migración 0039), porque no hay "dinero para el día
-- a día" dentro de Gasto. Conserva la fecha de cobro de los gastos fijos
-- (migración 0040).
-- ============================================================================

-- 1. Los dos valores nuevos de kind.
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions
  add constraint transactions_kind_check
  check (kind in ('transfer', 'opening_balance', 'daily_spend', 'funding'));

alter table public.free_money_transactions drop constraint if exists free_money_transactions_kind_check;
alter table public.free_money_transactions
  add constraint free_money_transactions_kind_check
  check (kind in ('transfer', 'funding'));

comment on column public.transactions.kind is
  'transfer = un lado de un traslado entre cuentas propias; opening_balance = saldo inicial; daily_spend = gasto del día a día en su categoría de Gasto (gasto real, pero no baja el saldo del pilar Gasto); funding = el lado del origen de un gasto del día a día (baja Ahorro, no es un gasto aparte); null = movimiento normal.';

-- 2. Registrar un gasto del día a día.
--    p_category_id: categoría de Gasto del día a día (sin monto); null = sin categoría.
--    p_source: 'libre' (Dinero libre) o 'ahorro' (una categoría de Ahorro).
--    p_source_category_id: solo para 'ahorro'.
create or replace function public.register_daily_expense(
  p_category_id        uuid,
  p_amount             numeric,
  p_description        text,
  p_source             text,
  p_source_category_id uuid,
  p_date               date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller        uuid := auth.uid();
  v_date          date := coalesce(p_date, public.user_today());
  v_transfer      uuid := gen_random_uuid();
  v_gasto_pillar  uuid;
  v_category      record;
  v_source_cat    record;
  v_accumulated   numeric;
  v_committed     numeric;
  v_base_income   numeric;
  v_available     numeric;
  v_balance       numeric;
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;
  -- Mismo bloqueo por usuario que las demás funciones que gastan saldo: dos
  -- gastos simultáneos no leen el mismo saldo (migración 0038).
  perform pg_advisory_xact_lock(hashtextextended('financyboss:money:' || v_caller::text, 0));

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0.';
  end if;
  if p_source not in ('libre', 'ahorro') then
    raise exception 'Elige de dónde sale la plata.';
  end if;

  select id into v_gasto_pillar from public.pillars where user_id = v_caller and name = 'gasto';
  if v_gasto_pillar is null then
    raise exception 'No encontramos tu pilar de Gasto.';
  end if;

  if p_category_id is not null then
    select c.id, c.fixed_amount into v_category
      from public.categories c
      where c.id = p_category_id and c.user_id = v_caller
        and c.pillar_id = v_gasto_pillar and c.deleted_at is null;
    if v_category.id is null then
      raise exception 'Categoría inválida.';
    end if;
    if v_category.fixed_amount is not null then
      raise exception 'Esa categoría es un gasto fijo: se paga desde Mi Dinero, no como gasto del día a día.';
    end if;
  end if;

  if p_source = 'libre' then
    select coalesce(sum(amount), 0) into v_accumulated
      from public.free_money_transactions where user_id = v_caller;
    select coalesce(sum(monthly_amount), 0) into v_committed
      from public.pillars where user_id = v_caller;
    select base_income into v_base_income from public.profiles where id = v_caller;
    v_available := v_accumulated + greatest(0, coalesce(v_base_income, 0) - v_committed);
    if p_amount > v_available + 0.005 then
      raise exception 'Solo tienes % Bs de Dinero libre disponibles.', round(v_available, 2);
    end if;

    insert into public.free_money_transactions (user_id, amount, description, date, kind, transfer_id)
    values (v_caller, -p_amount, p_description, v_date, 'funding', v_transfer);
  else
    select c.id, c.pillar_id into v_source_cat
      from public.categories c
      join public.pillars p on p.id = c.pillar_id
      where c.id = p_source_category_id and c.user_id = v_caller
        and c.deleted_at is null and p.name = 'ahorro';
    if v_source_cat.id is null then
      raise exception 'Elige una categoría de Ahorro.';
    end if;
    select coalesce(sum(amount), 0) into v_balance
      from public.transactions where category_id = v_source_cat.id and user_id = v_caller;
    if p_amount > v_balance + 0.005 then
      raise exception 'Esa categoría de Ahorro solo tiene % Bs disponibles.', round(v_balance, 2);
    end if;

    insert into public.transactions (user_id, pillar_id, category_id, amount, type, description, date, kind, transfer_id)
    values (v_caller, v_source_cat.pillar_id, v_source_cat.id, -p_amount, 'expense', p_description, v_date, 'funding', v_transfer);
  end if;

  -- El gasto en su categoría de Gasto del día a día.
  insert into public.transactions (user_id, pillar_id, category_id, amount, type, description, date, kind, transfer_id)
  values (v_caller, v_gasto_pillar, p_category_id, -p_amount, 'expense', p_description, v_date, 'daily_spend', v_transfer);
end;
$$;

revoke all on function public.register_daily_expense(uuid, numeric, text, text, uuid, date) from public;
grant execute on function public.register_daily_expense(uuid, numeric, text, text, uuid, date) to authenticated;

-- 3. complete_onboarding: vuelve a 5 argumentos (sin monto de Gasto aparte).
drop function if exists public.complete_onboarding(numeric, boolean, text, jsonb, text, numeric);

create or replace function public.complete_onboarding(
  p_income      numeric,
  p_auto_repeat boolean,
  p_name        text,
  -- [{"pillar":"gasto","name":"Alquiler","amount":800,"start_date":"2026-10-05"}, ...]
  -- amount: monto fijo (en Gasto, eso es un gasto fijo; sin monto = categoría del día a día).
  -- start_date: fecha de cobro de un gasto fijo (solo Gasto con monto).
  p_categories  jsonb,
  p_username    text default null
)
returns void
language plpgsql
as $$
declare
  v_uid              uuid := auth.uid();
  v_name             text := nullif(trim(coalesce(p_name, '')), '');
  v_username         text := nullif(trim(lower(coalesce(p_username, ''))), '');
  v_ahorro_amount    numeric := 0;
  v_gasto_amount     numeric := 0;
  v_inversion_amount numeric := 0;
  v_ahorro_id        uuid;
  v_gasto_id         uuid;
  v_inversion_id     uuid;
  v_cat              jsonb;
  v_cat_amount       numeric;
  v_pillar_id        uuid;
  v_start_date       date;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_income is null or p_income <= 0 then
    raise exception 'El ingreso debe ser mayor a 0';
  end if;

  -- El monto de cada pilar sale de sumar el de sus categorías. En Gasto son
  -- solo los gastos fijos: las categorías del día a día no llevan monto.
  for v_cat in select * from jsonb_array_elements(p_categories)
  loop
    v_cat_amount := greatest(0, coalesce((v_cat->>'amount')::numeric, 0));
    case v_cat->>'pillar'
      when 'ahorro'    then v_ahorro_amount    := v_ahorro_amount + v_cat_amount;
      when 'gasto'     then v_gasto_amount     := v_gasto_amount + v_cat_amount;
      when 'inversion' then v_inversion_amount := v_inversion_amount + v_cat_amount;
      else null;
    end case;
  end loop;

  if v_ahorro_amount + v_gasto_amount + v_inversion_amount > p_income then
    raise exception 'Las categorías no pueden sumar más que tu ingreso';
  end if;

  if v_name is null then
    v_name := 'Usuario';
  end if;

  begin
    insert into public.profiles (id, name, base_income, auto_repeat_income, username)
    values (v_uid, v_name, p_income, p_auto_repeat, v_username)
    on conflict (id) do update
      set name               = excluded.name,
          base_income        = excluded.base_income,
          auto_repeat_income = excluded.auto_repeat_income,
          username           = coalesce(excluded.username, public.profiles.username);
  exception when unique_violation then
    insert into public.profiles (id, name, base_income, auto_repeat_income)
    values (v_uid, v_name, p_income, p_auto_repeat)
    on conflict (id) do update
      set name               = excluded.name,
          base_income        = excluded.base_income,
          auto_repeat_income = excluded.auto_repeat_income;
  end;

  insert into public.pillars (user_id, name, monthly_amount)
  values (v_uid, 'ahorro', v_ahorro_amount)
  on conflict (user_id, name) do update set monthly_amount = excluded.monthly_amount
  returning id into v_ahorro_id;

  insert into public.pillars (user_id, name, monthly_amount)
  values (v_uid, 'gasto', v_gasto_amount)
  on conflict (user_id, name) do update set monthly_amount = excluded.monthly_amount
  returning id into v_gasto_id;

  insert into public.pillars (user_id, name, monthly_amount)
  values (v_uid, 'inversion', v_inversion_amount)
  on conflict (user_id, name) do update set monthly_amount = excluded.monthly_amount
  returning id into v_inversion_id;

  if not exists (select 1 from public.categories where user_id = v_uid and is_general) then
    insert into public.categories (user_id, pillar_id, name, is_general) values
      (v_uid, v_ahorro_id, 'Ahorro general', true),
      (v_uid, v_gasto_id, 'Gasto general', true),
      (v_uid, v_inversion_id, 'Inversión general', true);
  end if;

  if not exists (select 1 from public.categories where user_id = v_uid and not is_general) then
    for v_cat in select * from jsonb_array_elements(p_categories)
    loop
      v_pillar_id := case v_cat->>'pillar'
        when 'ahorro'    then v_ahorro_id
        when 'gasto'     then v_gasto_id
        when 'inversion' then v_inversion_id
        else null
      end;

      if v_pillar_id is not null and length(trim(coalesce(v_cat->>'name',''))) > 0 then
        v_cat_amount := greatest(0, coalesce((v_cat->>'amount')::numeric, 0));
        v_start_date := null;
        if v_cat->>'pillar' = 'gasto' and v_cat_amount > 0 then
          v_start_date := nullif(v_cat->>'start_date', '')::date;
        end if;

        if v_start_date is not null then
          -- Gasto fijo programado: primera cuota en la fecha elegida, cada mes.
          -- La app avisa cuando llega y el usuario confirma ("Ya lo pagué").
          insert into public.categories
            (user_id, pillar_id, name, fixed_amount, auto_repeat,
             fixed_start_date, fixed_interval_unit, fixed_interval_count)
          values
            (v_uid, v_pillar_id, trim(v_cat->>'name'), v_cat_amount, true,
             v_start_date, 'month', 1);
        else
          insert into public.categories (user_id, pillar_id, name, fixed_amount)
          values (v_uid, v_pillar_id, trim(v_cat->>'name'), nullif(v_cat_amount, 0));
        end if;
      end if;
    end loop;
  end if;
end;
$$;
