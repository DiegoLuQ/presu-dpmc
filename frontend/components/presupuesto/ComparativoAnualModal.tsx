'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, ArrowUp, ArrowDown, Minus, GitCompare } from 'lucide-react';
import api from '@/lib/api/client';
import { BudgetRequest } from '@/lib/types';

/**
 * Compara el presupuesto del año visible en /presupuesto/solicitudes contra otro año,
 * aplicando los mismos filtros (meses, áreas, líneas y subvención). Considera todos los
 * recursos sin importar su estado de revisión (sirve para verificar antes de aprobar).
 */

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const NUM_MES: Record<string, string> = Object.fromEntries(MESES.map((m, i) => [String(i + 1).padStart(2, '0'), m]));

interface Filtros {
    meses: string[];
    areas: string[];
    lineas: string[];
    subvencion: string; // 'todos' o nombre
}

interface Props {
    open: boolean;
    onClose: () => void;
    colegioId: string;
    yearBase: string;
    solicitudesBase: BudgetRequest[];
    filtros: Filtros;
    isMacaya: boolean;
}

interface Item {
    total: number;
    estado: string;
    mes: string;
    id_presupuesto: number;
}

const labelMes = (fecha?: string, tipo?: string) => {
    if (fecha) {
        const p = fecha.split('-');
        if (p.length >= 2 && NUM_MES[p[1]]) return NUM_MES[p[1]];
    }
    return tipo || 'Sin mes';
};

// Aplana y filtra igual que la página de solicitudes
function aplanar(solicitudes: BudgetRequest[], f: Filtros): Item[] {
    const items: Item[] = [];
    for (const s of solicitudes) {
        if (f.areas.length > 0 && !f.areas.includes((s.area_nombre || '').trim())) continue;
        for (const d of (s.detalles || [])) {
            const mes = labelMes(d.fecha_ejecucion, d.tipo_fecha);
            if (f.meses.length > 0 && !f.meses.includes(mes)) continue;
            if (f.lineas.length > 0 && !f.lineas.includes(((d as any).grupo_nombre || '').trim())) continue;
            if (f.subvencion !== 'todos') {
                const sub = ((d as any).subvencion_nombre || (d as any).subvencion?.nombre_corto || 'GENERAL').toLowerCase().trim();
                if (sub !== f.subvencion.toLowerCase().trim()) continue;
            }
            items.push({
                total: d.total_iva || ((d.cantidad || 0) * (d.valor_unitario_iva || 0)),
                estado: (d.estado_aprobacion || 'Sin Revisar').trim(),
                mes,
                id_presupuesto: s.id_presupuesto,
            });
        }
    }
    return items;
}

const ES_APROBADO = (e: string) => e === 'Aprobado' || e === 'Aceptado';
const ES_AJUSTE = (e: string) => e === 'Con Ajustes' || e.toLowerCase() === 'aprobado con ajustes';

function metricas(items: Item[]) {
    const suma = (fn: (i: Item) => boolean) => items.filter(fn).reduce((a, i) => a + i.total, 0);
    return {
        solicitado: suma(() => true),
        aprobado: suma(i => ES_APROBADO(i.estado)),
        ajustes: suma(i => ES_AJUSTE(i.estado)),
        sinRevisar: suma(i => !i.estado || i.estado === 'Sin Revisar'),
        pendiente: suma(i => i.estado === 'Pendiente'),
        rechazado: suma(i => i.estado === 'Rechazado'),
        solicitudes: new Set(items.map(i => i.id_presupuesto)).size,
        recursos: items.length,
    };
}

const formatCLP = (v: number) => `$${Math.round(v || 0).toLocaleString('es-CL')}`;
const formatCorto = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`;
    if (a >= 1_000) return `$${Math.round(v / 1_000).toLocaleString('es-CL')}K`;
    return `$${Math.round(v)}`;
};

function Variacion({ actual, anterior, moneda = true }: { actual: number; anterior: number; moneda?: boolean }) {
    const diff = actual - anterior;
    if (diff === 0) {
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-400"><Minus size={12} /> Sin cambio</span>;
    }
    const sube = diff > 0;
    const pct = anterior !== 0 ? (diff / anterior) * 100 : null;
    const Icono = sube ? ArrowUp : ArrowDown;
    return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${sube ? 'text-amber-600' : 'text-sky-600'}`}>
            <Icono size={12} />
            {sube ? '+' : '−'}{moneda ? formatCLP(Math.abs(diff)) : Math.abs(diff).toLocaleString('es-CL')}
            <span className="font-semibold opacity-80">({pct === null ? 'nuevo' : `${sube ? '+' : '−'}${Math.abs(pct).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`})</span>
        </span>
    );
}

