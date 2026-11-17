'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import axios from 'axios';
import {
    AlertTriangle, CalendarClock, Download, GitCompare, Info, Layers, ListFilter, Loader2,
    RefreshCw, Scale, School, Calendar,
} from 'lucide-react';
import api from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { primeraRutaAccesible } from '@/lib/permissions/registry';
import { FiltroMultiSelectGenerico } from '@/components/presupuesto/FiltroMultiSelectGenerico';
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
    anio: number;
    anio_comp: number | null;
    filas: FilaEjecucion[];
    totales: Totales;
    mensual: { mes: number; presupuestado: number; ejecutado: number }[];
    historico: ({ anio: number } & Totales)[];
    opciones: { areas: Opcion[]; centros: Opcion[] };
    pendientes_mapeo: { areas: number; centros: number };
}
interface Colegio { id_colegio: number; nombre: string }

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COLOR_PPTO = '#6366f1';
const COLOR_EJEC = '#059669';

const formatCLP = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v || 0)).toLocaleString('es-CL')}`;
const formatCorto = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`;
    if (a >= 1_000) return `$${Math.round(v / 1_000).toLocaleString('es-CL')}K`;
    return `$${Math.round(v)}`;
};
const formatPct = (p: number | null) => p === null ? '—' : `${p.toLocaleString('es-CL', { maximumFractionDigits: p < 10 ? 1 : 0 })}%`;

