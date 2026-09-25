'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api/client';
import {
    ArrowLeft, Loader2, User, Calendar, DollarSign, Package, Building2, CheckCircle, Tag, Columns2, Coins, Search, Check
} from 'lucide-react';
import { BudgetRequest, BudgetDetail } from '@/lib/types';
import Modal from '@/components/ui/Modal';

const formatCLP = (value: number | undefined | null) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value || 0);

const MESES: Record<string, string> = {
    '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
    '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
    '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
    '1': 'Enero', '2': 'Febrero', '3': 'Marzo', '4': 'Abril',
    '5': 'Mayo', '6': 'Junio', '7': 'Julio', '8': 'Agosto',
    '9': 'Septiembre'
};

const formatDate = (value: string | undefined | null) => {
    if (!value) return '—';
    const val = String(value).trim();
    // Si ya viene como un nombre de mes (ej. "Enero", "Marzo", etc.)
    if (/^[A-Za-záéíóúÁÉÍÓÚñÑ]+$/i.test(val)) return val;

    // Si viene como YYYY-MM-DD o YYYY-MM
    const datePart = val.slice(0, 10);
    const parts = datePart.split('-');
    if (parts.length >= 2) {
        const monthNum = parts[1];
        if (MESES[monthNum]) return MESES[monthNum];
    }

    return val;
};

// Etiquetas legibles del destino del gasto (pilares)
const DESTINO_GASTO_LABEL: Record<string, string> = {
    'clases(alumno)': 'Para Alumnos',
    'oficinas(administracion)': 'Para Funcionarios',
    'premio/beneficio': 'Premio / Beneficio',
    'mantencion/servicio': 'Mantención / Servicio',
    // compatibilidad con valores antiguos
    'Alumnos': 'Para Alumnos',
    'Funcionarios': 'Para Funcionarios',
};
const destinoGastoLabel = (v?: string) => (v ? (DESTINO_GASTO_LABEL[v] || v) : '—');

// Todas las columnas disponibles de los recursos del presupuesto
const COLUMNAS_DETALLE: { key: string; label: string }[] = [
    { key: 'producto', label: 'Producto' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'recurso', label: 'Recurso' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'cuenta', label: 'Cuenta Contable' },
    { key: 'actividad', label: 'Actividad PME' },
    { key: 'destino', label: 'Destino Gasto' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'formato', label: 'Formato' },
    { key: 'cantidad', label: 'Cantidad' },
    { key: 'valor_neto', label: 'V. Unitario (neto)' },
    { key: 'valor_iva', label: 'V. Unitario (c/IVA)' },
    { key: 'total', label: 'Total' },
    { key: 'fecha_ejecucion', label: 'Fecha Ejecución' },
    { key: 'fecha_termino', label: 'Fecha Término' },
    { key: 'tipo_fecha', label: 'Tipo Fecha' },
    { key: 'motivo', label: 'Motivo' },
    { key: 'estado', label: 'Estado' },
];

const STORAGE_KEY = 'go_compras_detalle_columns';
const ALL_KEYS = COLUMNAS_DETALLE.map(c => c.key);

