// Tarjeta de categoría, compartida entre la lista de Ahorro/Inversión
// (page.tsx) y las dos pantallas de Gasto (fijos/page.tsx,
// cotidianos/page.tsx). El color de acento es el del pilar dueño de la
// categoría (mismo criterio que las tarjetas de "Tus pilares" en Mi
// Dinero), para que la identidad visual sea consistente en toda la app.
//
// Sin % en ningún lado (pedido del usuario) — el monto en Bs ya dice todo
// lo que hay que saber, no hace falta un badge informativo al lado.

import type { PillarName } from '@/lib/dashboard'
import { formatBs } from '@/lib/format'
import { PILLAR_BORDER, PILLAR_TEXT, PILLAR_TINT } from '@/lib/pillarColors'
import Link from '../../AppLink'

export type CategoryListRow = {
  id: string
  name: string
  fixed_amount: number | null
  is_general: boolean
  auto_repeat: boolean
  fixed_start_date: string | null
  fixed_interval_unit: import('@/lib/recurrence').RecurrenceUnit | null
  fixed_interval_count: number | null
}

export default function CategoryCard({
  pillarId,
  pillarName,
  category,
  accumulated,
  pendingConfirmation,
}: {
  pillarId: string
  pillarName: PillarName
  category: CategoryListRow
  accumulated: number
  // Gasto fijo con una cuota vencida sin confirmar (ver confirmFixedExpense,
  // mi-dinero/actions.ts) — muestra un aviso acá para que se note sin tener
  // que entrar a cada categoría una por una. Solo lo usa fijos/page.tsx.
  pendingConfirmation?: boolean
}) {
  const parts = [
    category.is_general ? 'general' : null,
    category.fixed_amount !== null ? `${formatBs(category.fixed_amount)} Bs` : null,
  ].filter((p): p is string => p !== null)

  return (
    <Link
      href={`/mi-dinero/${pillarId}/${category.id}`}
      className={`flex items-center justify-between rounded-xl border-l-4 p-4 transition-colors hover:brightness-95 dark:hover:brightness-110 ${PILLAR_BORDER[pillarName]} ${PILLAR_TINT[pillarName]}`}
    >
      <div>
        <p className="font-medium">{category.name}</p>
        {parts.length > 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">{parts.join(' · ')}</p>}
        {pendingConfirmation && (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Pendiente de confirmar</p>
        )}
      </div>
      <div className="text-right">
        <p className={`font-semibold ${PILLAR_TEXT[pillarName]}`}>{formatBs(accumulated)} Bs</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">acumulado</p>
      </div>
    </Link>
  )
}
