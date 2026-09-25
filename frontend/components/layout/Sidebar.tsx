'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LogOut,
  School,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { MODULOS, permisoSeccion, seccionKey } from '@/lib/permissions/registry';

interface MenuSubItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  permiso?: string;
  // Permiso "grueso" del módulo (ej. 'presupuesto.ver') que también habilita la sección.
  permisoFallback?: string;
  // Si la sección es restringida, su acceso lo define la lista blanca de usuarios
  // (Configuración › Accesos), NO el permiso del rol.
  seccionRestringida?: string;
  // Visible únicamente para el rol Administrador (ADM), sin importar los permisos
  // configurados en el editor de roles.
  soloAdmin?: boolean;
}

interface MenuItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  permiso?: string;
  subItems?: MenuSubItem[];
}

// Menú derivado del registro único de módulos/secciones (fuente de la verdad compartida
// con el editor de roles). Ya no depende del rol: la visibilidad la define `tienePermiso`.
const MENU_ITEMS: MenuItem[] = MODULOS.map((mod) => {
  if (mod.secciones && mod.secciones.length > 0) {
    return {
      label: mod.label,
      icon: mod.icon,
      subItems: mod.secciones.map((sec) => ({
        label: sec.label,
        href: sec.href,
        icon: sec.icon,
        permiso: permisoSeccion(mod.key, sec),
        permisoFallback: `${mod.key}.ver`,
        seccionRestringida: sec.restringido ? seccionKey(mod.key, sec) : undefined,
        soloAdmin: sec.soloAdmin,
      })),
    };
  }
  return {
    label: mod.label,
    href: mod.href,
    icon: mod.icon,
    permiso: mod.permiso,
  };
});


