'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api/client';
import { History, ShoppingCart, Loader2, Eye, User, Package, DollarSign, Building2, FileText, ToggleLeft, ToggleRight } from 'lucide-react';
import { BudgetRequest } from '@/lib/types';
import ComprasFilters from '@/components/go-compras/ComprasFilters';

const formatCLP = (value: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value || 0);

export default function HistorialComprasPage() {
    const router = useRouter();
    const [colegioId, setColegioId] = useState('');
    const [year, setYear] = useState(String(new Date().getFullYear()));
    const [compras, setCompras] = useState<BudgetRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [togglingId, setTogglingId] = useState<number | null>(null);

    const fetchCompras = useCallback(async () => {
        setLoading(true);
        try {
            const params: string[] = [];
            if (colegioId) params.push(`id_colegio=${colegioId}`);
            if (year) params.push(`year=${year}`);
            const url = '/presupuesto/compras/historial' + (params.length ? '?' + params.join('&') : '');
            const res = await api.get(url);
            setCompras(res.data);
        } catch (error) {
            console.error('Error cargando historial de compras:', error);
            setCompras([]);
        } finally {
            setLoading(false);
        }
    }, [colegioId, year]);

    useEffect(() => {
        fetchCompras();
    }, [fetchCompras]);

    const toggleActivo = useCallback(async (compra: BudgetRequest) => {
        const nuevoEstado = compra.activo === false;
        setTogglingId(compra.id_presupuesto);
        // Actualización optimista
        setCompras((prev) =>
            prev.map((c) =>
                c.id_presupuesto === compra.id_presupuesto ? { ...c, activo: nuevoEstado } : c
            )
        );
        try {
            await api.patch(`/presupuesto/compras/historial/${compra.id_presupuesto}/activo`, {
                activo: nuevoEstado,
            });
        } catch (error) {
            console.error('Error actualizando estado de la compra:', error);
            // Revertir en caso de error
            setCompras((prev) =>
                prev.map((c) =>
                    c.id_presupuesto === compra.id_presupuesto ? { ...c, activo: !nuevoEstado } : c
                )
            );
        } finally {
            setTogglingId(null);
        }
    }, []);

    const activas = compras.filter((c) => c.activo !== false);
    const totalMonto = activas.reduce((acc, c) => {
        const sumAprobado = (c.detalles || []).reduce((sum, d) => {
            if (d.estado_aprobacion === 'Aprobado') {
                return sum + (d.total_iva || (d.cantidad * d.valor_unitario_iva));
            }
            return sum;
        }, 0);
        return acc + sumAprobado;
    }, 0);
    const totalRecursos = activas.reduce((acc, c) => acc + (c.detalles?.length || 0), 0);

    return (
        <div className="animate-in fade-in duration-500">
            {/* Header */}
            <div className="mb-6 flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                    <History size={26} />
                </div>
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Historial de Compras</h2>
                    <p className="text-gray-500 mt-1 font-medium">Solicitudes aprobadas por colegio y año.</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="mb-6">
                <ComprasFilters
                    colegioId={colegioId}
                    year={year}
                    onColegioChange={setColegioId}
                    onYearChange={setYear}
                />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <FileText size={28} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Compras Aprobadas</p>
                        <h3 className="text-2xl font-bold text-gray-900">{compras.length}</h3>
                    </div>
                </div>
                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-green-50 flex items-center justify-center text-green-600">
                        <DollarSign size={28} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Monto Total <span className="text-xs font-medium text-gray-400">(solo activas)</span></p>
                        <h3 className="text-2xl font-bold text-gray-900">{formatCLP(totalMonto)}</h3>
                    </div>
                </div>
                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500">
                        <Package size={28} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Recursos Totales</p>
                        <h3 className="text-2xl font-bold text-gray-900">{totalRecursos}</h3>
                    </div>
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Solicitud</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Solicitante</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Colegio</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Área</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Recursos</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Monto Total</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Monto Aprobado</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Detalle</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="animate-spin" size={24} />
                                            <span>Cargando historial...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : compras.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-16 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="p-4 bg-gray-50 rounded-2xl">
                                                <ShoppingCart size={32} className="text-gray-300" />
                                            </div>
                                            <p className="font-medium text-gray-500">No hay compras aprobadas para los filtros seleccionados.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                compras.map((c) => {
                                    const isActiva = c.activo !== false;
                                    return (
                                    <tr
                                        key={c.id_presupuesto}
                                        className={`transition-colors ${isActiva ? 'hover:bg-gray-50/50' : 'bg-gray-50/60 opacity-60'}`}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                            <div className="flex items-center gap-2">
                                                <FileText size={16} className="text-gray-400" />
                                                <div className="flex flex-col">
                                                    <span>REQ-{new Date(c.fecha).getFullYear()}-{c.id_presupuesto.toString().padStart(3, '0')}</span>
                                                    <span className="text-xs text-gray-400 font-medium">
                                                        {new Date(c.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">
                                            <div className="flex items-center gap-2">
                                                <User size={14} className="text-gray-400" />
                                                {c.user_nombre || '—'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            <div className="flex items-center gap-2">
                                                <Building2 size={14} className="text-gray-400" />
                                                {c.colegio_nombre || '—'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                            <div className="font-medium">{c.area_nombre || '—'}</div>
                                            {c.subarea_nombre && <div className="text-xs text-gray-500">{c.subarea_nombre}</div>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-bold">
                                                {c.detalles?.length || 0} items
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                                            {formatCLP(c.monto_total)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-emerald-600 bg-emerald-50/10">
                                            {formatCLP(
                                                (c.detalles || []).reduce((sum, d) => {
                                                    if (d.estado_aprobacion === 'Aprobado') {
                                                        return sum + (d.total_iva || (d.cantidad * d.valor_unitario_iva));
                                                    }
                                                    return sum;
                                                }, 0)
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <button
                                                onClick={() => toggleActivo(c)}
                                                disabled={togglingId === c.id_presupuesto}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors disabled:opacity-50 ${
                                                    isActiva
                                                        ? 'bg-green-50 text-green-600 hover:bg-green-100'
                                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                                }`}
                                                title={isActiva ? 'Desactivar (no contará en el monto total)' : 'Activar (contará en el monto total)'}
                                            >
                                                {togglingId === c.id_presupuesto ? (
                                                    <Loader2 size={16} className="animate-spin" />
                                                ) : isActiva ? (
                                                    <ToggleRight size={16} />
                                                ) : (
                                                    <ToggleLeft size={16} />
                                                )}
                                                {isActiva ? 'Activa' : 'Inactiva'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <button
                                                onClick={() => router.push(`/go-compras/historial/${c.id_presupuesto}`)}
                                                className="p-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                                                title="Ver detalle"
                                            >
                                                <Eye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