function BarraPct({ pct, umbral }: { pct: number | null; umbral: number }) {
    if (pct === null) return <span className="text-gray-300">—</span>;
    const ancho = Math.min(pct, 100);
    const color = pct > umbral ? 'bg-amber-500' : pct > 100 ? 'bg-orange-400' : 'bg-emerald-600';
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
function GraficoMensual({ datos }: { datos: Resumen['mensual'] }) {
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
                    <p className="font-bold text-gray-800 mb-1">{MESES[hover]}</p>
                    <p className="flex items-center gap-1.5 text-gray-600"><span className="w-2 h-2 rounded-sm" style={{ background: COLOR_PPTO }} />Presupuestado <b className="ml-auto pl-3 text-gray-900">{formatCLP(d.presupuestado)}</b></p>
                    <p className="flex items-center gap-1.5 text-gray-600"><span className="w-2 h-2 rounded-sm" style={{ background: COLOR_EJEC }} />Ejecutado <b className="ml-auto pl-3 text-gray-900">{formatCLP(d.ejecutado)}</b></p>
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
    const [anio, setAnio] = useState(new Date().getFullYear());
    const [anioComp, setAnioComp] = useState<number | ''>('');
    const [agrupar, setAgrupar] = useState<Agrupar>('area');
    const [filtroMeses, setFiltroMeses] = useState<string[]>([]);
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

    const mesesNum = useMemo(() => filtroMeses.map(Number).sort((a, b) => a - b), [filtroMeses]);

    const fetchData = useCallback(async () => {
        if (!puedeVer) return;
        setLoading(true);
        setError('');
        try {
            const p = new URLSearchParams({ anio: String(anio), agrupar });
            if (colegioId) p.append('id_colegio', colegioId);
            if (anioComp) p.append('anio_comp', String(anioComp));
            mesesNum.forEach(m => p.append('meses', String(m)));
            filtroAreas.forEach(a => p.append('areas', a));
            filtroCentros.forEach(c => p.append('centros', c));
            const res = await api.get(`/presupuesto/ejecucion/resumen?${p.toString()}`);
            setData(res.data);
        } catch (e) {
            setError((axios.isAxiosError(e) && e.response?.data?.detail) || 'No se pudo cargar la comparación.');
        } finally {
            setLoading(false);
        }
    }, [puedeVer, anio, agrupar, colegioId, anioComp, mesesNum, filtroAreas, filtroCentros]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const umbral = data?.umbral_alerta ?? 150;
    const aniosDisponibles = useMemo(() => {
        const s = new Set<number>([new Date().getFullYear(), new Date().getFullYear() + 1, anio]);
        (data?.historico || []).forEach(h => s.add(h.anio));
        return Array.from(s).sort((a, b) => b - a);
    }, [data, anio]);

    const filas = data?.filas || [];
    const totales = data?.totales || { presupuestado: 0, solicitado: 0, ejecutado: 0, n_oc: 0 };
    const pctTotal = pctEjecucion(totales);
    const nAlertas = filas.filter(f => tieneAlerta(f, umbral)).length;
    const conComp = !!data?.anio_comp;
    const anioEnCurso = anio === new Date().getFullYear();

    const exportarExcel = () => {
        if (!data) return;
        const colegioNombre = colegios.find(c => String(c.id_colegio) === colegioId)?.nombre || 'Todos los colegios';
        const filasXls = filas.map(f => {
            const pct = pctEjecucion(f);
            const o: Record<string, string | number> = {};
            if (f.area !== null) o['Área'] = f.area;
            if (f.cc !== null) o['Centro de costo / Subvención'] = f.cc;
            o['Presupuestado'] = f.presupuestado;
            o['Solicitado'] = f.solicitado;
            o['Ejecutado OC'] = f.ejecutado;
            o['N° OC'] = f.n_oc;
            o['Saldo'] = f.presupuestado - f.ejecutado;
            o['% Ejecución'] = pct === null ? '' : Math.round(pct * 10) / 10;
            if (conComp) {
                o[`Presupuestado ${data.anio_comp}`] = f.comp_presupuestado || 0;
                o[`Ejecutado ${data.anio_comp}`] = f.comp_ejecutado || 0;
            }
            o['Aviso'] = tieneAlerta(f, umbral) ? 'Revisar' : '';
            return o;
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasXls), 'Comparación');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.mensual.map(m => ({
            Mes: MESES[m.mes - 1], Presupuestado: m.presupuestado, 'Ejecutado OC': m.ejecutado,
        }))), 'Mensual');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.historico.map(h => ({
            Año: h.anio, Presupuestado: h.presupuestado, Solicitado: h.solicitado, 'Ejecutado OC': h.ejecutado, 'N° OC': h.n_oc,
        }))), 'Histórico');
        XLSX.writeFile(wb, `Presupuesto_vs_Ejecutado_${colegioNombre.replace(/\s+/g, '_')}_${anio}.xlsx`);
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
                    {data?.ultima_sync && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2"
                            title="Fecha de la última sincronización de órdenes de compra con Softland">
                            <RefreshCw size={13} /> OC actualizadas al {new Date(data.ultima_sync).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                    )}
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
                <div className="relative">
                    <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <select value={anio} onChange={e => setAnio(Number(e.target.value))} title="Año de ejecución"
                        className="pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary">
                        {aniosDisponibles.map(y => <option key={y} value={y}>Año {y}</option>)}
                    </select>
                </div>
                <div className="relative">
                    <GitCompare size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <select value={anioComp} onChange={e => setAnioComp(e.target.value ? Number(e.target.value) : '')} title="Comparar con otro año"
                        className="pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary">
                        <option value="">Sin comparar</option>
                        {aniosDisponibles.filter(y => y !== anio).map(y => <option key={y} value={y}>Comparar con {y}</option>)}
                    </select>
                </div>
                <FiltroMultiSelectGenerico
                    icono="📅" tituloVacio="Todos los meses" tituloPlural="meses"
                    seleccionados={filtroMeses} onChange={setFiltroMeses}
                    opciones={MESES.map((m, i) => ({ valor: String(i + 1), label: m }))}
                    placeholderBusqueda="Buscar mes..." anchoMinimo="min-w-[200px]"
                />
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
            {data && (data.pendientes_mapeo.areas > 0 || data.pendientes_mapeo.centros > 0) && (
                <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100 text-sm text-amber-800">
                    <Info size={18} className="shrink-0" />
                    <span>
                        Hay {data.pendientes_mapeo.areas > 0 && <b>{data.pendientes_mapeo.areas} área(s) de OC sin asignar</b>}
                        {data.pendientes_mapeo.areas > 0 && data.pendientes_mapeo.centros > 0 && ' y '}
                        {data.pendientes_mapeo.centros > 0 && <b>{data.pendientes_mapeo.centros} centro(s) de costo sin subvención</b>}.
                        Se muestran aparte hasta que se configuren.
                    </span>
                    <Link href="/configuracion?tab=Ejecuci%C3%B3n%20OC" className="ml-auto text-xs font-bold underline">Configuración › Ejecución OC</Link>
                </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}

            {loading && !data ? (
                <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="animate-spin mr-2" /> Cargando…</div>
            ) : data && (
                <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <Tarjeta titulo="Presupuestado (aprobado)" valor={formatCLP(totales.presupuestado)} color={COLOR_PPTO}
                            detalle={`Solicitado: ${formatCLP(totales.solicitado)}`} />
                        <Tarjeta titulo="Ejecutado en OC" valor={formatCLP(totales.ejecutado)} color={COLOR_EJEC}
                            detalle={`${totales.n_oc.toLocaleString('es-CL')} órdenes de compra`} />
                        <Tarjeta titulo="Saldo" valor={formatCLP(totales.presupuestado - totales.ejecutado)}
                            detalle={totales.presupuestado - totales.ejecutado < 0 ? 'Ejecutado supera lo presupuestado' : 'Presupuesto disponible'} />
                        <Tarjeta titulo="% Ejecución" valor={formatPct(pctTotal)}
                            detalle={nAlertas > 0 ? `${nAlertas} fila(s) para revisar` : anioEnCurso ? 'Año en curso: datos parciales' : undefined} />
                    </div>

                    {/* Tabla principal */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs text-gray-500">
                                    <tr>
                                        {colArea && <th className="px-4 py-3 text-left font-semibold">Área</th>}
                                        {colCC && <th className="px-4 py-3 text-left font-semibold">Centro de costo · Subvención</th>}
                                        <th className="px-4 py-3 text-right font-semibold">Presupuestado</th>
                                        <th className="px-4 py-3 text-right font-semibold">Ejecutado OC</th>
                                        <th className="px-4 py-3 text-right font-semibold">N° OC</th>
                                        <th className="px-4 py-3 text-right font-semibold">Saldo</th>
                                        <th className="px-4 py-3 text-right font-semibold">% Ejecución</th>
                                        {conComp && <th className="px-4 py-3 text-right font-semibold">Ejecutado {data.anio_comp}</th>}
                                        {conComp && <th className="px-4 py-3 text-right font-semibold">Var. ejecutado</th>}
                                        <th className="px-4 py-3 w-40" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filas.length === 0 && (
                                        <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-400">Sin datos para los filtros seleccionados.</td></tr>
                                    )}
                                    {filas.map(f => {
                                        const pct = pctEjecucion(f);
                                        const alerta = tieneAlerta(f, umbral);
                                        const saldo = f.presupuestado - f.ejecutado;
                                        const varEj = conComp ? f.ejecutado - (f.comp_ejecutado || 0) : 0;
                                        const pendiente = f.area_key?.startsWith('oc') || f.cc_key?.startsWith('cc');
                                        return (
                                            <tr key={f.key} className={`hover:bg-gray-50/60 ${alerta ? 'bg-amber-50/30' : ''}`}>
                                                {colArea && (
                                                    <td className={`px-4 py-2.5 font-semibold ${pendiente || f.area_key === 'sin' ? 'text-gray-500 italic' : 'text-gray-800'}`}>{f.area}</td>
                                                )}
                                                {colCC && <td className={`px-4 py-2.5 ${f.cc_key?.startsWith('cc') ? 'text-gray-500 italic' : 'text-gray-700'}`}>{f.cc}</td>}
                                                <td className="px-4 py-2.5 text-right text-gray-800">{formatCLP(f.presupuestado)}</td>
                                                <td className="px-4 py-2.5 text-right font-bold text-gray-900">{formatCLP(f.ejecutado)}</td>
                                                <td className="px-4 py-2.5 text-right text-gray-500">{f.n_oc}</td>
                                                <td className={`px-4 py-2.5 text-right font-semibold ${saldo < 0 ? 'text-red-600' : 'text-gray-700'}`}>{formatCLP(saldo)}</td>
                                                <td className="px-4 py-2.5 text-right"><BarraPct pct={pct} umbral={umbral} /></td>
                                                {conComp && <td className="px-4 py-2.5 text-right text-gray-600">{formatCLP(f.comp_ejecutado || 0)}</td>}
                                                {conComp && (
                                                    <td className={`px-4 py-2.5 text-right text-xs font-bold ${varEj > 0 ? 'text-amber-600' : varEj < 0 ? 'text-sky-600' : 'text-gray-400'}`}>
                                                        {varEj === 0 ? '—' : `${varEj > 0 ? '+' : '−'}${formatCorto(Math.abs(varEj))}`}
                                                        {f.comp_ejecutado ? <span className="font-semibold opacity-80"> ({varEj > 0 ? '+' : '−'}{Math.abs((varEj / f.comp_ejecutado) * 100).toLocaleString('es-CL', { maximumFractionDigits: 0 })}%)</span> : null}
                                                    </td>
                                                )}
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
                                            <td className="px-4 py-3" colSpan={colArea && colCC ? 2 : 1}>Total</td>
                                            <td className="px-4 py-3 text-right">{formatCLP(totales.presupuestado)}</td>
                                            <td className="px-4 py-3 text-right">{formatCLP(totales.ejecutado)}</td>
                                            <td className="px-4 py-3 text-right text-gray-500">{totales.n_oc}</td>
                                            <td className={`px-4 py-3 text-right ${totales.presupuestado - totales.ejecutado < 0 ? 'text-red-600' : ''}`}>{formatCLP(totales.presupuestado - totales.ejecutado)}</td>
                                            <td className="px-4 py-3 text-right"><BarraPct pct={pctTotal} umbral={umbral} /></td>
                                            {conComp && <td className="px-4 py-3 text-right">{formatCLP(filas.reduce((a, f) => a + (f.comp_ejecutado || 0), 0))}</td>}
                                            {conComp && <td />}
                                            <td />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                        <p className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-50">
                            Presupuestado = recursos aprobados de solicitudes aceptadas. Ejecutado = total con IVA de las OC aprobadas en Softland.
                            Se marcan para revisar las filas sobre {umbral}% o con OC sin presupuesto.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        {/* Mensual */}
                        <div className="xl:col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><CalendarClock size={16} className="text-gray-400" />Por mes · {anio}</h3>
                                <div className="flex items-center gap-4 text-xs text-gray-600">
                                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_PPTO }} />Presupuestado (mes de ejecución)</span>
                                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_EJEC }} />Ejecutado (fecha OC)</span>
                                </div>
                            </div>
                            <GraficoMensual datos={data.mensual} />
                        </div>

                        {/* Histórico */}
                        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
                            <h3 className="text-sm font-bold text-gray-800 mb-1">Histórico por año</h3>
                            <p className="text-[11px] text-gray-400 mb-3">Con los mismos filtros. Antes de 2026 solo hay ejecutado (referencia histórica).</p>
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
                                        <tr key={h.anio} onClick={() => setAnio(h.anio)}
                                            className={`cursor-pointer hover:bg-gray-50 ${h.anio === anio ? 'bg-primary/5 font-bold' : ''}`}>
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
                anio={anio}
                meses={mesesNum}
                umbral={umbral}
            />}
        </div>
    );
}
