// Deudores (manual.md v2.0, sección 7): lo inverso de Deudas — acá el
// usuario registra a quién le prestó plata. Un cobro es un ingreso extra
// (ver app/(app)/deudores/actions.ts registerCollection).

import { createClient } from '@/lib/supabase/server'
import { todayInBolivia } from '@/lib/dashboard'
import DeudoresClient from './DeudoresClient'

export default async function DeudoresPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const [{ data: debtors }, { data: pillars }, { data: categories }] = await Promise.all([
    supabase
      .from('debtors')
      .select('id, name, total_amount, remaining_amount, lent_date, expected_date, description, status')
      .eq('user_id', userId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    supabase.from('pillars').select('id, name, percentage').eq('user_id', userId),
    supabase.from('categories').select('id, pillar_id, name, fixed_amount').eq('user_id', userId).is('deleted_at', null),
  ])

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <DeudoresClient
        debtors={debtors ?? []}
        pillars={pillars ?? []}
        categories={categories ?? []}
        todayIso={todayInBolivia().iso}
      />
    </div>
  )
}
