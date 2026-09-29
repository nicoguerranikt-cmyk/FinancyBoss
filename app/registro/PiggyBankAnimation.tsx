// Chanchito de la pantalla de registro: la moneda del logo le cae encima y
// entra por la ranura del lomo, en loop, mientras el usuario completa el
// formulario para crear su cuenta. Puramente decorativo (no bloquea nada).

import Image from 'next/image'

export default function PiggyBankAnimation() {
  return (
    // aspectRatio igual al de animacionlogin.png (1374x1145): sin esto,
    // object-contain deja franjas vacías arriba/abajo y el % del coin
    // (calculado a mano contra la imagen real) queda desalineado.
    <div className="relative mx-auto mb-2 w-36" style={{ aspectRatio: '1374 / 1145' }}>
      <Image src="/animacionlogin.png" alt="" fill priority className="object-contain" />
      <div className="piggy-coin absolute left-[27%] h-7 w-7">
        <Image src="/logo-icon-light.png" alt="" width={56} height={56} className="h-full w-full dark:hidden" priority />
        <Image src="/logo-icon-dark.png" alt="" width={56} height={56} className="hidden h-full w-full dark:block" priority />
      </div>
    </div>
  )
}
