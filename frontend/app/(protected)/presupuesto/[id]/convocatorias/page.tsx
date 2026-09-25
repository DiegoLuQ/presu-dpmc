'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import {
    ArrowLeft, Plus, Link2, Copy, Check, CheckCircle, XCircle,
    Loader2, Package, Users, Download, ChevronDown,
    ChevronUp, X, RotateCcw, Pencil, Lock, Trash2, SlidersHorizontal
} from 'lucide-react';
import { Convocatoria, PedidoExterno, Cargo, BudgetRequest, FORMATOS_UNIDAD, MESES } from '@/lib/types';

const fmt = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : '';

const DESTINOS: { value: string; label: string }[] = [
    { value: 'clases(alumno)', label: 'Alumnos' },
    { value: 'oficinas(administracion)', label: 'Funcionario' },
    { value: 'premio/beneficio', label: 'Beneficio' },
    { value: 'mantencion/servicio', label: 'Mantención' },
];

const LEGACY_DESTINO: Record<string, string> = {
    alumno: 'clases(alumno)',
    funcionario: 'oficinas(administracion)',
    premio: 'premio/beneficio',
    mantencion: 'mantencion/servicio',
};

const normalizeDestino = (v?: string) => (v ? (LEGACY_DESTINO[v] || v) : 'clases(alumno)');

const destinoLabel = (v?: string) => {
    if (!v) return '—';
    const norm = normalizeDestino(v);
    return DESTINOS.find(d => d.value === norm)?.label || v;
};

