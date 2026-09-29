-- ============================================================================
-- FinancyBoss — Vincular deuda por link (sin conocer de antemano a quién)
-- ============================================================================
-- Hoy la única forma de vincular una deuda es buscar a la otra persona por
-- email o username ANTES de crearla (find_user_by_email/username, migración
-- 0012/0024) — el creador ya sabe con quién exactamente. Este archivo agrega
-- una segunda vía: el creador arma los datos de la deuda sin elegir
-- contraparte, genera un link, lo manda por fuera de la app (WhatsApp, etc.)
-- y la persona que lo abre ve una pantalla con los datos y un botón
-- "Aceptar" — recién ahí se sabe quién es la contraparte y se crea la fila
-- de shared_debts (decisión con el usuario: SIEMPRE con ese paso de
-- confirmación explícito, nunca vinculación automática al solo abrir el
-- link — ver memoria "no asumir movimientos de plata", mismo criterio
-- aplicado acá aunque esto no mueva plata, crea un vínculo).
--
-- Por qué una tabla nueva y no un shared_debts con debtor/creditor en null:
-- esas dos columnas son NOT NULL a propósito (todo el modelo — RLS, el
-- trigger guard, confirm_shared_payment — asume que una fila de shared_debts
-- YA tiene sus dos partes). Meterle nulls ahí es tocar el corazón de ese
-- diseño para un caso que en realidad es "antes de que exista la deuda
-- compartida". Más simple y más seguro: una tabla de invitaciones aparte,
-- que al aceptarse INSERTA una fila normal de shared_debts (mismo camino
-- que ya usa createSharedDebtInvite) y se marca 'used'.
-- ============================================================================

create table if not exists public.shared_debt_link_invites (
  id                       uuid primary key default gen_random_uuid(),
  token                    uuid not null unique default gen_random_uuid(),
  created_by               uuid not null references auth.users(id) on delete cascade,
  -- Perspectiva de created_by: 'yo_debo' = created_by es el deudor, 'me_deben' = created_by es el acreedor.
  direction                text not null check (direction in ('yo_debo', 'me_deben')),
  name                     text not null,
  description              text,
  total_amount             numeric(12,2) not null check (total_amount > 0),
  auto_pay_amount          numeric(12,2),
  auto_pay_start_date      date,
  auto_pay_interval_unit   text check (auto_pay_interval_unit in ('day', 'month')),
  auto_pay_interval_count  integer,
  status                   text not null default 'pending' check (status in ('pending', 'used', 'revoked')),
  shared_debt_id           uuid references public.shared_debts(id) on delete set null,
  used_by                  uuid references auth.users(id) on delete set null,
  used_at                  timestamptz,
  created_at               timestamptz not null default now()
);

comment on table public.shared_debt_link_invites is
  'Invitación a vincular una deuda por link, sin elegir contraparte de antemano. pending = todavía se puede abrir y aceptar; used = ya se aceptó, shared_debt_id apunta a la fila real; revoked = el creador la canceló antes de que alguien la use.';

create index if not exists shared_debt_link_invites_created_by_idx on public.shared_debt_link_invites (created_by);
create unique index if not exists shared_debt_link_invites_token_idx on public.shared_debt_link_invites (token);

alter table public.shared_debt_link_invites enable row level security;

-- El creador ve y administra las suyas (para poder revocarlas). El acceso
-- de "quien abre el link" NO pasa por estas políticas — nadie más puede ver
-- filas ajenas por select directo; pasa exclusivamente por la función
-- security definer de abajo, que valida el token exacto (no enumerable).
create policy "shared_debt_link_invites_select_own" on public.shared_debt_link_invites
  for select using (auth.uid() = created_by);

create policy "shared_debt_link_invites_insert" on public.shared_debt_link_invites
  for insert with check (auth.uid() = created_by and status = 'pending');

