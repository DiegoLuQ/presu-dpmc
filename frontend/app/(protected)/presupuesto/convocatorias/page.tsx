'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import {
    Plus, Loader2, Package, Users, ChevronRight, ChevronDown, ChevronUp, Link2, Copy, Check, X,
    AlertCircle, FileText, ListFilter, Building2, Calendar,
} from 'lucide-react';
import { Convocatoria, BudgetRequest } from '@/lib/types';

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : '';

export default function ConvocatoriasGlobalPage() {
    const router = useRouter();

    const { user } = useAuth();
    const [convocatorias, setConvocatorias] = useState<Convocatoria[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiado, setCopiado] = useState<number | null>(null);
    const [modalSolicitud, setModalSolicitud] = useState(false);
    const [solicitudes, setSolicitudes] = useState<BudgetRequest[]>([]);
    const [loadingSol, setLoadingSol] = useState(false);
    const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
    const [filterArea, setFilterArea] = useState('');

    const fetchConvocatorias = useCallback(async () => {
        try {
            const r = await api.get('/convocatorias');
            setConvocatorias(r.data);
            // Acordeón: abrir todas las solicitudes por defecto
            const ids: number[] = r.data.map((c: Convocatoria) => c.id_presupuesto);
            setAbiertos(new Set(ids));
        } catch {
            setConvocatorias([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const toggleSolicitud = (id_presupuesto: number) => {
        setAbiertos(prev => {
            const next = new Set(prev);
            if (next.has(id_presupuesto)) next.delete(id_presupuesto);
            else next.add(id_presupuesto);
            return next;
        });
    };

    useEffect(() => { fetchConvocatorias(); }, [fetchConvocatorias]);

    const abrirSelector = async () => {
        setModalSolicitud(true);
        setLoadingSol(true);
        try {
            const r = await api.get('/presupuesto/solicitudes/mis');
            const data: BudgetRequest[] = r.data || [];
            // Filtrar solo las solicitudes pendientes
            const pendientes = data.filter(s => s.estado?.toLowerCase() === 'pendiente');
            setSolicitudes(pendientes);
        } catch {
            setSolicitudes([]);
        }
        setLoadingSol(false);
    };

    const copiarUrl = (conv: Convocatoria) => {
        navigator.clipboard.writeText(`${BASE_URL}/pedidos/${conv.token}`);
        setCopiado(conv.id_convocatoria);
        setTimeout(() => setCopiado(null), 2000);
    };

    const convEstadoBadge = (c: Convocatoria) => {
        const expirado = new Date(c.fecha_expiracion) < new Date();
        if (c.estado === 'cerrado') return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">Cerrado</span>;
        if (expirado) return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700">Expirado</span>;
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">Activo</span>;
    };

    const totalPendientes = convocatorias.reduce((s, c) => s + c.pedidos_pendientes, 0);

    const areasConConvocatoria = React.useMemo(() => {
        const areas = convocatorias.map(c => c.area_nombre).filter(Boolean) as string[];
        return [...new Set(areas)].sort();
    }, [convocatorias]);

    // Agrupar convocatorias por solicitud de presupuesto (para el acordeón)
    const grupos = React.useMemo(() => {
        const filteredConvs = filterArea
            ? convocatorias.filter(c => c.area_nombre === filterArea)
            : convocatorias;
        const map = new Map<number, {
            id_presupuesto: number;
            solicitud_codigo?: string;
            presupuesto_anual_nombre?: string;
            colegio_nombre?: string;
            area_nombre?: string;
            convocatorias: Convocatoria[];
        }>();
        for (const c of filteredConvs) {
            if (!map.has(c.id_presupuesto)) {
                map.set(c.id_presupuesto, {
                    id_presupuesto: c.id_presupuesto,
                    solicitud_codigo: c.solicitud_codigo,
                    presupuesto_anual_nombre: c.presupuesto_anual_nombre || undefined,
                    colegio_nombre: c.colegio_nombre || undefined,
                    area_nombre: c.area_nombre,
                    convocatorias: [],
                });
            }
            map.get(c.id_presupuesto)!.convocatorias.push(c);
        }
        return Array.from(map.values());
    }, [convocatorias, filterArea]);

    return (
        <div className="min-h-screen bg-[#f8f9fa]">
            <main className="p-6 max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Users size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Convocatorias de Pedidos</h1>
                        <p className="text-sm text-gray-500">
                            Enlaces públicos para que las cargos envíen sus necesidades de presupuesto.
                            {totalPendientes > 0 && (
                                <> · <span className="font-semibold text-yellow-600">{totalPendientes} pedido(s) pendiente(s)</span></>
                            )}
                        </p>
                    </div>
                    <div className="ml-auto">
                        <button
                            onClick={abrirSelector}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:brightness-105 active:scale-95 transition-all shadow"
                        >
                            <Plus size={16} /> Nueva convocatoria
                        </button>
                    </div>
                </div>

                {/* Filtro por Área (Solo para Administrador y si hay convocatorias) */}
                {user?.rol?.codigo === 'ADM' && areasConConvocatoria.length > 0 && (
                    <div className="mb-6 flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2">
                            <ListFilter size={16} className="text-gray-400" />
                            <span className="text-xs font-semibold text-gray-500">Filtrar por Área:</span>
                        </div>
                        <div className="relative">
                            <select
                                value={filterArea}
                                onChange={(e) => setFilterArea(e.target.value)}
                                className="pr-8 pl-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            >
                                <option value="">Todas las áreas</option>
                                {areasConConvocatoria.map(a => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {/* Lista */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={24} className="animate-spin text-gray-400" />
                    </div>
                ) : convocatorias.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                        <Users size={36} className="mx-auto mb-3 text-gray-300" />
                        <p className="text-gray-500 font-medium">No hay convocatorias aún</p>
                        <p className="text-sm text-gray-400 mt-1">Crea una convocatoria desde una de tus solicitudes de presupuesto.</p>
                        <button
                            onClick={abrirSelector}
                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:brightness-105 active:scale-95 transition-all"
                        >
                            <Plus size={16} /> Nueva convocatoria
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {grupos.map(grupo => {
                            const abierto = abiertos.has(grupo.id_presupuesto);
                            const pendientesGrupo = grupo.convocatorias.reduce((s, c) => s + c.pedidos_pendientes, 0);
                            return (
                                <div key={grupo.id_presupuesto} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                    {/* Cabecera del acordeón: solicitud enlazada */}
                                    <button
                                        onClick={() => toggleSolicitud(grupo.id_presupuesto)}
                                        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50/60 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                <FileText size={16} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-gray-900 text-sm flex items-center gap-2 flex-wrap">
                                                    {grupo.presupuesto_anual_nombre || `Solicitud #${grupo.id_presupuesto}`}
                                                    <span className="text-xs text-gray-400 font-normal">#{grupo.id_presupuesto}</span>
                                                    {grupo.solicitud_codigo && (
                                                        <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] font-semibold">{grupo.solicitud_codigo}</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {grupo.colegio_nombre && <>{grupo.colegio_nombre} · </>}
                                                    {grupo.area_nombre && <>{grupo.area_nombre} · </>}
                                                    {grupo.convocatorias.length} convocatoria{grupo.convocatorias.length !== 1 ? 's' : ''}
                                                    {pendientesGrupo > 0 && <> · <span className="font-semibold text-yellow-600">{pendientesGrupo} pendiente{pendientesGrupo !== 1 ? 's' : ''}</span></>}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-gray-400 shrink-0">
                                            {abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                        </div>
                                    </button>

                                    {/* Convocatorias de la solicitud */}
                                    {abierto && (
                                        <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50/40">
                                            {grupo.convocatorias.map(conv => (
                                                <div key={conv.id_convocatoria} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                                <Package size={16} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="font-bold text-gray-900 text-sm">{conv.subarea_nombre}</span>
                                                                    {convEstadoBadge(conv)}
                                                                </div>
                                                                <p className="text-xs text-gray-400 mt-0.5">
                                                                    Expira {new Date(conv.fecha_expiracion).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <div className="text-right text-xs text-gray-500 mr-1">
                                                                <div><span className="font-semibold text-gray-700">{conv.total_pedidos}</span> pedidos</div>
                                                                <div><span className="font-semibold text-yellow-600">{conv.pedidos_pendientes}</span> pendientes</div>
                                                            </div>
                                                            {conv.estado === 'activo' && (
                                                                <button
                                                                    onClick={() => copiarUrl(conv)}
                                                                    title="Copiar enlace del formulario"
                                                                    className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                                                                >
                                                                    {copiado === conv.id_convocatoria ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => router.push(`/presupuesto/${conv.id_presupuesto}/convocatorias`)}
                                                                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5 rounded-lg transition-colors"
                                                            >
                                                                Gestionar <ChevronRight size={14} />
                                                            </button>
                                                        </div>
                                                    </div>

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
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Modal: seleccionar solicitud */}
            {modalSolicitud && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setModalSolicitud(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-base font-bold text-gray-900">Elige una solicitud</h3>
                            <button onClick={() => setModalSolicitud(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">
                            Las convocatorias se asocian a una solicitud de presupuesto pendiente. Selecciona en cuál quieres crear o gestionar convocatorias.
                        </p>

                        {loadingSol ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 size={24} className="animate-spin text-primary" />
                            </div>
                        ) : solicitudes.length === 0 ? (
                            <div className="py-10 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
                                <AlertCircle size={28} className="text-gray-300" />
                                <p className="font-semibold text-gray-700">No tienes solicitudes pendientes</p>
                                <p className="text-xs text-gray-400 max-w-xs">
                                    No se encontraron solicitudes en estado pendiente para asociar convocatorias.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                                {solicitudes.map(s => {
                                    const nombrePresupuesto = s.presupuesto_anual_nombre || (s.codigo ? `Presupuesto ${s.codigo}` : `Presupuesto Solicitud #${s.id_presupuesto}`);
                                    const anio = s.presupuesto_anual_year || (s.fecha ? new Date(s.fecha).getFullYear() : null);
                                    const areaTexto = [s.area_nombre, s.subarea_nombre && s.subarea_nombre !== s.area_nombre ? s.subarea_nombre : null].filter(Boolean).join(' · ');

                                    return (
                                        <button
                                            key={s.id_presupuesto}
                                            onClick={() => router.push(`/presupuesto/${s.id_presupuesto}/convocatorias`)}
                                            className="w-full flex items-center justify-between gap-3 p-3.5 border border-gray-200 rounded-xl hover:border-primary/60 hover:bg-primary/[0.03] transition-all text-left group hover:shadow-sm"
                                        >
                                            <div className="min-w-0 flex-1">
                                                {/* Nombre del presupuesto y badge */}
                                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                                    <span className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors truncate">
                                                        {nombrePresupuesto}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                                                        Pendiente
                                                    </span>
                                                    <span className="text-xs text-gray-400 font-medium">
                                                        #{s.id_presupuesto}
                                                    </span>
                                                </div>

                                                {/* Colegio, Área y Año */}
                                                <div className="flex items-center gap-2.5 text-xs text-gray-500 flex-wrap">
                                                    {s.colegio_nombre && (
                                                        <span className="inline-flex items-center gap-1 font-medium text-gray-700">
                                                            <Building2 size={13} className="text-gray-400 shrink-0" />
                                                            {s.colegio_nombre}
                                                        </span>
                                                    )}
                                                    {areaTexto && (
                                                        <span className="inline-flex items-center gap-1 text-gray-600">
                                                            <span className="text-gray-300">·</span>
                                                            <span>{areaTexto}</span>
                                                        </span>
                                                    )}
                                                    {anio && (
                                                        <span className="inline-flex items-center gap-1 text-gray-500">
                                                            <span className="text-gray-300">·</span>
                                                            <Calendar size={13} className="text-gray-400 shrink-0" />
                                                            <span>{anio}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <ChevronRight size={18} className="text-gray-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
