'use client';

import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import FloatingControls from '@/components/FloatingControls';
import ModalPerfilUsuario from '@/components/perfil/ModalPerfilUsuario';
import { useEffect, useState } from 'react';
import { Menu, School } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, sidebarCollapsed, setSidebarCollapsed } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isWideScreen = pathname?.startsWith('/presupuesto/agregar-recursos') || pathname?.startsWith('/go-compras/programar');
  // Menú lateral como cajón en pantallas pequeñas
  const [menuMovil, setMenuMovil] = useState(false);

  // Al navegar, cerrar el cajón
  useEffect(() => {
    setMenuMovil(false);
  }, [pathname]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Si entra a agregar-recursos o pantallas amplias, contraer el sidebar automáticamente
  useEffect(() => {
    if (pathname?.startsWith('/presupuesto/agregar-recursos')) {
      setSidebarCollapsed(true);
    }
  }, [pathname, setSidebarCollapsed]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" suppressHydrationWarning>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" suppressHydrationWarning></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] relative" suppressHydrationWarning>
      {/* Barra superior (solo móvil) */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 bg-white/90 backdrop-blur-xl border-b border-gray-100">
        <button
          onClick={() => setMenuMovil(true)}
          className="-ml-1 w-10 h-10 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100 cursor-pointer"
          aria-label="Abrir menú"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2 text-primary">
          <School size={20} strokeWidth={2.5} />
          <span className="font-extrabold tracking-tight">MCDP ERP</span>
        </div>
      </header>

      {menuMovil && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150" onClick={() => setMenuMovil(false)} aria-hidden="true" />
      )}
      <Sidebar mobileOpen={menuMovil} onMobileClose={() => setMenuMovil(false)} />
      <FloatingControls />
      <ModalPerfilUsuario />
      <main className={`ml-0 ${sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'} ${isWideScreen ? 'px-4 sm:px-6 lg:px-8 py-6' : 'px-4 py-5 sm:p-6 lg:p-8'} min-h-screen transition-all duration-300`} suppressHydrationWarning>
        <div className={isWideScreen ? "w-full max-w-none" : "max-w-7xl mx-auto"} suppressHydrationWarning>
          {children}
        </div>
      </main>
    </div>
  );
}
