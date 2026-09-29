-- ============================================================================
-- FinancyBoss — Pilares: montos fijos en vez de % del ingreso
-- ============================================================================
-- Decisión con el usuario: la distribución Ahorro/Gasto/Inversión deja de
-- ser un % del ingreso — a partir de acá cada pilar tiene un MONTO fijo en
-- Bs (igual criterio que ya tenían los gastos fijos de categoría, migración
-- 0018: vos decidís el monto, no un %, así que no se recalcula solo si
-- cambia el ingreso).
--
-- Reglas (confirmadas con el usuario):
--   - Lo que sobra del ingreso después de los 3 montos es "dinero libre"
--     (ver lib/dashboard.ts computeDashboard, campo freeMoney) — no hace
--     falta que sumen el ingreso completo.
--   - Los 3 montos NUNCA pueden sumar más que el ingreso — "no podés
--     fabricar dinero de la nada". Se valida en la aplicación (mismo
--     criterio que ya usa el resto del proyecto: reglas de negocio del lado
--     del server, no constraints de tabla — acá no se puede, además, porque
--     necesita sumar 3 filas contra profiles.base_income).
--   - Si el ingreso confirmado de un mes baja por debajo de lo que suman
--     los pilares, el dinero libre de ese mes queda en 0 (nunca negativo) —
--     es una situación a corregir por el usuario ajustando sus montos, no
--     algo que la app resuelva sola.
--
-- Las categorías DENTRO de Ahorro/Inversión siguen usando % como siempre
-- (categories.percentage no cambia) — este cambio es solo al nivel de los
-- 3 pilares.
-- ============================================================================

alter table public.pillars
  add column if not exists monthly_amount numeric(12,2) check (monthly_amount is null or monthly_amount >= 0);

-- Backfill: cada pilar existente pasa a un monto fijo equivalente a lo que
-- ya representaba su % contra el ingreso base actual del usuario.
update public.pillars p
set monthly_amount = round((pr.base_income * p.percentage) / 100, 2)
from public.profiles pr
where pr.id = p.user_id;

alter table public.pillars
  alter column monthly_amount set not null,
  drop column percentage;

comment on column public.pillars.monthly_amount is
  'Monto fijo en Bs que el usuario destina a este pilar cada mes — reemplaza al viejo %. No se recalcula solo si cambia el ingreso (mismo criterio que categories.fixed_amount, migración 0018); el usuario lo ajusta a mano desde Mi Dinero. La suma de los 3 pilares nunca puede superar profiles.base_income — se valida en la aplicación (ver app/(app)/mi-dinero/actions.ts).';

-- complete_onboarding(): mismo cuerpo que la versión de 0015, cambiando los
-- 3 parámetros de % a monto y la validación de "suman 100%" a "no superan
-- el ingreso". Postgres no deja renombrar parámetros con CREATE OR REPLACE
-- aunque el tipo no cambie (numeric -> numeric) — hay que dropear primero.
drop function if exists public.complete_onboarding(numeric, boolean, text, numeric, numeric, numeric, jsonb);

create or replace function public.complete_onboarding(
  p_income          numeric,
  p_auto_repeat     boolean,
  p_name            text,
  p_ahorro_amount   numeric,
  p_gasto_amount    numeric,
  p_inversion_amount numeric,
  -- Lista de categorías: [{"pillar":"gasto","name":"Comida"}, ...]
  p_categories      jsonb
)
returns void
language plpgsql
as $$
declare
  v_uid          uuid := auth.uid();
  v_name         text := nullif(trim(coalesce(p_name, '')), '');
  v_ahorro_id    uuid;
  v_gasto_id     uuid;
  v_inversion_id uuid;
  v_cat          jsonb;
  v_pillar_id    uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_income is null or p_income <= 0 then
    raise exception 'El ingreso debe ser mayor a 0';
  end if;

  if coalesce(p_ahorro_amount,0) < 0 or coalesce(p_gasto_amount,0) < 0 or coalesce(p_inversion_amount,0) < 0 then
    raise exception 'Los montos de los pilares no pueden ser negativos';
  end if;

  if coalesce(p_ahorro_amount,0) + coalesce(p_gasto_amount,0) + coalesce(p_inversion_amount,0) > p_income then
    raise exception 'Los pilares no pueden sumar más que tu ingreso';
  end if;

  -- Si por algún motivo no vino nombre, usamos un valor por defecto.
  if v_name is null then
    v_name := 'Usuario';
  end if;

  -- 1) Perfil (upsert: si ya existía, lo actualiza).
  insert into public.profiles (id, name, base_income, auto_repeat_income)
  values (v_uid, v_name, p_income, p_auto_repeat)
  on conflict (id) do update
    set name               = excluded.name,
        base_income        = excluded.base_income,
        auto_repeat_income = excluded.auto_repeat_income;

  -- 2) Los 3 pilares (upsert por (user_id, name)), guardando sus ids.
  insert into public.pillars (user_id, name, monthly_amount)
  values (v_uid, 'ahorro', p_ahorro_amount)
  on conflict (user_id, name) do update set monthly_amount = excluded.monthly_amount
  returning id into v_ahorro_id;

  insert into public.pillars (user_id, name, monthly_amount)
  values (v_uid, 'gasto', p_gasto_amount)
  on conflict (user_id, name) do update set monthly_amount = excluded.monthly_amount
  returning id into v_gasto_id;

  insert into public.pillars (user_id, name, monthly_amount)
  values (v_uid, 'inversion', p_inversion_amount)
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

  -- 4) Subcategorías sugeridas: solo si el usuario todavía no tiene ninguna
  --    categoría NO general (evita duplicados si el onboarding se reintenta).
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
        insert into public.categories (user_id, pillar_id, name)
        values (v_uid, v_pillar_id, trim(v_cat->>'name'));
      end if;
    end loop;
  end if;
end;
$$;
