'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

export interface FiltroMultiSelectOption {
    valor: string;
    label: string;
    count?: number;
    sublabel?: string;
}

export interface FiltroMultiSelectSinValor {
    valorEspecial: string;
    label: string;
    count: number;
}

export function FiltroMultiSelectGenerico({
    icono,
    tituloVacio,
    tituloPlural,
    seleccionados,
    onChange,
    opciones,
    opcionSinValor,
    placeholderBusqueda = 'Buscar...',
    anchoMinimo = 'min-w-[280px]',
}: {
    icono?: string;
    tituloVacio: string;
    tituloPlural: string;
    seleccionados: string[];
    onChange: (nuevos: string[]) => void;
    opciones: FiltroMultiSelectOption[];
    opcionSinValor?: FiltroMultiSelectSinValor;
    placeholderBusqueda?: string;
    anchoMinimo?: string;
}) {
    const [open, setOpen] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [abrirHaciaArriba, setAbrirHaciaArriba] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    const toggleOpen = () => {
        if (!open && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const espacioAbajo = window.innerHeight - rect.bottom;
            setAbrirHaciaArriba(espacioAbajo < 280 && rect.top > 280);
        }
        setOpen(!open);
    };

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    const q = busqueda.toLowerCase().trim();
    const opcionesFiltradas = useMemo(() => {
        if (!q) return opciones;
        return opciones.filter(o =>
            o.label.toLowerCase().includes(q) ||
            (o.sublabel && o.sublabel.toLowerCase().includes(q))
        );
    }, [opciones, q]);

    const matchSinValor = opcionSinValor && opcionSinValor.count > 0 && (!q || opcionSinValor.label.toLowerCase().includes(q) || 'sin'.includes(q));

    const toggleOpcion = (valor: string) => {
        if (seleccionados.includes(valor)) {
            onChange(seleccionados.filter(v => v !== valor));
        } else {
            onChange([...seleccionados, valor]);
        }
    };

    const limpiar = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        onChange([]);
    };

    const seleccionarTodosVisibles = () => {
        const nuevos = new Set(seleccionados);
        opcionesFiltradas.forEach(o => nuevos.add(o.valor));
        if (matchSinValor && opcionSinValor) nuevos.add(opcionSinValor.valorEspecial);
        onChange(Array.from(nuevos));
    };

    // Label para cuando hay solo 1 seleccionado
    const labelSingle = useMemo(() => {
        if (seleccionados.length !== 1) return '';
        if (opcionSinValor && seleccionados[0] === opcionSinValor.valorEspecial) {
            return opcionSinValor.label;
        }
        const match = opciones.find(o => o.valor === seleccionados[0]);
        return match ? match.label : seleccionados[0];
    }, [seleccionados, opciones, opcionSinValor]);

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={toggleOpen}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center justify-between gap-1.5 cursor-pointer ${
                    seleccionados.length > 0
                        ? 'bg-blue-50/80 border-blue-300 text-blue-900 font-bold ring-1 ring-blue-300/50'
                        : 'bg-white border-gray-200 text-gray-800 hover:border-gray-300'
                }`}
                title={seleccionados.length > 0 ? `Filtrando por ${seleccionados.length} ${tituloPlural.toLowerCase()}` : `Filtrar por ${tituloPlural}`}
            >
                <span className="truncate flex-1 text-left flex items-center gap-1.5">
                    {icono && <span>{icono}</span>}
                    {seleccionados.length === 0 ? (
                        <span>{tituloVacio}</span>
                    ) : seleccionados.length === 1 ? (
                        <span className="truncate">{labelSingle}</span>
                    ) : (
                        <span>{tituloPlural} ({seleccionados.length})</span>
                    )}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                    {seleccionados.length > 0 && (
                        <span
                            onClick={limpiar}
                            className="p-0.5 hover:bg-blue-200/70 rounded-full text-blue-700 transition-colors"
                            title={`Limpiar filtro de ${tituloPlural.toLowerCase()}`}
                        >
                            <X size={12} />
                        </span>
                    )}
                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180 text-primary' : ''}`} />
                </div>
            </button>

            {open && (
                <div
                    ref={dropdownRef}
                    className={`absolute left-0 z-50 ${abrirHaciaArriba ? 'bottom-full mb-1' : 'top-full mt-1'} w-full ${anchoMinimo} sm:min-w-[320px] max-w-sm bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150`}
                >
                    <div className="p-2 border-b border-gray-100 bg-gray-50/80">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                            <input
                                type="text"
                                autoFocus
                                placeholder={placeholderBusqueda}
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                className="w-full pl-8 pr-7 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                            />
                            {busqueda && (
                                <button
                                    type="button"
                                    onClick={() => setBusqueda('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-gray-500 font-medium">
                            <span>{opcionesFiltradas.length + (matchSinValor ? 1 : 0)} opciones</span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={seleccionarTodosVisibles}
                                    className="text-primary hover:underline font-bold cursor-pointer"
                                >
                                    Marcar todos
                                </button>
                                {seleccionados.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={limpiar}
                                        className="text-red-500 hover:underline font-bold cursor-pointer"
                                    >
                                        Limpiar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="max-h-[220px] overflow-y-auto divide-y divide-gray-50 p-1">
                        {matchSinValor && opcionSinValor && (
                            <label
                                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                                    seleccionados.includes(opcionSinValor.valorEspecial) ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-gray-50 text-gray-600 italic'
                                }`}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={seleccionados.includes(opcionSinValor.valorEspecial)}
                                        onChange={() => toggleOpcion(opcionSinValor.valorEspecial)}
                                        className="rounded border-gray-300 text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer"
                                    />
                                    <span className="truncate">{opcionSinValor.label}</span>
                                </div>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full shrink-0 font-bold ${
                                    seleccionados.includes(opcionSinValor.valorEspecial) ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
                                }`}>
                                    {opcionSinValor.count}
                                </span>
                            </label>
                        )}

                        {opcionesFiltradas.length === 0 && !matchSinValor ? (
                            <div className="px-4 py-6 text-center text-xs text-gray-400 italic">
                                Sin resultados para "{busqueda}"
                            </div>
                        ) : (
                            opcionesFiltradas.map(o => {
                                const isSelected = seleccionados.includes(o.valor);
                                return (
                                    <label
                                        key={o.valor}
                                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                                            isSelected ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-gray-50 text-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleOpcion(o.valor)}
                                                className="rounded border-gray-300 text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer"
                                            />
                                            <div className="truncate flex flex-col">
                                                <span className="truncate font-medium">{o.label}</span>
                                                {o.sublabel && (
                                                    <span className="text-[10px] text-gray-400 truncate">{o.sublabel}</span>
                                                )}
                                            </div>
                                        </div>
                                        {o.count !== undefined && (
                                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full shrink-0 font-bold ${
                                                isSelected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
                                            }`}>
                                                {o.count}
                                            </span>
                                        )}
                                    </label>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
