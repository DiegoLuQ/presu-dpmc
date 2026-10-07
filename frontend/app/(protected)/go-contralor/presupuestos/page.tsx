'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api/client';
import { PresupuestoAnual } from '@/lib/types';
import { ArrowRight, Building2, Calendar, FileText, Loader2, Wallet } from 'lucide-react';
import { SinAccesoContralor, useAccesoRevisionContralor } from '@/components/go-contralor/accesoRevision';

const formatCLP = (value: number) => `$${Math.round(value || 0).toLocaleString('es-CL')}`;

export default function RevisionPresupuestosPage() {
    const router = useRouter();
    const { isLoading, puedeVer } = useAccesoRevisionContralor();
    const [presupuestos, setPresupuestos] = useState<PresupuestoAnual[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [yearSel, setYearSel] = useState<number | null>(null);

    useEffect(() => {
        if (isLoading || !puedeVer) return;
        setLoading(true);
        api.get('/presupuesto/contralor/presupuestos-anuales')
            .then(res => setPresupuestos(res.data || []))
            .catch(e => setError(e?.response?.data?.detail || 'No se pudieron cargar los presupuestos.'))
            .finally(() => setLoading(false));
    }, [isLoading, puedeVer]);

    const years = useMemo(
        () => Array.from(new Set(presupuestos.map(p => p.year))).sort((a, b) => b - a),
        [presupuestos]
    );
    // Por defecto el año más reciente
    useEffect(() => {
        if (yearSel === null && years.length > 0) setYearSel(years[0]);
    }, [years, yearSel]);

    const delYear = useMemo(
        () => presupuestos
            .filter(p => p.year === yearSel)
            .sort((a, b) => (a.colegio_nombre || '').localeCompare(b.colegio_nombre || '', 'es')),
        [presupuestos, yearSel]
    );

    if (!isLoading && !puedeVer) return <SinAccesoContralor />;

    return (
        <div className="animate-in fade-in duration-500">
            <div className="mb-6 flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                    <Wallet size={26} />
                </div>
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Revisión de Presupuestos</h2>
                    <p className="text-gray-500 mt-1 font-medium">
                        Elige un presupuesto anual para revisar sus solicitudes y corregir código contable, subvención y actividad PME.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <Loader2 className="animate-spin" size={28} />
                    <span className="text-sm font-semibold">Cargando presupuestos...</span>
                </div>
            ) : error ? (
                <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">{error}</div>
            ) : presupuestos.length === 0 ? (
                <div className="bg-white rounded-[24px] border border-gray-100 py-16 flex flex-col items-center gap-3 text-center">
                    <Wallet size={32} className="text-gray-300" />
                    <p className="font-medium text-gray-500">No hay presupuestos anuales en tus colegios.</p>
                </div>
            ) : (
                <>
                    {/* Años */}
                    <div className="inline-flex bg-gray-200/60 p-1 rounded-xl border border-gray-200/80 shadow-inner flex-wrap gap-1 mb-6">
                        {years.map(y => {
                            const activo = y === yearSel;
                            const n = presupuestos.filter(p => p.year === y).length;
                            return (
                                <button
                                    key={y}
                                    onClick={() => setYearSel(y)}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all inline-flex items-center gap-2 cursor-pointer ${activo ? 'bg-white text-primary shadow-xs ring-1 ring-black/5' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
                                >
                                    <Calendar size={15} /> {y}
                                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${activo ? 'bg-primary/10 text-primary' : 'bg-gray-300/60 text-gray-700'}`}>{n}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Un presupuesto por colegio */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {delYear.map(p => (
                            <div
                                key={p.id_presupuesto_anual}
                                className="bg-white rounded-[24px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 hover:-translate-y-1 hover:shadow-md transition-all flex flex-col"
                            >
                                <div className="flex items-start justify-between gap-2 mb-3">
                                    <div className="flex items-center gap-2 text-gray-900 min-w-0">
                                        <Building2 size={18} className="text-primary shrink-0" />
                                        <span className="text-base font-extrabold truncate">{p.colegio_nombre || `Colegio N° ${p.id_colegio}`}</span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${p.estado === 'activo' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {p.estado === 'activo' ? 'Activo' : 'Cerrado'}
                                    </span>
                                </div>
                                <h3 className="text-sm font-bold text-gray-700 mb-1">{p.nombre}</h3>
                                {p.descripcion && <p className="text-xs text-gray-500 mb-2 line-clamp-2">{p.descripcion}</p>}

                                <div className="grid grid-cols-2 gap-3 mt-auto mb-4 pt-3">
                                    <div className="p-3 bg-gray-50/60 rounded-xl">
                                        <p className="text-[11px] text-gray-400 font-medium flex items-center gap-1"><FileText size={11} /> Solicitudes</p>
                                        <p className="text-lg font-extrabold text-gray-900">{p.solicitudes_count}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50/60 rounded-xl">
                                        <p className="text-[11px] text-gray-400 font-medium">Monto</p>
                                        <p className="text-sm font-extrabold text-gray-900 mt-0.5">{formatCLP(p.monto_total)}</p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => router.push(`/go-contralor/presupuestos/${p.id_presupuesto_anual}`)}
                                    className="w-full py-2.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    Revisar solicitudes <ArrowRight size={15} />
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
