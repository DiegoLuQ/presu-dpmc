import {
    LayoutDashboard,
    Users,
    FileText,
    DollarSign,
    Settings,
    ClipboardList,
    Calculator,
    Package,
    Tag,
    Plus,
    User,
    ShoppingCart,
    History,
    CalendarClock,
    BarChart3,
    Wallet,
    Upload,
} from 'lucide-react';
import { Accion } from '@/app/(protected)/configuracion/PermissionConstants';

/**
 * Registro único de módulos y secciones del sistema.
 *
 * Es la fuente de la verdad que alimenta TANTO el sidebar como el editor de roles.
 * Al agregar aquí un módulo o una sección, aparece automáticamente en ambos lugares.
 *
 * Modelo de permisos (2 segmentos, con wildcard `modulo.*`):
 *  - Acción de módulo:  `${modulo}.${accion}`  (ver / crear / editar / eliminar / aprobar / *)
 *  - Visualizar sección: `${modulo}.${slug}`   (o el `permisoOverride` de la sección)
 *
 * Visibilidad (ver `Sidebar.tsx`):
 *  - Sección visible si el rol tiene `modulo.*`, `modulo.ver` (acceso grueso) o `modulo.<slug>` (fino).
 */

export type LucideIcon = React.ComponentType<{ size?: number; className?: string }>;

export interface SeccionDef {
    slug: string;              // token de permiso: `${modulo}.${slug}`
    label: string;
    href: string;
    icon: LucideIcon;
    permisoOverride?: string;  // si la visibilidad usa otro permiso (ej. 'presupuesto.aprobar')
    restringido?: boolean;     // acceso por lista blanca de usuarios (Configuración › Accesos)
    soloAdmin?: boolean;       // visible/accesible únicamente para el rol Administrador (ADM), sin depender de permisos configurables por rol
}

export interface ModuloDef {
    key: string;               // namespace de permiso, ej. 'presupuesto'
    label: string;             // rótulo del grupo en sidebar/editor
    icon: LucideIcon;
    href?: string;             // enlace simple (sin secciones)
    permiso?: string;          // permiso del enlace simple (ej. 'dashboard.ver')
    acciones?: Accion[];       // columnas CRUD en el editor
    secciones?: SeccionDef[];
}

const ACCIONES_BASICAS: Accion[] = [Accion.VER, Accion.CREAR, Accion.EDITAR, Accion.ELIMINAR, Accion.TODOS];
const ACCIONES_CON_APROBAR: Accion[] = [Accion.VER, Accion.CREAR, Accion.EDITAR, Accion.ELIMINAR, Accion.APROBAR, Accion.TODOS];

