'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api/client';
import { BudgetRequest, PresupuestoAnual } from '@/lib/types';
import {
    ArrowLeft, Building2, ChevronLeft, ChevronRight, ClipboardList, Edit3, Eye, Loader2, Package, Search, X,
} from 'lucide-react';
import { FiltroMultiSelectGenerico } from '@/components/presupuesto/FiltroMultiSelectGenerico';
import EditarContralorModal, { DetalleEditable, ModoEdicionContralor } from '@/components/presupuesto/EditarContralorModal';
import { SinAccesoContralor, useAccesoRevisionContralor } from '@/components/go-contralor/accesoRevision';
import { etiquetaDestinoCorta } from '@/lib/destinos';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ESTADOS = ['Sin Revisar', 'Aprobado', 'Con Ajustes', 'Pendiente', 'Rechazado'];
const POR_PAGINA = 50;
const SIN_CODIGO = '(Sin código)';
const SIN_DESTINO = '(Sin destino)';

const formatCLP = (value: number) => `$${Math.round(value || 0).toLocaleString('es-CL')}`;

const labelMes = (fecha?: string, tipo?: string) => {
    const m = Number((fecha || '').split('-')[1]);
    return m >= 1 && m <= 12 ? MESES[m - 1] : (tipo || 'N/A');
};

const estadoNormal = (e?: string) => {
    const v = (e || '').trim();
    if (!v) return 'Sin Revisar';
    if (v.toLowerCase() === 'aprobado con ajustes') return 'Con Ajustes';
    return v;
};

const ESTILO_ESTADO: Record<string, string> = {
    'Sin Revisar': 'bg-gray-100 text-gray-700',
    'Aprobado': 'bg-green-50 text-green-700',
    'Con Ajustes': 'bg-indigo-50 text-indigo-700',
    'Pendiente': 'bg-amber-50 text-amber-700',
    'Rechazado': 'bg-red-50 text-red-700',
};

interface Item {
    id_presupuesto: number;
    codigo_solicitud: string;
    area_nombre: string;
    user_nombre: string;
    solicitante: string;   // cargo del ítem o, si no tiene, el de la solicitud
    colegio_nombre: string;
    id_pre_detalle: number;
    nombre_producto: string;
    descripcion: string;
    categoria_nombre: string;
    formato_unidad: string;
    cantidad: number;
    valor_unitario_iva: number;
    total_iva: number;
    fecha_ejecucion: string;
    tipo_fecha: string;
    mes: string;
    motivo: string;
    actividad_nombre: string;
    id_actividad: number | null;
    id_subvencion: number | null;
    subvencion_nombre: string;
    codigo_cuenta: string;
    grupo_nombre: string;
    estado: string;
    id_recurso: number | null;
    destino_gasto: string | null;
    destino: string;       // etiqueta corta ("Estudiantes", "Funcionarios"…)
}

