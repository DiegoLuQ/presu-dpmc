'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Info, Loader2, Search, X } from 'lucide-react';
import api from '@/lib/api/client';

/**
 * Detalle de una fila de "Presupuesto vs Ejecutado": explica por qué el ejecutado
 * (OC Softland) no cuadra con lo presupuestado y lista las OC que lo componen.
 */

export interface FilaEjecucion {
    key: string;
    area_key: string | null;
    area: string | null;
    cc_key: string | null;
    cc: string | null;
    centros: string[];
    presupuestado: number;
    solicitado: number;
    ejecutado: number;
    n_oc: number;
    comp_presupuestado?: number;
    comp_ejecutado?: number;
    comp_n_oc?: number;
}

interface OrdenCompra {
    empresa: string;
    num_oc: number;
    fecha_oc: string | null;
    centro_costo: string | null;
    subtotal: number;
    total: number;
    solicitante: string | null;
    grupo: string | null;
    grupo_manual: boolean;
    cc: string;
}

interface Props {
    fila: FilaEjecucion;
    onClose: () => void;
    idColegio: string;
    anio: number;
    meses: number[];
    umbral: number;
}

const formatCLP = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v || 0)).toLocaleString('es-CL')}`;

export function pctEjecucion(f: { presupuestado: number; ejecutado: number }): number | null {
    return f.presupuestado > 0 ? (f.ejecutado / f.presupuestado) * 100 : null;
}

export function tieneAlerta(f: FilaEjecucion, umbral: number): boolean {
    const pct = pctEjecucion(f);
    if (pct !== null) return pct > umbral;
    return f.ejecutado > 0;
}

function explicaciones(f: FilaEjecucion, umbral: number): { titulo: string; texto: React.ReactNode }[] {
    const out: { titulo: string; texto: React.ReactNode }[] = [];
    const pct = pctEjecucion(f);

    if (f.area_key?.startsWith('oc')) {
        out.push({
            titulo: 'Área de OC sin asignar',
            texto: <>Las OC de este grupo traen un área que no existe en este sistema. Asígnala (o súmala a otra) en{' '}
                <Link href="/configuracion?tab=Ejecuci%C3%B3n%20OC" className="font-bold text-primary underline">Configuración › Ejecución OC</Link>.</>,
        });
    }
    if (f.area_key === 'sin') {
        out.push({
            titulo: 'OC sin grupo en Softland',
            texto: 'Estas órdenes no tienen grupo asignado en el sistema de Órdenes de Compra. Se corrigen allí (clic en el grupo de la OC); al sincronizar pasarán a su área.',
        });
    }
    if (f.cc_key?.startsWith('cc')) {
        out.push({
            titulo: 'Centro de costo sin equivalencia',
            texto: <>El centro de costo {f.cc_key.slice(2)} no está asociado a ninguna subvención, por eso no tiene presupuesto con qué compararse.
                Puedes asociarlo en <Link href="/configuracion?tab=Ejecuci%C3%B3n%20OC" className="font-bold text-primary underline">Configuración › Ejecución OC</Link>.</>,
        });
    }
    if (f.presupuestado === 0 && f.ejecutado > 0) {
        out.push({
            titulo: 'Gasto sin presupuesto aprobado',
            texto: 'Hay órdenes de compra, pero ninguna solicitud aprobada para esta fila. Suele tratarse de gasto que no se planificó como solicitud (servicios, reposiciones, urgencias) o de un área cuyo presupuesto quedó registrado en otra.',
        });
    } else if (pct !== null && pct > umbral) {
        out.push({
            titulo: `Ejecución sobre ${umbral}%`,
            texto: 'Las OC de Softland incluyen todo el gasto real del área: contratos y servicios recurrentes, mantención, consumos básicos y compras que nunca se ingresaron como solicitud de presupuesto. Por eso el ejecutado puede superar con creces lo presupuestado sin que haya un error en los datos. Revisa el desglose por centro de costo y las OC de mayor monto.',
        });
    }
    if (out.length === 0) {
        out.push({
            titulo: 'Detalle de órdenes de compra',
            texto: 'Listado de las OC aprobadas en Softland que componen el ejecutado de esta fila.',
        });
    }
    return out;
}

export default function DetalleEjecucionModal({ fila, onClose, idColegio, anio, meses, umbral }: Props) {
    const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
    // El padre monta el modal con key={fila.key}: cada fila abre un estado nuevo
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busqueda, setBusqueda] = useState('');

    useEffect(() => {
        let cancelado = false;
        const p = new URLSearchParams({ anio: String(anio) });
        if (idColegio) p.append('id_colegio', idColegio);
        if (fila.area_key) p.append('area', fila.area_key);
        if (fila.cc_key) p.append('centro', fila.cc_key);
        meses.forEach(m => p.append('meses', String(m)));
        api.get(`/presupuesto/ejecucion/oc?${p.toString()}`)
            .then(res => { if (!cancelado) setOrdenes(res.data?.ordenes || []); })
            .catch(() => { if (!cancelado) { setOrdenes([]); setError('No se pudieron cargar las órdenes de compra.'); } })
            .finally(() => { if (!cancelado) setLoading(false); });
        return () => { cancelado = true; };
    }, [fila, idColegio, anio, meses]);

    const porCentro = useMemo(() => {
        const acc: Record<string, { cc: string; total: number; n: number }> = {};
        for (const o of ordenes) {
            const k = o.cc || 'Sin centro';
            acc[k] = acc[k] || { cc: k, total: 0, n: 0 };
            acc[k].total += o.total;
            acc[k].n += 1;
        }
        return Object.values(acc).sort((a, b) => b.total - a.total);
    }, [ordenes]);

    const filtradas = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return ordenes;
        return ordenes.filter(o =>
            String(o.num_oc).includes(q) ||
            (o.solicitante || '').toLowerCase().includes(q) ||
            (o.grupo || '').toLowerCase().includes(q) ||
            (o.centro_costo || '').toLowerCase().includes(q));
    }, [ordenes, busqueda]);

    const pct = pctEjecucion(fila);
    const alerta = tieneAlerta(fila, umbral);
    const totalOC = ordenes.reduce((a, o) => a + o.total, 0);
    const titulo = [fila.area, fila.cc].filter(Boolean).join(' · ');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-900/60" onClick={onClose} aria-hidden="true" />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            {alerta && <AlertTriangle size={18} className="text-amber-500" />}
                            {titulo}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Año {anio} · Presupuestado {formatCLP(fila.presupuestado)} · Ejecutado {formatCLP(fila.ejecutado)}
                            {pct !== null && <> · {pct.toLocaleString('es-CL', { maximumFractionDigits: 0 })}% ejecutado</>}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto px-6 py-5 space-y-5">
                    <div className="space-y-2">
                        {explicaciones(fila, umbral).map((e, i) => (
                            <div key={i} className="flex gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-100">
                                <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-bold text-gray-800">{e.titulo}</p>
                                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{e.texto}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-gray-400">
                            <Loader2 className="animate-spin mr-2" size={18} /> Cargando órdenes de compra…
                        </div>
                    ) : error ? (
                        <p className="text-sm text-red-600">{error}</p>
                    ) : (
                        <>
                            {porCentro.length > 1 && (
                                <div>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Ejecutado por centro de costo</p>
                                    <div className="space-y-1.5">
                                        {porCentro.map(c => (
                                            <div key={c.cc} className="flex items-center gap-3 text-xs">
                                                <span className="w-56 truncate font-semibold text-gray-700" title={c.cc}>{c.cc}</span>
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${totalOC ? (c.total / totalOC) * 100 : 0}%` }} />
                                                </div>
                                                <span className="w-28 text-right font-bold text-gray-800">{formatCLP(c.total)}</span>
                                                <span className="w-14 text-right text-gray-400">{c.n} OC</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                        Órdenes de compra ({filtradas.length}{filtradas.length !== ordenes.length ? ` de ${ordenes.length}` : ''})
                                    </p>
                                    <div className="relative">
                                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            value={busqueda}
                                            onChange={e => setBusqueda(e.target.value)}
                                            placeholder="Buscar N°, solicitante…"
                                            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                </div>
                                {ordenes.length === 0 ? (
                                    <p className="text-sm text-gray-400 py-6 text-center">No hay órdenes de compra para esta fila.</p>
                                ) : (
                                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                                        <table className="w-full text-xs">
                                            <thead className="bg-gray-50 text-gray-500">
                                                <tr>
                                                    <th className="px-3 py-2 text-left font-semibold">N° OC</th>
                                                    <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                                                    <th className="px-3 py-2 text-left font-semibold">Solicitante</th>
                                                    <th className="px-3 py-2 text-left font-semibold">Grupo</th>
                                                    <th className="px-3 py-2 text-left font-semibold">C. costo</th>
                                                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {[...filtradas].sort((a, b) => b.total - a.total).map(o => (
                                                    <tr key={`${o.empresa}-${o.num_oc}`} className="hover:bg-gray-50/60">
                                                        <td className="px-3 py-1.5 font-semibold text-gray-800">{o.num_oc}</td>
                                                        <td className="px-3 py-1.5 text-gray-600">{o.fecha_oc ? o.fecha_oc.split('-').reverse().join('-') : '—'}</td>
                                                        <td className="px-3 py-1.5 text-gray-600 max-w-[200px] truncate" title={o.solicitante || ''}>{o.solicitante || '—'}</td>
                                                        <td className="px-3 py-1.5 text-gray-600">{o.grupo || '—'}{o.grupo_manual && <span className="ml-1 text-[10px] text-gray-400">(manual)</span>}</td>
                                                        <td className="px-3 py-1.5 text-gray-600">{o.centro_costo || '—'}</td>
                                                        <td className="px-3 py-1.5 text-right font-bold text-gray-800">{formatCLP(o.total)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
