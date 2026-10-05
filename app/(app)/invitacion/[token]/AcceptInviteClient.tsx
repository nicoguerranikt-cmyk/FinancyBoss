'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { acceptSharedDebtLinkInvite } from '../../shared-debts/actions'

const primaryButtonClass =
  'rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-40 dark:text-zinc-950'

export default function AcceptInviteClient({
  token,
  direction,
}: {
  token: string
  direction: 'yo_debo' | 'me_deben'
}) {
  const router = useRouter()
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    setAccepting(true)
    setError(null)
    const res = await acceptSharedDebtLinkInvite(token)
    setAccepting(false)
    if ('error' in res) {
      setError(res.error)
      return
    }
    router.push(res.role === 'debtor' ? '/deudas' : '/deudores')
  }

  return (
    <div>
      {error && (
        <p className="mb-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button onClick={handleAccept} disabled={accepting} className={primaryButtonClass}>
        {accepting ? 'Aceptando…' : direction === 'yo_debo' ? 'Aceptar (te deben esto)' : 'Aceptar (le debes esto)'}
      </button>
    </div>
  )
}
