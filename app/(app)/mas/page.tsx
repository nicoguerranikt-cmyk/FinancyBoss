// Tab "Más" (manual.md sección 9): agrupa Perfil y Configuración.

import { createClient } from '@/lib/supabase/server'
import MasClient from './MasClient'

export default async function MasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, base_income, auto_repeat_income')
    .eq('id', userId)
    .single()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <MasClient
        email={user!.email ?? ''}
        name={profile?.name ?? ''}
        baseIncome={profile?.base_income ?? 0}
        autoRepeatIncome={profile?.auto_repeat_income ?? true}
      />
    </div>
  )
}