export default function RevisionPresupuestoDetallePage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { isLoading, puedeVer, puedeEditar } = useAccesoRevisionContralor();

    const [ppto, setPpto] = useState<PresupuestoAnual | null>(null);
    const [solicitudes, setSolicitudes] = useState<BudgetRequest[]>([]);
    const [subvenciones, setSubvenciones] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [vista, setVista] = useState<'solicitudes' | 'recursos'>('solicitudes');
    const [edicion, setEdicion] = useState<{ detalle: DetalleEditable; modo: ModoEdicionContralor; subvencionInicial?: number } | null>(null);

    // Filtros de solicitudes
    const [busquedaSol, setBusquedaSol] = useState('');
    const [estadoSol, setEstadoSol] = useState('todos');

    // Filtros de recursos
    const [texto, setTexto] = useState('');
    const [estado, setEstado] = useState('todos');
    const [actividad, setActividad] = useState('todos');
    const [categoria, setCategoria] = useState('todos');
    const [subvencion, setSubvencion] = useState('todos');
    const [meses, setMeses] = useState<string[]>([]);
    const [areas, setAreas] = useState<string[]>([]);
    const [lineas, setLineas] = useState<string[]>([]);
    const [codigos, setCodigos] = useState<string[]>([]);
    const [destinos, setDestinos] = useState<string[]>([]);
    const [solicitudSel, setSolicitudSel] = useState<string[]>([]);
    const [pagina, setPagina] = useState(1);

    const cargar = useCallback(async () => {
        const [resPpto, resSol] = await Promise.all([
            api.get(`/presupuesto/contralor/presupuestos-anuales/${id}`),
            api.get(`/presupuesto/contralor/presupuestos-anuales/${id}/solicitudes`),
        ]);
        setPpto(resPpto.data);
        setSolicitudes(resSol.data || []);
    }, [id]);

    useEffect(() => {
        if (isLoading || !puedeVer) return;
        setLoading(true);
        Promise.all([
            cargar(),
            api.get('/presupuesto/contralor/subvenciones').then(r => setSubvenciones(r.data || [])).catch(() => {}),
        ])
            .catch(e => setError(e?.response?.data?.detail || 'No se pudo cargar el presupuesto.'))
            .finally(() => setLoading(false));
    }, [isLoading, puedeVer, cargar]);

    const codigoSol = (s: BudgetRequest) =>
        s.codigo || `REQ-${new Date(s.fecha).getFullYear()}-${String(s.id_presupuesto).padStart(3, '0')}`;

    const items: Item[] = useMemo(() => solicitudes.flatMap(s => (s.detalles || []).map(d => {
        const dd = d as any;
        return {
            id_presupuesto: s.id_presupuesto,
            codigo_solicitud: codigoSol(s),
            area_nombre: (s.area_nombre || '').trim(),
            user_nombre: s.user_nombre || '',
            solicitante: (d.cargo_nombre || d.subarea_nombre || s.subarea_nombre || '').trim(),
            colegio_nombre: s.colegio_nombre || '',
            id_pre_detalle: d.id_pre_detalle,
            nombre_producto: d.nombre_producto,
            descripcion: d.descripcion || '',
            categoria_nombre: (d.categoria_nombre || '').trim(),
            formato_unidad: d.formato_unidad,
            cantidad: d.cantidad || 0,
            valor_unitario_iva: d.valor_unitario_iva || 0,
            total_iva: d.total_iva || 0,
            fecha_ejecucion: d.fecha_ejecucion,
            tipo_fecha: d.tipo_fecha,
            mes: labelMes(d.fecha_ejecucion, d.tipo_fecha),
            motivo: d.motivo || '',
            actividad_nombre: (d.actividad_nombre || '').trim(),
            id_actividad: d.id_actividad ?? null,
            id_subvencion: d.id_subvencion ?? null,
            subvencion_nombre: dd.subvencion_nombre || 'GENERAL',
            codigo_cuenta: d.codigo_cuenta || '',
            grupo_nombre: (d.grupo_nombre || '').trim(),
            estado: estadoNormal(d.estado_aprobacion),
            id_recurso: d.id_recurso ?? null,
            destino_gasto: d.destino_gasto ?? null,
            destino: etiquetaDestinoCorta(d.destino_gasto) || (d.destino_gasto || '').trim() || SIN_DESTINO,
        };
    })), [solicitudes]);

    // ── Solicitudes ────────────────────────────────────────────────────────
    const solicitudesFiltradas = useMemo(() => {
        const q = busquedaSol.toLowerCase().trim();
        return solicitudes.filter(s =>
            (estadoSol === 'todos' || s.estado === estadoSol) &&
            (!q || codigoSol(s).toLowerCase().includes(q)
                || (s.area_nombre || '').toLowerCase().includes(q)
                || (s.subarea_nombre || '').toLowerCase().includes(q)
                || (s.user_nombre || '').toLowerCase().includes(q))
        );
    }, [solicitudes, busquedaSol, estadoSol]);
    const estadosSolicitud = useMemo(() => Array.from(new Set(solicitudes.map(s => s.estado))).sort(), [solicitudes]);

    const verRecursosDe = (s: BudgetRequest) => {
        setSolicitudSel([codigoSol(s)]);
        setVista('recursos');
    };

    // ── Recursos ───────────────────────────────────────────────────────────
    const codigoDe = (i: Item) => i.codigo_cuenta || SIN_CODIGO;
    const base = useMemo(() => {
        const q = texto.toLowerCase().trim();
        return items.filter(i =>
            (!q || [i.codigo_solicitud, i.nombre_producto, i.descripcion, i.motivo, i.categoria_nombre, i.area_nombre, i.solicitante, i.user_nombre, i.codigo_cuenta, i.destino]
                .some(v => v.toLowerCase().includes(q))) &&
            (actividad === 'todos' || i.actividad_nombre === actividad) &&
            (categoria === 'todos' || i.categoria_nombre === categoria) &&
            (subvencion === 'todos' || i.subvencion_nombre === subvencion) &&
            (meses.length === 0 || meses.includes(i.mes)) &&
            (areas.length === 0 || areas.includes(i.area_nombre)) &&
            (lineas.length === 0 || lineas.includes(i.grupo_nombre)) &&
            (codigos.length === 0 || codigos.includes(codigoDe(i))) &&
            (destinos.length === 0 || destinos.includes(i.destino)) &&
            (solicitudSel.length === 0 || solicitudSel.includes(i.codigo_solicitud))
        );
    }, [items, texto, actividad, categoria, subvencion, meses, areas, lineas, codigos, destinos, solicitudSel]);
    const filtrados = useMemo(() => base.filter(i => estado === 'todos' || i.estado === estado), [base, estado]);

    const conteoEstados = useMemo(() => {
        const c: Record<string, number> = { todos: base.length };
        base.forEach(i => { c[i.estado] = (c[i.estado] || 0) + 1; });
        return c;
    }, [base]);

    const opciones = (valor: (i: Item) => string, orden?: (a: string, b: string) => number) => {
        const c: Record<string, number> = {};
        items.forEach(i => { const v = valor(i); if (v) c[v] = (c[v] || 0) + 1; });
        return Object.keys(c).sort(orden || ((a, b) => a.localeCompare(b, 'es'))).map(v => ({ valor: v, label: v, count: c[v] }));
    };
    const opcionesMes = useMemo(() => opciones(i => i.mes, (a, b) => {
        const ia = MESES.indexOf(a), ib = MESES.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    }), [items]); // eslint-disable-line react-hooks/exhaustive-deps
    const opcionesArea = useMemo(() => opciones(i => i.area_nombre), [items]); // eslint-disable-line react-hooks/exhaustive-deps
    const opcionesLinea = useMemo(() => opciones(i => i.grupo_nombre), [items]); // eslint-disable-line react-hooks/exhaustive-deps
    const opcionesCodigo = useMemo(() => opciones(codigoDe, (a, b) => (a === SIN_CODIGO ? -1 : b === SIN_CODIGO ? 1 : a.localeCompare(b))), [items]); // eslint-disable-line react-hooks/exhaustive-deps
    const opcionesDestino = useMemo(() => opciones(i => i.destino, (a, b) => (a === SIN_DESTINO ? 1 : b === SIN_DESTINO ? -1 : a.localeCompare(b, 'es'))), [items]); // eslint-disable-line react-hooks/exhaustive-deps
    const opcionesSolicitud = useMemo(() => opciones(i => i.codigo_solicitud), [items]); // eslint-disable-line react-hooks/exhaustive-deps
    const listaActividades = useMemo(() => Array.from(new Set(items.map(i => i.actividad_nombre).filter(Boolean))).sort(), [items]);
    const listaCategorias = useMemo(() => Array.from(new Set(items.map(i => i.categoria_nombre).filter(Boolean))).sort(), [items]);
    const listaSubvenciones = useMemo(() => Array.from(new Set(items.map(i => i.subvencion_nombre))).sort(), [items]);

    const hayFiltros = texto || estado !== 'todos' || actividad !== 'todos' || categoria !== 'todos' || subvencion !== 'todos'
        || meses.length || areas.length || lineas.length || codigos.length || destinos.length || solicitudSel.length;
    const limpiarFiltros = () => {
        setTexto(''); setEstado('todos'); setActividad('todos'); setCategoria('todos'); setSubvencion('todos');
        setMeses([]); setAreas([]); setLineas([]); setCodigos([]); setDestinos([]); setSolicitudSel([]);
    };

    useEffect(() => { setPagina(1); }, [texto, estado, actividad, categoria, subvencion, meses, areas, lineas, codigos, destinos, solicitudSel]);
    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
    const paginaActual = Math.min(pagina, totalPaginas);
    const visibles = filtrados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);

    const abrirEdicion = (i: Item, modo: ModoEdicionContralor, subvencionInicial?: number) => setEdicion({
        modo,
        subvencionInicial,
        detalle: {
            id_pre_detalle: i.id_pre_detalle,
            id_presupuesto: i.id_presupuesto,
            nombre_producto: i.nombre_producto,
            codigo_solicitud: i.codigo_solicitud,
            colegio_nombre: i.colegio_nombre,
            estado_aprobacion: i.estado,
            id_recurso: i.id_recurso,
            destino_gasto: i.destino_gasto,
            codigo_cuenta: i.codigo_cuenta || null,
            id_subvencion: i.id_subvencion,
            subvencion_nombre: i.subvencion_nombre,
            id_actividad: i.id_actividad,
            actividad_nombre: i.actividad_nombre || null,
        },
    });

    // Tras guardar, se reemplaza solo el ítem editado (sin recargar todo el presupuesto)
    const aplicarDetalle = (det: any) => {
        setSolicitudes(prev => prev.map(s => s.id_presupuesto !== det.id_presupuesto ? s : {
            ...s,
            detalles: (s.detalles || []).map(d => d.id_pre_detalle === det.id_pre_detalle ? { ...d, ...det } : d),
        }));
    };

    if (!isLoading && !puedeVer) return <SinAccesoContralor />;

    const selectCls = 'px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-2xs cursor-pointer max-w-[210px] truncate';

    return (
        <div className="animate-in fade-in duration-500">
            {/* Encabezado */}
            <button onClick={() => router.push('/go-contralor/presupuestos')} className="mb-3 text-xs font-bold text-gray-500 hover:text-primary flex items-center gap-1 cursor-pointer">
                <ArrowLeft size={14} /> Revisión de Presupuestos
            </button>
            <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">{ppto?.nombre || 'Presupuesto'}</h2>
                    <p className="text-gray-500 mt-1 font-medium flex items-center gap-1.5">
                        <Building2 size={15} className="text-primary" /> {ppto?.colegio_nombre || '—'} · {ppto?.year}
                        {!puedeEditar && <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-bold">Solo lectura</span>}
                    </p>
                </div>
                <div className="flex gap-3 text-sm">
                    <div className="px-4 py-2 bg-white rounded-xl border border-gray-100"><span className="text-gray-400 text-xs block">Solicitudes</span><b>{solicitudes.length}</b></div>
                    <div className="px-4 py-2 bg-white rounded-xl border border-gray-100"><span className="text-gray-400 text-xs block">Recursos</span><b>{items.length}</b></div>
                    <div className="px-4 py-2 bg-white rounded-xl border border-gray-100"><span className="text-gray-400 text-xs block">Monto</span><b>{formatCLP(items.reduce((a, i) => a + i.total_iva, 0))}</b></div>
                </div>
            </div>

            {/* Vistas */}
            <div className="inline-flex bg-gray-200/60 p-1 rounded-xl border border-gray-200/80 shadow-inner gap-1 mb-4">
                {([['solicitudes', 'Solicitudes', ClipboardList], ['recursos', 'Todos los Recursos', Package]] as const).map(([k, l, Icono]) => (
                    <button key={k} onClick={() => setVista(k)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-all ${vista === k ? 'bg-white text-primary shadow-xs ring-1 ring-black/5' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}>
                        <Icono size={15} /> {l}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <Loader2 className="animate-spin" size={28} />
                    <span className="text-sm font-semibold">Cargando solicitudes...</span>
                </div>
            ) : error ? (
                <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">{error}</div>
            ) : vista === 'solicitudes' ? (
                <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input value={busquedaSol} onChange={e => setBusquedaSol(e.target.value)} placeholder="Buscar por código, área, cargo o usuario..."
                                className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" />
                        </div>
                        <select value={estadoSol} onChange={e => setEstadoSol(e.target.value)} className={selectCls}>
                            <option value="todos">Todos los estados</option>
                            {estadosSolicitud.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 text-xs">
                            <thead className="bg-gray-50/80">
                                <tr className="text-left text-gray-500 uppercase font-bold">
                                    <th className="px-4 py-3">Solicitud</th>
                                    <th className="px-4 py-3">Fecha</th>
                                    <th className="px-4 py-3">Área / Cargo</th>
                                    <th className="px-4 py-3">Usuario</th>
                                    <th className="px-4 py-3 text-right">Recursos</th>
                                    <th className="px-4 py-3 text-right">Monto</th>
                                    <th className="px-4 py-3">Estado</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {solicitudesFiltradas.map(s => {
                                    const sinCodigo = (s.detalles || []).filter(d => !d.codigo_cuenta).length;
                                    return (
                                        <tr key={s.id_presupuesto} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{codigoSol(s)}</td>
                                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{new Date(s.fecha).toLocaleDateString('es-CL')}</td>
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-gray-900">{s.area_nombre || 'N/A'}</div>
                                                {s.subarea_nombre && <div className="text-[11px] text-primary">{s.subarea_nombre}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600">{s.user_nombre || '—'}</td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <b>{(s.detalles || []).length}</b>
                                                {sinCodigo > 0 && <div className="text-[10px] text-amber-600 font-semibold">{sinCodigo} sin código</div>}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold whitespace-nowrap">{formatCLP(s.monto_total)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-bold text-[11px]">{s.estado}</span></td>
                                            <td className="px-4 py-3 text-right">
                                                <button onClick={() => verRecursosDe(s)} className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap">
                                                    <Eye size={13} /> Ver recursos
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {solicitudesFiltradas.length === 0 && (
                                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 italic">No hay solicitudes.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                    {/* Filtros */}
                    <div className="p-4 border-b border-gray-100 bg-slate-50/50 space-y-3">
                        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
                            <div className="relative flex-1 min-w-[260px]">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por producto, motivo, código, solicitante, área..."
                                    className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" />
                                {texto && (
                                    <button onClick={() => setTexto('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1" title="Limpiar"><X size={14} /></button>
                                )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                {listaActividades.length > 0 && (
                                    <select value={actividad} onChange={e => setActividad(e.target.value)} className={selectCls}>
                                        <option value="todos">Todas las Actividades PME</option>
                                        {listaActividades.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                )}
                                {listaCategorias.length > 0 && (
                                    <select value={categoria} onChange={e => setCategoria(e.target.value)} className={selectCls}>
                                        <option value="todos">Todas las Categorías</option>
                                        {listaCategorias.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                )}
                                <select value={subvencion} onChange={e => setSubvencion(e.target.value)} className={selectCls}>
                                    <option value="todos">Todas las Subvenciones</option>
                                    {listaSubvenciones.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <FiltroMultiSelectGenerico icono="📋" tituloVacio="Todas las solicitudes" tituloPlural="solicitudes" seleccionados={solicitudSel} onChange={setSolicitudSel} opciones={opcionesSolicitud} placeholderBusqueda="Buscar solicitud..." anchoMinimo="min-w-[240px]" />
                                <FiltroMultiSelectGenerico icono="📅" tituloVacio="Todos los meses" tituloPlural="meses" seleccionados={meses} onChange={setMeses} opciones={opcionesMes} placeholderBusqueda="Buscar mes..." anchoMinimo="min-w-[220px]" />
                                <FiltroMultiSelectGenerico icono="🏢" tituloVacio="Todas las áreas" tituloPlural="áreas" seleccionados={areas} onChange={setAreas} opciones={opcionesArea} placeholderBusqueda="Buscar área..." anchoMinimo="min-w-[240px]" />
                                {opcionesLinea.length > 0 && (
                                    <FiltroMultiSelectGenerico icono="🏷️" tituloVacio="Todas las líneas" tituloPlural="líneas" seleccionados={lineas} onChange={setLineas} opciones={opcionesLinea} placeholderBusqueda="Buscar línea..." anchoMinimo="min-w-[260px]" />
                                )}
                                <FiltroMultiSelectGenerico icono="🎯" tituloVacio="Todos los destinos" tituloPlural="destinos" seleccionados={destinos} onChange={setDestinos} opciones={opcionesDestino} placeholderBusqueda="Buscar destino..." anchoMinimo="min-w-[220px]" />
                                <FiltroMultiSelectGenerico icono="🔢" tituloVacio="Todos los códigos" tituloPlural="códigos" seleccionados={codigos} onChange={setCodigos} opciones={opcionesCodigo} placeholderBusqueda="Buscar código..." anchoMinimo="min-w-[220px]" />
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-200/60">
                            <div className="inline-flex bg-gray-200/60 p-1 rounded-xl border border-gray-200/80 shadow-inner flex-wrap gap-1">
                                {['todos', ...ESTADOS].map(k => {
                                    const activo = estado === k;
                                    return (
                                        <button key={k} onClick={() => setEstado(k)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all ${activo ? 'bg-white text-primary shadow-xs ring-1 ring-black/5' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}>
                                            {k === 'todos' ? 'Todos' : k}
                                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${activo ? 'bg-primary/10 text-primary' : 'bg-gray-300/60 text-gray-700'}`}>{conteoEstados[k] || 0}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            {hayFiltros ? (
                                <button onClick={limpiarFiltros} className="text-xs font-bold text-gray-500 hover:text-red-600 flex items-center gap-1 cursor-pointer"><X size={13} /> Limpiar filtros</button>
                            ) : null}
                        </div>
                    </div>

                    {/* Tabla */}
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 text-xs">
                            <thead className="bg-gray-50/80">
                                <tr className="text-left text-gray-500 uppercase font-bold">
                                    <th className="px-3.5 py-3">Producto</th>
                                    <th className="px-3.5 py-3">Área / Solicitante</th>
                                    <th className="px-3.5 py-3">Cant. / Valores</th>
                                    <th className="px-3.5 py-3 min-w-[240px]">Mes y Justificación</th>
                                    <th className="px-3.5 py-3">Destino</th>
                                    <th className="px-3.5 py-3">Línea</th>
                                    <th className="px-3.5 py-3">Subvención</th>
                                    <th className="px-3.5 py-3">Código Contable</th>
                                    <th className="px-3.5 py-3">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {visibles.map(i => (
                                    <tr key={i.id_pre_detalle} className="hover:bg-gray-50/60 align-top">
                                        <td className="px-3.5 py-3.5 max-w-[260px]">
                                            <div className="font-bold text-gray-900">{i.nombre_producto}</div>
                                            {i.descripcion && <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{i.descripcion}</div>}
                                            <div className="text-[10px] text-gray-400 mt-1">{i.codigo_solicitud}{i.categoria_nombre ? ` · ${i.categoria_nombre}` : ''}</div>
                                        </td>
                                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                                            <div className="font-semibold text-gray-900">{i.area_nombre || 'N/A'}</div>
                                            {i.solicitante && <div className="text-[11px] font-medium text-primary mt-0.5">{i.solicitante}</div>}
                                        </td>
                                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                                            <div className="font-semibold text-gray-800">{i.cantidad} <span className="text-[11px] font-normal text-gray-500">({i.formato_unidad})</span></div>
                                            <div className="text-[11px] text-gray-500 mt-0.5">Unit: {formatCLP(i.valor_unitario_iva)}</div>
                                            <div className="font-bold text-blue-700 mt-0.5">Total: {formatCLP(i.total_iva)}</div>
                                        </td>
                                        <td className="px-3.5 py-3.5 max-w-[280px]">
                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-50 text-blue-800 border border-blue-200">{i.mes}</span>
                                            <div className="text-gray-700 whitespace-pre-wrap break-words leading-relaxed mt-1">{i.motivo || '-'}</div>
                                            {i.actividad_nombre ? (
                                                <div className="text-[10px] text-gray-400 mt-1 leading-tight">
                                                    <span className="font-semibold text-gray-600">PME:</span> {i.actividad_nombre}
                                                    {puedeEditar && (
                                                        <button onClick={() => abrirEdicion(i, 'actividad')} className="ml-1 inline-flex align-middle p-0.5 text-gray-400 hover:text-violet-700 hover:bg-violet-50 rounded cursor-pointer" title="Cambiar actividad PME" aria-label="Cambiar actividad PME">
                                                            <Edit3 size={11} />
                                                        </button>
                                                    )}
                                                </div>
                                            ) : puedeEditar ? (
                                                <button onClick={() => abrirEdicion(i, 'actividad')} className="mt-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 hover:underline cursor-pointer">
                                                    + Asignar actividad PME
                                                </button>
                                            ) : null}
                                        </td>
                                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                                            {i.destino !== SIN_DESTINO
                                                ? <span className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-700 text-[11px] font-bold border border-teal-100" title={i.destino_gasto || ''}>{i.destino}</span>
                                                : <span className="text-[11px] text-amber-600 font-semibold italic">Sin destino</span>}
                                        </td>
                                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                                            {i.grupo_nombre
                                                ? <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-bold border border-indigo-100">{i.grupo_nombre}</span>
                                                : <span className="text-[11px] text-gray-400 italic">Sin línea</span>}
                                        </td>
                                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                                            {puedeEditar ? (
                                                <select
                                                    value={i.id_subvencion || ''}
                                                    onChange={e => {
                                                        const val = Number(e.target.value);
                                                        if (val && val !== i.id_subvencion) abrirEdicion(i, 'subvencion', val);
                                                    }}
                                                    className="px-2 py-1 bg-violet-50/80 hover:bg-violet-100/80 text-violet-700 border border-violet-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer max-w-[125px] truncate"
                                                >
                                                    <option value="" disabled>Tipo Subvención</option>
                                                    {subvenciones.map(s => <option key={s.id_subvencion} value={s.id_subvencion}>{s.nombre_corto || s.nombre}</option>)}
                                                </select>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-bold border border-violet-200">{i.subvencion_nombre}</span>
                                            )}
                                        </td>
                                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                {i.codigo_cuenta
                                                    ? <span className="font-mono font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">{i.codigo_cuenta}</span>
                                                    : <span className="text-[11px] text-amber-600 font-semibold italic">Sin código</span>}
                                                {puedeEditar && (
                                                    <button onClick={() => abrirEdicion(i, 'codigo')} className="p-1 text-gray-400 hover:text-violet-700 hover:bg-violet-50 rounded-md cursor-pointer" title="Cambiar código contable" aria-label="Cambiar código contable">
                                                        <Edit3 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${ESTILO_ESTADO[i.estado] || 'bg-gray-100 text-gray-700'}`}>{i.estado}</span>
                                        </td>
                                    </tr>
                                ))}
                                {visibles.length === 0 && (
                                    <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 italic">No hay recursos con estos filtros.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Paginación */}
                    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                        <span>{filtrados.length} recurso(s){filtrados.length > 0 && ` · ${formatCLP(filtrados.reduce((a, i) => a + i.total_iva, 0))}`}</span>
                        {totalPaginas > 1 && (
                            <div className="flex items-center gap-2">
                                <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaActual === 1} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 cursor-pointer"><ChevronLeft size={15} /></button>
                                <span className="font-semibold">Página {paginaActual} de {totalPaginas}</span>
                                <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 cursor-pointer"><ChevronRight size={15} /></button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {edicion && (
                <EditarContralorModal
                    detalle={edicion.detalle}
                    modo={edicion.modo}
                    subvencionInicial={edicion.subvencionInicial}
                    subvenciones={subvenciones}
                    onClose={() => setEdicion(null)}
                    onGuardado={(det) => {
                        setEdicion(null);
                        aplicarDetalle(det);
                    }}
                />
            )}
        </div>
    );
}
