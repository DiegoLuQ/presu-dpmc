'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    BarChart3, TrendingUp, PieChart, Landmark, Calendar,
    User, Award, Wrench, GraduationCap, DollarSign, Package,
    ArrowDownRight, ArrowUpRight, Scale, Loader2, Building2, CheckCircle2
} from 'lucide-react';
import api from '@/lib/api/client';
import { BudgetRequest, BudgetDetail } from '@/lib/types';
import ComprasFilters from '@/components/go-compras/ComprasFilters';

interface KpiData {
    totalSugerido: number;
    totalReal: number;
    diferencia: number;
    porcentajeDesviacion: number;
    totalItems: number;
    completadosCount: number;
}

export default function KPIsPage() {
    const router = useRouter();

    // Filtros globales
    const [colegioId, setColegioId] = useState('');
    const [year, setYear] = useState(String(new Date().getFullYear()));
    // Modo de visualización de montos
    const [viewMode, setViewMode] = useState<'real' | 'presupuestado'>('real');

    const [compras, setCompras] = useState<BudgetRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchCompras = useCallback(async () => {
        try {
            setLoading(true);
            const params: string[] = [];
            if (colegioId) params.push(`id_colegio=${colegioId}`);
            if (year) params.push(`year=${year}`);
            const url = '/presupuesto/compras/historial' + (params.length ? '?' + params.join('&') : '');
            const response = await api.get(url);
            setCompras(response.data);
        } catch (error) {
            console.error('Error fetching solicitudes for KPIs:', error);
            setCompras([]);
        } finally {
            setLoading(false);
        }
    }, [colegioId, year]);

    useEffect(() => {
        fetchCompras();
    }, [fetchCompras]);

    // ── Extras persistidos (cantidad_real, valor_real) ────────────────────────────
    const [itemExtras, setItemExtras] = useState<Record<string, { cantidad_real?: number; valor_real?: number }>>({});

    useEffect(() => {
        try {
            const savedExtras = localStorage.getItem('go-compras-items-extras');
            if (savedExtras) setItemExtras(JSON.parse(savedExtras));
        } catch {}
    }, []);

    // ── Filtrado y Aplanado de Items Aprobados ────────────────────────────────────
    const approvedItems = useMemo(() => {
        let items: { detalle: BudgetDetail; uid: string; area: string; colegio: string; mes: string; colegioId: number; cantidad_real?: number; valor_real?: number }[] = [];

        for (const c of compras) {
            const dateObj = new Date(c.fecha);
            const mesName = dateObj.toLocaleDateString('es-CL', { month: 'short' }).toUpperCase().replace('.', '');

            for (const d of (c.detalles || [])) {
                // Consideraremos ítems aprobados
                if (d.estado_aprobacion === 'Aprobado') {
                    const uid = `${c.id_presupuesto}-${d.id_pre_detalle}`;
                    const extra = itemExtras[uid] || {};
                    items.push({
                        detalle: d,
                        uid,
                        area: c.area_nombre || 'Sin Área',
                        colegio: c.colegio_nombre || 'Prueba',
                        mes: mesName,
                        colegioId: c.id_colegio,
                        cantidad_real: extra.cantidad_real,
                        valor_real: extra.valor_real,
                    });
                }
            }
        }
        return items;
    }, [compras, itemExtras]);

    // ── Cálculos de KPIs ──────────────────────────────────────────────────────────
    const kpis = useMemo<KpiData>(() => {
        let sugerido = 0;
        let real = 0;
        let totalItems = 0;
        let completados = 0;

        approvedItems.forEach(item => {
            const cantSug = item.detalle.cantidad || 0;
            const cantReal = item.cantidad_real !== undefined && item.cantidad_real !== null
                ? item.cantidad_real
                : cantSug;

            const priceSug = item.detalle.valor_unitario_iva || 0;
            const priceReal = item.valor_real !== undefined && item.valor_real !== null
                ? item.valor_real
                : (item.detalle.valor_real_iva !== null && item.detalle.valor_real_iva !== undefined ? item.detalle.valor_real_iva : priceSug);

            sugerido += cantSug * priceSug;
            real += cantReal * priceReal;
            totalItems += cantReal;

            if (item.valor_real !== undefined || (item.detalle.valor_real_iva !== null && item.detalle.valor_real_iva !== undefined)) {
                completados++;
            }
        });

        const diferencia = real - sugerido;
        const porcentajeDesviacion = sugerido > 0 ? (diferencia / sugerido) * 100 : 0;

        return {
            totalSugerido: sugerido,
            totalReal: real,
            diferencia,
            porcentajeDesviacion,
            totalItems,
            completadosCount: completados
        };
    }, [approvedItems]);

    // ── Agrupaciones ──────────────────────────────────────────────────────────────
    
    // 1. Por Destino
    const porDestino = useMemo(() => {
        const dests: Record<string, number> = {
            'Alumnos': 0,
            'Funcionarios': 0,
            'Premio / Beneficio': 0,
            'Mantención / Servicio': 0
        };
        approvedItems.forEach(item => {
            const dest = item.detalle.destino_gasto || 'Alumnos';
            const cantSug = item.detalle.cantidad || 0;
            const cantReal = item.cantidad_real !== undefined && item.cantidad_real !== null ? item.cantidad_real : cantSug;
            const priceSug = item.detalle.valor_unitario_iva || 0;
            const priceReal = item.valor_real !== undefined && item.valor_real !== null ? item.valor_real : (item.detalle.valor_real_iva ?? priceSug);
            const val = viewMode === 'real' ? cantReal * priceReal : cantSug * priceSug;
            
            // Map simple destination synonyms
            if (dest.toLowerCase().includes('alumno')) dests['Alumnos'] += val;
            else if (dest.toLowerCase().includes('funcionario') || dest.toLowerCase().includes('oficina')) dests['Funcionarios'] += val;
            else if (dest.toLowerCase().includes('premio') || dest.toLowerCase().includes('beneficio')) dests['Premio / Beneficio'] += val;
            else if (dest.toLowerCase().includes('manten') || dest.toLowerCase().includes('servicio')) dests['Mantención / Servicio'] += val;
            else dests['Alumnos'] += val;
        });
        return Object.entries(dests).map(([name, value]) => ({ name, value }));
    }, [approvedItems, viewMode]);

    // 2. Por Área
    const porArea = useMemo(() => {
        const areas: Record<string, { sugerido: number; real: number }> = {};
        approvedItems.forEach(item => {
            const a = item.area;
            if (!areas[a]) areas[a] = { sugerido: 0, real: 0 };
            
            const cantSug = item.detalle.cantidad || 0;
            const cantReal = item.cantidad_real !== undefined && item.cantidad_real !== null ? item.cantidad_real : cantSug;
            const priceSug = item.detalle.valor_unitario_iva || 0;
            const priceReal = item.valor_real !== undefined && item.valor_real !== null ? item.valor_real : (item.detalle.valor_real_iva ?? priceSug);

            areas[a].sugerido += cantSug * priceSug;
            areas[a].real += cantReal * priceReal;
        });
        return Object.entries(areas)
            .map(([name, val]) => ({ name, sugerido: val.sugerido, real: val.real }))
            .sort((x, y) => y.real - x.real)
            .slice(0, 5); // top 5
    }, [approvedItems]);

    // 3. Por Categoría / Grupo
    const porCategoria = useMemo(() => {
        const cats: Record<string, { sugerido: number; real: number }> = {};
        approvedItems.forEach(item => {
            const c = item.detalle.categoria_nombre || 'Sin Categoría';
            if (!cats[c]) cats[c] = { sugerido: 0, real: 0 };

            const cantSug = item.detalle.cantidad || 0;
            const cantReal = item.cantidad_real !== undefined && item.cantidad_real !== null ? item.cantidad_real : cantSug;
            const priceSug = item.detalle.valor_unitario_iva || 0;
            const priceReal = item.valor_real !== undefined && item.valor_real !== null ? item.valor_real : (item.detalle.valor_real_iva ?? priceSug);

            cats[c].sugerido += cantSug * priceSug;
            cats[c].real += cantReal * priceReal;
        });
        return Object.entries(cats)
            .map(([name, val]) => ({ name, sugerido: val.sugerido, real: val.real }))
            .sort((x, y) => y.real - x.real)
            .slice(0, 5);
    }, [approvedItems]);

    // 4. Por Cuentas Contables
    const porCuenta = useMemo(() => {
        const ctas: Record<string, number> = {};
        approvedItems.forEach(item => {
            const code = item.detalle.codigo_cuenta || 'S/C';
            const cantSug = item.detalle.cantidad || 0;
            const cantReal = item.cantidad_real !== undefined && item.cantidad_real !== null ? item.cantidad_real : cantSug;
            const priceSug = item.detalle.valor_unitario_iva || 0;
            const priceReal = item.valor_real !== undefined && item.valor_real !== null ? item.valor_real : (item.detalle.valor_real_iva ?? priceSug);
            const val = viewMode === 'real' ? cantReal * priceReal : cantSug * priceSug;

            ctas[code] = (ctas[code] || 0) + val;
        });
        return Object.entries(ctas)
            .map(([name, value]) => ({ name, value }))
            .sort((x, y) => y.value - x.value)
            .slice(0, 6);
    }, [approvedItems, viewMode]);

    // 5. Por Mes
    const porMes = useMemo(() => {
        const mesesOrd = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
        const values: Record<string, { sugerido: number; real: number }> = {};
        mesesOrd.forEach(m => values[m] = { sugerido: 0, real: 0 });

        approvedItems.forEach(item => {
            const m = item.mes;
            if (values[m]) {
                const cantSug = item.detalle.cantidad || 0;
                const cantReal = item.cantidad_real !== undefined && item.cantidad_real !== null ? item.cantidad_real : cantSug;
                const priceSug = item.detalle.valor_unitario_iva || 0;
                const priceReal = item.valor_real !== undefined && item.valor_real !== null ? item.valor_real : (item.detalle.valor_real_iva ?? priceSug);

                values[m].sugerido += cantSug * priceSug;
                values[m].real += cantReal * priceReal;
            }
        });

        return mesesOrd.map(name => ({
            name,
            sugerido: values[name].sugerido,
            real: values[name].real
        }));
    }, [approvedItems]);

    const formatCLP = (val: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val);
    };

    const getDestinoIcon = (name: string) => {
        switch (name) {
            case 'Alumnos': return <GraduationCap size={16} className="text-blue-500" />;
            case 'Funcionarios': return <User size={16} className="text-teal-500" />;
            case 'Premio / Beneficio': return <Award size={16} className="text-amber-500" />;
            case 'Mantención / Servicio': return <Wrench size={16} className="text-red-500" />;
            default: return <GraduationCap size={16} />;
        }
    };

    return (
        <div className="animate-in fade-in duration-500 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                    <BarChart3 size={26} />
                </div>
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">KPIs & Métricas</h2>
                    <p className="text-gray-500 mt-1 font-medium">Visualización de presupuesto, costo sugerido, compras reales y desviaciones por área.</p>
                </div>
            </div>

            {/* Filtros y Selector de Modo */}
            <div className="bg-white rounded-3xl p-6 shadow-[0_2px_20px_rgba(0,0,0,0.02)] border border-gray-100/80 flex flex-wrap items-center justify-between gap-4">
                <div className="flex-1 min-w-[280px]">
                    <ComprasFilters
                        colegioId={colegioId}
                        year={year}
                        onColegioChange={setColegioId}
                        onYearChange={setYear}
                    />
                </div>

                {/* Toggle Real vs Presupuestado */}
                <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl shrink-0">
                    <button
                        onClick={() => setViewMode('real')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${viewMode === 'real' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                        <TrendingUp size={14} />
                        Costo Real
                    </button>
                    <button
                        onClick={() => setViewMode('presupuestado')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${viewMode === 'presupuestado' ? 'bg-primary text-white shadow-md' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                        <DollarSign size={14} />
                        Presupuestado
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="h-96 flex flex-col items-center justify-center gap-2">
                    <Loader2 size={36} className="animate-spin text-primary" />
                    <p className="text-sm font-semibold text-gray-500">Cargando métricas consolidadas...</p>
                </div>
            ) : (
                <>
                    {/* Tarjetas Principales */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                        {/* Sugerido */}
                        <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_25px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col justify-between hover:-translate-y-1 transition-all duration-300 group">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Presupuesto Sugerido</span>
                                <div className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-primary/5 group-hover:text-primary transition-all">
                                    <DollarSign size={20} />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-2xl font-extrabold text-gray-900 leading-none">{formatCLP(kpis.totalSugerido)}</h3>
                                <p className="text-xs text-gray-400 mt-1.5 font-medium">Estimado inicial aprobado</p>
                            </div>
                        </div>

                        {/* Costo Real */}
                        <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_25px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col justify-between hover:-translate-y-1 transition-all duration-300 group">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Costo Real Compra</span>
                                <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                    <TrendingUp size={20} />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-2xl font-extrabold text-emerald-700 leading-none">{formatCLP(kpis.totalReal)}</h3>
                                <p className="text-xs text-emerald-600 mt-1.5 font-medium">Monto real consolidado</p>
                            </div>
                        </div>

                        {/* Desviación */}
                        <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_25px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col justify-between hover:-translate-y-1 transition-all duration-300 group">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Desviación (Ahorro)</span>
                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${kpis.diferencia <= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                                    {kpis.diferencia <= 0 ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}
                                </div>
                            </div>
                            <div>
                                <h3 className={`text-2xl font-extrabold leading-none ${kpis.diferencia <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {formatCLP(Math.abs(kpis.diferencia))}
                                </h3>
                                <p className="text-xs mt-1.5 font-medium flex items-center gap-1">
                                    <span className={kpis.diferencia <= 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                                        {kpis.porcentajeDesviacion.toFixed(1)}%
                                    </span>
                                    <span className="text-gray-400">vs presupuesto original</span>
                                </p>
                            </div>
                        </div>

                        {/* Items */}
                        <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_25px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col justify-between hover:-translate-y-1 transition-all duration-300 group">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Items Comprados</span>
                                <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all">
                                    <Package size={20} />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-2xl font-extrabold text-gray-900 leading-none">{kpis.totalItems}</h3>
                                <p className="text-xs text-gray-400 mt-1.5 font-medium">{kpis.completadosCount} asignaciones cotizadas</p>
                            </div>
                        </div>
                    </div>

                    {/* Gráficos Principales */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* Comparación por Mes (Timeline) */}
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_4px_30px_rgba(0,0,0,0.02)] lg:col-span-2 space-y-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h4 className="text-base font-bold text-gray-900">Evolución Mensual del Gasto</h4>
                                    <p className="text-xs text-gray-400 font-medium">Comparación temporal entre sugerido (gris) y real (verde).</p>
                                </div>
                                <div className="flex items-center gap-3 text-xs">
                                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-300" /> Sugerido</span>
                                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Real</span>
                                </div>
                            </div>

                            {/* Line Chart SVG */}
                            <div className="h-64 relative pt-4">
                                {approvedItems.length === 0 ? (
                                    <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
                                        No hay datos registrados en este periodo
                                    </div>
                                ) : (() => {
                                    const maxVal = Math.max(...porMes.map(m => Math.max(m.sugerido, m.real)), 100000);
                                    
                                    // Generate points
                                    const pointsSug = porMes.map((m, idx) => {
                                        const x = (idx * 50) + 25;
                                        const y = 200 - (m.sugerido / maxVal) * 180;
                                        return `${x},${y}`;
                                    }).join(' ');

                                    const pointsReal = porMes.map((m, idx) => {
                                        const x = (idx * 50) + 25;
                                        const y = 200 - (m.real / maxVal) * 180;
                                        return `${x},${y}`;
                                    }).join(' ');

                                    return (
                                        <svg viewBox="0 0 600 240" className="w-full h-full">
                                            {/* Grids */}
                                            {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
                                                <line key={i} x1="25" y1={200 - r * 180} x2="575" y2={200 - r * 180} stroke="#f1f5f9" strokeDasharray="3" />
                                            ))}

                                            {/* Lines */}
                                            <polyline fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeDasharray="4" points={pointsSug} />
                                            <polyline fill="none" stroke="#10b981" strokeWidth="3" points={pointsReal} />

                                            {/* Dots */}
                                            {porMes.map((m, idx) => {
                                                const x = (idx * 50) + 25;
                                                const ySug = 200 - (m.sugerido / maxVal) * 180;
                                                const yReal = 200 - (m.real / maxVal) * 180;
                                                return (
                                                    <g key={idx}>
                                                        <circle cx={x} cy={ySug} r="4" fill="#94a3b8" />
                                                        <circle cx={x} cy={yReal} r="4.5" fill="#047857" />
                                                        <text x={x} y="225" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">{m.name}</text>
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Gasto por Destino */}
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_4px_30px_rgba(0,0,0,0.02)] space-y-4">
                            <div>
                                <h4 className="text-base font-bold text-gray-900">Gasto por Destino</h4>
                                <p className="text-xs text-gray-400 font-medium">Distribución por destinatario ({viewMode === 'real' ? 'Costo Real' : 'Presupuestado'}).</p>
                            </div>
                            
                            <div className="space-y-3.5 pt-2">
                                {porDestino.map((d, i) => {
                                    const total = porDestino.reduce((a, x) => a + x.value, 0);
                                    const pct = total > 0 ? (d.value / total) * 100 : 0;
                                    
                                    let barColor = 'bg-blue-500';
                                    if (d.name === 'Funcionarios') barColor = 'bg-teal-500';
                                    else if (d.name === 'Premio / Beneficio') barColor = 'bg-amber-500';
                                    else if (d.name === 'Mantención / Servicio') barColor = 'bg-red-500';

                                    return (
                                        <div key={d.name} className="space-y-1.5">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                                                    {getDestinoIcon(d.name)}
                                                    {d.name}
                                                </span>
                                                <span className="font-bold text-gray-900">{formatCLP(d.value)} ({pct.toFixed(0)}%)</span>
                                            </div>
                                            <div className="h-2.5 w-full bg-gray-50 rounded-full overflow-hidden">
                                                <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Fila Inferior: Gastos por Area, Categoria, Cuentas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        
                        {/* Gasto por Área (Top 5) */}
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_4px_30px_rgba(0,0,0,0.02)] space-y-4">
                            <div>
                                <h4 className="text-base font-bold text-gray-900">Top 5 Áreas con Mayor Costo</h4>
                                <p className="text-xs text-gray-400 font-medium">Comparación de sugerido (gris) vs real (azul).</p>
                            </div>
                            <div className="space-y-4 pt-1">
                                {porArea.length === 0 ? (
                                    <p className="text-center text-xs text-gray-400 py-6">Sin datos disponibles</p>
                                ) : porArea.map(a => {
                                    const maxAreaVal = Math.max(...porArea.map(x => Math.max(x.sugerido, x.real)), 1);
                                    const pctSug = (a.sugerido / maxAreaVal) * 100;
                                    const pctReal = (a.real / maxAreaVal) * 100;

                                    return (
                                        <div key={a.name} className="space-y-1">
                                            <div className="flex justify-between items-center text-xs font-semibold">
                                                <span className="text-gray-700 truncate max-w-[150px]">{a.name}</span>
                                                <span className="text-gray-900 font-bold">{formatCLP(a.real)}</span>
                                            </div>
                                            <div className="space-y-1">
                                                <div className="h-1.5 w-full bg-gray-50 rounded-full">
                                                    <div className="h-full bg-gray-300 rounded-full" style={{ width: `${pctSug}%` }} />
                                                </div>
                                                <div className="h-2 w-full bg-gray-50 rounded-full">
                                                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pctReal}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Gasto por Categoría (Top 5) */}
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_4px_30px_rgba(0,0,0,0.02)] space-y-4">
                            <div>
                                <h4 className="text-base font-bold text-gray-900">Gasto por Categorías</h4>
                                <p className="text-xs text-gray-400 font-medium">Categorías más solicitadas comparadas con costo real.</p>
                            </div>
                            <div className="space-y-4 pt-1">
                                {porCategoria.length === 0 ? (
                                    <p className="text-center text-xs text-gray-400 py-6">Sin datos disponibles</p>
                                ) : porCategoria.map(c => {
                                    const maxCatVal = Math.max(...porCategoria.map(x => Math.max(x.sugerido, x.real)), 1);
                                    const pctSug = (c.sugerido / maxCatVal) * 100;
                                    const pctReal = (c.real / maxCatVal) * 100;

                                    return (
                                        <div key={c.name} className="space-y-1">
                                            <div className="flex justify-between items-center text-xs font-semibold">
                                                <span className="text-gray-700 truncate max-w-[150px]">{c.name}</span>
                                                <span className="text-gray-900 font-bold">{formatCLP(c.real)}</span>
                                            </div>
                                            <div className="space-y-1">
                                                <div className="h-1.5 w-full bg-gray-50 rounded-full">
                                                    <div className="h-full bg-gray-300 rounded-full" style={{ width: `${pctSug}%` }} />
                                                </div>
                                                <div className="h-2 w-full bg-gray-50 rounded-full">
                                                    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${pctReal}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Distribución por Cuentas Contables */}
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-[0_4px_30px_rgba(0,0,0,0.02)] space-y-4">
                            <div>
                                <h4 className="text-base font-bold text-gray-900">Cuentas Contables</h4>
                                <p className="text-xs text-gray-400 font-medium">Distribución de gasto por código de cuenta contable.</p>
                            </div>
                            <div className="space-y-3 pt-1">
                                {porCuenta.length === 0 ? (
                                    <p className="text-center text-xs text-gray-400 py-6">Sin datos disponibles</p>
                                ) : porCuenta.map(ct => {
                                    const maxCta = Math.max(...porCuenta.map(x => x.value), 1);
                                    const pct = (ct.value / maxCta) * 100;

                                    return (
                                        <div key={ct.name} className="space-y-1">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded font-mono text-[10px]">{ct.name}</span>
                                                <span className="font-bold text-gray-900">{formatCLP(ct.value)}</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-gray-50 rounded-full">
                                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                    </div>
                </>
            )}
        </div>
    );
}
