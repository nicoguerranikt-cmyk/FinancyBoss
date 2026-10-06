-- ============================================================================
-- FinancyBoss — Username elegible desde el registro
-- ============================================================================
-- Hasta ahora el username (migración 0024) solo se podía elegir después,
-- desde Perfil. Esto agrega una forma de chequear disponibilidad ANTES de
-- crear la cuenta (para el formulario de /registro) y hace que el username
-- elegido ahí se guarde al terminar el onboarding.
--
-- is_username_taken() es de lectura pública (anon + authenticated): no filtra
-- auth.uid() porque en /registro todavía no hay sesión. No expone nada más
-- que "existe o no" — el username ya es, por diseño, algo que la propia
-- persona va a compartir para que otros la encuentren (ver find_user_by_username,
-- migración 0024), así que no es información sensible.
-- ============================================================================

create or replace function public.is_username_taken(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where username = nullif(trim(lower(p_username)), '')
  );
$$;

revoke all on function public.is_username_taken(text) from public;
grant execute on function public.is_username_taken(text) to anon, authenticated;

-- complete_onboarding(): agrega p_username al final, con default null, para
-- no romper la firma existente (Postgres permite esto sin dropear la función).
-- Si el username llega ocupado (carrera rarísima entre /registro y terminar
-- el onboarding — ya se chequeó disponibilidad en /registro), no bloqueamos
-- el onboarding: seguimos sin username y la persona elige otro después desde
-- Perfil (mismo manejo de conflicto que ya existe en app/(app)/mas/actions.ts).
create or replace function public.complete_onboarding(
  p_income          numeric,
  p_auto_repeat     boolean,
  p_name            text,
  p_ahorro_amount   numeric,
  p_gasto_amount    numeric,
  p_inversion_amount numeric,
  -- Lista de categorías: [{"pillar":"gasto","name":"Comida"}, ...]
  p_categories      jsonb,
  p_username        text default null
)
returns void
language plpgsql
as $$
declare
  v_uid          uuid := auth.uid();
  v_name         text := nullif(trim(coalesce(p_name, '')), '');
  v_username     text := nullif(trim(lower(coalesce(p_username, ''))), '');
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