export const MODULOS: ModuloDef[] = [
    {
        key: 'dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        href: '/dashboard',
        permiso: 'dashboard.ver',
        acciones: [Accion.VER, Accion.TODOS],
    },
    {
        key: 'usuarios',
        label: 'Usuarios',
        icon: Users,
        href: '/usuarios',
        permiso: 'usuarios.ver',
        acciones: ACCIONES_BASICAS,
    },
    {
        key: 'pme',
        label: 'PME',
        icon: FileText,
        acciones: ACCIONES_BASICAS,
        secciones: [
            { slug: 'gestion', label: 'Gestión', href: '/pme/gestion', icon: FileText },
            { slug: 'acciones', label: 'Acciones', href: '/pme/acciones', icon: FileText },
            { slug: 'actividades', label: 'Actividades', href: '/pme/actividades', icon: FileText },
        ],
    },
    {
        key: 'presupuesto',
        label: 'Presupuesto',
        icon: DollarSign,
        acciones: ACCIONES_CON_APROBAR,
        secciones: [
            { slug: 'mis-solicitudes', label: 'Mis Solicitudes', href: '/presupuesto/mis-solicitudes', icon: User },
            { slug: 'solicitudes', label: 'Solicitudes', href: '/presupuesto/solicitudes', icon: ClipboardList, permisoOverride: 'presupuesto.aprobar', restringido: true },
            { slug: 'convocatorias', label: 'Convocatorias', href: '/presupuesto/convocatorias', icon: Users },
            { slug: 'crear-solicitud', label: 'Crear Solicitud', href: '/presupuesto/crear', icon: Plus },
            { slug: 'importar', label: 'Importar Presupuesto', href: '/presupuesto/importar', icon: Upload, soloAdmin: true },
        ],
    },
    {
        key: 'contabilidad',
        label: 'GO-Contralor',
        icon: Calculator,
        acciones: ACCIONES_BASICAS,
        secciones: [
            { slug: 'contralor-operaciones', label: 'Contralor Operaciones', href: '/presupuesto/contralor-operaciones', icon: Calculator },
            { slug: 'recursos', label: 'Recursos', href: '/presupuesto/recursos', icon: Package },
            { slug: 'categorias', label: 'Categorías de Recursos', href: '/presupuesto/categorias', icon: Tag },
        ],
    },
    {
        key: 'contabilidad',
        label: 'GO-Compras',
        icon: ShoppingCart,
        // Comparte el namespace 'contabilidad' con GO-Contralor (slugs únicos entre ambos grupos).
        secciones: [
            { slug: 'presupuestos', label: 'Presupuestos Anuales', href: '/go-compras/presupuestos', icon: Wallet },
            { slug: 'historial', label: 'Historial', href: '/go-compras/historial', icon: History },
            { slug: 'programar', label: 'Programar Compras', href: '/go-compras/programar', icon: CalendarClock },
            { slug: 'actas', label: 'Actas de Entrega', href: '/go-compras/actas', icon: FileText },
            { slug: 'kpis', label: 'KPIs', href: '/go-compras/kpis', icon: BarChart3 },
        ],
    },
    {
        key: 'requerimiento',
        label: 'Requerimientos',
        icon: FileText,
        href: '/requerimiento',
        permiso: 'requerimiento.ver',
        acciones: ACCIONES_BASICAS,
    },
    {
        key: 'usuarios',
        label: 'Configuración',
        icon: Settings,
        href: '/configuracion',
        permiso: 'usuarios.ver',
        // Comparte namespace 'usuarios'; la fila CRUD ya se muestra en el módulo Usuarios.
    },
];

/** Permiso que gobierna la visibilidad de una sección (usa override si existe). */
export function permisoSeccion(modKey: string, sec: SeccionDef): string {
    return sec.permisoOverride || `${modKey}.${sec.slug}`;
}

/** Clave de sección para la lista blanca de accesos (independiente del override). */
export function seccionKey(modKey: string, sec: SeccionDef): string {
    return `${modKey}.${sec.slug}`;
}

/**
 * Primera ruta del registro (en el orden de `MODULOS`) a la que el usuario tiene acceso.
 *
 * Es la misma lógica de visibilidad que usa el Sidebar (`permisoActivo`/`subVisible`),
 * centralizada aquí para que cualquier página pueda calcular "el módulo del usuario"
 * sin hardcodear una ruta de destino fija. Devuelve `null` si el usuario no tiene
 * acceso a ningún módulo (el llamador decide el respaldo, p.ej. mostrar un aviso).
 */
export function primeraRutaAccesible(
    tienePermiso: (modulo: string, accion: string) => boolean,
    puedeSeccion: (seccionKey: string) => boolean,
): string | null {
    const permisoActivo = (permiso?: string) => {
        if (!permiso) return true;
        const [modulo, accion] = permiso.split('.');
        return tienePermiso(modulo, accion);
    };

    for (const mod of MODULOS) {
        if (mod.secciones && mod.secciones.length > 0) {
            for (const sec of mod.secciones) {
                if (sec.restringido) {
                    if (puedeSeccion(seccionKey(mod.key, sec))) return sec.href;
                    continue;
                }
                if (permisoActivo(permisoSeccion(mod.key, sec)) || permisoActivo(`${mod.key}.ver`)) {
                    return sec.href;
                }
            }
        } else if (mod.href && permisoActivo(mod.permiso)) {
            return mod.href;
        }
    }
    return null;
}
