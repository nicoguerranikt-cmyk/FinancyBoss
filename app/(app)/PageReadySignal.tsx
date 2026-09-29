'use client'

// Se monta en cada page.tsx bajo (app) — no renderiza nada, solo le avisa a
// NavTransition.tsx "esta pantalla ya está lista" apenas se monta (lo cual
// pasa exactamente cuando Next termina de renderizarla, sea rápido o
// lento). Ver la nota larga en NavTransition.tsx sobre por qué hace falta
// esto en vez de algo más automático.
//
// Bug visto en producción: a veces la moneda terminaba de salir y la
// pantalla vieja seguía un instante más antes de que apareciera la nueva.
// Causa: React ya había hecho el commit al DOM (por eso el efecto ya
// disparaba), pero el navegador todavía no había PINTADO ese commit en
// pantalla — "commit" y "pintado" no son lo mismo, y la navegación de
// Next.js corre como una transición de baja prioridad, así que el pintado
// puede quedar un pelín atrás. Un doble requestAnimationFrame espera a que
// el navegador efectivamente pinte antes de avisar "lista" — patrón
// estándar para este tipo de desfasaje.
import { useEffect } from 'react'
import { useNavTransition } from './NavTransition'

export default function PageReadySignal() {
  const { reportReady } = useNavTransition()
  useEffect(() => {
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        reportReady()
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [reportReady])
  return null
}
