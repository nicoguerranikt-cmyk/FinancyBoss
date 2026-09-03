// Ruta que confirma el email del usuario cuando hace clic en el link que le
// mandó Supabase. El link trae un token; acá lo verificamos y, si es válido,
// dejamos la sesión iniciada y lo mandamos al inicio.
//
// Para que el link del email apunte acá, en Supabase hay que ajustar la
// plantilla de email (te dejo el paso en el resumen). Si usás el flujo por
// defecto de Supabase, esta ruta queda lista para cuando lo cambies.

import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  // Token inválido o vencido -> a login con aviso.
  return NextResponse.redirect(new URL('/login?error=confirmacion', request.url))
}
