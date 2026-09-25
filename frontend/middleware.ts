import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value || request.headers.get('authorization')?.replace('Bearer ', '');
  const isAuthPage = request.nextUrl.pathname.startsWith('/login');
  const isProtectedRoute =
    request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/usuarios') ||
    request.nextUrl.pathname.startsWith('/pme') ||
    request.nextUrl.pathname.startsWith('/presupuesto') ||
    request.nextUrl.pathname.startsWith('/requerimiento') ||
    request.nextUrl.pathname.startsWith('/configuracion');

  if (isProtectedRoute && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthPage && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/usuarios/:path*',
    '/pme/:path*',
    '/presupuesto/:path*',
    '/requerimiento/:path*',
    '/configuracion/:path*',
    '/login',
  ],
};