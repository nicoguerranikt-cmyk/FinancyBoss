'use client'

// Se monta en cada page.tsx bajo (app) — no renderiza nada, solo le avisa a
// NavTransition.tsx "esta pantalla ya está lista" apenas se monta (lo cual
// pasa exactamente cuando Next termina de renderizarla, sea rápido o
// lento). Ver la nota larga en NavTransition.tsx sobre por qué hace falta
// esto en vez de algo más automático.

import { useEffect } from 'react'
import { useNavTransition } from './NavTransition'

export default function PageReadySignal() {
  const { reportReady } = useNavTransition()
  useEffect(() => {
    reportReady()
  }, [reportReady])
  return null
}
