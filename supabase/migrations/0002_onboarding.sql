-- ============================================================================
-- FinancyBoss — Función de onboarding (Fase 1 MVP)
-- ============================================================================
-- complete_onboarding() guarda TODO el onboarding en una sola transacción:
--   * el perfil (profiles)
--   * los 3 pilares con sus % (pillars)
--   * las subcategorías elegidas (categories)
--
-- Al ser una función de plpgsql, todo corre dentro de una misma transacción:
-- si cualquier paso falla, se revierte todo. Así nunca quedan datos a medias.
--
-- Seguridad: NO usa "security definer", así que corre con los permisos del
-- usuario que la llama y respeta el RLS. Toma el id del usuario con auth.uid(),
-- por lo que un usuario solo puede crear SUS propios datos.
--
-- IMPORTANTE (corrección): el nombre se recibe como parámetro (p_name). NO se
-- lee de auth.users, porque el rol "authenticated" no tiene permiso de lectura
-- sobre esa tabla del sistema (daría "permission denied for table users").
--
-- Cómo usarlo: pegá este SQL en el editor SQL de Supabase y ejecutalo (después
-- del 0001). Es re-ejecutable.
-- ============================================================================

-- Borramos la versión anterior (que tenía otra firma, sin p_name) para no dejar
-- dos funciones "sobrecargadas" conviviendo.
drop function if exists public.complete_onboarding(
  numeric, boolean, numeric, numeric, numeric, jsonb
);

create or replace function public.complete_onboarding(
  p_income        numeric,
  p_auto_repeat   boolean,
  p_name          text,
  p_ahorro_pct    numeric,
  p_gasto_pct     numeric,
  p_inversion_pct numeric,
  -- Lista de categorías: [{"pillar":"gasto","name":"Comida"}, ...]
  p_categories    jsonb
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

  -- Validaciones de la lógica del manual.
  if p_income is null or p_income <= 0 then
    raise exception 'El ingreso debe ser mayor a 0';
  end if;

  if round(coalesce(p_ahorro_pct,0) + coalesce(p_gasto_pct,0) + coalesce(p_inversion_pct,0)) <> 100 then
    raise exception 'Los pilares deben sumar 100%%';
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
  insert into public.pillars (user_id, name, percentage)
  values (v_uid, 'ahorro', p_ahorro_pct)
  on conflict (user_id, name) do update set percentage = excluded.percentage
  returning id into v_ahorro_id;

  insert into public.pillars (user_id, name, percentage)
  values (v_uid, 'gasto', p_gasto_pct)
  on conflict (user_id, name) do update set percentage = excluded.percentage
  returning id into v_gasto_id;

  insert into public.pillars (user_id, name, percentage)
  values (v_uid, 'inversion', p_inversion_pct)
  on conflict (user_id, name) do update set percentage = excluded.percentage
  returning id into v_inversion_id;

  -- 3) Subcategorías: solo si el usuario todavía no tiene ninguna
  --    (evita duplicados si el onboarding se reintenta).
  if not exists (select 1 from public.categories where user_id = v_uid) then
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
