'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { 
    Users, TrendingUp, AlertCircle, FileText, ShoppingCart,
    DollarSign, PackageOpen, Percent, BellRing, Sparkles, Loader2, ArrowRight, Calendar
} from 'lucide-react';
import api from '@/lib/api/client';
import { BudgetRequest, BudgetDetail, PresupuestoAnual } from '@/lib/types';
import { primeraRutaAccesible } from '@/lib/permissions/registry';

interface DashboardStats {
    totalAprobado: number;
    totalComprado: number;
    totalReal: number;
    totalPendiente: number;
    porcentajeCumplimiento: number;
    alertasCount: number;
    solicitudesPendientesCount: number;
}

export default function DashboardPage() {
    const { user, tienePermiso, puedeSeccion, isLoading } = useAuth();
    const router = useRouter();
    const tieneDashboard = tienePermiso('dashboard', 'ver');
    // Si el usuario no puede ver el dashboard, se calcula su primer módulo accesible
    // (según el registro único de permisos). Si tampoco tiene ninguno, se avisa aquí
    // mismo en vez de redirigir a una ruta fija (evita loops con páginas que a su vez
    // redirigen de vuelta a /dashboard cuando falta su propio permiso).
    const destinoAlternativo = !tieneDashboard ? primeraRutaAccesible(tienePermiso, puedeSeccion) : null;

    const [solicitudes, setSolicitudes] = useState<BudgetRequest[]>([]);
    const [comprasHistorial, setComprasHistorial] = useState<BudgetRequest[]>([]);
    const [ots, setOts] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [otsDraftCount, setOtsDraftCount] = useState(0);
    // Presupuesto anual seleccionado. Las solicitudes se enlazan explícitamente a
    // un presupuesto (p.ej. "Presupuesto 2027"); aquí se elige cuál visualizar.
    const [presupuestos, setPresupuestos] = useState<PresupuestoAnual[]>([]);
    const [selectedPptoId, setSelectedPptoId] = useState<number | null>(null);

    const selectedPpto = useMemo(
        () => presupuestos.find(p => p.id_presupuesto_anual === selectedPptoId) || null,
        [presupuestos, selectedPptoId]
    );
    const year = selectedPpto?.year ?? new Date().getFullYear();

    // Permission Check: si no puede ver el dashboard pero sí tiene otro módulo
    // accesible, se le lleva directo ahí.
    useEffect(() => {
        if (!isLoading && user && !tieneDashboard && destinoAlternativo) {
            router.replace(destinoAlternativo);
        }
    }, [user, isLoading, tieneDashboard, destinoAlternativo, router]);

    // Cargar la lista de presupuestos anuales y elegir uno por defecto (el del
    // año siguiente si existe, si no el más reciente).
    useEffect(() => {
        if (!user || !tieneDashboard) return;
        let cancelado = false;
        api.get('/presupuesto/presupuestos-anuales')
            .then(res => {
                if (cancelado) return;
                const lista: PresupuestoAnual[] = res.data || [];
                setPresupuestos(lista);
                if (lista.length > 0) {
                    const anioSiguiente = new Date().getFullYear() + 1;
                    const preferido = lista.find(p => p.year === anioSiguiente) || lista[0];
                    setSelectedPptoId(prev => prev ?? preferido.id_presupuesto_anual);
                }
            })
            .catch(err => { if (!cancelado) console.error('Error cargando presupuestos:', err); });
        return () => { cancelado = true; };
    }, [user, tieneDashboard]);

    const fetchDashboardData = useCallback(async () => {
        try {
            setLoadingData(true);
            const histUrl = selectedPptoId
                ? `/presupuesto/compras/historial?id_presupuesto_anual=${selectedPptoId}`
                : '/presupuesto/compras/historial';
            const [resSol, resHist] = await Promise.all([
                api.get('/presupuesto/solicitudes'),
                api.get(histUrl)
            ]);
            setSolicitudes(resSol.data);
            setComprasHistorial(resHist.data);

            // Check LocalStorage OTs
            if (typeof window !== 'undefined') {
                const otsJson = localStorage.getItem('go-compras-ots');
                if (otsJson) {
                    const parsedOts = JSON.parse(otsJson);
                    setOts(parsedOts);
                    const drafts = parsedOts.filter((ot: any) => ot.estado === 'Borrador').length;
                    setOtsDraftCount(drafts);
                }
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoadingData(false);
        }
    }, [selectedPptoId]);

    useEffect(() => {
        if (user && tieneDashboard) {
            fetchDashboardData();
        }
    }, [user, tieneDashboard, fetchDashboardData]);

    // ── Cálculos de Métricas de Compras y Presupuestos ────────────────────────────
    const stats = useMemo<DashboardStats>(() => {
        let totalAprobado = 0; // Presupuesto Sugerido ($16.237.177)
        let totalComprado = 0; // Se Completó ($10.149.977 - real de OTs completadas)
        let totalReal = 0;     // Total Real Proyectado (completados real + pendientes real)
        let totalPendiente = 0; 
        let alertasCount = 0;
        let solicitudesPendientesCount = 0;

        // Contar solicitudes pendientes enlazadas al presupuesto seleccionado.
        solicitudes.forEach(sol => {
            if (sol.estado === 'Pendiente' && selectedPptoId && sol.id_presupuesto_anual === selectedPptoId) {
                solicitudesPendientesCount++;
            }
        });

        // Cargar OTs completadas desde el estado React
        const completedItemUids = new Set<string>();
        ots.forEach((ot: any) => {
            if (ot.estado === 'Completada') {
                (ot.itemUids || []).forEach((uid: string) => completedItemUids.add(uid));
            }
        });

        // Calcular sobre el historial de compras aprobadas (lo mismo que ve el programador de compras)
        comprasHistorial.forEach(c => {
            (c.detalles || []).forEach(d => {
                const cant = d.cantidad || 0;
                const valSug = d.valor_unitario_iva || 0;
                const valReal = d.valor_real_iva !== null && d.valor_real_iva !== undefined ? d.valor_real_iva : valSug;
                const uid = `${c.id_presupuesto}-${d.id_pre_detalle}`;

                totalAprobado += cant * valSug;
                totalReal += cant * valReal;

                if (completedItemUids.has(uid)) {
                    totalComprado += cant * valReal; // Valor real comprado
                } else {
                    totalPendiente += cant * valReal;
                }

                // Alerta: Si compramos más caro que lo presupuestado
                if (d.valor_real_iva !== null && d.valor_real_iva !== undefined && d.valor_real_iva > valSug) {
                    alertasCount++;
                }
            });
        });

        const porcentajeCumplimiento = totalAprobado > 0 ? (totalComprado / totalAprobado) * 100 : 0;

        return {
            totalAprobado,
            totalComprado, // Se completó: Costo Real de OTs completadas
            totalReal, // Total Real Proyectado (completados real + pendientes real)
            totalPendiente,
            porcentajeCumplimiento,
            alertasCount,
            solicitudesPendientesCount
        };
    }, [solicitudes, comprasHistorial, ots, selectedPptoId]);

    // Generar alertas dinámicas
    const alertsList = useMemo(() => {
        const list: { text: string; type: 'warning' | 'info' | 'success' }[] = [];

        if (stats.solicitudesPendientesCount > 0) {
            list.push({
                text: `${stats.solicitudesPendientesCount} solicitudes de presupuesto esperando aprobación.`,
                type: 'warning'
            });
        }
        if (otsDraftCount > 0) {
            list.push({
                text: `Tienes ${otsDraftCount} Ordenes de Trabajo en estado Borrador pendientes por emitir.`,
                type: 'info'
            });
        }
        if (stats.alertasCount > 0) {
            list.push({
                text: `Se detectaron ${stats.alertasCount} recursos adquiridos por sobre el precio presupuestado originalmente.`,
                type: 'warning'
            });
        }
        if (list.length === 0) {
            list.push({
                text: "Todos los presupuestos y órdenes de trabajo están al día. ¡Buen trabajo!",
                type: 'success'
            });
        }

        return list;
    }, [stats, otsDraftCount]);

    const formatCLP = (val: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(val);
    };

    // Sin permiso de dashboard pero con otro módulo accesible: se está redirigiendo, solo se muestra el loader.
    if (isLoading || (user && !tieneDashboard && destinoAlternativo)) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-r-transparent" />
            </div>
        );
    }

    // Sin dashboard y sin ningún otro módulo accesible: se avisa aquí en vez de redirigir a ciegas.
    if (user && !tieneDashboard && !destinoAlternativo) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="max-w-md w-full bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-8 text-center space-y-3">
                    <div className="mx-auto h-12 w-12 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
                        <AlertCircle size={24} />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">Sin módulos asignados</h2>
                    <p className="text-sm text-gray-500">
                        Tu cuenta aún no tiene acceso a ningún módulo del sistema. Contacta a un administrador para que te asigne los permisos correspondientes.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500 space-y-8">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3.5xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5">
                        ¡Hola, {user?.nombre?.split(' ')[0] || 'Administrador'}! <Sparkles className="text-yellow-500 animate-bounce" size={28} />
                    </h1>
                    <p className="text-gray-500 mt-1 font-medium">
                        Control Presupuestario y Centro de Compras Consolidadas · <span className="font-bold text-gray-700">{selectedPpto?.nombre || `Presupuesto ${year}`}</span>
                    </p>
                </div>
                <div className="flex items-center gap-3 self-start md:self-auto">
                    {/* Selector de presupuesto anual */}
                    <div className="relative">
                        <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        {presupuestos.length > 0 ? (
                            <select
                                value={selectedPptoId ?? ''}
                                onChange={(e) => setSelectedPptoId(Number(e.target.value))}
                                title="Presupuesto a visualizar"
                                className="pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            >
                                {presupuestos.map(p => (
                                    <option key={p.id_presupuesto_anual} value={p.id_presupuesto_anual}>{p.nombre}</option>
                                ))}
                            </select>
                        ) : (
                            <button
                                onClick={() => router.push('/go-compras/presupuestos')}
                                className="pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-500 font-bold hover:border-primary hover:text-primary transition-colors"
                                title="Aún no hay presupuestos anuales"
                            >
                                Crear presupuesto
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => router.push('/go-compras/programar')}
                        className="px-5 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-2xl text-sm font-bold flex items-center gap-2 transition-all shadow-md"
                    >
                        Ir a Programar Compras <ArrowRight size={16} />
                    </button>
                </div>
            </div>

            {loadingData ? (
                <div className="h-96 flex flex-col items-center justify-center gap-2">
                    <Loader2 size={36} className="animate-spin text-primary" />
                    <p className="text-sm font-semibold text-gray-500">Cargando indicadores financieros...</p>
                </div>
            ) : (
                <>
                    {/* KPI Cards Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* KPI 1: Presupuesto Sugerido */}
                        <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_25px_rgba(0,0,0,0.03)] border border-gray-100/80 flex items-center justify-between transition-all hover:-translate-y-1 hover:shadow-md group">
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Presupuesto Sugerido</p>
                                <h3 className="text-2xl font-extrabold text-gray-900">{formatCLP(stats.totalAprobado)}</h3>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-blue-50 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                                <DollarSign size={24} />
                            </div>
                        </div>

                        {/* KPI 2: Se Completó */}
                        <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_25px_rgba(0,0,0,0.03)] border border-gray-100/80 flex items-center justify-between transition-all hover:-translate-y-1 hover:shadow-md group">
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Se Completó</p>
                                <h3 className="text-2xl font-extrabold text-emerald-700">{formatCLP(stats.totalComprado)}</h3>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                <ShoppingCart size={24} />
                            </div>
                        </div>

                        {/* KPI 3: Total Real */}
                        <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_25px_rgba(0,0,0,0.03)] border border-gray-100/80 flex items-center justify-between transition-all hover:-translate-y-1 hover:shadow-md group">
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Total Real Proyectado</p>
                                <h3 className="text-2xl font-extrabold text-indigo-700">{formatCLP(stats.totalReal)}</h3>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                <PackageOpen size={24} />
                            </div>
                        </div>

                        {/* KPI 4: % Cumplimiento */}
                        <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_25px_rgba(0,0,0,0.03)] border border-gray-100/80 flex items-center justify-between transition-all hover:-translate-y-1 hover:shadow-md group">
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">% Ejecutado</p>
                                <h3 className="text-2xl font-extrabold text-gray-900">{stats.porcentajeCumplimiento.toFixed(1)}%</h3>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-650 group-hover:text-white transition-all">
                                <Percent size={24} />
                            </div>
                        </div>
                    </div>

                    {/* Middle Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Progreso de Ejecución Presupuestaria */}
                        <div className="lg:col-span-2 bg-white rounded-[28px] p-8 shadow-[0_4px_25px_rgba(0,0,0,0.02)] border border-gray-100/80 space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Cumplimiento General del Presupuesto</h3>
                                <p className="text-xs text-gray-400 font-medium mt-1">Comparativa visual entre los fondos aprobados y las adquisiciones reales realizadas.</p>
                            </div>

                            <div className="space-y-6 pt-4">
                                <div>
                                    <div className="flex justify-between items-center text-xs font-semibold text-gray-500 mb-2">
                                        <span>Ejecución del Presupuesto</span>
                                        <span className="font-bold text-gray-900">{stats.porcentajeCumplimiento.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-4 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                                        <div 
                                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500" 
                                            style={{ width: `${Math.min(stats.porcentajeCumplimiento, 100)}%` }} 
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-xs">
                                    <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100/85">
                                        <p className="text-gray-400 font-medium">Ejecutado (Costo Real)</p>
                                        <p className="text-lg font-extrabold text-emerald-700 mt-1">{formatCLP(stats.totalReal)}</p>
                                    </div>
                                    <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100/85">
                                        <p className="text-gray-400 font-medium">Presupuesto Máximo Planificado</p>
                                        <p className="text-lg font-extrabold text-gray-900 mt-1">{formatCLP(stats.totalAprobado)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Alertas & Recordatorios */}
                        <div className="bg-white rounded-[28px] p-8 shadow-[0_4px_25px_rgba(0,0,0,0.02)] border border-gray-100/80 flex flex-col justify-between">
                            <div className="space-y-6">
                                <div className="flex items-center justify-between pb-2 border-b border-gray-50">
                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        <BellRing size={20} className="text-primary animate-ring" /> Recordatorios
                                    </h3>
                                    <span className="px-2 py-0.5 bg-primary/5 text-primary text-[10px] font-bold rounded-full font-mono">
                                        COMPRAS
                                    </span>
                                </div>

                                <div className="space-y-4">
                                    {alertsList.map((alert, idx) => (
                                        <div key={idx} className={`p-4 rounded-2xl flex gap-3 text-xs border ${
                                            alert.type === 'warning' ? 'bg-red-50/40 border-red-100 text-red-700' :
                                            alert.type === 'info' ? 'bg-blue-50/40 border-blue-100 text-blue-700' :
                                            'bg-green-50/40 border-green-100 text-green-700'
                                        }`}>
                                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                            <p className="font-semibold leading-relaxed">{alert.text}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button 
                                onClick={() => router.push('/go-compras/kpis')}
                                className="w-full py-3.5 mt-6 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 rounded-2xl transition-all flex items-center justify-center gap-1.5"
                            >
                                Ver Detalle de KPIs y Análisis
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}