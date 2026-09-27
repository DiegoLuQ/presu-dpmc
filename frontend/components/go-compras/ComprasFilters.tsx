'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { ListFilter, School, Calendar } from 'lucide-react';
import { Colegio, PresupuestoAnual } from '@/lib/types';

interface ComprasFiltersProps {
    colegioId: string;
    year: string;
    onColegioChange: (value: string) => void;
    onYearChange: (value: string) => void;
    children?: React.ReactNode;
}

/**
 * Barra de filtros reutilizable para el módulo GO-Compras.
 * Permite filtrar por colegio y por presupuesto registrado.
 */
export default function ComprasFilters({ colegioId, year, onColegioChange, onYearChange, children }: ComprasFiltersProps) {
    const { user } = useAuth();
    const esMulticolegio = user?.rol?.codigo === 'ADM' || user?.rol?.codigo === 'SOS' || (user?.colegios && user.colegios.length > 1);

    const [colegios, setColegios] = useState<Colegio[]>([]);
    const [presupuestos, setPresupuestos] = useState<PresupuestoAnual[]>([]);

    useEffect(() => {
        let cancelado = false;
        api.get('/catalogos/colegios')
            .then(res => { if (!cancelado) setColegios(res.data || []); })
            .catch(() => { if (!cancelado) setColegios([]); });

        api.get('/presupuesto/presupuestos-anuales')
            .then(res => { if (!cancelado) setPresupuestos(res.data || []); })
            .catch(() => { if (!cancelado) setPresupuestos([]); });

        return () => { cancelado = true; };
    }, []);

    // Presupuestos del colegio seleccionado (si aplica)
    const presupuestosColegio = presupuestos.filter(p => {
        if (!colegioId) return false;
        return String(p.id_colegio) === String(colegioId);
    });

    // Años únicos de presupuestos registrados (para la vista de "Todos los colegios")
    const anosUnicos = Array.from(new Set(presupuestos.map(p => p.year))).sort((a, b) => b - a);

    // Años disponibles de respaldo si no hay presupuestos registrados
    const currentYear = new Date().getFullYear();
    const fallbackYears = Array.from({ length: 4 }, (_, i) => currentYear + 1 - i);

    const handleColegioChangeInternal = (newColegioId: string) => {
        onColegioChange(newColegioId);
        if (!newColegioId) {
            // Al seleccionar "Todos los colegios", resetea para ver todos los presupuestos
            onYearChange('');
        } else {
            // Si el año seleccionado actualmente no existe en el colegio elegido, resetear a ''
            const presupuestosDeColegio = presupuestos.filter(p => String(p.id_colegio) === String(newColegioId));
            if (year && !presupuestosDeColegio.some(p => String(p.year) === String(year))) {
                onYearChange('');
            }
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-3 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-2">
                <ListFilter size={16} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-500">Filtrar por:</span>
            </div>

            {/* Filtro Colegio */}
            {esMulticolegio ? (
                <div className="relative">
                    <School size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <select
                        value={colegioId}
                        onChange={(e) => handleColegioChangeInternal(e.target.value)}
                        className="pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    >
                        <option value="">Todos los colegios</option>
                        {colegios.map(c => (
                            <option key={c.id_colegio} value={c.id_colegio}>{c.nombre}</option>
                        ))}
                    </select>
                </div>
            ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold shadow-2xs">
                    <School size={15} className="text-gray-400" />
                    <span>{colegios.find(c => String(c.id_colegio) === String(colegioId))?.nombre || user?.colegio?.nombre || 'Mi Colegio'}</span>
                </div>
            )}

            {/* Filtro Presupuesto Registrado */}
            <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <select
                    value={year}
                    onChange={(e) => onYearChange(e.target.value)}
                    title="Seleccionar Presupuesto"
                    className="pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                >
                    <option value="">
                        {colegioId ? 'Todos los presupuestos del colegio' : 'Todos los presupuestos'}
                    </option>
                    {colegioId ? (
                        presupuestosColegio.map(p => (
                            <option key={p.id_presupuesto_anual} value={String(p.year)}>
                                {p.nombre ? p.nombre : `Presupuesto ${p.year}`}
                            </option>
                        ))
                    ) : (
                        anosUnicos.length > 0 ? (
                            anosUnicos.map(y => (
                                <option key={y} value={String(y)}>
                                    Presupuesto {y}
                                </option>
                            ))
                        ) : (
                            fallbackYears.map(y => (
                                <option key={y} value={String(y)}>Presupuesto {y}</option>
                            ))
                        )
                    )}
                </select>
            </div>

            {children}
        </div>
    );
}
