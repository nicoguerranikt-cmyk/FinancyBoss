// Mi Dinero (manual.md v2.0, sección 9): acá el usuario organiza y edita
// cómo está distribuido su ingreso — % de los pilares y las categorías
// dentro de cada uno. No muestra saldos del mes (eso vive en el Dashboard).

import { createClient } from '@/lib/supabase/server'
import type { PillarName } from '@/lib/dashboard'
import MiDineroClient from './MiDineroClient'

const PILLAR_ORDER: PillarName[] = ['ahorro', 'gasto', 'inversion']

export default async function MiDineroPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // El layout ya garantiza que hay sesión y perfil; user siempre existe acá.
  const userId = user!.id

  const [{ data: pillars }, { data: categories }] = await Promise.all([
    supabase.from('pillars').select('id, name, percentage').eq('user_id', userId),
    supabase
      .from('categories')
      .select('id, pillar_id, name, percentage, fixed_amount, auto_repeat')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ])

  // El orden de fila en Postgres no está garantizado: ordenamos acá para que
  // los 3 pilares siempre aparezcan en el mismo orden en pantalla.
  const sortedPillars = [...(pillars ?? [])].sort(
    (a, b) => PILLAR_ORDER.indexOf(a.name) - PILLAR_ORDER.indexOf(b.name)
  )

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <MiDineroClient pillars={sortedPillars} categories={categories ?? []} />
    </div>
  )
}
