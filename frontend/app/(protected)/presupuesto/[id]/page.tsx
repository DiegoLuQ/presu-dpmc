'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import {
    ArrowLeft, CheckCircle, XCircle, Clock, Loader2,
    Download, User, Calendar, DollarSign, Check, X, AlertCircle, AlertTriangle, Package, Building2, SlidersHorizontal, RotateCcw, Users,
    Search, FileDown, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Edit3, HelpCircle
} from 'lucide-react';
import { BudgetRequest, BudgetDetail } from '@/lib/types';
import * as XLSX from 'xlsx';
import { FiltroMultiSelectGenerico } from '@/components/presupuesto/FiltroMultiSelectGenerico';
import { DESTINOS, destinoCanonico, etiquetaDestino } from '@/lib/destinos';

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

export default function DetalleSolicitudPage() {
    const { user, tienePermiso, puedeSeccion, setSidebarCollapsed } = useAuth();
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;

    // Colapsar automáticamente el sidebar al entrar al detalle de solicitud
    useEffect(() => {
        setSidebarCollapsed(true);
    }, [setSidebarCollapsed]);

    const [solicitud, setSolicitud] = useState<BudgetRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [solicitudActionLoading, setSolicitudActionLoading] = useState(false);
    const [pedidosPendientes, setPedidosPendientes] = useState<number>(0);

    // Filtros de búsqueda, estado y filtros avanzados con multiselección
    const [filtroTexto, setFiltroTexto] = useState('');
    const [filtroEstado, setFiltroEstado] = useState<'todos' | 'Sin Revisar' | 'Aprobado' | 'Rechazado' | 'Pendiente' | 'Con Ajustes' | 'Aprobado con Ajustes'>('todos');
    const [filtroMeses, setFiltroMeses] = useState<string[]>([]);
    const [filtroDestinos, setFiltroDestinos] = useState<string[]>([]);
    const [filtroMotivos, setFiltroMotivos] = useState<string[]>([]);
    const [filtroDimensiones, setFiltroDimensiones] = useState<string[]>([]);
    const [filtroActividades, setFiltroActividades] = useState<string[]>([]);
    const [filtroSubvencion, setFiltroSubvencion] = useState<string>('todos');
    const [paginaActual, setPaginaActual] = useState(1);
    const [pageSize, setPageSize] = useState<number>(50);

    // Selección masiva de filas
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [bulkLoading, setBulkLoading] = useState(false);

    // Modal de Aprobado con Ajustes (comentario)
    const [ajusteDetalle, setAjusteDetalle] = useState<BudgetDetail | null>(null);
    const [ajusteComentario, setAjusteComentario] = useState('');

    // Modal para Modificar Cantidad (específico cuando la fila está Con Ajustes)
    const [cantModDetalle, setCantModDetalle] = useState<BudgetDetail | null>(null);
    const [cantModValor, setCantModValor] = useState<number | string>('');

    useEffect(() => {
        setPaginaActual(1);
    }, [filtroTexto, filtroEstado, filtroMeses, filtroDestinos, filtroMotivos, filtroDimensiones, filtroActividades, filtroSubvencion, pageSize]);

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

    const fetchSolicitud = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const response = await api.get(`/presupuesto/solicitudes/${id}`);
            setSolicitud(response.data);
        } catch (error) {
            console.error('Error fetching solicitud:', error);
            if (!silent) router.push('/presupuesto/mis-solicitudes');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [id, router]);

    const handleBulkEstado = async (nuevoEstado: string) => {
        if (selectedIds.length === 0) return;
        try {
            setBulkLoading(true);
            await Promise.all(
                selectedIds.map(idDet => api.patch(`/presupuesto/detalles/${idDet}/estado?nuevo_estado=${nuevoEstado}`))
            );
            await fetchSolicitud(true);
            setSelectedIds([]);
        } catch (e) {
            console.error('Error actualizando estados masivos:', e);
            alert('Hubo un error al actualizar los ítems seleccionados.');
        } finally {
            setBulkLoading(false);
        }
    };

    useEffect(() => {
        fetchSolicitud();
    }, [fetchSolicitud]);

    // Contador de pedidos pendientes de revisar (convocatorias de esta solicitud).
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get(`/convocatorias?id_presupuesto=${id}`);
                const total = (res.data || []).reduce((acc: number, c: any) => acc + (c.pedidos_pendientes || 0), 0);
                setPedidosPendientes(total);
            } catch {
                /* sin convocatorias */
            }
        })();
    }, [id]);





    const updateDetalleEstado = async (detalleId: number, nuevoEstado: string, comentario?: string) => {
        try {
            setActionLoading(detalleId);
            const params = new URLSearchParams({ nuevo_estado: nuevoEstado });
            if (comentario) params.set('comentario', comentario);
            await api.patch(`/presupuesto/detalles/${detalleId}/estado?${params.toString()}`);
            await fetchSolicitud(true); // refetch silencioso (sin recargar la pantalla)
        } catch (error) {
            console.error('Error actualizando estado:', error);
        } finally {
            setActionLoading(null);
        }
    };

    // Subvenciones disponibles y actualización de subvención por detalle
    const [subvenciones, setSubvenciones] = useState<any[]>([]);
    const [updatingSubvId, setUpdatingSubvId] = useState<number | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/presupuesto/subvenciones/activas');
                setSubvenciones(res.data || []);
            } catch (e) {
                console.error('Error cargando subvenciones:', e);
            }
        })();
    }, []);

    const updateDetalleSubvencion = async (detalleId: number, idSubvencion: number) => {
        try {
            setUpdatingSubvId(detalleId);
            await api.put(`/presupuesto/detalles/${detalleId}`, { id_subvencion: idSubvencion });
            await fetchSolicitud(true);
        } catch (error) {
            console.error('Error actualizando subvención:', error);
        } finally {
            setUpdatingSubvId(null);
        }
    };

    const [updatingCantidadId, setUpdatingCantidadId] = useState<number | null>(null);

    const updateDetalleCantidad = async (detalle: BudgetDetail, nuevaCantidad: number) => {
        if (isNaN(nuevaCantidad) || nuevaCantidad <= 0) return;
        try {
            setUpdatingCantidadId(detalle.id_pre_detalle);
            const valorUnitarioIva = Number(detalle.valor_unitario_iva) || 0;
            const nuevoTotalIva = nuevaCantidad * valorUnitarioIva;
            const valorUnitario = Number(detalle.valor_unitario) || 0;
            
            await api.put(`/presupuesto/detalles/${detalle.id_pre_detalle}`, {
                cantidad: nuevaCantidad,
                total_iva: nuevoTotalIva,
                valor_unitario: valorUnitario,
                valor_unitario_iva: valorUnitarioIva
            });
            await fetchSolicitud(true);
        } catch (error) {
            console.error('Error actualizando cantidad:', error);
            alert('No se pudo actualizar la cantidad del detalle.');
        } finally {
            setUpdatingCantidadId(null);
        }
    };

    // Modal de rechazo con motivo
    const [rechazoDetalle, setRechazoDetalle] = useState<BudgetDetail | null>(null);
    const [rechazoComentario, setRechazoComentario] = useState('');
    const [motivosRechazo, setMotivosRechazo] = useState<string[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/catalogos/config/motivos_rechazo');
                if (Array.isArray(res.data?.valor) && res.data.valor.length > 0) setMotivosRechazo(res.data.valor);
                else setMotivosRechazo(['Ya se pidió', 'Fuera del presupuesto', 'No es necesario']);
            } catch {
                setMotivosRechazo(['Ya se pidió', 'Fuera del presupuesto', 'No es necesario']);
            }
        })();
    }, []);

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

    const [modalConfirmacionAprobar, setModalConfirmacionAprobar] = useState(false);
    const [showModalInsumosList, setShowModalInsumosList] = useState(false);

    const updateSolicitudEstado = async (nuevoEstado: string) => {
        try {
            setSolicitudActionLoading(true);
            await api.patch(`/presupuesto/solicitudes/${id}/estado?nuevo_estado=${nuevoEstado}`);
            await fetchSolicitud(true); // refetch silencioso (sin recargar la pantalla)
        } catch (error) {
            console.error('Error actualizando estado de solicitud:', error);
        } finally {
            setSolicitudActionLoading(false);
        }
    };

    const handleConfirmarAprobacion = async () => {
        setModalConfirmacionAprobar(false);
        await updateSolicitudEstado('Aceptado');
    };

    const formatCLP = (value: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value);
    };

    const labelFecha = (det: BudgetDetail) => {
        if (det.fecha_ejecucion) {
            const parts = det.fecha_ejecucion.split('-');
            if (parts.length >= 2) {
                const mesNum = parts[1];
                const mesObj = MESES.find(m => m.value === mesNum);
                if (mesObj) return mesObj.label;
            }
            try {
                const dateObj = new Date(det.fecha_ejecucion);
                if (!isNaN(dateObj.getTime())) {
                    return dateObj.toLocaleDateString('es-CL', { month: 'long' });
                }
            } catch {}
        }
        return det.tipo_fecha || 'N/A';
    };

    const getStatusStyle = (estado: string) => {
        const norm = !estado ? 'Sin Revisar' : estado;
        switch (norm) {
            case 'Aprobado':
            case 'Aceptado':
                return { icon: CheckCircle, iconColor: 'text-green-600', bgColor: 'bg-green-100 border border-green-200', txColor: 'text-green-800', label: 'Aprobado' };
            case 'Con Ajustes':
            case 'Aprobado con Ajustes':
            case 'Aprobado con ajustes':
                return { icon: Edit3, iconColor: 'text-indigo-600', bgColor: 'bg-indigo-100 border border-indigo-200', txColor: 'text-indigo-900', label: 'Con Ajustes' };
            case 'Rechazado':
                return { icon: XCircle, iconColor: 'text-red-600', bgColor: 'bg-red-100 border border-red-200', txColor: 'text-red-800', label: 'Rechazado' };
            case 'Pendiente':
                return { icon: Clock, iconColor: 'text-amber-600', bgColor: 'bg-amber-100 border border-amber-200', txColor: 'text-amber-800', label: 'Pendiente' };
            case 'Sin Revisar':
            default:
                return { icon: HelpCircle, iconColor: 'text-slate-500', bgColor: 'bg-slate-100 border border-slate-200', txColor: 'text-slate-700', label: 'Sin Revisar' };
        }
    };

    const exportToExcel = () => {
        if (!solicitud) return;

        const data = solicitud.detalles.map((d, i) => ({
            '#': i + 1,
            'Producto / Insumo': d.nombre_producto,
            'Descripción': d.descripcion || '',
            'Categoría': d.categoria_nombre || '',
            'Formato': d.formato_unidad,
            'Cantidad': d.cantidad,
            'Valor Unit. (IVA)': d.valor_unitario_iva,
            'Total (IVA)': d.total_iva,
            'Fecha / Período': labelFecha(d),
            'Motivo / Justificación': d.motivo || '',
            'Actividad PME': d.actividad_nombre || '',
            'Subvención': (d as any).subvencion_nombre || 'GENERAL',
            'Estado': d.estado_aprobacion
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Detalle Solicitud');
        const codigoSol = (solicitud as any).codigo || `Solicitud_${id}`;
        XLSX.writeFile(wb, `solicitud_${codigoSol}_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-primary" size={40} />
                    <p className="text-gray-500 font-medium">Cargando solicitud...</p>
                </div>
            </div>
        );
    }

    if (!solicitud) {
        return null;
    }

    const statusStyle = getStatusStyle(solicitud.estado);
    const StatusIcon = statusStyle.icon;

    const totalAprobado = solicitud.detalles
        .filter(d => d.estado_aprobacion === 'Aprobado')
        .reduce((acc, d) => acc + d.total_iva, 0);

    const totalRechazado = solicitud.detalles
        .filter(d => d.estado_aprobacion === 'Rechazado')
        .reduce((acc, d) => acc + d.total_iva, 0);

    const isMacaya = (solicitud?.colegio_nombre || (solicitud as any)?.colegio?.nombre || '').toLowerCase().includes('macaya');
    const codigoReq = `REQ-${new Date(solicitud.fecha).getFullYear()}-${solicitud.id_presupuesto.toString().padStart(3, '0')}`;
    const colegioNombre = solicitud?.colegio_nombre || (solicitud as any)?.colegio?.nombre || '';

    return (
        <div className="animate-in fade-in duration-500">
            <div className="mb-6">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
                >
                    <ArrowLeft size={20} />
                    <span className="font-medium">Volver</span>
                </button>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                                Solicitud {codigoReq}
                            </h2>
                            {colegioNombre && (
                                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                                    isMacaya 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}>
                                    {colegioNombre}
                                </span>
                            )}
                            <span className={`px-3 py-1 inline-flex items-center text-xs leading-5 font-bold rounded-full ${statusStyle.bgColor} ${statusStyle.txColor}`}>
                                <StatusIcon size={14} className={`mr-1.5 ${statusStyle.iconColor}`} />
                                {statusStyle.label || solicitud.estado}
                            </span>
                        </div>
                        <p className="text-gray-500 mt-1.5 font-medium">
                            {new Date(solicitud.fecha).toLocaleDateString('es-CL', {
                                day: '2-digit', month: 'long', year: 'numeric'
                            })}
                        </p>
                        {/* Resumen inline: solicitante · fecha · insumos · área */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm text-gray-600">
                            <span className="flex items-center gap-1.5">
                                <User size={15} className="text-gray-400" />
                                <span className="font-semibold text-gray-700">{solicitud.user_nombre || 'N/A'}</span>
                            </span>
                            <span className="text-gray-300">•</span>
                            <span className="flex items-center gap-1.5">
                                <Calendar size={15} className="text-gray-400" />
                                {new Date(solicitud.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            <span className="text-gray-300">•</span>
                            <span className="flex items-center gap-1.5">
                                <Package size={15} className="text-gray-400" />
                                <span className="font-semibold text-gray-700">{solicitud.detalles?.length || 0}</span> insumos
                            </span>
                            <span className="text-gray-300">•</span>
                            <span className="flex items-center gap-1.5">
                                <Building2 size={15} className="text-gray-400" />
                                <span className="font-semibold text-gray-700">{solicitud.area_nombre || 'N/A'}</span>
                                {solicitud.subarea_nombre && <span className="text-gray-400">/ {solicitud.subarea_nombre}</span>}
                                {(solicitud as any).area_jefe_nombre && (
                                    <span className="text-xs text-gray-500 ml-1">
                                        (Jefe: <span className="font-medium text-gray-600">{(solicitud as any).area_jefe_nombre}</span>)
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push(`/presupuesto/${id}/convocatorias`)}
                            className="relative bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-semibold border border-gray-200 flex items-center gap-2 transition-all text-xs"
                            title="Solicitar pedidos a cargos"
                        >
                            <Users size={16} />
                            Convocatorias
                            {pedidosPendientes > 0 && (
                                <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[11px] font-bold text-white bg-orange-500 rounded-full">
                                    {pedidosPendientes}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={exportToExcel}
                            className={`flex items-center gap-1.5 bg-white hover:bg-gray-50 px-4 py-2.5 rounded-xl font-bold border transition-all text-xs shadow-xs active:scale-95 ${
                                isMacaya ? 'border-emerald-200 hover:border-emerald-300 text-emerald-800' : 'border-blue-200 hover:border-blue-300 text-blue-800'
                            }`}
                            title="Exportar toda la solicitud a Excel"
                        >
                            <FileDown size={16} />
                            Exportar Excel
                        </button>
                    </div>
                </div>
            </div>
                      {(() => {
                const isMacaya = (solicitud?.colegio_nombre || (solicitud as any)?.colegio?.nombre || '').toLowerCase().includes('macaya');
                const codigoReq = `REQ-${new Date(solicitud.fecha).getFullYear()}-${solicitud.id_presupuesto.toString().padStart(3, '0')}`;

                // 1. Opciones Filtro Meses
                const countsMeses = new Map<string, number>();
                let sinMesCount = 0;
                (solicitud.detalles || []).forEach(d => {
                    const m = (d as any).mes_ejecucion || (d.fecha_ejecucion ? d.fecha_ejecucion.substring(5, 7) : '');
                    if (m && MESES.some(mes => mes.value === m)) {
                        countsMeses.set(m, (countsMeses.get(m) || 0) + 1);
                    } else {
                        sinMesCount++;
                    }
                });
                const opcionesFiltroMeses = MESES.map(m => ({
                    valor: m.value,
                    label: m.label,
                    count: countsMeses.get(m.value) || 0
                }));

                // 2. Opciones Filtro Destinos
                const countsDestinos = new Map<string, number>();
                let sinDestinoCount = 0;
                (solicitud.detalles || []).forEach(d => {
                    const dest = destinoCanonico(d.destino_gasto);
                    if (dest) {
                        countsDestinos.set(dest, (countsDestinos.get(dest) || 0) + 1);
                    } else {
                        sinDestinoCount++;
                    }
                });
                const opcionesFiltroDestinos = DESTINOS.map(d => ({
                    valor: d.valor,
                    label: d.label,
                    count: countsDestinos.get(d.valor) || 0
                }));

                // 3. Opciones Filtro Motivos / Justificación
                const countsMotivos = new Map<string, number>();
                let sinMotivoCount = 0;
                (solicitud.detalles || []).forEach(d => {
                    const m = (d.motivo || '').trim();
                    if (m) {
                        countsMotivos.set(m, (countsMotivos.get(m) || 0) + 1);
                    } else {
                        sinMotivoCount++;
                    }
                });
                const opcionesFiltroMotivos = Array.from(countsMotivos.entries())
                    .map(([motivo, count]) => ({ valor: motivo, label: motivo, count }))
                    .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));

                // 4. Opciones Filtro Dimensiones PME
                const DIM_BASE = ['Gestión Pedagógica', 'Convivencia Escolar', 'Liderazgo', 'Gestión de Recursos'];
                const countsDimensiones = new Map<string, number>();
                let sinDimensionCount = 0;
                (solicitud.detalles || []).forEach(d => {
                    const dim = ((d as any).dimension || (d as any).actividad_dimension || '').trim();
                    if (dim) {
                        const match = DIM_BASE.find(b => dim.toLowerCase().includes(b.toLowerCase())) || dim;
                        countsDimensiones.set(match, (countsDimensiones.get(match) || 0) + 1);
                    } else {
                        sinDimensionCount++;
                    }
                });
                const opcionesFiltroDimensiones = DIM_BASE.map(d => ({
                    valor: d,
                    label: d,
                    count: countsDimensiones.get(d) || 0
                }));
                Array.from(countsDimensiones.keys()).forEach(k => {
                    if (!DIM_BASE.includes(k)) {
                        opcionesFiltroDimensiones.push({ valor: k, label: k, count: countsDimensiones.get(k) || 0 });
                    }
                });

                // 5. Opciones Filtro Actividades PME
                const countsActividades = new Map<string, { label: string; count: number }>();
                let sinActividadCount = 0;
                (solicitud.detalles || []).forEach(d => {
                    const actId = d.id_actividad ? String(d.id_actividad) : '';
                    const actNom = (d.actividad_nombre || '').trim();
                    const key = actId || actNom;
                    if (key) {
                        const prev = countsActividades.get(key) || { label: actNom || `Actividad #${actId}`, count: 0 };
                        countsActividades.set(key, { label: prev.label, count: prev.count + 1 });
                    } else {
                        sinActividadCount++;
                    }
                });
                const opcionesFiltroActividades = Array.from(countsActividades.entries()).map(([valor, { label, count }]) => ({
                    valor,
                    label,
                    count
                })).sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));

                // Normalizar estado
                const estadoNormal = (d: any) => {
                    const e = (d.estado_aprobacion || '').trim();
                    if (!e) return 'Sin Revisar';
                    if (e === 'Aprobado con Ajustes' || e === 'Aprobado con ajustes') return 'Con Ajustes';
                    return e;
                };

                const q = filtroTexto.trim().toLowerCase();

                // Conjunto base con todos los filtros excepto filtroEstado
                const itemsBase = (solicitud.detalles || []).filter(det => {
                    const matchTexto = !q
                        || det.nombre_producto.toLowerCase().includes(q)
                        || (det.descripcion || '').toLowerCase().includes(q)
                        || (det.motivo || '').toLowerCase().includes(q)
                        || (det.categoria_nombre || '').toLowerCase().includes(q);

                    // 1. Mes
                    let matchMes = true;
                    if (filtroMeses.length > 0) {
                        const m = (det as any).mes_ejecucion || (det.fecha_ejecucion ? det.fecha_ejecucion.substring(5, 7) : '');
                        const tieneMes = Boolean(m && MESES.some(mes => mes.value === m));
                        const coincideMes = tieneMes && filtroMeses.includes(m);
                        const coincideSinMes = !tieneMes && filtroMeses.includes('__SIN_MES__');
                        matchMes = coincideMes || coincideSinMes;
                    }

                    // 2. Destino
                    let matchDestino = true;
                    if (filtroDestinos.length > 0) {
                        const dest = destinoCanonico(det.destino_gasto);
                        const tieneDestino = Boolean(dest);
                        const coincideDestino = tieneDestino && filtroDestinos.includes(dest);
                        const coincideSinDestino = !tieneDestino && filtroDestinos.includes('__SIN_DESTINO__');
                        matchDestino = coincideDestino || coincideSinDestino;
                    }

                    // 3. Motivo
                    let matchMotivo = true;
                    if (filtroMotivos.length > 0) {
                        const m = (det.motivo || '').trim();
                        const tieneMotivo = Boolean(m);
                        const coincideMotivo = tieneMotivo && filtroMotivos.includes(m);
                        const coincideSinMotivo = !tieneMotivo && filtroMotivos.includes('__SIN_MOTIVO__');
                        matchMotivo = coincideMotivo || coincideSinMotivo;
                    }

                    // 4. Dimension PME
                    let matchDimension = true;
                    if (filtroDimensiones.length > 0) {
                        const dim = ((det as any).dimension || (det as any).actividad_dimension || '').trim();
                        const matchBase = DIM_BASE.find(b => dim.toLowerCase().includes(b.toLowerCase())) || dim;
                        const tieneDim = Boolean(matchBase);
                        const coincideDim = tieneDim && filtroDimensiones.includes(matchBase);
                        const coincideSinDim = !tieneDim && filtroDimensiones.includes('__SIN_DIMENSION__');
                        matchDimension = coincideDim || coincideSinDim;
                    }

                    // 5. Actividad PME
                    let matchActividad = true;
                    if (filtroActividades.length > 0) {
                        const actId = det.id_actividad ? String(det.id_actividad) : '';
                        const actNom = (det.actividad_nombre || '').trim();
                        const tieneAct = Boolean(actId || actNom);
                        const coincideAct = tieneAct && (
                            (actId && filtroActividades.includes(actId)) ||
                            (actNom && filtroActividades.includes(actNom))
                        );
                        const coincideSinAct = !tieneAct && filtroActividades.includes('__SIN_ACTIVIDAD__');
                        matchActividad = coincideAct || coincideSinAct;
                    }

                    // Subvención
                    const subNom = (det as any).subvencion_nombre || (det as any).subvencion?.nombre_corto || 'GENERAL';
                    const matchSubvencion = filtroSubvencion === 'todos' || subNom.toLowerCase().trim() === filtroSubvencion.toLowerCase().trim();

                    return matchTexto && matchMes && matchDestino && matchMotivo && matchDimension && matchActividad && matchSubvencion;
                });

                // Filtrar según estado seleccionado
                const detallesFiltrados = itemsBase.filter(det => {
                    return filtroEstado === 'todos' || estadoNormal(det) === filtroEstado;
                });

                // Métricas dinámicas calculadas a partir de los detalles filtrados (matching solicitudes/page.tsx)
                const totalSolicitado = detallesFiltrados.reduce((acc: number, d: any) => acc + (d.total_iva || 0), 0);

                const itemsAprobados = detallesFiltrados.filter((d: any) => d.estado_aprobacion === 'Aprobado' || d.estado_aprobacion === 'Aceptado');
                const totalAprobado = itemsAprobados.reduce((acc: number, d: any) => acc + (d.total_iva || 0), 0);

                const itemsConAjustes = detallesFiltrados.filter((d: any) => d.estado_aprobacion === 'Con Ajustes' || d.estado_aprobacion === 'Aprobado con Ajustes' || d.estado_aprobacion === 'Aprobado con ajustes');
                const totalConAjustes = itemsConAjustes.reduce((acc: number, d: any) => acc + (d.total_iva || 0), 0);

                const itemsSinRevisar = detallesFiltrados.filter((d: any) => !d.estado_aprobacion || d.estado_aprobacion === 'Sin Revisar');
                const totalSinRevisar = itemsSinRevisar.reduce((acc: number, d: any) => acc + (d.total_iva || 0), 0);

                const itemsPendientes = detallesFiltrados.filter((d: any) => d.estado_aprobacion === 'Pendiente');
                const totalPendiente = itemsPendientes.reduce((acc: number, d: any) => acc + (d.total_iva || 0), 0);

                const itemsRechazados = detallesFiltrados.filter((d: any) => d.estado_aprobacion === 'Rechazado');
                const totalRechazado = itemsRechazados.reduce((acc: number, d: any) => acc + (d.total_iva || 0), 0);

                const pctAprobado = totalSolicitado > 0 ? (totalAprobado / totalSolicitado) * 100 : 0;
                const pctConAjustes = totalSolicitado > 0 ? (totalConAjustes / totalSolicitado) * 100 : 0;
                const pctSinRevisar = totalSolicitado > 0 ? (totalSinRevisar / totalSolicitado) * 100 : 0;
                const pctPendiente = totalSolicitado > 0 ? (totalPendiente / totalSolicitado) * 100 : 0;
                const pctRechazado = totalSolicitado > 0 ? (totalRechazado / totalSolicitado) * 100 : 0;

                // Desglose por subvención (Aprobado / Ajustado / Sin Revisar / Pendiente)
                const totalesSubv = detallesFiltrados.reduce((acc: Record<string, { aprobado: number; ajustado: number; sin_revisar: number; pendiente: number }>, d: any) => {
                    const name = d.subvencion_nombre || (d as any).subvencion?.nombre_corto || 'GENERAL';
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
                        acc[name].sin_revisar += (d.total_iva || 0);
                    }
                    return acc;
                }, {});

                const conteosPorEstado: Record<string, number> = {
                    todos: itemsBase.length,
                    'Sin Revisar': itemsBase.filter(d => estadoNormal(d) === 'Sin Revisar').length,
                    Aprobado: itemsBase.filter(d => estadoNormal(d) === 'Aprobado' || estadoNormal(d) === 'Aceptado').length,
                    'Con Ajustes': itemsBase.filter(d => estadoNormal(d) === 'Con Ajustes').length,
                    Pendiente: itemsBase.filter(d => estadoNormal(d) === 'Pendiente').length,
                    Rechazado: itemsBase.filter(d => estadoNormal(d) === 'Rechazado').length,
                };

                const totalPaginas = Math.ceil(detallesFiltrados.length / pageSize) || 1;
                const detallesPaginados = detallesFiltrados.slice(
                    (paginaActual - 1) * pageSize,
                    paginaActual * pageSize
                );

                const filtroActivo = filtroTexto.trim() !== ''
                    || filtroEstado !== 'todos'
                    || filtroMeses.length > 0
                    || filtroDestinos.length > 0
                    || filtroMotivos.length > 0
                    || filtroDimensiones.length > 0
                    || filtroActividades.length > 0
                    || filtroSubvencion !== 'todos';

                const totalFiltrosActivos = (filtroTexto.trim() !== '' ? 1 : 0)
                    + (filtroEstado !== 'todos' ? 1 : 0)
                    + filtroMeses.length
                    + filtroDestinos.length
                    + filtroMotivos.length
                    + filtroDimensiones.length
                    + filtroActividades.length
                    + (filtroSubvencion !== 'todos' ? 1 : 0);

                const limpiarTodosFiltros = () => {
                    setFiltroTexto('');
                    setFiltroEstado('todos');
                    setFiltroMeses([]);
                    setFiltroDestinos([]);
                    setFiltroMotivos([]);
                    setFiltroDimensiones([]);
                    setFiltroActividades([]);
                    setFiltroSubvencion('todos');
                };

                return (
                    <>
                        {/* SECCIÓN CARDS: Fila 1 (7 Métricas Clave con click-to-filter interactivo) */}
                        <div className="space-y-4 mb-6">
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                                {/* 1. Total Solicitado */}
                                <div 
                                    onClick={() => setFiltroEstado('todos')}
                                    className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                                        filtroEstado === 'todos'
                                            ? 'border-primary/40 ring-2 ring-primary/10'
                                            : 'border-gray-100 hover:border-gray-200'
                                    }`}
                                    title="Ver todos los recursos"
                                >
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Solicitado</span>
                                    <p className="text-base font-extrabold text-gray-900 mt-1">{formatCLP(totalSolicitado)}</p>
                                    <span className="text-[9px] text-gray-400 font-semibold">{detallesFiltrados.length} recursos</span>
                                </div>

                                {/* 2. Aprobado */}
                                <div 
                                    onClick={() => setFiltroEstado(filtroEstado === 'Aprobado' ? 'todos' : 'Aprobado')}
                                    className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                                        filtroEstado === 'Aprobado'
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
                                    onClick={() => setFiltroEstado(filtroEstado === 'Con Ajustes' ? 'todos' : 'Con Ajustes')}
                                    className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                                        filtroEstado === 'Con Ajustes'
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
                                    onClick={() => setFiltroEstado(filtroEstado === 'Sin Revisar' ? 'todos' : 'Sin Revisar')}
                                    className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                                        filtroEstado === 'Sin Revisar'
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
                                    onClick={() => setFiltroEstado(filtroEstado === 'Pendiente' ? 'todos' : 'Pendiente')}
                                    className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                                        filtroEstado === 'Pendiente'
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
                                    onClick={() => setFiltroEstado(filtroEstado === 'Rechazado' ? 'todos' : 'Rechazado')}
                                    className={`bg-white rounded-xl p-3.5 shadow-sm border transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                                        filtroEstado === 'Rechazado'
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

                            {/* SECCIÓN CARDS: Fila 2 (Desglose de Inversión por Subvención con click-to-filter) */}
                            {Object.keys(totalesSubv).length > 0 && (
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1">Subvenciones (Aprobado / Ajustado / Sin Revisar / Pendiente)</span>
                                    <div className="flex flex-wrap gap-3">
                                        {Object.entries(totalesSubv).map(([subvName, data]) => {
                                            const isSelectedSubv = filtroSubvencion.toLowerCase() === subvName.toLowerCase();
                                            return (
                                                <div 
                                                    key={subvName} 
                                                    onClick={() => setFiltroSubvencion(isSelectedSubv ? 'todos' : subvName)}
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

                        {canApprove && (solicitud.estado === 'Pendiente' || solicitud.estado === 'Enviado') && (
                            <div className="bg-amber-50 border border-amber-200 rounded-[20px] p-5 mb-6">
                                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                                    <div className="flex items-center gap-3">
                                        <AlertCircle size={24} className="text-amber-600" />
                                        <div>
                                            <p className="font-semibold text-amber-800">Acciones de Aprobación de la Solicitud</p>
                                            <p className="text-sm text-amber-600">Aprueba o rechaza globalmente el requerimiento enviado para revisión</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => {
                                                setShowModalInsumosList(false);
                                                setModalConfirmacionAprobar(true);
                                            }}
                                            disabled={solicitudActionLoading}
                                            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
                                        >
                                            {solicitudActionLoading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                            Aprobar Solicitud
                                        </button>
                                        <button
                                            onClick={() => updateSolicitudEstado('Rechazado')}
                                            disabled={solicitudActionLoading}
                                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
                                        >
                                            {solicitudActionLoading ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
                                            Rechazar Solicitud
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {canApprove && (solicitud.estado === 'Aprobado' || solicitud.estado === 'Aceptado' || solicitud.estado === 'Rechazado') && (
                            <div className="bg-slate-50 border border-slate-200 rounded-[20px] p-4 mb-6 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2.5 text-xs text-gray-600 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    <span>Esta solicitud se encuentra en estado <strong>{solicitud.estado}</strong>. Puedes revertirla a revisión si necesitas hacer modificaciones.</span>
                                </div>
                                <button
                                    onClick={() => updateSolicitudEstado('Pendiente')}
                                    disabled={solicitudActionLoading}
                                    className="px-4 py-2 bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs shrink-0 cursor-pointer active:scale-95 disabled:opacity-50"
                                    title="Volver solicitud a estado Pendiente"
                                >
                                    <RotateCcw size={14} /> Revertir a Pendiente
                                </button>
                            </div>
                        )}

                        {solicitud.comentario && (
                            <div className="bg-gray-50 border border-gray-200 rounded-[20px] p-5 mb-6">
                                <p className="text-sm font-semibold text-gray-700 mb-1">Comentario:</p>
                                <p className="text-gray-600">{solicitud.comentario}</p>
                            </div>
                        )}

                        {/* CONTENEDOR PRINCIPAL DE RECURSOS: IDÉNTICO A SOLICITUDES/PAGE.TSX MODO RECURSOS */}
                        <div className={`bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border overflow-hidden mb-6 ${
                            isMacaya ? 'border-emerald-200/80' : 'border-blue-200/80'
                        }`}>
                            {/* Barra de Filtros Integrada */}
                            <div className="p-4 border-b border-gray-100 bg-slate-50/50 space-y-3">
                                {/* Fila 1: Buscador Principal + Pills de Estado + Botón Limpiar Filtros + Contador */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
                                    <div className="relative flex-1 min-w-[260px] max-w-md">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                        <input
                                            type="text"
                                            placeholder="Buscar por insumo, descripción o motivo..."
                                            value={filtroTexto}
                                            onChange={(e) => setFiltroTexto(e.target.value)}
                                            className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
                                        />
                                        {filtroTexto && (
                                            <button onClick={() => setFiltroTexto('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-lg hover:bg-gray-100 transition-all" title="Limpiar">
                                                <X size={13} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                                        {/* Segmented Control de Estados (Pills) con conteo y % */}
                                        <div className="inline-flex bg-gray-200/60 p-1 rounded-xl border border-gray-200/80 shadow-inner flex-wrap gap-1">
                                            {[
                                                { k: 'todos', l: 'Todos' },
                                                { k: 'Sin Revisar', l: 'Sin Revisar' },
                                                { k: 'Aprobado', l: 'Aprobados' },
                                                { k: 'Con Ajustes', l: 'Con Ajustes' },
                                                { k: 'Pendiente', l: 'Pendientes' },
                                                { k: 'Rechazado', l: 'Rechazados' }
                                            ].map(op => {
                                                const count = conteosPorEstado[op.k] || 0;
                                                const total = conteosPorEstado.todos || 1;
                                                const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
                                                const isSelected = filtroEstado === op.k;
                                                return (
                                                    <button
                                                        key={op.k}
                                                        type="button"
                                                        onClick={() => setFiltroEstado(op.k as any)}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                                                            isSelected
                                                                ? 'bg-white text-primary shadow-xs ring-1 ring-black/5'
                                                                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                                                        }`}
                                                    >
                                                        <span>{op.l}</span>
                                                        <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black transition-colors ${
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

                                        {/* Botón unificado Limpiar Filtros */}
                                        <button
                                            type="button"
                                            onClick={limpiarTodosFiltros}
                                            disabled={!filtroActivo}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                                filtroActivo
                                                    ? 'text-rose-600 bg-rose-50 hover:bg-rose-100/90 border border-rose-200 cursor-pointer shadow-xs active:scale-95'
                                                    : 'text-gray-300 bg-gray-50/70 border border-gray-200/50 cursor-not-allowed opacity-50'
                                            }`}
                                            title={filtroActivo ? 'Restablecer todos los filtros' : 'No hay filtros activos para limpiar'}
                                        >
                                            <RotateCcw size={13} className="shrink-0" />
                                            <span>Limpiar filtros</span>
                                            {totalFiltrosActivos > 0 && (
                                                <span className="px-1.5 py-0.5 rounded-full bg-rose-200 text-rose-800 text-[10px] font-black leading-none">
                                                    {totalFiltrosActivos}
                                                </span>
                                            )}
                                        </button>

                                        {/* Contador de insumos */}
                                        <div className={`px-3 py-1.5 rounded-xl border shadow-2xs font-extrabold text-xs shrink-0 ${
                                            isMacaya 
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                                                : 'bg-blue-50 border-blue-200 text-blue-700'
                                        }`}>
                                            {filtroActivo ? `${detallesFiltrados.length} de ${solicitud.detalles?.length || 0}` : `${solicitud.detalles?.length || 0}`} insumos
                                        </div>
                                    </div>
                                </div>

                                {/* Fila 2: Filtros Avanzados con selección múltiple: Mes, Destino, Motivo, Dimensión PME, Actividad PME */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-gray-200/60">
                                    {/* 1. Filtro Meses */}
                                    <FiltroMultiSelectGenerico
                                        icono="🗓️"
                                        tituloVacio="Todos los Meses"
                                        tituloPlural="Meses"
                                        seleccionados={filtroMeses}
                                        onChange={setFiltroMeses}
                                        opciones={opcionesFiltroMeses}
                                        opcionSinValor={sinMesCount > 0 ? {
                                            valorEspecial: '__SIN_MES__',
                                            label: '— Sin mes asignado —',
                                            count: sinMesCount
                                        } : undefined}
                                        placeholderBusqueda="Buscar mes..."
                                    />

                                    {/* 2. Filtro Destinos */}
                                    <FiltroMultiSelectGenerico
                                        icono="🎯"
                                        tituloVacio="Todos los Destinos"
                                        tituloPlural="Destinos"
                                        seleccionados={filtroDestinos}
                                        onChange={setFiltroDestinos}
                                        opciones={opcionesFiltroDestinos}
                                        opcionSinValor={sinDestinoCount > 0 ? {
                                            valorEspecial: '__SIN_DESTINO__',
                                            label: '— Sin destino asignado —',
                                            count: sinDestinoCount
                                        } : undefined}
                                        placeholderBusqueda="Buscar destino..."
                                    />

                                    {/* 3. Filtro Justificación / Motivo */}
                                    <FiltroMultiSelectGenerico
                                        icono="🏷️"
                                        tituloVacio="Todas las Justificaciones"
                                        tituloPlural="Justificaciones"
                                        seleccionados={filtroMotivos}
                                        onChange={setFiltroMotivos}
                                        opciones={opcionesFiltroMotivos}
                                        opcionSinValor={sinMotivoCount > 0 ? {
                                            valorEspecial: '__SIN_MOTIVO__',
                                            label: '— Sin justificación —',
                                            count: sinMotivoCount
                                        } : undefined}
                                        placeholderBusqueda="Buscar justificación..."
                                    />

                                    {/* 4. Filtro Dimensiones PME */}
                                    <FiltroMultiSelectGenerico
                                        icono="🏫"
                                        tituloVacio="Todas las Dimensiones"
                                        tituloPlural="Dimensiones"
                                        seleccionados={filtroDimensiones}
                                        onChange={setFiltroDimensiones}
                                        opciones={opcionesFiltroDimensiones}
                                        opcionSinValor={sinDimensionCount > 0 ? {
                                            valorEspecial: '__SIN_DIMENSION__',
                                            label: '— Sin dimensión PME —',
                                            count: sinDimensionCount
                                        } : undefined}
                                        placeholderBusqueda="Buscar dimensión..."
                                    />

                                    {/* 5. Filtro Actividades PME */}
                                    <FiltroMultiSelectGenerico
                                        icono="📌"
                                        tituloVacio={`Todas las Actividades (${opcionesFiltroActividades.length})`}
                                        tituloPlural="Actividades"
                                        seleccionados={filtroActividades}
                                        onChange={setFiltroActividades}
                                        opciones={opcionesFiltroActividades}
                                        opcionSinValor={sinActividadCount > 0 ? {
                                            valorEspecial: '__SIN_ACTIVIDAD__',
                                            label: '— Sin actividad PME —',
                                            count: sinActividadCount
                                        } : undefined}
                                        placeholderBusqueda="Buscar actividad PME..."
                                    />
                                </div>
                            </div>

                            {/* TABLA CONSOLIDADA DE RECURSOS */}
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-100">
                                    <thead className="bg-gray-50/50">
                                        <tr>
                                            <th className="px-3.5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase">
                                                <div className="flex items-center gap-2">
                                                    {canApprove && (
                                                        <input
                                                            type="checkbox"
                                                            checked={detallesPaginados.length > 0 && detallesPaginados.every(d => selectedIds.includes(d.id_pre_detalle))}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    const pageIds = detallesPaginados.map(d => d.id_pre_detalle);
                                                                    setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
                                                                } else {
                                                                    const pageIds = new Set(detallesPaginados.map(d => d.id_pre_detalle));
                                                                    setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
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
                                        {detallesPaginados.length === 0 ? (
                                            <tr>
                                                <td colSpan={canApprove ? 8 : 7} className="px-6 py-12 text-center">
                                                    <div className="flex flex-col items-center gap-2 opacity-40">
                                                        <Search size={32} className="text-gray-400" />
                                                        <p className="text-sm font-bold text-gray-700">Sin resultados para la búsqueda</p>
                                                        {filtroActivo && (
                                                            <button 
                                                                onClick={limpiarTodosFiltros} 
                                                                className="text-xs font-bold text-primary hover:underline cursor-pointer"
                                                            >
                                                                Limpiar filtros
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            detallesPaginados.map((detalle, i) => {
                                                const detStatusStyle = getStatusStyle(detalle.estado_aprobacion);
                                                const DetStatusIcon = detStatusStyle.icon;
                                                const numItem = ((paginaActual - 1) * pageSize) + i + 1;
                                                const isRowSelected = selectedIds.includes(detalle.id_pre_detalle);

                                                return (
                                                    <tr key={detalle.id_pre_detalle} className={`transition-colors ${
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
                                                                            setSelectedIds(prev =>
                                                                                prev.includes(detalle.id_pre_detalle)
                                                                                    ? prev.filter(idDet => idDet !== detalle.id_pre_detalle)
                                                                                    : [...prev, detalle.id_pre_detalle]
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
                                                            <div className="text-xs font-bold text-gray-900 leading-snug">{detalle.nombre_producto}</div>
                                                            {detalle.descripcion && (
                                                                <div className="text-[11px] text-gray-500 whitespace-pre-wrap break-words mt-0.5 leading-relaxed">
                                                                    {detalle.descripcion}
                                                                </div>
                                                            )}
                                                            {detalle.categoria_nombre && (
                                                                <div className="text-[10px] text-gray-400 font-semibold mt-1">
                                                                    {detalle.categoria_nombre}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Área y Solicitante */}
                                                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                                                            <div className="font-semibold text-gray-900 text-xs">{solicitud.area_nombre || 'N/A'}</div>
                                                            <div className="text-[11px] text-gray-500 mt-0.5">
                                                                {solicitud.user_nombre || 'N/A'}
                                                                {solicitud.subarea_nombre && (
                                                                    <span className="font-medium text-primary ml-1">({solicitud.subarea_nombre})</span>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* Cantidad y Valores */}
                                                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                                                            <div className="flex items-center gap-2">
                                                                <div className="text-xs font-semibold text-gray-800">
                                                                    {detalle.cantidad} <span className="text-[11px] font-normal text-gray-500">({detalle.formato_unidad})</span>
                                                                </div>
                                                                {(() => {
                                                                    const esConAjustes = detalle.estado_aprobacion === 'Con Ajustes' || detalle.estado_aprobacion === 'Aprobado con Ajustes' || detalle.estado_aprobacion === 'Aprobado con ajustes';
                                                                    if (!esConAjustes || !canApprove) return null;
                                                                    return (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setCantModDetalle(detalle);
                                                                                setCantModValor(detalle.cantidad);
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
                                                                Unit: {formatCLP(detalle.valor_unitario_iva)}
                                                            </div>
                                                            <div className={`text-xs font-bold mt-0.5 ${isMacaya ? 'text-emerald-700' : 'text-blue-700'}`}>
                                                                Total: {formatCLP(detalle.total_iva)}
                                                            </div>
                                                        </td>

                                                        {/* Mes, Motivo y Actividad PME */}
                                                        <td className="px-3.5 py-3.5 max-w-[280px]">
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md capitalize ${
                                                                    isMacaya ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-blue-50 text-blue-800 border border-blue-200'
                                                                }`}>
                                                                    {labelFecha(detalle)}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                                                                {detalle.motivo || '-'}
                                                            </div>
                                                            {detalle.actividad_nombre && (
                                                                <div className="text-[10px] text-gray-400 mt-1 leading-tight" title={detalle.actividad_nombre}>
                                                                    <span className="font-semibold text-gray-600">PME:</span> {detalle.actividad_nombre}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Subvención con select interactivo */}
                                                        <td className="px-3.5 py-3.5 text-xs whitespace-nowrap">
                                                            <div className="flex items-center gap-1.5">
                                                                {detalle.estado_aprobacion === 'Aprobado' || !canApprove ? (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-bold border border-violet-200">
                                                                        {(detalle as any).subvencion_nombre || (detalle as any).subvencion?.nombre_corto || 'GENERAL'}
                                                                    </span>
                                                                ) : updatingSubvId === detalle.id_pre_detalle ? (
                                                                    <div className="flex items-center gap-1.5 text-xs text-violet-600 font-semibold">
                                                                        <Loader2 size={13} className="animate-spin" /> Guardando...
                                                                    </div>
                                                                ) : (
                                                                    <select
                                                                        value={detalle.id_subvencion || ''}
                                                                        onChange={(e) => {
                                                                            const val = Number(e.target.value);
                                                                            if (val) updateDetalleSubvencion(detalle.id_pre_detalle, val);
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
                                                                {((detalle as any).recurso_estado === 'PENDIENTE_APROBACION' || !(detalle.id_recurso) || (detalle as any).es_sugerido) && (
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

                                                        {/* Estado (con select para gestión rápida) */}
                                                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                                                            {canApprove ? (
                                                                <select
                                                                    value={detalle.estado_aprobacion === 'Aprobado con Ajustes' ? 'Con Ajustes' : (detalle.estado_aprobacion || 'Sin Revisar')}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        if (val === 'Rechazado') {
                                                                            setRechazoComentario(detalle.comentario_revision || '');
                                                                            setRechazoDetalle(detalle);
                                                                        } else if (val === 'Con Ajustes' || val === 'Aprobado con Ajustes') {
                                                                            setAjusteComentario(detalle.comentario_revision || '');
                                                                            setAjusteDetalle(detalle);
                                                                        } else {
                                                                            updateDetalleEstado(detalle.id_pre_detalle, val);
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
                                                                    {detalle.estado_aprobacion || 'Sin Revisar'}
                                                                </span>
                                                            )}

                                                            {detalle.estado_aprobacion === 'Rechazado' && detalle.comentario_revision && (
                                                                <p className="text-[11px] text-red-600 mt-1 max-w-[180px] leading-snug whitespace-normal" title={detalle.comentario_revision}>
                                                                    <span className="font-semibold">Motivo:</span> {detalle.comentario_revision}
                                                                </p>
                                                            )}
                                                            {(detalle.estado_aprobacion === 'Con Ajustes' || detalle.estado_aprobacion === 'Aprobado con Ajustes' || detalle.estado_aprobacion === 'Aprobado con ajustes') && detalle.comentario_revision && (
                                                                <p className="text-[11px] text-indigo-700 font-medium mt-1 max-w-[200px] leading-snug bg-indigo-50/80 p-1.5 rounded-lg border border-indigo-100 whitespace-normal" title={detalle.comentario_revision}>
                                                                    <span className="font-bold text-indigo-900">Ajuste:</span> {detalle.comentario_revision}
                                                                </p>
                                                            )}
                                                        </td>

                                                        {/* Acciones Rápidas */}
                                                        {canApprove && (
                                                            <td className="px-3.5 py-3.5 text-center whitespace-nowrap">
                                                                <div className="flex items-center justify-center gap-1.5">
                                                                    <button
                                                                        onClick={() => updateDetalleEstado(detalle.id_pre_detalle, 'Aprobado')}
                                                                        disabled={actionLoading !== null}
                                                                        className="p-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors border border-green-200 cursor-pointer"
                                                                        title="Aprobar recurso"
                                                                    >
                                                                        {actionLoading === detalle.id_pre_detalle ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                                    </button>

                                                                    <button
                                                                        onClick={() => {
                                                                            setAjusteComentario(detalle.comentario_revision || '');
                                                                            setAjusteDetalle(detalle);
                                                                        }}
                                                                        disabled={actionLoading !== null}
                                                                        className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 cursor-pointer"
                                                                        title="Aprobar con ajustes (indicar observación)"
                                                                    >
                                                                        <Edit3 size={14} />
                                                                    </button>

                                                                    <button
                                                                        onClick={() => {
                                                                            setRechazoComentario(detalle.comentario_revision || '');
                                                                            setRechazoDetalle(detalle);
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
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Paginación con selector de cantidad por página (50, 100, 150, 200) */}
                            {detallesFiltrados.length > 0 && (
                                <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                                    <span className="text-xs text-gray-500 font-medium">
                                        Mostrando {((paginaActual - 1) * pageSize) + 1} a {Math.min(paginaActual * pageSize, detallesFiltrados.length)} de {detallesFiltrados.length} recursos
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                                            <span>Mostrar:</span>
                                            <select
                                                value={pageSize}
                                                onChange={(e) => {
                                                    setPageSize(Number(e.target.value));
                                                    setPaginaActual(1);
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
                                                onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                                                disabled={paginaActual === 1}
                                                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer transition-all"
                                            >
                                                Anterior
                                            </button>
                                            <span className="px-3 py-1.5 text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-lg">
                                                {paginaActual} / {totalPaginas}
                                            </span>
                                            <button
                                                onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
                                                disabled={paginaActual === totalPaginas}
                                                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer transition-all"
                                            >
                                                Siguiente
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Barra Flotante de Acciones Masivas */}
                            {selectedIds.length > 0 && (
                                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-6 py-3.5 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-4 border border-white/10 animate-in fade-in slide-in-from-bottom-5">
                                    <div className="flex items-center gap-2 text-sm font-bold pr-2 border-r border-slate-700">
                                        <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-black">{selectedIds.length}</span>
                                        <span>seleccionados</span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleBulkEstado('Aprobado')}
                                            disabled={bulkLoading}
                                            className="px-3.5 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                                        >
                                            {bulkLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={14} />}
                                            Aprobar ({selectedIds.length})
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleBulkEstado('Pendiente')}
                                            disabled={bulkLoading}
                                            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                                        >
                                            {bulkLoading ? <Loader2 size={13} className="animate-spin" /> : <Clock size={14} />}
                                            Pendiente ({selectedIds.length})
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleBulkEstado('Rechazado')}
                                            disabled={bulkLoading}
                                            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                                        >
                                            {bulkLoading ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={14} />}
                                            Rechazar ({selectedIds.length})
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setSelectedIds([])}
                                        className="text-xs text-slate-400 hover:text-white underline ml-2 cursor-pointer font-medium"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                );
            })()}

            {/* Modal: rechazar recurso con motivo */}
            {rechazoDetalle && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-6 flex items-center gap-4 bg-red-50">
                            <div className="p-3 rounded-xl bg-red-100 text-red-600">
                                <XCircle size={24} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-gray-900">Rechazar recurso</h3>
                                <p className="text-sm text-gray-500 truncate">{rechazoDetalle.nombre_producto}</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-3">
                            <label className="block text-sm font-semibold text-gray-700">Motivo del rechazo</label>
                            {/* Opciones rápidas configurables */}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setRechazoComentario('Sin motivo')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${rechazoComentario === 'Sin motivo' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'}`}
                                >
                                    Sin motivo
                                </button>
                                {motivosRechazo.map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setRechazoComentario(m)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${rechazoComentario === m ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                            <textarea
                                rows={3}
                                value={rechazoComentario}
                                onChange={(e) => setRechazoComentario(e.target.value)}
                                placeholder="Escribe el motivo o elige una opción de arriba..."
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
                                autoFocus
                            />
                        </div>
                        <div className="p-6 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => { setRechazoDetalle(null); setRechazoComentario(''); }}
                                className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmarRechazo}
                                disabled={actionLoading !== null}
                                className="px-4 py-2.5 text-white rounded-xl transition-colors font-medium flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50"
                            >
                                {actionLoading !== null && <Loader2 size={18} className="animate-spin" />}
                                Rechazar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Aprobado con Ajustes */}
            {ajusteDetalle && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 flex items-center gap-4 bg-indigo-50 border-b border-indigo-100">
                            <div className="p-3 rounded-xl bg-indigo-100 text-indigo-600">
                                <Edit3 size={24} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-gray-900">Aprobar con Ajustes</h3>
                                <p className="text-xs text-gray-500 truncate">{ajusteDetalle.nombre_producto}</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-3">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Detalle o indicación del ajuste requerido</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    'Ajustar cantidad',
                                    'Cotizar alternativa económica',
                                    'Cambio de marca / formato',
                                    'Sujeto a disponibilidad'
                                ].map((sug) => (
                                    <button
                                        key={sug}
                                        type="button"
                                        onClick={() => setAjusteComentario(sug)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${ajusteComentario === sug ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}
                                    >
                                        {sug}
                                    </button>
                                ))}
                            </div>
                            <textarea
                                rows={3}
                                value={ajusteComentario}
                                onChange={(e) => setAjusteComentario(e.target.value)}
                                placeholder="Escribe las indicaciones del ajuste para este insumo..."
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-none"
                                autoFocus
                            />
                        </div>
                        <div className="p-6 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => { setAjusteDetalle(null); setAjusteComentario(''); }}
                                className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors font-bold text-xs"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmarAjuste}
                                disabled={actionLoading !== null}
                                className="px-5 py-2.5 text-white rounded-xl transition-all font-bold text-xs flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 active:scale-95 disabled:opacity-50"
                            >
                                {actionLoading !== null && <Loader2 size={16} className="animate-spin" />}
                                Guardar Ajuste
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Modificar Cantidad de Insumo con Ajustes */}
            {cantModDetalle && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
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
                                            {cantModDetalle.categoria_nombre || (solicitud as any)?.area || 'General'}
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
                                className="px-5 py-2.5 text-white rounded-xl transition-all font-bold text-xs flex items-center gap-2 bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-600/20 active:scale-95 disabled:opacity-50"
                            >
                                {updatingCantidadId !== null ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                Guardar Cantidad
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Aprobar y Cerrar Solicitud (Idéntico a la 2da imagen con desglose e insumos) */}
            {modalConfirmacionAprobar && solicitud && (() => {
                const detallesModal = solicitud.detalles || [];
                const itemsAprobados = detallesModal.filter(d => d.estado_aprobacion === 'Aprobado');
                const itemsConAjustes = detallesModal.filter(d => d.estado_aprobacion === 'Con Ajustes' || d.estado_aprobacion === 'Aprobado con Ajustes');
                const itemsSinRevisar = detallesModal.filter(d => d.estado_aprobacion === 'Sin Revisar' || !d.estado_aprobacion);
                const itemsPendientes = detallesModal.filter(d => d.estado_aprobacion === 'Pendiente');
                const itemsRechazados = detallesModal.filter(d => d.estado_aprobacion === 'Rechazado');

                const montoTotalSolicitado = solicitud.monto_total || 0;
                const montoAprobadoTotal = [...itemsAprobados, ...itemsConAjustes].reduce((acc, d) => acc + (d.total_iva || (d.cantidad * d.valor_unitario_iva) || 0), 0);

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl mx-auto overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
                            {/* Header */}
                            <div className="p-5 flex items-center gap-4 border-b border-green-100 bg-green-50/70 shrink-0">
                                <div className="p-3 rounded-2xl bg-green-100 text-green-700 shrink-0 shadow-2xs">
                                    <Check size={24} strokeWidth={2.5} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-bold text-gray-900 leading-tight">
                                        Aprobar y Cerrar Solicitud
                                    </h3>
                                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                                        {codigoReq} · {solicitud.area_nombre || 'General'} · {solicitud.user_nombre || 'N/A'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setModalConfirmacionAprobar(false)}
                                    className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-black/5 transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-6 overflow-y-auto space-y-4">
                                {/* Desglose de Insumos */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                            Desglose de Insumos ({detallesModal.length} items)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setShowModalInsumosList(!showModalInsumosList)}
                                            className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
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

                                {/* Aviso de estado */}
                                <div className="border border-gray-200 bg-gray-50/80 rounded-2xl p-3 flex items-start gap-2.5 text-gray-700">
                                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-gray-500" />
                                    <p className="text-xs font-medium leading-snug">
                                        ¿Aceptar y cerrar esta solicitud? Quedará en estado &quot;Aceptado&quot; con el presupuesto revisado.
                                    </p>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-4 bg-gray-50/80 border-t border-gray-100 flex justify-end gap-2.5 shrink-0">
                                <button
                                    onClick={() => setModalConfirmacionAprobar(false)}
                                    className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors font-bold text-xs cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmarAprobacion}
                                    disabled={solicitudActionLoading}
                                    className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-all font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                                >
                                    {solicitudActionLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                                    Confirmar Aprobación
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

        </div>
    );
}
