// Server Component solo para envolver LoginForm en Suspense — Next.js lo
// exige cuando un Client Component usa useSearchParams (LoginForm lee el
// parámetro "next" para saber a dónde volver después de loguearse).

import { Suspense } from 'react'
import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
