// Tab "Más" (manual.md sección 9): agrupa Perfil y Configuración.

import { createClient } from '@/lib/supabase/server'
import MasClient from './MasClient'
import PageReadySignal from '../PageReadySignal'

export default async function MasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, base_income, auto_repeat_income, username, payment_qr_path')
    .eq('id', userId)
    .single()

  // Signed URL de solo lectura, generada de nuevo en cada carga (el bucket
  // es privado — ver migración 0026) — no se guarda, expira sola.
  let qrUrl: string | null = null
  if (profile?.payment_qr_path) {
    const { data: signed } = await supabase.storage
      .from('payment-media')
      .createSignedUrl(profile.payment_qr_path, 60 * 60)
    qrUrl = signed?.signedUrl ?? null
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      <MasClient
        email={user!.email ?? ''}
        name={profile?.name ?? ''}
        baseIncome={profile?.base_income ?? 0}
        autoRepeatIncome={profile?.auto_repeat_income ?? true}
        username={profile?.username ?? null}
        qrUrl={qrUrl}
      />
    </div>
  )
}
