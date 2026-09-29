-- ============================================================================
-- FinancyBoss — Reparto mensual real por categoría (Ahorro, Gasto e Inversión)
-- ============================================================================
-- Hasta ahora, el % de cada pilar (ej. "20% a Ahorro") era solo un cálculo
-- virtual (lib/dashboard.ts computeDashboard) que nunca se repartía de
-- verdad entre las categorías — por eso el Dashboard podía decir "210 Bs en
-- Ahorro" mientras las categorías de Ahorro en Mi Dinero sumaban mucho
-- menos (esas sí eran depósitos reales, cargados a mano). Esta migración
-- prepara el esquema para que el reparto sea real: cada mes se generan
-- depósitos de verdad por categoría (ver lib/monthlyAllocation.server.ts).
--
-- categories.is_general: cada pilar tiene una categoría "balde" (creada acá
-- para usuarios existentes, y en complete_onboarding() para nuevos) que
-- recibe lo que no tenga % asignado a otra categoría. Es la única categoría
-- que la UI no deja borrar ni asignarle %.
--
-- transactions.is_allocation: marca un depósito generado por el reparto
-- mensual. Se excluye de "movimientos" en computeDashboard (lib/dashboard.ts)
-- y del "ingreso total del mes" en Estadísticas — si no, esa plata se
-- contaría dos veces (una como presupuesto virtual, otra como movimiento).
-- ============================================================================

alter table public.categories
  add column if not exists is_general boolean not null default false;

-- Como mucho una categoría "general" (el balde de lo no asignado) por pilar.
create unique index if not exists categories_general_unique
  on public.categories (user_id, pillar_id) where is_general;

alter table public.transactions
  add column if not exists is_allocation boolean not null default false;

comment on column public.categories.is_general is
  'true = la categoría "balde" del pilar (Ahorro general/Gasto general/Inversión general): recibe lo que no tenga % asignado a otra categoría. Protegida en la UI (no se borra, no tiene % propio).';
comment on column public.transactions.is_allocation is
  'true = depósito generado por el reparto mensual automático (ver lib/monthlyAllocation.server.ts). Se excluye de "movimientos" en computeDashboard y del ingreso total del mes en Estadísticas, para no contar esa plata dos veces.';

-- Backfill: los usuarios que ya existían (creados antes de esta migración)
-- reciben su "{Pilar} general" si todavía no tienen uno.
insert into public.categories (user_id, pillar_id, name, is_general)
select
  p.user_id,
  p.id,
  case p.name
    when 'ahorro' then 'Ahorro general'
    when 'gasto' then 'Gasto general'
    else 'Inversión general'
  end,
  true
from public.pillars p
where not exists (
  select 1 from public.categories c where c.pillar_id = p.id and c.is_general
);

-- complete_onboarding(): mismo cuerpo que 0002_onboarding.sql, agregando la
-- creación de las 3 categorías "general" para usuarios NUEVOS (siempre, no
-- solo cuando el usuario elige categorías sugeridas).
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