export default function DetalleCompraPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;

    const [solicitud, setSolicitud] = useState<BudgetRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [showColsModal, setShowColsModal] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) return parsed;
                } catch { /* ignore */ }
            }
        }
        return ALL_KEYS; // por defecto se muestran todas
    });

    const [filterEstado, setFilterEstado] = useState<'Aprobado' | 'Pendiente' | 'Rechazado' | 'Todos'>('Aprobado');
    const isVisible = (key: string) => visibleColumns.includes(key);

    // Asignación de código contable por recurso
    const [codigoDetalle, setCodigoDetalle] = useState<BudgetDetail | null>(null);
    const [cuentasActivas, setCuentasActivas] = useState<any[]>([]);
    const [subvencionesActivas, setSubvencionesActivas] = useState<{ id_subvencion: number; nombre_corto: string; nombre_completo: string }[]>([]);
    const [loadingOpciones, setLoadingOpciones] = useState(false);
    const [savingCodigo, setSavingCodigo] = useState(false);
    const [cuentaSearch, setCuentaSearch] = useState('');
    const [codigoForm, setCodigoForm] = useState({ codigo_cuenta: '', id_subvencion: '' });

    const openCodigoModal = async (d: BudgetDetail) => {
        setCodigoDetalle(d);
        setCuentaSearch('');
        setCodigoForm({
            codigo_cuenta: d.codigo_cuenta || '',
            id_subvencion: d.id_subvencion ? String(d.id_subvencion) : ''
        });
        if (cuentasActivas.length === 0 || subvencionesActivas.length === 0) {
            setLoadingOpciones(true);
            try {
                const [cuentasRes, subvRes] = await Promise.all([
                    api.get('/catalogos/cuentas'),
                    api.get('/presupuesto/subvenciones/activas')
                ]);
                setCuentasActivas((cuentasRes.data || []).filter((c: any) => !c.oculta));
                setSubvencionesActivas(subvRes.data || []);
            } catch (error) {
                console.error('Error cargando cuentas/subvenciones:', error);
                alert('Error al cargar las cuentas o subvenciones');
            } finally {
                setLoadingOpciones(false);
            }
        }
    };

    const handleSaveCodigo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!codigoDetalle) return;
        setSavingCodigo(true);
        try {
            await api.patch(`/presupuesto/detalles/${codigoDetalle.id_pre_detalle}/codigo-contable`, {
                codigo_cuenta: codigoForm.codigo_cuenta,
                id_subvencion: codigoForm.id_subvencion ? parseInt(codigoForm.id_subvencion) : null
            });
            setCodigoDetalle(null);
            await fetchSolicitud();
        } catch (error: any) {
            const msg = error.response?.data?.detail || 'Error al guardar el código contable';
            alert(msg);
        } finally {
            setSavingCodigo(false);
        }
    };

    const toggleColumn = (key: string) => {
        const next = visibleColumns.includes(key)
            ? visibleColumns.filter(k => k !== key)
            : [...visibleColumns, key];
        setVisibleColumns(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    };

    const setAllColumns = (all: boolean) => {
        const next = all ? [...ALL_KEYS] : ['producto'];
        setVisibleColumns(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    };

    const fetchSolicitud = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get(`/presupuesto/solicitudes/${id}`);
            setSolicitud(res.data);
        } catch (error) {
            console.error('Error cargando la compra:', error);
            setSolicitud(null);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchSolicitud();
    }, [fetchSolicitud]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-2">
                <Loader2 className="animate-spin" size={28} />
                <span>Cargando detalle de la compra...</span>
            </div>
        );
    }

    if (!solicitud) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
                <p className="font-medium">No se encontró la compra solicitada.</p>
                <button
                    onClick={() => router.push('/go-compras/historial')}
                    className="px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
                >
                    Volver al historial
                </button>
            </div>
        );
    }



    const codigoReq = `REQ-${new Date(solicitud.fecha).getFullYear()}-${solicitud.id_presupuesto.toString().padStart(3, '0')}`;
    const colCount = visibleColumns.length || 1;

    const todosDetalles = solicitud.detalles || [];
    const detallesAprobados = todosDetalles.filter(d => d.estado_aprobacion === 'Aprobado');
    const detallesPendientes = todosDetalles.filter(d => d.estado_aprobacion === 'Pendiente');
    const detallesRechazados = todosDetalles.filter(d => d.estado_aprobacion === 'Rechazado');

    const detallesFiltrados = todosDetalles.filter(d => {
        if (filterEstado === 'Todos') return true;
        return d.estado_aprobacion === filterEstado;
    });

    const montoTotalCalculado = detallesFiltrados.reduce((sum, d) => sum + (d.total_iva || 0), 0);

    const estadoBadge = (estado: string) => {
        const styles: Record<string, string> = {
            Aprobado: 'bg-green-100 text-green-700',
            Aceptado: 'bg-green-100 text-green-700',
            Rechazado: 'bg-red-100 text-red-700 border border-red-200',
            Pendiente: 'bg-amber-100 text-amber-700 border border-amber-200',
        };
        return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${styles[estado] || 'bg-gray-100 text-gray-700'}`}>{estado}</span>;
    };

    return (
        <div className="animate-in fade-in duration-500">
            {/* Volver */}
            <button
                onClick={() => router.push('/go-compras/historial')}
                className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-primary mb-4 transition-colors"
            >
                <ArrowLeft size={18} />
                Volver al historial
            </button>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">{codigoReq}</h2>
                    <p className="text-gray-500 mt-1 font-medium">Detalle de la compra.</p>
                </div>
                <span className="px-3 py-1.5 inline-flex items-center gap-1.5 text-sm font-bold rounded-full bg-green-100 text-green-800 w-fit">
                    <CheckCircle size={16} className="text-green-500" />
                    {solicitud.estado}
                </span>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-400 mb-1.5"><User size={16} /><span className="text-xs font-bold uppercase tracking-wider">Solicitante</span></div>
                    <p className="text-sm font-semibold text-gray-900">{solicitud.user_nombre || '—'}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-400 mb-1.5"><Building2 size={16} /><span className="text-xs font-bold uppercase tracking-wider">Colegio</span></div>
                    <p className="text-sm font-semibold text-gray-900">{solicitud.colegio_nombre || '—'}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-400 mb-1.5"><Tag size={16} /><span className="text-xs font-bold uppercase tracking-wider">Área</span></div>
                    <p className="text-sm font-semibold text-gray-900">{solicitud.area_nombre || '—'}</p>
                    {solicitud.subarea_nombre && <p className="text-xs text-gray-500">{solicitud.subarea_nombre}</p>}
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-400 mb-1.5"><Calendar size={16} /><span className="text-xs font-bold uppercase tracking-wider">Fecha</span></div>
                    <p className="text-sm font-semibold text-gray-900">{new Date(solicitud.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>
            </div>

            {/* Totales y métricas dinámicas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-2xl p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-green-50 flex items-center justify-center text-green-600"><DollarSign size={28} /></div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">
                            Monto Total {filterEstado !== 'Todos' ? `(${filterEstado}s)` : '(Todos)'}
                        </p>
                        <h3 className="text-2xl font-bold text-gray-900">{formatCLP(montoTotalCalculado)}</h3>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600"><Package size={28} /></div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Recursos filtrados</p>
                        <h3 className="text-2xl font-bold text-gray-900">{detallesFiltrados.length} items</h3>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center justify-around gap-2 text-center">
                    <div>
                        <span className="text-[11px] font-bold text-green-600 block uppercase">Aprobados</span>
                        <span className="text-xl font-extrabold text-green-700">{detallesAprobados.length}</span>
                    </div>
                    <div className="h-8 w-px bg-gray-200" />
                    <div>
                        <span className="text-[11px] font-bold text-amber-600 block uppercase">Pendientes</span>
                        <span className="text-xl font-extrabold text-amber-700">{detallesPendientes.length}</span>
                    </div>
                    <div className="h-8 w-px bg-gray-200" />
                    <div>
                        <span className="text-[11px] font-bold text-red-600 block uppercase">Rechazados</span>
                        <span className="text-xl font-extrabold text-red-700">{detallesRechazados.length}</span>
                    </div>
                </div>
            </div>

            {/* Tabla de recursos */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-gray-900">Recursos de la compra</h3>
                        {/* Filtros por estado de recursos */}
                        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                            <button
                                onClick={() => setFilterEstado('Aprobado')}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${filterEstado === 'Aprobado' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Aprobados ({detallesAprobados.length})
                            </button>
                            <button
                                onClick={() => setFilterEstado('Pendiente')}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${filterEstado === 'Pendiente' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Pendientes ({detallesPendientes.length})
                            </button>
                            <button
                                onClick={() => setFilterEstado('Rechazado')}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${filterEstado === 'Rechazado' ? 'bg-white text-red-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Rechazados ({detallesRechazados.length})
                            </button>
                            <button
                                onClick={() => setFilterEstado('Todos')}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${filterEstado === 'Todos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Todos ({todosDetalles.length})
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowColsModal(true)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                    >
                        <Columns2 size={18} />
                        Columnas
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                {COLUMNAS_DETALLE.filter(c => isVisible(c.key)).map(c => (
                                    <th
                                        key={c.key}
                                        className={`px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${['cantidad', 'valor_neto', 'valor_iva', 'total'].includes(c.key) ? 'text-right' : 'text-left'}`}
                                    >
                                        {c.label}
                                    </th>
                                ))}
                                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Código contable</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {detallesFiltrados.length === 0 ? (
                                <tr>
                                    <td colSpan={colCount + 1} className="px-6 py-12 text-center text-gray-400">No hay recursos en el estado seleccionado.</td>
                                </tr>
                            ) : (
                                detallesFiltrados.map((d) => (
                                    <tr key={d.id_pre_detalle} className="hover:bg-gray-50/50 transition-colors">
                                        {isVisible('producto') && (
                                            <td className="px-6 py-4 text-sm font-semibold text-gray-900">{d.nombre_producto}</td>
                                        )}
                                        {isVisible('descripcion') && (
                                            <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">{d.descripcion || '—'}</td>
                                        )}
                                        {isVisible('recurso') && (
                                            <td className="px-6 py-4 text-sm text-gray-600">{d.recurso_nombre || '—'}</td>
                                        )}
                                        {isVisible('categoria') && (
                                            <td className="px-6 py-4 text-sm text-gray-600">{d.categoria_nombre || '—'}</td>
                                        )}
                                        {isVisible('cuenta') && (
                                            <td className="px-6 py-4 text-sm">
                                                {d.codigo_cuenta ? (
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-red-600">{d.codigo_cuenta}</span>
                                                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">Código sugerido</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400">—</span>
                                                )}
                                            </td>
                                        )}
                                        {isVisible('actividad') && (
                                            <td className="px-6 py-4 text-sm text-gray-600">{d.actividad_nombre || '—'}</td>
                                        )}
                                        {isVisible('destino') && (
                                            <td className="px-6 py-4 text-sm text-gray-600">{destinoGastoLabel(d.destino_gasto)}</td>
                                        )}
                                        {isVisible('cargo') && (
                                            <td className="px-6 py-4 text-sm text-gray-600">{d.subarea_nombre || '—'}</td>
                                        )}
                                        {isVisible('formato') && (
                                            <td className="px-6 py-4 text-sm text-gray-600">{d.formato_unidad || '—'}</td>
                                        )}
                                        {isVisible('cantidad') && (
                                            <td className="px-6 py-4 text-sm text-gray-700 text-right">{d.cantidad}</td>
                                        )}
                                        {isVisible('valor_neto') && (
                                            <td className="px-6 py-4 text-sm text-gray-700 text-right">{formatCLP(d.valor_unitario)}</td>
                                        )}
                                        {isVisible('valor_iva') && (
                                            <td className="px-6 py-4 text-sm text-gray-700 text-right">{formatCLP(d.valor_unitario_iva)}</td>
                                        )}
                                        {isVisible('total') && (
                                            <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">{formatCLP(d.total_iva)}</td>
                                        )}
                                        {isVisible('fecha_ejecucion') && (
                                            <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{formatDate(d.fecha_ejecucion)}</td>
                                        )}
                                        {isVisible('fecha_termino') && (
                                            <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{formatDate(d.fecha_termino)}</td>
                                        )}
                                        {isVisible('tipo_fecha') && (
                                            <td className="px-6 py-4 text-sm text-gray-600">{d.tipo_fecha || '—'}</td>
                                        )}
                                        {isVisible('motivo') && (
                                            <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">{d.motivo || '—'}</td>
                                        )}
                                        {isVisible('estado') && (
                                            <td className="px-6 py-4 text-sm">{estadoBadge(d.estado_aprobacion)}</td>
                                        )}
                                        <td className="px-6 py-4 text-center whitespace-nowrap">
                                            {d.codigo_cuenta ? (
                                                <button
                                                    onClick={() => openCodigoModal(d)}
                                                    className="inline-flex flex-col items-center px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                                                    title="Editar código contable"
                                                >
                                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600">
                                                        <Coins size={14} />
                                                        {d.codigo_cuenta}
                                                    </span>
                                                    <span className="text-[9px] font-bold text-red-500 uppercase tracking-wide">Sugerido</span>
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => openCodigoModal(d)}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
                                                    title="Asignar código contable"
                                                >
                                                    <Coins size={14} />
                                                    Asignar
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de columnas */}
            <Modal
                isOpen={showColsModal}
                onClose={() => setShowColsModal(false)}
                title="Columnas a mostrar"
                maxWidth="max-w-md"
            >
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500">Selecciona las columnas de los recursos que quieres ver. Tu selección se guarda automáticamente.</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setAllColumns(true)}
                            className="px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                        >
                            Seleccionar todas
                        </button>
                        <button
                            onClick={() => setAllColumns(false)}
                            className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            Quitar todas
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                        {COLUMNAS_DETALLE.map(col => (
                            <label
                                key={col.key}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-100"
                            >
                                <input
                                    type="checkbox"
                                    checked={isVisible(col.key)}
                                    onChange={() => toggleColumn(col.key)}
                                    className="rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <span className="text-sm text-gray-700">{col.label}</span>
                            </label>
                        ))}
                    </div>
                    <div className="flex justify-end pt-2">
                        <button
                            onClick={() => setShowColsModal(false)}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Listo
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal de asignación de código contable */}
            <Modal
                isOpen={!!codigoDetalle}
                onClose={() => setCodigoDetalle(null)}
                title="Asignar Código Contable"
                maxWidth="max-w-lg"
            >
                {loadingOpciones ? (
                    <div className="py-12 flex flex-col items-center gap-2 text-gray-400">
                        <Loader2 className="animate-spin" size={24} />
                        <span>Cargando cuentas y subvenciones...</span>
                    </div>
                ) : (
                    <form onSubmit={handleSaveCodigo} className="space-y-4">
                        <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3.5 flex items-start gap-2.5">
                            <Coins className="text-amber-500 mt-0.5 shrink-0" size={18} />
                            <p className="text-xs text-gray-600 leading-relaxed">
                                Asigna el código contable y la subvención al recurso <strong className="text-gray-800">{codigoDetalle?.nombre_producto}</strong>.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Código de Cuenta (activos)</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-3.5 w-3.5 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Buscar por código o nombre..."
                                    value={cuentaSearch}
                                    onChange={(e) => setCuentaSearch(e.target.value)}
                                    className="block w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary text-gray-900 font-medium"
                                />
                            </div>
                            <div className="mt-2 border border-gray-100 rounded-xl overflow-y-auto max-h-[180px] custom-scrollbar bg-white">
                                {cuentasActivas
                                    .filter((c: any) =>
                                        c.codigo.includes(cuentaSearch) ||
                                        c.nombre.toLowerCase().includes(cuentaSearch.toLowerCase())
                                    )
                                    .map((c: any) => (
                                        <button
                                            key={c.codigo}
                                            type="button"
                                            onClick={() => setCodigoForm({ ...codigoForm, codigo_cuenta: c.codigo })}
                                            className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-none flex justify-between items-center transition-colors ${
                                                codigoForm.codigo_cuenta === c.codigo
                                                ? 'bg-blue-50 text-blue-900'
                                                : 'hover:bg-gray-50 text-gray-700'
                                            }`}
                                        >
                                            <div className="flex flex-col pr-2">
                                                <span className="text-[11px] font-bold">{c.codigo}</span>
                                                <span className="text-[10px] truncate max-w-[280px]">{c.nombre}</span>
                                            </div>
                                            {codigoForm.codigo_cuenta === c.codigo && (
                                                <Check size={14} className="text-blue-600 shrink-0" />
                                            )}
                                        </button>
                                    ))
                                }
                                {cuentasActivas.filter((c: any) =>
                                    c.codigo.includes(cuentaSearch) ||
                                    c.nombre.toLowerCase().includes(cuentaSearch.toLowerCase())
                                ).length === 0 && (
                                    <div className="px-3 py-4 text-center text-xs text-gray-400">Sin resultados.</div>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Subvención (activas)</label>
                            <select
                                value={codigoForm.id_subvencion}
                                onChange={(e) => setCodigoForm({ ...codigoForm, id_subvencion: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                            >
                                <option value="">Sin subvención</option>
                                {subvencionesActivas.map(s => (
                                    <option key={s.id_subvencion} value={s.id_subvencion}>{s.nombre_corto} — {s.nombre_completo}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setCodigoDetalle(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={savingCodigo || !codigoForm.codigo_cuenta}
                                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                            >
                                {savingCodigo && <Loader2 size={16} className="animate-spin" />}
                                Guardar
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
}