export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout, tienePermiso, puedeSeccion, sidebarCollapsed, setSidebarCollapsed, colegios, colegioActivo, setColegioActivo } = useAuth();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  // Un permiso `modulo.accion` está activo si el rol lo tiene (o su wildcard `modulo.*`).
  const permisoActivo = (permiso?: string) => {
    if (!permiso) return true;
    const [modulo, accion] = permiso.split('.');
    return tienePermiso(modulo, accion);
  };

  // Una sección es visible con su permiso fino (`modulo.slug`/override) o el grueso (`modulo.ver`).
  // Si es restringida, la visibilidad la define exclusivamente la lista blanca de usuarios.
  // Si es "soloAdmin", solo el rol Administrador la ve, sin importar permisos configurados.
  const subVisible = (sub: MenuSubItem) => {
    if (sub.soloAdmin) return user?.rol?.codigo === 'ADM';
    if (sub.seccionRestringida) return puedeSeccion(sub.seccionRestringida);
    return permisoActivo(sub.permiso) || permisoActivo(sub.permisoFallback);
  };

  useEffect(() => {
    const newOpenMenus: Record<string, boolean> = {};
    MENU_ITEMS.forEach(item => {
      if (item.subItems) {
        const visibleSubItems = item.subItems.filter(subVisible);
        const hasActiveSubItem = visibleSubItems.some(sub => pathname.startsWith(sub.href));
        if (hasActiveSubItem) {
          newOpenMenus[item.label] = true;
        }
      }
    });
    setOpenMenus(prev => ({ ...prev, ...newOpenMenus }));
  }, [pathname, user]);

  const toggleMenu = (label: string) => {
    setOpenMenus(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  const filteredMenu = MENU_ITEMS.filter(item => {
    if (item.subItems) return true; // los grupos se filtran por sus subítems visibles en el render
    return permisoActivo(item.permiso);
  });

  return (
    <aside className={`fixed left-0 top-0 bottom-0 ${sidebarCollapsed ? 'w-20' : 'w-64'} bg-white/80 backdrop-blur-xl shadow-[4px_0_24px_rgba(0,0,0,0.02)] border-r border-white/40 flex flex-col z-40 transition-all duration-300`}>
      {/* Botón flotante para colapsar/expandir en el riel divisorio */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute -right-3.5 top-7 z-50 w-7 h-7 bg-white border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/40 rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:shadow-md hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer group"
        title={sidebarCollapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
        aria-label={sidebarCollapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
      >
        <ChevronLeft 
          size={14} 
          strokeWidth={2.5} 
          className={`transition-transform duration-300 group-hover:text-primary ${sidebarCollapsed ? 'rotate-180 text-primary' : 'rotate-0 text-gray-400'}`} 
        />
      </button>

      {/* Brand area */}
      <div className={`border-b border-gray-100/50 flex items-center ${sidebarCollapsed ? 'justify-center p-4 py-5' : 'justify-start p-6'} transition-all duration-300`}>
        <div className="flex items-center gap-3 text-primary">
          <div className="p-2 bg-primary/10 rounded-xl shrink-0">
            <School size={28} strokeWidth={2.5} />
          </div>
          {!sidebarCollapsed && <span className="font-extrabold text-xl tracking-tight truncate whitespace-nowrap">MCDP ERP</span>}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto py-6 ${sidebarCollapsed ? 'px-2' : 'px-4'} space-y-1.5 custom-scrollbar`}>
        {filteredMenu.map((item) => {
          const Icon = item.icon;
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const isOpen = openMenus[item.label];

          // Filtrar subItems visibles por permisos (permiso fino de sección o grueso de módulo)
          const visibleSubItems = hasSubItems
            ? item.subItems!.filter(subVisible)
            : [];

          // Si tiene subItems pero ninguno es visible, no mostrar el menú
          if (hasSubItems && visibleSubItems.length === 0) {
            return null;
          }

          const isActive = item.href ? (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))) : false;

          if (hasSubItems) {
            return (
              <div key={item.label} className="space-y-1">
                <button
                  onClick={() => toggleMenu(item.label)}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`flex items-center justify-between w-full ${sidebarCollapsed ? 'px-2 justify-center' : 'px-4'} py-3 rounded-xl transition-all duration-200 group ${isActive || isOpen
                    ? 'text-primary font-medium bg-primary/5'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 font-medium'
                    }`}
                >
                  <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
                    <Icon size={20} className={isActive || isOpen ? 'text-primary' : 'text-gray-400 group-hover:text-primary transition-colors'} />
                    {!sidebarCollapsed && <span className="text-sm">{item.label}</span>}
                  </div>
                  {!sidebarCollapsed && (isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                </button>

                {isOpen && !sidebarCollapsed && (
                  <div className="pl-9 space-y-1 py-1">
                    {visibleSubItems.map((sub) => {
                      const SubIcon = sub.icon;
                      const isSubActive = pathname === sub.href;

                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group ${isSubActive
                            ? 'text-primary bg-primary/10 font-medium'
                            : 'text-gray-400 hover:text-primary hover:bg-gray-50 text-xs font-medium'
                            }`}
                        >
                          <SubIcon size={16} className={isSubActive ? 'text-primary' : 'text-gray-300 group-hover:text-primary'} />
                          <span className="text-xs">{sub.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href!}
              title={sidebarCollapsed ? item.label : undefined}
              className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2' : 'px-4'} py-3 rounded-xl transition-all duration-200 group ${isActive
                ? 'bg-primary text-white shadow-md shadow-primary/30 font-medium'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 font-medium'
                }`}
            >
              <Icon size={20} className={isActive ? 'text-white' : 'text-gray-400 group-hover:text-primary transition-colors'} />
              {!sidebarCollapsed && <span className="text-sm">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Profile & Logout */}
      <div className={`border-t border-gray-100/50 bg-gray-50/50 rounded-2xl transition-all duration-300 ${sidebarCollapsed ? 'p-2 m-2' : 'p-4 m-4'}`}>
        {!sidebarCollapsed && (
          <div className="flex flex-col mb-4">
            <span className="text-sm font-semibold text-gray-800 truncate">
              {user?.nombre || 'Cargando...'}
            </span>
            <span className="text-xs text-gray-500 font-medium mt-0.5">
              {user?.rol?.nombre || 'Usuario'}
            </span>
          </div>
        )}

        {/* Selector de colegio activo (solo si el usuario pertenece a más de un colegio) */}
        {!sidebarCollapsed && colegios.length > 1 && (
          <div className="mb-4">
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 mb-1.5">
              <School size={13} /> Colegio activo
            </label>
            <select
              value={colegioActivo ?? ''}
              onChange={(e) => setColegioActivo(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            >
              {colegios.map((c) => (
                <option key={c.id_colegio} value={c.id_colegio}>{c.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={logout}
          title={sidebarCollapsed ? 'Cerrar Sesión' : undefined}
          className={`flex items-center justify-center gap-2 ${sidebarCollapsed ? 'w-full p-2.5' : 'w-full px-4 py-2.5'} bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:bg-red-50 hover:border-red-100 rounded-xl transition-all shadow-sm text-sm font-medium`}
        >
          <LogOut size={18} />
          {!sidebarCollapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </aside>
  );
}