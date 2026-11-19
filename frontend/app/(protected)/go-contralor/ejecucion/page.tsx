'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import axios from 'axios';
import {
    AlertTriangle, ArrowLeftRight, CalendarClock, Download, Info, Layers, ListFilter, Loader2,
    EyeOff, Receipt, Scale, School, Calendar, X,
} from 'lucide-react';
import api from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { primeraRutaAccesible } from '@/lib/permissions/registry';
import { FiltroMultiSelectGenerico } from '@/components/presupuesto/FiltroMultiSelectGenerico';
import BotonRecargarOC from '@/components/go-contralor/BotonRecargarOC';
import DetalleEjecucionModal, { FilaEjecucion, pctEjecucion, tieneAlerta } from '@/components/presupuesto/DetalleEjecucionModal';

/**
 * Presupuesto vs Ejecutado: presupuesto aprobado (solicitudes) contra las órdenes de
 * compra aprobadas en Softland (BD ordenes_compra, solo lectura). Ver INTEGRACION_PRESUPUESTO.md.
 */

type Agrupar = 'area' | 'cc' | 'area_cc';

interface Totales { presupuestado: number; solicitado: number; ejecutado: number; n_oc: number }
interface Opcion { key: string; label: string }
interface Resumen {
    oc_disponible: boolean;
    oc_error: string | null;
    ultima_sync: string | null;
    umbral_alerta: number;
    anio_ppto: number;
    anio_oc: number;
    anio_oc_auto: boolean;
    anios_ppto: number[];
    /** Presupuestos anuales vigentes del colegio (filtro de año de presupuesto) */
    presupuestos?: { anio: number; nombre: string }[];
    anios_oc: number[];
    estados: string[];
    por_estado: { estado: string; monto: number; incluido: boolean }[];
    excluidos: { key: string; label: string }[];
    filas: FilaEjecucion[];
    totales: Totales;
    mensual: { mes: number; presupuestado: number; ejecutado: number }[];
    historico: ({ anio: number } & Totales)[];
    opciones: { areas: Opcion[]; centros: Opcion[] };
    pendientes_mapeo: { areas: number; areas_revisar: number; centros: number };
}
interface Colegio { id_colegio: number; nombre: string }

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ESTADOS_INSUMO = ['Sin Revisar', 'Pendiente', 'Con Ajustes', 'Aprobado', 'Rechazado'];
const ESTADOS_DEFAULT = ESTADOS_INSUMO.filter(e => e !== 'Rechazado');
const LS_EXCLUIDOS = 'ejecucion.excluidos';
const ANIO_OC_MIN = 2019;
const ANIO_OC_MAX = 2030;
const COLOR_PPTO = '#6366f1';

function leerExcluidos(): string[] {
    try {
        if (typeof window === 'undefined') return [];
        const v = JSON.parse(window.localStorage.getItem(LS_EXCLUIDOS) || '[]');
        return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
    } catch { return []; }
}

/** ¿La exclusión `k` ("area|centro", parte vacía = cualquiera) cubre esta fila? */
function cubre(k: string, f: FilaEjecucion): boolean {
    const [a, c] = k.split('|');
    return (!a || a === f.area_key) && (!c || c === f.cc_key);
}
const COLOR_EJEC = '#059669';

const formatCLP = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v || 0)).toLocaleString('es-CL')}`;
const formatCorto = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`;
    if (a >= 1_000) return `$${Math.round(v / 1_000).toLocaleString('es-CL')}K`;
    return `$${Math.round(v)}`;
};
const formatPct = (p: number | null) => p === null ? '—' : `${p.toLocaleString('es-CL', { maximumFractionDigits: p < 10 ? 1 : 0 })}%`;