-- Solo para revocar: de 'pending' a 'revoked', y solo el creador.
create policy "shared_debt_link_invites_revoke" on public.shared_debt_link_invites
  for update
  using (auth.uid() = created_by and status = 'pending')
  with check (status = 'revoked');

grant select, insert, update on public.shared_debt_link_invites to authenticated;

-- ============================================================================
-- Funciones security definer
-- ============================================================================

-- Vista previa de una invitación por token — la usa quien recibió el link,
-- ANTES de aceptar. No expone quién es created_by más que su nombre (mismo
-- criterio de privacidad que find_user_by_email/username).
create or replace function public.get_shared_debt_link_invite(p_token uuid)
returns table (
  name text,
  description text,
  total_amount numeric,
  direction text,
  creator_name text,
  status text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado.';
  end if;

  return query
    select i.name, i.description, i.total_amount, i.direction, p.name, i.status
    from public.shared_debt_link_invites i
    join public.profiles p on p.id = i.created_by
    where i.token = p_token;
end;
$$;

revoke all on function public.get_shared_debt_link_invite(uuid) from public;
grant execute on function public.get_shared_debt_link_invite(uuid) to authenticated;

-- Acepta la invitación: crea la fila real de shared_debts (ya ACTIVA — el
-- paso de "Aceptar" en la pantalla del link ES la confirmación explícita,
-- no hace falta un segundo pending/accept en /deudas) y marca la
-- invitación 'used'. Devuelve el rol del que acepta, para que la app sepa
-- si mandarlo a Deudas o a Deudores.
create or replace function public.accept_shared_debt_link_invite(p_token uuid)
returns table (your_role text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_invite record;
  v_debtor_user_id uuid;
  v_creditor_user_id uuid;
  v_debtor_name text;
  v_creditor_name text;
  v_creator_name text;
  v_caller_name text;
  v_new_debt_id uuid;
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;

  select * into v_invite from public.shared_debt_link_invites where token = p_token for update;
  if v_invite.id is null then
    raise exception 'Este link no es válido.';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'Este link ya no está disponible.';
  end if;
  if v_caller = v_invite.created_by then
    raise exception 'No podés aceptar tu propio link.';
  end if;

  select name into v_creator_name from public.profiles where id = v_invite.created_by;
  select name into v_caller_name from public.profiles where id = v_caller;

  if v_invite.direction = 'yo_debo' then
    v_debtor_user_id := v_invite.created_by;
    v_creditor_user_id := v_caller;
    v_debtor_name := v_creator_name;
    v_creditor_name := v_caller_name;
  else
    v_debtor_user_id := v_caller;
    v_creditor_user_id := v_invite.created_by;
    v_debtor_name := v_caller_name;
    v_creditor_name := v_creator_name;
  end if;

  insert into public.shared_debts (
    debtor_user_id, creditor_user_id, created_by, debtor_name, creditor_name,
    name, description, total_amount, remaining_amount, status,
    auto_pay_amount, auto_pay_start_date, auto_pay_interval_unit, auto_pay_interval_count
  ) values (
    v_debtor_user_id, v_creditor_user_id, v_invite.created_by, v_debtor_name, v_creditor_name,
    v_invite.name, v_invite.description, v_invite.total_amount, v_invite.total_amount, 'active',
    v_invite.auto_pay_amount, v_invite.auto_pay_start_date, v_invite.auto_pay_interval_unit, v_invite.auto_pay_interval_count
  )
  returning id into v_new_debt_id;

  update public.shared_debt_link_invites
    set status = 'used', shared_debt_id = v_new_debt_id, used_by = v_caller, used_at = now()
    where id = v_invite.id;

  return query select case when v_caller = v_debtor_user_id then 'debtor' else 'creditor' end;
end;
$$;

revoke all on function public.accept_shared_debt_link_invite(uuid) from public;
grant execute on function public.accept_shared_debt_link_invite(uuid) to authenticated;