export default function ConvocatoriasPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const id = params.id as string;

    const [convocatorias, setConvocatorias] = useState<Convocatoria[]>([]);
    const [loading, setLoading] = useState(true);
    const [cargos, setSubareas] = useState<Cargo[]>([]);
    const [solicitud, setSolicitud] = useState<BudgetRequest | null>(null);
    const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
    const [pedidos, setPedidos] = useState<Record<number, PedidoExterno[]>>({});
    const [loadingPedidos, setLoadingPedidos] = useState<number | null>(null);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [copiado, setCopiado] = useState<number | null>(null);
    const [importando, setImportando] = useState<number | null>(null);
    const [modalNueva, setModalNueva] = useState(false);
    const [nuevaSubarea, setNuevaSubarea] = useState('');
    const [nuevaDias, setNuevaDias] = useState('30');
    const [nuevoPin, setNuevoPin] = useState('');
    const [creando, setCreando] = useState(false);
    const [errorModal, setErrorModal] = useState('');
    const [rechazarModal, setRechazarModal] = useState<{ open: boolean; id_pedido: number | null; id_conv: number | null }>({ open: false, id_pedido: null, id_conv: null });
    const [comentarioRechazo, setComentarioRechazo] = useState('');
    const [editarModal, setEditarModal] = useState<{ open: boolean; id_conv: number | null; pedido: PedidoExterno | null }>({ open: false, id_conv: null, pedido: null });
    const [editForm, setEditForm] = useState({ nombre_recurso: '', descripcion: '', formato_unidad: 'unidad', cantidad: '', precio_estimado: '', motivo: '', destino: '', fecha_ejecucion: '' });
    const [guardandoEdit, setGuardandoEdit] = useState(false);
    const [errorEdit, setErrorEdit] = useState('');

    const [columnasVisibles, setColumnasVisibles] = useState<Record<string, boolean>>({
        cant: true,
        precio: true,
        total: true,
        motivo: true,
        destino: true,
        mes: true,
    });
    const [showColumnasMenu, setShowColumnasMenu] = useState(false);

    const fetchPedidos = useCallback(async (id_conv: number) => {
        setLoadingPedidos(id_conv);
        try {
            const r = await api.get(`/convocatorias/${id_conv}/pedidos`);
            setPedidos(prev => ({ ...prev, [id_conv]: r.data }));
        } catch { /* */ }
        setLoadingPedidos(null);
    }, []);

    const fetchConvocatorias = useCallback(async () => {
        try {
            const r = await api.get(`/convocatorias?id_presupuesto=${id}`);
            setConvocatorias(r.data);
            // Desplegar todas por defecto y cargar sus pedidos
            const ids: number[] = r.data.map((c: Convocatoria) => c.id_convocatoria);
            setExpandidos(new Set(ids));
            ids.forEach(idc => fetchPedidos(idc));
        } catch {
            setConvocatorias([]);
        } finally {
            setLoading(false);
        }
    }, [id, fetchPedidos]);

    const fetchSubareas = useCallback(async () => {
        try {
            const r = await api.get('/catalogos/cargos');
            setSubareas(r.data);
        } catch { /* sin cargos */ }
    }, []);

    const fetchSolicitud = useCallback(async () => {
        try {
            const r = await api.get(`/presupuesto/solicitudes/${id}`);
            setSolicitud(r.data);
        } catch { /* */ }
    }, [id]);

    useEffect(() => {
        fetchConvocatorias();
        fetchSubareas();
        fetchSolicitud();
    }, [fetchConvocatorias, fetchSubareas, fetchSolicitud]);

    const toggleExpandir = async (id_conv: number) => {
        const estaAbierto = expandidos.has(id_conv);
        setExpandidos(prev => {
            const next = new Set(prev);
            if (estaAbierto) next.delete(id_conv);
            else next.add(id_conv);
            return next;
        });
        if (!estaAbierto && !pedidos[id_conv]) {
            await fetchPedidos(id_conv);
        }
    };

    const copiarUrl = (conv: Convocatoria) => {
        navigator.clipboard.writeText(`${BASE_URL}/pedidos/${conv.token}`);
        setCopiado(conv.id_convocatoria);
        setTimeout(() => setCopiado(null), 2000);
    };

    const cerrarConvocatoria = async (id_conv: number) => {
        if (!confirm('¿Cerrar esta convocatoria? Los pedidos ya enviados se conservan.')) return;
        try {
            const r = await api.patch(`/convocatorias/${id_conv}/cerrar`);
            setConvocatorias(prev => prev.map(c => c.id_convocatoria === id_conv ? r.data : c));
        } catch { /* */ }
    };

    const eliminarConvocatoria = async (id_conv: number) => {
        if (!confirm('¿Estás seguro de eliminar esta convocatoria? Se borrarán permanentemente todos sus pedidos asociados. Los recursos que ya fueron importados al presupuesto oficial no se eliminarán.')) return;
        try {
            await api.delete(`/convocatorias/${id_conv}`);
            setConvocatorias(prev => prev.filter(c => c.id_convocatoria !== id_conv));
            setPedidos(prev => {
                const copia = { ...prev };
                delete copia[id_conv];
                return copia;
            });
        } catch (e: any) {
            alert(e.response?.data?.detail || 'Error al eliminar la convocatoria');
        }
    };

    const actualizarPedido = async (id_conv: number, id_pedido: number, estado: string, comentario?: string) => {
        setActionLoading(id_pedido);
        try {
            const r = await api.patch(`/convocatorias/pedidos/${id_pedido}`, {
                estado_jefe: estado,
                comentario_jefe: comentario ?? undefined,
            });
            setPedidos(prev => ({
                ...prev,
                [id_conv]: prev[id_conv].map(p => p.id_pedido === id_pedido ? r.data : p),
            }));
            // Actualizar contadores de la convocatoria
            fetchConvocatorias();
        } catch { /* */ }
        setActionLoading(null);
    };



    const aceptarTodosPendientes = async (id_conv: number) => {
        const pendientes = (pedidos[id_conv] || []).filter(p => p.estado_jefe === 'pendiente');
        if (pendientes.length === 0) return;
        setActionLoading(id_conv);
        try {
            await Promise.all(
                pendientes.map(p =>
                    api.patch(`/convocatorias/pedidos/${p.id_pedido}`, { estado_jefe: 'aceptado' })
                )
            );
            await fetchPedidos(id_conv);
            fetchConvocatorias();
        } catch {
            alert('Error al aceptar algunos pedidos');
        }
        setActionLoading(null);
    };

    const importar = async (id_conv: number) => {
        setImportando(id_conv);
        try {
            const r = await api.post(`/convocatorias/${id_conv}/importar`);
            alert(`Se importaron ${r.data.importados} recurso(s) al presupuesto.`);
            // Recargar pedidos
            const rp = await api.get(`/convocatorias/${id_conv}/pedidos`);
            setPedidos(prev => ({ ...prev, [id_conv]: rp.data }));
            fetchConvocatorias();
        } catch (e: any) {
            alert(e.response?.data?.detail || 'Error al importar');
        }
        setImportando(null);
    };

    const crearConvocatoria = async () => {
        if (!nuevaSubarea) { setErrorModal('Selecciona una cargo'); return; }
        setCreando(true);
        setErrorModal('');
        try {
            const r = await api.post('/convocatorias', {
                id_presupuesto: parseInt(id),
                id_subarea: parseInt(nuevaSubarea),
                dias_expiracion: parseInt(nuevaDias) || 30,
                pin: nuevoPin.trim() || undefined,
            });
            setConvocatorias(prev => [r.data, ...prev]);
            setModalNueva(false);
            setNuevaSubarea('');
            setNuevaDias('30');
            setNuevoPin('');
        } catch (e: any) {
            setErrorModal(e.response?.data?.detail || 'Error al crear');
        }
        setCreando(false);
    };

    const abrirEditar = (id_conv: number, p: PedidoExterno) => {
        setEditarModal({ open: true, id_conv, pedido: p });
        setEditForm({
            nombre_recurso: p.nombre_recurso,
            descripcion: p.descripcion || '',
            formato_unidad: p.formato_unidad,
            cantidad: String(p.cantidad),
            precio_estimado: String(p.precio_estimado),
            motivo: p.motivo,
            destino: normalizeDestino(p.destino),
            fecha_ejecucion: p.fecha_ejecucion ? p.fecha_ejecucion.substring(0, 10) : '',
        });
        setErrorEdit('');
    };

    const handleMesChange = (mVal: string) => {
        const year = editForm.fecha_ejecucion ? editForm.fecha_ejecucion.substring(0, 4) : new Date().getFullYear().toString();
        const newDate = `${year}-${mVal}-01`;
        setEditForm(f => ({ ...f, fecha_ejecucion: newDate }));
    };

    const guardarEdit = async () => {
        if (!editarModal.pedido || !editarModal.id_conv) return;
        if (!editForm.nombre_recurso.trim()) { setErrorEdit('El nombre es obligatorio'); return; }
        if (!editForm.cantidad || parseFloat(editForm.cantidad) <= 0) { setErrorEdit('La cantidad debe ser mayor a 0'); return; }
        if (editForm.precio_estimado === '' || parseFloat(editForm.precio_estimado) < 0) { setErrorEdit('El precio no es válido'); return; }
        setGuardandoEdit(true);
        setErrorEdit('');
        const id_conv = editarModal.id_conv;
        const id_pedido = editarModal.pedido.id_pedido;
        try {
            const r = await api.patch(`/convocatorias/pedidos/${id_pedido}/datos`, {
                nombre_recurso: editForm.nombre_recurso.trim(),
                descripcion: editForm.descripcion.trim() || undefined,
                formato_unidad: editForm.formato_unidad,
                cantidad: parseFloat(editForm.cantidad),
                precio_estimado: parseFloat(editForm.precio_estimado),
                motivo: editForm.motivo.trim(),
                destino: editForm.destino || undefined,
                fecha_ejecucion: editForm.fecha_ejecucion || undefined,
            });
            setPedidos(prev => ({
                ...prev,
                [id_conv]: prev[id_conv].map(p => p.id_pedido === id_pedido ? r.data : p),
            }));
            setEditarModal({ open: false, id_conv: null, pedido: null });
        } catch (e: any) {
            setErrorEdit(e.response?.data?.detail || 'Error al guardar');
        }
        setGuardandoEdit(false);
    };

    const getMesLabel = (fechaStr?: string) => {
        if (!fechaStr) return '—';
        const mesNum = fechaStr.substring(5, 7);
        const match = MESES.find(m => m.value === mesNum);
        return match ? match.label : '—';
    };

    const estadoBadge = (estado: PedidoExterno['estado_jefe']) => {
        const cfg: Record<string, { label: string; cls: string }> = {
            pendiente:  { label: 'Pendiente',  cls: 'bg-yellow-100 text-yellow-700' },
            aceptado:   { label: 'Aceptado',   cls: 'bg-green-100 text-green-700' },
            rechazado:  { label: 'Rechazado',  cls: 'bg-red-100 text-red-700' },
            importado:  { label: 'Importado',  cls: 'bg-blue-100 text-blue-700' },
        };
        const c = cfg[estado] || { label: estado, cls: 'bg-gray-100 text-gray-700' };
        return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${c.cls}`}>{c.label}</span>;
    };

    const convEstadoBadge = (c: Convocatoria) => {
        const hoy = new Date();
        const exp = new Date(c.fecha_expiracion);
        const expirado = exp < hoy;
        if (c.estado === 'cerrado') return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">Cerrado</span>;
        if (expirado) return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700">Expirado</span>;
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">Activo</span>;
    };

    // Cargos del área de la solicitud (por área principal o adicional).
    const idAreaSolicitud = solicitud?.id_area;
    const subareasDelArea = idAreaSolicitud
        ? cargos.filter(s =>
            s.id_area === idAreaSolicitud ||
            (s.areas_adicionales || []).some(a => a.id_area === idAreaSolicitud)
          )
        : cargos;

    // De esas, las que aún no tienen convocatoria activa en este presupuesto.
    const subareasSinConv = subareasDelArea.filter(s =>
        !convocatorias.some(c => c.id_subarea === s.id_subarea && c.estado === 'activo')
    );

    return (
        <div className="min-h-screen bg-[#f8f9fa]">
            <main className="p-6 max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <button
                        onClick={() => router.push(`/presupuesto/${id}`)}
                        className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Convocatorias de Pedidos</h1>
                        <p className="text-sm text-gray-500">
                            Solicita recursos a las cargos
                            {solicitud?.area_nombre && <> del área <span className="font-semibold text-gray-700">{solicitud.area_nombre}</span></>}
                            {' '}· Solicitud #{id}
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2 relative">
                        <button
                            onClick={() => setShowColumnasMenu(s => !s)}
                            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-xl bg-white hover:bg-gray-50 active:scale-95 transition-all"
                        >
                            <SlidersHorizontal size={14} />
                            Columnas
                        </button>
                        {showColumnasMenu && (
                            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-150 rounded-2xl shadow-xl p-4 z-50 space-y-2">
                                <p className="text-xs font-bold text-gray-700 mb-2">Mostrar/Ocultar columnas</p>
                                {Object.entries(columnasVisibles).map(([key, isVisible]) => {
                                    const labels: Record<string, string> = {
                                        cant: 'Cantidad',
                                        precio: 'Precio',
                                        total: 'Total',
                                        motivo: 'Motivo',
                                        destino: 'Destino',
                                        mes: 'Mes',
                                    };
                                    return (
                                        <label key={key} className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={isVisible}
                                                onChange={() => setColumnasVisibles(prev => ({ ...prev, [key]: !prev[key] }))}
                                                className="rounded border-gray-300 text-primary focus:ring-primary"
                                            />
                                            {labels[key]}
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                        <button
                            onClick={() => { setModalNueva(true); setErrorModal(''); }}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:brightness-105 active:scale-95 transition-all shadow"
                        >
                            <Plus size={16} /> Nueva convocatoria
                        </button>
                    </div>
                </div>

                {/* Lista convocatorias */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={24} className="animate-spin text-gray-400" />
                    </div>
                ) : convocatorias.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                        <Users size={36} className="mx-auto mb-3 text-gray-300" />
                        <p className="text-gray-500 font-medium">No hay convocatorias aún</p>
                        <p className="text-sm text-gray-400 mt-1">Crea una convocatoria para solicitar pedidos a tus cargos.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {convocatorias.map(conv => {
                            const isExp = expandidos.has(conv.id_convocatoria);
                            const convPedidos = pedidos[conv.id_convocatoria] || [];
                            const aceptados = convPedidos.filter(p => p.estado_jefe === 'aceptado').length;
                            const totalAceptado = convPedidos
                                .filter(p => p.estado_jefe === 'aceptado')
                                .reduce((s, p) => s + p.total, 0);
                            const hayImportables = aceptados > 0 && convPedidos.some(p => p.estado_jefe === 'aceptado');

                            return (
                                <div key={conv.id_convocatoria} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                    {/* Cabecera convocatoria */}
                                    <div className="p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                    <Package size={16} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-bold text-gray-900 text-sm">{conv.subarea_nombre}</span>
                                                        {convEstadoBadge(conv)}
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        Expira: {new Date(conv.fecha_expiracion).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                                {/* Estadísticas rápidas */}
                                                <div className="text-right text-xs text-gray-500 mr-1">
                                                    <div><span className="font-semibold text-gray-700">{conv.total_pedidos}</span> pedidos</div>
                                                    <div><span className="font-semibold text-yellow-600">{conv.pedidos_pendientes}</span> pendientes</div>
                                                </div>
                                                {/* Copiar URL */}
                                                {conv.estado === 'activo' && (
                                                    <button
                                                        onClick={() => copiarUrl(conv)}
                                                        title="Copiar enlace del formulario"
                                                        className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                                                    >
                                                        {copiado === conv.id_convocatoria ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
                                                    </button>
                                                )}
                                                {/* Cerrar */}
                                                {conv.estado === 'activo' && (
                                                    <button
                                                        onClick={() => cerrarConvocatoria(conv.id_convocatoria)}
                                                        title="Cerrar convocatoria"
                                                        className="p-2 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                                                    >
                                                        <X size={15} />
                                                    </button>
                                                )}
                                                {/* Eliminar */}
                                                <button
                                                    onClick={() => eliminarConvocatoria(conv.id_convocatoria)}
                                                    title="Eliminar convocatoria"
                                                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                                {/* Expandir */}
                                                <button
                                                    onClick={() => toggleExpandir(conv.id_convocatoria)}
                                                    className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                                >
                                                    {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* URL pública */}
                                        {conv.estado === 'activo' && (
                                            <div className="mt-3 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                                                <Link2 size={13} className="text-gray-400 shrink-0" />
                                                <span className="text-xs text-gray-600 font-mono truncate flex-1">
                                                    {BASE_URL}/pedidos/{conv.token}
                                                </span>
                                                <button
                                                    onClick={() => copiarUrl(conv)}
                                                    className="text-xs font-semibold text-primary hover:underline shrink-0"
                                                >
                                                    {copiado === conv.id_convocatoria ? 'Copiado' : 'Copiar'}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Panel de pedidos (expandible) */}
                                    {isExp && (
                                        <div className="border-t border-gray-100">
                                            {loadingPedidos === conv.id_convocatoria ? (
                                                <div className="flex items-center justify-center py-8">
                                                    <Loader2 size={20} className="animate-spin text-gray-400" />
                                                </div>
                                            ) : convPedidos.length === 0 ? (
                                                <div className="py-8 text-center text-sm text-gray-400">
                                                    Aún no hay pedidos enviados para esta cargo.
                                                </div>
                                            ) : (
                                                <div>
                                                    {/* Importar aceptados y Aceptar Pendientes */}
                                                     <div className="px-5 py-3 bg-green-50/60 border-b border-green-100 flex items-center justify-between flex-wrap gap-2">
                                                         <div className="text-sm text-green-700 font-medium">
                                                             {aceptados} pedido(s) aceptado(s) · Total: <span className="font-bold">{fmt(totalAceptado)}</span>
                                                         </div>
                                                         <div className="flex items-center gap-2">
                                                             {conv.pedidos_pendientes > 0 && (
                                                                 <button
                                                                     onClick={() => aceptarTodosPendientes(conv.id_convocatoria)}
                                                                     disabled={actionLoading === conv.id_convocatoria}
                                                                     className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-green-300 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 active:scale-95 transition-all disabled:opacity-60"
                                                                 >
                                                                     {actionLoading === conv.id_convocatoria ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                                                     Aceptar todos los pendientes ({conv.pedidos_pendientes})
                                                                 </button>
                                                             )}
                                                             {hayImportables && (
                                                                 <button
                                                                     onClick={() => importar(conv.id_convocatoria)}
                                                                     disabled={importando === conv.id_convocatoria}
                                                                     className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 active:scale-95 transition-all disabled:opacity-60 shadow-sm"
                                                                 >
                                                                     {importando === conv.id_convocatoria
                                                                         ? <Loader2 size={13} className="animate-spin" />
                                                                         : <Download size={13} />}
                                                                     Importar al presupuesto
                                                                 </button>
                                                             )}
                                                         </div>
                                                     </div>

                                                     {/* Tabla de pedidos */}
                                                     <div className="overflow-x-auto">
                                                         <table className="w-full text-xs">
                                                             <thead>
                                                                 <tr className="bg-gray-50 text-gray-500 font-semibold">
                                                                     <th className="px-4 py-3 text-left">Recurso</th>
                                                                     {columnasVisibles.cant && <th className="px-3 py-3 text-right">Cant.</th>}
                                                                     {columnasVisibles.precio && <th className="px-3 py-3 text-right">Precio (c/IVA)</th>}
                                                                    {columnasVisibles.total && <th className="px-3 py-3 text-right">Total</th>}
                                                                    {columnasVisibles.motivo && <th className="px-3 py-3 text-left">Motivo</th>}
                                                                    {columnasVisibles.destino && <th className="px-3 py-3 text-left">Destino</th>}
                                                                    {columnasVisibles.mes && <th className="px-3 py-3 text-left">Mes</th>}
                                                                    <th className="px-3 py-3 text-center">Estado</th>
                                                                    <th className="px-3 py-3 text-center">Acciones</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-50">
                                                                {convPedidos.map(p => (
                                                                    <tr key={p.id_pedido} className="hover:bg-gray-50/60 transition-colors">
                                                                        <td className="px-4 py-3">
                                                                            <div className="font-semibold text-gray-800">{p.nombre_recurso}</div>
                                                                            {p.descripcion && <div className="text-gray-400 text-[11px]">{p.descripcion}</div>}
                                                                            <div className="flex flex-wrap items-center gap-1 mt-1">
                                                                                {p.actividad_pme_nombre && (
                                                                                    <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-medium" title={p.actividad_pme_nombre}>
                                                                                        PME: {p.actividad_pme_nombre.length > 30 ? p.actividad_pme_nombre.slice(0, 30) + '…' : p.actividad_pme_nombre}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {p.comentario_jefe && (
                                                                                <div className="text-red-500 text-[11px] mt-0.5 italic">{p.comentario_jefe}</div>
                                                                            )}
                                                                        </td>
                                                                        {columnasVisibles.cant && <td className="px-3 py-3 text-right text-gray-700">{p.cantidad} {p.formato_unidad}</td>}
                                                                        {columnasVisibles.precio && <td className="px-3 py-3 text-right text-gray-700">{fmt(p.precio_estimado)}</td>}
                                                                        {columnasVisibles.total && <td className="px-3 py-3 text-right font-semibold text-gray-900">{fmt(p.total)}</td>}
                                                                        {columnasVisibles.motivo && (
                                                                            <td className="px-3 py-3 text-gray-600 max-w-[160px]" title={p.motivo}>
                                                                                <span className="line-clamp-2">{p.motivo}</span>
                                                                            </td>
                                                                        )}
                                                                        {columnasVisibles.destino && (
                                                                            <td className="px-3 py-3 text-gray-700 font-medium">
                                                                                {destinoLabel(p.destino)}
                                                                            </td>
                                                                        )}
                                                                        {columnasVisibles.mes && (
                                                                            <td className="px-3 py-3 text-gray-700 font-medium">
                                                                                {getMesLabel(p.fecha_ejecucion)}
                                                                            </td>
                                                                        )}
                                                                        <td className="px-3 py-3 text-center">{estadoBadge(p.estado_jefe)}</td>
                                                                        <td className="px-3 py-3">
                                                                            {p.estado_jefe !== 'importado' && (
                                                                                <div className="flex items-center gap-1 justify-center">
                                                                                    <button
                                                                                        onClick={() => abrirEditar(conv.id_convocatoria, p)}
                                                                                        title="Editar pedido"
                                                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                                                                                    >
                                                                                        <Pencil size={13} />
                                                                                    </button>
                                                                                    {p.estado_jefe !== 'aceptado' && (
                                                                                        <button
                                                                                            onClick={() => actualizarPedido(conv.id_convocatoria, p.id_pedido, 'aceptado')}
                                                                                            disabled={actionLoading === p.id_pedido}
                                                                                            title="Aceptar"
                                                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                                                                                        >
                                                                                            {actionLoading === p.id_pedido ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                                                                        </button>
                                                                                    )}
                                                                                    {p.estado_jefe !== 'rechazado' && (
                                                                                        <button
                                                                                            onClick={() => { setRechazarModal({ open: true, id_pedido: p.id_pedido, id_conv: conv.id_convocatoria }); setComentarioRechazo(''); }}
                                                                                            disabled={actionLoading === p.id_pedido}
                                                                                            title="Rechazar"
                                                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                                                        >
                                                                                            <XCircle size={13} />
                                                                                        </button>
                                                                                    )}
                                                                                    {p.estado_jefe !== 'pendiente' && (
                                                                                        <button
                                                                                            onClick={() => actualizarPedido(conv.id_convocatoria, p.id_pedido, 'pendiente')}
                                                                                            disabled={actionLoading === p.id_pedido}
                                                                                            title="Revertir"
                                                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 transition-colors"
                                                                                        >
                                                                                            <RotateCcw size={13} />
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Modal nueva convocatoria */}
            {modalNueva && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setModalNueva(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-gray-900 mb-4">Nueva convocatoria</h3>

                        {errorModal && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2 mb-4">
                                {errorModal}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Cargo destinataria</label>
                                <select
                                    value={nuevaSubarea}
                                    onChange={e => setNuevaSubarea(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                >
                                    <option value="">Seleccionar cargo...</option>
                                    {subareasSinConv.map(s => (
                                        <option key={s.id_subarea} value={s.id_subarea}>{s.nombre}</option>
                                    ))}
                                </select>
                                {subareasSinConv.length === 0 && (
                                    <p className="text-xs text-orange-600 mt-1">Todas las cargos ya tienen convocatoria activa.</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Días de validez</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="90"
                                    value={nuevaDias}
                                    onChange={e => setNuevaDias(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    El formulario expirará el {new Date(Date.now() + parseInt(nuevaDias || '30') * 86400000).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                                    <Lock size={12} /> PIN de acceso (opcional)
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={10}
                                    value={nuevoPin}
                                    onChange={e => setNuevoPin(e.target.value)}
                                    placeholder="Sin PIN"
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Si defines un PIN, deberás compartirlo aparte. Quien abra el enlace tendrá que ingresarlo para enviar pedidos.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 mt-6">
                            <button onClick={() => setModalNueva(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">
                                Cancelar
                            </button>
                            <button
                                onClick={crearConvocatoria}
                                disabled={creando || !nuevaSubarea}
                                className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:brightness-105 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {creando && <Loader2 size={15} className="animate-spin" />}
                                Crear y generar enlace
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal rechazar pedido */}
            {rechazarModal.open && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setRechazarModal({ open: false, id_pedido: null, id_conv: null })}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-gray-900 mb-1">Rechazar pedido</h3>
                        <p className="text-xs text-gray-500 mb-4">Escribe un motivo opcional para el rechazo.</p>
                        <textarea
                            rows={3}
                            value={comentarioRechazo}
                            onChange={e => setComentarioRechazo(e.target.value)}
                            placeholder="Motivo del rechazo (opcional)..."
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 resize-none"
                        />
                        <div className="flex justify-end gap-3 mt-4">
                            <button onClick={() => setRechazarModal({ open: false, id_pedido: null, id_conv: null })} className="px-4 py-2 text-sm text-gray-600 font-medium">
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    actualizarPedido(rechazarModal.id_conv!, rechazarModal.id_pedido!, 'rechazado', comentarioRechazo);
                                    setRechazarModal({ open: false, id_pedido: null, id_conv: null });
                                }}
                                className="px-5 py-2 bg-red-500 text-white text-sm font-bold rounded-xl hover:bg-red-600 active:scale-95 transition-all"
                            >
                                Rechazar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal editar pedido */}
            {editarModal.open && editarModal.pedido && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditarModal({ open: false, id_conv: null, pedido: null })}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-gray-900 mb-1">Editar pedido</h3>
                        <p className="text-xs text-gray-500 mb-4">Ajusta los datos antes de aceptar e importar al presupuesto.</p>

                        {errorEdit && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2 mb-4">
                                {errorEdit}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre del recurso</label>
                                <input
                                    type="text"
                                    value={editForm.nombre_recurso}
                                    onChange={e => setEditForm(f => ({ ...f, nombre_recurso: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Descripción (opcional)</label>
                                <input
                                    type="text"
                                    value={editForm.descripcion}
                                    onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Formato</label>
                                    <select
                                        value={editForm.formato_unidad}
                                        onChange={e => setEditForm(f => ({ ...f, formato_unidad: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                    >
                                        {FORMATOS_UNIDAD.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Cantidad</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={editForm.cantidad}
                                        onChange={e => setEditForm(f => ({ ...f, cantidad: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Precio unit.</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={editForm.precio_estimado}
                                        onChange={e => setEditForm(f => ({ ...f, precio_estimado: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                    />
                                </div>
                            </div>
                            {editForm.cantidad && editForm.precio_estimado && (
                                <p className="text-xs text-gray-500">
                                    Total: <span className="font-bold text-gray-800">{fmt(parseFloat(editForm.cantidad) * parseFloat(editForm.precio_estimado))}</span>
                                </p>
                            )}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Motivo / justificación</label>
                                <textarea
                                    rows={2}
                                    value={editForm.motivo}
                                    onChange={e => setEditForm(f => ({ ...f, motivo: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">¿Para quién / qué es?</label>
                                <select
                                    value={editForm.destino}
                                    onChange={e => setEditForm(f => ({ ...f, destino: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                >
                                    <option value="">Sin especificar</option>
                                    {DESTINOS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Mes requerido</label>
                                <select
                                    value={editForm.fecha_ejecucion ? editForm.fecha_ejecucion.substring(5, 7) : ''}
                                    onChange={e => handleMesChange(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                >
                                    <option value="">Seleccionar mes...</option>
                                    {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                            {editarModal.pedido?.actividad_pme_nombre && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Actividad del PME</label>
                                    <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">{editarModal.pedido.actividad_pme_nombre}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-3 mt-6">
                            <button onClick={() => setEditarModal({ open: false, id_conv: null, pedido: null })} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">
                                Cancelar
                            </button>
                            <button
                                onClick={guardarEdit}
                                disabled={guardandoEdit}
                                className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:brightness-105 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {guardandoEdit && <Loader2 size={15} className="animate-spin" />}
                                Guardar cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
