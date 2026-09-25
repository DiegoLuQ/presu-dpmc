'use client';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api/client';
import {
    Download,
    CalendarClock, Search, Package, DollarSign, Loader2,
    FileText, ClipboardList, Plus, CheckSquare, ShoppingCart,
    X, ChevronDown, ChevronRight, Building2, Layers, Tag,
    Clock, CheckCircle, Truck, ArrowRight, Trash2, Eye,
    SlidersHorizontal, Edit2, RotateCcw, Save, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle,
    Flag, Target, Briefcase, MessageSquare
} from 'lucide-react';
import { BudgetRequest, BudgetDetail, MESES } from '@/lib/types';
import ComprasFilters from '@/components/go-compras/ComprasFilters';
import { useAuth } from '@/context/AuthContext';

// ── Tipos locales ──────────────────────────────────────────────────────────────
/** Un item aplanado de la hoja maestra (detalle + contexto de la solicitud). */
interface MasterItem {
    /** Clave única: `${id_presupuesto}-${id_pre_detalle}` */
    uid: string;
    detalle: BudgetDetail;
    solicitudId: number;
    solicitudCodigo: string;
    area: string;
    cargo: string;
    colegio: string;
    solicitante: string;
    esAprobadoSostenedor?: boolean;
    // Campos de acta de recepción / compra
    cantidad_real?: number;
    valor_real?: number;
    centro_costos?: string;
    observacion?: string;
    motivo?: string;
}
type EstadoCompra = 'Pendiente' | 'En camino' | 'Comprado' | 'En revisión' | 'Aprobado';
interface Proveedor {
    id: string;
    nombre: string;
    rut: string;
    email: string;
    correo: string;
    direccion: string;
    estado: 'Activo' | 'Inactivo';
}
interface OrdenTrabajo {
    id: string;
    codigo: string;
    fecha: string;
    items: any[];
    [key: string]: any;
}
// ── Helpers ────────────────────────────────────────────────────────────────────
const LS_KEY_OTS = 'go-compras-ots';
const LS_KEY_ITEMS_ESTADO = 'go-compras-items-estado';
const LS_KEY_COLS = 'go-compras-cols-config';
const LS_KEY_PAGE_SIZE = 'go-compras-page-size';
const PAGE_SIZE_OPTIONS = [30, 50, 100, 150, 200, 250, 350] as const;
const SIN_MOTIVO_LABEL = '(En blanco / Sin motivo)';
// Definición de columnas configurables de la hoja maestra.
// Producto, checkbox y # siempre se muestran.
const COLUMNAS_MAESTRA = [
    { key: 'codigo_solicitud', label: 'Cód. Solicitud (REQ-...)' },
    { key: 'codigo_cuenta', label: 'Cód. Cuenta Contable' },
    { key: 'descripcion', label: 'Descripción Producto' },
    { key: 'actividad_pme', label: 'Nombre de Actividad del PME' },
    { key: 'motivo', label: 'Just. Actividad / Motivo' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'grupo', label: 'Línea / Grupo' },
    { key: 'destino', label: 'Destino de Uso' },
    { key: 'cantidad', label: 'Cantidad Presupuestada' },
    { key: 'total', label: 'Monto Presupuestado' },
    { key: 'cantidad_real', label: 'Cantidad Real' },
    { key: 'monto_real', label: 'Monto Real' },
    { key: 'centro_costos', label: 'Subvención' },
    { key: 'observacion', label: 'Observación' },
    { key: 'fecha', label: 'Fecha Solicitud' },
    { key: 'origen', label: 'Origen' },
    { key: 'area', label: 'Área' },
    { key: 'solicitante', label: 'Solicitante' },
    { key: 'estado', label: 'Estado Compra' },
] as const;
const COLS_DEFAULT: Record<string, boolean> = {
    codigo_solicitud: false,
    codigo_cuenta: false,
    descripcion: true,
    actividad_pme: true,
    motivo: false,
    categoria: true,
    grupo: true,
    destino: true,
    cantidad: true,
    total: true,
    cantidad_real: true,
    monto_real: true,
    centro_costos: true,
    observacion: true,
    fecha: true,
    origen: true,
    area: true,
    solicitante: false,
    estado: true,
};
function loadColsConfig(): Record<string, boolean> {
    try {
        const raw = localStorage.getItem(LS_KEY_COLS);
        if (!raw) return { ...COLS_DEFAULT };
        const parsed = JSON.parse(raw);
        return { ...COLS_DEFAULT, ...parsed };
    } catch { return { ...COLS_DEFAULT }; }
}
function saveColsConfig(c: Record<string, boolean>) {
    localStorage.setItem(LS_KEY_COLS, JSON.stringify(c));
}
const LS_KEY_ACTA_COLS = 'go-compras-acta-cols-config';
const COLUMNAS_ACTA = [
    { key: 'cargo', label: 'Cargo' },
    { key: 'descripcion', label: 'Descripción Producto' },
    { key: 'motivo', label: 'Just. Actividad / Motivo' },
    { key: 'cantidad', label: 'Cant. Presupuestada' },
    { key: 'cantidad_real', label: 'Cantidad Real' },
    { key: 'monto_real', label: 'P. Real / Monto Real' },
    { key: 'centro_costos', label: 'Subvención' },
    { key: 'observacion', label: 'Observación' },
    { key: 'estado', label: 'Estado' },
] as const;
const ACTA_COLS_DEFAULT: Record<string, boolean> = {
    cargo: false,
    descripcion: false,
    motivo: false,
    cantidad: true,
    cantidad_real: true,
    monto_real: false,
    centro_costos: false,
    observacion: false,
    estado: true,
};
function loadActaColsConfig(): Record<string, boolean> {
    try {
        const raw = localStorage.getItem(LS_KEY_ACTA_COLS);
        if (!raw) return { ...ACTA_COLS_DEFAULT };
        return JSON.parse(raw);
    } catch { return { ...ACTA_COLS_DEFAULT }; }
}
function saveActaColsConfig(c: Record<string, boolean>) {
    localStorage.setItem(LS_KEY_ACTA_COLS, JSON.stringify(c));
}
const formatCLP = (value: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value || 0);
function loadOTs(): OrdenTrabajo[] {
    try { return JSON.parse(localStorage.getItem(LS_KEY_OTS) || '[]'); } catch { return []; }
}
function saveOTs(ots: OrdenTrabajo[]) { localStorage.setItem(LS_KEY_OTS, JSON.stringify(ots)); }
function loadItemEstados(): Record<string, EstadoCompra> {
    try { return JSON.parse(localStorage.getItem(LS_KEY_ITEMS_ESTADO) || '{}'); } catch { return {}; }
}
function saveItemEstados(m: Record<string, EstadoCompra>) { localStorage.setItem(LS_KEY_ITEMS_ESTADO, JSON.stringify(m)); }
const LS_KEY_PROV = 'go-compras-proveedores';
const DEFAULT_PROV: Proveedor[] = [
    {
        id: '1',
        nombre: 'Distribuidora Papelera S.A.',
        rut: '77.777.777-7',
        email: 'ventas@papelera.cl',
        correo: 'contacto@papelera.cl',
        direccion: 'Av. El Salto 1234, Santiago',
        estado: 'Activo'
    },
    {
        id: '2',
        nombre: 'Librería Nacional',
        rut: '88.888.888-8',
        email: 'ventas@nacional.cl',
        correo: 'info@nacional.cl',
        direccion: 'Huérfanos 930, Santiago',
        estado: 'Activo'
    }
];
function loadProveedores(): Proveedor[] {
    try {
        const raw = localStorage.getItem(LS_KEY_PROV);
        if (!raw) {
            localStorage.setItem(LS_KEY_PROV, JSON.stringify(DEFAULT_PROV));
            return DEFAULT_PROV;
        }
        return JSON.parse(raw);
    } catch { return DEFAULT_PROV; }
}
function saveProveedores(provs: Proveedor[]) {
    localStorage.setItem(LS_KEY_PROV, JSON.stringify(provs));
}
function nextOTCode(ots: OrdenTrabajo[]) {
    const y = new Date().getFullYear();
    const existing = ots.filter(o => o.codigo.startsWith(`OT-${y}-`));
    const max = existing.reduce((mx, o) => {
        const n = parseInt(o.codigo.split('-').pop() || '0', 10);
        return n > mx ? n : mx;
    }, 0);
    return `OT-${y}-${String(max + 1).padStart(3, '0')}`;
}
// ── Componente principal ───────────────────────────────────────────────────────
export default function ProgramarComprasPage() {
    const router = useRouter();
    const { user, setSidebarCollapsed } = useAuth();

    // Colapsar automáticamente el sidebar al ingresar a Programar Compras
    useEffect(() => {
        setSidebarCollapsed(true);
    }, [setSidebarCollapsed]);

    const subareaNombre = (user?.cargo?.nombre || '').toLowerCase();
    const subareasNombres = (user?.cargos || []).map(s => (s.nombre || '').toLowerCase());
    
    // Exclusivo Jefe de Compras
    const esJefeComprasSubarea = subareaNombre.includes('jefe de compras') || 
                                 subareaNombre.includes('jefe compras') || 
                                 subareasNombres.some(s => s.includes('jefe de compras') || s.includes('jefe compras'));

    // Asistente de Compras
    const esAsistenteComprasSubarea = subareaNombre.includes('asistente de compras') || 
                                      subareaNombre.includes('asistente compras') || 
                                      subareasNombres.some(s => s.includes('asistente de compras') || s.includes('asistente compras'));

    const esAdmin = user?.rol?.codigo === 'ADM';

    // Botón de revisión de cambios: Exclusivo Administrador y Jefe de Compras
    const puedeVerBotonRevisionJefe = esAdmin || esJefeComprasSubarea;

    // Edición del select de estado en la tabla: Administrador, Jefe de Compras y Asistente de Compras
    const puedeEditarEstadoTabla = esAdmin || esJefeComprasSubarea || esAsistenteComprasSubarea;
    const puedeEditarJefe = esAdmin || esJefeComprasSubarea;

        // Filtros globales (persistidos en localStorage)
    const [colegioId, setColegioId] = useState('');
    const [isMounted, setIsMounted] = useState(false);
    const [year, setYear] = useState(String(new Date().getFullYear()));
    // Datos
    const [compras, setCompras] = useState<BudgetRequest[]>([]);
    const [loading, setLoading] = useState(true);
    // Pestañas
    const [tab, setTab] = useState<'maestra' | 'proveedores'>('maestra');
    // Filtros de hoja maestra
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategorias, setFilterCategorias] = useState<string[]>([]);
    const [isCategoriasDropdownOpen, setIsCategoriasDropdownOpen] = useState(false);
    const [filterGrupos, setFilterGrupos] = useState<string[]>([]);
    const [isGruposDropdownOpen, setIsGruposDropdownOpen] = useState(false);
    const [filterDestinos, setFilterDestinos] = useState<string[]>([]);
    const [isDestinosDropdownOpen, setIsDestinosDropdownOpen] = useState(false);
    const [filterMotivos, setFilterMotivos] = useState<string[]>([]);
    const [isMotivosDropdownOpen, setIsMotivosDropdownOpen] = useState(false);
    const [motivoSearchQuery, setMotivoSearchQuery] = useState('');
    const [filterAreas, setFilterAreas] = useState<string[]>([]);
    const [isAreasDropdownOpen, setIsAreasDropdownOpen] = useState(false);
    const [filterSubareas, setFilterSubareas] = useState<string[]>([]);
    const [isSubareasDropdownOpen, setIsSubareasDropdownOpen] = useState(false);
    const [filterEstadosCompra, setFilterEstadosCompra] = useState<EstadoCompra[]>([]);
    const [isEstadosDropdownOpen, setIsEstadosDropdownOpen] = useState(false);
    const [filterFechaDesde, setFilterFechaDesde] = useState('');
    const [filterFechaHasta, setFilterFechaHasta] = useState('');
    const [filterMeses, setFilterMeses] = useState<string[]>([]);
    const [isMesesDropdownOpen, setIsMesesDropdownOpen] = useState(false);
    const [showOnlyPendientes, setShowOnlyPendientes] = useState(false);
    // Ordenamiento dinámico de columnas (A-Z / Z-A / menor a mayor / mayor a menor)
    type SortDir = 'asc' | 'desc';
    interface SortConfig {
        key: string;
        direction: SortDir;
    }
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const handleSort = (key: string) => {
        setSortConfig(prev => {
            if (!prev || prev.key !== key) {
                return { key, direction: 'asc' };
            }
            if (prev.direction === 'asc') {
                return { key, direction: 'desc' };
            }
            return null; // 3er clic restaura el orden por defecto
        });
    };
    // Configuración de columnas visibles
    const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({ ...COLS_DEFAULT });
    const [showColsModal, setShowColsModal] = useState(false);
    // Paginación configurable (30, 50, 100) persistida en localStorage
    const [itemsPerPage, setItemsPerPage] = useState<number>(30);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [filtersInitialized, setFiltersInitialized] = useState(false);

    // Restaurar todos los filtros guardados en localStorage al cargar la página
    useEffect(() => {
        try {
            const savedColegio = localStorage.getItem('go-compras-filter-colegio');
            if (savedColegio !== null) setColegioId(savedColegio);

            const savedYear = localStorage.getItem('go-compras-filter-year');
            if (savedYear !== null) setYear(savedYear);

            const savedSearch = localStorage.getItem('go-compras-filter-search');
            if (savedSearch !== null) setSearchTerm(savedSearch);

            const savedMeses = localStorage.getItem('go-compras-filter-meses');
            if (savedMeses !== null) {
                try { setFilterMeses(JSON.parse(savedMeses)); } catch {}
            }

            const savedAreas = localStorage.getItem('go-compras-filter-areas') || localStorage.getItem('go-compras-filter-area');
            if (savedAreas !== null) {
                try {
                    const parsed = JSON.parse(savedAreas);
                    if (Array.isArray(parsed)) setFilterAreas(parsed);
                    else if (typeof parsed === 'string' && parsed) setFilterAreas([parsed]);
                } catch {
                    if (savedAreas) setFilterAreas([savedAreas]);
                }
            }

            const savedSubareas = localStorage.getItem('go-compras-filter-cargos') || localStorage.getItem('go-compras-filter-cargo');
            if (savedSubareas !== null) {
                try {
                    const parsed = JSON.parse(savedSubareas);
                    if (Array.isArray(parsed)) setFilterSubareas(parsed);
                    else if (typeof parsed === 'string' && parsed) setFilterSubareas([parsed]);
                } catch {
                    if (savedSubareas) setFilterSubareas([savedSubareas]);
                }
            }

            const savedEstados = localStorage.getItem('go-compras-filter-estados') || localStorage.getItem('go-compras-filter-estado');
            if (savedEstados !== null) {
                try {
                    const parsed = JSON.parse(savedEstados);
                    if (Array.isArray(parsed)) setFilterEstadosCompra(parsed);
                    else if (typeof parsed === 'string' && parsed) setFilterEstadosCompra([parsed as any]);
                } catch {
                    if (savedEstados) setFilterEstadosCompra([savedEstados as any]);
                }
            }

            const savedDesde = localStorage.getItem('go-compras-filter-fecha-desde');
            if (savedDesde !== null) setFilterFechaDesde(savedDesde);

            const savedHasta = localStorage.getItem('go-compras-filter-fecha-hasta');
            if (savedHasta !== null) setFilterFechaHasta(savedHasta);

            const savedCats = localStorage.getItem('go-compras-filter-categorias') || localStorage.getItem('go-compras-filter-categoria');
            if (savedCats !== null) {
                try {
                    const parsed = JSON.parse(savedCats);
                    if (Array.isArray(parsed)) setFilterCategorias(parsed);
                    else if (typeof parsed === 'string' && parsed) setFilterCategorias([parsed]);
                } catch {
                    if (savedCats) setFilterCategorias([savedCats]);
                }
            }

            const savedGrupos = localStorage.getItem('go-compras-filter-grupos');
            if (savedGrupos !== null) {
                try {
                    const parsed = JSON.parse(savedGrupos);
                    if (Array.isArray(parsed)) setFilterGrupos(parsed);
                    else if (typeof parsed === 'string' && parsed) setFilterGrupos([parsed]);
                } catch {
                    if (savedGrupos) setFilterGrupos([savedGrupos]);
                }
            }

            const savedDestinos = localStorage.getItem('go-compras-filter-destinos');
            if (savedDestinos !== null) {
                try {
                    const parsed = JSON.parse(savedDestinos);
                    if (Array.isArray(parsed)) setFilterDestinos(parsed);
                    else if (typeof parsed === 'string' && parsed) setFilterDestinos([parsed]);
                } catch {}
            }

            const savedMotivos = localStorage.getItem('go-compras-filter-motivos');
            if (savedMotivos !== null) {
                try {
                    const parsed = JSON.parse(savedMotivos);
                    if (Array.isArray(parsed)) setFilterMotivos(parsed);
                    else if (typeof parsed === 'string' && parsed) setFilterMotivos([parsed]);
                } catch {
                    if (savedMotivos) setFilterMotivos([savedMotivos]);
                }
            }

            const savedPendientes = localStorage.getItem('go-compras-filter-show-pendientes');
            if (savedPendientes !== null) setShowOnlyPendientes(savedPendientes === 'true');

            const savedSize = localStorage.getItem(LS_KEY_PAGE_SIZE);
            if (savedSize) {
                const parsed = parseInt(savedSize, 10);
                if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)) {
                    setItemsPerPage(parsed);
                }
            }
        } catch (e) {
            console.error('Error cargando filtros de localStorage:', e);
        } finally {
            setFiltersInitialized(true);
            setIsMounted(true);
        }
    }, []);

    // Handlers con autosave a localStorage
    const handleColegioChange = (val: string) => {
        setColegioId(val);
        try { localStorage.setItem('go-compras-filter-colegio', val); } catch {}
    };
    const handleYearChange = (val: string) => {
        setYear(val);
        try { localStorage.setItem('go-compras-filter-year', val); } catch {}
    };
    const handleSearchChange = (val: string) => {
        setSearchTerm(val);
        try { localStorage.setItem('go-compras-filter-search', val); } catch {}
    };
    const handleToggleMes = (mes: string) => {
        setFilterMeses(prev => {
            const next = prev.includes(mes) ? prev.filter(m => m !== mes) : [...prev, mes];
            try { localStorage.setItem('go-compras-filter-meses', JSON.stringify(next)); } catch {}
            return next;
        });
    };
    const handleSetMeses = (meses: string[]) => {
        setFilterMeses(meses);
        try { localStorage.setItem('go-compras-filter-meses', JSON.stringify(meses)); } catch {}
    };
    const handleToggleArea = (area: string) => {
        setFilterAreas(prev => {
            const next = prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area];
            try { localStorage.setItem('go-compras-filter-areas', JSON.stringify(next)); } catch {}
            return next;
        });
    };
    const handleSetAreas = (areas: string[]) => {
        setFilterAreas(areas);
        try { localStorage.setItem('go-compras-filter-areas', JSON.stringify(areas)); } catch {}
    };
    const handleToggleSubarea = (cargo: string) => {
        setFilterSubareas(prev => {
            const next = prev.includes(cargo) ? prev.filter(c => c !== cargo) : [...prev, cargo];
            try { localStorage.setItem('go-compras-filter-cargos', JSON.stringify(next)); } catch {}
            return next;
        });
    };
    const handleSetSubareas = (cargos: string[]) => {
        setFilterSubareas(cargos);
        try { localStorage.setItem('go-compras-filter-cargos', JSON.stringify(cargos)); } catch {}
    };
    const handleToggleEstadoCompra = (val: EstadoCompra) => {
        setFilterEstadosCompra(prev => {
            const next = prev.includes(val) ? prev.filter(e => e !== val) : [...prev, val];
            try { localStorage.setItem('go-compras-filter-estados', JSON.stringify(next)); } catch {}
            return next;
        });
    };
    const handleSetEstadosCompra = (vals: EstadoCompra[]) => {
        setFilterEstadosCompra(vals);
        try { localStorage.setItem('go-compras-filter-estados', JSON.stringify(vals)); } catch {}
    };
    const handleFechaDesdeChange = (val: string) => {
        setFilterFechaDesde(val);
        try { localStorage.setItem('go-compras-filter-fecha-desde', val); } catch {}
    };
    const handleFechaHastaChange = (val: string) => {
        setFilterFechaHasta(val);
        try { localStorage.setItem('go-compras-filter-fecha-hasta', val); } catch {}
    };
    const handleToggleCategoria = (val: string) => {
        setFilterCategorias(prev => {
            const next = prev.includes(val) ? prev.filter(c => c !== val) : [...prev, val];
            try { localStorage.setItem('go-compras-filter-categorias', JSON.stringify(next)); } catch {}
            return next;
        });
    };
    const handleSetCategorias = (vals: string[]) => {
        setFilterCategorias(vals);
        try { localStorage.setItem('go-compras-filter-categorias', JSON.stringify(vals)); } catch {}
    };
    const handleToggleGrupo = (val: string) => {
        setFilterGrupos(prev => {
            const next = prev.includes(val) ? prev.filter(g => g !== val) : [...prev, val];
            try { localStorage.setItem('go-compras-filter-grupos', JSON.stringify(next)); } catch {}
            return next;
        });
    };
    const handleSetGrupos = (vals: string[]) => {
        setFilterGrupos(vals);
        try { localStorage.setItem('go-compras-filter-grupos', JSON.stringify(vals)); } catch {}
    };
    const handleToggleDestino = (val: string) => {
        setFilterDestinos(prev => {
            const next = prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val];
            try { localStorage.setItem('go-compras-filter-destinos', JSON.stringify(next)); } catch {}
            return next;
        });
    };
    const handleSetDestinos = (vals: string[]) => {
        setFilterDestinos(vals);
        try { localStorage.setItem('go-compras-filter-destinos', JSON.stringify(vals)); } catch {}
    };
    const handleToggleMotivo = (val: string) => {
        setFilterMotivos(prev => {
            const next = prev.includes(val) ? prev.filter(m => m !== val) : [...prev, val];
            try { localStorage.setItem('go-compras-filter-motivos', JSON.stringify(next)); } catch {}
            return next;
        });
    };
    const handleSetMotivos = (vals: string[]) => {
        setFilterMotivos(vals);
        try { localStorage.setItem('go-compras-filter-motivos', JSON.stringify(vals)); } catch {}
    };
    const handleTogglePendientes = () => {
        setShowOnlyPendientes(prev => {
            const next = !prev;
            try { localStorage.setItem('go-compras-filter-show-pendientes', String(next)); } catch {}
            return next;
        });
    };
    const tieneFiltrosActivos = Boolean(
        searchTerm || filterMeses.length > 0 || filterAreas.length > 0 || filterSubareas.length > 0 ||
        filterEstadosCompra.length > 0 || filterFechaDesde || filterFechaHasta || filterCategorias.length > 0 ||
        filterGrupos.length > 0 || filterDestinos.length > 0 || filterMotivos.length > 0 || showOnlyPendientes || colegioId
    );

    const limpiarFiltros = () => {
        setSearchTerm('');
        setFilterMeses([]);
        setFilterAreas([]);
        setFilterSubareas([]);
        setFilterEstadosCompra([]);
        setFilterFechaDesde('');
        setFilterFechaHasta('');
        setFilterCategorias([]);
        setFilterGrupos([]);
        setFilterDestinos([]);
        setFilterMotivos([]);
        setSortConfig(null);
        setShowOnlyPendientes(false);
        setColegioId('');
        try {
            localStorage.removeItem('go-compras-filter-colegio');
            localStorage.removeItem('go-compras-filter-year');
            localStorage.removeItem('go-compras-filter-search');
            localStorage.removeItem('go-compras-filter-meses');
            localStorage.removeItem('go-compras-filter-areas');
            localStorage.removeItem('go-compras-filter-area');
            localStorage.removeItem('go-compras-filter-cargos');
            localStorage.removeItem('go-compras-filter-cargo');
            localStorage.removeItem('go-compras-filter-estados');
            localStorage.removeItem('go-compras-filter-estado');
            localStorage.removeItem('go-compras-filter-fecha-desde');
            localStorage.removeItem('go-compras-filter-fecha-hasta');
            localStorage.removeItem('go-compras-filter-categorias');
            localStorage.removeItem('go-compras-filter-categoria');
            localStorage.removeItem('go-compras-filter-grupos');
            localStorage.removeItem('go-compras-filter-destinos');
            localStorage.removeItem('go-compras-filter-motivos');
            localStorage.removeItem('go-compras-filter-show-pendientes');
        } catch {}
    };

    const handleItemsPerPageChange = (size: number) => {
        setItemsPerPage(size);
        setCurrentPage(1);
        try {
            localStorage.setItem(LS_KEY_PAGE_SIZE, String(size));
        } catch (e) {
            console.error('Error guardando page size en localStorage:', e);
        }
    };
    // Selección
    // Selección
    const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
    // Estados e info extra persistidos por item
    const [itemEstados, setItemEstados] = useState<Record<string, EstadoCompra>>({});
    const [itemExtras, setItemExtras] = useState<Record<string, { centro_costos?: string; observacion?: string; motivo?: string; cantidad_real?: number; valor_real?: number; monto_real?: number }>>({});
    // Subvenciones activas desde API
    const [subvencionesActivas, setSubvencionesActivas] = useState<{ id_subvencion: number; nombre_corto: string; nombre_completo: string }[]>([]);
    // Proveedores
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [showProvModal, setShowProvModal] = useState(false);
    const [editingProv, setEditingProv] = useState<Proveedor | null>(null);
    const [provForm, setProvForm] = useState({
        nombre: '',
        rut: '',
        email: '',
        correo: '',
        direccion: '',
        estado: 'Activo' as 'Activo' | 'Inactivo'
    });
    // Edición de precio real del recurso
    const [editItem, setEditItem] = useState<MasterItem | null>(null);
    const [editPriceInput, setEditPriceInput] = useState('');
    const [editPresupuestoPriceInput, setEditPresupuestoPriceInput] = useState('');
    const [editQtyInput, setEditQtyInput] = useState('');
    const [savingItem, setSavingItem] = useState(false);
    // Modal de Actas de Entrega Oficiales con Correlativo
    const [showActasModal, setShowActasModal] = useState(false);
    const getInicialesUsuario = (nombre?: string) => {
        if (!nombre) return 'ACT';
        const partes = nombre.trim().split(/\s+/).filter(Boolean);
        if (partes.length === 0) return 'ACT';
        if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
        return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    };

    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [loadingCorrelativo, setLoadingCorrelativo] = useState(false);
    const [isEmittingActa, setIsEmittingActa] = useState(false);
    const [areasJefes, setAreasJefes] = useState<{ id_area: number; nombre: string; jefe_nombre?: string; jefes?: { id_jefe: number; jefe_nombre?: string }[] }[]>([]);
    const [actaForm, setActaForm] = useState({
        numeroCorrelativo: 1,
        codigoActa: 'ACT - N°001/2026',
        fecha: new Date().toISOString().split('T')[0],
        ciudad: 'ALTO HOSPICIO',
        paraNombre: '',
        paraCargo: '',
        deEmisor: 'GERENCIA DE OPERACIONES',
        asunto: 'ENTREGA DE MATERIALES E INSUMOS',
        numeroFactura: '',
        observacion: '',
        actualizarEstado: 'Comprado' as EstadoCompra
    });

    // Actas emitidas y modal de visualización de acta existente
    const [actasEmitidas, setActasEmitidas] = useState<any[]>([]);
    const [viewingActa, setViewingActa] = useState<any | null>(null);
    const [downloadingActaPdfId, setDownloadingActaPdfId] = useState<number | null>(null);

    const handleDownloadSingleActaPdf = async (idActa: number, codActa: string) => {
        setDownloadingActaPdfId(idActa);
        try {
            const res = await api.get(`/presupuesto/compras/actas/${idActa}/pdf`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `Acta_${codActa.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Error descargando PDF de acta:', e);
            alert('No se pudo descargar el PDF del acta.');
        } finally {
            setDownloadingActaPdfId(null);
        }
    };

    const handleOpenActasModal = async () => {
        const itemsAProcesar = selectedUids.size > 0
            ? masterItems.filter(i => selectedUids.has(i.uid))
            : filtered.filter(i => i.detalle.estado_aprobacion === 'Aprobado');

        if (itemsAProcesar.length === 0) {
            alert('No hay recursos seleccionados para generar el acta.');
            return;
        }

        setShowActasModal(true);
        setLoadingCorrelativo(true);

        const colId = colegioId ? parseInt(colegioId, 10) : (itemsAProcesar[0]?.colegio?.toLowerCase().includes('diego') ? 2 : 1);
        const anho = year ? parseInt(year, 10) : new Date().getFullYear();

        const primerItem = itemsAProcesar[0];
        const asuntoSugerido = primerItem?.detalle?.nombre_producto
            ? `ENTREGA ${primerItem.detalle.nombre_producto.toUpperCase()}`
            : 'ENTREGA DE MATERIALES E INSUMOS';

        let paraNombreSugerido = primerItem?.solicitante || '';
        let paraCargoSugerido = primerItem?.area || primerItem?.cargo || 'Jefatura de Área';

        try {
            // Cargar áreas y sus jefes asignados
            const [resCorr, resAreas] = await Promise.all([
                api.get(`/presupuesto/compras/actas/siguiente-correlativo?id_colegio=${colId}&year=${anho}`),
                api.get('/catalogos/areas/jefes', { params: { id_colegio: colId } }).catch(() => ({ data: [] }))
            ]);

            const listaAreas = resAreas.data || [];
            setAreasJefes(listaAreas);

            const itemArea = primerItem?.area || '';
            const matchArea = listaAreas.find((a: any) =>
                a.nombre.toLowerCase().trim() === itemArea.toLowerCase().trim() ||
                a.nombre.toLowerCase().includes(itemArea.toLowerCase()) ||
                itemArea.toLowerCase().includes(a.nombre.toLowerCase())
            );

            if (matchArea) {
                const jNombre = matchArea.jefe_nombre || (matchArea.jefes && matchArea.jefes[0]?.jefe_nombre);
                if (jNombre) {
                    paraNombreSugerido = `${jNombre} - ${matchArea.nombre}`;
                } else if (primerItem?.solicitante) {
                    paraNombreSugerido = `${primerItem.solicitante} - ${matchArea.nombre}`;
                } else {
                    paraNombreSugerido = matchArea.nombre;
                }
                paraCargoSugerido = matchArea.nombre;
            } else if (primerItem?.solicitante) {
                const areaCargo = primerItem?.area || primerItem?.cargo || '';
                paraNombreSugerido = areaCargo ? `${primerItem.solicitante} - ${areaCargo}` : primerItem.solicitante;
                paraCargoSugerido = areaCargo || 'Jefatura de Área';
            }

            setActaForm({
                numeroCorrelativo: resCorr.data.numero_correlativo,
                codigoActa: resCorr.data.codigo_acta,
                fecha: new Date().toISOString().split('T')[0],
                ciudad: 'ALTO HOSPICIO',
                paraNombre: paraNombreSugerido,
                paraCargo: paraCargoSugerido,
                deEmisor: 'GERENCIA DE OPERACIONES',
                asunto: asuntoSugerido,
                numeroFactura: '',
                observacion: '',
                actualizarEstado: 'Comprado'
            });
        } catch (err) {
            console.error('Error cargando datos para acta:', err);
            const ini = getInicialesUsuario(user?.nombre);
            setActaForm({
                numeroCorrelativo: 1,
                codigoActa: `${ini} - N°001/${anho}`,
                fecha: new Date().toISOString().split('T')[0],
                ciudad: 'ALTO HOSPICIO',
                paraNombre: paraNombreSugerido,
                paraCargo: paraCargoSugerido,
                deEmisor: 'GERENCIA DE OPERACIONES',
                asunto: asuntoSugerido,
                numeroFactura: '',
                observacion: '',
                actualizarEstado: 'Comprado'
            });
        } finally {
            setLoadingCorrelativo(false);
        }
    };

    const handleGuardarYEmitirActa = async (itemsAProcesar: MasterItem[]) => {
        if (!actaForm.paraNombre.trim()) {
            alert('Por favor ingrese el nombre del receptor (PARA).');
            return;
        }
        if (!actaForm.asunto.trim()) {
            alert('Por favor ingrese el asunto de la entrega.');
            return;
        }

        setIsEmittingActa(true);
        try {
            const colId = colegioId ? parseInt(colegioId, 10) : (itemsAProcesar[0]?.colegio?.toLowerCase().includes('diego') ? 2 : 1);
            const payload = {
                id_colegio: colId,
                id_presupuesto: itemsAProcesar[0]?.solicitudId,
                numero_correlativo: actaForm.numeroCorrelativo,
                codigo_acta: actaForm.codigoActa,
                fecha: actaForm.fecha,
                ciudad: actaForm.ciudad,
                para_nombre: actaForm.paraNombre,
                para_cargo: actaForm.paraCargo,
                de_emisor: actaForm.deEmisor,
                asunto: actaForm.asunto,
                numero_factura: actaForm.numeroFactura,
                observacion: actaForm.observacion,
                actualizar_estado_items: actaForm.actualizarEstado,
                items: itemsAProcesar.map(it => {
                    const qtyReal = it.cantidad_real !== undefined ? it.cantidad_real : it.detalle.cantidad;
                    return {
                        id_pre_detalle: it.detalle.id_pre_detalle,
                        nombre_producto: it.detalle.nombre_producto,
                        descripcion: it.detalle.descripcion || '',
                        cantidad: Number(qtyReal),
                        formato_unidad: it.detalle.formato_unidad || 'UNIDAD',
                        solicitud_codigo: it.solicitudCodigo,
                        cargo_area: it.cargo || it.area
                    };
                })
            };

            const res = await api.post('/presupuesto/compras/actas', payload);
            const actaCreada = res.data;

            // Descargar PDF oficial generado
            const pdfRes = await api.get(`/presupuesto/compras/actas/${actaCreada.id_acta}/pdf`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([pdfRes.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `Acta_${actaCreada.codigo_acta.replace(/[\s\/]/g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            // Sincronizar estado local
            const nextEstados = { ...itemEstados };
            itemsAProcesar.forEach(i => {
                nextEstados[i.uid] = actaForm.actualizarEstado || 'Comprado';
            });
            setItemEstados(nextEstados);
            saveItemEstados(nextEstados);

            setSelectedUids(new Set());
            setShowActasModal(false);
            await fetchCompras();
        } catch (err: any) {
            console.error('Error emitiendo acta:', err);
            alert(err.response?.data?.detail || 'Error al emitir el acta.');
        } finally {
            setIsEmittingActa(false);
        }
    };

    // Modal de Confirmación / Resumen de Cambios al guardar una fila
    const [savedItemSummary, setSavedItemSummary] = useState<{
        nombre_producto: string;
        codigo_solicitud: string;
        cant_real: number;
        val_real: number;
        total_real: number;
        centro_costos: string;
        observacion: string;
        estado: string;
    } | null>(null);

    // Edición de Justificación / Motivo con propuesta a Jefe de Compras
        // Modal de confirmación al cambiar estado desde el select
    const [confirmChangeEstadoModal, setConfirmChangeEstadoModal] = useState<{
        item: MasterItem;
        estadoAnterior: EstadoCompra;
        nuevoEstado: EstadoCompra;
    } | null>(null);
    const [isSavingEstadoChange, setIsSavingEstadoChange] = useState(false);

    const handleConfirmarCambioEstado = async () => {
        if (!confirmChangeEstadoModal) return;
        const { item, nuevoEstado } = confirmChangeEstadoModal;
        setIsSavingEstadoChange(true);
        try {
            const updated = { ...itemEstados, [item.uid]: nuevoEstado };
            setItemEstados(updated);
            saveItemEstados(updated);
            await api.put(`/presupuesto/detalles/${item.detalle.id_pre_detalle}`, {
                estado_compra: nuevoEstado
            });
            setConfirmChangeEstadoModal(null);
        } catch (err) {
            console.error('Error sincronizando estado en servidor:', err);
            alert('Ocurrió un error al actualizar el estado.');
        } finally {
            setIsSavingEstadoChange(false);
        }
    };

    const [editJustificationItem, setEditJustificationItem] = useState<MasterItem | null>(null);
    const [editModalCantReal, setEditModalCantReal] = useState<number>(0);
    const [editModalPrecioReal, setEditModalPrecioReal] = useState<number>(0);
    const [editModalObservacion, setEditModalObservacion] = useState<string>('');
    const [editModalCentroCostos, setEditModalCentroCostos] = useState<string>('GENERAL');
    const [editModalEstado, setEditModalEstado] = useState<EstadoCompra>('Pendiente');
    const [editJustificationText, setEditJustificationText] = useState('');
    const [editJustificationMotivoCambio, setEditJustificationMotivoCambio] = useState('');
    const [sendingModPropuesta, setSendingModPropuesta] = useState(false);
    const [solicitudesModPendientes, setSolicitudesModPendientes] = useState<any[]>([]);
    const [showRevisionModModal, setShowRevisionModModal] = useState(false);
    const [respondingModId, setRespondingModId] = useState<number | null>(null);

    /**
     * Descarga el PDF oficial de actas generado en el backend (Python/ReportLab).
     * El backend imprime CADA ACTA EN SU PROPIA HOJA: 2 actas = 2 páginas.
     */
    
    /**
     * Exporta los recursos seleccionados a una planilla Excel nativa (.xlsx)
     * con diseño temático por colegio:
     * - Macaya: Verde institucional (#065F46 / #059669 / #D1FAE5)
     * - Diego Portales: Azul institucional (#1E3A8A / #2563EB / #DBEAFE)
     * Con formato numérico monetario nativo ($#,##0) y anchos de columna automáticos.
     */
    const handleExportarExcelRecursos = async (itemsAExportar: MasterItem[]) => {
        if (!itemsAExportar || itemsAExportar.length === 0) {
            alert('No hay recursos seleccionados para exportar.');
            return;
        }

        // Determinar colegio predominante
        const primerColegio = (itemsAExportar[0]?.colegio || '').toLowerCase();
        const esMacaya = colegioId === '1' || primerColegio.includes('macaya') || (!colegioId && !primerColegio.includes('diego'));
        const colegioNombreDisplay = esMacaya ? 'Colegio Macaya' : 'Colegio Diego Portales';
        const slugColegio = esMacaya ? 'Macaya' : 'Diego_Portales';

        // Colores temáticos ARGB (ExcelJS usa ARGB hexadecimal)
        const primaryColor = esMacaya ? 'FF065F46' : 'FF1E3A8A';
        const lightBgColor = esMacaya ? 'FFD1FAE5' : 'FFDBEAFE';
        const zebraColor = esMacaya ? 'FFF0FDF4' : 'FFEFE6FF';
        const accentTextColor = esMacaya ? 'FF064E3B' : 'FF1E3A8A';
        const borderColor = esMacaya ? 'FFA7F3D0' : 'FFBFDBFE';

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'MCDP-PPA';
        workbook.created = new Date();
        const worksheet = workbook.addWorksheet('Recursos y Compras', {
            views: [{ showGridLines: true }]
        });

        // 1. Título Banner
        const titleRow = worksheet.addRow(['REPORTE DETALLADO DE RECURSOS Y COMPRAS']);
        worksheet.mergeCells('A1:W1');
        titleRow.height = 36;
        titleRow.getCell(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: primaryColor }
        };
        titleRow.getCell(1).font = {
            name: 'Calibri',
            size: 16,
            bold: true,
            color: { argb: 'FFFFFFFF' }
        };
        titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // 2. Subtítulo Banner
        const fechaStr = new Date().toLocaleDateString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const subRow = worksheet.addRow([`Institución: ${colegioNombreDisplay}   |   Fecha de Emisión: ${fechaStr}   |   Total Recursos: ${itemsAExportar.length}`]);
        worksheet.mergeCells('A2:W2');
        subRow.height = 24;
        subRow.getCell(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: lightBgColor }
        };
        subRow.getCell(1).font = {
            name: 'Calibri',
            size: 11,
            bold: true,
            color: { argb: accentTextColor }
        };
        subRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

        // Fila vacía de separación
        worksheet.addRow([]);

        // 3. Encabezados de Tabla
        const headers = [
            '#', 'Colegio', 'Área', 'Usuario Solicitante', 'Cargo',
            'Cód. Solicitud', 'Producto / Recurso', 'Descripción', 'Actividad PME', 'Just. Actividad / Motivo',
            'Categoría', 'Línea / Grupo', 'Destino de Uso', 'Cant. Ppto', 'Formato', 'Val. Unit Ppto',
            'Total Ppto (IVA)', 'Cant. Real', 'Val. Unit Real', 'Total Real (IVA)',
            'Subvención / C. Costos', 'Cód. Cuenta', 'Fecha Solicitud', 'Estado Compra'
        ];

        const headerRow = worksheet.addRow(headers);
        headerRow.height = 28;
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: primaryColor }
            };
            cell.font = {
                name: 'Calibri',
                size: 11,
                bold: true,
                color: { argb: 'FFFFFFFF' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF1E293B' } },
                left: { style: 'thin', color: { argb: 'FF1E293B' } },
                bottom: { style: 'thin', color: { argb: 'FF1E293B' } },
                right: { style: 'thin', color: { argb: 'FF1E293B' } }
            };
        });

        // 4. Filas de Datos
        let totalPptoAcum = 0;
        let totalRealAcum = 0;

        itemsAExportar.forEach((item, idx) => {
            const qtyPpto = Number(item.detalle.cantidad) || 0;
            const valUnitPpto = Number(item.detalle.valor_unitario_iva) || 0;
            const totPpto = Number(item.detalle.total_iva) || (qtyPpto * valUnitPpto);
            totalPptoAcum += totPpto;

            const qtyReal = item.cantidad_real !== undefined ? Number(item.cantidad_real) : qtyPpto;
            const valUnitReal = item.valor_real !== undefined
                ? Number(item.valor_real)
                : (item.detalle.valor_real_iva ? Number(item.detalle.valor_real_iva) / (qtyReal || 1) : valUnitPpto);
            const totReal = (item.cantidad_real !== undefined || item.valor_real !== undefined)
                ? (qtyReal * valUnitReal)
                : (item.detalle.valor_real_iva != null ? Number(item.detalle.valor_real_iva) : (qtyReal * valUnitReal));
            totalRealAcum += totReal;

            const estActual = getEstado(item.uid);
            const isZebra = idx % 2 === 1;

            const row = worksheet.addRow([
                idx + 1,
                item.colegio || colegioNombreDisplay,
                item.area || '—',
                item.solicitante || '—',
                item.cargo || '—',
                item.solicitudCodigo,
                item.detalle.nombre_producto,
                item.detalle.descripcion || '—',
                item.detalle.actividad_nombre || '—',
                item.motivo || item.detalle.motivo || '—',
                item.detalle.categoria_nombre || '—',
                item.detalle.grupo_nombre || '—',
                item.detalle.destino_gasto || 'Estudiante',
                qtyPpto,
                item.detalle.formato_unidad || 'Unidad',
                Math.round(valUnitPpto),
                Math.round(totPpto),
                qtyReal,
                Math.round(valUnitReal),
                Math.round(totReal),
                item.centro_costos || 'GENERAL',
                item.detalle.codigo_cuenta || '—',
                formatFechaSolicitud(item.detalle),
                estActual
            ]);

            row.height = 22;

            row.eachCell((cell, colNumber) => {
                if (isZebra) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: zebraColor }
                    };
                }

                cell.border = {
                    top: { style: 'thin', color: { argb: borderColor } },
                    left: { style: 'thin', color: { argb: borderColor } },
                    bottom: { style: 'thin', color: { argb: borderColor } },
                    right: { style: 'thin', color: { argb: borderColor } }
                };

                cell.font = { name: 'Calibri', size: 10 };
                cell.alignment = { vertical: 'middle', horizontal: 'left' };

                // Formatos numéricos específicos
                if (colNumber === 1 || colNumber === 13 || colNumber === 17) {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.numFmt = '#,##0';
                } else if (colNumber === 15 || colNumber === 16 || colNumber === 18 || colNumber === 19) {
                    cell.alignment = { vertical: 'middle', horizontal: 'right' };
                    cell.numFmt = '$#,##0';
                } else if (colNumber === 2) {
                    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: primaryColor } };
                } else if (colNumber === 4) {
                    cell.font = { name: 'Calibri', size: 10, bold: true };
                } else if (colNumber === 6) {
                    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: primaryColor } };
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                } else if (colNumber === 7) {
                    cell.font = { name: 'Calibri', size: 10, bold: true };
                } else if (colNumber === 23) {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                }
            });
        });

        // 5. Fila de Totales
        const totalRow = worksheet.addRow([
            '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL GRAL PPTO:', Math.round(totalPptoAcum),
            '', 'TOTAL GRAL REAL:', Math.round(totalRealAcum), '', '', '', ''
        ]);
        totalRow.height = 26;
        worksheet.mergeCells(`A${totalRow.number}:N${totalRow.number}`);
        totalRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: lightBgColor }
            };
            cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: accentTextColor } };
            cell.border = {
                top: { style: 'medium', color: { argb: primaryColor } },
                bottom: { style: 'medium', color: { argb: primaryColor } }
            };
        });
        totalRow.getCell(15).alignment = { vertical: 'middle', horizontal: 'right' };
        totalRow.getCell(16).alignment = { vertical: 'middle', horizontal: 'right' };
        totalRow.getCell(16).numFmt = '$#,##0';
        totalRow.getCell(18).alignment = { vertical: 'middle', horizontal: 'right' };
        totalRow.getCell(19).alignment = { vertical: 'middle', horizontal: 'right' };
        totalRow.getCell(19).numFmt = '$#,##0';

        // Anchos de columna
        worksheet.columns = [
            { width: 6 },   // 1. #
            { width: 24 },  // 2. Colegio
            { width: 22 },  // 3. Área
            { width: 26 },  // 4. Solicitante / Usuario
            { width: 22 },  // 5. Cargo
            { width: 16 },  // 6. Cód. Solicitud
            { width: 34 },  // 7. Producto
            { width: 36 },  // 8. Descripción
            { width: 34 },  // 9. Justificación
            { width: 22 },  // 10. Categoría
            { width: 22 },  // 11. Línea / Grupo
            { width: 18 },  // 12. Destino
            { width: 12 },  // 13. Cant. Ppto
            { width: 14 },  // 14. Formato
            { width: 16 },  // 15. Val. Unit Ppto
            { width: 18 },  // 16. Total Ppto
            { width: 12 },  // 17. Cant. Real
            { width: 16 },  // 18. Val. Unit Real
            { width: 18 },  // 19. Total Real
            { width: 24 },  // 20. Subvención / C. Costos
            { width: 16 },  // 21. Cód. Cuenta
            { width: 16 },  // 22. Fecha Solicitud
            { width: 16 }   // 23. Estado Compra
        ];

        // Generar y descargar archivo binario nativo .xlsx
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Recursos_Compras_${slugColegio}_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownloadPdfActas = async (itemsPorArea: Record<string, MasterItem[]>) => {
        if (isGeneratingPdf) return;
        const areas = Object.entries(itemsPorArea);
        if (areas.length === 0) {
            alert('No hay recursos seleccionados para generar actas.');
            return;
        }
        setIsGeneratingPdf(true);
        try {
            const colorPrimary = getComputedStyle(document.documentElement)
                .getPropertyValue('--primary').trim() || '#0d7ff2';
            const fecha = new Date().toLocaleDateString('es-CL');
            const actas = areas.map(([areaName, items]) => ({
                colegio: items[0]?.colegio || 'Colegio',
                area: areaName,
                fecha,
                items: items.map(item => {
                    const qtyReal = item.cantidad_real !== undefined ? item.cantidad_real : item.detalle.cantidad;
                    const unidad = item.detalle.formato_unidad ? ` ${item.detalle.formato_unidad}` : '';
                    return {
                        recurso: item.detalle.nombre_producto || '-',
                        codigo: item.solicitudCodigo || '',
                        cargo: item.cargo || '',
                        descripcion: item.detalle.descripcion || '',
                        cantidad_real: `${qtyReal}${unidad}`,
                    };
                }),
            }));
            const res = await api.post(
                '/presupuesto/compras/actas/pdf',
                { actas, color_primary: colorPrimary },
                { responseType: 'blob' }
            );
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `actas-recepcion-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error generando el PDF de actas:', error);
            alert('No se pudo generar el PDF de actas. Intente nuevamente.');
        } finally {
            setIsGeneratingPdf(false);
        }
    };
    const [actaVisibleCols, setActaVisibleCols] = useState<Record<string, boolean>>({ ...ACTA_COLS_DEFAULT });
    const [showActaColsModal, setShowActaColsModal] = useState(false);
    // ── Fetch data ─────────────────────────────────────────────────────────────
    const fetchCompras = useCallback(async () => {
        setLoading(true);
        try {
            const params: string[] = [];
            if (colegioId) params.push(`id_colegio=${colegioId}`);
            if (year) params.push(`year=${year}`);
            if (showOnlyPendientes) params.push('incluir_pendientes=true');
            const url = '/presupuesto/compras/historial' + (params.length ? '?' + params.join('&') : '');
            
            const [resCompras, resActas] = await Promise.all([
                api.get(url),
                api.get('/presupuesto/compras/actas' + (colegioId ? `?id_colegio=${colegioId}` : '')).catch(() => ({ data: [] }))
            ]);
            setCompras(resCompras.data);
            setActasEmitidas(resActas.data || []);
        } catch (error) {
            console.error('Error cargando historial de compras:', error);
            setCompras([]);
            setActasEmitidas([]);
        } finally {
            setLoading(false);
        }
    }, [colegioId, year, showOnlyPendientes]);

    // Mapeo id_pre_detalle -> Acta de Entrega
    const actasPorDetalleMap = useMemo(() => {
        const map = new Map<number, any>();
        actasEmitidas.forEach(a => {
            (a.detalles || []).forEach((d: any) => {
                if (d.id_pre_detalle) {
                    map.set(d.id_pre_detalle, a);
                }
            });
        });
        return map;
    }, [actasEmitidas]);
    useEffect(() => {
        if (filtersInitialized) {
            fetchCompras();
        }
    }, [fetchCompras, filtersInitialized]);
    // Cargar subvenciones y localStorage al montar
    useEffect(() => {
        setItemEstados(loadItemEstados());
        try {
            const savedExtras = localStorage.getItem('go-compras-items-extras');
            if (savedExtras) setItemExtras(JSON.parse(savedExtras));
        } catch {}
        setVisibleCols(loadColsConfig());
        setActaVisibleCols(loadActaColsConfig());
        setProveedores(loadProveedores());
        setIsMounted(true);
        api.get('/presupuesto/subvenciones/activas')
            .then(res => setSubvencionesActivas(res.data || []))
            .catch(() => setSubvencionesActivas([]));
    }, []);
    const saveExtras = (next: Record<string, { centro_costos?: string; observacion?: string; motivo?: string; cantidad_real?: number; valor_real?: number; monto_real?: number }>) => {
        setItemExtras(next);
        localStorage.setItem('go-compras-items-extras', JSON.stringify(next));
    };
    // ── Flatten items ──────────────────────────────────────────────────────────
    const masterItems: MasterItem[] = useMemo(() => {
        const items: MasterItem[] = [];
        for (const c of compras) {
            const codigo = `REQ-${new Date(c.fecha).getFullYear()}-${c.id_presupuesto.toString().padStart(3, '0')}`;
            for (const d of (c.detalles || [])) {
                const esSolicitudAprobada = c.estado === 'Aprobado' || c.estado === 'Aceptado';
                const estadoDetalle = d.estado_aprobacion || 'Sin Revisar';
                const esDetalleValido = estadoDetalle !== 'Rechazado' && estadoDetalle !== 'Sin Revisar';
                const esInsumoAprobado = esSolicitudAprobada && esDetalleValido;

                // Modo normal: Muestra los productos aprobados (que pueden tener estado Pendiente, En revisión, En camino, Comprado)
                if (!showOnlyPendientes) {
                    if (!esInsumoAprobado) continue;
                } else {
                    // Modo Ver Pendientes: Muestra/Agrega los insumos no aprobados (Pendientes de V°B° por Sostenedor)
                    if (esInsumoAprobado) continue;
                }
                const uid = `${c.id_presupuesto}-${d.id_pre_detalle}`;
                const extra = itemExtras[uid] || {};
                // Si el detalle ya tiene un valor_real_iva guardado en el servidor y no hay estado local definido, considerarlo 'Comprado'
                if (d.valor_real_iva != null && !itemEstados[uid]) {
                    setItemEstados(prev => ({ ...prev, [uid]: 'Comprado' }));
                }
                
                // Determinar nombre de subvención por defecto desde el recurso/detalle si existe
                let subDefault = '';
                if (d.id_subvencion && subvencionesActivas.length > 0) {
                    const matchSub = subvencionesActivas.find(s => s.id_subvencion === d.id_subvencion);
                    if (matchSub) subDefault = matchSub.nombre_corto;
                }
                if (!subDefault && d.codigo_cuenta) {
                    subDefault = 'SEP';
                }
                const centroCostosSugerido = d.centro_costos || extra.centro_costos || subDefault || 'GENERAL';
                const observacionFinal = d.observacion || extra.observacion || '';
                const cantRealFinal = d.cantidad_real != null ? Number(d.cantidad_real) : (extra.cantidad_real !== undefined ? extra.cantidad_real : undefined);
                const valorRealFinal = d.valor_real_iva != null && (cantRealFinal || d.cantidad)
                    ? Number(d.valor_real_iva) / Number(cantRealFinal || d.cantidad)
                    : (extra.valor_real !== undefined ? extra.valor_real : (extra.monto_real !== undefined ? extra.monto_real : undefined));

                items.push({
                    uid,
                    detalle: d,
                    solicitudId: c.id_presupuesto,
                    solicitudCodigo: codigo,
                    area: c.area_nombre || '',
                    cargo: c.subarea_nombre || d.subarea_nombre || '',
                    colegio: c.colegio_nombre || '',
                    solicitante: c.user_nombre || '',
                    esAprobadoSostenedor: esSolicitudAprobada,
                    centro_costos: centroCostosSugerido,
                    observacion: observacionFinal,
                    motivo: extra.motivo || d.motivo || '',
                    cantidad_real: cantRealFinal,
                    valor_real: valorRealFinal,
                });
            }
        }
        return items;
    }, [compras, showOnlyPendientes, itemExtras, subvencionesActivas]);
    const getDestinoNormalizado = (raw?: string) => {
        if (!raw) return 'Sin Destino';
        const u = raw.toUpperCase();
        if (u.includes('ESTUDIANTE') || u.includes('ALUMNO') || u.includes('SALA')) return 'Estudiante';
        if (u.includes('FUNCIONARIO') || u.includes('DOCENTE') || u.includes('OFICINA') || u.includes('ADMIN')) return 'Funcionario';
        if (u.includes('PREMIO') || u.includes('BENEFICIO')) return 'Premio / Beneficio';
        if (u.includes('MANTEN') || u.includes('SERVICIO')) return 'Mantención';
        return raw;
    };
    // ── Categorías, destinos, áreas y cargos únicas para filtros ──────────────────────────────
    const categoriasUnicas: string[] = useMemo(() => {
        const set = new Set<string>();
        let haySinCat = false;
        masterItems.forEach(i => {
            if (i.detalle.categoria_nombre) {
                set.add(i.detalle.categoria_nombre);
            } else {
                haySinCat = true;
            }
        });
        const list = Array.from(set).sort();
        if (haySinCat) {
            list.unshift('(Sin Categoría)');
        }
        return list;
    }, [masterItems]);
    const gruposUnicos: string[] = useMemo(() => {
        const set = new Set<string>();
        let haySinGrupo = false;
        masterItems.forEach(i => {
            if (i.detalle.grupo_nombre) {
                set.add(i.detalle.grupo_nombre);
            } else {
                haySinGrupo = true;
            }
        });
        const list = Array.from(set).sort();
        if (haySinGrupo) {
            list.unshift('(Sin Línea / Grupo)');
        }
        return list;
    }, [masterItems]);
    const destinosUnicos: string[] = useMemo(() => {
        const set = new Set<string>();
        masterItems.forEach(i => {
            const d = getDestinoNormalizado(i.detalle.destino_gasto);
            if (d) set.add(d);
        });
        return Array.from(set).sort();
    }, [masterItems]);
    const motivosUnicos: string[] = useMemo(() => {
        const set = new Set<string>();
        let hayEnBlanco = false;
        masterItems.forEach(i => {
            const m = (i.motivo || i.detalle.motivo || '').trim();
            if (m) {
                set.add(m);
            } else {
                hayEnBlanco = true;
            }
        });
        const list = Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        if (hayEnBlanco) {
            list.unshift(SIN_MOTIVO_LABEL);
        }
        return list;
    }, [masterItems]);
    const motivosFiltrados = useMemo(() => {
        if (!motivoSearchQuery.trim()) return motivosUnicos;
        const q = motivoSearchQuery.toLowerCase();
        return motivosUnicos.filter(m => m.toLowerCase().includes(q));
    }, [motivosUnicos, motivoSearchQuery]);
    const areasUnicas: string[] = useMemo(() =>
        [...new Set(masterItems.map(i => i.area).filter((a): a is string => Boolean(a)))].sort(),
        [masterItems]
    );
    const subareasUnicas: string[] = useMemo(() => {
        const filteredItems = filterAreas.length > 0
            ? masterItems.filter(i => filterAreas.includes(i.area))
            : masterItems;
        return [...new Set(filteredItems.map(i => i.cargo).filter((s): s is string => Boolean(s)))].sort();
    }, [masterItems, filterAreas]);
    // ── Items filtrados ────────────────────────────────────────────────────────
    const getEstado = useCallback((uid: string): EstadoCompra => {
        if (itemEstados[uid]) return itemEstados[uid];
        const matchItem = masterItems.find(i => i.uid === uid);
        if (matchItem?.detalle?.estado_compra) {
            const st = matchItem.detalle.estado_compra;
            if (st === 'Comprado' || st === 'En revisión' || st === 'En camino' || st === 'Pendiente' || st === 'Aprobado') {
                return st as EstadoCompra;
            }
        }
        if (matchItem?.detalle?.valor_real_iva != null) {
            return 'Comprado';
        }
        return 'Pendiente';
    }, [itemEstados, masterItems]);
    const guardarProveedor = () => {
        if (!provForm.nombre.trim()) {
            alert('El nombre es obligatorio');
            return;
        }
        let updated: Proveedor[];
        if (editingProv) {
            updated = proveedores.map(p => p.id === editingProv.id ? { ...p, ...provForm } : p);
        } else {
            const nuevo: Proveedor = {
                id: crypto.randomUUID(),
                ...provForm
            };
            updated = [...proveedores, nuevo];
        }
        setProveedores(updated);
        saveProveedores(updated);
        setShowProvModal(false);
        setEditingProv(null);
        setProvForm({ nombre: '', rut: '', email: '', correo: '', direccion: '', estado: 'Activo' });
    };
    const iniciarCrearProv = () => {
        setEditingProv(null);
        setProvForm({ nombre: '', rut: '', email: '', correo: '', direccion: '', estado: 'Activo' });
        setShowProvModal(true);
    };
    const iniciarEditarProv = (p: Proveedor) => {
        setEditingProv(p);
        setProvForm({
            nombre: p.nombre,
            rut: p.rut,
            email: p.email,
            correo: p.correo,
            direccion: p.direccion,
            estado: p.estado
        });
        setShowProvModal(true);
    };
    const eliminarProveedor = (id: string) => {
        if (confirm('¿Está seguro de eliminar este proveedor?')) {
            const updated = proveedores.filter(p => p.id !== id);
            setProveedores(updated);
            saveProveedores(updated);
        }
    };
    const guardarPrecioRealItem = async () => {
        if (!editItem) return;
        const nuevoPrecioReal = parseFloat(editPriceInput);
        const nuevoPrecioPresupuestado = parseFloat(editPresupuestoPriceInput);
        const nuevaQty = parseFloat(editQtyInput);
        
        if (isNaN(nuevoPrecioReal) || nuevoPrecioReal < 0 || isNaN(nuevoPrecioPresupuestado) || nuevoPrecioPresupuestado < 0 || isNaN(nuevaQty) || nuevaQty <= 0) {
            alert('Por favor ingrese valores válidos.');
            return;
        }
        setSavingItem(true);
        try {
            const totalIva = nuevaQty * nuevoPrecioPresupuestado;
            const valorUnitario = parseFloat((nuevoPrecioPresupuestado / 1.19).toFixed(2));
            const payload = {
                nombre_producto: editItem.detalle.nombre_producto,
                descripcion: editItem.detalle.descripcion || '',
                id_recurso: editItem.detalle.id_recurso,
                codigo_cuenta: editItem.detalle.codigo_cuenta,
                formato_unidad: editItem.detalle.formato_unidad,
                cantidad: nuevaQty,
                valor_unitario: valorUnitario,
                valor_unitario_iva: nuevoPrecioPresupuestado,
                valor_real_iva: nuevoPrecioReal,
                total_iva: totalIva,
                fecha_ejecucion: editItem.detalle.fecha_ejecucion,
                fecha_termino: editItem.detalle.fecha_termino || null,
                tipo_fecha: editItem.detalle.tipo_fecha,
                motivo: editItem.detalle.motivo,
                id_actividad: editItem.detalle.id_actividad,
                id_subvencion: editItem.detalle.id_subvencion,
                destino_gasto: editItem.detalle.destino_gasto || 'Alumnos',
                id_subarea: editItem.detalle.id_subarea
            };
            await api.put(`/presupuesto/detalles/${editItem.detalle.id_pre_detalle}`, payload);
            await fetchCompras();
            setEditItem(null);
        } catch (error: any) {
            console.error('Error actualizando precio:', error);
            alert(error.response?.data?.detail || 'Error al actualizar el precio');
        } finally {
            setSavingItem(false);
        }
    };
    const formatFechaSolicitud = useCallback((detalle: BudgetDetail) => {
        if (detalle.fecha_ejecucion) {
            const parts = detalle.fecha_ejecucion.split('T')[0].split('-');
            if (parts.length >= 2) {
                const mesCode = parts[1];
                const mesObj = MESES.find(m => m.value === mesCode);
                if (mesObj) return mesObj.label;
            }
            try {
                const dateObj = new Date(detalle.fecha_ejecucion);
                if (!isNaN(dateObj.getTime())) {
                    const monthName = dateObj.toLocaleDateString('es-CL', { month: 'long' });
                    return monthName.charAt(0).toUpperCase() + monthName.slice(1);
                }
            } catch {}
        }
        if (detalle.tipo_fecha === 'mensual') return 'Mensual';
        return '—';
    }, []);
    const fechasUnicas = useMemo(() => {
        const labels = masterItems.map(i => formatFechaSolicitud(i.detalle)).filter(Boolean);
        const unicas = [...new Set(labels)];
        return unicas.sort((a, b) => {
            const indexA = MESES.findIndex(m => m.label.toLowerCase() === a.toLowerCase());
            const indexB = MESES.findIndex(m => m.label.toLowerCase() === b.toLowerCase());
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
        });
    }, [masterItems, formatFechaSolicitud]);
    const filtered = useMemo(() => {
        return masterItems.filter(item => {
            const matchSearch = !searchTerm ||
                item.detalle.nombre_producto.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.detalle.recurso_nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.detalle.codigo_cuenta || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.solicitudCodigo.toLowerCase().includes(searchTerm.toLowerCase());
            const matchCat = filterCategorias.length === 0 || (
                item.detalle.categoria_nombre
                    ? filterCategorias.includes(item.detalle.categoria_nombre)
                    : filterCategorias.includes('(Sin Categoría)')
            );
            const matchGrupo = filterGrupos.length === 0 || (
                item.detalle.grupo_nombre
                    ? filterGrupos.includes(item.detalle.grupo_nombre)
                    : filterGrupos.includes('(Sin Línea / Grupo)')
            );
            const matchDestino = filterDestinos.length === 0 || filterDestinos.includes(getDestinoNormalizado(item.detalle.destino_gasto));
            const matchMotivo = filterMotivos.length === 0 || (() => {
                const m = (item.motivo || item.detalle.motivo || '').trim();
                if (!m) return filterMotivos.includes(SIN_MOTIVO_LABEL);
                return filterMotivos.includes(m);
            })();
            const matchArea = filterAreas.length === 0 || filterAreas.includes(item.area);
            const matchSub = filterSubareas.length === 0 || filterSubareas.includes(item.cargo);
            const matchEstado = filterEstadosCompra.length === 0 || filterEstadosCompra.includes(getEstado(item.uid));
            // Filtro por rango de fecha de ejecución
            let matchFecha = true;
            if (filterFechaDesde || filterFechaHasta) {
                const fechaItem = item.detalle.fecha_ejecucion ? item.detalle.fecha_ejecucion.slice(0, 10) : '';
                if (filterFechaDesde && fechaItem < filterFechaDesde) matchFecha = false;
                if (filterFechaHasta && fechaItem > filterFechaHasta) matchFecha = false;
            }
            const matchMeses = filterMeses.length === 0 || filterMeses.includes(formatFechaSolicitud(item.detalle));
            return matchSearch && matchCat && matchGrupo && matchDestino && matchMotivo && matchArea && matchSub && matchEstado && matchFecha && matchMeses;
        });
    }, [masterItems, searchTerm, filterCategorias, filterGrupos, filterDestinos, filterMotivos, filterAreas, filterSubareas, filterEstadosCompra, filterFechaDesde, filterFechaHasta, filterMeses, itemEstados, formatFechaSolicitud]);
    // Items ordenados dinámicamente por cualquier columna (respetando filtros activos como Colegio, Año, etc.)
    const sortedFiltered = useMemo(() => {
        if (!sortConfig) return filtered;
        const { key, direction } = sortConfig;
        const multiplier = direction === 'asc' ? 1 : -1;

        return [...filtered].sort((a, b) => {
            switch (key) {
                case 'producto': {
                    const valA = a.detalle.nombre_producto || '';
                    const valB = b.detalle.nombre_producto || '';
                    return multiplier * valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
                }
                case 'descripcion': {
                    const valA = a.detalle.descripcion || '';
                    const valB = b.detalle.descripcion || '';
                    return multiplier * valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
                }
                case 'actividad_pme': {
                    const valA = a.detalle.actividad_nombre || '';
                    const valB = b.detalle.actividad_nombre || '';
                    return multiplier * valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
                }
                case 'motivo': {
                    const valA = (a.motivo || a.detalle.motivo || '').trim();
                    const valB = (b.motivo || b.detalle.motivo || '').trim();
                    return multiplier * valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
                }
                case 'categoria': {
                    const valA = a.detalle.categoria_nombre || '';
                    const valB = b.detalle.categoria_nombre || '';
                    return multiplier * valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
                }
                case 'grupo': {
                    const valA = a.detalle.grupo_nombre || '';
                    const valB = b.detalle.grupo_nombre || '';
                    return multiplier * valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
                }
                case 'destino': {
                    const valA = a.detalle.destino_gasto || '';
                    const valB = b.detalle.destino_gasto || '';
                    return multiplier * valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
                }
                case 'cantidad': {
                    const numA = Number(a.detalle.cantidad || 0);
                    const numB = Number(b.detalle.cantidad || 0);
                    return multiplier * (numA - numB);
                }
                case 'total': {
                    const numA = Number(a.detalle.total_iva || 0);
                    const numB = Number(b.detalle.total_iva || 0);
                    return multiplier * (numA - numB);
                }
                case 'cantidad_real': {
                    const numA = a.cantidad_real !== undefined ? Number(a.cantidad_real) : Number(a.detalle.cantidad || 0);
                    const numB = b.cantidad_real !== undefined ? Number(b.cantidad_real) : Number(b.detalle.cantidad || 0);
                    return multiplier * (numA - numB);
                }
                case 'monto_real': {
                    const qtyA = a.cantidad_real !== undefined ? Number(a.cantidad_real) : Number(a.detalle.cantidad || 0);
                    const numA = a.valor_real !== undefined
                        ? qtyA * Number(a.valor_real)
                        : (a.detalle.valor_real_iva != null ? Number(a.detalle.valor_real_iva) : qtyA * Number(a.detalle.valor_unitario_iva || 0));

                    const qtyB = b.cantidad_real !== undefined ? Number(b.cantidad_real) : Number(b.detalle.cantidad || 0);
                    const numB = b.valor_real !== undefined
                        ? qtyB * Number(b.valor_real)
                        : (b.detalle.valor_real_iva != null ? Number(b.detalle.valor_real_iva) : qtyB * Number(b.detalle.valor_unitario_iva || 0));

                    return multiplier * (numA - numB);
                }
                case 'centro_costos': {
                    const valA = a.centro_costos || a.detalle.centro_costos || '';
                    const valB = b.centro_costos || b.detalle.centro_costos || '';
                    return multiplier * valA.localeCompare(valB, 'es', { sensitivity: 'base' });
                }
                case 'observacion': {
                    const valA = a.observacion || a.detalle.observacion || '';
                    const valB = b.observacion || b.detalle.observacion || '';
                    return multiplier * valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
                }
                case 'fecha': {
                    const labelA = formatFechaSolicitud(a.detalle);
                    const labelB = formatFechaSolicitud(b.detalle);
                    const getMonthScore = (label: string, item: MasterItem) => {
                        if (label === 'Mensual') return 99;
                        const idx = MESES.findIndex(m => m.label.toLowerCase() === label.toLowerCase());
                        if (idx !== -1) return idx;
                        if (item.detalle.fecha_ejecucion) {
                            try {
                                const d = new Date(item.detalle.fecha_ejecucion);
                                if (!isNaN(d.getTime())) return d.getMonth();
                            } catch {}
                        }
                        return 100;
                    };
                    const scoreA = getMonthScore(labelA, a);
                    const scoreB = getMonthScore(labelB, b);
                    if (scoreA !== scoreB) {
                        return multiplier * (scoreA - scoreB);
                    }
                    const dateA = a.detalle.fecha_ejecucion || '';
                    const dateB = b.detalle.fecha_ejecucion || '';
                    return multiplier * dateA.localeCompare(dateB);
                }
                case 'origen': {
                    const valA = a.solicitudCodigo || '';
                    const valB = b.solicitudCodigo || '';
                    return multiplier * valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
                }
                case 'area': {
                    const valA = a.area || '';
                    const valB = b.area || '';
                    return multiplier * valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
                }
                case 'solicitante': {
                    const valA = a.solicitante || '';
                    const valB = b.solicitante || '';
                    return multiplier * valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' });
                }
                case 'estado': {
                    const estadoA = a.esAprobadoSostenedor === false ? 'Sin Aprobar (Pendiente V°B°)' : getEstado(a.uid);
                    const estadoB = b.esAprobadoSostenedor === false ? 'Sin Aprobar (Pendiente V°B°)' : getEstado(b.uid);
                    return multiplier * estadoA.localeCompare(estadoB, 'es', { sensitivity: 'base' });
                }
                default:
                    return 0;
            }
        });
    }, [filtered, sortConfig, getEstado, formatFechaSolicitud]);

    // Resetear a pág 1 si cambian los filtros o el ordenamiento
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterCategorias, filterGrupos, filterDestinos, filterMotivos, filterAreas, filterSubareas, filterEstadosCompra, filterFechaDesde, filterFechaHasta, filterMeses, sortConfig]);

    const totalPages = Math.ceil(sortedFiltered.length / itemsPerPage) || 1;
    const paginatedFiltered = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return sortedFiltered.slice(start, start + itemsPerPage);
    }, [sortedFiltered, currentPage, itemsPerPage]);

    // Helper para ícono de ordenamiento en headers
    const renderSortIcon = (key: string) => {
        if (sortConfig?.key === key) {
            return sortConfig.direction === 'asc' ? (
                <ArrowUp size={13} className="text-primary font-bold shrink-0" />
            ) : (
                <ArrowDown size={13} className="text-primary font-bold shrink-0" />
            );
        }
        return <ArrowUpDown size={13} className="text-gray-400 opacity-20 group-hover:opacity-100 transition-opacity shrink-0" />;
    };

    const renderSortTh = (key: string, label: string, extraClass: string = '', isCenter: boolean = false) => (
        <th
            className={`px-4 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors select-none group ${extraClass || 'text-gray-500'} ${isCenter ? 'text-center' : 'text-left'}`}
            onClick={() => handleSort(key)}
            title={`Haz clic para ordenar por ${label} (A-Z / Z-A)`}
        >
            <div className={`inline-flex items-center gap-1.5 ${isCenter ? 'justify-center' : ''}`}>
                <span>{label}</span>
                {renderSortIcon(key)}
            </div>
        </th>
    );

    // helper para columnas
    const isColVisible = (key: string) => visibleCols[key] !== false;
    const colCount = 3 + COLUMNAS_MAESTRA.filter(c => isColVisible(c.key)).length; // checkbox + # + producto + visibles
    // ── Stats ──────────────────────────────────────────────────────────────────
    const totalItems = filtered.length;
    const totalMonto = filtered.reduce((acc, i) => acc + (i.detalle.total_iva || 0), 0);
    const pendientesCount = filtered.filter(i => getEstado(i.uid) === 'Pendiente').length;
    const enCaminoCount = filtered.filter(i => getEstado(i.uid) === 'En camino').length;
    const completadosCount = filtered.filter(i => getEstado(i.uid) === 'Comprado').length;
    const totalCompletadoReal = useMemo(() => {
        return filtered
            .filter(i => getEstado(i.uid) === 'Comprado')
            .reduce((sum, i) => {
                const qtyReal = i.cantidad_real !== undefined ? i.cantidad_real : i.detalle.cantidad;
                const pReal = i.valor_real !== undefined ? i.valor_real : (i.detalle.valor_real_iva ?? i.detalle.valor_unitario_iva);
                return sum + (qtyReal * pReal);
            }, 0);
    }, [filtered, itemEstados, itemExtras]);
    const totalMontoRealGlobal = useMemo(() => {
        return filtered.reduce((sum, i) => {
            const qtyReal = i.cantidad_real !== undefined ? i.cantidad_real : i.detalle.cantidad;
            const pReal = i.valor_real !== undefined ? i.valor_real : (i.detalle.valor_real_iva ?? i.detalle.valor_unitario_iva);
            return sum + (qtyReal * pReal);
        }, 0);
    }, [filtered, itemExtras]);
    const montoPendientePresupuesto = useMemo(() => {
        return filtered
            .filter(i => getEstado(i.uid) !== 'Comprado')
            .reduce((acc, i) => acc + (i.detalle.total_iva || 0), 0);
    }, [filtered, itemEstados]);
    const totalPendienteReal = useMemo(() => {
        return filtered
            .filter(i => getEstado(i.uid) !== 'Comprado')
            .reduce((sum, i) => {
                const qtyReal = i.cantidad_real !== undefined ? i.cantidad_real : i.detalle.cantidad;
                const pReal = i.valor_real !== undefined ? i.valor_real : (i.detalle.valor_real_iva ?? i.detalle.valor_unitario_iva);
                return sum + (qtyReal * pReal);
            }, 0);
    }, [filtered, itemEstados, itemExtras]);
    // ── Selection handlers ─────────────────────────────────────────────────────
    const isItemSelectable = useCallback((item: MasterItem) => {
        return true;
    }, []);
    const toggleSelect = (uid: string) => {
        setSelectedUids(prev => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid); else next.add(uid);
            return next;
        });
    };
    const toggleSelectAll = () => {
        if (filtered.length > 0 && filtered.every(i => selectedUids.has(i.uid))) {
            setSelectedUids(prev => {
                const next = new Set(prev);
                filtered.forEach(i => next.delete(i.uid));
                return next;
            });
        } else {
            setSelectedUids(prev => {
                const next = new Set(prev);
                filtered.forEach(i => next.add(i.uid));
                return next;
            });
        }
    };
    // ── UI helpers ─────────────────────────────────────────────────────────────
    const estadoBadge = (estado: EstadoCompra) => {
        switch (estado) {
            case 'Pendiente': return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold inline-flex items-center gap-1"><Clock size={12} /> Pendiente</span>;
            case 'En camino': return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-bold inline-flex items-center gap-1"><Truck size={12} /> En camino</span>;
            case 'Comprado': return <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-bold inline-flex items-center gap-1"><CheckCircle size={12} /> Comprado</span>;
        }
    };
    const selectedTotal = Array.from(selectedUids).reduce((acc, uid) => {
        const item = masterItems.find(i => i.uid === uid);
        return acc + (item?.detalle.total_iva || 0);
    }, 0);
    // ── Render ─────────────────────────────────────────────────────────────────
    if (!isMounted) {
        return (
            <div className="min-h-[400px] flex items-center justify-center">
                <Loader2 className="animate-spin text-primary" size={32} />
            </div>
        );
    }
    return (
        <>
            <div className="animate-in fade-in duration-500 max-w-none -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8" suppressHydrationWarning>
                {/* Header */}
                <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                            <CalendarClock size={26} />
                        </div>
                        <div>
                            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Programar Compras</h2>
                            <p className="text-gray-500 mt-1 font-medium">Hoja maestra de recursos y gestión de actas de recepción por área.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        {puedeVerBotonRevisionJefe && (
                            <button
                                onClick={async () => {
                                    try {
                                        const res = await api.get('/presupuesto/solicitudes-modificacion?estado=PENDIENTE');
                                        setSolicitudesModPendientes(res.data || []);
                                        setShowRevisionModModal(true);
                                    } catch (e) {
                                        console.error('Error cargando solicitudes de modificación:', e);
                                    }
                                }}
                                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl font-semibold shadow-md shadow-amber-500/20 flex items-center gap-2 transition-all duration-200 whitespace-nowrap text-sm"
                            >
                                <Edit2 size={18} />
                                Revisión de Cambios Justificación
                            </button>
                        )}

                        <button
                            onClick={() => {
                                const items = selectedUids.size > 0 
                                    ? masterItems.filter(i => selectedUids.has(i.uid))
                                    : filtered;
                                handleExportarExcelRecursos(items);
                            }}
                            disabled={filtered.length === 0}
                            className={`px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 text-sm shadow-md transition-all duration-200 whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                (colegioId === '1' || (!colegioId && !filtered[0]?.colegio?.toLowerCase().includes('diego')))
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
                            }`}
                            title="Exportar planilla Excel (.xlsx) con columnas completas y colores institucionales"
                        >
                            <Download size={18} />
                            <span>Exportar Excel ({selectedUids.size > 0 ? `${selectedUids.size} seleccionados` : `${filtered.length} recursos`})</span>
                        </button>
                    </div>
                </div>
                {/* Filtros */}
                <div className="mb-6">
                    <ComprasFilters
                        colegioId={colegioId}
                        year={year}
                        onColegioChange={handleColegioChange}
                        onYearChange={handleYearChange}
                    />
                </div>
                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
                    {/* Card 1: Total Comprado Real */}
                    <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <CheckCircle size={24} />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-0.5">Total Comprado (Real)</p>
                            <h3 className="text-xl font-bold text-emerald-900">{formatCLP(totalCompletadoReal)}</h3>
                            <p className="text-[11px] text-gray-400 font-medium">{completadosCount} insumo{completadosCount !== 1 ? 's' : ''} comprado{completadosCount !== 1 ? 's' : ''}</p>
                        </div>
                    </div>

                    {/* Card 2: Monto Presupuesto Total */}
                    <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                            <DollarSign size={24} />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-0.5">Monto Presupuesto Total</p>
                            <h3 className="text-xl font-bold text-gray-900">{formatCLP(totalMonto)}</h3>
                            <p className="text-[11px] text-gray-400 font-medium">{totalItems} insumo{totalItems !== 1 ? 's' : ''} en total</p>
                        </div>
                    </div>

                    {/* Card 3: Monto Real Total */}
                    <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600">
                            <ShoppingCart size={24} />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-0.5">Monto Real Total</p>
                            <h3 className="text-xl font-bold text-teal-900">{formatCLP(totalMontoRealGlobal)}</h3>
                            <p className="text-[11px] text-teal-700 font-medium">Ejecutado real acumulado</p>
                        </div>
                    </div>

                    {/* Card 4: Monto Pendiente del Presupuesto */}
                    <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500">
                            <Clock size={24} />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-0.5">Monto Pendiente Ppto.</p>
                            <h3 className="text-xl font-bold text-amber-900">{formatCLP(montoPendientePresupuesto)}</h3>
                            <p className="text-[11px] text-amber-700 font-medium">{pendientesCount + enCaminoCount} insumo{(pendientesCount + enCaminoCount) !== 1 ? 's' : ''} pendiente{(pendientesCount + enCaminoCount) !== 1 ? 's' : ''}</p>
                        </div>
                    </div>

                    {/* Card 5: Monto Total Pendiente Real */}
                    <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600">
                            <DollarSign size={24} />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-0.5">Monto Pendiente Real</p>
                            <h3 className="text-xl font-bold text-rose-900">{formatCLP(totalPendienteReal)}</h3>
                            <p className="text-[11px] text-rose-700 font-medium">Por comprar (Cálculo real)</p>
                        </div>
                    </div>
                </div>
                {/* Hoja Maestra - Barra de Filtros en Orden Exacto Solicitado */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                            {/* 1. Buscar producto... */}
                            <div className="relative flex-1 min-w-[200px] max-w-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Buscar producto, código, solicitud..."
                                    value={searchTerm}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl bg-white placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary text-sm text-gray-900"
                                />
                            </div>

                            {/* 2. Selector Multi-Área con Checkboxes */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsAreasDropdownOpen(prev => !prev)}
                                    className={`px-3 py-2.5 border rounded-xl text-sm bg-white flex items-center justify-between gap-2 min-w-[150px] transition-all cursor-pointer ${
                                        filterAreas.length > 0
                                            ? 'border-primary/50 text-primary font-bold bg-primary/5 ring-1 ring-primary/20'
                                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                                        <Building2 size={15} className={filterAreas.length > 0 ? 'text-primary' : 'text-gray-400'} />
                                        <span className="truncate">
                                            {filterAreas.length === 0
                                                ? 'Todas las áreas'
                                                : filterAreas.length === 1
                                                ? filterAreas[0]
                                                : `${filterAreas.length} áreas selec.`}
                                        </span>
                                    </div>
                                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${isAreasDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isAreasDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setIsAreasDropdownOpen(false)} />
                                        <div className="absolute left-0 mt-1.5 w-[340px] sm:w-[400px] bg-white border border-gray-200 rounded-2xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                            <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs">
                                                <span className="font-bold text-gray-700">Filtrar por Área</span>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetAreas([...areasUnicas])}
                                                        className="text-primary hover:underline font-semibold cursor-pointer"
                                                    >
                                                        Todas
                                                    </button>
                                                    <span className="text-gray-300">·</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetAreas([])}
                                                        className="text-gray-500 hover:underline font-medium cursor-pointer"
                                                    >
                                                        Limpiar
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-2 max-h-60 overflow-y-auto overflow-x-hidden space-y-0.5">
                                                {areasUnicas.length === 0 ? (
                                                    <div className="p-3 text-xs text-gray-400 text-center">No hay áreas disponibles</div>
                                                ) : (
                                                    areasUnicas.map(area => {
                                                        const checked = filterAreas.includes(area);
                                                        return (
                                                            <label
                                                                key={area}
                                                                className={`flex items-start gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                                                                    checked ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700 hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => handleToggleArea(area)}
                                                                    className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20 cursor-pointer shrink-0 mt-0.5"
                                                                />
                                                                <span className="leading-snug break-words flex-1">{area}</span>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <div className="p-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsAreasDropdownOpen(false)}
                                                    className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:brightness-105 transition-all shadow-xs cursor-pointer"
                                                >
                                                    Aplicar
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Selector Multi-Cargo / Subárea con Checkboxes */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsSubareasDropdownOpen(prev => !prev)}
                                    className={`px-3 py-2.5 border rounded-xl text-sm bg-white flex items-center justify-between gap-2 min-w-[150px] transition-all cursor-pointer ${
                                        filterSubareas.length > 0
                                            ? 'border-primary/50 text-primary font-bold bg-primary/5 ring-1 ring-primary/20'
                                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                                        <Briefcase size={15} className={filterSubareas.length > 0 ? 'text-primary' : 'text-gray-400'} />
                                        <span className="truncate">
                                            {filterSubareas.length === 0
                                                ? 'Todos los cargos'
                                                : filterSubareas.length === 1
                                                ? filterSubareas[0]
                                                : `${filterSubareas.length} cargos selec.`}
                                        </span>
                                    </div>
                                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${isSubareasDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isSubareasDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setIsSubareasDropdownOpen(false)} />
                                        <div className="absolute left-0 mt-1.5 w-[340px] sm:w-[400px] bg-white border border-gray-200 rounded-2xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                            <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs">
                                                <span className="font-bold text-gray-700">Filtrar por Cargo</span>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetSubareas([...subareasUnicas])}
                                                        className="text-primary hover:underline font-semibold cursor-pointer"
                                                    >
                                                        Todos
                                                    </button>
                                                    <span className="text-gray-300">·</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetSubareas([])}
                                                        className="text-gray-500 hover:underline font-medium cursor-pointer"
                                                    >
                                                        Limpiar
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-2 max-h-60 overflow-y-auto overflow-x-hidden space-y-0.5">
                                                {subareasUnicas.length === 0 ? (
                                                    <div className="p-3 text-xs text-gray-400 text-center">No hay cargos disponibles</div>
                                                ) : (
                                                    subareasUnicas.map(cargo => {
                                                        const checked = filterSubareas.includes(cargo);
                                                        return (
                                                            <label
                                                                key={cargo}
                                                                className={`flex items-start gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                                                                    checked ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700 hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => handleToggleSubarea(cargo)}
                                                                    className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20 cursor-pointer shrink-0 mt-0.5"
                                                                />
                                                                <span className="leading-snug break-words flex-1">{cargo}</span>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <div className="p-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsSubareasDropdownOpen(false)}
                                                    className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:brightness-105 transition-all shadow-xs cursor-pointer"
                                                >
                                                    Aplicar
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 3. Selector Multi-Mes con Checkboxes */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsMesesDropdownOpen(prev => !prev)}
                                    className={`px-3 py-2.5 border rounded-xl text-sm bg-white flex items-center justify-between gap-2 min-w-[170px] transition-all ${
                                        filterMeses.length > 0
                                            ? 'border-primary/50 text-primary font-bold bg-primary/5 ring-1 ring-primary/20'
                                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 truncate max-w-[180px]">
                                        <CalendarClock size={15} className={filterMeses.length > 0 ? 'text-primary' : 'text-gray-400'} />
                                        <span className="truncate">
                                            {filterMeses.length === 0
                                                ? 'Todos los meses'
                                                : filterMeses.length === 1
                                                ? filterMeses[0]
                                                : `${filterMeses.length} meses seleccionados`}
                                        </span>
                                    </div>
                                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${isMesesDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isMesesDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setIsMesesDropdownOpen(false)} />
                                        <div className="absolute left-0 mt-1.5 w-[280px] bg-white border border-gray-200 rounded-2xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                            {/* Cabecera del desplegable */}
                                            <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs">
                                                <span className="font-bold text-gray-700">Filtrar por Mes</span>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetMeses([...MESES.map(m => m.label), 'Mensual'])}
                                                        className="text-primary hover:underline font-semibold"
                                                    >
                                                        Todos
                                                    </button>
                                                    <span className="text-gray-300">·</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetMeses([])}
                                                        className="text-gray-500 hover:underline font-medium"
                                                    >
                                                        Limpiar
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Lista de meses con checkboxes */}
                                            <div className="p-2 max-h-60 overflow-y-auto overflow-x-hidden space-y-0.5">
                                                {MESES.map(mes => {
                                                    const checked = filterMeses.includes(mes.label);
                                                    return (
                                                        <label
                                                            key={mes.value}
                                                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                                                                checked ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700 hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => handleToggleMes(mes.label)}
                                                                    className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20 cursor-pointer"
                                                                />
                                                                <span>{mes.label}</span>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                                {/* Opción Recurrente / Mensual */}
                                                <label
                                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer border-t border-gray-100 transition-colors ${
                                                        filterMeses.includes('Mensual') ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <input
                                                            type="checkbox"
                                                            checked={filterMeses.includes('Mensual')}
                                                            onChange={() => handleToggleMes('Mensual')}
                                                            className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20 cursor-pointer"
                                                        />
                                                        <span>Mensual (Recurrente)</span>
                                                    </div>
                                                </label>
                                            </div>

                                            {/* Footer con botón listo */}
                                            <div className="p-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsMesesDropdownOpen(false)}
                                                    className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:brightness-105 transition-all shadow-xs"
                                                >
                                                    Aplicar
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 4. Selector Multi-Categoría con Checkboxes */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsCategoriasDropdownOpen(prev => !prev)}
                                    className={`px-3 py-2.5 border rounded-xl text-sm bg-white flex items-center justify-between gap-2 min-w-[170px] transition-all cursor-pointer ${
                                        filterCategorias.length > 0
                                            ? 'border-primary/50 text-primary font-bold bg-primary/5 ring-1 ring-primary/20'
                                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 truncate max-w-[180px]">
                                        <Tag size={15} className={filterCategorias.length > 0 ? 'text-primary' : 'text-gray-400'} />
                                        <span className="truncate">
                                            {filterCategorias.length === 0
                                                ? 'Todas las categorías'
                                                : filterCategorias.length === 1
                                                ? filterCategorias[0]
                                                : `${filterCategorias.length} categ. selec.`}
                                        </span>
                                    </div>
                                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${isCategoriasDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isCategoriasDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setIsCategoriasDropdownOpen(false)} />
                                        <div className="absolute left-0 mt-1.5 w-[380px] sm:w-[460px] bg-white border border-gray-200 rounded-2xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                            <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs">
                                                <span className="font-bold text-gray-700">Filtrar por Categoría</span>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetCategorias([...categoriasUnicas])}
                                                        className="text-primary hover:underline font-semibold cursor-pointer"
                                                    >
                                                        Todas
                                                    </button>
                                                    <span className="text-gray-300">·</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetCategorias([])}
                                                        className="text-gray-500 hover:underline font-medium cursor-pointer"
                                                    >
                                                        Limpiar
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-2 max-h-64 overflow-y-auto overflow-x-hidden space-y-0.5">
                                                {categoriasUnicas.length === 0 ? (
                                                    <div className="p-3 text-xs text-gray-400 text-center">No hay categorías disponibles</div>
                                                ) : (
                                                    categoriasUnicas.map(c => {
                                                        const checked = filterCategorias.includes(c);
                                                        return (
                                                            <label
                                                                key={c}
                                                                className={`flex items-start gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                                                                    checked ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700 hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => handleToggleCategoria(c)}
                                                                    className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20 cursor-pointer shrink-0 mt-0.5"
                                                                />
                                                                <span className={`leading-snug break-words flex-1 ${c.startsWith('(Sin') ? 'italic text-amber-700 font-medium' : ''}`}>{c}</span>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <div className="p-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsCategoriasDropdownOpen(false)}
                                                    className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:brightness-105 transition-all shadow-xs cursor-pointer"
                                                >
                                                    Aplicar
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 4.5. Selector Multi-Línea / Grupo con Checkboxes */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsGruposDropdownOpen(prev => !prev)}
                                    className={`px-3 py-2.5 border rounded-xl text-sm bg-white flex items-center justify-between gap-2 min-w-[160px] transition-all cursor-pointer ${
                                        filterGrupos.length > 0
                                            ? 'border-primary/50 text-primary font-bold bg-primary/5 ring-1 ring-primary/20'
                                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                                        <Layers size={15} className={filterGrupos.length > 0 ? 'text-primary' : 'text-gray-400'} />
                                        <span className="truncate">
                                            {filterGrupos.length === 0
                                                ? 'Todas las líneas'
                                                : filterGrupos.length === 1
                                                ? filterGrupos[0]
                                                : `${filterGrupos.length} líneas selec.`}
                                        </span>
                                    </div>
                                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${isGruposDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isGruposDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setIsGruposDropdownOpen(false)} />
                                        <div className="absolute left-0 mt-1.5 w-[340px] sm:w-[400px] bg-white border border-gray-200 rounded-2xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                            <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs">
                                                <span className="font-bold text-gray-700">Filtrar por Línea / Grupo</span>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetGrupos([...gruposUnicos])}
                                                        className="text-primary hover:underline font-semibold cursor-pointer"
                                                    >
                                                        Todas
                                                    </button>
                                                    <span className="text-gray-300">·</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetGrupos([])}
                                                        className="text-gray-500 hover:underline font-medium cursor-pointer"
                                                    >
                                                        Limpiar
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-2 max-h-64 overflow-y-auto overflow-x-hidden space-y-0.5">
                                                {gruposUnicos.length === 0 ? (
                                                    <div className="p-3 text-xs text-gray-400 text-center">No hay líneas / grupos disponibles</div>
                                                ) : (
                                                    gruposUnicos.map(g => {
                                                        const checked = filterGrupos.includes(g);
                                                        return (
                                                            <label
                                                                key={g}
                                                                className={`flex items-start gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                                                                    checked ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700 hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => handleToggleGrupo(g)}
                                                                    className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20 cursor-pointer shrink-0 mt-0.5"
                                                                />
                                                                <span className={`leading-snug break-words flex-1 ${g.startsWith('(Sin') ? 'italic text-amber-700 font-medium' : ''}`}>{g}</span>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <div className="p-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsGruposDropdownOpen(false)}
                                                    className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:brightness-105 transition-all shadow-xs cursor-pointer"
                                                >
                                                    Aplicar
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 5. Selector Multi-Destino con Checkboxes */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsDestinosDropdownOpen(prev => !prev)}
                                    className={`px-3 py-2.5 border rounded-xl text-sm bg-white flex items-center justify-between gap-2 min-w-[160px] transition-all cursor-pointer ${
                                        filterDestinos.length > 0
                                            ? 'border-primary/50 text-primary font-bold bg-primary/5 ring-1 ring-primary/20'
                                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                                        <Target size={15} className={filterDestinos.length > 0 ? 'text-primary' : 'text-gray-400'} />
                                        <span className="truncate">
                                            {filterDestinos.length === 0
                                                ? 'Todos los destinos'
                                                : filterDestinos.length === 1
                                                ? filterDestinos[0]
                                                : `${filterDestinos.length} dest. selec.`}
                                        </span>
                                    </div>
                                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${isDestinosDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isDestinosDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setIsDestinosDropdownOpen(false)} />
                                        <div className="absolute left-0 mt-1.5 w-[320px] sm:w-[360px] bg-white border border-gray-200 rounded-2xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                            <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs">
                                                <span className="font-bold text-gray-700">Filtrar por Destino</span>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetDestinos([...destinosUnicos])}
                                                        className="text-primary hover:underline font-semibold cursor-pointer"
                                                    >
                                                        Todos
                                                    </button>
                                                    <span className="text-gray-300">·</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetDestinos([])}
                                                        className="text-gray-500 hover:underline font-medium cursor-pointer"
                                                    >
                                                        Limpiar
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-2 max-h-60 overflow-y-auto overflow-x-hidden space-y-0.5">
                                                {destinosUnicos.length === 0 ? (
                                                    <div className="p-3 text-xs text-gray-400 text-center">No hay destinos disponibles</div>
                                                ) : (
                                                    destinosUnicos.map(d => {
                                                        const checked = filterDestinos.includes(d);
                                                        return (
                                                            <label
                                                                key={d}
                                                                className={`flex items-start gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                                                                    checked ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700 hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => handleToggleDestino(d)}
                                                                    className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20 cursor-pointer shrink-0 mt-0.5"
                                                                />
                                                                <span className="leading-snug break-words flex-1">{d}</span>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <div className="p-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsDestinosDropdownOpen(false)}
                                                    className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:brightness-105 transition-all shadow-xs cursor-pointer"
                                                >
                                                    Aplicar
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 5.5. Selector Multi-Motivo / Justificación con Checkboxes */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsMotivosDropdownOpen(prev => !prev)}
                                    className={`px-3 py-2.5 border rounded-xl text-sm bg-white flex items-center justify-between gap-2 min-w-[170px] transition-all cursor-pointer ${
                                        filterMotivos.length > 0
                                            ? 'border-primary/50 text-primary font-bold bg-primary/5 ring-1 ring-primary/20'
                                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 truncate max-w-[180px]">
                                        <MessageSquare size={15} className={filterMotivos.length > 0 ? 'text-primary' : 'text-gray-400'} />
                                        <span className="truncate">
                                            {filterMotivos.length === 0
                                                ? 'Todos los motivos'
                                                : filterMotivos.length === 1
                                                ? filterMotivos[0]
                                                : `${filterMotivos.length} motivos selec.`}
                                        </span>
                                    </div>
                                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${isMotivosDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isMotivosDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setIsMotivosDropdownOpen(false)} />
                                        <div className="absolute left-0 mt-1.5 w-[340px] sm:w-[420px] bg-white border border-gray-200 rounded-2xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                            <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs">
                                                <span className="font-bold text-gray-700">Filtrar por Just. Actividad / Motivo</span>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetMotivos([...motivosUnicos])}
                                                        className="text-primary hover:underline font-semibold cursor-pointer"
                                                    >
                                                        Todos
                                                    </button>
                                                    <span className="text-gray-300">·</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetMotivos([])}
                                                        className="text-gray-500 hover:underline font-medium cursor-pointer"
                                                    >
                                                        Limpiar
                                                    </button>
                                                </div>
                                            </div>
                                            {/* Buscador dentro del dropdown */}
                                            <div className="p-2 border-b border-gray-100 bg-white">
                                                <div className="relative">
                                                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="Buscar motivo..."
                                                        value={motivoSearchQuery}
                                                        onChange={e => setMotivoSearchQuery(e.target.value)}
                                                        className="w-full pl-8 pr-7 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:bg-white text-gray-800 placeholder-gray-400"
                                                    />
                                                    {motivoSearchQuery && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setMotivoSearchQuery('')}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="p-2 max-h-64 overflow-y-auto overflow-x-hidden space-y-0.5">
                                                {motivosFiltrados.length === 0 ? (
                                                    <div className="p-3 text-xs text-gray-400 text-center">No hay motivos que coincidan</div>
                                                ) : (
                                                    motivosFiltrados.map(m => {
                                                        const checked = filterMotivos.includes(m);
                                                        const isBlank = m === SIN_MOTIVO_LABEL;
                                                        return (
                                                            <label
                                                                key={m}
                                                                className={`flex items-start gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                                                                    checked ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700 hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => handleToggleMotivo(m)}
                                                                    className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20 cursor-pointer shrink-0 mt-0.5"
                                                                />
                                                                <span className={`leading-snug break-words flex-1 ${isBlank ? 'italic text-amber-700 font-bold' : ''}`}>
                                                                    {isBlank ? (
                                                                        <span className="inline-flex items-center gap-1.5">
                                                                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block shrink-0"></span>
                                                                            (En blanco / Sin motivo)
                                                                        </span>
                                                                    ) : m}
                                                                </span>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <div className="p-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsMotivosDropdownOpen(false)}
                                                    className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:brightness-105 transition-all shadow-xs cursor-pointer"
                                                >
                                                    Aplicar
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 6. Selector Multi-Estado con Checkboxes */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setIsEstadosDropdownOpen(prev => !prev)}
                                    className={`px-3 py-2.5 border rounded-xl text-sm bg-white flex items-center justify-between gap-2 min-w-[150px] transition-all cursor-pointer ${
                                        filterEstadosCompra.length > 0
                                            ? 'border-primary/50 text-primary font-bold bg-primary/5 ring-1 ring-primary/20'
                                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                                        <CheckCircle size={15} className={filterEstadosCompra.length > 0 ? 'text-primary' : 'text-gray-400'} />
                                        <span className="truncate">
                                            {filterEstadosCompra.length === 0
                                                ? 'Todos los estados'
                                                : filterEstadosCompra.length === 1
                                                ? filterEstadosCompra[0]
                                                : `${filterEstadosCompra.length} estados selec.`}
                                        </span>
                                    </div>
                                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${isEstadosDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isEstadosDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setIsEstadosDropdownOpen(false)} />
                                        <div className="absolute left-0 mt-1.5 w-[280px] bg-white border border-gray-200 rounded-2xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                            <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs">
                                                <span className="font-bold text-gray-700">Filtrar por Estado</span>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetEstadosCompra(['Pendiente', 'Aprobado', 'En camino', 'Comprado'])}
                                                        className="text-primary hover:underline font-semibold cursor-pointer"
                                                    >
                                                        Todos
                                                    </button>
                                                    <span className="text-gray-300">·</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSetEstadosCompra([])}
                                                        className="text-gray-500 hover:underline font-medium cursor-pointer"
                                                    >
                                                        Limpiar
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-2 max-h-60 overflow-y-auto overflow-x-hidden space-y-0.5">
                                                {(['Pendiente', 'Aprobado', 'En camino', 'Comprado'] as EstadoCompra[]).map(est => {
                                                    const checked = filterEstadosCompra.includes(est);
                                                    return (
                                                        <label
                                                            key={est}
                                                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                                                                checked ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700 hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => handleToggleEstadoCompra(est)}
                                                                    className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/20 cursor-pointer"
                                                                />
                                                                <span className="truncate">{est}</span>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            <div className="p-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEstadosDropdownOpen(false)}
                                                    className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:brightness-105 transition-all shadow-xs cursor-pointer"
                                                >
                                                    Aplicar
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 7. Rango de fechas */}
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="date"
                                    value={filterFechaDesde}
                                    onChange={(e) => handleFechaDesdeChange(e.target.value)}
                                    className="px-2.5 py-2.5 border border-gray-200 rounded-xl text-xs bg-white focus:ring-1 focus:ring-primary text-gray-700"
                                    title="Fecha desde"
                                />
                                <span className="text-xs text-gray-400">—</span>
                                <input
                                    type="date"
                                    value={filterFechaHasta}
                                    onChange={(e) => handleFechaHastaChange(e.target.value)}
                                    className="px-2.5 py-2.5 border border-gray-200 rounded-xl text-xs bg-white focus:ring-1 focus:ring-primary text-gray-700"
                                    title="Fecha hasta"
                                />
                            </div>
                            {/* 8. Ver Pendientes */}
                            <button
                                type="button"
                                onClick={handleTogglePendientes}
                                className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-xs font-bold transition-all ${
                                    showOnlyPendientes
                                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-amber-400 hover:text-amber-600'
                                }`}
                                title="Alternar entre recursos Aprobados y recursos Pendientes de aprobación"
                            >
                                <span className={`w-3 h-3 rounded-full ${showOnlyPendientes ? 'bg-white' : 'bg-amber-500'}`}></span>
                                {showOnlyPendientes ? 'Viendo Pendientes de Aprobación' : 'Ver Pendientes'}
                            </button>
                            {/* 9. Columnas */}
                            <button
                                onClick={() => setShowColsModal(true)}
                                className="px-3.5 py-2.5 border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-primary font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm"
                                title="Configurar columnas visibles de la tabla maestra (guardado en LocalStorage)"
                            >
                                <SlidersHorizontal size={16} />
                                <span>Columnas</span>
                            </button>
                            {/* Limpiar filtros */}
                            {tieneFiltrosActivos && (
                                <button
                                    onClick={limpiarFiltros}
                                    className="px-3.5 py-2.5 border border-red-200 rounded-xl bg-red-50 hover:bg-red-100 transition-colors text-red-600 font-semibold text-sm flex items-center gap-1.5"
                                    title="Limpiar todos los filtros"
                                >
                                    <RotateCcw size={14} />
                                    Limpiar
                                </button>
                            )}
                        </div>
                        {/* Barra de selección */}
                        {selectedUids.size > 0 && (
                            <div className="flex items-center gap-4 mb-4 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                                <CheckSquare size={18} className="text-primary" />
                                <span className="text-sm font-semibold text-gray-700">
                                    {selectedUids.size} item{selectedUids.size > 1 ? 's' : ''} seleccionado{selectedUids.size > 1 ? 's' : ''}
                                </span>
                                <span className="text-sm text-gray-500">·</span>
                                <span className="text-sm font-bold text-gray-900">{formatCLP(selectedTotal)}</span>
                                <div className="flex-1" />
                                <button
                                    onClick={() => setSelectedUids(new Set())}
                                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                                >
                                    Limpiar selección
                                </button>
                                <button
                                    onClick={() => {
                                        const selectedItems = masterItems.filter(i => selectedUids.has(i.uid));
                                        handleExportarExcelRecursos(selectedItems);
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                                    title="Descargar planilla Excel detallada de los recursos seleccionados con colores del colegio"
                                >
                                    <Download size={16} />
                                    Descargar Excel
                                </button>
                                <button
                                    onClick={handleOpenActasModal}
                                    className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                                >
                                    <FileText size={16} />
                                    Generar Acta ({selectedUids.size} item{selectedUids.size !== 1 ? 's' : ''})
                                </button>
                            </div>
                        )}
                        {/* Barra de Control de Paginación y Resumen Superior */}
                        {filtered.length > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-4 mb-4 bg-white p-3.5 rounded-2xl border border-gray-100 shadow-sm text-xs">
                                <div className="flex items-center gap-3">
                                    <span className="text-gray-600 font-semibold">
                                        Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filtered.length)} de {filtered.length} recursos
                                    </span>
                                    <span className="text-gray-300">|</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-gray-500 font-semibold">Filas por página:</span>
                                        <select
                                            value={itemsPerPage}
                                            onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                                            className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                                        >
                                            {PAGE_SIZE_OPTIONS.map(sz => (
                                                <option key={sz} value={sz}>{sz}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {totalPages > 1 && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed font-bold transition-all shadow-sm"
                                        >
                                            Anterior
                                        </button>
                                        <span className="font-extrabold text-gray-800 px-2 bg-gray-50 py-1 rounded-lg border border-gray-100">
                                            Página {currentPage} de {totalPages}
                                        </span>
                                        <button
                                            disabled={currentPage >= totalPages}
                                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed font-bold transition-all shadow-sm"
                                        >
                                            Siguiente
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tabla principal */}
                        <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-100">
                                    <thead className="bg-gray-50/50">
                                        <tr>
                                            <th className="px-4 py-4 text-center w-12">
                                                <input
                                                    type="checkbox"
                                                    checked={filtered.length > 0 && filtered.every(i => selectedUids.has(i.uid))}
                                                    onChange={toggleSelectAll}
                                                    className="rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                                    title="Seleccionar todos los items"
                                                />
                                            </th>
                                            <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">#</th>
                                            {renderSortTh('producto', 'Producto')}
                                            {isColVisible('descripcion') && renderSortTh('descripcion', 'Descripción')}
                                            {isColVisible('actividad_pme') && renderSortTh('actividad_pme', 'Nombre de Actividad del PME')}
                                            {isColVisible('motivo') && renderSortTh('motivo', 'Just. Actividad / Motivo')}
                                            {isColVisible('categoria') && renderSortTh('categoria', 'Categoría')}
                                            {isColVisible('grupo') && renderSortTh('grupo', 'Línea / Grupo')}
                                            {isColVisible('destino') && renderSortTh('destino', 'Destino')}
                                            {isColVisible('cantidad') && renderSortTh('cantidad', 'Cant. Presup.')}
                                            {isColVisible('total') && renderSortTh('total', 'Monto Presup.')}
                                            {isColVisible('cantidad_real') && renderSortTh('cantidad_real', 'Cant. Real', 'text-emerald-800 bg-emerald-50/30')}
                                            {isColVisible('monto_real') && renderSortTh('monto_real', 'Monto Real', 'text-emerald-800 bg-emerald-50/30')}
                                            {isColVisible('centro_costos') && renderSortTh('centro_costos', 'C. Costos')}
                                            {isColVisible('observacion') && renderSortTh('observacion', 'Observación')}
                                            {isColVisible('fecha') && renderSortTh('fecha', 'Fecha Solicitud')}
                                            {isColVisible('origen') && renderSortTh('origen', 'Origen')}
                                            {isColVisible('area') && renderSortTh('area', 'Área')}
                                            {isColVisible('solicitante') && renderSortTh('solicitante', 'Solicitante')}
                                            {isColVisible('estado') && renderSortTh('estado', 'Estado', '', true)}
                                            <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                        {loading ? (
                                            <tr>
                                                <td colSpan={colCount + 1} className="px-6 py-12 text-center text-gray-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <Loader2 className="animate-spin" size={24} />
                                                        <span>Cargando recursos aprobados...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : filtered.length === 0 ? (
                                            <tr>
                                                <td colSpan={colCount + 1} className="px-6 py-16 text-center text-gray-400">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <div className="p-4 bg-gray-50 rounded-2xl">
                                                            <Package size={32} className="text-gray-300" />
                                                        </div>
                                                        <p className="font-medium text-gray-500">No hay recursos para los filtros seleccionados.</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : paginatedFiltered.map((item, idx) => {
                                            const est = getEstado(item.uid);
                                            const isAprobadoVal = item.esAprobadoSostenedor !== false;
                                            const qtyReal = item.cantidad_real !== undefined ? item.cantidad_real : item.detalle.cantidad;
                                            const valReal = item.valor_real !== undefined
                                                ? item.valor_real
                                                : (item.detalle.valor_real_iva != null
                                                    ? (qtyReal > 0 ? item.detalle.valor_real_iva / qtyReal : item.detalle.valor_real_iva)
                                                    : item.detalle.valor_unitario_iva);
                                            const totalReal = item.valor_real !== undefined
                                                ? qtyReal * item.valor_real
                                                : (item.detalle.valor_real_iva != null
                                                    ? item.detalle.valor_real_iva
                                                    : qtyReal * item.detalle.valor_unitario_iva);

                                            return (
                                                <tr key={item.uid} className={`transition-colors ${!isAprobadoVal ? 'bg-amber-50/40 hover:bg-amber-50/60 border-l-4 border-l-amber-400' : selectedUids.has(item.uid) ? 'bg-primary/5' : 'hover:bg-gray-50/50'}`}>
                                                    <td className="px-4 py-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedUids.has(item.uid)}
                                                            onChange={() => toggleSelect(item.uid)}
                                                            className="rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                                        />
                                                    </td>
                                                     <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-medium">
                                                         {idx + 1}
                                                     </td>
                                                     <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                         <div className="flex items-center gap-1.5 flex-wrap">
                                                             <span className="font-bold text-gray-900">{item.detalle.nombre_producto}</span>
                                                             {isColVisible('codigo_solicitud') && (
                                                                 <span className="text-[10px] text-gray-400 font-mono font-normal">({item.solicitudCodigo})</span>
                                                             )}
                                                             {(() => {
                                                                 const actaVinculada = actasPorDetalleMap.get(item.detalle.id_pre_detalle);
                                                                 if (!actaVinculada) return null;
                                                                 return (
                                                                     <button
                                                                         type="button"
                                                                         onClick={() => setViewingActa(actaVinculada)}
                                                                         className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md text-[10px] font-bold shadow-2xs transition-all cursor-pointer hover:scale-105 active:scale-95"
                                                                         title={`Ver Acta Oficial ${actaVinculada.codigo_acta} (Emitida el ${actaVinculada.fecha})`}
                                                                     >
                                                                         <Flag size={10} className="fill-emerald-600 text-emerald-600" />
                                                                         <span className="font-mono tracking-tight">{actaVinculada.codigo_acta}</span>
                                                                     </button>
                                                                 );
                                                             })()}
                                                         </div>
                                                         {isColVisible('codigo_cuenta') && item.detalle.codigo_cuenta && (
                                                             <div className="text-[11px] text-gray-400 font-mono mt-0.5">{item.detalle.codigo_cuenta}</div>
                                                         )}
                                                     </td>
                                                     {isColVisible('descripcion') && (
                                                         <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={item.detalle.descripcion || ''}>
                                                             {item.detalle.descripcion || <span className="text-xs text-gray-300">—</span>}
                                                         </td>
                                                     )}
                                                     {isColVisible('actividad_pme') && (
                                                         <td className="px-4 py-3 text-xs max-w-xs break-words" title={item.detalle.actividad_nombre || 'Sin actividad asignada'}>
                                                             {item.detalle.actividad_nombre ? (
                                                                 <div className="space-y-1">
                                                                     <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-lg text-xs font-semibold leading-snug">
                                                                         <Target size={12} className="shrink-0 text-emerald-600" />
                                                                         <span>{item.detalle.actividad_nombre}</span>
                                                                     </span>
                                                                     {item.detalle.accion_nombre && (
                                                                         <p className="text-[11px] text-gray-400 font-medium truncate" title={item.detalle.accion_nombre}>
                                                                             Acción: {item.detalle.accion_nombre}
                                                                         </p>
                                                                     )}
                                                                 </div>
                                                             ) : (
                                                                 <span className="text-xs text-gray-300 italic">—</span>
                                                             )}
                                                         </td>
                                                     )}
                                                     {isColVisible('motivo') && (
                                                         <td className="px-4 py-3 text-sm text-gray-600 max-w-xs whitespace-normal break-words" title={item.detalle.motivo || ''}>
                                                             {item.detalle.motivo || <span className="text-xs text-gray-300">—</span>}
                                                         </td>
                                                     )}
                                                     {isColVisible('categoria') && (
                                                         <td className="px-4 py-3 whitespace-nowrap">
                                                             {item.detalle.categoria_nombre ? (
                                                                 <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                                                                     {item.detalle.categoria_nombre}
                                                                 </span>
                                                             ) : (
                                                                 <span className="text-xs text-gray-300">—</span>
                                                             )}
                                                         </td>
                                                     )}
                                                     {isColVisible('grupo') && (
                                                         <td className="px-4 py-3 whitespace-nowrap">
                                                             {item.detalle.grupo_nombre ? (
                                                                 <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/60 rounded text-xs font-medium">
                                                                     {item.detalle.grupo_nombre}
                                                                 </span>
                                                             ) : (
                                                                 <span className="text-xs text-gray-300">—</span>
                                                             )}
                                                         </td>
                                                     )}
                                                     {isColVisible('destino') && (() => {
                                                         const rawDest = (item.detalle.destino_gasto || '').toUpperCase();
                                                         let label = item.detalle.destino_gasto || '—';
                                                         let badge = 'bg-gray-50 text-gray-600 border-gray-200';

                                                         if (rawDest.includes('ESTUDIANTE') || rawDest.includes('ALUMNO') || rawDest.includes('SALA')) {
                                                             label = 'Estudiante';
                                                             badge = 'bg-blue-50 text-blue-700 border-blue-200';
                                                         } else if (rawDest.includes('FUNCIONARIO') || rawDest.includes('DOCENTE') || rawDest.includes('OFICINA') || rawDest.includes('ADMIN')) {
                                                             label = 'Funcionario';
                                                             badge = 'bg-purple-50 text-purple-700 border-purple-200';
                                                         } else if (rawDest.includes('PREMIO')) {
                                                             label = 'Premio / Beneficio';
                                                             badge = 'bg-amber-50 text-amber-700 border-amber-200';
                                                         } else if (rawDest.includes('MANTEN')) {
                                                             label = 'Mantención';
                                                             badge = 'bg-slate-100 text-slate-700 border-slate-200';
                                                         }

                                                         return (
                                                             <td className="px-4 py-3 whitespace-nowrap">
                                                                 {item.detalle.destino_gasto ? (
                                                                     <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border inline-block shadow-2xs ${badge}`}>
                                                                         {label}
                                                                     </span>
                                                                 ) : (
                                                                     <span className="text-xs text-gray-300">—</span>
                                                                 )}
                                                             </td>
                                                         );
                                                     })()}
                                                     {isColVisible('cantidad') && (
                                                         <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 font-medium">
                                                             {item.detalle.cantidad} <span className="text-xs text-gray-400">{item.detalle.formato_unidad}</span>
                                                         </td>
                                                     )}
                                                     {isColVisible('total') && (
                                                         <td className="px-4 py-3 whitespace-nowrap">
                                                             <div className="text-xs text-gray-500">{formatCLP(item.detalle.valor_unitario_iva)} <span className="text-[10px] text-gray-400">/ unit.</span></div>
                                                             <div className="text-sm font-extrabold text-gray-900">Total: {formatCLP(item.detalle.total_iva)}</div>
                                                         </td>
                                                     )}
                                                     {isColVisible('cantidad_real') && (
                                                         <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-emerald-900 bg-emerald-50/20">
                                                             {qtyReal} <span className="text-xs font-normal text-gray-500">{item.detalle.formato_unidad}</span>
                                                         </td>
                                                     )}
                                                     {isColVisible('monto_real') && (
                                                         <td className="px-4 py-3 whitespace-nowrap bg-emerald-50/20">
                                                             <div className="text-xs text-emerald-700">{formatCLP(valReal)} <span className="text-[10px] text-emerald-600">/ unit.</span></div>
                                                             <div className="text-sm font-extrabold text-emerald-900">Total: {formatCLP(totalReal)}</div>
                                                         </td>
                                                     )}
                                                     {isColVisible('centro_costos') && (
                                                         <td className="px-4 py-3 whitespace-nowrap">
                                                             <div className="font-bold text-xs text-gray-800">{item.centro_costos || 'GENERAL'}</div>
                                                             {item.detalle.codigo_cuenta && (
                                                                 <div className="text-[10px] text-gray-400 font-mono">C. Cuent: {item.detalle.codigo_cuenta}</div>
                                                             )}
                                                         </td>
                                                     )}
                                                     {isColVisible('observacion') && (
                                                         <td className="px-4 py-3 text-xs text-gray-600 max-w-xs break-words">
                                                             {item.observacion || <span className="text-gray-300 italic">—</span>}
                                                         </td>
                                                     )}
                                                     {isColVisible('fecha') && (
                                                         <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                                             {formatFechaSolicitud(item.detalle)}
                                                         </td>
                                                     )}
                                                     {isColVisible('origen') && (
                                                         <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                                                             <button
                                                                 onClick={() => router.push(`/go-compras/historial/${item.solicitudId}`)}
                                                                 className="text-primary hover:underline font-semibold"
                                                                 title="Ver solicitud de origen"
                                                             >
                                                                 {item.solicitudCodigo}
                                                             </button>
                                                         </td>
                                                     )}
                                                     {isColVisible('area') && (
                                                         <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 font-medium">
                                                             {item.area || <span className="text-xs text-gray-300">—</span>}
                                                         </td>
                                                     )}
                                                     {isColVisible('solicitante') && (
                                                         <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 font-medium">
                                                             {item.solicitante || <span className="text-xs text-gray-300">—</span>}
                                                         </td>
                                                     )}
                                                     {isColVisible('estado') && (
                                                          <td className="px-4 py-3 whitespace-nowrap text-center">
                                                              {puedeEditarEstadoTabla ? (
                                                                  <select
                                                                      value={est}
                                                                       onChange={(e) => {
                                                                           const nuevo = e.target.value as EstadoCompra;
                                                                           if (nuevo === est) return;
                                                                           setConfirmChangeEstadoModal({
                                                                               item,
                                                                               estadoAnterior: est,
                                                                               nuevoEstado: nuevo
                                                                           });
                                                                       }}
                                                                      className={`px-2.5 py-1 border rounded-full text-xs font-bold shadow-sm cursor-pointer outline-none focus:ring-2 focus:ring-primary ${
                                                                          est === 'Aprobado'
                                                                              ? 'bg-emerald-100 text-emerald-900 border-emerald-400 hover:bg-emerald-200 ring-1 ring-emerald-300'
                                                                              : est === 'Comprado'
                                                                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                                                              : est === 'En revisión'
                                                                              ? 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100'
                                                                              : est === 'En camino'
                                                                              ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                                                                              : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                                                                      }`}
                                                                  >
                                                                       <option value="Pendiente">Pendiente</option>
                                                                       <option value="Aprobado">Aprobado</option>
                                                                       <option value="En camino">En camino</option>
                                                                       <option value="Comprado">Comprado</option>
                                                                      {est === 'En revisión' && <option value="En revisión">⏳ En revisión</option>}
                                                                  </select>
                                                              ) : (
                                                                  <span className={`px-2.5 py-1 border rounded-full text-xs font-bold inline-block shadow-sm ${
                                                                      est === 'Aprobado'
                                                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 ring-1 ring-emerald-200'
                                                                          : est === 'Comprado'
                                                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                          : est === 'En revisión'
                                                                          ? 'bg-purple-50 text-purple-700 border-purple-200 animate-pulse'
                                                                          : est === 'En camino'
                                                                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                          : 'bg-amber-50 text-amber-700 border-amber-200'
                                                                  }`}>
                                                                      {est === 'En revisión' ? '⏳ En revisión' : est}
                                                                  </span>
                                                              )}
                                                              {/* Badge del estado de la solicitud de presupuesto */}
                                                              {(() => {
                                                                  const pptoEst = item.detalle.estado_aprobacion || 'Pendiente';
                                                                  const esAjuste = pptoEst === 'Con Ajustes' || pptoEst === 'Aprobado con Ajustes' || pptoEst === 'Aprobado con ajustes';
                                                                  const esAprobado = pptoEst === 'Aprobado';
                                                                  const esRechazado = pptoEst === 'Rechazado';
                                                                  
                                                                  const badgeClass = esAprobado
                                                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                      : esAjuste
                                                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                                      : esRechazado
                                                                      ? 'bg-red-50 text-red-700 border-red-200'
                                                                      : 'bg-amber-50 text-amber-700 border-amber-200';

                                                                  const labelEst = esAjuste ? 'Con Ajustes' : pptoEst;

                                                                  return (
                                                                      <div className="mt-1 flex flex-col items-center gap-0.5">
                                                                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 shadow-2xs ${badgeClass}`}>
                                                                              <span className="text-[9px] text-gray-400 font-semibold uppercase">Ppto:</span> {labelEst}
                                                                              
                                                                              {item.detalle.comentario_revision && esAjuste && (
                                                                                  <button
                                                                                      type="button"
                                                                                      onClick={(e) => {
                                                                                          e.stopPropagation();
                                                                                          alert(`Observación de Ajuste (${item.detalle.nombre_producto}):\n\n"${item.detalle.comentario_revision}"`);
                                                                                      }}
                                                                                      className="ml-0.5 inline-flex items-center justify-center text-indigo-600 hover:text-indigo-900 hover:bg-indigo-100/80 rounded-full p-0.5 transition-colors cursor-pointer"
                                                                                      title={`Ajuste indicado: ${item.detalle.comentario_revision}`}
                                                                                  >
                                                                                      <HelpCircle size={12} className="stroke-[2.5]" />
                                                                                  </button>
                                                                              )}
                                                                          </span>
                                                                      </div>
                                                                  );
                                                              })()}
                                                          </td>
                                                      )}
                                                      <td className="px-4 py-3 whitespace-nowrap text-center">
                                                          {(() => {
                                                              const isEditDisabled = est === 'Comprado' && !puedeEditarJefe;
                                                              return (
                                                                  <button
                                                                      disabled={isEditDisabled}
                                                                      onClick={() => {
                                                                          if (isEditDisabled) return;
                                                                          const extra = itemExtras[item.uid] || {};
                                                                          const rawCantReal = extra.cantidad_real !== undefined ? extra.cantidad_real : item.detalle.cantidad;
                                                                          const rawPrecioReal = extra.valor_real !== undefined ? extra.valor_real : (extra.monto_real !== undefined ? extra.monto_real : (item.detalle.valor_real_iva != null && rawCantReal > 0 ? Math.round(item.detalle.valor_real_iva / rawCantReal) : item.detalle.valor_unitario_iva));

                                                                          setEditJustificationItem(item);
                                                                          setEditJustificationText(item.detalle.motivo || '');
                                                                          setEditJustificationMotivoCambio('');
                                                                          setEditModalCantReal(rawCantReal);
                                                                          setEditModalPrecioReal(rawPrecioReal);
                                                                          setEditModalObservacion(item.observacion || '');
                                                                          setEditModalCentroCostos(item.centro_costos || 'GENERAL');
                                                                          setEditModalEstado(est);
                                                                      }}
                                                                      className={`p-2 rounded-xl transition-all font-semibold text-xs flex items-center justify-center gap-1.5 mx-auto shadow-sm border ${
                                                                          isEditDisabled
                                                                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                                                                              : 'bg-amber-50 hover:bg-amber-500 text-amber-600 hover:text-white border-amber-200 cursor-pointer'
                                                                      }`}
                                                                      title={
                                                                          isEditDisabled
                                                                              ? 'Insumo finalizado en estado Comprado. Edición permitida únicamente para Jefe de Compras y Administrador.'
                                                                              : 'Editar insumo y enviar cambios'
                                                                      }
                                                                  >
                                                                      <Edit2 size={15} />
                                                                      <span>Editar</span>
                                                                  </button>
                                                              );
                                                          })()}
                                                      </td>
                                                  </tr>
                                             );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {filtered.length > 0 && (() => {
                                const totalPresup = filtered.reduce((a, i) => a + (i.detalle.total_iva || 0), 0);
                                const totalRealVal = filtered.reduce((a, i) => {
                                    const qtyReal = i.cantidad_real !== undefined ? i.cantidad_real : i.detalle.cantidad;
                                    const itemTotal = i.valor_real !== undefined
                                        ? qtyReal * i.valor_real
                                        : (i.detalle.valor_real_iva != null
                                            ? i.detalle.valor_real_iva
                                            : qtyReal * i.detalle.valor_unitario_iva);
                                    return a + itemTotal;
                                }, 0);
                                if (!isMounted) return null;
                                const startIdx = ((currentPage - 1) * itemsPerPage) + 1;
                                const endIdx = Math.min(currentPage * itemsPerPage, filtered.length);
                                const totalPages = Math.ceil(filtered.length / itemsPerPage);

                                return (
                                    <div className="px-6 py-3.5 bg-gray-50/80 border-t border-gray-200 flex flex-wrap items-center justify-between gap-4 text-xs">
                                        <div className="flex items-center gap-3">
                                            <span className="text-gray-500 font-medium">
                                                Mostrando {startIdx} - {endIdx} de {filtered.length} recursos
                                            </span>
                                            <span className="text-gray-300">|</span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-gray-500 font-semibold">Filas por página:</span>
                                                <select
                                                    value={itemsPerPage}
                                                    onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                                                    className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                                                >
                                                    {PAGE_SIZE_OPTIONS.map(sz => (
                                                        <option key={sz} value={sz}>{sz}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6">
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-500 font-semibold uppercase tracking-wider text-[11px]">Total Presupuestado:</span>
                                                <span className="font-extrabold text-gray-900 text-sm">{formatCLP(totalPresup)}</span>
                                            </div>
                                            <div className="flex items-center gap-2 bg-emerald-100/70 border border-emerald-300 px-3 py-1 rounded-xl">
                                                <span className="text-emerald-900 font-bold uppercase tracking-wider text-[11px]">Total Real:</span>
                                                        <span className="font-black text-emerald-800 text-sm">{formatCLP(totalRealVal)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
            {/* ── Modal: Configurar Columnas ─────────────────────────────────── */}
            {showColsModal && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    onClick={() => setShowColsModal(false)}
                >
                    <div 
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 flex items-center justify-between bg-gray-50 border-b border-gray-100">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                                    <SlidersHorizontal size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Columnas Visibles</h3>
                                    <p className="text-sm text-gray-500">Elige qué columnas mostrar en la tabla.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowColsModal(false)}
                                className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-200/60 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                                {COLUMNAS_MAESTRA.map(col => (
                                    <label 
                                        key={col.key} 
                                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 cursor-pointer group transition-colors select-none"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={visibleCols[col.key] !== false}
                                            onChange={() => {
                                                const next = { ...visibleCols, [col.key]: !visibleCols[col.key] };
                                                setVisibleCols(next);
                                                saveColsConfig(next);
                                            }}
                                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer shrink-0"
                                        />
                                        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                                            {col.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50 flex items-center justify-between border-t border-gray-100">
                            <button
                                onClick={() => {
                                    setVisibleCols({ ...COLS_DEFAULT });
                                    saveColsConfig({ ...COLS_DEFAULT });
                                }}
                                className="text-xs text-gray-500 hover:text-gray-800 font-semibold px-3 py-2 rounded-lg hover:bg-gray-200/50 transition-colors"
                            >
                                Restaurar por defecto
                            </button>
                            <button
                                onClick={() => setShowColsModal(false)}
                                className="px-5 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl transition-colors font-semibold text-sm shadow-xs"
                            >
                                Listo
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Modal: Configurar Columnas de Acta ─────────────────────────── */}
            {showActaColsModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-6 flex items-center gap-4 bg-gray-50 border-b border-gray-100">
                            <div className="p-3 rounded-xl bg-primary/10 text-primary">
                                <SlidersHorizontal size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Columnas en Acta</h3>
                                <p className="text-sm text-gray-500">Elige qué datos mostrar en las Actas.</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-3">
                            {COLUMNAS_ACTA.map(col => (
                                <label key={col.key} className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={actaVisibleCols[col.key] !== false}
                                        onChange={() => {
                                            const next = { ...actaVisibleCols, [col.key]: !actaVisibleCols[col.key] };
                                            setActaVisibleCols(next);
                                            saveActaColsConfig(next);
                                        }}
                                        className="rounded border-gray-300 text-primary focus:ring-primary"
                                    />
                                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{col.label}</span>
                                </label>
                            ))}
                        </div>
                        <div className="p-6 bg-gray-50 flex justify-between border-t border-gray-100">
                            <button
                                onClick={() => {
                                    setActaVisibleCols({ ...ACTA_COLS_DEFAULT });
                                    saveActaColsConfig({ ...ACTA_COLS_DEFAULT });
                                }}
                                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                            >
                                Restaurar por defecto
                            </button>
                            <button
                                onClick={() => setShowActaColsModal(false)}
                                className="px-4 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl transition-colors font-semibold text-sm"
                            >
                                Listo
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Modal: Generación de Acta de Entrega Oficial con Correlativo ── */}
            {showActasModal && (() => {
                const itemsAProcesar = selectedUids.size > 0
                    ? masterItems.filter(i => selectedUids.has(i.uid))
                    : filtered.filter(i => i.detalle.estado_aprobacion === 'Aprobado');

                if (!isMounted) return null;

                const colegioActual = itemsAProcesar[0]?.colegio || (colegioId === '2' ? 'Colegio Diego Portales' : 'Colegio Macaya');

                return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[92vh] flex flex-col border border-gray-100 animate-in zoom-in-95 duration-200">
                            {/* Header del Modal */}
                            <div className="p-5 flex items-center justify-between bg-slate-900 text-white shrink-0">
                                <div className="flex items-center gap-3.5">
                                    <div className="p-3 bg-amber-500/20 border border-amber-400/30 text-amber-400 rounded-2xl shadow-inner">
                                        <FileText size={24} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-black tracking-tight text-white">Acta de Entrega Oficial</h3>
                                            {loadingCorrelativo ? (
                                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-amber-300 animate-pulse">
                                                    Asignando correlativo...
                                                </span>
                                            ) : (
                                                <span className="px-3 py-0.5 rounded-full text-xs font-black bg-amber-400 text-slate-950 shadow-sm font-mono tracking-wider">
                                                    {actaForm.codigoActa}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5 font-medium">
                                            {colegioActual} · Emisión y seguimiento oficial de recepción de recursos
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowActasModal(false)}
                                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Cuerpo del Formulario */}
                            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-5 text-xs">
                                {/* Banner Informativo de Cambio de Estado */}
                                <div className="bg-emerald-50/90 border border-emerald-300/80 rounded-2xl p-4 flex items-center gap-3 shadow-xs">
                                    <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                                        <CheckCircle size={18} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-emerald-950">
                                            Actualización de Estado de Insumos
                                        </p>
                                        <p className="text-[11px] text-emerald-800 font-medium">
                                            Los <strong className="font-extrabold text-emerald-950 underline">{itemsAProcesar.length} productos</strong> pasarán automáticamente a estado <strong className="font-black px-1.5 py-0.5 bg-emerald-200 text-emerald-900 rounded uppercase">{actaForm.actualizarEstado}</strong> al momento de guardar.
                                        </p>
                                    </div>
                                </div>

                                {/* Bloque 1: Metadatos Oficiales del Acta */}
                                <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-2">
                                        <CalendarClock size={15} className="text-primary" /> Datos del Acta y Encabezado
                                    </h4>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {/* N° Correlativo / Código */}
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                                N° Correlativo Oficial *
                                            </label>
                                            <input
                                                type="text"
                                                value={actaForm.codigoActa}
                                                onChange={(e) => setActaForm(prev => ({ ...prev, codigoActa: e.target.value }))}
                                                placeholder="Ej: CS - N°051/2026"
                                                className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                            />
                                        </div>

                                        {/* Fecha de Emisión */}
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                                Fecha de Emisión *
                                            </label>
                                            <input
                                                type="date"
                                                value={actaForm.fecha}
                                                onChange={(e) => setActaForm(prev => ({ ...prev, fecha: e.target.value }))}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-medium text-gray-800 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                            />
                                        </div>

                                        {/* Ciudad / Comuna */}
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                                Ciudad / Sede
                                            </label>
                                            <input
                                                type="text"
                                                value={actaForm.ciudad}
                                                onChange={(e) => setActaForm(prev => ({ ...prev, ciudad: e.target.value }))}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-medium text-gray-800 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                            />
                                        </div>

                                        {/* Emisor (DE) */}
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                                De (Emisor)
                                            </label>
                                            <input
                                                type="text"
                                                value={actaForm.deEmisor}
                                                onChange={(e) => setActaForm(prev => ({ ...prev, deEmisor: e.target.value }))}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl font-bold text-gray-800 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                        {/* Receptor (PARA) */}
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                                Para (Nombre del Receptor / Jefatura) *
                                            </label>
                                            <input
                                                type="text"
                                                value={actaForm.paraNombre}
                                                onChange={(e) => setActaForm(prev => ({ ...prev, paraNombre: e.target.value }))}
                                                placeholder="Ej: Elias Melgarejo - Finanzas"
                                                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                            />
                                        </div>

                                        {/* Cargo / Área Receptor */}
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                                Cargo o Área Receptor
                                            </label>
                                            <input
                                                type="text"
                                                value={actaForm.paraCargo}
                                                onChange={(e) => setActaForm(prev => ({ ...prev, paraCargo: e.target.value }))}
                                                placeholder="Ej: Finanzas"
                                                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl font-medium text-gray-800 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                        {/* Asunto */}
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                                Asunto de la Entrega *
                                            </label>
                                            <input
                                                type="text"
                                                value={actaForm.asunto}
                                                onChange={(e) => setActaForm(prev => ({ ...prev, asunto: e.target.value }))}
                                                placeholder="Ej: ENTREGA CARTON CORRUGADO"
                                                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-primary/20 focus:border-primary uppercase"
                                            />
                                        </div>

                                        {/* Factura N° y Proveedor */}
                                        <div>
                                            <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                                N° Factura y Proveedor / Razón Social
                                            </label>
                                            <input
                                                type="text"
                                                value={actaForm.numeroFactura}
                                                onChange={(e) => setActaForm(prev => ({ ...prev, numeroFactura: e.target.value }))}
                                                placeholder="Ej: 1477608 LONZA HERMANOS LTDA."
                                                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl font-medium text-gray-800 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                            />
                                        </div>
                                    </div>

                                    {/* Observación general */}
                                    <div className="pt-2">
                                        <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                            Observación / Indicación adicional (opcional)
                                        </label>
                                        <textarea
                                            value={actaForm.observacion}
                                            onChange={(e) => setActaForm(prev => ({ ...prev, observacion: e.target.value }))}
                                            placeholder="Detalle o instrucción especial para la entrega..."
                                            rows={2}
                                            className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-gray-800 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                        />
                                    </div>
                                </div>

                                {/* Bloque 2: Tabla de Recursos que integran el Acta */}
                                <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3">
                                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                            Detalle de Recursos a Entregar ({itemsAProcesar.length} insumos)
                                        </h4>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-semibold text-gray-500">Al emitir, cambiar estado a:</span>
                                            <select
                                                value={actaForm.actualizarEstado}
                                                onChange={(e) => setActaForm(prev => ({ ...prev, actualizarEstado: e.target.value as EstadoCompra }))}
                                                className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold rounded-lg text-xs cursor-pointer"
                                            >
                                                <option value="Comprado">Comprado</option>
                                                <option value="En camino">En camino</option>
                                                <option value="Aprobado">Aprobado</option>
                                                <option value="Pendiente">Pendiente</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                                        <table className="min-w-full divide-y divide-gray-100 text-xs">
                                            <thead className="bg-slate-50 text-slate-600 font-bold">
                                                <tr>
                                                    <th className="px-3 py-2.5 text-center w-12">#</th>
                                                    <th className="px-3 py-2.5 text-center w-24">Cant. Real</th>
                                                    <th className="px-3 py-2.5 text-left w-28">Formato/Unidad</th>
                                                    <th className="px-3 py-2.5 text-left">Recurso / Especificación</th>
                                                    <th className="px-3 py-2.5 text-left">Área / Cargo</th>
                                                    <th className="px-3 py-2.5 text-left w-28">Solicitud</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 bg-white">
                                                {itemsAProcesar.map((item, idx) => {
                                                    const qtyReal = item.cantidad_real !== undefined ? item.cantidad_real : item.detalle.cantidad;
                                                    const unidad = (item.detalle.formato_unidad || 'UNIDAD').toUpperCase();
                                                    return (
                                                        <tr key={item.uid} className="hover:bg-slate-50/50">
                                                            <td className="px-3 py-2 text-center font-mono font-bold text-gray-400">
                                                                {String(idx + 1).padStart(2, '0')}
                                                            </td>
                                                            <td className="px-3 py-2 text-center font-mono font-bold text-emerald-700 bg-emerald-50/30">
                                                                {qtyReal}
                                                            </td>
                                                            <td className="px-3 py-2 font-bold text-gray-700">
                                                                {unidad}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <span className="font-extrabold text-gray-900 block">{item.detalle.nombre_producto}</span>
                                                                {item.detalle.descripcion && (
                                                                    <span className="text-[11px] text-gray-500 block leading-tight">{item.detalle.descripcion}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-gray-600">
                                                                <span className="font-semibold text-gray-800">{item.area}</span>
                                                                {item.cargo && <span className="text-[10px] text-gray-400 block">({item.cargo})</span>}
                                                            </td>
                                                            <td className="px-3 py-2 font-mono text-gray-500 font-semibold text-[11px]">
                                                                {item.solicitudCodigo}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Footer del Modal */}
                            <div className="p-4 bg-gray-100 flex flex-wrap justify-between items-center gap-3 border-t border-gray-200 shrink-0">
                                <span className="text-xs text-gray-600 font-medium flex items-center gap-1.5">
                                    <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                                    Los <strong className="text-emerald-800 font-bold">{itemsAProcesar.length} productos</strong> pasarán a estado <strong className="text-emerald-900 font-black uppercase">"{actaForm.actualizarEstado}"</strong> al guardar.
                                </span>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowActasModal(false)}
                                        className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors font-bold text-xs cursor-pointer"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleGuardarYEmitirActa(itemsAProcesar)}
                                        disabled={isEmittingActa || loadingCorrelativo}
                                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all duration-200 shadow-lg shadow-emerald-600/25 active:scale-95 cursor-pointer"
                                    >
                                        {isEmittingActa ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin" />
                                                Emitiendo y Generando PDF...
                                            </>
                                        ) : (
                                            <>
                                                <Download size={16} />
                                                Guardar y Descargar PDF Oficial
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Modal de Guardado Exitoso / Resumen de Cambios de la Fila */}
            {savedItemSummary && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-center">
                        <div className="h-14 w-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                            <CheckCircle size={32} />
                        </div>

                        <div>
                            <h3 className="text-xl font-extrabold text-gray-900">¡Cambios Guardados Exitosamente!</h3>
                            <p className="text-xs text-gray-500 font-medium mt-1">
                                Los datos del recurso se han actualizado correctamente en el servidor.
                            </p>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-left space-y-2.5 text-xs">
                            <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                                <span className="text-gray-500 font-medium">Recurso / Producto:</span>
                                <span className="font-bold text-gray-900">{savedItemSummary.nombre_producto}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                                <span className="text-gray-500 font-medium">Solicitud Origen:</span>
                                <span className="font-mono font-bold text-primary">{savedItemSummary.codigo_solicitud}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                                <span className="text-gray-500 font-medium">Cantidad Real:</span>
                                <span className="font-bold text-gray-900">{savedItemSummary.cant_real}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                                <span className="text-gray-500 font-medium">Precio Real (IVA):</span>
                                <span className="font-bold text-gray-900">{formatCLP(savedItemSummary.val_real)}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                                <span className="text-gray-500 font-medium">Total Real Registrado:</span>
                                <span className="font-extrabold text-emerald-700 text-sm">{formatCLP(savedItemSummary.total_real)}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                                <span className="text-gray-500 font-medium">Subvención / C. Costos:</span>
                                <span className="font-semibold text-gray-800">{savedItemSummary.centro_costos}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                                <span className="text-gray-500 font-medium">Observación:</span>
                                <span className="text-gray-700 italic">{savedItemSummary.observacion}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500 font-medium">Estado Actual:</span>
                                <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                                    savedItemSummary.estado === 'Comprado' ? 'bg-green-100 text-green-800' :
                                    savedItemSummary.estado === 'En camino' ? 'bg-blue-100 text-blue-800' :
                                    'bg-amber-100 text-amber-800'
                                }`}>
                                    {savedItemSummary.estado}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={() => setSavedItemSummary(null)}
                            className="w-full py-3 bg-primary hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-primary/25 cursor-pointer"
                        >
                            Aceptar y Continuar
                        </button>
                    </div>
                </div>
            )}
            {/* Modal para solicitar cambio de justificación (Operador/Solicitante) */}
            {editJustificationItem && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
                        <div className="flex items-center justify-between border-b pb-3">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Edit2 className="text-amber-500" size={20} />
                                Modificar Insumo de Compra
                            </h3>
                            <button
                                onClick={() => setEditJustificationItem(null)}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex justify-between items-center">
                                <div>
                                    <p className="text-xs text-gray-500 font-semibold">Producto / Recurso</p>
                                    <p className="text-sm font-bold text-gray-800">{editJustificationItem.detalle.nombre_producto}</p>
                                    <p className="text-xs text-gray-400 font-mono">Solicitud: {editJustificationItem.solicitudCodigo}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase">Total Estimado Real</p>
                                    <p className="text-sm font-extrabold text-emerald-700">{formatCLP(editModalCantReal * editModalPrecioReal)}</p>
                                </div>
                            </div>

                            {/* Edición de Valores Operativos Directos */}
                            <div className="grid grid-cols-2 gap-3 bg-emerald-50/40 p-3 rounded-2xl border border-emerald-100">
                                <div>
                                    <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                                        Cantidad Real ({editJustificationItem.detalle.formato_unidad}):
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={editModalCantReal}
                                        onChange={e => setEditModalCantReal(parseFloat(e.target.value) || 0)}
                                        className="w-full p-2 text-xs font-bold border border-emerald-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 text-emerald-950"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                                        Precio Real con IVA ($):
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={editModalPrecioReal}
                                        onChange={e => setEditModalPrecioReal(parseFloat(e.target.value) || 0)}
                                        className="w-full p-2 text-xs font-bold border border-emerald-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 text-emerald-950"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">
                                        Centro de Costos:
                                    </label>
                                    <select
                                        value={editModalCentroCostos}
                                        onChange={e => setEditModalCentroCostos(e.target.value)}
                                        className="w-full p-2.5 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary text-gray-800"
                                    >
                                        <option value="GENERAL">GENERAL</option>
                                        <option value="SEP">SEP</option>
                                        <option value="PIE">PIE</option>
                                        <option value="SUBVENCION GENERAL">SUBVENCIÓN GENERAL</option>
                                        <option value="MANTENCION">MANTENCIÓN</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">
                                        Observación de Compra:
                                    </label>
                                    <input
                                        type="text"
                                        value={editModalObservacion}
                                        onChange={e => setEditModalObservacion(e.target.value)}
                                        className="w-full p-2.5 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary text-gray-800"
                                        placeholder="Agregar observación..."
                                    />
                                </div>
                            </div>

                            {/* Propuesta de Justificación */}
                            <div className="border-t border-gray-100 pt-3">
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Justificación / Motivo oficial propuesta:
                                </label>
                                <textarea
                                    rows={3}
                                    value={editJustificationText}
                                    onChange={e => setEditJustificationText(e.target.value)}
                                    className="w-full p-3 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-800"
                                    placeholder="Escribe aquí el motivo o justificación..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">
                                    Motivo del cambio o aclaración para el Jefe de Compras:
                                </label>
                                <input
                                    type="text"
                                    value={editJustificationMotivoCambio}
                                    onChange={e => setEditJustificationMotivoCambio(e.target.value)}
                                    className="w-full p-2.5 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 text-gray-800"
                                    placeholder="Ej: Especificación técnica requerida, corrección de destino..."
                                />
                            </div>

                            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2">
                                <Clock className="text-amber-600 shrink-0 mt-0.5" size={16} />
                                <p className="text-[11px] text-amber-800 leading-snug">
                                    {puedeEditarJefe ? (
                                        <>Al guardar los cambios como <strong>Jefe de Compras / Administrador</strong>, la Cantidad Real, Precio Real, Centro de Costos, Observación y Justificación se actualizarán inmediatamente en la base de datos y quedarán visibles para todos los usuarios.</>
                                    ) : (
                                        <>Al hacer clic en <strong>"Enviar Propuesta al Jefe de Compras"</strong>, todos los cambios (Cantidad Real, Precio Real, Centro de Costos, Observación y Justificación) se enviarán como propuesta a la cargo <strong>Jefe de Compras</strong> para su revisión y aprobación.</>
                                    )}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                            <div>
                                {getEstado(editJustificationItem.uid) !== 'Pendiente' && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (confirm('¿Deseas restablecer este insumo al estado Pendiente y limpiar la programación real?')) {
                                                try {
                                                    await api.put(`/presupuesto/detalles/${editJustificationItem.detalle.id_pre_detalle}`, {
                                                        valor_real_iva: null,
                                                        cantidad_real: null,
                                                        estado_aprobacion: 'Pendiente'
                                                    });
                                                } catch (e) {
                                                    console.error('Error limpiando en backend:', e);
                                                }
                                                const updated = { ...itemEstados, [editJustificationItem.uid]: 'Pendiente' as EstadoCompra };
                                                setItemEstados(updated);
                                                saveItemEstados(updated);

                                                const updatedExtras = { ...itemExtras };
                                                delete updatedExtras[editJustificationItem.uid];
                                                setItemExtras(updatedExtras);
                                                saveExtras(updatedExtras);

                                                setEditJustificationItem(null);
                                            }
                                        }}
                                        className="px-3.5 py-2 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                                        title="Restablecer insumo a estado Pendiente"
                                    >
                                        <RotateCcw size={14} />
                                        Restablecer a Pendiente
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setEditJustificationItem(null)}
                                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    disabled={sendingModPropuesta || !editJustificationText.trim()}
                                    onClick={async () => {
                                        setSendingModPropuesta(true);
                                        try {
                                            const totalRealCalc = editModalCantReal * editModalPrecioReal;

                                            if (puedeEditarJefe) {
                                                // Jefe de Compras o Administrador guarda y persiste directamente en la base de datos
                                                await api.put(`/presupuesto/detalles/${editJustificationItem.detalle.id_pre_detalle}`, {
                                                    cantidad_real: editModalCantReal,
                                                    valor_real_iva: totalRealCalc,
                                                    centro_costos: editModalCentroCostos,
                                                    observacion: editModalObservacion,
                                                    motivo: editJustificationText.trim(),
                                                    estado_compra: 'Comprado'
                                                });

                                                const nextEstados = { ...itemEstados, [editJustificationItem.uid]: 'Comprado' as EstadoCompra };
                                                setItemEstados(nextEstados);
                                                saveItemEstados(nextEstados);

                                                const nextExtras = {
                                                    ...itemExtras,
                                                    [editJustificationItem.uid]: {
                                                        cantidad_real: editModalCantReal,
                                                        valor_real: editModalPrecioReal,
                                                        monto_real: editModalPrecioReal,
                                                        centro_costos: editModalCentroCostos,
                                                        observacion: editModalObservacion,
                                                        motivo: editJustificationText.trim()
                                                    }
                                                };
                                                setItemExtras(nextExtras as any);
                                                saveExtras(nextExtras as any);

                                                await fetchCompras();

                                                setSavedItemSummary({
                                                    nombre_producto: editJustificationItem.detalle.nombre_producto,
                                                    codigo_solicitud: editJustificationItem.solicitudCodigo,
                                                    cant_real: editModalCantReal,
                                                    val_real: editModalPrecioReal,
                                                    total_real: totalRealCalc,
                                                    centro_costos: editModalCentroCostos,
                                                    observacion: editModalObservacion || '-',
                                                    estado: 'Comprado'
                                                });
                                            } else {
                                                // Usuario regular envía propuesta al Jefe de Compras
                                                await api.post('/presupuesto/solicitudes-modificacion', {
                                                    id_pre_detalle: editJustificationItem.detalle.id_pre_detalle,
                                                    valor_propuesto: editJustificationText.trim(),
                                                    motivo_cambio: editJustificationMotivoCambio.trim() || undefined,
                                                    cantidad_real: editModalCantReal,
                                                    valor_real_iva: totalRealCalc,
                                                    centro_costos: editModalCentroCostos,
                                                    observacion: editModalObservacion
                                                });

                                                const nextEstados = { ...itemEstados, [editJustificationItem.uid]: 'En revisión' as EstadoCompra };
                                                setItemEstados(nextEstados);
                                                saveItemEstados(nextEstados);

                                                const nextExtras = {
                                                    ...itemExtras,
                                                    [editJustificationItem.uid]: {
                                                        cantidad_real: editModalCantReal,
                                                        valor_real: editModalPrecioReal,
                                                        monto_real: editModalPrecioReal,
                                                        centro_costos: editModalCentroCostos,
                                                        observacion: editModalObservacion,
                                                        motivo: editJustificationText.trim()
                                                    }
                                                };
                                                setItemExtras(nextExtras as any);
                                                saveExtras(nextExtras as any);

                                                await fetchCompras();

                                                setSavedItemSummary({
                                                    nombre_producto: editJustificationItem.detalle.nombre_producto,
                                                    codigo_solicitud: editJustificationItem.solicitudCodigo,
                                                    cant_real: editModalCantReal,
                                                    val_real: editModalPrecioReal,
                                                    total_real: totalRealCalc,
                                                    centro_costos: editModalCentroCostos,
                                                    observacion: editModalObservacion || '-',
                                                    estado: 'En revisión'
                                                });
                                            }

                                            setEditJustificationItem(null);
                                        } catch (e: any) {
                                            console.error(e);
                                            alert(e.response?.data?.detail || 'Error al guardar los datos.');
                                        } finally {
                                            setSendingModPropuesta(false);
                                        }
                                    }}
                                    className={`px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50 rounded-xl shadow-md flex items-center gap-2 cursor-pointer ${
                                        puedeEditarJefe
                                            ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                                            : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                                    }`}
                                >
                                    {sendingModPropuesta ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    {puedeEditarJefe ? 'Guardar Cambios (Comprado)' : 'Enviar Propuesta al Jefe de Compras'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Revisión y Aprobación de Cambios (Exclusivo Jefe de Compras) */}
            {showRevisionModModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-7xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between border-b pb-3 shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    <CheckCircle className="text-amber-500" size={22} />
                                    Revisión de Cambios de Justificación
                                </h3>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                    Sección exclusiva para autorizar o rechazar solicitudes de modificación enviadas por los usuarios.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowRevisionModModal(false)}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
                            {solicitudesModPendientes.length === 0 ? (
                                        <div className="p-12 text-center text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                    <CheckCircle size={32} className="mx-auto mb-2 text-gray-300" />
                                    <p className="font-semibold text-sm">No hay solicitudes de cambio pendientes.</p>
                                </div>
                            ) : (
                                <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-gray-100/80 border-b border-gray-200 text-[11px] font-bold text-gray-600 uppercase">
                                            <tr>
                                                <th className="px-3 py-3">Origen</th>
                                                <th className="px-3 py-3">Producto / Recurso</th>
                                                <th className="px-3 py-3 text-center">Cant. Presup.</th>
                                                <th className="px-3 py-3">Monto Presup.</th>
                                                <th className="px-3 py-3 text-center text-emerald-900 bg-emerald-100/60">Cant. Real</th>
                                                <th className="px-3 py-3 text-emerald-900 bg-emerald-100/60">Monto Real</th>
                                                <th className="px-3 py-3">Justificación (Antes)</th>
                                                <th className="px-3 py-3 bg-amber-100/60 text-amber-900">Nueva Justificación (Después)</th>
                                                <th className="px-3 py-3">Solicitante</th>
                                                <th className="px-3 py-3 text-center">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-xs bg-white">
                                            {solicitudesModPendientes.map((s: any) => {
                                                const matchUid = Object.keys(itemExtras).find(k => k.endsWith(`-${s.id_pre_detalle}`));
                                                const extra = matchUid ? itemExtras[matchUid] : null;
                                                 const cantRealVal = s.cantidad_real_propuesta != null ? Number(s.cantidad_real_propuesta) : (s.cantidad_real != null ? Number(s.cantidad_real) : (extra?.cantidad_real !== undefined ? extra.cantidad_real : (s.cantidad || 1)));
                                                 const totalRealVal = s.valor_real_iva_propuesto != null ? Number(s.valor_real_iva_propuesto) : (s.valor_real_iva != null ? Number(s.valor_real_iva) : ((extra?.monto_real && cantRealVal) ? (extra.monto_real * cantRealVal) : (cantRealVal * (s.valor_unitario_iva || 0))));
                                                 const precioRealUnitVal = cantRealVal > 0 ? (totalRealVal / cantRealVal) : (s.valor_unitario_iva || 0);

                                                return (
                                                <tr key={s.id_solicitud_mod} className="hover:bg-amber-50/30 transition-colors">
                                                    <td className="px-3 py-3 whitespace-nowrap">
                                                        <span className="font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded text-[10px] font-mono">
                                                            {s.solicitud_codigo}
                                                        </span>
                                                        <div className="text-[10px] text-gray-400 mt-0.5">{s.colegio || s.cargo}</div>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <span className="font-bold text-gray-900 block">{s.nombre_producto}</span>
                                                        {s.codigo_cuenta && <span className="text-[10px] text-gray-400 font-mono">Cuenta: {s.codigo_cuenta}</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-center whitespace-nowrap font-medium text-gray-700">
                                                        {s.cantidad || 1} <span className="text-[10px] text-gray-400">{s.formato_unidad}</span>
                                                    </td>
                                                    <td className="px-3 py-3 whitespace-nowrap">
                                                        <div className="text-xs text-gray-500">{formatCLP(s.valor_unitario_iva || 0)} <span className="text-[10px] text-gray-400">/ unit.</span></div>
                                                        <div className="text-xs font-bold text-gray-900">Total: {formatCLP(s.total_iva || 0)}</div>
                                                    </td>
                                                    <td className="px-3 py-3 text-center whitespace-nowrap font-bold text-emerald-950 bg-emerald-50/30">
                                                        {cantRealVal} <span className="text-[10px] text-emerald-700 font-normal">{s.formato_unidad}</span>
                                                    </td>
                                                    <td className="px-3 py-3 whitespace-nowrap bg-emerald-50/30">
                                                        <div className="text-xs text-emerald-700 font-medium">
                                                            {formatCLP(precioRealUnitVal)} <span className="text-[10px] text-emerald-600">/ unit.</span>
                                                        </div>
                                                        <div className="text-xs font-extrabold text-emerald-950">
                                                            Total: {formatCLP(totalRealVal)}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 max-w-xs break-words text-gray-600 bg-gray-50/50">
                                                        <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-bold uppercase mb-1">Antes</span>
                                                        <div>{s.valor_anterior || <span className="text-gray-300 italic">—</span>}</div>
                                                    </td>
                                                    <td className="px-3 py-3 max-w-xs break-words font-semibold text-amber-950 bg-amber-50/60">
                                                        <span className="inline-block px-1.5 py-0.5 bg-amber-200 text-amber-900 rounded text-[10px] font-bold uppercase mb-1">Después</span>
                                                        <div>{s.valor_propuesto}</div>
                                                        {s.motivo_cambio && (
                                                            <div className="text-[10px] text-amber-800 font-normal italic mt-1 border-t border-amber-200/50 pt-0.5">
                                                                Nota: {s.motivo_cambio}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3 whitespace-nowrap">
                                                        <div className="font-medium text-gray-800">{s.solicitante}</div>
                                                        <div className="text-[10px] text-gray-400">{s.cargo}</div>
                                                    </td>
                                                    <td className="px-3 py-3 text-center whitespace-nowrap">
                                                        <div className="flex justify-center items-center gap-1.5">
                                                            <button
                                                                disabled={respondingModId === s.id_solicitud_mod}
                                                                onClick={async () => {
                                                                    setRespondingModId(s.id_solicitud_mod);
                                                                    try {
                                                                        await api.put(`/presupuesto/solicitudes-modificacion/${s.id_solicitud_mod}/responder`, {
                                                                            accion: 'RECHAZAR'
                                                                        });
                                                                        // Al rechazar, el ítem vuelve a estado "Pendiente"
                                                                        const targetUid = Object.keys(itemEstados).find(k => k.endsWith(`-${s.id_pre_detalle}`));
                                                                        if (targetUid) {
                                                                            const updated = { ...itemEstados, [targetUid]: 'Pendiente' as EstadoCompra };
                                                                            setItemEstados(updated);
                                                                            saveItemEstados(updated);
                                                                        }
                                                                        setSolicitudesModPendientes(prev => prev.filter(x => x.id_solicitud_mod !== s.id_solicitud_mod));
                                                                    } catch (e) {
                                                                        console.error(e);
                                                                        alert('Error al rechazar solicitud');
                                                                    } finally {
                                                                        setRespondingModId(null);
                                                                    }
                                                                }}
                                                                className="px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
                                                                title="Rechazar cambio de justificación (vuelve a Pendiente)"
                                                            >
                                                                Rechazar
                                                            </button>
                                                            <button
                                                                disabled={respondingModId === s.id_solicitud_mod}
                                                                onClick={async () => {
                                                                    setRespondingModId(s.id_solicitud_mod);
                                                                    try {
                                                                        await api.put(`/presupuesto/solicitudes-modificacion/${s.id_solicitud_mod}/responder`, {
                                                                            accion: 'APROBAR'
                                                                        });
                                                                        // Al aprobar, el ítem pasa a estado "Comprado"
                                                                        const targetUid = Object.keys(itemEstados).find(k => k.endsWith(`-${s.id_pre_detalle}`));
                                                                        if (targetUid) {
                                                                            const updated = { ...itemEstados, [targetUid]: 'Comprado' as EstadoCompra };
                                                                            setItemEstados(updated);
                                                                            saveItemEstados(updated);
                                                                        }
                                                                        setSolicitudesModPendientes(prev => prev.filter(x => x.id_solicitud_mod !== s.id_solicitud_mod));
                                                                        window.location.reload();
                                                                    } catch (e) {
                                                                        console.error(e);
                                                                        alert('Error al aprobar solicitud');
                                                                    } finally {
                                                                        setRespondingModId(null);
                                                                    }
                                                                }}
                                                                className="px-3 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
                                                                title="Aprobar cambio (pasa a Comprado)"
                                                            >
                                                                {respondingModId === s.id_solicitud_mod ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                                                Aprobar
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end shrink-0 pt-2 border-t">
                            <button
                                onClick={() => setShowRevisionModModal(false)}
                                className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl text-xs font-semibold"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Confirmación de Cambio de Estado (Select) */}
            {confirmChangeEstadoModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-gray-100">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
                                    <ArrowUpDown size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-gray-900">¿Seguro que desea hacer el cambio?</h3>
                                    <p className="text-xs text-gray-500">Confirmación de cambio de estado de compra</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setConfirmChangeEstadoModal(null)}
                                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Comparación de Estados */}
                        <div className="flex items-center justify-center gap-3 bg-gray-50 p-3.5 rounded-2xl border border-gray-200/80">
                            <div className="text-center">
                                <span className="text-[10px] text-gray-400 font-bold block mb-1 uppercase tracking-wider">Estado Actual</span>
                                <span className={`px-3 py-1 rounded-full text-xs font-extrabold border inline-block ${
                                    confirmChangeEstadoModal.estadoAnterior === 'Comprado'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                        : confirmChangeEstadoModal.estadoAnterior === 'En revisión'
                                        ? 'bg-purple-50 text-purple-700 border-purple-300'
                                        : confirmChangeEstadoModal.estadoAnterior === 'En camino'
                                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                                        : 'bg-amber-50 text-amber-700 border-amber-300'
                                }`}>
                                    {confirmChangeEstadoModal.estadoAnterior === 'En revisión' ? '⏳ En revisión' : confirmChangeEstadoModal.estadoAnterior}
                                </span>
                            </div>

                            <div className="text-gray-400 font-bold text-lg">➔</div>

                            <div className="text-center">
                                <span className="text-[10px] text-gray-400 font-bold block mb-1 uppercase tracking-wider">Nuevo Estado</span>
                                <span className={`px-3 py-1 rounded-full text-xs font-extrabold border inline-block ${
                                    confirmChangeEstadoModal.nuevoEstado === 'Comprado'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                        : confirmChangeEstadoModal.nuevoEstado === 'En revisión'
                                        ? 'bg-purple-50 text-purple-700 border-purple-300'
                                        : confirmChangeEstadoModal.nuevoEstado === 'En camino'
                                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                                        : 'bg-amber-50 text-amber-700 border-amber-300'
                                }`}>
                                    {confirmChangeEstadoModal.nuevoEstado === 'En revisión' ? '⏳ En revisión' : confirmChangeEstadoModal.nuevoEstado}
                                </span>
                            </div>
                        </div>

                        {/* Ficha de Detalles del Insumo */}
                        <div className="space-y-2.5 bg-slate-50/70 p-4 rounded-2xl border border-slate-200 text-xs">
                            <div>
                                <span className="text-gray-400 font-semibold block text-[11px]">Insumo / Producto:</span>
                                <span className="font-extrabold text-gray-900 text-sm">
                                    {confirmChangeEstadoModal.item.detalle.nombre_producto}
                                </span>
                                <span className="text-gray-400 font-mono text-[10px] ml-1.5">
                                    ({confirmChangeEstadoModal.item.solicitudCodigo})
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
                                <div>
                                    <span className="text-gray-400 font-semibold block text-[11px]">Cantidad:</span>
                                    <span className="font-bold text-gray-800">
                                        {confirmChangeEstadoModal.item.detalle.cantidad} {confirmChangeEstadoModal.item.detalle.formato_unidad}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-400 font-semibold block text-[11px]">Fecha:</span>
                                    <span className="font-bold text-gray-800">
                                        {formatFechaSolicitud(confirmChangeEstadoModal.item.detalle)}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/60">
                                <div>
                                    <span className="text-gray-400 font-semibold block text-[11px]">Área / Cargo:</span>
                                    <span className="font-bold text-gray-800">
                                        {confirmChangeEstadoModal.item.area || '—'} {confirmChangeEstadoModal.item.cargo ? `(${confirmChangeEstadoModal.item.cargo})` : ''}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-400 font-semibold block text-[11px]">Solicitante:</span>
                                    <span className="font-bold text-gray-800">
                                        {confirmChangeEstadoModal.item.solicitante || '—'}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-1 border-t border-slate-200/60">
                                <span className="text-gray-400 font-semibold block text-[11px]">Justificación / Motivo:</span>
                                <p className="text-gray-700 font-medium italic mt-0.5 leading-relaxed">
                                    "{confirmChangeEstadoModal.item.motivo || confirmChangeEstadoModal.item.detalle.motivo || 'Sin motivo registrado'}"
                                </p>
                            </div>
                        </div>

                        {/* Acciones */}
                        <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-100">
                            <button
                                disabled={isSavingEstadoChange}
                                onClick={() => setConfirmChangeEstadoModal(null)}
                                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl cursor-pointer transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                disabled={isSavingEstadoChange}
                                onClick={handleConfirmarCambioEstado}
                                className="px-5 py-2 text-xs font-bold text-white bg-primary hover:bg-blue-600 rounded-xl shadow-md shadow-primary/20 flex items-center gap-1.5 cursor-pointer transition-all"
                            >
                                {isSavingEstadoChange ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                                <span>Confirmar Cambio</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Ver Detalle de Acta de Entrega Emitida ── */}
            {viewingActa && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col border border-gray-100 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-5 flex items-center justify-between bg-slate-900 text-white shrink-0">
                            <div className="flex items-center gap-3.5">
                                <div className="p-3 bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 rounded-2xl shadow-inner">
                                    <FileText size={24} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-black tracking-tight text-white">Acta Oficial de Entrega</h3>
                                        <span className="px-3 py-0.5 rounded-full text-xs font-black bg-amber-400 text-slate-950 shadow-sm font-mono tracking-wider">
                                            {viewingActa.codigo_acta}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5 font-medium">
                                        {viewingActa.colegio_nombre || 'Colegio'} · Emitida formalmente el {viewingActa.fecha}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setViewingActa(null)}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Contenido */}
                        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-4 text-xs">
                            {/* Metadatos */}
                            <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <div>
                                    <span className="text-gray-400 font-bold block text-[10px] uppercase">Receptor (Para):</span>
                                    <span className="font-extrabold text-gray-900 text-sm">{viewingActa.para_nombre}</span>
                                    {viewingActa.para_cargo && (
                                        <span className="text-gray-500 block text-xs mt-0.5">{viewingActa.para_cargo}</span>
                                    )}
                                </div>
                                <div>
                                    <span className="text-gray-400 font-bold block text-[10px] uppercase">Emisor (De):</span>
                                    <span className="font-bold text-gray-800 text-xs">{viewingActa.de_emisor}</span>
                                    <span className="text-gray-400 block text-[11px] mt-0.5">Sede: {viewingActa.ciudad}</span>
                                </div>
                                <div className="sm:col-span-2 pt-2 border-t border-gray-100">
                                    <span className="text-gray-400 font-bold block text-[10px] uppercase">Asunto:</span>
                                    <span className="font-extrabold text-gray-900 text-xs uppercase tracking-wide">{viewingActa.asunto}</span>
                                </div>
                                {viewingActa.numero_factura && (
                                    <div>
                                        <span className="text-gray-400 font-bold block text-[10px] uppercase">Factura y Proveedor:</span>
                                        <span className="font-bold text-gray-800 text-xs">{viewingActa.numero_factura}</span>
                                    </div>
                                )}
                                {viewingActa.observacion && (
                                    <div className="sm:col-span-2">
                                        <span className="text-gray-400 font-bold block text-[10px] uppercase">Observación:</span>
                                        <span className="text-gray-700 font-medium italic block text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                            "{viewingActa.observacion}"
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Listado de Insumos Entregados en esta Acta */}
                            <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs space-y-2.5">
                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                                    <Package size={14} className="text-emerald-600" />
                                    Insumos Entregados ({viewingActa.detalles?.length || 0})
                                </h4>
                                <div className="border border-gray-100 rounded-xl overflow-hidden">
                                    <table className="min-w-full divide-y divide-gray-100 text-xs">
                                        <thead className="bg-slate-50 text-slate-600 font-bold">
                                            <tr>
                                                <th className="px-3 py-2 text-center w-10">#</th>
                                                <th className="px-3 py-2 text-center w-20">Cant.</th>
                                                <th className="px-3 py-2 text-left w-24">Formato</th>
                                                <th className="px-3 py-2 text-left">Recurso / Especificación</th>
                                                <th className="px-3 py-2 text-left">Área / Cargo</th>
                                                <th className="px-3 py-2 text-left w-24">Solicitud</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {(viewingActa.detalles || []).map((det: any, idx: number) => (
                                                <tr key={det.id_acta_detalle || idx} className="hover:bg-slate-50/50">
                                                    <td className="px-3 py-2 text-center font-mono font-bold text-gray-400">
                                                        {String(idx + 1).padStart(2, '0')}
                                                    </td>
                                                    <td className="px-3 py-2 text-center font-mono font-bold text-emerald-700 bg-emerald-50/30">
                                                        {det.cantidad}
                                                    </td>
                                                    <td className="px-3 py-2 font-bold text-gray-700">
                                                        {det.formato_unidad || 'UNIDAD'}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className="font-extrabold text-gray-900 block">{det.nombre_producto}</span>
                                                        {det.descripcion && (
                                                            <span className="text-[11px] text-gray-500 block leading-tight">{det.descripcion}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-600 font-medium">
                                                        {det.cargo_area || '—'}
                                                    </td>
                                                    <td className="px-3 py-2 font-mono text-gray-500 font-semibold text-[11px]">
                                                        {det.solicitud_codigo || '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-gray-100 flex justify-between items-center border-t border-gray-200 shrink-0">
                            <span className="text-xs text-gray-500 font-medium flex items-center gap-1.5">
                                <CheckCircle size={14} className="text-emerald-600" />
                                Acta oficial registrada en el sistema.
                            </span>
                            <div className="flex gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => setViewingActa(null)}
                                    className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors font-bold text-xs cursor-pointer"
                                >
                                    Cerrar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDownloadSingleActaPdf(viewingActa.id_acta, viewingActa.codigo_acta)}
                                    disabled={downloadingActaPdfId === viewingActa.id_acta}
                                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all duration-200 shadow-lg shadow-emerald-600/25 active:scale-95 cursor-pointer"
                                >
                                    {downloadingActaPdfId === viewingActa.id_acta ? (
                                        <>
                                            <Loader2 size={15} className="animate-spin" />
                                            Descargando...
                                        </>
                                    ) : (
                                        <>
                                            <Download size={15} />
                                            Descargar PDF Oficial
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </>
    );
}

// reload force a1bf1fce