-- ============================================================================
-- FinancyBoss — Onboarding: fecha de cobro de cada gasto fijo
-- ============================================================================
-- En el paso "Gastos fijos" del onboarding, cada gasto fijo con monto puede
-- llevar una fecha de cobro. Si la trae, la categoría queda programada igual
-- que si el usuario la hubiera configurado después en la propia categoría:
--   auto_repeat = true, primera fecha = la elegida, cada 1 mes.
-- Cuando llega la fecha la app avisa ("Tienes 1 gasto fijo pendiente de
-- confirmar") y el usuario confirma con "Ya lo pagué": nunca se descuenta solo.
--
-- fixed_reserve_ahead = false a propósito: el presupuesto diario no baja hasta
-- que de verdad toca esa cuota (decisión del usuario). La columna nace en true
-- (migración 0018), así que hay que indicarlo. Se puede cambiar después, por
-- gasto, en la configuración de la categoría.
--
-- Es la misma firma de complete_onboarding que dejó 0039: create or replace
-- alcanza (no se crea una versión nueva ni queda una vieja).
-- Cada categoría del JSON puede traer "start_date": "YYYY-MM-DD" (solo se usa
-- en categorías de Gasto con monto).
-- ============================================================================

create or replace function public.complete_onboarding(
  p_income        numeric,
  p_auto_repeat   boolean,
  p_name          text,
  -- [{"pillar":"gasto","name":"Alquiler","amount":800,"start_date":"2026-10-05"}, ...]
  p_categories    jsonb,
  p_username      text default null,
  -- Monto mensual del pilar Gasto (null = la suma de sus categorías).
  p_gasto_amount  numeric default null
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

  -- El monto de cada pilar sale de sumar el de sus categorías...
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

  -- ...salvo Gasto, cuyo monto puede venir aparte (los fijos salen de él).
  if p_gasto_amount is not null then
    if p_gasto_amount < v_gasto_amount then
      raise exception 'El monto de Gasto no puede ser menor que la suma de tus gastos fijos';
    end if;
    v_gasto_amount := p_gasto_amount;
  end if;

  if v_ahorro_amount + v_gasto_amount + v_inversion_amount > p_income then
    raise exception 'Las categorías no pueden sumar más que tu ingreso';
  end if;

  -- Si por algún motivo no vino nombre, usamos un valor por defecto.
  if v_name is null then
    v_name := 'Usuario';
  end if;

  -- 1) Perfil (upsert: si ya existía, lo actualiza). Si el username llegó
  --    ocupado por una carrera rarísima, reintentamos sin él en vez de
  --    frenar todo el onboarding.
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

  -- 2) Los 3 pilares (upsert por (user_id, name)), con el monto calculado
  --    arriba, guardando sus ids.
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

  -- 3) Las 3 categorías "general" (el balde de cada pilar), solo si el
  --    usuario todavía no tiene una (evita duplicados si se reintenta).
  if not exists (select 1 from public.categories where user_id = v_uid and is_general) then
    insert into public.categories (user_id, pillar_id, name, is_general) values
      (v_uid, v_ahorro_id, 'Ahorro general', true),
      (v_uid, v_gasto_id, 'Gasto general', true),
      (v_uid, v_inversion_id, 'Inversión general', true);
  end if;

  -- 4) Las categorías que el usuario armó, con su monto fijo si le puso uno
  --    (null si no — queda como categoría variable / del día a día). Solo si
  --    todavía no tiene ninguna categoría NO general (evita duplicados si el
  --    onboarding se reintenta).
  if not exists (select 1 from public.categories where user_id = v_uid and not is_general) then
    for v_cat in select * from jsonb_array_elements(p_categories)
    loop
      v_pillar_id := case v_cat->>'pillar'
        when 'ahorro'    then v_ahorro_id
        when 'gasto'     then v_gasto_id
        when 'inversion' then v_inversion_id
        else null
      end;

      -- Ignoramos nombres vacíos o pilares desconocidos.
      if v_pillar_id is not null and length(trim(coalesce(v_cat->>'name',''))) > 0 then
        v_cat_amount := greatest(0, coalesce((v_cat->>'amount')::numeric, 0));
        v_start_date := null;
        -- La fecha de cobro solo aplica a un gasto fijo (Gasto con monto).
        if v_cat->>'pillar' = 'gasto' and v_cat_amount > 0 then
          v_start_date := nullif(v_cat->>'start_date', '')::date;
        end if;

        if v_start_date is not null then
          insert into public.categories
            (user_id, pillar_id, name, fixed_amount, auto_repeat,
             fixed_start_date, fixed_interval_unit, fixed_interval_count, fixed_reserve_ahead)
          values
            (v_uid, v_pillar_id, trim(v_cat->>'name'), v_cat_amount, true,
             v_start_date, 'month', 1, false);
        else
          insert into public.categories (user_id, pillar_id, name, fixed_amount)
          values (v_uid, v_pillar_id, trim(v_cat->>'name'), nullif(v_cat_amount, 0));
        end if;
      end if;
    end loop;
  end if;
end;
$$;
