'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import { 
    Search, TrendingDown, DollarSign, FileText, CheckCircle, Clock, 
    Loader2, Check, Download, Eye, AlertTriangle, RotateCcw, Info, 
    Trash2, Send, ListFilter, Layers, Package, ExternalLink, XCircle, Tag, Calendar, Edit3, X, MessageSquare, AlertCircle,
    ChevronDown, ChevronUp
} from 'lucide-react';
import { BudgetRequest, BudgetDetail } from '@/lib/types';
import { primeraRutaAccesible } from '@/lib/permissions/registry';
import ComprasFilters from '@/components/go-compras/ComprasFilters';
import * as XLSX from 'xlsx';

const MESES = [
    { value: '01', label: 'Enero' },
    { value: '02', label: 'Febrero' },
    { value: '03', label: 'Marzo' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Mayo' },
    { value: '06', label: 'Junio' },
    { value: '07', label: 'Julio' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' },
];

interface FlatItem {
    id_presupuesto: number;
    codigo_solicitud: string;
    fecha_solicitud: string;
    user_nombre?: string;
    area_nombre?: string;
    subarea_nombre?: string;
    colegio_nombre?: string;
    estado_solicitud: string;
    // detalle
    id_pre_detalle: number;
    nombre_producto: string;
    descripcion?: string;
    categoria_nombre?: string;
    formato_unidad: string;
    cantidad: number;
    valor_unitario_iva: number;
    total_iva: number;
    fecha_ejecucion: string;
    tipo_fecha?: string;
    motivo: string;
    actividad_nombre?: string;
    id_subvencion?: number;
    subvencion_nombre?: string;
    estado_aprobacion: string;
    comentario_revision?: string;
    raw_detalle: any;
}

export default function SolicitudesPage() {
    const { user, tienePermiso, puedeSeccion, isLoading: authLoading, setSidebarCollapsed } = useAuth();
    const router = useRouter();

    // Acceso restringido por lista blanca (Configuración › Accesos).
    const puedeVerSolicitudes = puedeSeccion('presupuesto.solicitudes');
    const [searchTerm, setSearchTerm] = useState('');
    const [solicitudes, setSolicitudes] = useState<BudgetRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [filterEstado, setFilterEstado] = useState<string>('todos');
    const [filtroSubvencionSolicitudes, setFiltroSubvencionSolicitudes] = useState<string>('todos');
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; solicitud: BudgetRequest | null; accion: 'aprobar' | 'rechazar' | 'revertir' | 'eliminar' | 'enviar' | 'reenviar' | null }>({ open: false, solicitud: null, accion: null });

    const [colegios, setColegios] = useState<any[]>([]);
    const [selectedColegio, setSelectedColegio] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
    const [filtersLoaded, setFiltersLoaded] = useState(false);

    // Modo de vista: 'solicitudes' o 'recursos' (Todos los Recursos)
    const [vistaModo, setVistaModo] = useState<'solicitudes' | 'recursos'>('solicitudes');

    // Colapsar automáticamente el sidebar al ver Todos los Recursos para ganar ancho
    useEffect(() => {
        if (vistaModo === 'recursos') {
            setSidebarCollapsed(true);
        }
    }, [vistaModo, setSidebarCollapsed]);
    
    // Filtros específicos para vista de recursos (idénticos a [id]/page.tsx)
    const [filtroTexto, setFiltroTexto] = useState('');
    const [filtroEstadoRecursos, setFiltroEstadoRecursos] = useState<'todos' | 'Sin Revisar' | 'Aprobado' | 'Rechazado' | 'Pendiente' | 'Con Ajustes' | 'Aprobado con Ajustes'>('todos');
    const [filtroSubvencionRecursos, setFiltroSubvencionRecursos] = useState<string>('todos');
    const [filtroArea, setFiltroArea] = useState<string>('todos');
    const [filtroCategoria, setFiltroCategoria] = useState<string>('todos');
    const [filtroActividad, setFiltroActividad] = useState<string>('todos');
    const [filtroMes, setFiltroMes] = useState<string>('todos');
    const [paginaItems, setPaginaItems] = useState(1);
    const [pageSizeRecursos, setPageSizeRecursos] = useState<number>(50);
    const [paginaSolicitudes, setPaginaSolicitudes] = useState(1);
    const [pageSizeSolicitudes, setPageSizeSolicitudes] = useState<number>(50);

    // Selección masiva de recursos
    const [selectedRecursoIds, setSelectedRecursoIds] = useState<number[]>([]);
    const [bulkLoading, setBulkLoading] = useState(false);

    // Subvenciones activas y modal de ajustes / rechazo
    const [subvenciones, setSubvenciones] = useState<any[]>([]);
    const [updatingSubvId, setUpdatingSubvId] = useState<number | null>(null);
    const [ajusteDetalle, setAjusteDetalle] = useState<any | null>(null);
    const [ajusteComentario, setAjusteComentario] = useState('');
    const [rechazoDetalle, setRechazoDetalle] = useState<any | null>(null);
    const [rechazoComentario, setRechazoComentario] = useState('');
    const [motivosRechazo, setMotivosRechazo] = useState<string[]>([]);

    // Modal de Modificación de Cantidad (para estado Con Ajustes)
    const [cantModDetalle, setCantModDetalle] = useState<any | null>(null);
    const [cantModValor, setCantModValor] = useState<number | string>('');
    const [updatingCantidadId, setUpdatingCantidadId] = useState<number | null>(null);

    // Segundo modal de confirmación crítica para Eliminar Solicitud
    const [modalEliminarConfirm, setModalEliminarConfirm] = useState<BudgetRequest | null>(null);

    const isSostenedor = user?.rol?.codigo === 'SOS';
    const esAdmin = user?.rol?.codigo === 'ADM';
    const esJefeCompras = 
        (user?.cargo?.nombre || '').toLowerCase().includes('jefe de compras') ||
        (user?.cargo?.nombre || '').toLowerCase().includes('jefe compras') ||
        (user?.subarea?.nombre || '').toLowerCase().includes('jefe de compras') ||
        (user?.subarea?.nombre || '').toLowerCase().includes('jefe compras') ||
        (user?.cargos || []).some(c => (c.nombre || '').toLowerCase().includes('jefe de compras') || (c.nombre || '').toLowerCase().includes('jefe compras')) ||
        (user?.subareas || []).some(c => (c.nombre || '').toLowerCase().includes('jefe de compras') || (c.nombre || '').toLowerCase().includes('jefe compras'));

    // Solo Administrador, Sostenedor, cargo Jefe de Compras, o usuarios con permiso en Acceso Restringido
    const canApprove = esAdmin || isSostenedor || esJefeCompras || puedeSeccion('presupuesto.solicitudes');

    useEffect(() => {
        if (!authLoading && !puedeVerSolicitudes) {
            router.replace(primeraRutaAccesible(tienePermiso, puedeSeccion) || '/dashboard');
        }
    }, [authLoading, puedeVerSolicitudes, tienePermiso, puedeSeccion, router]);

    // Restaurar filtros de localStorage al iniciar
    useEffect(() => {
        try {
            const savedCol = localStorage.getItem('solicitudes-filter-colegio');
            if (savedCol !== null) {
                setSelectedColegio(savedCol);
            } else if (user?.id_colegio) {
                setSelectedColegio(String(user.id_colegio));
            }
            const savedYr = localStorage.getItem('solicitudes-filter-year');
            if (savedYr !== null) {
                setSelectedYear(savedYr);
            }
        } catch {}
        setFiltersLoaded(true);
    }, [user]);

    const handleColegioChange = (val: string) => {
        setSelectedColegio(val);
        try { localStorage.setItem('solicitudes-filter-colegio', val); } catch {}
    };

    const handleYearChange = (val: string) => {
        setSelectedYear(val);
        try { localStorage.setItem('solicitudes-filter-year', val); } catch {}
    };

    // Cargar catálogo de colegios
    useEffect(() => {
        if (user?.rol?.codigo === 'SOS' || user?.rol?.codigo === 'ADM') {
            (async () => {
                try {
                    const res = await api.get('/catalogos/colegios');
                    setColegios(res.data || []);
                } catch (e) {
                    console.error('Error fetching schools:', e);
                }
            })();
        }
    }, [user]);

    // Cargar subvenciones y motivos de rechazo
    useEffect(() => {
        (async () => {
            try {
                const resSubv = await api.get('/presupuesto/subvenciones/activas');
                setSubvenciones(resSubv.data || []);
            } catch (e) {
                console.error('Error cargando subvenciones:', e);
            }
            try {
                const resMotivos = await api.get('/catalogos/config/motivos_rechazo');
                if (Array.isArray(resMotivos.data?.valor) && resMotivos.data.valor.length > 0) {
                    setMotivosRechazo(resMotivos.data.valor);
                } else {
                    setMotivosRechazo(['Ya se pidió', 'Fuera del presupuesto', 'No es necesario']);
                }
            } catch {
                setMotivosRechazo(['Ya se pidió', 'Fuera del presupuesto', 'No es necesario']);
            }
        })();
    }, []);

    const fetchSolicitudes = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const params: any = {};
            if (selectedColegio) params.id_colegio = selectedColegio;
            if (selectedYear) params.year = selectedYear;
            const response = await api.get('/presupuesto/solicitudes', {
                params
            });
            setSolicitudes(response.data || []);
        } catch (error) {
            console.error('Error fetching budget requests:', error);
            setSolicitudes([]);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [selectedColegio, selectedYear]);

    const handleUpdateStatus = async (id: number, nuevoEstado: string) => {
        try {
            setActionLoading(id);
            await api.patch(`/presupuesto/solicitudes/${id}/estado?nuevo_estado=${nuevoEstado}`);
            await fetchSolicitudes(true);
        } catch (error) {
            console.error('Error updating status:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const updateDetalleEstado = async (detalleId: number, nuevoEstado: string, comentario?: string) => {
        try {
            setActionLoading(detalleId);
            const params = new URLSearchParams({ nuevo_estado: nuevoEstado });
            if (comentario) params.set('comentario', comentario);
            await api.patch(`/presupuesto/detalles/${detalleId}/estado?${params.toString()}`);
            await fetchSolicitudes(true);
        } catch (error) {
            console.error('Error actualizando estado del detalle:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const updateDetalleSubvencion = async (detalleId: number, idSubvencion: number) => {
        try {
            setUpdatingSubvId(detalleId);
            await api.patch(`/presupuesto/detalles/${detalleId}/subvencion?id_subvencion=${idSubvencion}`);
            await fetchSolicitudes(true);
        } catch (error) {
            console.error('Error actualizando subvención:', error);
        } finally {
            setUpdatingSubvId(null);
        }
    };

    const updateDetalleCantidad = async (detalle: any, nuevaCantidad: number) => {
        if (isNaN(nuevaCantidad) || nuevaCantidad <= 0) return;
        try {
            setUpdatingCantidadId(detalle.id_pre_detalle);
            const valorUnitarioIva = Number(detalle.valor_unitario_iva) || 0;
            const nuevoTotalIva = nuevaCantidad * valorUnitarioIva;
            const valorUnitario = Number(detalle.valor_unitario) || 0;
            
            await api.put(`/presupuesto/detalles/${detalle.id_pre_detalle}`, {
                cantidad: nuevaCantidad,
                total_iva: nuevoTotalIva,
                total: nuevaCantidad * valorUnitario,
                valor_unitario: valorUnitario,
                valor_unitario_iva: valorUnitarioIva
            });
            await fetchSolicitudes(true);
        } catch (error) {
            console.error('Error actualizando cantidad:', error);
            alert('No se pudo actualizar la cantidad del detalle.');
        } finally {
            setUpdatingCantidadId(null);
        }
    };

    const confirmarRechazo = async () => {
        if (!rechazoDetalle) return;
        await updateDetalleEstado(rechazoDetalle.id_pre_detalle, 'Rechazado', rechazoComentario.trim());
        setRechazoDetalle(null);
        setRechazoComentario('');
    };

    const confirmarAjuste = async () => {
        if (!ajusteDetalle) return;
        await updateDetalleEstado(ajusteDetalle.id_pre_detalle, 'Con Ajustes', ajusteComentario.trim());
        setAjusteDetalle(null);
        setAjusteComentario('');
    };

    const [showModalInsumosList, setShowModalInsumosList] = useState(false);

    const openConfirmModal = (solicitud: BudgetRequest, accion: 'aprobar' | 'rechazar' | 'revertir' | 'eliminar' | 'enviar' | 'reenviar') => {
        setShowModalInsumosList(false);
        setConfirmModal({ open: true, solicitud, accion });
    };

    const handleEliminar = async (id: number) => {
        try {
            setActionLoading(id);
            await api.delete(`/presupuesto/solicitudes/${id}`);
            setSolicitudes(prev => prev.filter(s => s.id_presupuesto !== id));
        } catch (error: any) {
            console.error('Error eliminando solicitud:', error);
            const msg = error.response?.data?.detail || 'Error al eliminar la solicitud.';
            alert(msg);
        } finally {
            setActionLoading(null);
        }
    };

    const confirmAction = async () => {
        if (!confirmModal.solicitud || !confirmModal.accion) return;
        if (confirmModal.accion === 'eliminar') {
            const solParaEliminar = confirmModal.solicitud;
            setConfirmModal({ open: false, solicitud: null, accion: null });
            setModalEliminarConfirm(solParaEliminar);
            return;
        } else {
            const estadoMap: Record<string, string> = {
                aprobar: 'Aceptado',
                rechazar: 'Revisar',
                revertir: 'Pendiente',
                enviar: 'Enviado',
                reenviar: 'Enviado'
            };
            await handleUpdateStatus(confirmModal.solicitud.id_presupuesto, estadoMap[confirmModal.accion]);
        }
        setConfirmModal({ open: false, solicitud: null, accion: null });
    };

    useEffect(() => {
        if (!puedeVerSolicitudes) return;
        fetchSolicitudes();
    }, [puedeVerSolicitudes, fetchSolicitudes]);

    const formatCLP = (value: number) => {
        return `$${Math.round(value || 0).toLocaleString('es-CL')}`;
    };

    const labelFecha = (fecha_ejecucion?: string, tipo_fecha?: string) => {
        if (fecha_ejecucion) {
            const parts = fecha_ejecucion.split('-');
            if (parts.length >= 2) {
                const mesNum = parts[1];
                const mesObj = MESES.find(m => m.value === mesNum);
                if (mesObj) return mesObj.label;
            }
            try {
                const dateObj = new Date(fecha_ejecucion);
                if (!isNaN(dateObj.getTime())) {
                    return dateObj.toLocaleDateString('es-CL', { month: 'long' });
                }
            } catch {}
        }
        return tipo_fecha || 'N/A';
    };

    // Detección de Colegio para color de tema (Macaya -> Verde, Diego Portales -> Azul)
    const currentColegioNombre = useMemo(() => {
        if (selectedColegio) {
            const c = colegios.find(col => String(col.id_colegio) === String(selectedColegio));
            if (c) return c.nombre;
        }
        if (user?.colegio?.nombre) return user.colegio.nombre;
        if ((user as any)?.colegio_nombre) return (user as any).colegio_nombre;
        if (solicitudes.length > 0 && solicitudes[0].colegio_nombre) return solicitudes[0].colegio_nombre;
        return '';
    }, [selectedColegio, colegios, user, solicitudes]);

    const isMacaya = currentColegioNombre.toLowerCase().includes('macaya');

    // Aplanar todos los detalles de todas las solicitudes para la vista consolidada
    const allFlatItems: FlatItem[] = useMemo(() => {
        const items: FlatItem[] = [];
        for (const s of solicitudes) {
            const cod = `REQ-${new Date(s.fecha).getFullYear()}-${s.id_presupuesto.toString().padStart(3, '0')}`;
            for (const d of (s.detalles || [])) {
                items.push({
                    id_presupuesto: s.id_presupuesto,
                    codigo_solicitud: cod,
                    fecha_solicitud: s.fecha,
                    user_nombre: s.user_nombre,
                    area_nombre: s.area_nombre,
                    subarea_nombre: s.subarea_nombre,
                    colegio_nombre: s.colegio_nombre,
                    estado_solicitud: s.estado,
                    id_pre_detalle: d.id_pre_detalle,
                    nombre_producto: d.nombre_producto,
                    descripcion: d.descripcion,
                    categoria_nombre: d.categoria_nombre,
                    formato_unidad: d.formato_unidad,
                    cantidad: d.cantidad || 0,
                    valor_unitario_iva: d.valor_unitario_iva || 0,
                    total_iva: d.total_iva || ((d.cantidad || 0) * (d.valor_unitario_iva || 0)),
                    fecha_ejecucion: d.fecha_ejecucion,
                    tipo_fecha: d.tipo_fecha,
                    motivo: d.motivo,
                    actividad_nombre: d.actividad_nombre,
                    id_subvencion: d.id_subvencion,
                    subvencion_nombre: (d as any).subvencion_nombre || (d as any).subvencion?.nombre_corto || '',
                    estado_aprobacion: d.estado_aprobacion || 'Sin Revisar',
                    comentario_revision: d.comentario_revision || undefined,
                    raw_detalle: d,
                });
            }
        }
        return items;
    }, [solicitudes]);

    const handleBulkEstadoRecursos = async (nuevoEstado: string) => {
        if (selectedRecursoIds.length === 0) return;
        try {
            setBulkLoading(true);
            await Promise.all(
                selectedRecursoIds.map(idDet => api.patch(`/presupuesto/detalles/${idDet}/estado?nuevo_estado=${nuevoEstado}`))
            );
            await fetchSolicitudes(true);
            setSelectedRecursoIds([]);
        } catch (e) {
            console.error('Error actualizando estados masivos:', e);
            alert('Hubo un error al actualizar los recursos seleccionados.');
        } finally {
            setBulkLoading(false);
        }
    };

    // Opciones únicas de Subvenciones presentes en los datos
    const opcionesSubvenciones = useMemo(() => {
        const set = new Set<string>();
        allFlatItems.forEach(d => {
            const nom = (d.subvencion_nombre || '').trim();
            if (nom) set.add(nom);
        });
        if (set.size === 0) set.add('GENERAL');
        return Array.from(set).sort();
    }, [allFlatItems]);

    // Opciones únicas de Área Solicitante, Categorías, Actividades y Meses para filtros
    const opcionesAreas = useMemo(() => {
        const set = new Set<string>();
        allFlatItems.forEach(d => {
            if (d.area_nombre && d.area_nombre.trim()) set.add(d.area_nombre.trim());
        });
        return Array.from(set).sort();
    }, [allFlatItems]);

    const opcionesCategorias = useMemo(() => {
        const set = new Set<string>();
        allFlatItems.forEach(d => {
            if (d.categoria_nombre && d.categoria_nombre.trim()) set.add(d.categoria_nombre.trim());
        });
        return Array.from(set).sort();
    }, [allFlatItems]);

    const opcionesActividades = useMemo(() => {
        const set = new Set<string>();
        allFlatItems.forEach(d => {
            if (d.actividad_nombre && d.actividad_nombre.trim()) set.add(d.actividad_nombre.trim());
        });
        return Array.from(set).sort();
    }, [allFlatItems]);

    const MESES_ORDEN: Record<string, number> = {
        'enero': 1,
        'febrero': 2,
        'marzo': 3,
        'abril': 4,
        'mayo': 5,
        'junio': 6,
        'julio': 7,
        'agosto': 8,
        'septiembre': 9,
        'setiembre': 9,
        'octubre': 10,
        'noviembre': 11,
        'diciembre': 12,
    };

    const opcionesMeses = useMemo(() => {
        const set = new Set<string>();
        allFlatItems.forEach(d => {
            const m = labelFecha(d.fecha_ejecucion, d.tipo_fecha);
            if (m && m !== 'N/A') set.add(m);
        });
        return Array.from(set).sort((a, b) => {
            const ordenA = MESES_ORDEN[a.toLowerCase().trim()] ?? 99;
            const ordenB = MESES_ORDEN[b.toLowerCase().trim()] ?? 99;
            if (ordenA !== ordenB) return ordenA - ordenB;
            return a.localeCompare(b);
        });
    }, [allFlatItems]);

    // Normalizar estado para filtro
    const estadoNormal = (d: FlatItem) => {
        const e = (d.estado_aprobacion || '').trim();
        if (!e) return 'Sin Revisar';
        if (e === 'Aprobado con Ajustes' || e === 'Aprobado con ajustes') return 'Con Ajustes';
        return e;
    };

    // Filtros para vista de solicitudes
    const filteredSolicitudes = useMemo(() => {
        return solicitudes.filter(req => {
            const q = searchTerm.toLowerCase().trim();
            const matchesSearch = !q ||
                req.id_presupuesto.toString().includes(q) ||
                (req.area_nombre || '').toLowerCase().includes(q) ||
                (req.user_nombre || '').toLowerCase().includes(q) ||
                (req.subarea_nombre || '').toLowerCase().includes(q);

            const matchesEstado = filterEstado === 'todos' || !filterEstado || req.estado === filterEstado;

            const matchesSubvencion = filtroSubvencionSolicitudes === 'todos' || (req.detalles || []).some(d => {
                const subNom = (d as any).subvencion_nombre || (d as any).subvencion?.nombre_corto || 'GENERAL';
                return subNom.toLowerCase().trim() === filtroSubvencionSolicitudes.toLowerCase().trim();
            });

            return matchesSearch && matchesEstado && matchesSubvencion;
        });
    }, [solicitudes, searchTerm, filterEstado, filtroSubvencionSolicitudes]);

    // Filtros para vista consolidada de recursos (idéntico a [id]/page.tsx)
    const itemsBaseRecursos = useMemo(() => {
        return allFlatItems.filter(item => {
            const q = filtroTexto.toLowerCase().trim();
            const matchTexto = !q 
                || item.codigo_solicitud.toLowerCase().includes(q)
                || item.id_presupuesto.toString().includes(q)
                || item.nombre_producto.toLowerCase().includes(q)
                || (item.descripcion || '').toLowerCase().includes(q)
                || (item.motivo || '').toLowerCase().includes(q)
                || (item.categoria_nombre || '').toLowerCase().includes(q)
                || (item.area_nombre || '').toLowerCase().includes(q)
                || (item.user_nombre || '').toLowerCase().includes(q)
                || (item.subarea_nombre || '').toLowerCase().includes(q);

            const matchArea = filtroArea === 'todos' || (item.area_nombre || '').trim() === filtroArea;
            const matchCategoria = filtroCategoria === 'todos' || (item.categoria_nombre || '').trim() === filtroCategoria;
            const matchActividad = filtroActividad === 'todos' || (item.actividad_nombre || '').trim() === filtroActividad;
            const matchMes = filtroMes === 'todos' || labelFecha(item.fecha_ejecucion, item.tipo_fecha) === filtroMes;
            const matchSubvencion = filtroSubvencionRecursos === 'todos' || (item.subvencion_nombre || 'GENERAL').toLowerCase().trim() === filtroSubvencionRecursos.toLowerCase().trim();

            return matchTexto && matchArea && matchCategoria && matchActividad && matchMes && matchSubvencion;
        });
    }, [allFlatItems, filtroTexto, filtroArea, filtroCategoria, filtroActividad, filtroMes, filtroSubvencionRecursos]);

    const filteredItems = useMemo(() => {
        return itemsBaseRecursos.filter(item => {
            return filtroEstadoRecursos === 'todos' || estadoNormal(item) === filtroEstadoRecursos;
        });
    }, [itemsBaseRecursos, filtroEstadoRecursos]);

    // Items a considerar para las métricas superiores según la vista activa
    const itemsParaMetricas = useMemo(() => {
        if (vistaModo === 'recursos') {
            return filteredItems;
        }
        // En modo solicitudes, filtrar los recursos de las solicitudes actualmente filtradas (con subvención si aplica)
        const idsPermitidos = new Set(filteredSolicitudes.map(s => s.id_presupuesto));
        let items = allFlatItems.filter(item => idsPermitidos.has(item.id_presupuesto));
        if (filtroSubvencionSolicitudes !== 'todos') {
            items = items.filter(item => (item.subvencion_nombre || 'GENERAL').toLowerCase().trim() === filtroSubvencionSolicitudes.toLowerCase().trim());
        }
        return items;
    }, [vistaModo, filteredItems, filteredSolicitudes, allFlatItems, filtroSubvencionSolicitudes]);

    // Solicitudes únicas presentes en las métricas filtradas
    const countSolicitudesMetricas = useMemo(() => {
        if (vistaModo === 'recursos') {
            const setIds = new Set(filteredItems.map(i => i.id_presupuesto));
            return setIds.size;
        }
        return filteredSolicitudes.length;
    }, [vistaModo, filteredItems, filteredSolicitudes]);

    // Métricas Calculadas Dinámicas basadas en los filtros activos
    const totalSolicitado = itemsParaMetricas.reduce((acc, d) => acc + (d.total_iva || 0), 0);

    const itemsAprobados = itemsParaMetricas.filter(d => d.estado_aprobacion === 'Aprobado' || d.estado_aprobacion === 'Aceptado');
    const totalAprobado = itemsAprobados.reduce((acc, d) => acc + d.total_iva, 0);

    const itemsConAjustes = itemsParaMetricas.filter(d => d.estado_aprobacion === 'Con Ajustes' || d.estado_aprobacion === 'Aprobado con Ajustes' || d.estado_aprobacion === 'Aprobado con ajustes');
    const totalConAjustes = itemsConAjustes.reduce((acc, d) => acc + d.total_iva, 0);

    const itemsRechazados = itemsParaMetricas.filter(d => d.estado_aprobacion === 'Rechazado');
    const totalRechazado = itemsRechazados.reduce((acc, d) => acc + d.total_iva, 0);

    // Sin Revisar: recursos nuevos o sin gestionar (estado_aprobacion 'Sin Revisar' o vacío)
    const itemsSinRevisar = itemsParaMetricas.filter(d => !d.estado_aprobacion || d.estado_aprobacion === 'Sin Revisar');
    const totalSinRevisar = itemsSinRevisar.reduce((acc, d) => acc + d.total_iva, 0);

    // Pendiente: recursos con estado explícito 'Pendiente'
    const itemsPendientes = itemsParaMetricas.filter(d => d.estado_aprobacion === 'Pendiente');
    const totalPendiente = itemsPendientes.reduce((acc, d) => acc + d.total_iva, 0);

    const pctAprobado = totalSolicitado > 0 ? (totalAprobado / totalSolicitado) * 100 : 0;
    const pctConAjustes = totalSolicitado > 0 ? (totalConAjustes / totalSolicitado) * 100 : 0;
    const pctRechazado = totalSolicitado > 0 ? (totalRechazado / totalSolicitado) * 100 : 0;
    const pctSinRevisar = totalSolicitado > 0 ? (totalSinRevisar / totalSolicitado) * 100 : 0;
    const pctPendiente = totalSolicitado > 0 ? (totalPendiente / totalSolicitado) * 100 : 0;

    // Desglose de Inversión por Subvención Dinámico (Fila 2)
    const totalesSubv = useMemo(() => {
        return itemsParaMetricas.reduce((acc: Record<string, { aprobado: number; ajustado: number; sin_revisar: number; pendiente: number }>, d: FlatItem) => {
            const name = d.subvencion_nombre || 'GENERAL';
            if (!acc[name]) {
                acc[name] = { aprobado: 0, ajustado: 0, sin_revisar: 0, pendiente: 0 };
            }
            if (d.estado_aprobacion === 'Aprobado' || d.estado_aprobacion === 'Aceptado') {
                acc[name].aprobado += (d.total_iva || 0);
            } else if (d.estado_aprobacion === 'Con Ajustes' || d.estado_aprobacion === 'Aprobado con Ajustes' || d.estado_aprobacion === 'Aprobado con ajustes') {
                acc[name].ajustado += (d.total_iva || 0);
            } else if (d.estado_aprobacion === 'Pendiente') {
                acc[name].pendiente += (d.total_iva || 0);
            } else if (d.estado_aprobacion !== 'Rechazado') {
                // Sin Revisar o sin estado
                acc[name].sin_revisar += (d.total_iva || 0);
            }
            return acc;
        }, {});
    }, [itemsParaMetricas]);

    const conteosPorEstadoRecursos: Record<string, number> = useMemo(() => {
        return {
            todos: itemsBaseRecursos.length,
            'Sin Revisar': itemsBaseRecursos.filter(d => estadoNormal(d) === 'Sin Revisar').length,
            Aprobado: itemsBaseRecursos.filter(d => estadoNormal(d) === 'Aprobado' || estadoNormal(d) === 'Aceptado').length,
            'Con Ajustes': itemsBaseRecursos.filter(d => estadoNormal(d) === 'Con Ajustes' || estadoNormal(d) === 'Aprobado con Ajustes' || estadoNormal(d) === 'Aprobado con ajustes').length,
            Pendiente: itemsBaseRecursos.filter(d => estadoNormal(d) === 'Pendiente').length,
            Rechazado: itemsBaseRecursos.filter(d => estadoNormal(d) === 'Rechazado').length,
        };
    }, [itemsBaseRecursos]);

    const filtroActivoRecursos = filtroTexto.trim() !== '' || filtroEstadoRecursos !== 'todos' || filtroSubvencionRecursos !== 'todos' || filtroArea !== 'todos' || filtroCategoria !== 'todos' || filtroActividad !== 'todos' || filtroMes !== 'todos';
    const filtroActivoSolicitudes = searchTerm.trim() !== '' || filterEstado !== 'todos' || filtroSubvencionSolicitudes !== 'todos';

    // Resetear paginación de solicitudes al filtrar o cambiar tamaño
    useEffect(() => {
        setPaginaSolicitudes(1);
    }, [searchTerm, filterEstado, filtroSubvencionSolicitudes, selectedColegio, selectedYear, pageSizeSolicitudes]);

    const totalPaginasSolicitudes = Math.ceil(filteredSolicitudes.length / pageSizeSolicitudes) || 1;
    const solicitudesPaginadas = filteredSolicitudes.slice(
        (paginaSolicitudes - 1) * pageSizeSolicitudes,
        paginaSolicitudes * pageSizeSolicitudes
    );

    // Resetear paginación de ítems al filtrar o cambiar tamaño
    useEffect(() => {
        setPaginaItems(1);
    }, [filtroTexto, filtroEstadoRecursos, filtroSubvencionRecursos, filtroArea, filtroCategoria, filtroActividad, filtroMes, vistaModo, pageSizeRecursos]);

    const totalPaginasItems = Math.ceil(filteredItems.length / pageSizeRecursos) || 1;
    const itemsPaginados = filteredItems.slice(
        (paginaItems - 1) * pageSizeRecursos,
        paginaItems * pageSizeRecursos
    );

    const getStatusStyle = (estado: string) => {
        const norm = !estado ? 'Sin Revisar' : estado;
        switch (norm) {
            case 'Aprobado':
                return { icon: CheckCircle, iconColor: 'text-green-500', bgColor: 'bg-green-100', txColor: 'text-green-800' };
            case 'Rechazado':
                return { icon: XCircle, iconColor: 'text-red-500', bgColor: 'bg-red-100', txColor: 'text-red-800' };
            case 'Aceptado':
                return { icon: CheckCircle, iconColor: 'text-green-500', bgColor: 'bg-green-100', txColor: 'text-green-800' };
            case 'Revisar':
                return { icon: RotateCcw, iconColor: 'text-orange-500', bgColor: 'bg-orange-100', txColor: 'text-orange-800' };
            case 'Enviado':
                return { icon: Send, iconColor: 'text-blue-500', bgColor: 'bg-blue-100', txColor: 'text-blue-800', label: 'Por Revisar' };
            case 'Con Ajustes':
            case 'Aprobado con Ajustes':
            case 'Aprobado con ajustes':
                return { icon: CheckCircle, iconColor: 'text-teal-500', bgColor: 'bg-teal-100', txColor: 'text-teal-800', label: 'Con Ajustes' };
            case 'Sin Revisar':
                return { icon: Clock, iconColor: 'text-gray-400', bgColor: 'bg-gray-100', txColor: 'text-gray-700' };
            default:
                return { icon: Clock, iconColor: 'text-amber-500', bgColor: 'bg-amber-100', txColor: 'text-amber-800' };
        }
    };

    const exportToExcel = () => {
        if (vistaModo === 'solicitudes') {
            const data = filteredSolicitudes.map(req => ({
                'ID': req.id_presupuesto,
                'Código': `REQ-${new Date(req.fecha).getFullYear()}-${req.id_presupuesto.toString().padStart(3, '0')}`,
                'Fecha': new Date(req.fecha).toLocaleDateString('es-CL'),
                'Usuario Solicitante': req.user_nombre || '',
                'Área': req.area_nombre || '',
                'Cargo': req.subarea_nombre || '',
                'Total Solicitado': req.monto_total,
                'Estado': req.estado,
                'N° Recursos': req.detalles?.length || 0
            }));

            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Solicitudes');
            XLSX.writeFile(wb, `solicitudes_presupuesto_${new Date().toISOString().split('T')[0]}.xlsx`);
        } else {
            const data = filteredItems.map(item => ({
                'Solicitud': item.codigo_solicitud,
                'Área': item.area_nombre || '',
                'Solicitante': item.user_nombre || '',
                'Cargo': item.subarea_nombre || '',
                'Recurso / Producto': item.nombre_producto,
                'Descripción': item.descripcion || '',
                'Categoría': item.categoria_nombre || '',
                'Formato / Unidad': item.formato_unidad,
                'Cantidad': item.cantidad,
                'Valor Unitario (IVA)': item.valor_unitario_iva,
                'Total (IVA)': item.total_iva,
                'Mes / Fecha': labelFecha(item.fecha_ejecucion, item.tipo_fecha),
                'Motivo': item.motivo,
                'Actividad PME': item.actividad_nombre || '',
                'Subvención': item.subvencion_nombre || 'GENERAL',
                'Estado Aprobación': item.estado_aprobacion,
                'Comentario Revisión': item.comentario_revision || ''
            }));

            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Recursos');
            XLSX.writeFile(wb, `recursos_presupuesto_consolidado_${new Date().toISOString().split('T')[0]}.xlsx`);
        }
    };

    // Pantalla de acceso restringido
    if (!authLoading && !puedeVerSolicitudes) {
        return (
            <div className="p-8 max-w-lg mx-auto text-center">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Acceso restringido</h2>
                <p className="text-sm text-gray-500 mt-1 max-w-md">
                    {authLoading
                        ? 'Verificando acceso...'
                        : 'No tienes autorización para ver esta sección. Solicita acceso a un administrador en Configuración › Accesos.'}
                </p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500" suppressHydrationWarning>
            {/* Header Superior */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Solicitudes de Presupuesto</h2>
                        {currentColegioNombre && (
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                isMacaya 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                                {currentColegioNombre}
                            </span>
                        )}
                    </div>
                    <p className="text-gray-500 mt-1.5 font-medium">Gestiona y revisa los requerimientos de fondos y recursos presupuestados.</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {/* Selector de modo de vista */}
                    <div className="bg-gray-100 p-1 rounded-xl flex items-center gap-1 border border-gray-200 shadow-2xs">
                        <button
                            onClick={() => setVistaModo('solicitudes')}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                                vistaModo === 'solicitudes'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-900'
                            }`}
                        >
                            <FileText size={15} />
                            <span>Solicitudes ({solicitudes.length})</span>
                        </button>
                        <button
                            onClick={() => setVistaModo('recursos')}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                                vistaModo === 'recursos'
                                    ? isMacaya ? 'bg-emerald-600 text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-900'
                            }`}
                        >
                            <Layers size={15} />
                            <span>Todos los Recursos ({allFlatItems.length})</span>
                        </button>
                    </div>

                    <button
                        onClick={exportToExcel}
                        disabled={vistaModo === 'solicitudes' ? filteredSolicitudes.length === 0 : filteredItems.length === 0}
                        className={`bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl font-bold border flex items-center gap-2 transition-all text-xs shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${
                            isMacaya ? 'border-emerald-200 hover:border-emerald-300 text-emerald-800' : 'border-blue-200 hover:border-blue-300 text-blue-800'
                        }`}
                    >
                        <Download size={15} />
                        <span>Exportar Excel</span>
                    </button>
                </div>
            </div>

            {/* Barra de Filtros Unificada */}
            <div className="mb-6">
                <ComprasFilters
                    colegioId={selectedColegio}
                    year={selectedYear}
                    onColegioChange={handleColegioChange}
                    onYearChange={handleYearChange}
                >
                    {vistaModo === 'solicitudes' && (
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <div className="relative w-64 min-w-[200px]">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-4 w-4 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Buscar solicitud o área..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="block w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-xs text-gray-900 shadow-xs"
                                />
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1" title="Limpiar">
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Filtro Estado Solicitud */}
                            <select
                                value={filterEstado}
                                onChange={(e) => setFilterEstado(e.target.value)}
                                className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-2xs cursor-pointer"
                            >
                                <option value="todos">Todos los Estados</option>
                                <option value="Enviado">Por Revisar (Enviado)</option>
                                <option value="Aceptado">Aceptado / Aprobado</option>
                                <option value="Revisar">Para Revisión</option>
                                <option value="Pendiente">Pendiente</option>
                                <option value="Rechazado">Rechazado</option>
                            </select>

                            {/* Filtro Subvención Solicitud */}
                            <select
                                value={filtroSubvencionSolicitudes}
                                onChange={(e) => setFiltroSubvencionSolicitudes(e.target.value)}
                                className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-2xs cursor-pointer"
                            >
                                <option value="todos">Todas las Subvenciones</option>
                                {opcionesSubvenciones.map(subv => (
                                    <option key={subv} value={subv}>{subv}</option>
                                ))}
                            </select>

                            {/* Limpiar filtros en modo solicitudes */}
                            {filtroActivoSolicitudes && (
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        setFilterEstado('todos');
                                        setFiltroSubvencionSolicitudes('todos');
                                    }}
                                    className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-2xs"
                                    title="Restablecer filtros de solicitudes"
                                >
                                    <X size={13} />
                                    Limpiar filtros
                                </button>
                            )}
                        </div>
                    )}
                </ComprasFilters>
            </div>

            {/* SECCIÓN CARDS: Fila 1 (7 Métricas Clave) */}
            <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                    {/* 1. Total Solicitado */}
                    <div 
                        onClick={() => {
                            if (vistaModo === 'solicitudes') setFilterEstado('todos');
                            else setFiltroEstadoRecursos('todos');
                        }}
                        className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                            (vistaModo === 'solicitudes' ? filterEstado === 'todos' : filtroEstadoRecursos === 'todos')
                                ? 'border-primary/40 ring-2 ring-primary/10'
                                : 'border-gray-100 hover:border-gray-200'
                        }`}
                        title="Ver todos los recursos / solicitudes"
                    >
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Solicitado</span>
                        <p className="text-base font-extrabold text-gray-900 mt-1">{formatCLP(totalSolicitado)}</p>
                        <span className="text-[9px] text-gray-400 font-semibold">{countSolicitudesMetricas} solicitudes • {itemsParaMetricas.length} recursos</span>
                    </div>

                    {/* 2. Presupuesto Aprobado */}
                    <div 
                        onClick={() => {
                            if (vistaModo === 'solicitudes') setFilterEstado(filterEstado === 'Aceptado' ? 'todos' : 'Aceptado');
                            else setFiltroEstadoRecursos(filtroEstadoRecursos === 'Aprobado' ? 'todos' : 'Aprobado');
                        }}
                        className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                            (vistaModo === 'solicitudes' ? filterEstado === 'Aceptado' : filtroEstadoRecursos === 'Aprobado')
                                ? 'border-green-500 bg-green-50/20 ring-2 ring-green-500/20'
                                : 'border-gray-100 hover:border-green-200'
                        }`}
                        title="Filtrar por Aprobados"
                    >
                        <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider block">Aprobado</span>
                        <p className="text-base font-extrabold text-green-600 mt-1">{formatCLP(totalAprobado)}</p>
                        <span className="text-[9px] text-gray-400 font-semibold">{pctAprobado.toFixed(1)}% ({itemsAprobados.length} rec.)</span>
                    </div>

                    {/* 3. Con Ajustes */}
                    <div 
                        onClick={() => {
                            if (vistaModo === 'solicitudes') setFilterEstado(filterEstado === 'Revisar' ? 'todos' : 'Revisar');
                            else setFiltroEstadoRecursos(filtroEstadoRecursos === 'Con Ajustes' ? 'todos' : 'Con Ajustes');
                        }}
                        className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                            (vistaModo === 'solicitudes' ? filterEstado === 'Revisar' : filtroEstadoRecursos === 'Con Ajustes')
                                ? 'border-teal-500 bg-teal-50/20 ring-2 ring-teal-500/20'
                                : 'border-gray-100 hover:border-teal-200'
                        }`}
                        title="Filtrar por Con Ajustes"
                    >
                        <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wider block">Con Ajustes</span>
                        <p className="text-base font-extrabold text-teal-600 mt-1">{formatCLP(totalConAjustes)}</p>
                        <span className="text-[9px] text-gray-400 font-semibold">{pctConAjustes.toFixed(1)}% ({itemsConAjustes.length} rec.)</span>
                    </div>

                    {/* 4. Sin Revisar */}
                    <div 
                        onClick={() => {
                            if (vistaModo === 'solicitudes') setFilterEstado(filterEstado === 'Enviado' ? 'todos' : 'Enviado');
                            else setFiltroEstadoRecursos(filtroEstadoRecursos === 'Sin Revisar' ? 'todos' : 'Sin Revisar');
                        }}
                        className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                            (vistaModo === 'solicitudes' ? filterEstado === 'Enviado' : filtroEstadoRecursos === 'Sin Revisar')
                                ? 'border-slate-500 bg-slate-50 ring-2 ring-slate-400/20'
                                : 'border-gray-100 hover:border-slate-300'
                        }`}
                        title="Filtrar por Sin Revisar"
                    >
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Sin Revisar</span>
                        <p className="text-base font-extrabold text-slate-700 mt-1">{formatCLP(totalSinRevisar)}</p>
                        <span className="text-[9px] text-gray-400 font-semibold">{pctSinRevisar.toFixed(1)}% ({itemsSinRevisar.length} rec.)</span>
                    </div>

                    {/* 5. Pendiente */}
                    <div 
                        onClick={() => {
                            if (vistaModo === 'solicitudes') setFilterEstado(filterEstado === 'Pendiente' ? 'todos' : 'Pendiente');
                            else setFiltroEstadoRecursos(filtroEstadoRecursos === 'Pendiente' ? 'todos' : 'Pendiente');
                        }}
                        className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                            (vistaModo === 'solicitudes' ? filterEstado === 'Pendiente' : filtroEstadoRecursos === 'Pendiente')
                                ? 'border-amber-500 bg-amber-50/20 ring-2 ring-amber-500/20'
                                : 'border-gray-100 hover:border-amber-200'
                        }`}
                        title="Filtrar por Pendiente"
                    >
                        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Pendiente</span>
                        <p className="text-base font-extrabold text-amber-600 mt-1">{formatCLP(totalPendiente)}</p>
                        <span className="text-[9px] text-gray-400 font-semibold">{pctPendiente.toFixed(1)}% ({itemsPendientes.length} rec.)</span>
                    </div>

                    {/* 6. Rechazado */}
                    <div 
                        onClick={() => {
                            if (vistaModo === 'solicitudes') setFilterEstado(filterEstado === 'Rechazado' ? 'todos' : 'Rechazado');
                            else setFiltroEstadoRecursos(filtroEstadoRecursos === 'Rechazado' ? 'todos' : 'Rechazado');
                        }}
                        className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                            (vistaModo === 'solicitudes' ? filterEstado === 'Rechazado' : filtroEstadoRecursos === 'Rechazado')
                                ? 'border-red-500 bg-red-50/20 ring-2 ring-red-500/20'
                                : 'border-gray-100 hover:border-red-200'
                        }`}
                        title="Filtrar por Rechazado"
                    >
                        <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block">Rechazado</span>
                        <p className="text-base font-extrabold text-red-600 mt-1">{formatCLP(totalRechazado)}</p>
                        <span className="text-[9px] text-gray-400 font-semibold">{pctRechazado.toFixed(1)}% ({itemsRechazados.length} rec.)</span>
                    </div>

                    {/* 7. % Aprobado */}
                    <div className="bg-white rounded-xl p-3.5 shadow-sm border border-gray-100 flex flex-col justify-between min-h-[90px]">
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">% Aprobado</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <p className="text-base font-extrabold text-blue-600">{pctAprobado.toFixed(1)}%</p>
                            <span className="text-[9px] text-gray-400 font-semibold">directo</span>
                        </div>
                    </div>
                </div>

                {/* SECCIÓN CARDS: Fila 2 (Desglose de Inversión por Subvención) */}
                {Object.keys(totalesSubv).length > 0 && (
                    <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1">Subvenciones (Aprobado / Ajustado / Sin Revisar / Pendiente)</span>
                        <div className="flex flex-wrap gap-3">
                            {Object.entries(totalesSubv).map(([subvName, data]) => {
                                const isSelectedSubv = vistaModo === 'solicitudes'
                                    ? filtroSubvencionSolicitudes.toLowerCase() === subvName.toLowerCase()
                                    : filtroSubvencionRecursos.toLowerCase() === subvName.toLowerCase();
                                return (
                                    <div 
                                        key={subvName} 
                                        onClick={() => {
                                            if (vistaModo === 'solicitudes') {
                                                setFiltroSubvencionSolicitudes(isSelectedSubv ? 'todos' : subvName);
                                            } else {
                                                setFiltroSubvencionRecursos(isSelectedSubv ? 'todos' : subvName);
                                            }
                                        }}
                                        className={`bg-white rounded-xl px-4 py-2.5 shadow-sm border transition-all cursor-pointer flex items-center gap-3 min-w-[240px] ${
                                            isSelectedSubv
                                                ? 'border-violet-500 bg-violet-50/20 ring-2 ring-violet-500/20'
                                                : 'border-gray-100 hover:border-violet-200'
                                        }`}
                                        title={`Filtrar por subvención ${subvName}`}
                                    >
                                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSelectedSubv ? 'bg-violet-600 ring-2 ring-violet-300' : 'bg-violet-500'}`} />
                                        <div>
                                            <span className="text-[10px] font-extrabold text-gray-700 uppercase tracking-wider block">{subvName}</span>
                                            <div className="flex gap-3 mt-1 text-[11px]">
                                                <div>
                                                    <span className="text-gray-400 block text-[9px] uppercase font-bold">Aprobado</span>
                                                    <span className="font-bold text-green-600">{formatCLP(data.aprobado)}</span>
                                                </div>
                                                {data.ajustado > 0 && (
                                                    <div className="border-l border-gray-100 pl-2.5">
                                                        <span className="text-gray-400 block text-[9px] uppercase font-bold">Ajustes</span>
                                                        <span className="font-bold text-teal-600">{formatCLP(data.ajustado)}</span>
                                                    </div>
                                                )}
                                                {data.sin_revisar > 0 && (
                                                    <div className="border-l border-gray-100 pl-2.5">
                                                        <span className="text-gray-400 block text-[9px] uppercase font-bold">Sin Revisar</span>
                                                        <span className="font-bold text-slate-600">{formatCLP(data.sin_revisar)}</span>
                                                    </div>
                                                )}
                                                {data.pendiente > 0 && (
                                                    <div className="border-l border-gray-100 pl-2.5">
                                                        <span className="text-gray-400 block text-[9px] uppercase font-bold">Pendiente</span>
                                                        <span className="font-bold text-amber-500">{formatCLP(data.pendiente)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* TABLA 1: VISTA POR SOLICITUDES */}
            {vistaModo === 'solicitudes' && (
                <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100">
                            <thead className="bg-gray-50/50">
                                <tr>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Solicitud / Colegio
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Fecha
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Usuario
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Área
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Recursos
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Monto Total
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Monto Aprobado
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Estado
                                    </th>
                                    <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="animate-spin" size={24} />
                                                <span>Cargando solicitudes...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredSolicitudes.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                                            No se encontraron solicitudes
                                        </td>
                                    </tr>
                                ) : solicitudesPaginadas.map((req) => {
                                    const style = getStatusStyle(req.estado);
                                    const StatusIcon = style.icon;

                                    const montoAprobado = (req.detalles || []).reduce((acc, d) => {
                                        if (d.estado_aprobacion === 'Aprobado') {
                                            return acc + (d.total_iva || (d.cantidad * d.valor_unitario_iva));
                                        }
                                        return acc;
                                    }, 0);

                                    return (
                                        <tr key={req.id_presupuesto} className="hover:bg-gray-50/60 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="font-bold text-sm text-gray-900">
                                                    REQ-{new Date(req.fecha).getFullYear()}-{req.id_presupuesto.toString().padStart(3, '0')}
                                                </div>
                                                <div className="text-xs font-semibold text-gray-500 mt-0.5 flex items-center gap-1">
                                                    {req.colegio_nombre ? (
                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                            req.colegio_nombre.toLowerCase().includes('macaya')
                                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                                                : 'bg-blue-50 text-blue-700 border border-blue-100'
                                                        }`}>
                                                            {req.colegio_nombre}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400 font-mono">ID: {req.id_presupuesto}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-700">
                                                    {new Date(req.fecha).toLocaleDateString('es-CL')}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-semibold text-gray-900">{req.user_nombre || 'N/A'}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-700">{req.area_nombre || 'N/A'}</div>
                                                {req.subarea_nombre && (
                                                    <div className="text-xs text-primary font-medium">{req.subarea_nombre}</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                    {req.detalles?.length || 0} items
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                                {formatCLP(req.monto_total)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600">
                                                {formatCLP(montoAprobado)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${style.bgColor} ${style.txColor}`}>
                                                    <StatusIcon size={14} className={style.iconColor} />
                                                    {style.label || req.estado}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <Link
                                                        href={`/presupuesto/${req.id_presupuesto}`}
                                                        className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                                                        title="Ver detalles"
                                                    >
                                                        <Eye size={16} />
                                                    </Link>
                                                    {req.estado === 'Pendiente' && (
                                                        <button
                                                            onClick={() => openConfirmModal(req, 'enviar')}
                                                            disabled={actionLoading !== null}
                                                            className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                                                            title="Enviar a Revisión"
                                                        >
                                                            <Send size={16} />
                                                        </button>
                                                    )}
                                                    {req.estado === 'Revisar' && (
                                                        <button
                                                            onClick={() => openConfirmModal(req, 'reenviar')}
                                                            disabled={actionLoading !== null}
                                                            className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                                                            title="Reenviar a Revisión"
                                                        >
                                                            <Send size={16} />
                                                        </button>
                                                    )}
                                                    {canApprove && (req.estado === 'Enviado' || req.estado === 'Pendiente') && (
                                                        <>
                                                            <button
                                                                onClick={() => openConfirmModal(req, 'aprobar')}
                                                                disabled={actionLoading !== null}
                                                                className="p-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors border border-green-200"
                                                                title="Aprobar Solicitud"
                                                            >
                                                                <Check size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => openConfirmModal(req, 'rechazar')}
                                                                disabled={actionLoading !== null}
                                                                className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-200"
                                                                title="Rechazar Solicitud"
                                                            >
                                                                <XCircle size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                    {canApprove && (req.estado === 'Aprobado' || req.estado === 'Rechazado') && (
                                                        <button
                                                            onClick={() => openConfirmModal(req, 'revertir')}
                                                            disabled={actionLoading !== null}
                                                            className="p-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200"
                                                            title="Revertir a Pendiente"
                                                        >
                                                            <RotateCcw size={16} />
                                                        </button>
                                                    )}
                                                    {canApprove && (
                                                        <button
                                                            onClick={() => openConfirmModal(req, 'eliminar')}
                                                            disabled={actionLoading !== null}
                                                            className="p-1.5 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-200"
                                                            title="Eliminar Solicitud"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Paginación de Solicitudes */}
                    {filteredSolicitudes.length > 0 && (
                        <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <span className="text-xs text-gray-500 font-medium">
                                Mostrando {((paginaSolicitudes - 1) * pageSizeSolicitudes) + 1} a {Math.min(paginaSolicitudes * pageSizeSolicitudes, filteredSolicitudes.length)} de {filteredSolicitudes.length} solicitudes
                            </span>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                                    <span>Mostrar:</span>
                                    <select
                                        value={pageSizeSolicitudes}
                                        onChange={(e) => {
                                            setPageSizeSolicitudes(Number(e.target.value));
                                            setPaginaSolicitudes(1);
                                        }}
                                        className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer shadow-2xs"
                                    >
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value={150}>150</option>
                                        <option value={200}>200</option>
                                    </select>
                                    <span>por pág.</span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setPaginaSolicitudes(p => Math.max(1, p - 1))}
                                        disabled={paginaSolicitudes === 1}
                                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer transition-all"
                                    >
                                        Anterior
                                    </button>
                                    <span className="px-3 py-1.5 text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-lg">
                                        {paginaSolicitudes} / {totalPaginasSolicitudes}
                                    </span>
                                    <button
                                        onClick={() => setPaginaSolicitudes(p => Math.min(totalPaginasSolicitudes, p + 1))}
                                        disabled={paginaSolicitudes === totalPaginasSolicitudes}
                                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer transition-all"
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TABLA 2: VISTA CONSOLIDADA DE TODOS LOS RECURSOS / ÍTEMS (IDÉNTICO A [id]/page.tsx) */}
            {vistaModo === 'recursos' && (
                <div className={`bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border overflow-hidden mb-6 ${
                    isMacaya ? 'border-emerald-200/80' : 'border-blue-200/80'
                }`}>
                    {/* Barra de Filtros Integrada */}
                    <div className="p-4 border-b border-gray-100 bg-slate-50/50 space-y-3">
                        {/* Fila 1: Buscador Principal + Selectores Dropdown */}
                        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
                            <div className="relative flex-1 min-w-[280px]">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Buscar por producto, motivo, descripción, solicitante, área..."
                                    value={filtroTexto}
                                    onChange={(e) => setFiltroTexto(e.target.value)}
                                    className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-2xs"
                                />
                                {filtroTexto && (
                                    <button onClick={() => setFiltroTexto('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-all" title="Limpiar">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Filtro por Estado del Recurso */}
                                <select
                                    value={filtroEstadoRecursos}
                                    onChange={(e) => setFiltroEstadoRecursos(e.target.value as any)}
                                    className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-2xs cursor-pointer"
                                >
                                    <option value="todos">Todos los Estados ({conteosPorEstadoRecursos.todos})</option>
                                    <option value="Sin Revisar">Sin Revisar ({conteosPorEstadoRecursos['Sin Revisar']})</option>
                                    <option value="Aprobado">Aprobado ({conteosPorEstadoRecursos.Aprobado})</option>
                                    <option value="Con Ajustes">Con Ajustes ({conteosPorEstadoRecursos['Con Ajustes']})</option>
                                    <option value="Pendiente">Pendiente ({conteosPorEstadoRecursos.Pendiente})</option>
                                    <option value="Rechazado">Rechazado ({conteosPorEstadoRecursos.Rechazado})</option>
                                </select>

                                {/* Filtro por Área Solicitante */}
                                <select
                                    value={filtroArea}
                                    onChange={(e) => setFiltroArea(e.target.value)}
                                    className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-2xs max-w-[200px] truncate cursor-pointer"
                                >
                                    <option value="todos">Todas las Áreas</option>
                                    {opcionesAreas.map(area => (
                                        <option key={area} value={area}>{area}</option>
                                    ))}
                                </select>

                                {/* Filtro por Actividad PME */}
                                {opcionesActividades.length > 0 && (
                                    <select
                                        value={filtroActividad}
                                        onChange={(e) => setFiltroActividad(e.target.value)}
                                        className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-2xs max-w-[200px] truncate cursor-pointer"
                                    >
                                        <option value="todos">Todas las Actividades PME</option>
                                        {opcionesActividades.map(act => (
                                            <option key={act} value={act}>{act}</option>
                                        ))}
                                    </select>
                                )}

                                {/* Filtro por Categoría */}
                                {opcionesCategorias.length > 0 && (
                                    <select
                                        value={filtroCategoria}
                                        onChange={(e) => setFiltroCategoria(e.target.value)}
                                        className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-2xs max-w-[190px] truncate cursor-pointer"
                                    >
                                        <option value="todos">Todas las Categorías</option>
                                        {opcionesCategorias.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                )}

                                {/* Filtro por Tipo de Subvención */}
                                <select
                                    value={filtroSubvencionRecursos}
                                    onChange={(e) => setFiltroSubvencionRecursos(e.target.value)}
                                    className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-2xs cursor-pointer"
                                >
                                    <option value="todos">Todas las Subvenciones</option>
                                    {opcionesSubvenciones.map(subv => (
                                        <option key={subv} value={subv}>{subv}</option>
                                    ))}
                                </select>

                                {/* Filtro por Mes / Fecha */}
                                <select
                                    value={filtroMes}
                                    onChange={(e) => setFiltroMes(e.target.value)}
                                    className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-2xs cursor-pointer"
                                >
                                    <option value="todos">Todos los Meses / Fechas</option>
                                    {opcionesMeses.map(mes => (
                                        <option key={mes} value={mes}>{mes}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Fila 2: Segmented Control de Estados (Pills) con conteo y % + Botón Limpiar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-200/60">
                            <div className="inline-flex bg-gray-200/60 p-1 rounded-xl border border-gray-200/80 shadow-inner flex-wrap gap-1">
                                {[
                                    { k: 'todos', l: 'Todos' },
                                    { k: 'Sin Revisar', l: 'Sin Revisar' },
                                    { k: 'Aprobado', l: 'Aprobados' },
                                    { k: 'Con Ajustes', l: 'Con Ajustes' },
                                    { k: 'Pendiente', l: 'Pendientes' },
                                    { k: 'Rechazado', l: 'Rechazados' },
                                ].map(op => {
                                    const count = conteosPorEstadoRecursos[op.k] || 0;
                                    const total = conteosPorEstadoRecursos.todos || 1;
                                    const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
                                    const isSelected = filtroEstadoRecursos === op.k;
                                    return (
                                        <button
                                            key={op.k}
                                            onClick={() => setFiltroEstadoRecursos(op.k as any)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                                                isSelected
                                                    ? 'bg-white text-primary shadow-xs ring-1 ring-black/5'
                                                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                                            }`}
                                        >
                                            <span>{op.l}</span>
                                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black transition-colors ${
                                                isSelected
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'bg-gray-300/60 text-gray-700'
                                            }`}>
                                                {count} {op.k !== 'todos' && count > 0 && <span className="opacity-70 font-medium">({pct}%)</span>}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                {filtroActivoRecursos && (
                                    <button 
                                        onClick={() => { 
                                            setFiltroTexto(''); 
                                            setFiltroEstadoRecursos('todos'); 
                                            setFiltroSubvencionRecursos('todos');
                                            setFiltroArea('todos'); 
                                            setFiltroCategoria('todos');
                                            setFiltroActividad('todos');
                                            setFiltroMes('todos'); 
                                        }} 
                                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-2xs"
                                    >
                                        <X size={13} />
                                        Limpiar filtros
                                    </button>
                                )}
                                <div className={`px-3 py-1.5 rounded-xl border shadow-2xs font-extrabold text-xs shrink-0 ${
                                    isMacaya 
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                                        : 'bg-blue-50 border-blue-200 text-blue-700'
                                }`}>
                                    {filtroActivoRecursos ? `${filteredItems.length} de ${allFlatItems.length}` : allFlatItems.length} insumos
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100">
                            <thead className="bg-gray-50/50">
                                <tr>
                                    <th className="px-3.5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase">
                                        <div className="flex items-center gap-2">
                                            {canApprove && (
                                                <input
                                                    type="checkbox"
                                                    checked={itemsPaginados.length > 0 && itemsPaginados.every(d => selectedRecursoIds.includes(d.id_pre_detalle))}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            const pageIds = itemsPaginados.map(d => d.id_pre_detalle);
                                                            setSelectedRecursoIds(prev => Array.from(new Set([...prev, ...pageIds])));
                                                        } else {
                                                            const pageIds = new Set(itemsPaginados.map(d => d.id_pre_detalle));
                                                            setSelectedRecursoIds(prev => prev.filter(id => !pageIds.has(id)));
                                                        }
                                                    }}
                                                    className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer border-gray-300"
                                                    title="Seleccionar todos de esta página"
                                                />
                                            )}
                                            <span>#</span>
                                        </div>
                                    </th>
                                    <th className="px-3.5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase min-w-[200px]">Producto</th>
                                    <th className="px-3.5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase">Área / Solicitante</th>
                                    <th className="px-3.5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase">Cant. / Valores</th>
                                    <th className="px-3.5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase min-w-[240px]">Mes y Justificación</th>
                                    <th className="px-3.5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase">
                                        <div className="inline-flex items-center gap-1">
                                            <span>Subvención</span>
                                            <span
                                                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-800 font-extrabold text-[10px] cursor-help border border-amber-300 shadow-2xs hover:scale-110 transition-transform"
                                                title="Sugerencia"
                                                aria-label="Sugerencia"
                                            >
                                                !
                                            </span>
                                        </div>
                                    </th>
                                    <th className="px-3.5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase">Estado</th>
                                    {canApprove && <th className="px-3.5 py-3.5 text-center text-xs font-bold text-gray-500 uppercase">Acciones</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-xs">
                                {loading ? (
                                    <tr>
                                        <td colSpan={canApprove ? 8 : 7} className="px-6 py-12 text-center text-gray-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="animate-spin" size={24} />
                                                <span>Cargando recursos...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : itemsPaginados.length === 0 ? (
                                    <tr>
                                        <td colSpan={canApprove ? 8 : 7} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center gap-2 opacity-40">
                                                <Search size={32} className="text-gray-400" />
                                                <p className="text-sm font-bold text-gray-700">Sin resultados para la búsqueda</p>
                                                {filtroActivoRecursos && (
                                                    <button 
                                                        onClick={() => { 
                                                            setFiltroTexto(''); 
                                                            setFiltroEstadoRecursos('todos'); 
                                                            setFiltroArea('todos'); 
                                                            setFiltroCategoria('todos');
                                                            setFiltroActividad('todos');
                                                            setFiltroMes('todos'); 
                                                        }} 
                                                        className="text-xs font-bold text-primary hover:underline"
                                                    >
                                                        Limpiar filtros
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : itemsPaginados.map((item, i) => {
                                    const detStatusStyle = getStatusStyle(item.estado_aprobacion);
                                    const DetStatusIcon = detStatusStyle.icon;
                                    const numItem = ((paginaItems - 1) * pageSizeRecursos) + i + 1;
                                    const isRowSelected = selectedRecursoIds.includes(item.id_pre_detalle);

                                    return (
                                        <tr key={`${item.id_presupuesto}-${item.id_pre_detalle}`} className={`transition-colors ${
                                            isRowSelected 
                                                ? 'bg-primary/5 hover:bg-primary/10' 
                                                : isMacaya ? 'hover:bg-emerald-50/30' : 'hover:bg-blue-50/30'
                                        }`}>
                                            <td className="px-3.5 py-3.5 text-xs font-medium text-gray-900">
                                                <div className="flex items-center gap-2">
                                                    {canApprove && (
                                                        <input
                                                            type="checkbox"
                                                            checked={isRowSelected}
                                                            onChange={() => {
                                                                setSelectedRecursoIds(prev =>
                                                                    prev.includes(item.id_pre_detalle)
                                                                        ? prev.filter(idDet => idDet !== item.id_pre_detalle)
                                                                        : [...prev, item.id_pre_detalle]
                                                                );
                                                            }}
                                                            className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer border-gray-300"
                                                        />
                                                    )}
                                                    <span>{numItem}</span>
                                                </div>
                                            </td>
                                            
                                            {/* Producto: Nombre + Descripción Completa */}
                                            <td className="px-3.5 py-3.5 max-w-[260px]">
                                                <div className="text-xs font-bold text-gray-900 leading-snug">{item.nombre_producto}</div>
                                                {item.descripcion && (
                                                    <div className="text-[11px] text-gray-500 whitespace-pre-wrap break-words mt-0.5 leading-relaxed">
                                                        {item.descripcion}
                                                    </div>
                                                )}
                                                {item.categoria_nombre && (
                                                    <div className="text-[10px] text-gray-400 font-semibold mt-1">
                                                        {item.categoria_nombre}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Área y Solicitante */}
                                            <td className="px-3.5 py-3.5 whitespace-nowrap">
                                                <div className="font-semibold text-gray-900 text-xs">{item.area_nombre || 'N/A'}</div>
                                                <div className="text-[11px] text-gray-500 mt-0.5">
                                                    {item.user_nombre || 'N/A'}
                                                    {item.subarea_nombre && (
                                                        <span className="font-medium text-primary ml-1">({item.subarea_nombre})</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Cantidad y Valores */}
                                            <td className="px-3.5 py-3.5 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <div className="text-xs font-semibold text-gray-800">
                                                        {item.cantidad} <span className="text-[11px] font-normal text-gray-500">({item.formato_unidad})</span>
                                                    </div>
                                                    {(() => {
                                                        const esConAjustes = item.estado_aprobacion === 'Con Ajustes' || item.estado_aprobacion === 'Aprobado con Ajustes' || item.estado_aprobacion === 'Aprobado con ajustes';
                                                        if (!esConAjustes || !canApprove) return null;
                                                        return (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setCantModDetalle(item);
                                                                    setCantModValor(item.cantidad);
                                                                }}
                                                                className="p-1 text-amber-700 hover:text-amber-900 bg-amber-100/80 hover:bg-amber-200 border border-amber-300/80 rounded-md transition-all active:scale-95 cursor-pointer shadow-2xs"
                                                                title="Editar cantidad ajustada"
                                                                aria-label="Editar cantidad"
                                                            >
                                                                <Edit3 size={13} />
                                                            </button>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="text-[11px] text-gray-500 mt-0.5">
                                                    Unit: {formatCLP(item.valor_unitario_iva)}
                                                </div>
                                                <div className={`text-xs font-bold mt-0.5 ${isMacaya ? 'text-emerald-700' : 'text-blue-700'}`}>
                                                    Total: {formatCLP(item.total_iva)}
                                                </div>
                                            </td>

                                            {/* Mes, Motivo y Actividad PME */}
                                            <td className="px-3.5 py-3.5 max-w-[280px]">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md capitalize ${
                                                        isMacaya ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-blue-50 text-blue-800 border border-blue-200'
                                                    }`}>
                                                        {labelFecha(item.fecha_ejecucion, item.tipo_fecha)}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                                                    {item.motivo || '-'}
                                                </div>
                                                {item.actividad_nombre && (
                                                    <div className="text-[10px] text-gray-400 mt-1 leading-tight" title={item.actividad_nombre}>
                                                        <span className="font-semibold text-gray-600">PME:</span> {item.actividad_nombre}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Subvención */}
                                            <td className="px-3.5 py-3.5 text-xs whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    {item.estado_aprobacion === 'Aprobado' ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-bold border border-violet-200">
                                                            {item.subvencion_nombre || 'GENERAL'}
                                                        </span>
                                                    ) : updatingSubvId === item.id_pre_detalle ? (
                                                        <div className="flex items-center gap-1.5 text-xs text-violet-600 font-semibold">
                                                            <Loader2 size={13} className="animate-spin" /> Guardando...
                                                        </div>
                                                    ) : (
                                                        <select
                                                            value={item.id_subvencion || ''}
                                                            onChange={(e) => {
                                                                const val = Number(e.target.value);
                                                                if (val) updateDetalleSubvencion(item.id_pre_detalle, val);
                                                            }}
                                                            className="px-2 py-1 bg-violet-50/80 hover:bg-violet-100/80 text-violet-700 border border-violet-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer transition-colors max-w-[125px] truncate"
                                                        >
                                                            <option value="" disabled>Tipo Subvención</option>
                                                            {subvenciones.map((s) => (
                                                                <option key={s.id_subvencion} value={s.id_subvencion}>
                                                                    {s.nombre_corto || s.nombre}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    {((item.raw_detalle as any)?.recurso_estado === 'PENDIENTE_APROBACION' || !(item.raw_detalle?.id_recurso) || (item.raw_detalle as any)?.es_sugerido) && (
                                                        <span
                                                            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-800 font-extrabold text-[10px] cursor-help border border-amber-300 shadow-2xs shrink-0 hover:scale-110 transition-transform"
                                                            title="Sugerencia"
                                                            aria-label="Sugerido"
                                                        >
                                                            !
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Estado (con selector integrado para gestión) */}
                                            <td className="px-3.5 py-3.5 whitespace-nowrap">
                                                {canApprove ? (
                                                    <select
                                                        value={item.estado_aprobacion === 'Aprobado con Ajustes' ? 'Con Ajustes' : (item.estado_aprobacion || 'Sin Revisar')}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val === 'Rechazado') {
                                                                setRechazoComentario(item.comentario_revision || '');
                                                                setRechazoDetalle(item);
                                                            } else if (val === 'Con Ajustes' || val === 'Aprobado con Ajustes') {
                                                                setAjusteComentario(item.comentario_revision || '');
                                                                setAjusteDetalle(item);
                                                            } else {
                                                                updateDetalleEstado(item.id_pre_detalle, val);
                                                            }
                                                        }}
                                                        disabled={actionLoading !== null}
                                                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 ${detStatusStyle.bgColor} ${detStatusStyle.txColor} border-gray-200`}
                                                    >
                                                        <option value="Sin Revisar">⚪ Sin Revisar</option>
                                                        <option value="Aprobado">🟢 Aprobado</option>
                                                        <option value="Con Ajustes">🔵 Con Ajustes</option>
                                                        <option value="Pendiente">🟡 Pendiente</option>
                                                        <option value="Rechazado">🔴 Rechazado</option>
                                                    </select>
                                                ) : (
                                                    <span className={`px-2.5 py-0.5 inline-flex items-center text-[11px] font-bold rounded-full ${detStatusStyle.bgColor} ${detStatusStyle.txColor}`}>
                                                        <DetStatusIcon size={13} className={`mr-1 ${detStatusStyle.iconColor}`} />
                                                        {item.estado_aprobacion || 'Sin Revisar'}
                                                    </span>
                                                )}

                                                {item.estado_aprobacion === 'Rechazado' && item.comentario_revision && (
                                                    <p className="text-[11px] text-red-600 mt-1 max-w-[180px] leading-snug whitespace-normal" title={item.comentario_revision}>
                                                        <span className="font-semibold">Motivo:</span> {item.comentario_revision}
                                                    </p>
                                                )}
                                                {(item.estado_aprobacion === 'Con Ajustes' || item.estado_aprobacion === 'Aprobado con Ajustes' || item.estado_aprobacion === 'Aprobado con ajustes') && item.comentario_revision && (
                                                    <p className="text-[11px] text-indigo-700 font-medium mt-1 max-w-[200px] leading-snug bg-indigo-50/80 p-1.5 rounded-lg border border-indigo-100 whitespace-normal" title={item.comentario_revision}>
                                                        <span className="font-bold text-indigo-900">Ajuste:</span> {item.comentario_revision}
                                                    </p>
                                                )}
                                            </td>

                                            {/* Acciones Rápidas */}
                                            {canApprove && (
                                                <td className="px-3.5 py-3.5 text-center whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button
                                                            onClick={() => updateDetalleEstado(item.id_pre_detalle, 'Aprobado')}
                                                            disabled={actionLoading !== null}
                                                            className="p-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors border border-green-200 cursor-pointer"
                                                            title="Aprobar recurso"
                                                        >
                                                            <Check size={14} />
                                                        </button>

                                                        <button
                                                            onClick={() => {
                                                                setAjusteComentario(item.comentario_revision || '');
                                                                setAjusteDetalle(item);
                                                            }}
                                                            disabled={actionLoading !== null}
                                                            className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 cursor-pointer"
                                                            title="Aprobar con ajustes (indicar observación)"
                                                        >
                                                            <Edit3 size={14} />
                                                        </button>

                                                        <button
                                                            onClick={() => {
                                                                setRechazoComentario(item.comentario_revision || '');
                                                                setRechazoDetalle(item);
                                                            }}
                                                            disabled={actionLoading !== null}
                                                            className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-200 cursor-pointer"
                                                            title="Rechazar recurso"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Paginación de recursos */}
                    {filteredItems.length > 0 && (
                        <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <span className="text-xs text-gray-500 font-medium">
                                Mostrando {((paginaItems - 1) * pageSizeRecursos) + 1} a {Math.min(paginaItems * pageSizeRecursos, filteredItems.length)} de {filteredItems.length} recursos
                            </span>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                                    <span>Mostrar:</span>
                                    <select
                                        value={pageSizeRecursos}
                                        onChange={(e) => {
                                            setPageSizeRecursos(Number(e.target.value));
                                            setPaginaItems(1);
                                        }}
                                        className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer shadow-2xs"
                                    >
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value={150}>150</option>
                                        <option value={200}>200</option>
                                    </select>
                                    <span>por pág.</span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setPaginaItems(p => Math.max(1, p - 1))}
                                        disabled={paginaItems === 1}
                                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer transition-all"
                                    >
                                        Anterior
                                    </button>
                                    <span className="px-3 py-1.5 text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-lg">
                                        {paginaItems} / {totalPaginasItems}
                                    </span>
                                    <button
                                        onClick={() => setPaginaItems(p => Math.min(totalPaginasItems, p + 1))}
                                        disabled={paginaItems === totalPaginasItems}
                                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer transition-all"
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Barra Flotante de Acciones Masivas */}
                    {selectedRecursoIds.length > 0 && (
                        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-6 py-3.5 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-4 border border-white/10 animate-in fade-in slide-in-from-bottom-5">
                            <div className="flex items-center gap-2 text-sm font-bold pr-2 border-r border-slate-700">
                                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-black">{selectedRecursoIds.length}</span>
                                <span>seleccionados</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleBulkEstadoRecursos('Aprobado')}
                                    disabled={bulkLoading}
                                    className="px-3.5 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                                >
                                    {bulkLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={14} />}
                                    Aprobar ({selectedRecursoIds.length})
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleBulkEstadoRecursos('Pendiente')}
                                    disabled={bulkLoading}
                                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                                >
                                    {bulkLoading ? <Loader2 size={13} className="animate-spin" /> : <Clock size={14} />}
                                    Pendiente ({selectedRecursoIds.length})
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleBulkEstadoRecursos('Rechazado')}
                                    disabled={bulkLoading}
                                    className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                                >
                                    {bulkLoading ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={14} />}
                                    Rechazar ({selectedRecursoIds.length})
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setSelectedRecursoIds([])}
                                className="text-xs text-slate-400 hover:text-white underline ml-2 cursor-pointer font-medium"
                            >
                                Cancelar
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Modal de Modificar Cantidad para recursos Con Ajustes */}
            {cantModDetalle && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-6 flex items-center gap-4 border-b border-gray-100 bg-amber-50/50">
                            <div className="p-3 rounded-2xl bg-amber-100 text-amber-800 shadow-xs">
                                <Edit3 size={22} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900">Modificar Cantidad</h3>
                                <p className="text-xs text-gray-500">Ajusta la cantidad solicitada para este insumo.</p>
                            </div>
                        </div>

                        {/* Body con detalles del recurso */}
                        <div className="p-6 space-y-4 text-xs">
                            {/* Tarjeta de Ficha de Recurso */}
                            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                                <div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
                                        Nombre del Recurso
                                    </span>
                                    <h4 className="text-sm font-black text-gray-900 mt-0.5">
                                        {cantModDetalle.nombre_producto}
                                    </h4>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200/60">
                                    <div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
                                            Área / Categoría
                                        </span>
                                        <span className="font-semibold text-gray-700">
                                            {cantModDetalle.area_nombre || cantModDetalle.categoria_nombre || 'General'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
                                            Formato / Unidad
                                        </span>
                                        <span className="font-semibold text-gray-700">
                                            {cantModDetalle.formato_unidad || 'Unidad'}
                                        </span>
                                    </div>
                                </div>

                                {cantModDetalle.descripcion && (
                                    <div className="pt-2 border-t border-gray-200/60">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
                                            Descripción del Recurso
                                        </span>
                                        <p className="text-gray-600 mt-0.5 leading-relaxed">
                                            {cantModDetalle.descripcion}
                                        </p>
                                    </div>
                                )}

                                {cantModDetalle.comentario_revision && (
                                    <div className="pt-2 border-t border-amber-200/80 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200/60">
                                        <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider block">
                                            Indicación del Ajuste:
                                        </span>
                                        <p className="text-amber-800 font-medium mt-0.5 italic">
                                            "{cantModDetalle.comentario_revision}"
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Campo de Cantidad Editable */}
                            <div className="space-y-1.5 pt-1">
                                <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">
                                    Nueva Cantidad ({cantModDetalle.formato_unidad || 'Unidades'}) *
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        min={0.01}
                                        step="any"
                                        value={cantModValor}
                                        onChange={(e) => setCantModValor(e.target.value)}
                                        placeholder="Ingrese la nueva cantidad..."
                                        className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm font-extrabold text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-sm"
                                        autoFocus
                                    />
                                    <div className="text-right px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                                        <span className="text-[9px] font-bold text-gray-400 uppercase block">Nuevo Total Estimado</span>
                                        <span className="text-xs font-bold text-primary">
                                            {formatCLP((Number(cantModValor) || 0) * (Number(cantModDetalle.valor_unitario_iva) || 0))}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setCantModDetalle(null)}
                                className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors font-bold text-xs"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={updatingCantidadId !== null || !cantModValor || Number(cantModValor) <= 0}
                                onClick={async () => {
                                    const numVal = Number(cantModValor);
                                    if (numVal > 0) {
                                        await updateDetalleCantidad(cantModDetalle, numVal);
                                        setCantModDetalle(null);
                                    }
                                }}
                                className="px-5 py-2.5 text-white rounded-xl transition-all font-bold text-xs flex items-center gap-2 bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-600/20 active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                                {updatingCantidadId !== null ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                Guardar Cantidad
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Aprobado con Ajustes */}
            {ajusteDetalle && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-6 flex items-center gap-4 bg-indigo-50">
                            <div className="p-3 rounded-xl bg-indigo-100 text-indigo-600">
                                <Edit3 size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Aprobar con Ajustes</h3>
                                <p className="text-xs text-gray-500 font-medium">{ajusteDetalle.nombre_producto}</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-3">
                            <label className="block text-sm font-semibold text-gray-700">Comentario o ajuste sugerido</label>
                            <textarea
                                value={ajusteComentario}
                                onChange={(e) => setAjusteComentario(e.target.value)}
                                placeholder="Ej: Se aprueba pero con cambio de marca/proveedor..."
                                rows={4}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-900"
                                autoFocus
                            />
                        </div>
                        <div className="p-6 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => setAjusteDetalle(null)}
                                className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors font-medium text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmarAjuste}
                                disabled={actionLoading !== null}
                                className="px-4 py-2.5 text-white rounded-xl transition-colors font-medium flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-sm disabled:opacity-50"
                            >
                                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                Guardar Ajuste
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Rechazo con selección rápida de motivos */}
            {rechazoDetalle && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-6 flex items-center gap-4 bg-red-50">
                            <div className="p-3 rounded-xl bg-red-100 text-red-600">
                                <XCircle size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Rechazar Insumo</h3>
                                <p className="text-xs text-gray-500 font-medium">{rechazoDetalle.nombre_producto}</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-3">
                            <label className="block text-sm font-semibold text-gray-700">Selecciona o escribe el motivo:</label>
                            <div className="flex flex-wrap gap-2 mb-2">
                                {motivosRechazo.map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setRechazoComentario(m)}
                                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                            rechazoComentario === m
                                                ? 'bg-red-600 text-white border-red-600'
                                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                        }`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                            <textarea
                                value={rechazoComentario}
                                onChange={(e) => setRechazoComentario(e.target.value)}
                                placeholder="Escribe el motivo del rechazo..."
                                rows={3}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm text-gray-900"
                                autoFocus
                            />
                        </div>
                        <div className="p-6 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => setRechazoDetalle(null)}
                                className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors font-medium text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmarRechazo}
                                disabled={actionLoading !== null}
                                className="px-4 py-2.5 text-white rounded-xl transition-colors font-medium flex items-center gap-2 bg-red-600 hover:bg-red-700 text-sm disabled:opacity-50"
                            >
                                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                                Confirmar Rechazo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de confirmación de acciones de solicitud con desglose detallado */}
            {confirmModal.open && confirmModal.solicitud && confirmModal.accion && (() => {
                const sol = confirmModal.solicitud;
                const detallesModal = sol.detalles || [];
                const itemsAprobados = detallesModal.filter(d => d.estado_aprobacion === 'Aprobado');
                const itemsConAjustes = detallesModal.filter(d => d.estado_aprobacion === 'Con Ajustes' || d.estado_aprobacion === 'Aprobado con Ajustes');
                const itemsPendientes = detallesModal.filter(d => d.estado_aprobacion === 'Pendiente');
                const itemsSinRevisar = detallesModal.filter(d => d.estado_aprobacion === 'Sin Revisar' || !d.estado_aprobacion);
                const itemsRechazados = detallesModal.filter(d => d.estado_aprobacion === 'Rechazado');

                const montoTotalSolicitado = sol.monto_total || 0;
                const montoAprobadoTotal = [...itemsAprobados, ...itemsConAjustes].reduce((acc, d) => acc + (d.total_iva || (d.cantidad * d.valor_unitario_iva) || 0), 0);
                const hayInsumosSinRevisarOPendientes = itemsSinRevisar.length > 0 || itemsPendientes.length > 0;

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl mx-auto overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
                            {/* Header */}
                            <div className={`p-5 flex items-center gap-4 border-b shrink-0 ${
                                confirmModal.accion === 'aprobar' ? 'bg-green-50 border-green-100' : 
                                confirmModal.accion === 'rechazar' ? 'bg-orange-50 border-orange-100' : 
                                confirmModal.accion === 'eliminar' ? 'bg-red-50 border-red-100' : 
                                (confirmModal.accion === 'enviar' || confirmModal.accion === 'reenviar') ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'
                            }`}>
                                <div className={`p-3 rounded-2xl shrink-0 ${
                                    confirmModal.accion === 'aprobar' ? 'bg-green-100 text-green-700' : 
                                    confirmModal.accion === 'rechazar' ? 'bg-orange-100 text-orange-700' : 
                                    confirmModal.accion === 'eliminar' ? 'bg-red-100 text-red-700' : 
                                    (confirmModal.accion === 'enviar' || confirmModal.accion === 'reenviar') ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                    {confirmModal.accion === 'aprobar' ? <Check size={24} strokeWidth={2.5} /> : 
                                     confirmModal.accion === 'rechazar' ? <RotateCcw size={24} /> : 
                                     confirmModal.accion === 'eliminar' ? <Trash2 size={24} /> : 
                                     (confirmModal.accion === 'enviar' || confirmModal.accion === 'reenviar') ? <Send size={24} /> : <RotateCcw size={24} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-bold text-gray-900 leading-tight">
                                        {confirmModal.accion === 'aprobar' ? 'Aprobar y Cerrar Solicitud' : 
                                         confirmModal.accion === 'rechazar' ? 'Enviar a Revisar' : 
                                         confirmModal.accion === 'eliminar' ? 'Eliminar Solicitud' : 
                                         confirmModal.accion === 'enviar' ? 'Enviar Solicitud a Revisión' : 
                                         confirmModal.accion === 'reenviar' ? 'Reenviar Solicitud a Revisión' : 'Revertir Solicitud'}
                                    </h3>
                                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                                        REQ-{new Date(sol.fecha).getFullYear()}-{sol.id_presupuesto.toString().padStart(3, '0')} · {sol.area_nombre} · {sol.user_nombre || 'N/A'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setConfirmModal({ open: false, solicitud: null, accion: null })}
                                    className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-black/5 transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-6 overflow-y-auto space-y-4">
                                {/* Desglose de Insumos por Estado */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                            Desglose de Insumos ({detallesModal.length} items)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setShowModalInsumosList(!showModalInsumosList)}
                                            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                                        >
                                            {showModalInsumosList ? 'Ocultar lista' : 'Ver detalle por insumo'}
                                            {showModalInsumosList ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                        {/* Aprobados */}
                                        <div className="bg-green-50/90 border border-green-200/80 rounded-2xl p-2.5 text-center shadow-2xs">
                                            <span className="block text-[10px] font-bold text-green-700 uppercase">Aprobados</span>
                                            <span className="text-base font-extrabold text-green-800">{itemsAprobados.length}</span>
                                        </div>

                                        {/* Con Ajustes */}
                                        <div className="bg-indigo-50/90 border border-indigo-200/80 rounded-2xl p-2.5 text-center shadow-2xs">
                                            <span className="block text-[10px] font-bold text-indigo-700 uppercase">Con Ajustes</span>
                                            <span className="text-base font-extrabold text-indigo-800">{itemsConAjustes.length}</span>
                                        </div>

                                        {/* Sin Revisar */}
                                        <div className="bg-gray-100/90 border border-gray-200 rounded-2xl p-2.5 text-center shadow-2xs">
                                            <span className="block text-[10px] font-bold text-gray-600 uppercase">Sin Revisar</span>
                                            <span className="text-base font-extrabold text-gray-800">{itemsSinRevisar.length}</span>
                                        </div>

                                        {/* Pendientes */}
                                        <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-2.5 text-center shadow-2xs">
                                            <span className="block text-[10px] font-bold text-amber-700 uppercase">Pendientes</span>
                                            <span className="text-base font-extrabold text-amber-800">{itemsPendientes.length}</span>
                                        </div>

                                        {/* Rechazados */}
                                        <div className="bg-red-50/90 border border-red-200/80 rounded-2xl p-2.5 text-center col-span-2 sm:col-span-1 shadow-2xs">
                                            <span className="block text-[10px] font-bold text-red-700 uppercase">Rechazados</span>
                                            <span className="text-base font-extrabold text-red-800">{itemsRechazados.length}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Resumen Financiero */}
                                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-4">
                                    <div>
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Monto Solicitado</span>
                                        <span className="text-sm font-extrabold text-gray-800">{formatCLP(montoTotalSolicitado)}</span>
                                    </div>
                                    <div className="h-8 w-px bg-gray-200"></div>
                                    <div className="text-right">
                                        <span className="block text-[10px] font-bold uppercase tracking-wider text-green-600">Monto Aprobado</span>
                                        <span className="text-base font-extrabold text-green-700">{formatCLP(montoAprobadoTotal)}</span>
                                    </div>
                                </div>

                                {/* Lista desplegable de insumos */}
                                {showModalInsumosList && (
                                    <div className="border border-gray-200 rounded-2xl overflow-hidden">
                                        <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 bg-white text-xs">
                                            {detallesModal.map((d: any, idx: number) => {
                                                const st = d.estado_aprobacion || 'Sin Revisar';
                                                const badgeClass =
                                                    st === 'Aprobado' ? 'bg-green-100 text-green-700 border-green-200' :
                                                    st === 'Con Ajustes' || st === 'Aprobado con Ajustes' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                                                    st === 'Rechazado' ? 'bg-red-100 text-red-700 border-red-200' :
                                                    st === 'Pendiente' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                    'bg-gray-100 text-gray-600 border-gray-200';
                                                const montoItem = d.total_iva || (d.cantidad * d.valor_unitario_iva) || 0;
                                                return (
                                                    <div key={idx} className="p-2.5 flex items-center justify-between gap-2 hover:bg-gray-50/60 transition-colors">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-semibold text-gray-800 truncate">{d.nombre_producto}</p>
                                                            <p className="text-[10px] text-gray-400 font-medium">Cant: {d.cantidad} · {formatCLP(montoItem)}</p>
                                                        </div>
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border shrink-0 ${badgeClass}`}>
                                                            {st}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Alertas contextuales */}
                                {confirmModal.accion === 'aprobar' && hayInsumosSinRevisarOPendientes && (
                                    <div className="border border-amber-200 bg-amber-50/80 rounded-2xl p-3 flex items-start gap-2.5">
                                        <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                        <p className="text-xs text-amber-800 font-medium leading-snug">
                                            Nota: Esta solicitud aún contiene <strong>{itemsSinRevisar.length + itemsPendientes.length} insumo(s)</strong> sin revisar o pendientes. Al aprobar, los ítems en estado <strong>Aprobado</strong> y <strong>Con Ajustes</strong> formarán parte del presupuesto oficial.
                                        </p>
                                    </div>
                                )}

                                <div className={`border rounded-2xl p-3 flex items-start gap-2.5 ${
                                    confirmModal.accion === 'eliminar' ? 'bg-red-50 border-red-200 text-red-700' : 
                                    (confirmModal.accion === 'enviar' || confirmModal.accion === 'reenviar') ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-700'
                                }`}>
                                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                                    <p className="text-xs font-medium leading-snug">
                                        {confirmModal.accion === 'enviar' ? '¿Enviar esta solicitud a revisión de Finanzas/Contraloría? Cambiará al estado "Enviado".' :
                                         confirmModal.accion === 'reenviar' ? '¿Reenviar esta solicitud corregida a revisión? Cambiará al estado "Enviado".' :
                                         confirmModal.accion === 'aprobar' ? '¿Aceptar y cerrar esta solicitud? Quedará en estado "Aceptado" con el presupuesto revisado.' : 
                                         confirmModal.accion === 'rechazar' ? '¿Enviar esta solicitud a revisión? Volverá al solicitante en estado "Revisar" para que ajuste lo necesario.' : 
                                         confirmModal.accion === 'eliminar' ? 'Esta acción es permanente y no se puede deshacer. Se eliminará la solicitud junto con todos sus recursos y datos asociados.' : 
                                         '¿Está seguro de revertir esta solicitud a estado Pendiente?'}
                                    </p>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-4 bg-gray-50/80 border-t border-gray-100 flex justify-end gap-2.5 shrink-0">
                                <button
                                    onClick={() => setConfirmModal({ open: false, solicitud: null, accion: null })}
                                    className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors font-bold text-xs"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmAction}
                                    disabled={actionLoading !== null}
                                    className={`px-4 py-2 text-white rounded-xl transition-colors font-bold text-xs flex items-center gap-1.5 shadow-sm ${
                                        confirmModal.accion === 'aprobar' ? 'bg-green-600 hover:bg-green-700' : 
                                        confirmModal.accion === 'rechazar' ? 'bg-orange-600 hover:bg-orange-700' : 
                                        confirmModal.accion === 'eliminar' ? 'bg-red-600 hover:bg-red-700' : 
                                        (confirmModal.accion === 'enviar' || confirmModal.accion === 'reenviar') ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'
                                    }`}
                                >
                                    {actionLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                                    {confirmModal.accion === 'eliminar'
                                        ? 'Continuar para Eliminar'
                                        : (confirmModal.accion === 'enviar' || confirmModal.accion === 'reenviar')
                                        ? 'Enviar Solicitud'
                                        : confirmModal.accion === 'revertir'
                                        ? 'Revertir Solicitud'
                                        : confirmModal.accion === 'rechazar'
                                        ? 'Enviar a Revisión'
                                        : 'Confirmar Aprobación'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Segundo Modal de Confirmación Estricta para Eliminar Solicitud */}
            {modalEliminarConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-auto overflow-hidden animate-in zoom-in-95 duration-150 border border-red-100">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-inner">
                                <Trash2 size={32} />
                            </div>

                            <div>
                                <h3 className="text-lg font-black text-gray-900">
                                    ¿Confirmas la eliminación definitiva?
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    Esta acción eliminará de forma irreversible la solicitud{' '}
                                    <strong className="text-gray-800">
                                        REQ-{new Date(modalEliminarConfirm.fecha).getFullYear()}-{modalEliminarConfirm.id_presupuesto.toString().padStart(3, '0')}
                                    </strong>{' '}
                                    ({modalEliminarConfirm.area_nombre}) y todos sus recursos vinculados.
                                </p>
                            </div>

                            <div className="bg-red-50/80 border border-red-200/80 rounded-2xl p-3.5 text-left text-xs text-red-700 flex items-start gap-2.5">
                                <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                                <span className="leading-snug font-medium">
                                    ¡Atención! No será posible recuperar los insumos, montos o revisiones asociadas una vez eliminada.
                                </span>
                            </div>
                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2.5">
                            <button
                                type="button"
                                onClick={() => setModalEliminarConfirm(null)}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors font-bold text-xs"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={actionLoading !== null}
                                onClick={async () => {
                                    const idSol = modalEliminarConfirm.id_presupuesto;
                                    setModalEliminarConfirm(null);
                                    await handleEliminar(idSol);
                                }}
                                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all font-bold text-xs flex items-center gap-1.5 shadow-md shadow-red-600/20 active:scale-95 disabled:opacity-50"
                            >
                                {actionLoading !== null ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                Sí, Eliminar Definitivamente
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
