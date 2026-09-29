'use client'

// La moneda del logo cruzando la pantalla durante la navegación entre
// pantallas (ej. Dashboard -> Mi Dinero): entra desde la izquierda, se
// detiene al medio haciendo un "guiño" en loop mientras la pantalla nueva
// todavía no está lista, y recién sale hacia la derecha (revelando la
// pantalla nueva, ya cargada) cuando la navegación real terminó.
//
// Cómo se sabe "cuándo ya cargó": cada page.tsx bajo (app) monta
// <PageReadySignal /> (ver ese archivo) apenas se renderiza — como cada
// pantalla es un componente que se monta de cero al navegar a ella, ese
// mount SIEMPRE pasa exactamente cuando la pantalla nueva está lista de
// verdad, sin importar qué tan rápido o lento haya sido.
//
// Se descartaron 2 alternativas más "automáticas" que parecían más simples
// pero no funcionan para esto (probado a mano, con logs, las dos):
//   - usePathname(): cambia apenas ARRANCA la navegación, antes de que haya
//     datos reales — usarla revela la pantalla nueva mientras todavía está
//     cargando.
//   - Mirar cuándo cambia la referencia de `children` en este mismo
//     componente: Next.js reutiliza internamente el mismo "slot" de
//     children entre navegaciones (así es como persisten los layouts), la
//     referencia nunca cambia aunque el contenido de adentro sí — nunca se
//     detecta el cambio.
//   - useLinkStatus() de next/link: el componente que lee ese hook vive en
//     la página VIEJA, que se desmonta justo cuando pasaría a "false", y
//     nunca llega a avisarlo.

import Image from 'next/image'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

type Phase = 'hidden' | 'enter' | 'hold' | 'exit'

// Tienen que coincidir con las duraciones de globals.css (coin-slide-in,
// coin-slide-out, coin-wink).
const ENTER_MS = 500
const EXIT_MS = 500
const MIN_HOLD_MS = 1400 // un guiño completo (coin-wink dura 1.4s)

const NavTransitionContext = createContext<{
  beginNavigation: () => void
  reportReady: () => void
} | null>(null)

export function useNavTransition() {
  const ctx = useContext(NavTransitionContext)
  if (!ctx) throw new Error('useNavTransition se usa dentro de <NavTransitionProvider>.')
  return ctx
}

export default function NavTransitionProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('hidden')
  const readyRef = useRef(false)

  // useCallback (+ useMemo en el value de abajo) es obligatorio acá, no una
  // prolijidad: sin esto, beginNavigation/reportReady son funciones nuevas
  // en cada render de este Provider. El PageReadySignal de la pantalla
  // VIEJA sigue montado justo cuando se hace click (todavía no navegó), y
  // su useEffect depende de reportReady — si la referencia cambia, ese
  // efecto se vuelve a disparar EN LA PANTALLA VIEJA, llamando a
  // reportReady() nuevamente y poniendo readyRef en true casi al toque de
  // que beginNavigation() lo había puesto en false. Eso hacía que la
  // animación se diera por "lista" enseguida y se ocultara por temporizador
  // mientras la pantalla nueva todavía estaba cargando — se veía la vieja
  // unos segundos hasta que la navegación real terminaba y recién ahí
  // cambiaba, sin nada tapando ese salto.
  const beginNavigation = useCallback(() => {
    readyRef.current = false
    setPhase('enter')
  }, [])

  const reportReady = useCallback(() => {
    readyRef.current = true
  }, [])

  // Entrar (izquierda -> medio).
  useEffect(() => {
    if (phase !== 'enter') return
    const t = setTimeout(() => setPhase('hold'), ENTER_MS)
    return () => clearTimeout(t)
  }, [phase])

  // Esperar al medio (guiñando) hasta que la navegación real termine, con un
  // mínimo de un guiño completo para que nunca se corte a la mitad del gesto.
  useEffect(() => {
    if (phase !== 'hold') return
    const holdStartedAt = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - holdStartedAt
      if (elapsed >= MIN_HOLD_MS && readyRef.current) {
        setPhase('exit')
      }
    }, 100)
    return () => clearInterval(interval)
  }, [phase])

  // Salir (medio -> derecha): al terminar, se oculta y queda revelada la
  // pantalla nueva (que para este punto ya está lista).
  useEffect(() => {
    if (phase !== 'exit') return
    const t = setTimeout(() => setPhase('hidden'), EXIT_MS)
    return () => clearTimeout(t)
  }, [phase])

  const contextValue = useMemo(() => ({ beginNavigation, reportReady }), [beginNavigation, reportReady])

  return (
    <NavTransitionContext.Provider value={contextValue}>
      {children}
      {phase !== 'hidden' && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden bg-white/95 backdrop-blur dark:bg-zinc-950/95">
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              animation:
                phase === 'enter'
                  ? `coin-slide-in ${ENTER_MS}ms ease-out forwards`
                  : phase === 'exit'
                    ? `coin-slide-out ${EXIT_MS}ms ease-in forwards`
                    : undefined,
              transform: phase === 'hold' ? 'translate(-50%, -50%)' : undefined,
            }}
          >
            <div className={phase === 'hold' ? 'coin-wink' : ''}>
              <Image
                src="/logo-icon-light.png"
                alt="Cargando…"
                width={112}
                height={112}
                className="dark:hidden"
                priority
              />
              <Image
                src="/logo-icon-dark.png"
                alt="Cargando…"
                width={112}
                height={112}
                className="hidden dark:block"
                priority
              />
            </div>
          </div>
        </div>
      )}
    </NavTransitionContext.Provider>
  )
}
