'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import api from '@/lib/api/client';
import { User, PermisosResponse, Colegio } from '@/lib/types';

interface AuthContextType {
    user: User | null;
    permisos: string[];
    codigoRol: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (identifier: string, pass: string) => Promise<void>;
    logout: () => void;
    tienePermiso: (modulo: string, accion: string) => boolean;
    // Secciones restringidas (lista blanca) a las que el usuario tiene acceso.
    secciones: string[];
    puedeSeccion: (seccionKey: string) => boolean;
    sidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean) => void;
    // Colegio activo (para usuarios que pertenecen a más de un colegio)
    colegios: Colegio[];
    colegioActivo: number | null;
    setColegioActivo: (id: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mapea el colegio a su tema de diseño (contraste por colegio):
//  - Diego Portales → azul oscuro (data-theme="dp")
//  - Macaya         → verde oscuro (data-theme="mc")
function temaDeColegio(nombre: string): 'mc' | 'dp' | null {
    const n = (nombre || '').toLowerCase();
    if (n.includes('macaya')) return 'mc';
    if (n.includes('portales')) return 'dp';
    return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [permisos, setPermisos] = useState<string[]>([]);
    const [secciones, setSecciones] = useState<string[]>([]);
    const [codigoRol, setCodigoRol] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [colegios, setColegios] = useState<Colegio[]>([]);
    const [colegioActivo, setColegioActivoState] = useState<number | null>(null);
    const router = useRouter();
    const pathname = usePathname();

    // Sincroniza la lista de colegios del usuario y valida/asigna el colegio activo.
    const syncColegioActivo = (u: User | null) => {
        const lista = u?.colegios || [];
        setColegios(lista);
        if (!u) {
            setColegioActivoState(null);
            localStorage.removeItem('colegio_activo');
            return;
        }
        const permitidos = new Set(lista.map(c => c.id_colegio));
        permitidos.add(u.id_colegio);
        const guardado = Number(localStorage.getItem('colegio_activo'));
        const activo = guardado && permitidos.has(guardado) ? guardado : u.id_colegio;
        localStorage.setItem('colegio_activo', String(activo));
        setColegioActivoState(activo);
    };

    const setColegioActivo = (id: number) => {
        localStorage.setItem('colegio_activo', String(id));
        setColegioActivoState(id);
        // Recargar para que todas las páginas reconsulten con el nuevo colegio activo.
        window.location.reload();
    };

    const fetchPermisos = async () => {
        try {
            const res = await api.get<PermisosResponse>('/auth/permisos');
            setPermisos(res.data.permisos);
            setSecciones(res.data.secciones || []);
            setCodigoRol(res.data.codigo_rol);
        } catch (error) {
            console.error('Error fetching permisos', error);
        }
    };

    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const res = await api.get<User>('/auth/me');
                    setUser(res.data);
                    syncColegioActivo(res.data);
                    await fetchPermisos();
                } catch (error) {
                    localStorage.removeItem('token');
                    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Strict";
                    setUser(null);
                    setPermisos([]);
                    setSecciones([]);
                }
            }
            setIsLoading(false);
        };
        checkAuth();
    }, []);

    useEffect(() => {
        if (!isLoading) {
            // Rutas públicas que no requieren sesión (formularios externos por token, etc.)
            const RUTAS_PUBLICAS = ['/login', '/pedidos'];
            const esRutaPublica = RUTAS_PUBLICAS.some(
                r => pathname === r || pathname.startsWith(r + '/')
            );
            if (!user && !esRutaPublica) {
                router.push('/login');
            } else if (user && pathname === '/login') {
                router.push('/dashboard');
            }
        }
    }, [user, isLoading, pathname, router]);

    // Aplica el tema de diseño según el colegio activo (o el principal como respaldo).
    useEffect(() => {
        const activo = colegios.find(c => c.id_colegio === colegioActivo);
        const nombre = activo?.nombre || user?.colegio?.nombre || '';
        const tema = temaDeColegio(nombre);
        if (tema) {
            document.documentElement.setAttribute('data-theme', tema);
            localStorage.setItem('theme', tema);
        }
    }, [colegioActivo, colegios, user]);

    const login = async (identifier: string, password: string) => {
        console.log('Intentando login para:', identifier);
        try {
            const res = await api.post('/auth/login', { identifier, password });
            console.log('Login exitoso:', res.data.user.nombre);
            localStorage.setItem('token', res.data.access_token);
            document.cookie = `token=${res.data.access_token}; path=/; max-age=604800; SameSite=Strict`;
            setUser(res.data.user);
            syncColegioActivo(res.data.user);

            try {
                const permisosRes = await api.get<PermisosResponse>('/auth/permisos');
                setPermisos(permisosRes.data.permisos);
                setSecciones(permisosRes.data.secciones || []);
                setCodigoRol(permisosRes.data.codigo_rol);
            } catch {
                console.error('Error fetching permisos after login');
            }

            router.push('/dashboard');
        } catch (error) {
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('colegio_activo');
        document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Strict";
        setUser(null);
        setPermisos([]);
        setSecciones([]);
        setCodigoRol(null);
        setColegios([]);
        setColegioActivoState(null);
        router.push('/login');
    };

    const tienePermiso = (modulo: string, accion: string): boolean => {
        const permisoBuscar = `${modulo}.${accion}`;
        const permisoTotal = `${modulo}.*`;

        return permisos.includes(permisoTotal) || permisos.includes(permisoBuscar);
    };

    // Acceso a una sección restringida por lista blanca (clave `${modulo}.${slug}`).
    const puedeSeccion = (seccionKey: string): boolean => secciones.includes(seccionKey);

    return (
        <AuthContext.Provider value={{
            user,
            permisos,
            codigoRol,
            isAuthenticated: !!user,
            isLoading,
            login,
            logout,
            tienePermiso,
            secciones,
            puedeSeccion,
            sidebarCollapsed,
            setSidebarCollapsed,
            colegios,
            colegioActivo,
            setColegioActivo
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