export default function ComparativoAnualModal({ open, onClose, colegioId, yearBase, solicitudesBase, filtros, isMacaya }: Props) {
    const [anios, setAnios] = useState<number[]>([]);
    const [yearComp, setYearComp] = useState('');
    const [solicitudesComp, setSolicitudesComp] = useState<BudgetRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Años disponibles para el colegio (excluye el año base)
    useEffect(() => {
        if (!open) return;
        let cancelado = false;
        api.get('/presupuesto/presupuestos-anuales')
            .then(res => {
                if (cancelado) return;
                const lista: any[] = res.data || [];
                let ys = lista
                    .filter(p => !colegioId || String(p.id_colegio) === String(colegioId))
                    .map(p => Number(p.year));
                if (ys.length === 0) {
                    const actual = new Date().getFullYear();
                    ys = Array.from({ length: 6 }, (_, i) => actual + 1 - i);
                }
                const unicos = Array.from(new Set(ys)).filter(y => String(y) !== String(yearBase)).sort((a, b) => b - a);
                setAnios(unicos);
                // Por defecto, el año anterior al base si existe
                const previo = unicos.find(y => y === Number(yearBase) - 1) ?? unicos[0];
                setYearComp(prev => prev && unicos.includes(Number(prev)) ? prev : (previo ? String(previo) : ''));
            })
            .catch(() => { if (!cancelado) setAnios([]); });
        return () => { cancelado = true; };
    }, [open, colegioId, yearBase]);

    // Cargar solicitudes del año a comparar
    useEffect(() => {
        if (!open || !yearComp) { setSolicitudesComp([]); return; }
        let cancelado = false;
        setLoading(true);
        setError('');
        const params: any = { year: yearComp };
        if (colegioId) params.id_colegio = colegioId;
        api.get('/presupuesto/solicitudes', { params })
            .then(res => { if (!cancelado) setSolicitudesComp(res.data || []); })
            .catch(() => { if (!cancelado) { setSolicitudesComp([]); setError('No se pudieron cargar las solicitudes del año a comparar.'); } })
            .finally(() => { if (!cancelado) setLoading(false); });
        return () => { cancelado = true; };
    }, [open, yearComp, colegioId]);

    // Cerrar con Escape
    useEffect(() => {
        if (!open) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [open, onClose]);

    const itemsA = useMemo(() => aplanar(solicitudesBase, filtros), [solicitudesBase, filtros]);
    const itemsB = useMemo(() => aplanar(solicitudesComp, filtros), [solicitudesComp, filtros]);
    const mA = useMemo(() => metricas(itemsA), [itemsA]);
    const mB = useMemo(() => metricas(itemsB), [itemsB]);

    // Totales por mes (orden calendario; meses fuera de calendario al final)
    const porMes = useMemo(() => {
        const acc: Record<string, { a: number; b: number }> = {};
        itemsA.forEach(i => { (acc[i.mes] ||= { a: 0, b: 0 }).a += i.total; });
        itemsB.forEach(i => { (acc[i.mes] ||= { a: 0, b: 0 }).b += i.total; });
        if (filtros.meses.length > 0) filtros.meses.forEach(m => { acc[m] ||= { a: 0, b: 0 }; });
        const orden = (m: string) => { const i = MESES.indexOf(m); return i === -1 ? 99 : i; };
        return Object.entries(acc)
            .sort(([x], [y]) => orden(x) - orden(y) || x.localeCompare(y))
            .map(([mes, v]) => ({ mes, ...v }));
    }, [itemsA, itemsB, filtros.meses]);

    const maxMes = Math.max(1, ...porMes.map(m => Math.max(m.a, m.b)));

    if (!open) return null;

    const colorA = isMacaya ? 'bg-emerald-600' : 'bg-blue-600';
    const colorB = 'bg-amber-400';
    const textoA = isMacaya ? 'text-emerald-700' : 'text-blue-700';

    const resumenFiltros = [
        filtros.meses.length ? `Meses: ${filtros.meses.join(', ')}` : 'Todos los meses',
        filtros.areas.length ? `Áreas: ${filtros.areas.join(', ')}` : 'Todas las áreas',
        filtros.lineas.length ? `Líneas: ${filtros.lineas.join(', ')}` : null,
        filtros.subvencion !== 'todos' ? `Subvención: ${filtros.subvencion}` : null,
    ].filter(Boolean);

    const cards: { label: string; a: number; b: number; moneda?: boolean }[] = [
        { label: 'Total Solicitado', a: mA.solicitado, b: mB.solicitado },
        { label: 'Aprobado', a: mA.aprobado, b: mB.aprobado },
        { label: 'Con Ajustes', a: mA.ajustes, b: mB.ajustes },
        { label: 'Sin Revisar', a: mA.sinRevisar, b: mB.sinRevisar },
        { label: 'Pendiente', a: mA.pendiente, b: mB.pendiente },
        { label: 'Rechazado', a: mA.rechazado, b: mB.rechazado },
        { label: 'N° Solicitudes', a: mA.solicitudes, b: mB.solicitudes, moneda: false },
        { label: 'N° Recursos', a: mA.recursos, b: mB.recursos, moneda: false },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Comparar presupuesto entre años"
            >
                {/* Encabezado */}
                <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                            <GitCompare size={18} className={textoA} /> Comparativo de presupuesto
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                            {resumenFiltros.join(' · ')} · Todos los estados (incluye sin revisar)
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200`}>
                                <span className={`w-2.5 h-2.5 rounded-sm ${colorA}`} /> {yearBase}
                            </span>
                            <span>vs</span>
                            <select
                                value={yearComp}
                                onChange={e => setYearComp(e.target.value)}
                                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                            >
                                {anios.length === 0 && <option value="">Sin otros años</option>}
                                {anios.map(y => <option key={y} value={String(y)}>{y}</option>)}
                            </select>
                            <span className={`w-2.5 h-2.5 rounded-sm ${colorB}`} />
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="Cerrar">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto p-6 space-y-6">
                    {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</div>}

                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-gray-500 gap-2 text-sm">
                            <Loader2 className="animate-spin" size={18} /> Cargando presupuesto {yearComp}...
                        </div>
                    ) : !yearComp ? (
                        <div className="text-center text-sm text-gray-500 py-16">No hay otro año disponible para comparar.</div>
                    ) : (
                        <>
                            {/* Cards comparativas */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {cards.map(c => (
                                    <div key={c.label} className="rounded-xl border border-gray-100 shadow-sm p-3.5">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{c.label}</span>
                                        <div className="mt-1.5 flex items-baseline justify-between gap-2">
                                            <span className={`text-base font-extrabold ${textoA}`}>
                                                {c.moneda === false ? c.a.toLocaleString('es-CL') : formatCLP(c.a)}
                                            </span>
                                            <span className="text-[10px] font-bold text-gray-400">{yearBase}</span>
                                        </div>
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="text-sm font-bold text-amber-600">
                                                {c.moneda === false ? c.b.toLocaleString('es-CL') : formatCLP(c.b)}
                                            </span>
                                            <span className="text-[10px] font-bold text-gray-400">{yearComp}</span>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-gray-100">
                                            <Variacion actual={c.a} anterior={c.b} moneda={c.moneda !== false} />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Gráfico por mes */}
                            <div className="rounded-xl border border-gray-100 shadow-sm p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-gray-800">Total solicitado por mes</h3>
                                    <div className="flex items-center gap-4 text-xs font-semibold text-gray-600">
                                        <span className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded-sm ${colorA}`} />{yearBase}</span>
                                        <span className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded-sm ${colorB}`} />{yearComp}</span>
                                    </div>
                                </div>
                                {porMes.length === 0 ? (
                                    <div className="text-center text-sm text-gray-400 py-10">Sin datos para los filtros seleccionados.</div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <div className="flex items-end gap-3 h-64 min-w-max px-1 border-b border-gray-200">
                                            {porMes.map(m => (
                                                <div key={m.mes} className="flex flex-col items-center h-full justify-end w-16">
                                                    <div className="flex items-end gap-1 h-full w-full justify-center">
                                                        {[{ v: m.a, c: colorA, y: yearBase }, { v: m.b, c: colorB, y: yearComp }].map(bar => (
                                                            <div key={bar.y} className="flex flex-col items-center justify-end h-full w-6">
                                                                <span className="text-[9px] font-bold text-gray-500 mb-0.5 whitespace-nowrap">{bar.v > 0 ? formatCorto(bar.v) : ''}</span>
                                                                <div
                                                                    className={`w-full rounded-t ${bar.c}`}
                                                                    style={{ height: `${(bar.v / maxMes) * 85}%`, minHeight: bar.v > 0 ? 2 : 0 }}
                                                                    title={`${m.mes} ${bar.y}: ${formatCLP(bar.v)}`}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-3 min-w-max px-1 mt-1.5">
                                            {porMes.map(m => (
                                                <div key={m.mes} className="w-16 text-center text-[10px] font-semibold text-gray-600 truncate" title={m.mes}>{m.mes.slice(0, 3)}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Tabla por mes */}
                            {porMes.length > 0 && (
                                <div className="rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                                            <tr>
                                                <th className="px-4 py-2.5 text-left">Mes</th>
                                                <th className="px-4 py-2.5 text-right">{yearBase}</th>
                                                <th className="px-4 py-2.5 text-right">{yearComp}</th>
                                                <th className="px-4 py-2.5 text-right">Variación</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {porMes.map(m => (
                                                <tr key={m.mes}>
                                                    <td className="px-4 py-2 font-semibold text-gray-800">{m.mes}</td>
                                                    <td className={`px-4 py-2 text-right font-bold ${textoA}`}>{formatCLP(m.a)}</td>
                                                    <td className="px-4 py-2 text-right font-bold text-amber-600">{formatCLP(m.b)}</td>
                                                    <td className="px-4 py-2 text-right"><Variacion actual={m.a} anterior={m.b} /></td>
                                                </tr>
                                            ))}
                                            <tr className="bg-gray-50 font-extrabold">
                                                <td className="px-4 py-2.5 text-gray-900">Total</td>
                                                <td className={`px-4 py-2.5 text-right ${textoA}`}>{formatCLP(mA.solicitado)}</td>
                                                <td className="px-4 py-2.5 text-right text-amber-600">{formatCLP(mB.solicitado)}</td>
                                                <td className="px-4 py-2.5 text-right"><Variacion actual={mA.solicitado} anterior={mB.solicitado} /></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
