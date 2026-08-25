import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Guardia de borde: sin cookie de sesión, redirige a /login antes de renderizar
 * cualquier página. La validez real de la sesión la exige la API en cada
 * llamada (401 → el cliente también redirige); esto solo evita el parpadeo
 * de una página protegida sin datos.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has('session');
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Solo gatea NAVEGACIÓN de páginas. /api, /auth, /webhooks, /media y /health
// deben pasar sin redirección: son llamadas de datos (la API ya las protege
// con su propio guardián y devuelve 401 en JSON) o endpoints públicos de Meta.
export const config = {
  matcher: [
    '/((?!login|api|auth|webhooks|media|health|_next/static|_next/image|favicon.ico).*)',
  ],
};
