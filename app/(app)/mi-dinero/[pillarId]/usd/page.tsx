// Ahorro en USD (manual.md — migración 0027, fase 1): un solo pozo en
// dólares dentro de la pantalla de Ahorro. Solo tiene sentido para ese
// pilar — si el pillarId no es Ahorro, 404 (mismo criterio que
// mi-dinero/[pillarId]/fijos, que es Gasto-only).

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { todayInBolivia } from '@/lib/dashboard'
import Link from '../../../AppLink'
import PageReadySignal from '../../../PageReadySignal'
import UsdSavingsClient from './UsdSavingsClient'

export default async function UsdSavingsPage({ params }: { params: Promise<{ pillarId: string }> }) {
  const { pillarId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user!.id

  const [{ data: pillar }, { data: movements }, { data: categories }] = await Promise.all([
    supabase.from('pillars').select('id, name').eq('id', pillarId).eq('user_id', userId).maybeSingle(),
    supabase
      .from('usd_savings_transactions')
      .select('id, amount_usd, bs_amount, description, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('categories')
      .select('id, name')
      .eq('pillar_id', pillarId)
      .eq('user_id', userId)
      .is('deleted_at', null),
  ])
  if (!pillar || pillar.name !== 'ahorro') notFound()

  const balanceUsd = (movements ?? []).reduce((sum, m) => sum + m.amount_usd, 0)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      <section>
        <Link href={`/mi-dinero/${pillarId}`} className="text-sm text-zinc-500 hover:underline">
          ← Ahorro
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Ahorro en USD</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Un pozo aparte, en dólares. Cuando quieres pasar algo a bolivianos, tú decides a cuánto
          equivale hoy.
        </p>
      </section>

      <div className="rounded-xl border border-zinc-200 p-4 text-center dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Ahorrado</p>
        <p className="text-3xl font-semibold tracking-tight">{balanceUsd.toFixed(2)} USD</p>
      </div>

      <UsdSavingsClient
        pillarId={pillarId}
        balanceUsd={balanceUsd}
        movements={movements ?? []}
        categories={categories ?? []}
        todayIso={todayInBolivia().iso}
      />
    </div>
  )
}
