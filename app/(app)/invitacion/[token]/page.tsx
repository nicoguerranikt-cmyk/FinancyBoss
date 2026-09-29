// Pantalla de confirmación de un link de deuda vinculada (migración 0025).
// Vive bajo (app) para reusar el layout autenticado (nav + guard de sesión
// en proxy.ts) — si no hay sesión, el usuario ya termina en /login antes de
// llegar acá, y vuelve a este mismo link después de loguearse.
//
// Nunca se vincula nada solo por entrar acá: la fila real de shared_debts
// recién se crea cuando el usuario aprieta "Aceptar" (ver AcceptInviteClient).

import { formatBs } from '@/lib/format'
import { getSharedDebtLinkInvite } from '../../shared-debts/actions'
import AcceptInviteClient from './AcceptInviteClient'
import PageReadySignal from '../../PageReadySignal'

export default async function SharedDebtInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await getSharedDebtLinkInvite(token)

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <PageReadySignal />
      <h1 className="text-xl font-semibold tracking-tight">Invitación a vincular una deuda</h1>

      {'error' in result ? (
        <p className="text-sm text-red-600" role="alert">
          {result.error}
        </p>
      ) : result.status !== 'pending' ? (
        <p className="text-sm text-zinc-500">Este link ya no está disponible.</p>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-sm">
            <span className="font-medium">{result.creatorName}</span> dice que{' '}
            {result.direction === 'yo_debo' ? (
              <>
                te debe <span className="font-medium">{formatBs(result.totalAmount)} Bs</span>
              </>
            ) : (
              <>
                le debés <span className="font-medium">{formatBs(result.totalAmount)} Bs</span>
              </>
            )}
            .
          </p>
          <div>
            <p className="font-medium">{result.name}</p>
            {result.description && <p className="text-sm text-zinc-500">{result.description}</p>}
          </div>
          <p className="text-xs text-zinc-500">
            Si aceptás, esto va a aparecer en tu pestaña de{' '}
            {result.direction === 'yo_debo' ? 'Deudores' : 'Deudas'}. No se descuenta ni acredita
            nada todavía — eso pasa recién cuando se proponga y confirme un pago.
          </p>
          <AcceptInviteClient token={token} direction={result.direction} />
        </div>
      )}
    </div>
  )
}