function BarraPct({ pct, umbral, planificacion = false }: { pct: number | null; umbral: number; planificacion?: boolean }) {
    if (pct === null) return <span className="text-gray-300">—</span>;
    const ancho = Math.min(pct, 100);
    // Planificación (Ppto ÷ Gasto): ámbar si el presupuesto no cubre el gasto de las OC
    const color = planificacion
        ? (pct < 100 ? 'bg-amber-500' : 'bg-emerald-600')
        : (pct > umbral ? 'bg-amber-500' : pct > 100 ? 'bg-orange-400' : 'bg-emerald-600');
    return (
        <div className="flex items-center gap-2 justify-end">
            <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${ancho}%` }} />
            </div>
            <span className="w-14 text-right font-bold text-gray-800">{formatPct(pct)}</span>
        </div>
    );
}

function Tarjeta({ titulo, valor, detalle, color }: { titulo: string; valor: string; detalle?: string; color?: string }) {
    return (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
            <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                {color && <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />}
                {titulo}
            </p>
            <p className="text-2xl font-extrabold text-gray-900 mt-1 tracking-tight">{valor}</p>
            {detalle && <p className="text-[11px] text-gray-400 mt-0.5">{detalle}</p>}
        </div>
    );
}

/** Barras agrupadas por mes (presupuestado vs ejecutado) con tooltip al pasar el cursor. */
function GraficoMensual({ datos, anioPpto, anioOc }: { datos: Resumen['mensual']; anioPpto: number; anioOc: number }) {
    const [hover, setHover] = useState<number | null>(null);
    const max = Math.max(1, ...datos.flatMap(d => [d.presupuestado, d.ejecutado]));
    const W = 720, H = 220, PADL = 52, PADB = 24, PADT = 10;
    const ancho = (W - PADL) / 12;
    const barW = Math.min(16, ancho / 3);
    const y = (v: number) => PADT + (H - PADT - PADB) * (1 - v / max);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(r => r * max);
    const barra = (x: number, v: number, color: string) => {
        const top = y(v), base = H - PADB;
        const h = Math.max(0, base - top);
        if (h <= 0) return null;
        const r = Math.min(4, h, barW / 2);
        // Esquinas superiores redondeadas, base recta sobre el eje
        return <path d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`} fill={color} />;
    };
    const d = hover !== null ? datos[hover] : null;

    return (
        <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Presupuestado y ejecutado por mes">
                {ticks.map((t, i) => (
                    <g key={i}>
                        <line x1={PADL} x2={W} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-gray-100" />
                        <text x={PADL - 6} y={y(t) + 3} textAnchor="end" className="fill-gray-400 text-[10px]">{formatCorto(t)}</text>
                    </g>
                ))}
                {datos.map((m, i) => {
                    const x0 = PADL + i * ancho + (ancho - barW * 2 - 2) / 2;
                    return (
                        <g key={m.mes}>
                            {hover === i && <rect x={PADL + i * ancho} y={PADT} width={ancho} height={H - PADT - PADB} className="fill-gray-50" />}
                            {barra(x0, m.presupuestado, COLOR_PPTO)}
                            {barra(x0 + barW + 2, m.ejecutado, COLOR_EJEC)}
                            <text x={PADL + i * ancho + ancho / 2} y={H - 8} textAnchor="middle" className="fill-gray-500 text-[10px]">{MESES_CORTO[i]}</text>
                            <rect x={PADL + i * ancho} y={0} width={ancho} height={H} fill="transparent"
                                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                        </g>
                    );
                })}
                <line x1={PADL} x2={W} y1={H - PADB} y2={H - PADB} stroke="currentColor" className="text-gray-200" />
            </svg>
            {d && hover !== null && (
                <div className="absolute top-2 pointer-events-none bg-white border border-gray-200 shadow-lg rounded-xl px-3 py-2 text-xs"
                    style={{ left: `${((PADL + hover * ancho + ancho / 2) / W) * 100}%`, transform: `translateX(${hover > 8 ? '-105%' : '5%'})` }}>
                    <p className="font-bold text-gray-800 mb-1">{MESES[hover]}{anioPpto !== anioOc && <span className="font-normal text-gray-400"> · {anioPpto} vs {anioOc}</span>}</p>
                    <p className="flex items-center gap-1.5 text-gray-600"><span className="w-2 h-2 rounded-sm" style={{ background: COLOR_PPTO }} />Presupuestado {anioPpto} <b className="ml-auto pl-3 text-gray-900">{formatCLP(d.presupuestado)}</b></p>
                    <p className="flex items-center gap-1.5 text-gray-600"><span className="w-2 h-2 rounded-sm" style={{ background: COLOR_EJEC }} />Ejecutado OC {anioOc} <b className="ml-auto pl-3 text-gray-900">{formatCLP(d.ejecutado)}</b></p>
                </div>
            )}
        </div>
    );
}

