-- ============================================================================
-- FinancyBoss — QR y comprobantes: permisos que de verdad funcionan
-- ============================================================================
-- Tres problemas de la migración 0026, descubiertos al cruzar las acciones
-- de la app con las políticas:
--
--   1. El QR nunca se mostraba. Para pagar, el deudor leía
--      profiles.payment_qr_path del ACREEDOR, pero la política de profiles
--      solo deja leer el perfil propio: la lectura devolvía vacío y la app
--      respondía "sin QR" aunque el acreedor tuviera uno. Se arregla con una
--      función que entrega SOLO ese dato, y solo al deudor de una deuda
--      activa — sin abrir los perfiles a nadie.
--
--   2. El comprobante no quedaba vinculado. El archivo se subía a Storage,
--      pero después el deudor hacía UPDATE de receipt_path y la política de
--      shared_debt_payments solo deja al acreedor rechazar un pago pendiente:
--      el UPDATE afectaba 0 filas SIN error y la app decía "listo". Se
--      arregla con una función que solo puede poner el comprobante propio y
--      falla fuerte si no actualizó exactamente una fila.
--
--   3. Una invitación PENDIENTE ya daba acceso al QR (la política de Storage
--      aceptaba cualquier estado distinto de 'rejected'). Basta con que
--      alguien cree una invitación hacia otro usuario para poder leer su QR
--      antes de que la acepte. Ahora hace falta una deuda aceptada
--      ('active'). Además, los comprobantes quedan congelados cuando el pago
--      se resuelve: ya no se pueden subir ni reemplazar.
-- ============================================================================

-- 1. Ruta del QR del acreedor, solo para el deudor de una deuda activa.
create or replace function public.get_creditor_payment_qr_path(p_shared_debt_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_path text;
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;

  select p.payment_qr_path into v_path
    from public.shared_debts sd
    join public.profiles p on p.id = sd.creditor_user_id
    where sd.id = p_shared_debt_id
      and sd.debtor_user_id = v_caller
      and sd.status = 'active';

  -- null si la deuda no es suya, no está activa o el acreedor no subió un QR.
  return v_path;
end;
$$;

revoke all on function public.get_creditor_payment_qr_path(uuid) from public;
grant execute on function public.get_creditor_payment_qr_path(uuid) to authenticated;

-- 2. Vincular el comprobante a un pago propio y todavía pendiente.
create or replace function public.attach_payment_receipt(p_payment_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_updated integer;
begin
  if v_caller is null then
    raise exception 'No autenticado.';
  end if;

  -- El path es fijo por pago (ver 0026): nadie puede apuntar a otro archivo.
  if p_path is distinct from 'receipts/' || p_payment_id::text || '/receipt' then
    raise exception 'Ruta de comprobante inválida.';
  end if;

  update public.shared_debt_payments
    set receipt_path = p_path
    where id = p_payment_id
      and proposer_user_id = v_caller
      and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'No se pudo adjuntar el comprobante: el pago no existe, no es tuyo o ya fue resuelto.';
  end if;
end;
$$;

revoke all on function public.attach_payment_receipt(uuid, text) from public;
grant execute on function public.attach_payment_receipt(uuid, text) to authenticated;

-- 3a. El QR solo se lee con una deuda aceptada (no con una invitación pendiente).
drop policy if exists "payment_media_qr_select" on storage.objects;
create policy "payment_media_qr_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-media'
    and (storage.foldername(name))[1] = 'qr'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or exists (
        select 1 from public.shared_debts sd
        where sd.creditor_user_id::text = (storage.foldername(name))[2]
          and sd.debtor_user_id = auth.uid()
          and sd.status = 'active'
      )
    )
  );

-- 3b. El comprobante solo se sube o reemplaza mientras el pago está pendiente.
drop policy if exists "payment_media_receipt_write" on storage.objects;
create policy "payment_media_receipt_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-media'
    and (storage.foldername(name))[1] = 'receipts'
    and exists (
      select 1 from public.shared_debt_payments sp
      join public.shared_debts sd on sd.id = sp.shared_debt_id
      where sp.id::text = (storage.foldername(name))[2]
        and sd.debtor_user_id = auth.uid()
        and sp.status = 'pending'
    )
  );

drop policy if exists "payment_media_receipt_update" on storage.objects;
create policy "payment_media_receipt_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'payment-media'
    and (storage.foldername(name))[1] = 'receipts'
    and exists (
      select 1 from public.shared_debt_payments sp
      join public.shared_debts sd on sd.id = sp.shared_debt_id
      where sp.id::text = (storage.foldername(name))[2]
        and sd.debtor_user_id = auth.uid()
        and sp.status = 'pending'
    )
  );
