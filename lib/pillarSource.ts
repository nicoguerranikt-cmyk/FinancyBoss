import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type SourceResult = { pillarId: string; categoryId: string | null; error?: string }

// Valida que un pilar/categoría (elegidos por el usuario como origen o
// destino de plata) sean suyos, y que la categoría no sea un gasto fijo: si
// se permitiera, la transacción quedaría excluida de "movimientos" en
// computeDashboard (igual que un gasto fijo) y la plata "desaparecería" del
// saldo del pilar sin que el usuario lo note. Usado por pagos de deuda
// (app/(app)/deudas/actions.ts) y cobros de deudores (app/(app)/deudores/actions.ts).
export async function validatePillarSource(
  supabase: SupabaseClient,
  userId: string,
  pillarId: string,
  categoryId: string | null | undefined
): Promise<SourceResult> {
  const { data: pillar } = await supabase
    .from('pillars')
    .select('id')
    .eq('id', pillarId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!pillar) return { pillarId, categoryId: null, error: 'Pilar inválido.' }

  if (!categoryId) return { pillarId: pillar.id, categoryId: null }

  const { data: category } = await supabase
    .from('categories')
    .select('id, fixed_amount')
    .eq('id', categoryId)
    .eq('user_id', userId)
    .eq('pillar_id', pillarId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!category) return { pillarId: pillar.id, categoryId: null, error: 'Categoría inválida.' }
  if (category.fixed_amount !== null) {
    return {
      pillarId: pillar.id,
      categoryId: null,
      error: 'Esa categoría es un gasto fijo — elegí otra o dejala sin categoría.',
    }
  }

  return { pillarId: pillar.id, categoryId: category.id }
}
