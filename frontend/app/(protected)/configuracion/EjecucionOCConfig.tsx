'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Info, Loader2, RefreshCw } from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api/client';

/**
 * Configuración de la integración con órdenes de compra Softland (Presupuesto vs Ejecutado):
 * - Áreas de OC → área de la plataforma a la que se suman (por defecto la del mismo id).
 * - Centros de costo Softland → subvención equivalente.
 */

interface AreaOC {
    id_area_oc: number; nombre_oc: string | null; n_oc: number; total: number; id_area: number | null;
    existe_en_sistema: boolean; nombre_sistema: string | null; revisar: boolean;
}
interface CentroOC { centro_costo: string; n_oc: number; total: number; id_subvencion: number | null }
interface Mapeos {
    oc_disponible: boolean;
    ultima_sync: string | null;
    areas_oc: AreaOC[];
    centros: CentroOC[];
    areas: { id_area: number; nombre: string }[];
    subvenciones: { id_subvencion: number; nombre_corto: string; nombre_completo: string; estado: string }[];
}

const formatCLP = (v: number) => `$${Math.round(v || 0).toLocaleString('es-CL')}`;

export default function EjecucionOCConfig() {
    const [data, setData] = useState<Mapeos | null>(null);
    const [loading, setLoading] = useState(true);
    const [guardando, setGuardando] = useState<string | null>(null);
    const [guardado, setGuardado] = useState<string | null>(null);
    const [error, setError] = useState('');

    const cargar = async () => {
        setLoading(true);
        try {
            const res = await api.get('/presupuesto/ejecucion/mapeos');
            setData(res.data);
        } catch {
            setError('No se pudo cargar la configuración.');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { cargar(); }, []);

    const marcarGuardado = (k: string) => {
        setGuardado(k);
        setTimeout(() => setGuardado(g => (g === k ? null : g)), 1500);
    };

    const guardarArea = async (a: AreaOC, id_area: number | null) => {
        const k = `a${a.id_area_oc}`;
        setGuardando(k); setError('');
        try {
            await api.put(`/presupuesto/ejecucion/mapeos/area/${a.id_area_oc}`, { id_area, nombre_oc: a.nombre_oc });
            setData(d => d && { ...d, areas_oc: d.areas_oc.map(x => x.id_area_oc === a.id_area_oc ? { ...x, id_area, revisar: false } : x) });
            marcarGuardado(k);
        } catch (e) {
            setError((axios.isAxiosError(e) && e.response?.data?.detail) || 'No se pudo guardar.');
        } finally {
            setGuardando(null);
        }
    };

    const guardarCC = async (c: CentroOC, id_subvencion: number | null) => {
        const k = `c${c.centro_costo}`;
        setGuardando(k); setError('');
        try {
            await api.put(`/presupuesto/ejecucion/mapeos/cc/${encodeURIComponent(c.centro_costo)}`, { id_subvencion });
            setData(d => d && { ...d, centros: d.centros.map(x => x.centro_costo === c.centro_costo ? { ...x, id_subvencion } : x) });
            marcarGuardado(k);
        } catch (e) {
            setError((axios.isAxiosError(e) && e.response?.data?.detail) || 'No se pudo guardar.');
        } finally {
            setGuardando(null);
        }
    };

    const estado = (k: string) => guardando === k
        ? <Loader2 size={14} className="animate-spin text-gray-400" />
        : guardado === k ? <Check size={14} className="text-emerald-600" /> : null;

    if (loading) {
        return <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="animate-spin mr-2" /> Cargando…</div>;
    }
    if (!data) return <p className="text-sm text-red-600">{error}</p>;

    const selectCls = 'px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary min-w-[220px]';

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Órdenes de compra (Softland)</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Cómo se cruzan las OC con este sistema en <b>GO-Contralor › Presupuesto vs Ejecutado</b>. Los cambios no modifican la base de OC.
                    </p>
                </div>
                <button onClick={cargar} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50">
                    <RefreshCw size={13} /> Recargar
                </button>
            </div>

            {!data.oc_disponible && (
                <div className="flex gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-700">
                    <AlertTriangle size={18} className="shrink-0" />
                    No se encontró la base de órdenes de compra en este servidor.
                </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}

            {/* Áreas */}
            <div className="bg-white rounded-[24px] border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-6">
                <h4 className="font-bold text-gray-900">Áreas de las OC → área de la plataforma</h4>
                <p className="text-xs text-gray-500 mt-1 mb-4">
                    Elige a qué área se suman las OC de cada área de Softland (p. ej. “UTP 2” → UTP). Por defecto se usa el área con el mismo id.
                    Se marca <b>revisar</b> cuando el nombre en las OC no coincide con el de la plataforma: confírmala o reasígnala.
                </p>
                {data.areas_oc.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-gray-500"><Info size={15} /> No hay áreas en las OC.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="text-xs text-gray-500">
                            <tr>
                                <th className="py-2 text-left font-semibold">Área en OC</th>
                                <th className="py-2 text-left font-semibold">Mismo id en la plataforma</th>
                                <th className="py-2 text-right font-semibold">N° OC</th>
                                <th className="py-2 text-right font-semibold">Total histórico</th>
                                <th className="py-2 pl-6 text-left font-semibold">Sumar a</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {data.areas_oc.map(a => {
                                const sinAsignar = !a.existe_en_sistema && !a.id_area;
                                const valor = a.id_area ?? (a.existe_en_sistema ? a.id_area_oc : '');
                                return (
                                    <tr key={a.id_area_oc} className={a.revisar || sinAsignar ? 'bg-amber-50/40' : ''}>
                                        <td className="py-2.5 font-semibold text-gray-800">
                                            {a.nombre_oc || 'Sin nombre'} <span className="text-xs font-normal text-gray-400">(id {a.id_area_oc})</span>
                                            {a.revisar && <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">revisar</span>}
                                            {sinAsignar && <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">sin asignar</span>}
                                        </td>
                                        <td className="py-2.5 text-gray-600">{a.nombre_sistema || <span className="italic text-gray-400">no existe</span>}</td>
                                        <td className="py-2.5 text-right text-gray-600">{a.n_oc}</td>
                                        <td className="py-2.5 text-right text-gray-600">{formatCLP(a.total)}</td>
                                        <td className="py-2.5 pl-6">
                                            <div className="flex items-center gap-2">
                                                <select className={selectCls} value={valor} disabled={guardando !== null}
                                                    onChange={e => guardarArea(a, e.target.value ? Number(e.target.value) : null)}>
                                                    {!a.existe_en_sistema && <option value="">— Sin asignar —</option>}
                                                    {data.areas.map(x => <option key={x.id_area} value={x.id_area}>{x.nombre}</option>)}
                                                </select>
                                                {a.revisar && (
                                                    <button type="button" disabled={guardando !== null} onClick={() => guardarArea(a, a.id_area_oc)}
                                                        title={`Confirmar que ${a.nombre_oc} corresponde a ${a.nombre_sistema}`}
                                                        className="px-2 py-1 rounded-lg text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 whitespace-nowrap">
                                                        Es correcta
                                                    </button>
                                                )}
                                                {estado(`a${a.id_area_oc}`)}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Centros de costo */}
            <div className="bg-white rounded-[24px] border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-6">
                <h4 className="font-bold text-gray-900">Centros de costo → subvención</h4>
                <p className="text-xs text-gray-500 mt-1 mb-4">
                    Permite comparar el ejecutado de cada centro de costo con el presupuesto de su subvención.
                    Un centro sin equivalencia solo muestra lo ejecutado.
                </p>
                {data.centros.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-gray-500"><Info size={15} /> No hay centros de costo en las OC.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="text-xs text-gray-500">
                            <tr>
                                <th className="py-2 text-left font-semibold">Centro de costo</th>
                                <th className="py-2 text-right font-semibold">N° OC</th>
                                <th className="py-2 text-right font-semibold">Total histórico</th>
                                <th className="py-2 pl-6 text-left font-semibold">Subvención</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {data.centros.map(c => (
                                <tr key={c.centro_costo}>
                                    <td className="py-2.5 font-semibold text-gray-800">
                                        {c.centro_costo}
                                        {!c.id_subvencion && <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">sin equivalencia</span>}
                                    </td>
                                    <td className="py-2.5 text-right text-gray-600">{c.n_oc}</td>
                                    <td className="py-2.5 text-right text-gray-600">{formatCLP(c.total)}</td>
                                    <td className="py-2.5 pl-6">
                                        <div className="flex items-center gap-2">
                                            <select className={selectCls} value={c.id_subvencion ?? ''} disabled={guardando !== null}
                                                onChange={e => guardarCC(c, e.target.value ? Number(e.target.value) : null)}>
                                                <option value="">— Sin equivalencia —</option>
                                                {data.subvenciones.map(s => (
                                                    <option key={s.id_subvencion} value={s.id_subvencion}>
                                                        {s.nombre_completo}{s.estado !== 'ACTIVO' ? ' (inactiva)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            {estado(`c${c.centro_costo}`)}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