export default function EjecucionPage() {
    const router = useRouter();
    const { user, tienePermiso, puedeSeccion, isLoading: authLoading, colegioActivo } = useAuth();
    const puedeVer = puedeSeccion('presupuesto.solicitudes');
    const esMulticolegio = user?.rol?.codigo === 'ADM' || user?.rol?.codigo === 'SOS' || user?.rol?.codigo === 'GERENTE' || (user?.colegios && user.colegios.length > 1);

    const [colegios, setColegios] = useState<Colegio[]>([]);
    const [colegioId, setColegioId] = useState(() => String(colegioActivo || user?.id_colegio || ''));
    const [anioPpto, setAnioPpto] = useState(new Date().getFullYear());
    /** null = automático (mismo año del presupuesto, o el último con OC si aún no hay) */
    const [anioOcSel, setAnioOcSel] = useState<number | null>(null);
    const [agrupar, setAgrupar] = useState<Agrupar>('area');
    const [filtroMesesPpto, setFiltroMesesPpto] = useState<string[]>([]);
    const [filtroMesesOc, setFiltroMesesOc] = useState<string[]>([]);
    const [filtroEstados, setFiltroEstados] = useState<string[]>(ESTADOS_DEFAULT);
    /** Filas sacadas del análisis (por usuario, en este navegador) */
    const [excluidos, setExcluidos] = useState<string[]>(leerExcluidos);
    const [filtroAreas, setFiltroAreas] = useState<string[]>([]);
    const [filtroCentros, setFiltroCentros] = useState<string[]>([]);

    const [data, setData] = useState<Resumen | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [detalle, setDetalle] = useState<FilaEjecucion | null>(null);

    useEffect(() => {
        if (!authLoading && !puedeVer) router.replace(primeraRutaAccesible(tienePermiso, puedeSeccion) || '/dashboard');
    }, [authLoading, puedeVer, tienePermiso, puedeSeccion, router]);

    useEffect(() => {
        if (!colegioId && (colegioActivo || user?.id_colegio)) setColegioId(String(colegioActivo || user?.id_colegio));
    }, [colegioActivo, user, colegioId]);

    useEffect(() => {
        api.get('/catalogos/colegios').then(r => setColegios(r.data || [])).catch(() => setColegios([]));
    }, []);

    const mesesPpto = useMemo(() => filtroMesesPpto.map(Number).sort((a, b) => a - b), [filtroMesesPpto]);
    const mesesOc = useMemo(() => filtroMesesOc.map(Number).sort((a, b) => a - b), [filtroMesesOc]);

    const fetchData = useCallback(async () => {
        if (!puedeVer) return;
        setLoading(true);
        setError('');
        try {
            const p = new URLSearchParams({ anio_ppto: String(anioPpto), agrupar });
            if (colegioId) p.append('id_colegio', colegioId);
            if (anioOcSel !== null) p.append('anio_oc', String(anioOcSel));
            mesesPpto.forEach(m => p.append('meses_ppto', String(m)));
            mesesOc.forEach(m => p.append('meses_oc', String(m)));
            filtroEstados.forEach(e => p.append('estados', e));
            excluidos.forEach(k => p.append('excluir', k));
            filtroAreas.forEach(a => p.append('areas', a));
            filtroCentros.forEach(c => p.append('centros', c));
            const res = await api.get(`/presupuesto/ejecucion/resumen?${p.toString()}`);
            setData(res.data);
        } catch (e) {
            setError((axios.isAxiosError(e) && e.response?.data?.detail) || 'No se pudo cargar la comparación.');
        } finally {
            setLoading(false);
        }
    }, [puedeVer, anioPpto, agrupar, colegioId, anioOcSel, mesesPpto, mesesOc, filtroEstados, excluidos, filtroAreas, filtroCentros]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => {
        try { window.localStorage.setItem(LS_EXCLUIDOS, JSON.stringify(excluidos)); } catch { /* sin almacenamiento */ }
    }, [excluidos]);

    /** Check de una fila: desmarcar la saca del análisis; marcarla quita las exclusiones que la cubren. */
    const alternarFila = (f: FilaEjecucion) => setExcluidos(prev =>
        f.excluido ? prev.filter(k => !cubre(k, f)) : [...prev.filter(k => k !== f.key), f.key]);

    const umbral = data?.umbral_alerta ?? 150;
    const hoy = new Date().getFullYear();
    /** Solo los presupuestos anuales vigentes del colegio elegido */
    const presupuestos = useMemo(() => {
        const lista = data?.presupuestos || [];
        return lista.length ? lista : [{ anio: anioPpto, nombre: `Presupuesto ${anioPpto}` }];
    }, [data, anioPpto]);
    // Si el colegio no tiene presupuesto vigente para el año elegido, pasa al más reciente que sí tenga
    useEffect(() => {
        const lista = data?.presupuestos || [];
        if (lista.length && !lista.some(p => p.anio === anioPpto)) {
            setAnioPpto(lista[0].anio);
            setAnioOcSel(null);
        }
    }, [data, anioPpto]);
    const anioOc = data?.anio_oc ?? anioOcSel ?? anioPpto;
    /** Años de OC: rango fijo 2019–2030 (más cualquier año con datos fuera de ese rango) */
    const aniosOc = useMemo(() => {
        const s = new Set<number>([anioOc, ...(data?.anios_oc || [])]);
        for (let y = ANIO_OC_MIN; y <= ANIO_OC_MAX; y++) s.add(y);
        return Array.from(s).sort((a, b) => b - a);
    }, [data, anioOc]);
    const conOc = useMemo(() => new Set(data?.anios_oc || []), [data]);
    const planificacion = anioOc !== anioPpto;
    const cambiarAnioPpto = (y: number) => { setAnioPpto(y); setAnioOcSel(null); };

    const filas = data?.filas || [];
    const totales = data?.totales || { presupuestado: 0, solicitado: 0, ejecutado: 0, n_oc: 0 };
    const pctTotal = pctEjecucion(totales, planificacion);
    const nAlertas = filas.filter(f => !f.excluido && tieneAlerta(f, umbral, planificacion)).length;
    const ocEnCurso = anioOc === hoy;
    const pm = data?.pendientes_mapeo;
    const avisosMapeo = [
        pm?.areas ? `${pm.areas} área(s) de OC sin asignar` : '',
        pm?.areas_revisar ? `${pm.areas_revisar} área(s) de OC con nombre distinto al de la plataforma` : '',
        pm?.centros ? `${pm.centros} centro(s) de costo sin subvención` : '',
    ].filter(Boolean);
    const nombreMeses = (m: number[]) => m.length === 0 ? 'todo el año' : m.map(x => MESES_CORTO[x - 1]).join(', ');

    const exportarExcel = () => {
        if (!data) return;
        const colegioNombre = colegios.find(c => String(c.id_colegio) === colegioId)?.nombre || 'Todos los colegios';
        const filasXls = filas.map(f => {
            const pct = pctEjecucion(f, planificacion);
            const o: Record<string, string | number> = {};
            if (f.area !== null) o['Área'] = f.area;
            if (f.cc !== null) o['Centro de costo / Subvención'] = f.cc;
            o[`Presupuestado ${data.anio_ppto}`] = f.presupuestado;
            o[`Solicitado ${data.anio_ppto}`] = f.solicitado;
            o[`Ejecutado OC ${data.anio_oc}`] = f.ejecutado;
            o['N° OC'] = f.n_oc;
            o['Saldo'] = f.presupuestado - f.ejecutado;
            o[planificacion ? `% Ppto ${data.anio_ppto} / Gasto ${data.anio_oc}` : '% Ejecución'] = pct === null ? '' : Math.round(pct * 10) / 10;
            o['Aviso'] = !f.excluido && tieneAlerta(f, umbral, planificacion) ? 'Revisar' : '';
            o['En el análisis'] = f.excluido ? 'No (excluida)' : f.parcial ? 'Parcial' : 'Sí';
            return o;
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasXls), 'Comparación');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.mensual.map(m => ({
            Mes: MESES[m.mes - 1], [`Presupuestado ${data.anio_ppto}`]: m.presupuestado, [`Ejecutado OC ${data.anio_oc}`]: m.ejecutado,
        }))), 'Mensual');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.historico.map(h => ({
            Año: h.anio, Presupuestado: h.presupuestado, Solicitado: h.solicitado, 'Ejecutado OC': h.ejecutado, 'N° OC': h.n_oc,
        }))), 'Histórico');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
            { Filtro: 'Colegio', Valor: colegioNombre },
            { Filtro: 'Año presupuesto', Valor: data.anio_ppto },
            { Filtro: 'Meses presupuesto', Valor: nombreMeses(mesesPpto) },
            { Filtro: 'Estados de insumos', Valor: data.estados.join(', ') },
            { Filtro: 'Excluido del análisis', Valor: data.excluidos.map(e => e.label).join('; ') || 'Nada' },
            { Filtro: 'Año OC', Valor: data.anio_oc },
            { Filtro: 'Meses OC', Valor: nombreMeses(mesesOc) },
            { Filtro: 'OC actualizadas al', Valor: data.ultima_sync ? new Date(data.ultima_sync).toLocaleString('es-CL') : '' },
        ]), 'Filtros');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.por_estado.map(e => ({
            [`Estado insumo ${data.anio_ppto}`]: e.estado, Monto: e.monto, 'Incluido en presupuestado': e.incluido ? 'Sí' : 'No',
        }))), 'Por estado');
        const sufijo = data.anio_ppto === data.anio_oc ? `${data.anio_ppto}` : `P${data.anio_ppto}_OC${data.anio_oc}`;
        XLSX.writeFile(wb, `Presupuesto_vs_Ejecutado_${colegioNombre.replace(/\s+/g, '_')}_${sufijo}.xlsx`);
    };

    if (authLoading || !puedeVer) {
        return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="animate-spin" /></div>;
    }

    const colArea = agrupar !== 'cc';
    const colCC = agrupar !== 'area';

    return (
        <div className="animate-in fade-in duration-500 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><Scale size={26} /></div>
                    <div>
                        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Presupuesto vs Ejecutado</h2>
                        <p className="text-gray-500 mt-1 font-medium">Presupuesto aprobado comparado con las órdenes de compra aprobadas en Softland.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {data?.oc_disponible && <BotonRecargarOC ultimaSync={data.ultima_sync} onRecargar={fetchData} cargando={loading} />}
                    <Link href="/go-contralor/ordenes-compra"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:border-primary hover:text-primary">
                        <Receipt size={14} /> Ver órdenes de compra
                    </Link>
                    <button onClick={exportarExcel} disabled={!data || loading}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
                        <Download size={14} /> Excel
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
                <span className="flex items-center gap-2 text-xs font-semibold text-gray-500"><ListFilter size={16} className="text-gray-400" />Filtrar por:</span>
                <div className="relative">
                    <School size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <select value={colegioId} onChange={e => setColegioId(e.target.value)} disabled={!esMulticolegio}
                        className="pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-gray-50">
                        {esMulticolegio && <option value="">Todos los colegios</option>}
                        {colegios.map(c => <option key={c.id_colegio} value={c.id_colegio}>{c.nombre}</option>)}
                    </select>
                </div>
                <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-indigo-50/60 border border-indigo-100">
                    <span className="text-[11px] font-bold text-indigo-700 px-1.5">Presupuesto</span>
                    <div className="relative">
                        <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <select value={anioPpto} onChange={e => cambiarAnioPpto(Number(e.target.value))} title="Año del presupuesto anual"
                            className="pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary">
                            {presupuestos.map(p => <option key={p.anio} value={p.anio}>{p.nombre}</option>)}
                        </select>
                    </div>
                    <FiltroMultiSelectGenerico
                        icono="📅" tituloVacio="Todos los meses" tituloPlural="meses"
                        seleccionados={filtroMesesPpto} onChange={setFiltroMesesPpto}
                        opciones={MESES.map((m, i) => ({ valor: String(i + 1), label: m }))}
                        placeholderBusqueda="Buscar mes..." anchoMinimo="min-w-[180px]"
                    />
                    <FiltroMultiSelectGenerico
                        icono="✅" tituloVacio="Todos los estados" tituloPlural="estados"
                        seleccionados={filtroEstados} onChange={setFiltroEstados}
                        opciones={(data?.por_estado.map(e => e.estado) || ESTADOS_INSUMO).map(e => ({ valor: e, label: e }))}
                        placeholderBusqueda="Buscar estado..." anchoMinimo="min-w-[190px]"
                    />
                </div>
                <button type="button" title="Usar los mismos meses del presupuesto en las OC"
                    onClick={() => setFiltroMesesOc(filtroMesesPpto)}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                    <ArrowLeftRight size={16} />
                </button>
                <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
                    <span className="text-[11px] font-bold text-emerald-700 px-1.5">Órdenes de compra</span>
                    <div className="relative">
                        <Receipt size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <select value={anioOc} onChange={e => setAnioOcSel(Number(e.target.value))} title="Año de las órdenes de compra"
                            className="pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary">
                            {aniosOc.map(y => <option key={y} value={y}>{y}{y === anioPpto ? ' (mismo año)' : y === anioPpto - 1 ? ' (año anterior)' : ''}{data?.oc_disponible && !conOc.has(y) ? ' · sin OC' : ''}</option>)}
                        </select>
                    </div>
                    <FiltroMultiSelectGenerico
                        icono="📅" tituloVacio="Todos los meses" tituloPlural="meses"
                        seleccionados={filtroMesesOc} onChange={setFiltroMesesOc}
                        opciones={MESES.map((m, i) => ({ valor: String(i + 1), label: m }))}
                        placeholderBusqueda="Buscar mes..." anchoMinimo="min-w-[180px]"
                    />
                </div>
                <FiltroMultiSelectGenerico
                    icono="🏢" tituloVacio="Todas las áreas" tituloPlural="áreas"
                    seleccionados={filtroAreas} onChange={setFiltroAreas}
                    opciones={(data?.opciones.areas || []).map(o => ({ valor: o.key, label: o.label }))}
                    placeholderBusqueda="Buscar área..." anchoMinimo="min-w-[240px]"
                />
                <FiltroMultiSelectGenerico
                    icono="🏷️" tituloVacio="Todos los centros de costo" tituloPlural="centros"
                    seleccionados={filtroCentros} onChange={setFiltroCentros}
                    opciones={(data?.opciones.centros || []).map(o => ({ valor: o.key, label: o.label }))}
                    placeholderBusqueda="Buscar centro..." anchoMinimo="min-w-[260px]"
                />
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl ml-auto">
                    <Layers size={14} className="text-gray-400 mx-1.5" />
                    {([['area', 'Área'], ['cc', 'Centro de costo'], ['area_cc', 'Área × Centro']] as [Agrupar, string][]).map(([k, l]) => (
                        <button key={k} onClick={() => setAgrupar(k)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${agrupar === k ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                            {l}
                        </button>
                    ))}
                </div>
            </div>

            {/* Avisos */}
            {data && !data.oc_disponible && (
                <div className="flex gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-700">
                    <AlertTriangle size={18} className="shrink-0" />
                    <span>{data.oc_error || 'No hay datos de órdenes de compra en este servidor (no se encontró la base de OC). Solo se muestra el presupuesto.'}</span>
                </div>
            )}
            {data && avisosMapeo.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100 text-sm text-amber-800">
                    <Info size={18} className="shrink-0" />
                    <span>
                        Hay {avisosMapeo.map((t, i) => (
                            <React.Fragment key={i}>{i > 0 && (i === avisosMapeo.length - 1 ? ' y ' : ', ')}<b>{t}</b></React.Fragment>
                        ))}. Revísalo para que las OC se sumen a la fila correcta.
                    </span>
                    <Link href="/configuracion?tab=Ejecuci%C3%B3n%20OC" className="ml-auto text-xs font-bold underline">Configuración › Ejecución OC</Link>
                </div>
            )}
            {data && data.excluidos.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-gray-50 border border-gray-200 text-sm text-gray-700">
                    <EyeOff size={16} className="shrink-0 text-gray-500" />
                    <span className="font-semibold">{data.excluidos.length} excluido(s) del análisis:</span>
                    {data.excluidos.map(e => (
                        <button key={e.key} type="button" onClick={() => setExcluidos(prev => prev.filter(k => k !== e.key))}
                            title="Volver a incluir"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold hover:bg-gray-100">
                            {e.label} <X size={12} />
                        </button>
                    ))}
                    <span className="text-xs text-gray-500">Los totales, el gráfico y el histórico no los consideran.</span>
                    <button type="button" onClick={() => setExcluidos([])} className="ml-auto text-xs font-bold underline">Restaurar todas</button>
                </div>
            )}
            {data && planificacion && (
                <div className="flex gap-3 p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-sm text-indigo-800">
                    <Info size={18} className="shrink-0" />
                    <span>
                        Comparando el <b>presupuesto {anioPpto}</b> ({nombreMeses(mesesPpto)}) con lo <b>ejecutado en OC {anioOc}</b> ({nombreMeses(mesesOc)}).
                        El % indica cuánto del gasto real de {anioOc} cubre lo presupuestado para {anioPpto} (presupuesto ÷ gasto OC): bajo 100 % se presupuestó menos de lo que se gastó.
                        {data.anio_oc_auto && <> Se eligió {anioOc} porque {anioPpto} aún no tiene órdenes de compra.</>}
                    </span>
                </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}

            {loading && !data ? (
                <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="animate-spin mr-2" /> Cargando…</div>
            ) : data && (
                <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <Tarjeta titulo={`Presupuestado ${anioPpto}`} valor={formatCLP(totales.presupuestado)} color={COLOR_PPTO}
                            detalle={filtroEstados.length === 0 || filtroEstados.length === ESTADOS_INSUMO.length ? 'Todos los estados' : `Estados: ${data.estados.join(', ')}`} />
                        <Tarjeta titulo={`Ejecutado en OC ${anioOc}`} valor={formatCLP(totales.ejecutado)} color={COLOR_EJEC}
                            detalle={`${totales.n_oc.toLocaleString('es-CL')} órdenes de compra${ocEnCurso && data.ultima_sync ? ` · al ${new Date(data.ultima_sync).toLocaleDateString('es-CL')}` : ''}`} />
                        <Tarjeta titulo="Saldo" valor={formatCLP(totales.presupuestado - totales.ejecutado)}
                            detalle={totales.presupuestado - totales.ejecutado < 0
                                ? (planificacion ? `Se presupuestó menos que lo gastado en ${anioOc}` : 'Ejecutado supera lo presupuestado')
                                : (planificacion ? `Se presupuestó más que lo gastado en ${anioOc}` : 'Presupuesto disponible')} />
                        <Tarjeta titulo={planificacion ? `Ppto ${anioPpto} / Gasto ${anioOc}` : '% Ejecución'} valor={formatPct(pctTotal)}
                            detalle={nAlertas > 0 ? `${nAlertas} fila(s) para revisar` : ocEnCurso ? `OC ${anioOc} en curso: datos parciales` : undefined} />
                    </div>

                    {/* Desglose del presupuesto por estado del insumo */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-gray-500">Insumos {anioPpto} por estado:</span>
                        {data.por_estado.map(e => (
                            <button key={e.estado} type="button" title={e.incluido ? 'Incluido en presupuestado (clic para quitar)' : 'No incluido (clic para sumar)'}
                                onClick={() => setFiltroEstados(prev => {
                                    const base = prev.length ? prev : ESTADOS_INSUMO;
                                    return base.includes(e.estado) ? base.filter(x => x !== e.estado) : [...base, e.estado];
                                })}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-semibold transition-colors ${e.incluido ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-white border-gray-200 text-gray-400 line-through'}`}>
                                {e.estado} <span className="font-bold">{formatCorto(e.monto)}</span>
                            </button>
                        ))}
                    </div>

                    {/* Tabla principal */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs text-gray-500">
                                    <tr>
                                        <th className="pl-4 py-3 w-8" title="Incluir en el análisis" />
                                        {colArea && <th className="px-4 py-3 text-left font-semibold">Área</th>}
                                        {colCC && <th className="px-4 py-3 text-left font-semibold">Centro de costo · Subvención</th>}
                                        <th className="px-4 py-3 text-right font-semibold">Presupuestado {anioPpto}</th>
                                        <th className="px-4 py-3 text-right font-semibold">Ejecutado OC {anioOc}</th>
                                        <th className="px-4 py-3 text-right font-semibold">N° OC</th>
                                        <th className="px-4 py-3 text-right font-semibold">Saldo</th>
                                        <th className="px-4 py-3 text-right font-semibold">{planificacion ? `Ppto ${anioPpto} / Gasto ${anioOc}` : '% Ejecución'}</th>
                                        <th className="px-4 py-3 w-40" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filas.length === 0 && (
                                        <tr><td colSpan={13} className="px-4 py-12 text-center text-gray-400">Sin datos para los filtros seleccionados.</td></tr>
                                    )}
                                    {filas.map(f => {
                                        const pct = pctEjecucion(f, planificacion);
                                        const alerta = !f.excluido && tieneAlerta(f, umbral, planificacion);
                                        const saldo = f.presupuestado - f.ejecutado;
                                        const pendiente = f.area_key?.startsWith('oc') || f.cc_key?.startsWith('cc');
                                        return (
                                            <tr key={f.key} className={`hover:bg-gray-50/60 ${f.excluido ? 'opacity-45 bg-gray-50/50' : alerta ? 'bg-amber-50/30' : ''}`}>
                                                <td className="pl-4 py-2.5">
                                                    <input type="checkbox" checked={!f.excluido} onChange={() => alternarFila(f)}
                                                        title={f.excluido ? 'Volver a incluir en el análisis' : 'Quitar del análisis'}
                                                        aria-label={`Incluir ${[f.area, f.cc].filter(Boolean).join(' · ')} en el análisis`}
                                                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer" />
                                                </td>
                                                {colArea && (
                                                    <td className={`px-4 py-2.5 font-semibold ${pendiente || f.area_key === 'sin' ? 'text-gray-500 italic' : 'text-gray-800'}`}>
                                                        {f.area}
                                                        {f.parcial && <span className="ml-2 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded" title="Parte de esta fila está excluida del análisis">parcial</span>}
                                                    </td>
                                                )}
                                                {colCC && (
                                                    <td className={`px-4 py-2.5 ${f.cc_key?.startsWith('cc') ? 'text-gray-500 italic' : 'text-gray-700'}`}>
                                                        {f.cc}
                                                        {f.parcial && !colArea && <span className="ml-2 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded" title="Parte de esta fila está excluida del análisis">parcial</span>}
                                                    </td>
                                                )}
                                                <td className="px-4 py-2.5 text-right text-gray-800">{formatCLP(f.presupuestado)}</td>
                                                <td className="px-4 py-2.5 text-right font-bold text-gray-900">{formatCLP(f.ejecutado)}</td>
                                                <td className="px-4 py-2.5 text-right text-gray-500">{f.n_oc}</td>
                                                <td className={`px-4 py-2.5 text-right font-semibold ${saldo < 0 ? 'text-red-600' : 'text-gray-700'}`}>{formatCLP(saldo)}</td>
                                                <td className="px-4 py-2.5 text-right"><BarraPct pct={pct} umbral={umbral} planificacion={planificacion} /></td>
                                                <td className="px-4 py-2.5 text-right">
                                                    {alerta ? (
                                                        <button onClick={() => setDetalle(f)}
                                                            className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold hover:bg-amber-200">
                                                            <AlertTriangle size={12} /> ¿Por qué no cuadra?
                                                        </button>
                                                    ) : f.n_oc > 0 ? (
                                                        <button onClick={() => setDetalle(f)}
                                                            className="px-2.5 py-1 rounded-lg text-gray-500 text-[11px] font-bold hover:bg-gray-100">Ver OC</button>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                {filas.length > 0 && (
                                    <tfoot className="bg-gray-50 text-sm font-bold text-gray-900 border-t border-gray-100">
                                        <tr>
                                            <td className="px-4 py-3" colSpan={colArea && colCC ? 3 : 2}>Total{data.excluidos.length > 0 && <span className="ml-1 text-xs font-semibold text-gray-500">(sin excluidos)</span>}</td>
                                            <td className="px-4 py-3 text-right">{formatCLP(totales.presupuestado)}</td>
                                            <td className="px-4 py-3 text-right">{formatCLP(totales.ejecutado)}</td>
                                            <td className="px-4 py-3 text-right text-gray-500">{totales.n_oc}</td>
                                            <td className={`px-4 py-3 text-right ${totales.presupuestado - totales.ejecutado < 0 ? 'text-red-600' : ''}`}>{formatCLP(totales.presupuestado - totales.ejecutado)}</td>
                                            <td className="px-4 py-3 text-right"><BarraPct pct={pctTotal} umbral={umbral} planificacion={planificacion} /></td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                        <p className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-50">
                            Presupuestado = insumos de las solicitudes activas en los estados elegidos ({data.estados.join(', ')}), estén o no revisados. Ejecutado = gasto de las OC aprobadas en Softland (con IVA) y de las órdenes de pago (OPS).
                            {planificacion
                                ? <> % = presupuesto {anioPpto} ÷ gasto OC {anioOc}. Se marcan para revisar las filas donde el presupuesto no alcanza al gasto (bajo 100 %).</>
                                : <> Se marcan para revisar las filas sobre {umbral}% o con OC sin presupuesto.</>}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        {/* Mensual */}
                        <div className="xl:col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><CalendarClock size={16} className="text-gray-400" />Por mes · {planificacion ? `${anioPpto} vs OC ${anioOc}` : anioPpto}</h3>
                                <div className="flex items-center gap-4 text-xs text-gray-600">
                                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_PPTO }} />Presupuestado {anioPpto} (mes de ejecución)</span>
                                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_EJEC }} />Ejecutado OC {anioOc} (fecha OC)</span>
                                </div>
                            </div>
                            <GraficoMensual datos={data.mensual} anioPpto={anioPpto} anioOc={anioOc} />
                        </div>

                        {/* Histórico */}
                        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
                            <h3 className="text-sm font-bold text-gray-800 mb-1">Histórico por año</h3>
                            <p className="text-[11px] text-gray-400 mb-3">Presupuesto y OC de cada año, con los mismos filtros. Antes de 2026 solo hay ejecutado (referencia histórica). Clic para elegir el año del presupuesto.</p>
                            <table className="w-full text-xs">
                                <thead className="text-gray-500">
                                    <tr>
                                        <th className="py-1.5 text-left font-semibold">Año</th>
                                        <th className="py-1.5 text-right font-semibold">Presupuestado</th>
                                        <th className="py-1.5 text-right font-semibold">Ejecutado</th>
                                        <th className="py-1.5 text-right font-semibold">%</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {[...data.historico].reverse().map(h => (
                                        <tr key={h.anio} onClick={() => cambiarAnioPpto(h.anio)}
                                            className={`cursor-pointer hover:bg-gray-50 ${h.anio === anioPpto || h.anio === anioOc ? 'bg-primary/5 font-bold' : ''}`}>
                                            <td className="py-1.5 text-gray-800">{h.anio}</td>
                                            <td className="py-1.5 text-right text-gray-600">{h.presupuestado ? formatCorto(h.presupuestado) : '—'}</td>
                                            <td className="py-1.5 text-right text-gray-800">{h.ejecutado ? formatCorto(h.ejecutado) : '—'}</td>
                                            <td className="py-1.5 text-right text-gray-500">{formatPct(pctEjecucion(h))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {detalle && <DetalleEjecucionModal
                key={detalle.key}
                fila={detalle}
                onClose={() => setDetalle(null)}
                idColegio={colegioId}
                anioPpto={anioPpto}
                anioOc={anioOc}
                mesesOc={mesesOc}
                umbral={umbral}
            />}
        </div>
    );
}
