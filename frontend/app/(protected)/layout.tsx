'use client';

import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import FloatingControls from '@/components/FloatingControls';
import { useEffect } from 'react';
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
      <Sidebar />
      <FloatingControls />
      <main className={`${sidebarCollapsed ? 'ml-20' : 'ml-64'} ${isWideScreen ? 'px-4 sm:px-6 lg:px-8 py-6' : 'p-8'} min-h-screen transition-all duration-300`} suppressHydrationWarning>
        <div className={isWideScreen ? "w-full max-w-none" : "max-w-7xl mx-auto"} suppressHydrationWarning>
          {children}
        </div>
      </main>
    </div>
  );
}
