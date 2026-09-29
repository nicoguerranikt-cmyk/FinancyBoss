-- ============================================================================
-- FinancyBoss — Nombre de usuario (para vincular deudas sin usar el email)
-- ============================================================================
-- Igual que ya existe find_user_by_email (migración 0012), esto agrega una
-- segunda forma de encontrar a otro usuario real: por @username en vez de
-- por email. Mismo criterio de seguridad: coincidencia exacta, requiere
-- estar autenticado, no filtra si "no existe" vs. "existe pero no terminó
-- el onboarding".
--
-- username es NULLABLE: los usuarios que ya tenían cuenta no tienen uno
-- hasta que lo elijan en Perfil. Se guarda siempre en minúscula (la app
-- normaliza antes de mandar) — el unique compara tal cual se guardó.
-- ============================================================================

alter table public.profiles
  add column if not exists username text unique check (username is null or username ~ '^[a-z0-9_]{3,20}$');

comment on column public.profiles.username is
  'Nombre de usuario único, en minúscula, 3-20 caracteres (letras/números/guión bajo). Null hasta que el usuario elija uno en Perfil. Usado para vincular deudas sin necesitar el email de la otra persona (ver find_user_by_username).';

create or replace function public.find_user_by_username(p_username text)
returns table (user_id uuid, name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_username text := nullif(trim(lower(p_username)), '');
  v_target uuid;
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;
  if v_username is null then
    raise exception 'Ingresá un nombre de usuario.';
  end if;

  select p.id into v_target from public.profiles p where p.username = v_username limit 1;
  if v_target is null then
    return; -- 0 filas: no hay cuenta con ese username
  end if;

  if v_target = v_caller then
    raise exception 'No podés vincular una deuda con vos mismo.';
  end if;

  return query select p.id, p.name from public.profiles p where p.id = v_target;
end;
$$;

revoke all on function public.find_user_by_username(text) from public;
grant execute on function public.find_user_by_username(text) to authenticated;
