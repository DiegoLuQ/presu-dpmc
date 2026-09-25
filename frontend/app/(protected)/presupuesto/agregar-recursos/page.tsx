'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import {
    ArrowLeft, Plus, Trash2, Save, Search, Loader2,
    X, Package, Calendar, Check, Copy, Edit2, History, ClipboardList,
    ChevronLeft, ChevronRight, ChevronDown, HelpCircle, MapPin, AlertCircle, DollarSign,
    Maximize2, Filter, SlidersHorizontal, FileDown, Upload, FileSpreadsheet, Layers, AlignLeft, Tag, Eye,
    GraduationCap, Lock, Unlock, RotateCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { descargarPlantillaPresupuesto } from '@/lib/excel/presupuestoTemplate';
import { ImportarExcelModal } from '@/components/presupuesto/ImportarExcelModal';
import { PrepararInsumosModal } from '@/components/presupuesto/PrepararInsumosModal';
import { GuiaRecursosModal } from '@/components/presupuesto/GuiaRecursosModal';
import { DetalleInsumoModal } from '@/components/presupuesto/DetalleInsumoModal';
import {
    FORMATOS_UNIDAD, TIPOS_FECHA, MESES,
    CategoriaRecurso, Recurso, ActividadBuscar, DetallePresupuestoForm, RecursoOption
} from '@/lib/types';
import { calcularSubvencion } from '@/lib/subvenciones';
import { DESTINOS, DESTINOS_LABELS, destinoCanonico, etiquetaDestino } from '@/lib/destinos';

interface SolicitudInfo {
    id_presupuesto: number;
    id_subarea?: number | null;
    codigo: string;
    area_nombre: string;
    subarea_nombre: string;
    estado: string;
    comentario?: string;
    presupuesto_anual_nombre?: string | null;
    presupuesto_anual_year?: number | null;
    colegio_nombre?: string | null;
}

interface RecursoHistorial {
    id_pre_detalle: number;
    id_presupuesto: number;
    codigo_solicitud: string;
    nombre_producto: string;
    descripcion?: string;
    formato_unidad: string;
    cantidad: number;
    valor_unitario_iva: number;
    total_iva: number;
    fecha_ejecucion: string;
    fecha_termino?: string;
    tipo_fecha: string;
    motivo: string;
    estado_aprobacion: string;
    id_recurso?: number | null;
    id_actividad?: number | null;
    actividad_nombre?: string | null;
    destino_gasto?: string | null;
    id_subvencion?: number | null;
    codigo_cuenta?: string | null;
    id_cargo?: number | null;
    id_subarea?: number | null;
    dimension_pme?: string | null;
}

// Actividad PME asociada a un insumo, devuelta por
// /presupuesto/actividades/sugeridas-por-recurso.
// origen: "historial" = ya se vinculó este insumo a la actividad en alguna
// solicitud del colegio; "plan_pme" = el recurso aparece en el `lista_recursos`
// de la actividad del Plan PME vigente.
interface ActividadSugeridaRecurso {
    id_actividad: number;
    nombre_actividad: string;
    dimension?: string | null;
    subdimension?: string | null;
    // "solicitud_actual" se calcula en el cliente (ver sugerenciasActividadCombinadas):
    // cubre los insumos de esta misma solicitud, incluso los borradores todavía sin
    // guardar, que el backend aún no puede ver.
    origen: 'historial' | 'plan_pme' | 'solicitud_actual';
    veces_usado: number;
    ultimo_motivo?: string | null;
    en_pme_actual: boolean;
    en_plan_pme: boolean;
}

// Roles mapping for pre-selection if needed

// Columnas configurables de la vista completa. `fijo` = no se puede ocultar.
const COLUMNAS_TABLA: { key: string; label: string; fijo?: boolean }[] = [
    { key: 'insumo', label: 'Insumo', fijo: true },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'justificacion', label: 'Justificación / Motivo' },
    { key: 'cargo', label: 'Cargo / Destinatario' },
    { key: 'destino', label: 'Destino del Gasto' },
    { key: 'cantidad', label: 'Cantidad' },
    { key: 'valorUnit', label: 'Valor Unitario' },
    { key: 'total', label: 'Total' },
    { key: 'fecha', label: 'Fecha / Período' },
    { key: 'subvencion', label: 'Subvención' },
    { key: 'codigoCuenta', label: 'Código Contable' },
    { key: 'dimensionPme', label: 'Dimensión PME' },
    { key: 'actividadPme', label: 'Nombre de Actividad del PME' },
    { key: 'estado', label: 'Estado' },
    { key: 'gestion', label: 'Gestión (acciones)' },
];

// Columnas visibles por defecto en la vista completa. El orden en pantalla lo da
// COLUMNAS_TABLA, así que la secuencia resultante es: Insumo · Descripción ·
// Justificación / Motivo · Destino del Gasto · Cant. · Valor Unit. · Total ·
// Fecha / Período · Actividad PME · Estado · Gestión.
const COLUMNAS_VISIBLES_DEFAULT: Record<string, boolean> = {
    insumo: true,
    descripcion: true,
    justificacion: true,
    cargo: false,
    destino: true,
    cantidad: true,
    valorUnit: true,
    total: true,
    fecha: true,
    subvencion: false,
    codigoCuenta: false,
    dimensionPme: false,
    actividadPme: true,
    estado: true,
    gestion: true,
};

// Versión de los valores por defecto. Las preferencias guardadas se mezclan sobre
// los defaults, así que un usuario que ya había tocado el selector nunca vería un
// cambio de defaults: al subir esta versión se descarta la preferencia anterior
// una sola vez y de ahí en adelante manda otra vez lo que el usuario elija.
const COLUMNAS_DEFAULT_VERSION = '5';
const CLAVE_COLUMNAS = 'config_columnas_presupuesto';
const CLAVE_ORDEN_COLUMNAS = 'config_orden_columnas_presupuesto';
const CLAVE_COLUMNAS_VERSION = 'config_columnas_presupuesto_version';
const CLAVE_TEXTO_COMPLETO = 'config_texto_completo_presupuesto';
function SelectorActividadPmeFila({
    actividadActual,
    todasActividades,
    onSelect,
}: {
    actividadActual: ActividadBuscar | null | undefined;
    todasActividades: ActividadBuscar[];
    onSelect: (act: ActividadBuscar | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const [abrirHaciaArriba, setAbrirHaciaArriba] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    const toggleOpen = () => {
        if (!open && dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect();
            const espacioAbajo = window.innerHeight - rect.bottom;
            setAbrirHaciaArriba(espacioAbajo < 280 && rect.top > 280);
        }
        setOpen(!open);
    };

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const actividadesFiltradas = useMemo(() => {
        const q = busqueda.toLowerCase().trim();
        if (!q) return todasActividades;
        return todasActividades.filter(a =>
            a.nombre.toLowerCase().includes(q) ||
            (a.dimension || '').toLowerCase().includes(q) ||
            (a.subdimension || '').toLowerCase().includes(q)
        );
    }, [todasActividades, busqueda]);

    return (
        <div className={`relative ${open ? 'z-30' : ''}`} ref={dropdownRef}>
            <button
                type="button"
                onClick={toggleOpen}
                className={`w-full text-left px-2.5 py-1.5 rounded-xl border text-xs transition-all flex items-center justify-between gap-1.5 shadow-2xs ${
                    actividadActual
                        ? 'bg-blue-50/70 border-blue-200/80 text-blue-900 hover:bg-blue-100/70 font-medium'
                        : 'bg-white border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 italic'
                }`}
                title={actividadActual?.nombre || 'Seleccionar actividad PME'}
            >
                <span className="truncate flex-1">
                    {actividadActual ? actividadActual.nombre : '— Seleccionar PME —'}
                </span>
                <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? 'rotate-180 text-primary' : 'text-gray-400'}`} />
            </button>

            {open && (
                <div className={`absolute left-0 z-50 w-[320px] sm:w-[380px] bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
                    abrirHaciaArriba ? 'bottom-full mb-1' : 'top-full mt-1'
                }`}>
                    <div className="p-2 border-b border-gray-100 bg-gray-50/60">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                            <input
                                type="text"
                                autoFocus
                                placeholder="Buscar actividad por nombre, dimensión..."
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                className="w-full pl-8 pr-7 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                            />
                            {busqueda && (
                                <button
                                    type="button"
                                    onClick={() => setBusqueda('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="max-h-[220px] overflow-y-auto divide-y divide-gray-50">
                        <button
                            type="button"
                            onClick={() => {
                                onSelect(null);
                                setOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-red-50 text-red-600 font-semibold flex items-center gap-1.5 ${
                                !actividadActual ? 'bg-red-50/50' : ''
                            }`}
                        >
                            <X size={12} /> Sin Actividad PME
                        </button>

                        {actividadesFiltradas.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-gray-400 italic">
                                No se encontraron actividades con "{busqueda}"
                            </div>
                        ) : (
                            actividadesFiltradas.map(a => {
                                const isSelected = actividadActual?.id === a.id;
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => {
                                            onSelect(a);
                                            setOpen(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-primary/5 flex items-start gap-2 ${
                                            isSelected ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700'
                                        }`}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-xs leading-snug line-clamp-2">{a.nombre}</p>
                                            {a.dimension && (
                                                <span className="inline-block mt-0.5 text-[10px] text-gray-400 font-medium">
                                                    {a.dimension} {a.subdimension ? `· ${a.subdimension}` : ''}
                                                </span>
                                            )}
                                        </div>
                                        {isSelected && <Check size={14} className="text-primary shrink-0 mt-0.5" />}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function SelectorMotivoFila({
    motivoActual,
    motivos,
    onSelect,
}: {
    motivoActual: string | undefined | null;
    motivos: string[];
    onSelect: (motivo: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [abrirHaciaArriba, setAbrirHaciaArriba] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    const toggleOpen = () => {
        if (!open && dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect();
            const espacioAbajo = window.innerHeight - rect.bottom;
            setAbrirHaciaArriba(espacioAbajo < 280 && rect.top > 280);
        }
        setOpen(!open);
    };

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    // Filtrar motivos disponibles según la búsqueda y asegurar orden alfabético
    const motivosFiltrados = useMemo(() => {
        const q = busqueda.toLowerCase().trim();
        const lista = q
            ? motivos.filter(m => m.toLowerCase().includes(q))
            : motivos;
        return [...lista].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }, [motivos, busqueda]);

    const esNuevoMotivo = busqueda.trim().length > 0 && !motivos.some(m => m.toLowerCase() === busqueda.trim().toLowerCase());

    return (
        <div className={`relative ${open ? 'z-30' : ''}`} ref={dropdownRef}>
            <button
                type="button"
                onClick={toggleOpen}
                className={`w-full text-left px-2.5 py-1.5 rounded-xl border text-xs transition-all flex items-center justify-between gap-1.5 shadow-2xs cursor-pointer ${
                    motivoActual
                        ? 'bg-amber-50/60 border-amber-200/80 text-amber-950 hover:bg-amber-100/60 font-medium'
                        : 'bg-white border-dashed border-gray-300 text-gray-400 hover:text-gray-700 hover:border-gray-400 italic'
                }`}
                title={motivoActual || 'Seleccionar justificación / motivo'}
            >
                <span className="truncate flex-1 font-medium">
                    {motivoActual || '— sin justificación —'}
                </span>
                <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? 'rotate-180 text-primary' : 'text-gray-400'}`} />
            </button>

            {open && (
                <div className={`absolute left-0 z-50 w-[290px] sm:w-[350px] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
                    abrirHaciaArriba ? 'bottom-full mb-1' : 'top-full mt-1'
                }`}>
                    <div className="p-2 border-b border-gray-100 bg-gray-50/70">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                            <input
                                type="text"
                                autoFocus
                                placeholder="Buscar justificación..."
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
                    </div>

                    <div className="max-h-[220px] overflow-y-auto divide-y divide-gray-50">
                        <button
                            type="button"
                            onClick={() => {
                                onSelect('');
                                setOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-red-50 text-red-600 font-semibold flex items-center gap-1.5 cursor-pointer ${
                                !motivoActual ? 'bg-red-50/50' : ''
                            }`}
                        >
                            <X size={12} /> Sin justificación
                        </button>

                        {esNuevoMotivo && (
                            <button
                                type="button"
                                onClick={() => {
                                    onSelect(busqueda.trim());
                                    setOpen(false);
                                    setBusqueda('');
                                }}
                                className="w-full text-left px-3 py-2 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold flex items-center gap-2 border-b border-emerald-100 cursor-pointer"
                            >
                                <Plus size={14} className="text-emerald-600 shrink-0" />
                                <span className="truncate">Usar como nuevo: "{busqueda.trim()}"</span>
                            </button>
                        )}

                        {motivosFiltrados.length === 0 && !esNuevoMotivo ? (
                            <div className="px-4 py-6 text-center text-xs text-gray-400 italic">
                                No se encontraron justificaciones con "{busqueda}"
                            </div>
                        ) : (
                            motivosFiltrados.map(m => {
                                const isSelected = (motivoActual || '').trim().toLowerCase() === m.trim().toLowerCase();
                                return (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => {
                                            onSelect(m);
                                            setOpen(false);
                                            setBusqueda('');
                                        }}
                                        className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-primary/5 flex items-center justify-between gap-2 cursor-pointer ${
                                            isSelected ? 'bg-primary/10 text-primary font-bold' : 'text-gray-700'
                                        }`}
                                    >
                                        <span className="truncate flex-1 font-medium">{m}</span>
                                        {isSelected && <Check size={14} className="text-primary shrink-0" />}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function FiltroMultiSelectGenerico({
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
    opciones: { valor: string; label: string; count?: number; sublabel?: string }[];
    opcionSinValor?: {
        valorEspecial: string;
        label: string;
        count: number;
    };
    placeholderBusqueda?: string;
    anchoMinimo?: string;
}) {
    const [open, setOpen] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
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
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center justify-between gap-1.5 cursor-pointer ${
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
                <div className={`absolute left-0 z-50 mt-1 w-full ${anchoMinimo} sm:min-w-[320px] max-w-sm bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150`}>
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

export default function AgregarRecursosPage() {
    // Alias: en esta página `sidebarCollapsed` ya nombra al panel de Insumos, así que
    // el del menú de la app (AuthContext) se renombra para no colisionar.
    const { user, codigoRol, setSidebarCollapsed: setSidebarAppColapsado } = useAuth();
    const esAdmin = Boolean(
        codigoRol === 'ADM' ||
        user?.rol?.codigo === 'ADM' ||
        user?.rol?.nombre?.toLowerCase().includes('admin') ||
        (user as any)?.is_admin
    );
    const router = useRouter();
    const searchParams = useSearchParams();
    const solicitudId = searchParams.get('id');
    // Clave de borrador en localStorage: recursos aún no confirmados (sin check).
    const borradorKey = solicitudId ? `borrador_recursos_${solicitudId}` : null;
    // Marca que la carga inicial (con restauración de borrador) ya ocurrió,
    // para no sobrescribir el localStorage antes de hidratar.
    const hidratadoRef = useRef(false);

    const [accesoPlantillaExcel, setAccesoPlantillaExcel] = useState<'oculto' | 'solo_admin' | 'todos'>('todos');
    const puedeVerPlantillaExcel = Boolean(accesoPlantillaExcel === 'todos' || (accesoPlantillaExcel === 'solo_admin' && esAdmin));
    const [accesoImportarExcel, setAccesoImportarExcel] = useState<'oculto' | 'solo_admin' | 'todos'>('solo_admin');
    const puedeImportarExcel = Boolean(accesoImportarExcel === 'todos' || (accesoImportarExcel === 'solo_admin' && esAdmin));
    const [accesoBotonIA, setAccesoBotonIA] = useState<'oculto' | 'solo_admin' | 'todos'>('oculto');
    const puedeVerBotonIA = Boolean(accesoBotonIA === 'todos' || (accesoBotonIA === 'solo_admin' && esAdmin));
    const [accesoBotonPreparar, setAccesoBotonPreparar] = useState<'oculto' | 'solo_admin' | 'todos'>('oculto');
    const puedeVerBotonPreparar = Boolean(accesoBotonPreparar === 'todos' || (accesoBotonPreparar === 'solo_admin' && esAdmin));

    const [todasSubareas, setTodasSubareas] = useState<{ id_subarea: number; nombre: string; area?: { id_area: number; nombre: string } }[]>([]);
    const [solicitud, setSolicitud] = useState<SolicitudInfo | null>(null);
    const [categorias, setCategorias] = useState<CategoriaRecurso[]>([]);
    const [subvencionesActivas, setSubvencionesActivas] = useState<{ id_subvencion: number; nombre_corto: string; nombre_completo: string }[]>([]);
    const [recursosActual, setRecursosActual] = useState<DetallePresupuestoForm[]>([]);
    const [historialRecursos, setHistorialRecursos] = useState<RecursoHistorial[]>([]);

    const [loading, setLoading] = useState(true);
    const [guardados, setGuardados] = useState<number[]>([]);

    const [activeTab, setActiveTab] = useState<'buscador' | 'pme' | 'historial'>('buscador');
    const [showRecursoModal, setShowRecursoModal] = useState(false);
    const [isEditando, setIsEditando] = useState(false);
    const [showActividadModal, setShowActividadModal] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [selectedActividad, setSelectedActividad] = useState<ActividadBuscar | null>(null);
    const [recursosActividad, setRecursosActividad] = useState<string[]>([]);
    const [selectedRecursosActividad, setSelectedRecursosActividad] = useState<string[]>([]);

    const [searchRecurso, setSearchRecurso] = useState('');
    const [searchActividad, setSearchActividad] = useState('');
    const [recursosEncontrados, setRecursosEncontrados] = useState<RecursoOption[]>([]);
    const [paginaRecursos, setPaginaRecursos] = useState(1);
    const [actividadesEncontradas, setActividadesEncontradas] = useState<ActividadBuscar[]>([]);
    const [todasActividades, setTodasActividades] = useState<ActividadBuscar[]>([]);
    const [searchPMEModal, setSearchPMEModal] = useState('');
    const [filtroDimensionPME, setFiltroDimensionPME] = useState('');
    const [filtroColegioPME, setFiltroColegioPME] = useState('');
    const [showPMEResults, setShowPMEResults] = useState(false);
    const [selectedHistorial, setSelectedHistorial] = useState<number[]>([]);
    const [filtroSolicitudHistorial, setFiltroSolicitudHistorial] = useState<string>('');
    const [savingItems, setSavingItems] = useState<number[]>([]);
    const [filasModificadas, setFilasModificadas] = useState<Set<number>>(new Set());
    const [filasConfirmadasRecientes, setFilasConfirmadasRecientes] = useState<Set<number>>(new Set());
    const [subcatResuelta, setSubcatResuelta] = useState<{ codigo_cuenta: string; nombre: string } | null>(null);
    const [loadingSubcat, setLoadingSubcat] = useState(false);
    const [asesorandoCategoria, setAsesorandoCategoria] = useState(false);
    const [clasificandoNuevo, setClasificandoNuevo] = useState(false);
    const [camposFaltantes, setCamposFaltantes] = useState<string[] | null>(null);
    const [asesoriaCategoria, setAsesoriaCategoria] = useState<{ recomendaciones: { id_cat_recurso: number; nombre: string; razon: string }[]; grupo: { id_grupo_recurso: number; nombre: string; razon: string } | null; proveedor: string; modelo: string } | null>(null);
    // ids sugeridos por IA para resaltar en verde mientras coincidan con lo seleccionado
    const [catSugeridaIA, setCatSugeridaIA] = useState<number | null>(null);
    const [grupoSugeridoIA, setGrupoSugeridoIA] = useState<number | null>(null);
    const [financiarConPIE, setFinanciarConPIE] = useState<boolean>(true);
    const [nombreDesbloqueado, setNombreDesbloqueado] = useState(false);
    const [showDestinoHelp, setShowDestinoHelp] = useState(false);
    const [showDetalleHelp, setShowDetalleHelp] = useState(false);
    const [showIdentificacionHelp, setShowIdentificacionHelp] = useState(false);
    const [showPMEHelp, setShowPMEHelp] = useState(false);
    const [dimensionHelpModal, setDimensionHelpModal] = useState<{ nombre: string; icono: string; descripcion: string; enfoque_principal: string; ejemplos_insumos: string } | null>(null);
    const [dimensionesInfoBD, setDimensionesInfoBD] = useState<any[]>([]);
    const [showCostosHelp, setShowCostosHelp] = useState(false);
    const [modalRevisarCopiado, setModalRevisarCopiado] = useState<{ codigo: string; count: number; nuevos: DetallePresupuestoForm[] } | null>(null);
    const detalleInsumoRef = useRef<HTMLTextAreaElement | null>(null);
    const [formatoEsOtros, setFormatoEsOtros] = useState(false);
    // 'fases' | 'columnas'
    const [layoutModo, setLayoutModo] = useState<'fases' | 'columnas'>('fases');
    const [faseActual, setFaseActual] = useState(0);
    const [showClasificacionInfo, setShowClasificacionInfo] = useState(false);
    const [detalleInsumoModal, setDetalleInsumoModal] = useState<{ item: DetallePresupuestoForm; index: number } | null>(null);
    const [catalogoDetalleModal, setCatalogoDetalleModal] = useState<RecursoOption | null>(null);

    // Lista de motivos ya utilizados en esta solicitud (con conteo) para autocompletar y evitar inconsistencias
    const motivosSugeridos = useMemo(() => {
        const counts = new Map<string, number>();
        recursosActual.forEach(r => {
            const m = (r.motivo || '').trim();
            if (m) counts.set(m, (counts.get(m) || 0) + 1);
        });
        historialRecursos.forEach(h => {
            const m = (h.motivo || '').trim();
            if (m && !counts.has(m)) counts.set(m, 1);
        });
        return Array.from(counts.entries())
            .map(([motivo, count]) => ({ motivo, count }))
            .sort((a, b) => b.count - a.count);
    }, [recursosActual, historialRecursos]);

    // Lista unificada de motivos disponibles ordenada alfabéticamente (A-Z) para selectores en tabla
    const motivosOrdenadosAlfabetico = useMemo(() => {
        const setMotivos = new Set<string>();
        recursosActual.forEach(r => {
            const m = (r.motivo || '').trim();
            if (m) setMotivos.add(m);
        });
        historialRecursos.forEach(h => {
            const m = (h.motivo || '').trim();
            if (m) setMotivos.add(m);
        });
        return Array.from(setMotivos).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }, [recursosActual, historialRecursos]);

    // Información del PME vigente utilizado (año y colegio de la solicitud)
    const pmeInfo = useMemo(() => {
        const actConPme = todasActividades.find(a => a.ano_pme || a.colegio_nombre);
        const colegio = solicitud?.colegio_nombre || actConPme?.colegio_nombre || (user as any)?.colegio?.nombre || null;
        const year = actConPme?.ano_pme || solicitud?.presupuesto_anual_year || null;
        if (!year && !colegio) return null;
        return { year, colegio };
    }, [todasActividades, solicitud, user]);

    // Filtros y vista completa de la tabla "Presupuesto Actual" (todos con multiselección)
    const [filtroPresupuesto, setFiltroPresupuesto] = useState('');
    const [filtroEstadoPpto, setFiltroEstadoPpto] = useState<'todos' | 'confirmados' | 'borrador'>('todos');
    const [filtroMeses, setFiltroMeses] = useState<string[]>([]);
    const [filtroDestinos, setFiltroDestinos] = useState<string[]>([]);
    const [filtroMotivos, setFiltroMotivos] = useState<string[]>([]);
    const [filtroDimensiones, setFiltroDimensiones] = useState<string[]>([]);
    const [filtroActividades, setFiltroActividades] = useState<string[]>([]);
    // Vista de pantalla completa (URL ?view=completa) y selector de columnas
    const vistaCompleta = searchParams.get('view') === 'completa';
    const [showColumnasModal, setShowColumnasModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showPrepararModal, setShowPrepararModal] = useState(false);
    const [showGuiaModal, setShowGuiaModal] = useState(false);
    const [modalResumenGuardado, setModalResumenGuardado] = useState<{ total: number; nuevos: number; reutilizados: number } | null>(null);
    const [filtroRecursosPMEModal, setFiltroRecursosPMEModal] = useState('');
    const [columnasVisibles, setColumnasVisibles] = useState<Record<string, boolean>>(COLUMNAS_VISIBLES_DEFAULT);
    const [ordenColumnas, setOrdenColumnas] = useState<string[]>(COLUMNAS_TABLA.map(c => c.key));
    // Muestra Descripción, Justificación y Actividad PME completas en vez de
    // recortadas a una o dos líneas. Se guarda como preferencia porque quien revisa
    // el presupuesto suele quererlo siempre en el mismo modo.
    const [textoCompleto, setTextoCompleto] = useState(false);

    const alternarTextoCompleto = () => {
        setTextoCompleto(prev => {
            const siguiente = !prev;
            try {
                localStorage.setItem(CLAVE_TEXTO_COMPLETO, siguiente ? '1' : '0');
            } catch (e) {
                console.error('Error guardando preferencia de texto completo:', e);
            }
            return siguiente;
        });
    };

    // Al ampliar se contrae el menú de la app para darle todo el ancho a la tabla, y
    // al encoger se vuelve a desplegar. Va por efecto sobre `vistaCompleta` en vez de
    // en el onClick de los botones para que también aplique al entrar directo por URL
    // con ?view=completa y al salir con el botón "Volver a gestión de recursos".
    useEffect(() => {
        setSidebarAppColapsado(vistaCompleta);
    }, [vistaCompleta, setSidebarAppColapsado]);

    // Cargar preferencia de columnas y su ORDEN desde localStorage al montar
    useEffect(() => {
        try {
            // Independiente de la versión de columnas: es otra preferencia.
            setTextoCompleto(localStorage.getItem(CLAVE_TEXTO_COMPLETO) === '1');

            if (localStorage.getItem(CLAVE_COLUMNAS_VERSION) !== COLUMNAS_DEFAULT_VERSION) {
                // Defaults nuevos: se descartan visibilidad y orden previos una única vez.
                localStorage.removeItem(CLAVE_COLUMNAS);
                localStorage.removeItem(CLAVE_ORDEN_COLUMNAS);
                localStorage.setItem(CLAVE_COLUMNAS_VERSION, COLUMNAS_DEFAULT_VERSION);
                return;
            }

            const savedCols = localStorage.getItem(CLAVE_COLUMNAS);
            if (savedCols) {
                const parsed = JSON.parse(savedCols);
                setColumnasVisibles(prev => ({ ...prev, ...parsed, insumo: true }));
            }

            const savedOrden = localStorage.getItem(CLAVE_ORDEN_COLUMNAS);
            if (savedOrden) {
                const parsedOrden: string[] = JSON.parse(savedOrden);
                // Asegurar que contenga todas las claves válidas conocidas
                const clavesValidas = COLUMNAS_TABLA.map(c => c.key);
                const ordenFiltrado = parsedOrden.filter(k => clavesValidas.includes(k));
                clavesValidas.forEach(k => {
                    if (!ordenFiltrado.includes(k)) ordenFiltrado.push(k);
                });
                setOrdenColumnas(ordenFiltrado);
            }
        } catch (e) {
            console.error('Error cargando configuración de columnas de localStorage:', e);
        }
    }, []);

    // Guardar preferencia de visibilidad en localStorage
    const toggleColumnaVisible = (key: string) => {
        setColumnasVisibles(prev => {
            const updated = { ...prev, [key]: !prev[key] };
            try {
                localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify(updated));
            } catch (e) {
                console.error('Error guardando columnas en localStorage:', e);
            }
            return updated;
        });
    };

    // Mover columna hacia arriba / abajo y persistir en localStorage
    const moverColumna = (index: number, direccion: 'subir' | 'bajar') => {
        if (direccion === 'subir' && index <= 0) return;
        if (direccion === 'bajar' && index >= ordenColumnas.length - 1) return;

        const nuevoOrden = [...ordenColumnas];
        const targetIdx = direccion === 'subir' ? index - 1 : index + 1;
        const temp = nuevoOrden[index];
        nuevoOrden[index] = nuevoOrden[targetIdx];
        nuevoOrden[targetIdx] = temp;

        setOrdenColumnas(nuevoOrden);
        try {
            localStorage.setItem(CLAVE_ORDEN_COLUMNAS, JSON.stringify(nuevoOrden));
        } catch (e) {
            console.error('Error guardando orden de columnas en localStorage:', e);
        }
    };

    // Flujo "Otros": el usuario solo elige la CATEGORÍA del recurso (con búsqueda);
    // el código contable se asigna automáticamente y queda oculto para el usuario.
    const [catOtros, setCatOtros] = useState<number | null>(null);
    const [subcatsOtros, setSubcatsOtros] = useState<{ id_subcat_recurso: number; nombre: string; codigo_cuenta: string }[]>([]);
    const [loadingSubcatsOtros, setLoadingSubcatsOtros] = useState(false);
    const [toastAgregadoContinuo, setToastAgregadoContinuo] = useState<string | null>(null);
    const [catOtrosSearch, setCatOtrosSearch] = useState('');
    const [catOtrosOpen, setCatOtrosOpen] = useState(false);

    // Flujo "Nuevo Insumo" (producto que no existe en el catálogo):
    // fase 0 previa con grupo + categoría + detección de similares.
    // Al guardar se crea como recurso PENDIENTE_APROBACION (Recursos Sugeridos).
    const [esNuevoProducto, setEsNuevoProducto] = useState(false);
    const [grupos, setGrupos] = useState<{ id_grupo_recurso: number; nombre: string }[]>([]);
    const [grupoSeleccionado, setGrupoSeleccionado] = useState<number | null>(null);
    const [categoriaSeleccionadaNuevo, setCategoriaSeleccionadaNuevo] = useState<number | null>(null);
    const [catNuevoSearch, setCatNuevoSearch] = useState('');
    const [catNuevoOpen, setCatNuevoOpen] = useState(false);
    const [similaresEncontrados, setSimilaresEncontrados] = useState<RecursoOption[]>([]);
    const [buscandoSimilares, setBuscandoSimilares] = useState(false);

    const [formularioRecurso, setFormularioRecurso] = useState({
        nombre_producto: '',
        descripcion: '',
        id_recurso: null as number | null,
        codigo_cuenta: null as string | null,
        recurso_seleccionado: null as RecursoOption | null,
        id_pre_detalle: null as number | null,
        formato_unidad: 'unidad',
        cantidad: 1,
        valor_unitario_iva: 0,
        total_iva: 0,
        tipo_fecha: 'mensual',
        fecha_ejecucion: '',
        fecha_termino: '',
        mes_ejecucion: '01',
        motivo: '',
        id_actividad: null as number | null,
        actividad_seleccionada: null as ActividadBuscar | null,
        destino_gasto: '',
        id_subvencion: null as number | null,
        dimension_pme: null as string | null,
        id_subarea: null as number | null
    });

    // Detector de similitud para advertir errores de tipeo (ej: Kermes vs Kermez)
    const motivoSimilar = useMemo(() => {
        const actual = (formularioRecurso.motivo || '').trim().toLowerCase();
        if (!actual || actual.length < 3) return null;
        return motivosSugeridos.find(({ motivo }) => {
            const mLower = motivo.toLowerCase();
            if (mLower === actual) return false;
            // Coincidencia parcial o similar
            return mLower.includes(actual) || actual.includes(mLower);
        }) || null;
    }, [formularioRecurso.motivo, motivosSugeridos]);

    // Estados y refs para Autocompletado de Nombre de Insumo y Motivo
    const [nombreInsumoFocused, setNombreInsumoFocused] = useState(false);
    const [nombreInsumoFocused2, setNombreInsumoFocused2] = useState(false);
    const [motivoFocused, setMotivoFocused] = useState(false);
    const [motivoFocused2, setMotivoFocused2] = useState(false);
    const insumoDropdownRef = useRef<HTMLDivElement>(null);
    const insumoDropdownRef2 = useRef<HTMLDivElement>(null);
    const motivoDropdownRef = useRef<HTMLDivElement>(null);
    const motivoDropdownRef2 = useRef<HTMLDivElement>(null);

    // Cerrar dropdowns de autocompletado al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (insumoDropdownRef.current && !insumoDropdownRef.current.contains(event.target as Node)) {
                setNombreInsumoFocused(false);
            }
            if (insumoDropdownRef2.current && !insumoDropdownRef2.current.contains(event.target as Node)) {
                setNombreInsumoFocused2(false);
            }
            if (motivoDropdownRef.current && !motivoDropdownRef.current.contains(event.target as Node)) {
                setMotivoFocused(false);
            }
            if (motivoDropdownRef2.current && !motivoDropdownRef2.current.contains(event.target as Node)) {
                setMotivoFocused2(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Coincidencias locales de insumos basadas en recursosActual e historialRecursos
    const insumosSugeridosLocal = useMemo(() => {
        const q = (formularioRecurso.nombre_producto || '').trim().toLowerCase();
        if (q.length < 2) return [];
        const setNombres = new Set<string>();
        const resultados: { nombre: string; origen: string; detalle?: string; id_recurso?: number | null; formato?: string }[] = [];

        recursosActual.forEach(r => {
            const nom = (r.nombre_producto || '').trim();
            if (nom && nom.toLowerCase().includes(q) && !setNombres.has(nom.toLowerCase())) {
                setNombres.add(nom.toLowerCase());
                resultados.push({ nombre: nom, origen: 'Solicitud actual', detalle: r.descripcion, id_recurso: r.id_recurso, formato: r.formato_unidad });
            }
        });

        historialRecursos.forEach(h => {
            const nom = (h.nombre_producto || '').trim();
            if (nom && nom.toLowerCase().includes(q) && !setNombres.has(nom.toLowerCase())) {
                setNombres.add(nom.toLowerCase());
                resultados.push({ nombre: nom, origen: 'Historial previo', detalle: h.descripcion, id_recurso: h.id_recurso, formato: h.formato_unidad });
            }
        });

        return resultados.slice(0, 5);
    }, [formularioRecurso.nombre_producto, recursosActual, historialRecursos]);

    // Filtrado de motivos en tiempo real según lo escrito
    const motivosFiltrados = useMemo(() => {
        const q = (formularioRecurso.motivo || '').trim().toLowerCase();
        if (!q) return motivosSugeridos.slice(0, 10);
        return motivosSugeridos.filter(m => m.motivo.toLowerCase().includes(q));
    }, [formularioRecurso.motivo, motivosSugeridos]);

    const [showSugerirModal, setShowSugerirModal] = useState(false);
    const [sugerirForm, setSugerirForm] = useState({
        nombre: '',
        descripcion_solicitud: '',
        tipo: 'BIEN',
        id_cat_recurso: 1
    });

    // Actividades PME ya asociadas al insumo elegido (historial de solicitudes del
    // colegio + `lista_recursos` del Plan PME). Alimenta la tarjeta de selección
    // rápida del paso 3 y se resuelve en el backend, no desde el historial local
    // (que solo cubre las solicitudes propias con ítems ya aprobados).
    const [actividadesSugeridasRecurso, setActividadesSugeridasRecurso] = useState<ActividadSugeridaRecurso[]>([]);
    const [cargandoSugeridasRecurso, setCargandoSugeridasRecurso] = useState(false);

    // Asesoría de Actividades PME con IA
    const [asesoriaPmeLoading, setAsesoriaPmeLoading] = useState(false);
    const [sugerenciasPmeIA, setSugerenciasPmeIA] = useState<{
        sugerencias: { id_actividad: number; nombre_actividad: string; subdimension?: string; match_score: number; justificacion: string }[];
        no_asociado_pme?: boolean;
        motivo?: string;
        proveedor?: string;
        modelo?: string;
    } | null>(null);

    const ejecutarAsesoriaPmeIA = async () => {
        if (!filtroDimensionPME) return;

        // Subconjunto filtrado de candidatas por colegio y dimensión (~15-20 actividades)
        const candidatas = (actividadesEncontradas || []).map((a: any) => ({
            id: a.id,
            nombre_actividad: a.nombre,
            descripcion: a.descripcion || '',
            subdimension: a.subdimension || '',
            responsable: a.responsable || ''
        }));

        if (candidatas.length === 0) {
            setSugerenciasPmeIA({
                sugerencias: [],
                no_asociado_pme: true,
                motivo: `No hay actividades registradas en la dimensión "${filtroDimensionPME}".`
            });
            return;
        }

        setAsesoriaPmeLoading(true);
        setSugerenciasPmeIA(null);
        try {
            const proveedorOverride = localStorage.getItem('ai_provider_override');
            const res = await api.post('/ai/asesorar-actividad-pme', {
                colegio_id: todasActividades[0]?.colegio_nombre || (user as any)?.colegio?.nombre || 'Colegio',
                nombre_recurso: formularioRecurso.nombre_producto,
                descripcion: (formularioRecurso.descripcion || '').substring(0, 200),
                area_solicitante: solicitud?.area_nombre || '',
                destino: formularioRecurso.destino_gasto,
                motivo_compra: (formularioRecurso.motivo || '').substring(0, 200),
                dimension_seleccionada: filtroDimensionPME,
                proveedor_override: proveedorOverride,
                actividades_candidatas: candidatas
            });
            setSugerenciasPmeIA(res.data);
            if (res.data.no_asociado_pme && (!res.data.sugerencias || res.data.sugerencias.length === 0)) {
                // Auto-marcar otros gastos
                setFormularioRecurso(prev => ({ ...prev, id_actividad: null, actividad_seleccionada: null }));
                setSearchPMEModal('NO_ASOCIADO');
                setShowPMEResults(false);
            }
        } catch (error: any) {
            console.error("Error al asesorar actividad PME:", error);
            const msg = error.response?.data?.detail || "Error al obtener asesoría de la IA. Verifica la configuración del proveedor IA.";
            alert(msg);
        } finally {
            setAsesoriaPmeLoading(false);
        }
    };

    // Mapeos de recursos y resolución automática de cuentas
    const [mapeosRecurso, setMapeosRecurso] = useState<any[]>([]);

    // Los mapeos vienen con el destino en vocabulario canónico, igual que el que
    // guarda `formularioRecurso.destino_gasto` y `pre_detalle`. Antes el selector
    // manejaba etiquetas ("Funcionarios") y estas comparaciones nunca calzaban: ni
    // se marcaban los destinos oficiales ni se resolvía la subvención del mapeo.
    const destinosDisponibles = Array.from(new Set(mapeosRecurso.map(m => m.destino_gasto)));
    const mappingsFiltrados = mapeosRecurso.filter(m => m.destino_gasto === formularioRecurso.destino_gasto);
    // Un destino es "oficial" si el insumo tiene un mapeo contable configurado para él.
    const destinoEsOficial = (d: string) => destinosDisponibles.includes(d);
    const esDestinoOtros = false;

    useEffect(() => {
        if (formularioRecurso.id_recurso) {
            api.get(`/presupuesto/recursos/${formularioRecurso.id_recurso}/mapeos`)
                .then(res => {
                    setMapeosRecurso(res.data);
                })
                .catch(() => {
                    setMapeosRecurso([]);
                });
        } else {
            setMapeosRecurso([]);
        }
    }, [formularioRecurso.id_recurso]);

    useEffect(() => {
        if (mapeosRecurso.length > 0) {
            const dests = Array.from(new Set(mapeosRecurso.map(m => m.destino_gasto)));

            // Solo sobrescribir por mapeos si destino_gasto está vacío o no seleccionado
            if (!formularioRecurso.destino_gasto) {
                const matchedMapping = mapeosRecurso.find(m => m.codigo_cuenta === formularioRecurso.codigo_cuenta);
                if (matchedMapping) {
                    setFormularioRecurso(prev => ({
                        ...prev,
                        destino_gasto: matchedMapping.destino_gasto,
                        id_subvencion: matchedMapping.id_subvencion
                    }));
                } else if (dests.length > 0) {
                    setFormularioRecurso(prev => ({ ...prev, destino_gasto: dests[0] }));
                }
            }
        }
    }, [mapeosRecurso]);

    // RESOLUCIÓN AUTOMÁTICA DE SUBVENCIÓN POR JERARQUÍA DE REGLAS (ÁREA + DESTINO)
    useEffect(() => {
        const subareaObj = todasSubareas.find(s => s.id_subarea === formularioRecurso.id_subarea);
        const subareaNom = subareaObj ? subareaObj.nombre : solicitud?.subarea_nombre;
        const areaNom = solicitud?.area_nombre || subareaObj?.area?.nombre || (user as any)?.cargo?.area?.nombre || (user as any)?.area?.nombre;

        const rolCodigo = (user as any)?.rol?.codigo || codigoRol || '';
        const esContextoPIE = Boolean(
            rolCodigo === 'PIE' ||
            (areaNom && areaNom.toUpperCase().includes('PIE')) ||
            (subareaNom && subareaNom.toUpperCase().includes('PIE')) ||
            (user as any)?.cargo?.nombre?.toUpperCase().includes('PIE') ||
            (user as any)?.cargos?.some((c: any) => c.nombre?.toUpperCase().includes('PIE'))
        );

        const resSub = calcularSubvencion(
            areaNom,
            subareaNom,
            formularioRecurso.destino_gasto,
            `${formularioRecurso.nombre_producto} ${formularioRecurso.motivo}`,
            null,
            esContextoPIE ? financiarConPIE : true
        );

        if (resSub.subvencion_codigo && subvencionesActivas.length > 0) {
            const mat = subvencionesActivas.find(s => s.nombre_corto.toUpperCase() === resSub.subvencion_codigo);
            if (mat) {
                setFormularioRecurso(prev => ({ ...prev, id_subvencion: mat.id_subvencion }));
            } else {
                setFormularioRecurso(prev => ({ ...prev, id_subvencion: subvencionesActivas[0].id_subvencion }));
            }
        }
    }, [formularioRecurso.destino_gasto, formularioRecurso.id_subarea, formularioRecurso.nombre_producto, formularioRecurso.motivo, solicitud, todasSubareas, subvencionesActivas, financiarConPIE, codigoRol, user]);

    useEffect(() => {
        const resolverCodigo = async () => {
            // En el flujo "Nuevo Insumo" el código lo resuelve su propio efecto
            // (categoría + destino); este no debe interferir limpiándolo.
            if (esNuevoProducto) {
                return;
            }
            if (!formularioRecurso.id_recurso || !formularioRecurso.destino_gasto) {
                setFormularioRecurso(prev => ({ ...prev, codigo_cuenta: null }));
                setSubcatResuelta(null);
                return;
            }
            // Para destinos sin mapeo configurado (incluido "otros") el código se
            // asigna por categoría manual; no hay nada que resolver en el backend.
            if (!destinoEsOficial(formularioRecurso.destino_gasto)) {
                return;
            }
            setLoadingSubcat(true);
            try {
                const res = await api.get(`/presupuesto/recursos/${formularioRecurso.id_recurso}/resolver`, {
                    params: {
                        destino_gasto: formularioRecurso.destino_gasto,
                        id_subvencion: formularioRecurso.id_subvencion || undefined
                    }
                });
                setFormularioRecurso(prev => ({
                    ...prev,
                    codigo_cuenta: res.data.codigo_cuenta
                }));
                setSubcatResuelta({
                    codigo_cuenta: res.data.codigo_cuenta,
                    nombre: res.data.nombre_cuenta
                });
            } catch (err: any) {
                // Un 404 significa "sin mapeo para esta combinación": estado esperado,
                // no un error real. Se deja el código vacío sin ensuciar la consola.
                if (err?.response?.status !== 404) {
                    console.error("Error resolviendo código contable:", err);
                }
                setFormularioRecurso(prev => ({ ...prev, codigo_cuenta: null }));
                setSubcatResuelta(null);
            } finally {
                setLoadingSubcat(false);
            }
        };
        resolverCodigo();
    }, [formularioRecurso.id_recurso, formularioRecurso.destino_gasto, formularioRecurso.id_subvencion, mapeosRecurso, esNuevoProducto]);



    // Flujo "Nuevo Insumo": resolver el código contable a partir de la categoría
    // elegida en la fase 0 + el destino, igual que en "Otros" pero sin id_recurso.
    useEffect(() => {
        if (!esNuevoProducto || !categoriaSeleccionadaNuevo || !formularioRecurso.destino_gasto) {
            return;
        }
        api.get('/presupuesto/subcategorias', { params: { id_cat_recurso: categoriaSeleccionadaNuevo } })
            .then(res => {
                const subs: { id_subcat_recurso: number; nombre: string; codigo_cuenta: string; destino_gasto?: string }[] = res.data || [];
                // Preferir una subcategoría cuyo destino coincida; si no, la primera disponible.
                const porDestino = subs.filter(s => !s.destino_gasto || s.destino_gasto === formularioRecurso.destino_gasto);
                const elegido = porDestino[0] || subs[0];
                if (elegido) {
                    setFormularioRecurso(prev => ({ ...prev, codigo_cuenta: elegido.codigo_cuenta }));
                    setSubcatResuelta({ codigo_cuenta: elegido.codigo_cuenta, nombre: elegido.nombre });
                } else {
                    setFormularioRecurso(prev => ({ ...prev, codigo_cuenta: null }));
                    setSubcatResuelta(null);
                }
            })
            .catch(() => {
                setFormularioRecurso(prev => ({ ...prev, codigo_cuenta: null }));
                setSubcatResuelta(null);
            });
    }, [esNuevoProducto, categoriaSeleccionadaNuevo, formularioRecurso.destino_gasto]);

    // Detección de recursos similares por nombre (LIKE) para autocompletado
    useEffect(() => {
        if (formularioRecurso.id_recurso) { setSimilaresEncontrados([]); return; }
        const q = (formularioRecurso.nombre_producto || '').trim();
        if (q.length < 2) { setSimilaresEncontrados([]); setBuscandoSimilares(false); return; }
        setBuscandoSimilares(true);
        const timer = setTimeout(() => {
            api.get(`/presupuesto/recursos/buscar?q=${encodeURIComponent(q)}&page=1&limit=10`)
                .then(res => setSimilaresEncontrados(res.data || []))
                .catch(() => setSimilaresEncontrados([]))
                .finally(() => setBuscandoSimilares(false));
        }, 200);
        return () => clearTimeout(timer);
    }, [formularioRecurso.id_recurso, formularioRecurso.nombre_producto]);


    const detectarSubvencion = (nombre: string, motivo: string, destino: string): number | null => {
        const subareaObj = todasSubareas.find(s => s.id_subarea === formularioRecurso.id_subarea);
        const subareaNom = subareaObj ? subareaObj.nombre : solicitud?.subarea_nombre;
        const areaNom = solicitud?.area_nombre || subareaObj?.area?.nombre || (user as any)?.cargo?.area?.nombre || (user as any)?.area?.nombre;
        const rolCodigo = (user as any)?.rol?.codigo || codigoRol || '';

        const esContextoPIE = Boolean(
            rolCodigo === 'PIE' ||
            (areaNom && areaNom.toUpperCase().includes('PIE')) ||
            (subareaNom && subareaNom.toUpperCase().includes('PIE')) ||
            (user as any)?.cargo?.nombre?.toUpperCase().includes('PIE') ||
            (user as any)?.cargos?.some((c: any) => c.nombre?.toUpperCase().includes('PIE'))
        );

        if (esContextoPIE && financiarConPIE) {
            const pieSubv = subvencionesActivas.find(s => s.nombre_corto === 'PIE');
            if (pieSubv) return pieSubv.id_subvencion;
        }

        const text = `${nombre} ${motivo}`.toLowerCase();

        if (esContextoPIE && financiarConPIE && (text.includes('pie') || text.includes('necesidades especiales') || text.includes('nee') || text.includes('integracion') || text.includes('estimulacion') || text.includes('diferencial'))) {
            const pieSubv = subvencionesActivas.find(s => s.nombre_corto === 'PIE');
            if (pieSubv) return pieSubv.id_subvencion;
        }

        if (text.includes('retencion') || text.includes('vulnerable') || text.includes('desercion') || text.includes('prioritario')) {
            const prSubv = subvencionesActivas.find(s => s.nombre_corto === 'PRO_RETENCION');
            if (prSubv) return prSubv.id_subvencion;
        }

        if (text.includes('mantencion') || text.includes('reparacion') || text.includes('techumbre') || text.includes('gasfiteria') || text.includes('pintura')) {
            const mantSubv = subvencionesActivas.find(s => s.nombre_corto === 'MANTENIMIENTO');
            if (mantSubv) return mantSubv.id_subvencion;
        }

        if (destino === 'clases(alumno)' || destino === 'premio/beneficio') {
            const sepSubv = subvencionesActivas.find(s => s.nombre_corto === 'SEP');
            if (sepSubv) return sepSubv.id_subvencion;
        }

        if (destino === 'oficinas(administracion)') {
            const genSubv = subvencionesActivas.find(s => s.nombre_corto === 'GENERAL');
            if (genSubv) return genSubv.id_subvencion;
        }

        if (destino === 'mantencion/servicio') {
            const mantSubv = subvencionesActivas.find(s => s.nombre_corto === 'MANTENIMIENTO');
            if (mantSubv) return mantSubv.id_subvencion;
        }

        return null;
    };

    useEffect(() => {
        if (!formularioRecurso.id_subvencion || esNuevoProducto) {
            const autoSubvId = detectarSubvencion(
                formularioRecurso.nombre_producto,
                formularioRecurso.motivo,
                formularioRecurso.destino_gasto
            );
            if (autoSubvId && autoSubvId !== formularioRecurso.id_subvencion) {
                setFormularioRecurso(prev => ({ ...prev, id_subvencion: autoSubvId }));
            }
        }
    }, [formularioRecurso.nombre_producto, formularioRecurso.motivo, formularioRecurso.destino_gasto, subvencionesActivas]);

    useEffect(() => {
        if (showRecursoModal && faseActual === 1 && !esNuevoProducto) {
            const timer = setTimeout(() => {
                detalleInsumoRef.current?.focus();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [showRecursoModal, faseActual, esNuevoProducto]);

    useEffect(() => {
        if (showRecursoModal && faseActual === 2) {
            const dimExcel = (formularioRecurso as any).dimension_pme || (formularioRecurso.actividad_seleccionada?.dimension);
            if (dimExcel && typeof dimExcel === 'string') {
                const dimNorm = dimExcel.trim().toLowerCase();
                if (dimNorm.includes('pedag') || dimNorm.includes('pedagogica')) {
                    setFiltroDimensionPME('Gestión Pedagógica');
                } else if (dimNorm.includes('conviv') || dimNorm.includes('convivencia')) {
                    setFiltroDimensionPME('Convivencia Escolar');
                } else if (dimNorm.includes('lider') || dimNorm.includes('liderazgo')) {
                    setFiltroDimensionPME('Liderazgo');
                } else if (dimNorm.includes('recurs') || dimNorm.includes('recursos')) {
                    setFiltroDimensionPME('Gestión de Recursos');
                }
            }
        }
    }, [showRecursoModal, faseActual, (formularioRecurso as any).dimension_pme, formularioRecurso.actividad_seleccionada]);

    useEffect(() => {
        api.get('/catalogos/config/acceso_boton_plantilla_excel')
            .then(res => {
                if (['oculto', 'solo_admin', 'todos'].includes(res.data?.valor)) {
                    setAccesoPlantillaExcel(res.data.valor);
                }
            })
            .catch(() => { });

        api.get('/catalogos/config/acceso_importar_excel')
            .then(res => {
                if (['oculto', 'solo_admin', 'todos'].includes(res.data?.valor)) {
                    setAccesoImportarExcel(res.data.valor);
                }
            })
            .catch(() => { });

        api.get('/catalogos/config/acceso_boton_preparar_ppto')
            .then(res => {
                if (['oculto', 'solo_admin', 'todos'].includes(res.data?.valor)) {
                    setAccesoBotonPreparar(res.data.valor);
                }
            })
            .catch(() => { });

        if (solicitudId) {
            cargarDatos();
        }
        api.get('/ai/pme/dimensiones-info')
            .then(res => setDimensionesInfoBD(res.data))
            .catch(() => { });
    }, [solicitudId]);

    // Persistir los borradores (recursos sin confirmar) en localStorage para no
    // perderlos al recargar. Solo después de la hidratación inicial.
    useEffect(() => {
        if (!hidratadoRef.current || !borradorKey) return;
        const borradores = recursosActual.filter(r => !r.id_pre_detalle);
        if (borradores.length > 0) {
            localStorage.setItem(borradorKey, JSON.stringify(borradores));
        } else {
            localStorage.removeItem(borradorKey);
        }
    }, [recursosActual, borradorKey]);

    const cargarDatos = async () => {
        try {
            setLoading(true);
            const [
                solRes,
                catRes,
                actRes,
                subvRes,
                gruposRes,
                subareasRes,
                configPlantillaRes,
                configAccesoRes,
                configBotonIaRes,
                configBotonPrepRes
            ] = await Promise.all([
                api.get(`/presupuesto/solicitudes/${solicitudId}`),
                api.get('/presupuesto/categoria-recurso'),
                api.get(`/presupuesto/actividades/buscar?q=&id_presupuesto=${solicitudId}`),
                api.get('/presupuesto/subvenciones/activas'),
                api.get('/presupuesto/grupos-recurso'),
                api.get('/catalogos/cargos'),
                api.get('/catalogos/config/acceso_boton_plantilla_excel').catch(() => ({ data: { valor: 'todos' } })),
                api.get('/catalogos/config/acceso_importar_excel').catch(() => ({ data: { valor: 'solo_admin' } })),
                api.get('/catalogos/config/acceso_boton_asesoria_pme_ia').catch(() => ({ data: { valor: 'oculto' } })),
                api.get('/catalogos/config/acceso_boton_preparar_ppto').catch(() => ({ data: { valor: 'oculto' } }))
            ]);

            if (['oculto', 'solo_admin', 'todos'].includes(configPlantillaRes.data?.valor)) {
                setAccesoPlantillaExcel(configPlantillaRes.data.valor);
            }
            if (['oculto', 'solo_admin', 'todos'].includes(configAccesoRes.data?.valor)) {
                setAccesoImportarExcel(configAccesoRes.data.valor);
            }
            if (['oculto', 'solo_admin', 'todos'].includes(configBotonIaRes.data?.valor)) {
                setAccesoBotonIA(configBotonIaRes.data.valor);
            }
            if (['oculto', 'solo_admin', 'todos'].includes(configBotonPrepRes.data?.valor)) {
                setAccesoBotonPreparar(configBotonPrepRes.data.valor);
            }

            setSolicitud({
                id_presupuesto: solRes.data.id_presupuesto,
                id_subarea: solRes.data.id_subarea,
                codigo: solRes.data.codigo,
                area_nombre: solRes.data.area_nombre || '',
                subarea_nombre: solRes.data.subarea_nombre || '',
                estado: solRes.data.estado,
                comentario: solRes.data.comentario,
                presupuesto_anual_nombre: solRes.data.presupuesto_anual_nombre,
                presupuesto_anual_year: solRes.data.presupuesto_anual_year,
                colegio_nombre: solRes.data.colegio_nombre || ''
            });

            setCategorias(catRes.data);
            setSubvencionesActivas(subvRes.data || []);
            setGrupos(gruposRes.data || []);
            setTodasSubareas(subareasRes.data || []);

            // Cargar recursos iniciales para el buscador
            buscarRecursos("");

            const normalizarAct = (a: any) => ({
                id: a.id || a.id_actividad,
                nombre: a.nombre || a.nombre_actividad || '',
                lista_recursos: a.lista_recursos || null,
                dimension: a.dimension || '',
                ano_pme: a.ano_pme,
                colegio_nombre: a.colegio_nombre
            });

            const actNormalizadas = (actRes.data || []).map(normalizarAct);
            setActividadesEncontradas(actNormalizadas);
            setTodasActividades(actNormalizadas);

            const detalles = solRes.data.detalles || [];

            // Restaurar borradores (recursos sin confirmar) guardados en localStorage.
            let borradores: DetallePresupuestoForm[] = [];
            if (borradorKey) {
                try {
                    const guardado = JSON.parse(localStorage.getItem(borradorKey) || '[]');
                    borradores = (Array.isArray(guardado) ? guardado : []).filter((d: any) => !d.id_pre_detalle);
                } catch { /* json inválido: ignorar */ }
            }

            setRecursosActual([...detalles, ...borradores]);
            setGuardados(detalles.map((_: any, i: number) => i));
            hidratadoRef.current = true;

            await cargarHistorial();
        } catch (error) {
            console.error('Error cargando datos:', error);
            alert('Error al cargar la solicitud');
            router.push('/presupuesto/mis-solicitudes');
        } finally {
            setLoading(false);
        }
    };

    const cargarHistorial = async () => {
        try {
            const res = await api.get(`/presupuesto/solicitudes/mis?limit=30`);
            const todas = res.data;
            const hist: RecursoHistorial[] = [];
            for (const sol of todas) {
                for (const det of sol.detalles || []) {
                    if (det.estado_aprobacion === 'Aprobado') {
                        hist.push({
                            id_pre_detalle: det.id_pre_detalle || Math.random(),
                            id_presupuesto: sol.id_presupuesto,
                            codigo_solicitud: sol.codigo,
                            nombre_producto: det.nombre_producto,
                            descripcion: det.descripcion,
                            formato_unidad: det.formato_unidad,
                            cantidad: det.cantidad,
                            valor_unitario_iva: det.valor_unitario_iva,
                            total_iva: det.total_iva,
                            fecha_ejecucion: det.fecha_ejecucion,
                            fecha_termino: det.fecha_termino,
                            tipo_fecha: det.tipo_fecha,
                            motivo: det.motivo,
                            estado_aprobacion: det.estado_aprobacion,
                            id_recurso: det.id_recurso || null,
                            id_actividad: det.id_actividad || null,
                            actividad_nombre: det.actividad?.nombre || det.actividad_nombre || null,
                            destino_gasto: det.destino_gasto || null,
                            id_subvencion: det.id_subvencion || null,
                            codigo_cuenta: det.codigo_cuenta || null,
                            id_cargo: det.id_cargo || null,
                            id_subarea: det.id_subarea || null,
                            dimension_pme: det.dimension_pme || det.actividad?.dimension || (det.id_actividad ? todasActividades.find(a => a.id === det.id_actividad)?.dimension : null) || null
                        });
                    }
                }
            }
            setHistorialRecursos(hist);

            // Auto-asignar destino_gasto y dimension_pme a insumos copiados del historial que quedaron sin ellos
            setRecursosActual(prev => {
                let huboCambios = false;
                const actualizados = prev.map(item => {
                    let itemModificado = { ...item };
                    let modificado = false;

                    const destinoActual = (item as any).destino_gasto;
                    if (!destinoActual || destinoActual.trim() === '') {
                        const match = hist.find(h =>
                            h.destino_gasto && (
                                (h.id_recurso && item.id_recurso && h.id_recurso === item.id_recurso) ||
                                (h.nombre_producto.trim().toLowerCase() === item.nombre_producto.trim().toLowerCase() &&
                                 (!item.motivo || h.motivo.trim().toLowerCase() === item.motivo.trim().toLowerCase()))
                            )
                        ) || hist.find(h => h.destino_gasto && h.nombre_producto.trim().toLowerCase() === item.nombre_producto.trim().toLowerCase());

                        if (match && match.destino_gasto) {
                            itemModificado.destino_gasto = match.destino_gasto;
                            itemModificado.id_subvencion = item.id_subvencion || match.id_subvencion || undefined;
                            itemModificado.codigo_cuenta = item.codigo_cuenta || match.codigo_cuenta || undefined;
                            itemModificado.id_subarea = item.id_subarea || match.id_subarea || undefined;
                            modificado = true;
                        }
                    }

                    const dimActual = (item as any).dimension_pme;
                    if (!dimActual || dimActual.trim() === '') {
                        const actMatch = todasActividades.find(a => a.id === item.id_actividad)
                            || ((item as any).actividad_nombre ? todasActividades.find(a => a.nombre.trim().toLowerCase() === (item as any).actividad_nombre.trim().toLowerCase()) : null);
                        if (actMatch?.dimension) {
                            itemModificado.dimension_pme = actMatch.dimension;
                            itemModificado.actividad_seleccionada = item.actividad_seleccionada || actMatch;
                            modificado = true;
                        }
                    }

                    if (modificado) {
                        huboCambios = true;
                        return itemModificado;
                    }
                    return item;
                });
                return huboCambios ? actualizados : prev;
            });
        } catch (error) {
            console.error('Error cargando historial:', error);
        }
    };

    const copiarDelHistorial = () => {
        if (selectedHistorial.length === 0) return;
        const elegidos = historialRecursos.filter(h => selectedHistorial.includes(h.id_pre_detalle));
        if (elegidos.length === 0) return;

        const codigos = Array.from(new Set(elegidos.map(h => h.codigo_solicitud).filter(Boolean)));
        const codigoLabel = codigos.length === 1 ? codigos[0] : `${codigos.length} solicitudes`;

        const nuevos: DetallePresupuestoForm[] = elegidos.map(h => {
            const actEncontrada = todasActividades.find(a => a.id === h.id_actividad)
                || (h.actividad_nombre ? todasActividades.find(a => a.nombre.trim().toLowerCase() === h.actividad_nombre!.trim().toLowerCase()) : null);
            const dim = h.dimension_pme || actEncontrada?.dimension || undefined;

            return {
                nombre_producto: h.nombre_producto,
                descripcion: h.descripcion || '',
                id_recurso: h.id_recurso || undefined,
                id_actividad: actEncontrada ? actEncontrada.id : (h.id_actividad || undefined),
                actividad_nombre: actEncontrada ? actEncontrada.nombre : (h.actividad_nombre || undefined),
                actividad_seleccionada: actEncontrada || undefined,
                dimension_pme: dim,
                formato_unidad: h.formato_unidad || 'unidad',
                cantidad: 0,
                valor_unitario_iva: h.valor_unitario_iva || 0,
                total_iva: 0,
                tipo_fecha: 'mensual',
                fecha_ejecucion: '',
                fecha_termino: '',
                motivo: h.motivo || '',
                destino_gasto: h.destino_gasto || undefined,
                id_subvencion: h.id_subvencion || undefined,
                codigo_cuenta: h.codigo_cuenta || undefined,
                id_subarea: h.id_subarea || undefined,
            };
        });

        setModalRevisarCopiado({
            codigo: codigoLabel,
            count: nuevos.length,
            nuevos
        });
        setSelectedHistorial([]);
    };

    const copiarTodaLaSolicitud = (codigoSolicitud: string) => {
        const elegidos = historialRecursos.filter(h => h.codigo_solicitud === codigoSolicitud);
        if (elegidos.length === 0) return;

        const nuevos: DetallePresupuestoForm[] = elegidos.map(h => {
            const actEncontrada = todasActividades.find(a => a.id === h.id_actividad)
                || (h.actividad_nombre ? todasActividades.find(a => a.nombre.trim().toLowerCase() === h.actividad_nombre!.trim().toLowerCase()) : null);
            const dim = h.dimension_pme || actEncontrada?.dimension || undefined;

            return {
                nombre_producto: h.nombre_producto,
                descripcion: h.descripcion || '',
                id_recurso: h.id_recurso || undefined,
                id_actividad: actEncontrada ? actEncontrada.id : (h.id_actividad || undefined),
                actividad_nombre: actEncontrada ? actEncontrada.nombre : (h.actividad_nombre || undefined),
                actividad_seleccionada: actEncontrada || undefined,
                dimension_pme: dim,
                formato_unidad: h.formato_unidad || 'unidad',
                cantidad: 0,
                valor_unitario_iva: h.valor_unitario_iva || 0,
                total_iva: 0,
                tipo_fecha: 'mensual',
                fecha_ejecucion: '',
                fecha_termino: '',
                motivo: h.motivo || '',
                destino_gasto: h.destino_gasto || undefined,
                id_subvencion: h.id_subvencion || undefined,
                codigo_cuenta: h.codigo_cuenta || undefined,
                id_subarea: h.id_subarea || undefined,
            };
        });

        setModalRevisarCopiado({
            codigo: codigoSolicitud,
            count: nuevos.length,
            nuevos
        });
    };

    const confirmarAgregarInsumosCopiados = () => {
        if (!modalRevisarCopiado) return;
        setRecursosActual(prev => [...prev, ...modalRevisarCopiado.nuevos]);
        setModalRevisarCopiado(null);
    };

    // Resolver y vincular automáticamente la dimensión PME cuando se cargan las actividades
    useEffect(() => {
        if (todasActividades.length === 0 || recursosActual.length === 0) return;
        setRecursosActual(prev => {
            let huboCambios = false;
            const actualizados = prev.map(item => {
                if (!item.dimension_pme && (item.id_actividad || (item as any).actividad_nombre)) {
                    const match = todasActividades.find(a => a.id === item.id_actividad)
                        || ((item as any).actividad_nombre ? todasActividades.find(a => a.nombre.trim().toLowerCase() === (item as any).actividad_nombre.trim().toLowerCase()) : null);
                    if (match?.dimension) {
                        huboCambios = true;
                        return {
                            ...item,
                            dimension_pme: match.dimension,
                            actividad_seleccionada: item.actividad_seleccionada || match,
                        };
                    }
                }
                return item;
            });
            return huboCambios ? actualizados : prev;
        });
    }, [todasActividades]);

    const eliminarSolicitudHistorial = async (codigoSolicitud: string) => {
        const elegidos = historialRecursos.filter(h => h.codigo_solicitud === codigoSolicitud);
        if (elegidos.length === 0) return;
        const idPresupuesto = elegidos[0].id_presupuesto;

        if (!confirm(`¿Está seguro de eliminar la solicitud ${codigoSolicitud} y TODOS sus ${elegidos.length} insumos asociados del historial?`)) return;

        try {
            await api.delete(`/presupuesto/solicitudes/${idPresupuesto}`);
            setHistorialRecursos(prev => prev.filter(h => h.id_presupuesto !== idPresupuesto));
            if (filtroSolicitudHistorial === codigoSolicitud) {
                setFiltroSolicitudHistorial('');
            }
            alert(`Solicitud ${codigoSolicitud} eliminada con éxito.`);
        } catch (error: any) {
            console.error('Error al eliminar la solicitud del historial:', error);
            alert(error.response?.data?.detail || 'Error al eliminar la solicitud');
        }
    };

    const buscarRecursos = useCallback(async (query: string, page: number = 1) => {
        try {
            // Si la búsqueda es corta, mostramos los recursos más comunes o los primeros
            const endpoint = query.length >= 2
                ? `/presupuesto/recursos/buscar?q=${encodeURIComponent(query)}&page=${page}&limit=30`
                : `/presupuesto/recursos?page=${page}&limit=30`; // Cargar lista base si está vacío

            const res = await api.get(endpoint);
            setRecursosEncontrados(res.data);
            setPaginaRecursos(page);
        } catch (error) {
            console.error('Error buscando recursos:', error);
        }
    }, []);

    const buscarActividades = useCallback((query: string, dimension: string) => {
        let res = todasActividades;
        if (dimension) {
            res = res.filter(a => (a.dimension || '').toUpperCase() === dimension.toUpperCase());
        }
        if (query.trim().length > 0) {
            const q = query.toLowerCase().trim();
            res = res.filter(a => a.nombre.toLowerCase().includes(q));
        }
        setActividadesEncontradas(res);
    }, [todasActividades]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (activeTab === 'buscador') {
                setPaginaRecursos(1);
                buscarRecursos(searchRecurso, 1);
            }
            if (activeTab === 'pme') {
                buscarActividades(searchActividad, filtroDimensionPME);
            } else {
                buscarActividades(searchPMEModal, filtroDimensionPME);
            }
        }, 200);
        return () => clearTimeout(timer);
    }, [searchRecurso, searchActividad, searchPMEModal, filtroDimensionPME, activeTab, buscarRecursos, buscarActividades]);

    // Actividades PME asociadas al insumo del formulario. Se consulta al abrir el
    // modal y cada vez que cambia el recurso/nombre, para que el paso 3 muestre las
    // vinculaciones previas sin depender de la lista local de historial.
    useEffect(() => {
        if (!showRecursoModal) {
            setActividadesSugeridasRecurso([]);
            return;
        }
        const idRec = formularioRecurso.id_recurso;
        const nom = (formularioRecurso.nombre_producto || '').trim();
        if (!idRec && nom.length < 2) {
            setActividadesSugeridasRecurso([]);
            return;
        }
        let vigente = true;
        const timer = setTimeout(async () => {
            setCargandoSugeridasRecurso(true);
            try {
                const params = new URLSearchParams();
                if (idRec) params.set('id_recurso', String(idRec));
                if (nom) params.set('nombre', nom);
                if (solicitudId) params.set('id_presupuesto', String(solicitudId));
                const res = await api.get(`/presupuesto/actividades/sugeridas-por-recurso?${params.toString()}`);
                if (vigente) setActividadesSugeridasRecurso(res.data || []);
            } catch (error) {
                console.error('Error cargando actividades PME asociadas al insumo:', error);
                if (vigente) setActividadesSugeridasRecurso([]);
            } finally {
                if (vigente) setCargandoSugeridasRecurso(false);
            }
        }, 250);
        return () => { vigente = false; clearTimeout(timer); };
    }, [showRecursoModal, formularioRecurso.id_recurso, formularioRecurso.nombre_producto]);

    // Aplica una actividad sugerida al formulario. No depende de que la actividad
    // esté en `todasActividades`: si no está (p.ej. viene de un PME anterior) se
    // construye el objeto con los datos que devolvió el backend.
    const usarActividadSugerida = (item: ActividadSugeridaRecurso) => {
        const enLista = todasActividades.find(a => a.id === item.id_actividad);
        const actividad: ActividadBuscar = enLista || {
            id: item.id_actividad,
            nombre: item.nombre_actividad,
            dimension: item.dimension || ''
        };
        if (actividad.dimension) setFiltroDimensionPME(actividad.dimension);
        setFormularioRecurso(prev => ({
            ...prev,
            id_actividad: actividad.id,
            actividad_seleccionada: actividad
        }));
        setSearchPMEModal(actividad.nombre);
        setShowPMEResults(false);
    };

    // Sugerencias que ve el paso 3: primero los insumos de ESTA solicitud (se
    // resuelven en el cliente, así funcionan también con los borradores sin guardar
    // y con insumos escritos a mano o recursos nuevos que todavía no existen en
    // pre_recurso), luego lo que devolvió el backend (historial del colegio + Plan
    // PME). Sin duplicar actividades.
    const nombreInsumoNormalizado = (formularioRecurso.nombre_producto || '').trim().toLowerCase();
    const sugerenciasActividadCombinadas: ActividadSugeridaRecurso[] = (() => {
        const porActividad = new Map<number, ActividadSugeridaRecurso>();

        recursosActual.forEach((det, idx) => {
            if (isEditando && editIndex === idx) return;           // el insumo que se está editando
            if (!det.id_actividad) return;
            const mismoNombre = !!nombreInsumoNormalizado
                && (det.nombre_producto || '').trim().toLowerCase() === nombreInsumoNormalizado;
            const mismoRecurso = !!formularioRecurso.id_recurso && det.id_recurso === formularioRecurso.id_recurso;
            if (!mismoNombre && !mismoRecurso) return;

            const act = todasActividades.find(a => a.id === det.id_actividad);
            if (!act) return;   // sin nombre de actividad no hay nada que mostrar

            const previo = porActividad.get(act.id);
            if (previo) {
                previo.veces_usado += 1;
                if (det.motivo) previo.ultimo_motivo = det.motivo;
                return;
            }
            porActividad.set(act.id, {
                id_actividad: act.id,
                nombre_actividad: act.nombre,
                dimension: act.dimension || '',
                origen: 'solicitud_actual',
                veces_usado: 1,
                ultimo_motivo: det.motivo || null,
                en_pme_actual: true,
                en_plan_pme: false
            });
        });

        actividadesSugeridasRecurso.forEach(s => {
            if (!porActividad.has(s.id_actividad)) porActividad.set(s.id_actividad, s);
        });

        return Array.from(porActividad.values());
    })();

    // Cargo solicitante de una fila del presupuesto. Cada detalle guarda su propio
    // `id_subarea` — el de quien pidió el insumo (convocatoria, importación o alta
    // manual) — así que se resuelve contra el catálogo completo de cargos y no solo
    // contra las del usuario en sesión: de lo contrario un insumo pedido por otra
    // cargo caía al nombre de la cargo de la solicitud (p. ej. todo "Asistente").
    // Sin `id_subarea` (opción "Otros") sí hereda el de la solicitud.
    const nombreSubareaDeFila = (rec: any): string | null => {
        if (rec?.subarea_nombre) return rec.subarea_nombre;            // detalle ya guardado
        if (rec?.id_subarea) {
            const encontrada = todasSubareas.find(s => s.id_subarea === rec.id_subarea);
            if (encontrada) return encontrada.nombre;
        }
        return solicitud?.subarea_nombre || null;
    };

    // Cargos ofrecibles como "solicitante": las del área de la solicitud — mismo
    // criterio que el selector del paso 1 del alta manual — más las del propio
    // usuario, para que la cargo con la que se precarga la importación siempre
    // esté entre las opciones (p. ej. un ADM de Informática importando en una
    // solicitud de Dirección).
    const subareasSolicitables: { id_subarea: number; nombre: string }[] = (() => {
        const areaNombre = solicitud?.area_nombre || (user as any)?.cargo?.area?.nombre || '';
        const porId = new Map<number, { id_subarea: number; nombre: string }>();

        todasSubareas
            .filter(s => s.area?.nombre && areaNombre
                && s.area.nombre.toLowerCase().trim() === areaNombre.toLowerCase().trim())
            .forEach(s => porId.set(s.id_subarea, s));

        const propias: { id_subarea: number; nombre: string }[] = (user as any)?.cargos?.length > 0
            ? (user as any).cargos
            : ((user as any)?.cargo ? [(user as any).cargo] : []);
        propias.forEach(s => { if (!porId.has(s.id_subarea)) porId.set(s.id_subarea, s); });

        return Array.from(porId.values());
    })();

    const seleccionarRecurso = (recurso: RecursoOption) => {
        setFormularioRecurso(prev => ({
            ...prev,
            id_recurso: recurso.id_recurso,
            codigo_cuenta: null,
            recurso_seleccionado: recurso,
            nombre_producto: recurso.nombre,
            descripcion: '',
            formato_unidad: recurso.formato || 'unidad',
            cantidad: 1,
            valor_unitario_iva: 0,
            total_iva: 0,
            tipo_fecha: 'mensual',
            fecha_ejecucion: '',
            fecha_termino: '',
            mes_ejecucion: '01',
            motivo: '',
            id_actividad: null,
            actividad_seleccionada: null,
            destino_gasto: '',
            id_subvencion: null,
            id_subarea: null  // por defecto "Otros"
        }));
        // Recurso del catálogo: flujo normal de 3 fases.
        setEsNuevoProducto(false);
        resetNuevoProducto();
        setIsEditando(false);
        setEditIndex(null);
        setFaseActual(0);
        setShowRecursoModal(true);
    };

    // Limpia los estados auxiliares del flujo "Nuevo Insumo" y sugerencias PME.
    const resetNuevoProducto = () => {
        setGrupoSeleccionado(null);
        setCategoriaSeleccionadaNuevo(null);
        setCatNuevoSearch('');
        setCatNuevoOpen(false);
        setSimilaresEncontrados([]);
        setBuscandoSimilares(false);
        setAsesoriaCategoria(null);
        setCatSugeridaIA(null);
        setGrupoSugeridoIA(null);
        setSugerenciasPmeIA(null);
        setFiltroDimensionPME('');
        setNombreDesbloqueado(false);
    };


    const abrirNuevoManual = () => {
        setFormularioRecurso({
            nombre_producto: '',
            descripcion: '',
            id_recurso: null,
            codigo_cuenta: null,
            recurso_seleccionado: null,
            id_pre_detalle: null,
            formato_unidad: 'unidad',
            cantidad: 1,
            valor_unitario_iva: 0,
            total_iva: 0,
            tipo_fecha: 'mensual',
            fecha_ejecucion: '',
            fecha_termino: '',
            mes_ejecucion: '01',
            motivo: '',
            id_actividad: null,
            actividad_seleccionada: null,
            destino_gasto: '',
            id_subvencion: null,
            dimension_pme: null,
            id_subarea: null  // por defecto "Otros"
        });
        setSearchPMEModal('');
        setSubcatResuelta(null);
        setIsEditando(false);
        setEditIndex(null);
        setFormatoEsOtros(false);
        // Producto nuevo: arranca en la fase 0 (Grupo + Categoría).
        setEsNuevoProducto(true);
        resetNuevoProducto();
        setLayoutModo('fases');
        setFaseActual(0);
        setShowRecursoModal(true);
    };

    const seleccionarActividad = (actividad: ActividadBuscar) => {
        setSelectedActividad(actividad);
        if (actividad.lista_recursos) {
            const resources = actividad.lista_recursos.split(',').map(s => s.trim()).filter(s => s);
            setRecursosActividad(resources);
        } else {
            setRecursosActividad([]);
        }
        setSelectedRecursosActividad([]);
        setShowActividadModal(true);
    };

    const agregarDesdePME = () => {
        const nuevos = selectedRecursosActividad.map(nombre => ({
            nombre_producto: nombre,
            descripcion: `Recurso sugerido por actividad: ${selectedActividad?.nombre}`,
            id_actividad: selectedActividad?.id,
            formato_unidad: 'unidad',
            cantidad: 1,
            valor_unitario_iva: 0,
            total_iva: 0,
            tipo_fecha: 'mensual',
            fecha_ejecucion: `${new Date().getFullYear()}-01-01`,
            motivo: `Añadido desde Plan de Acción: ${selectedActividad?.nombre}`
        } as DetallePresupuestoForm));

        setRecursosActual([...recursosActual, ...nuevos]);
        setShowActividadModal(false);
    };

    const copiarRecurso = (index: number) => {
        const original = recursosActual[index];
        const copia: DetallePresupuestoForm = {
            ...original,
            id_pre_detalle: undefined,
            _tempId: crypto.randomUUID(),
            _isClassifying: false
        } as DetallePresupuestoForm;
        setRecursosActual(prev => [...prev, copia]);
    };

    const abrirEditar = (index: number) => {
        const rec = recursosActual[index];

        // Restaurar la actividad completa desde el listado ya cargado
        const actividadRestaurada = rec.id_actividad
            ? todasActividades.find(a => a.id === rec.id_actividad) ?? null
            : null;

        // El formulario trabaja en vocabulario canónico; un detalle guardado con la
        // etiqueta antigua ("Funcionarios") se traduce al abrirlo.
        const destinoNormalizado = destinoCanonico((rec as any).destino_gasto);

        setFormularioRecurso({
            nombre_producto: rec.nombre_producto,
            descripcion: rec.descripcion || '',
            id_recurso: rec.id_recurso || null,
            codigo_cuenta: rec.codigo_cuenta || null,
            recurso_seleccionado: null,
            id_pre_detalle: rec.id_pre_detalle || null,
            formato_unidad: rec.formato_unidad,
            cantidad: rec.cantidad,
            valor_unitario_iva: rec.valor_unitario_iva,
            total_iva: rec.total_iva,
            tipo_fecha: rec.tipo_fecha,
            fecha_ejecucion: rec.fecha_ejecucion,
            fecha_termino: rec.fecha_termino || '',
            mes_ejecucion: rec.fecha_ejecucion?.substring(5, 7) || '01',
            motivo: rec.motivo,
            id_actividad: rec.id_actividad || null,
            actividad_seleccionada: actividadRestaurada,
            destino_gasto: destinoNormalizado,
            id_subvencion: (rec as any).id_subvencion || null,
            dimension_pme: (rec as any).dimension_pme || null,
            id_subarea: (rec as any).id_subarea ?? (user as any)?.id_subarea ?? null
        });
        // Sincronizar searchPMEModal para que la card de confirmación aparezca
        setSearchPMEModal(actividadRestaurada ? actividadRestaurada.nombre : '');
        setEditIndex(index);
        setIsEditando(true);
        // Editar un detalle existente nunca usa la fase 0 de producto nuevo.
        setEsNuevoProducto(false);
        resetNuevoProducto();
        setFaseActual(0);
        const formatosConocidos = FORMATOS_UNIDAD.map(f => f.value);
        setFormatoEsOtros(!formatosConocidos.includes(rec.formato_unidad));
        setShowRecursoModal(true);
    };

    // Devuelve la lista de campos obligatorios que faltan (vacía si está todo).
    const getCamposFaltantes = (): string[] => {
        const faltan: string[] = [];
        if (!formularioRecurso.nombre_producto.trim()) faltan.push('Nombre del Insumo');
        if (!formularioRecurso.destino_gasto) faltan.push('¿Para quién o para qué se destina este gasto?');
        if (!formularioRecurso.descripcion.trim()) faltan.push('Detalle del Insumo');
        if (!formularioRecurso.motivo.trim()) faltan.push('Justificación / Motivo de Necesidad');
        return faltan;
    };
    const agregarRecurso = () => {
        let fechaEjecucion = formularioRecurso.tipo_fecha === 'fecha_especifica'
            ? formularioRecurso.fecha_ejecucion
            : `${new Date().getFullYear()}-${formularioRecurso.mes_ejecucion}-01`;

        let fechaTermino = formularioRecurso.tipo_fecha === 'fecha_especifica'
            ? formularioRecurso.fecha_termino
            : undefined;

        const tempId = crypto.randomUUID();

        const nuevoRecurso: DetallePresupuestoForm = {
            ...formularioRecurso,
            id_recurso: formularioRecurso.id_recurso ?? undefined,
            id_actividad: formularioRecurso.id_actividad ?? undefined,
            id_pre_detalle: formularioRecurso.id_pre_detalle ?? undefined,
            codigo_cuenta: formularioRecurso.codigo_cuenta ?? undefined,
            tipo_fecha: formularioRecurso.tipo_fecha as any,
            fecha_ejecucion: fechaEjecucion,
            fecha_termino: fechaTermino,
            total_iva: formularioRecurso.cantidad * formularioRecurso.valor_unitario_iva,
            _tempId: tempId,
            ...(esNuevoProducto ? { _esNuevo: true, _idCategoria: categoriaSeleccionadaNuevo, _idGrupo: grupoSeleccionado, _isClassifying: true } : {})
        } as DetallePresupuestoForm;

        const newIndex = recursosActual.length;
        setRecursosActual(prev => [...prev, nuevoRecurso]);
        setShowRecursoModal(false);

        // Guardado directo en el servidor al confirmar el modal
        guardarRecursoIndividual(newIndex, nuevoRecurso);
    };

    const agregarRecursoYContinuar = () => {
        let fechaEjecucion = formularioRecurso.tipo_fecha === 'fecha_especifica'
            ? formularioRecurso.fecha_ejecucion
            : `${new Date().getFullYear()}-${formularioRecurso.mes_ejecucion}-01`;

        let fechaTermino = formularioRecurso.tipo_fecha === 'fecha_especifica'
            ? formularioRecurso.fecha_termino
            : undefined;

        const tempId = crypto.randomUUID();

        const nuevoRecurso: DetallePresupuestoForm = {
            ...formularioRecurso,
            id_recurso: formularioRecurso.id_recurso ?? undefined,
            id_actividad: formularioRecurso.id_actividad ?? undefined,
            id_pre_detalle: formularioRecurso.id_pre_detalle ?? undefined,
            codigo_cuenta: formularioRecurso.codigo_cuenta ?? undefined,
            tipo_fecha: formularioRecurso.tipo_fecha as any,
            fecha_ejecucion: fechaEjecucion,
            fecha_termino: fechaTermino,
            total_iva: formularioRecurso.cantidad * formularioRecurso.valor_unitario_iva,
            _tempId: tempId,
            ...(esNuevoProducto ? { _esNuevo: true, _idCategoria: categoriaSeleccionadaNuevo, _idGrupo: grupoSeleccionado, _isClassifying: true } : {})
        } as DetallePresupuestoForm;

        const newIndex = recursosActual.length;
        setRecursosActual(prev => [...prev, nuevoRecurso]);
        guardarRecursoIndividual(newIndex, nuevoRecurso);

        const motivoActual = formularioRecurso.motivo;
        const actividadActual = formularioRecurso.id_actividad;
        const actividadObj = formularioRecurso.actividad_seleccionada;
        const destinoActual = formularioRecurso.destino_gasto;
        const subvencionActual = formularioRecurso.id_subvencion;
        const subareaActual = formularioRecurso.id_subarea;
        const dimensionActual = formularioRecurso.dimension_pme;
        const tipoFechaActual = formularioRecurso.tipo_fecha;
        const mesActual = formularioRecurso.mes_ejecucion;
        const fechaEjecActual = formularioRecurso.fecha_ejecucion;
        const fechaTermActual = formularioRecurso.fecha_termino;
        const prodNombre = formularioRecurso.nombre_producto;

        const eraNuevo = esNuevoProducto;
        setToastAgregadoContinuo(`¡"${prodNombre}" guardado! Puedes ingresar el siguiente insumo con el mismo motivo.`);
        setTimeout(() => setToastAgregadoContinuo(null), 7000);

        setFormularioRecurso({
            nombre_producto: '',
            descripcion: '',
            id_recurso: null,
            codigo_cuenta: null,
            recurso_seleccionado: null,
            id_pre_detalle: null,
            formato_unidad: 'unidad',
            cantidad: 1,
            valor_unitario_iva: 0,
            total_iva: 0,
            tipo_fecha: tipoFechaActual,
            fecha_ejecucion: fechaEjecActual,
            fecha_termino: fechaTermActual,
            mes_ejecucion: mesActual,
            motivo: motivoActual,
            id_actividad: actividadActual,
            actividad_seleccionada: actividadObj,
            destino_gasto: destinoActual,
            id_subvencion: subvencionActual,
            dimension_pme: dimensionActual,
            id_subarea: subareaActual
        });

        setFaseActual(0);
        setSearchRecurso('');
        setEsNuevoProducto(eraNuevo);
        setCamposFaltantes(null);
    };

    const actualizarRecurso = () => {
        if (editIndex === null) return;
        let fechaEjecucion = formularioRecurso.tipo_fecha === 'fecha_especifica'
            ? formularioRecurso.fecha_ejecucion
            : `${new Date().getFullYear()}-${formularioRecurso.mes_ejecucion}-01`;

        let fechaTermino = formularioRecurso.tipo_fecha === 'fecha_especifica'
            ? formularioRecurso.fecha_termino
            : undefined;

        // Preservar las marcas internas del flujo "Nuevo Insumo" si el item aún
        // no está persistido (sin id_pre_detalle). Si no, al guardar se omitiría
        // la creación del recurso sugerido y el detalle quedaría sin recurso.
        const original = recursosActual[editIndex] as any;
        const marcasNuevo = (original?._esNuevo && !formularioRecurso.id_pre_detalle)
            ? { _esNuevo: true, _idCategoria: original._idCategoria, _idGrupo: original._idGrupo }
            : {};

        const actualizado: DetallePresupuestoForm = {
            ...formularioRecurso,
            id_recurso: formularioRecurso.id_recurso ?? undefined,
            id_actividad: formularioRecurso.id_actividad ?? undefined,
            id_pre_detalle: formularioRecurso.id_pre_detalle ?? undefined,
            codigo_cuenta: formularioRecurso.codigo_cuenta ?? undefined,
            tipo_fecha: formularioRecurso.tipo_fecha as any,
            fecha_ejecucion: fechaEjecucion,
            fecha_termino: fechaTermino,
            total_iva: formularioRecurso.cantidad * formularioRecurso.valor_unitario_iva,
            ...marcasNuevo
        } as DetallePresupuestoForm;

        setRecursosActual(prev => prev.map((item, i) => i === editIndex ? actualizado : item));

        // Si ya tenía ID, guardar cambios inmediatamente en el backend
        if (formularioRecurso.id_pre_detalle) {
            guardarRecursoIndividual(editIndex, actualizado);
        }

        setShowRecursoModal(false);
        setIsEditando(false);
    };

    const guardarRecursoIndividual = async (index: number, manualData?: any) => {
        const data = manualData || recursosActual[index];
        setSavingItems(prev => [...prev, index]);

        try {
            // Producto nuevo (viene de "+ Nuevo Insumo"): primero se crea el recurso
            // como SUGERIDO (PENDIENTE_APROBACION) y se obtiene su id_recurso real.
            let idRecursoFinal = data.id_recurso ?? undefined;
            if (data._esNuevo && !data.id_recurso) {
                let idCatInicial = data._idCategoria;
                let idGrpInicial = data._idGrupo;

                // Si la categoría no fue seleccionada manualmente o es fallback (null/undefined),
                // consultar a la IA sincrónicamente antes de registrar la sugerencia en la BD.
                try {
                    const proveedorOverride = localStorage.getItem('ai_provider_override');
                    const aiRes = await api.post('/ai/asesorar-categoria', {
                        nombre: data.nombre_producto,
                        descripcion: data.descripcion,
                        motivo: data.motivo,
                        destino_gasto: data.destino_gasto,
                        proveedor_override: proveedorOverride,
                    });
                    if (aiRes.data?.recomendaciones?.[0]?.id_cat_recurso) {
                        idCatInicial = aiRes.data.recomendaciones[0].id_cat_recurso;
                    }
                    if (aiRes.data?.grupo?.id_grupo_recurso) {
                        idGrpInicial = aiRes.data.grupo.id_grupo_recurso;
                    }
                } catch (aiErr) {
                    console.warn("No se pudo obtener recomendación IA previa, se usará categoría por defecto:", aiErr);
                }

                try {
                    const sugRes = await api.post('/presupuesto/recursos/sugerir', {
                        nombre: data.nombre_producto,
                        descripcion_solicitud: data.descripcion || data.nombre_producto,
                        tipo: 'BIEN',
                        id_cat_recurso: idCatInicial,
                        id_grupo_recurso: idGrpInicial ?? undefined
                    });
                    idRecursoFinal = sugRes.data.id_recurso;
                } catch (sugErr: any) {
                    // Si el backend responde 400 porque el recurso ya existe en la BD,
                    // reutilizamos el id_recurso del producto existente en vez de fallar.
                    if (sugErr?.response?.status === 400) {
                        try {
                            const busq = await api.get(`/presupuesto/recursos/buscar?q=${encodeURIComponent(data.nombre_producto)}&page=1&limit=1`);
                            if (busq.data?.[0]?.id_recurso) {
                                idRecursoFinal = busq.data[0].id_recurso;
                            }
                        } catch { /* fallback */ }
                    }
                    if (!idRecursoFinal) throw sugErr;
                }
            }

            // Construir payload limpio con los campos exactos que espera el backend
            const valor_unitario_iva = data.valor_unitario_iva ?? 0;
            const payload = {
                nombre_producto: data.nombre_producto,
                descripcion: data.descripcion ?? undefined,
                id_recurso: idRecursoFinal,
                codigo_cuenta: data.codigo_cuenta ?? undefined,
                formato_unidad: data.formato_unidad,
                cantidad: data.cantidad,
                valor_unitario: Math.round(valor_unitario_iva / 1.19),
                valor_unitario_iva,
                total_iva: data.total_iva ?? data.cantidad * valor_unitario_iva,
                fecha_ejecucion: data.fecha_ejecucion,
                fecha_termino: data.fecha_termino ?? undefined,
                tipo_fecha: data.tipo_fecha,
                motivo: data.motivo,
                id_actividad: data.id_actividad ?? undefined,
                id_subvencion: data.id_subvencion ?? undefined,
                destino_gasto: data.destino_gasto ?? '',
                id_subarea: data.id_subarea ?? undefined
            };

            if (data.id_pre_detalle) {
                // UPDATE
                await api.put(`/presupuesto/detalles/${data.id_pre_detalle}`, payload);
                setGuardados(prev => prev.includes(index) ? prev : [...prev, index]);
            } else {
                // CREATE
                const res = await api.post(`/presupuesto/solicitudes/${solicitudId}/recursos`, { detalles: [payload] });
                const nuevoConId = res.data.detalles?.[0];
                if (nuevoConId) {
                    // Actualización FUNCIONAL, obligatoria aquí: "Guardar todos
                    // pendientes" llama a esta función en un bucle con await, y con
                    // `[...recursosActual]` cada vuelta partía del array capturado en
                    // el render, deshaciendo las marcas de las vueltas anteriores. Solo
                    // la última fila quedaba como guardada, las demás seguían de
                    // borrador en localStorage y al recargar aparecían duplicadas
                    // (las persistidas del servidor + los borradores no limpiados).
                    setRecursosActual(prev => prev.map((item, i) => i === index
                        ? { ...data, id_pre_detalle: nuevoConId.id_pre_detalle, id_recurso: idRecursoFinal, _esNuevo: false, _isClassifying: false }
                        : item));
                    setGuardados(prev => [...prev, index]);
                }
            }
        } catch (error: any) {
            console.error('Error al persistir recurso:', error);
            const detalle = error?.response?.data?.detail;
            alert(detalle || 'Error al procesar el recurso individual');
            setRecursosActual(prev => prev.map((item, i) => i === index ? { ...item, _isClassifying: false } : item));
        } finally {
            setSavingItems(prev => prev.filter(i => i !== index));
        }
    };

    const actualizarCampoEnFila = (index: number, cambios: Partial<DetallePresupuestoForm>) => {
        const itemOriginal = recursosActual[index];
        if (!itemOriginal) return;

        const cantidad = cambios.cantidad !== undefined ? Math.max(1, Number(cambios.cantidad) || 1) : itemOriginal.cantidad;
        const valor_unitario_iva = cambios.valor_unitario_iva !== undefined ? Math.max(0, Number(cambios.valor_unitario_iva) || 0) : itemOriginal.valor_unitario_iva;
        const total_iva = cantidad * valor_unitario_iva;

        const itemActualizado: DetallePresupuestoForm = {
            ...itemOriginal,
            ...cambios,
            cantidad,
            valor_unitario_iva,
            total_iva
        };

        setRecursosActual(prev => prev.map((item, i) => i === index ? itemActualizado : item));
        setFilasModificadas(prev => new Set(prev).add(index));
    };

    const cambiarDestinoGasto = async (index: number, nuevoDestino: string) => {
        const itemOriginal = recursosActual[index];
        if (!itemOriginal) return;

        // Auto-calcular Subvención según la regla:
        // Alumnos / Estudiantes -> SEP
        // Funcionarios -> GENERAL
        // Premio / Beneficio -> SEP
        // Mantención / Servicio -> MANTENCION (o GENERAL si no existe código MANTENCION)
        let nuevaSubvId: number | null = (itemOriginal as any).id_subvencion || null;

        const subSEP = subvencionesActivas.find(s => s.nombre_corto.toUpperCase() === 'SEP' || (s as any).codigo?.toUpperCase() === 'SEP');
        const subGEN = subvencionesActivas.find(s => s.nombre_corto.toUpperCase() === 'GENERAL' || (s as any).codigo?.toUpperCase() === 'GENERAL');
        const subMAN = subvencionesActivas.find(s => s.nombre_corto.toUpperCase().includes('MANT') || (s as any).codigo?.toUpperCase().includes('MANT'));

        // El selector emite el valor canónico; se normaliza igual por si llega una
        // etiqueta antigua desde otro punto del código.
        const destinoCanon = destinoCanonico(nuevoDestino);

        if (destinoCanon === 'clases(alumno)' || destinoCanon === 'premio/beneficio') {
            if (subSEP) nuevaSubvId = subSEP.id_subvencion;
        } else if (destinoCanon === 'oficinas(administracion)') {
            if (subGEN) nuevaSubvId = subGEN.id_subvencion;
        } else if (destinoCanon === 'mantencion/servicio') {
            if (subMAN) nuevaSubvId = subMAN.id_subvencion;
            else if (subGEN) nuevaSubvId = subGEN.id_subvencion;
        }

        const itemActualizado = {
            ...itemOriginal,
            destino_gasto: destinoCanon,
            id_subvencion: nuevaSubvId
        };

        setRecursosActual(prev => prev.map((item, i) => i === index ? itemActualizado : item));
        setFilasModificadas(prev => new Set(prev).add(index));
    };

    const confirmarFila = async (index: number) => {
        const item = recursosActual[index];
        if (!item) return;

        try {
            await guardarRecursoIndividual(index, item);
            setFilasModificadas(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
            setFilasConfirmadasRecientes(prev => new Set(prev).add(index));
            setTimeout(() => {
                setFilasConfirmadasRecientes(prev => {
                    const next = new Set(prev);
                    next.delete(index);
                    return next;
                });
            }, 2500);
        } catch (err) {
            console.error('Error al confirmar fila:', err);
        }
    };

    const confirmarTodasFilasModificadas = async () => {
        const indices = Array.from(filasModificadas);
        for (const idx of indices) {
            const item = recursosActual[idx];
            if (item) {
                await guardarRecursoIndividual(idx, item);
            }
        }
        setFilasModificadas(new Set());
    };

    // Modal elegante para confirmación de eliminación
    const [recursoAEliminar, setRecursoAEliminar] = useState<{ tipo: 'individual'; index: number; rec: DetallePresupuestoForm } | { tipo: 'pendientes'; count: number } | null>(null);
    const [isEliminando, setIsEliminando] = useState(false);

    const solicitarEliminarRecurso = (index: number) => {
        const rec = recursosActual[index];
        if (!rec) return;
        setRecursoAEliminar({ tipo: 'individual', index, rec });
    };

    const solicitarEliminarPendientes = () => {
        const count = recursosActual.filter(r => !r.id_pre_detalle).length;
        if (count === 0) return;
        setRecursoAEliminar({ tipo: 'pendientes', count });
    };

    const confirmarEliminacion = async () => {
        if (!recursoAEliminar) return;
        setIsEliminando(true);
        try {
            if (recursoAEliminar.tipo === 'individual') {
                const { index, rec } = recursoAEliminar;
                if (rec.id_pre_detalle) {
                    await api.delete(`/presupuesto/detalles/${rec.id_pre_detalle}`);
                }
                setRecursosActual(prev => prev.filter((_, i) => i !== index));
            } else if (recursoAEliminar.tipo === 'pendientes') {
                setRecursosActual(prev => prev.filter(r => r.id_pre_detalle));
            }
            setRecursoAEliminar(null);
        } catch (error) {
            console.error('Error al eliminar:', error);
            alert('Error al eliminar. Intente nuevamente.');
        } finally {
            setIsEliminando(false);
        }
    };


    // Evita que un segundo clic (o un doble clic) reenvíe filas que ya se están
    // guardando: cada reenvío crearía un detalle duplicado en la solicitud.
    const guardandoTodosRef = useRef(false);
    const [guardandoTodos, setGuardandoTodos] = useState(false);
    const [progresoGuardado, setProgresoGuardado] = useState<string | null>(null);

    const guardarTodosPendientes = async () => {
        if (guardandoTodosRef.current) return;

        const pendientes = recursosActual
            .map((rec, index) => ({ rec, index }))
            .filter(({ rec }) => !rec.id_pre_detalle);

        if (pendientes.length === 0) return;

        guardandoTodosRef.current = true;
        setGuardandoTodos(true);
        try {
            // 1. Identificar insumos completamente nuevos que NO tienen categoría asignada y requieren categorización por IA
            const nuevosSinCategoria = pendientes.filter(({ rec }) => !rec.id_recurso && !(rec as any).id_cat_recurso && !(rec as any)._idCategoria);

            if (nuevosSinCategoria.length > 0) {
                setProgresoGuardado(`Clasificando ${nuevosSinCategoria.length} insumo(s) nuevo(s) con IA en lote…`);
                try {
                    const proveedorOverride = localStorage.getItem('ai_provider_override');

                    // Dividir en bloques de 30 para respetar LOTE_CLASIFICACION_MAX
                    const TAMANO_LOTE = 30;
                    for (let i = 0; i < nuevosSinCategoria.length; i += TAMANO_LOTE) {
                        const bloque = nuevosSinCategoria.slice(i, i + TAMANO_LOTE);
                        const insumosPayload = bloque.map(({ rec }) => ({
                            nombre: rec.nombre_producto,
                            descripcion: rec.descripcion || rec.nombre_producto,
                            motivo: rec.motivo || '',
                            destino_gasto: (rec as any).destino_gasto || ''
                        }));

                        const aiRes = await api.post('/ai/clasificar-insumos-lote', {
                            insumos: insumosPayload,
                            proveedor_override: proveedorOverride
                        });

                        const clasificaciones = aiRes.data?.clasificaciones || [];
                        bloque.forEach(({ rec, index }, bIdx) => {
                            const clasif = clasificaciones[bIdx];
                            if (clasif?.id_cat_recurso) {
                                (rec as any)._idCategoria = clasif.id_cat_recurso;
                            }
                            if (clasif?.id_grupo_recurso) {
                                (rec as any)._idGrupo = clasif.id_grupo_recurso;
                            }
                        });
                    }
                } catch (aiErr) {
                    console.warn("No se pudo clasificar insumos en lote con IA, se usará flujo por defecto:", aiErr);
                }
            }

            // 2. Resolver sugerencia de recursos nuevos mediante el endpoint masivo /recursos/sugerir-lote
            setProgresoGuardado(`Procesando insumos a registrar en catálogo…`);
            const mapaRecursosFinales: Record<number, number | undefined> = {};
            const totalmenteNuevos = pendientes.filter(({ rec }) => !rec.id_recurso);

            let totalCreadosCatalogo = 0;
            let totalReutilizadosCatalogo = 0;

            if (totalmenteNuevos.length > 0) {
                const recursosPayload = totalmenteNuevos.map(({ rec, index }) => ({
                    ref: String(index),
                    nombre: rec.nombre_producto,
                    descripcion_solicitud: rec.descripcion || rec.nombre_producto,
                    formato: rec.formato_unidad || 'Unidad',
                    id_cat_recurso: (rec as any).id_cat_recurso || (rec as any)._idCategoria || 1,
                    id_grupo_recurso: (rec as any)._idGrupo || undefined
                }));

                try {
                    const sugLoteRes = await api.post('/presupuesto/recursos/sugerir-lote', { recursos: recursosPayload });
                    const creados = sugLoteRes.data?.creados || [];
                    const reutilizados = sugLoteRes.data?.reutilizados || [];

                    totalCreadosCatalogo = creados.length;
                    totalReutilizadosCatalogo = reutilizados.length;

                    [...creados, ...reutilizados].forEach((item: any) => {
                        const idxNum = parseInt(item.ref);
                        if (!isNaN(idxNum)) {
                            mapaRecursosFinales[idxNum] = item.id_recurso;
                        }
                    });
                } catch (loteErr) {
                    console.warn("Fallo sugerir-lote, usando fallback individual:", loteErr);
                }
            }

            // Fallback o insumos existentes en catalogo
            for (const { rec, index } of pendientes) {
                if (!mapaRecursosFinales[index]) {
                    mapaRecursosFinales[index] = rec.id_recurso ?? undefined;
                }
            }

            // 3. Construir el payload masivo con TODOS los detalles en una sola peticion HTTP
            setProgresoGuardado(`Guardando los ${pendientes.length} recursos en el servidor…`);
            const detallesPayload = pendientes.map(({ rec, index }) => {
                const valor_unitario_iva = rec.valor_unitario_iva ?? 0;
                return {
                    nombre_producto: rec.nombre_producto,
                    descripcion: rec.descripcion ?? undefined,
                    id_recurso: mapaRecursosFinales[index],
                    codigo_cuenta: rec.codigo_cuenta ?? undefined,
                    formato_unidad: rec.formato_unidad,
                    cantidad: rec.cantidad,
                    valor_unitario: Math.round(valor_unitario_iva / 1.19),
                    valor_unitario_iva,
                    total_iva: rec.total_iva ?? rec.cantidad * valor_unitario_iva,
                    fecha_ejecucion: rec.fecha_ejecucion,
                    fecha_termino: rec.fecha_termino ?? undefined,
                    tipo_fecha: rec.tipo_fecha,
                    motivo: rec.motivo,
                    id_actividad: rec.id_actividad ?? undefined,
                    id_subvencion: (rec as any).id_subvencion ?? undefined,
                    destino_gasto: (rec as any).destino_gasto ?? '',
                    id_subarea: rec.id_subarea ?? undefined
                };
            });

            // UNA SOLA PETICION HTTP MASIVA
            const res = await api.post(`/presupuesto/solicitudes/${solicitudId}/recursos`, { detalles: detallesPayload });
            const nuevosDetalles: any[] = res.data.detalles || [];

            // Actualizar el estado local con los IDs reales devueltos por la BD
            setRecursosActual(prev => {
                let detIdx = 0;
                return prev.map((item) => {
                    if (!item.id_pre_detalle) {
                        const devuelto = nuevosDetalles[detIdx];
                        detIdx++;
                        if (devuelto) {
                            return {
                                ...item,
                                id_pre_detalle: devuelto.id_pre_detalle,
                                id_recurso: devuelto.id_recurso || item.id_recurso,
                                _esNuevo: false,
                                _isClassifying: false
                            } as any;
                        }
                    }
                    return item;
                });
            });

            setProgresoGuardado(null);

            // Abrir Modal UI de Resumen
            setModalResumenGuardado({
                total: pendientes.length,
                nuevos: totalCreadosCatalogo,
                reutilizados: pendientes.length - totalCreadosCatalogo
            });
        } catch (err: any) {
            console.error('Error al guardar todos los pendientes masivamente:', err);
            const detalle = err?.response?.data?.detail;
            alert(detalle || 'Error al guardar los recursos pendientes en bloque');
        } finally {
            guardandoTodosRef.current = false;
            setGuardandoTodos(false);
        }
    };

    const eliminarTodosPendientes = () => {
        solicitarEliminarPendientes();
    };

    const formatCLP = (v: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(v);

    const [paginaPptoActual, setPaginaPptoActual] = useState(1);
    const [itemsPorPaginaPpto, setItemsPorPaginaPpto] = useState<number>(25);

    // Cualquier filtro o cambio de tamaño de página debe devolver a la página 1. Los cuatro filtros avanzados de la
    // vista completa (mes, destino, dimensión, actividad) no estaban en la lista: al
    // filtrar desde una página alta, el resultado se recortaba a un tramo inexistente
    // y la tabla parecía no filtrarse o salía vacía.
    useEffect(() => {
        setPaginaPptoActual(1);
    }, [filtroPresupuesto, filtroEstadoPpto, filtroMeses, filtroDestinos, filtroMotivos, filtroDimensiones, filtroActividades, itemsPorPaginaPpto]);

    const exportarAExcel = () => {
        if (recursosActual.length === 0) return;

        const dataToExport = recursosFiltrados.map(({ rec }, i) => {
            const subareaLabel = nombreSubareaDeFila(rec) || 'General';

            return {
                'N°': i + 1,
                'Insumo / Producto': rec.nombre_producto,
                'Descripción': rec.descripcion || '',
                'Cargo Solicitante': subareaLabel,
                'Cantidad': rec.cantidad,
                'Formato Unidad': rec.formato_unidad,
                'Valor Unit. (IVA)': rec.valor_unitario_iva,
                'Total (IVA)': rec.total_iva,
                'Fecha / Período': labelFecha(rec),
                'Justificación / Motivo': rec.motivo || '',
                'Destino Gasto': etiquetaDestino((rec as any).destino_gasto),
                'Subvención': getSubvencionLabel((rec as any).id_subvencion),
                'Estado': rec.id_pre_detalle ? 'Confirmado' : 'Sin confirmar'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Recursos');

        const codigoSol = solicitud?.codigo || `Solicitud_${solicitudId}`;
        XLSX.writeFile(workbook, `Recursos_Presupuesto_${codigoSol}.xlsx`);
    };

    // Actividades PME únicas presentes en los recursos de la tabla/solicitud actual
    const actividadesPresentesEnTabla = useMemo(() => {
        const map = new Map<number, string>();
        for (const rec of recursosActual) {
            if (rec.id_actividad) {
                const actObj = todasActividades.find(a => a.id === rec.id_actividad);
                const nombre = actObj?.nombre || (rec as any).actividad_nombre || (rec as any).actividad_seleccionada?.nombre || `Actividad #${rec.id_actividad}`;
                map.set(rec.id_actividad, nombre);
            }
        }
        return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
    }, [recursosActual, todasActividades]);

    // Opciones y conteos para los 5 filtros avanzados con multiselección
    const opcionesFiltroMeses = useMemo(() => {
        const counts = new Map<string, number>();
        let sinMesCount = 0;
        recursosActual.forEach(r => {
            const m = r.mes_ejecucion || (r.fecha_ejecucion ? r.fecha_ejecucion.substring(5, 7) : '');
            if (m) {
                counts.set(m, (counts.get(m) || 0) + 1);
            } else {
                sinMesCount++;
            }
        });
        const opciones = MESES.map(m => ({
            valor: m.value,
            label: m.label,
            count: counts.get(m.value) || 0
        }));
        return { opciones, sinMesCount };
    }, [recursosActual]);

    const opcionesFiltroDestinos = useMemo(() => {
        const counts = new Map<string, number>();
        let sinDestinoCount = 0;
        recursosActual.forEach(r => {
            const d = destinoCanonico((r as any).destino_gasto);
            if (d) {
                counts.set(d, (counts.get(d) || 0) + 1);
            } else {
                sinDestinoCount++;
            }
        });
        const opciones = DESTINOS.map(d => ({
            valor: d.valor,
            label: d.label,
            count: counts.get(d.valor) || 0
        }));
        return { opciones, sinDestinoCount };
    }, [recursosActual]);

    const opcionesFiltroMotivos = useMemo(() => {
        const counts = new Map<string, number>();
        let sinMotivoCount = 0;
        recursosActual.forEach(r => {
            const m = (r.motivo || '').trim();
            if (m) {
                counts.set(m, (counts.get(m) || 0) + 1);
            } else {
                sinMotivoCount++;
            }
        });
        const opciones = Array.from(counts.entries())
            .map(([motivo, count]) => ({ valor: motivo, label: motivo, count }))
            .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
        return { opciones, sinMotivoCount };
    }, [recursosActual]);

    const opcionesFiltroDimensiones = useMemo(() => {
        const DIM_BASE = ['Gestión Pedagógica', 'Convivencia Escolar', 'Liderazgo', 'Gestión de Recursos'];
        const counts = new Map<string, number>();
        let sinDimensionCount = 0;
        recursosActual.forEach(r => {
            const dim = (
                (r as any).dimension_pme
                || (r as any).actividad_seleccionada?.dimension
                || (r.id_actividad ? todasActividades.find(a => a.id === r.id_actividad)?.dimension : '')
                || ((r as any).actividad_nombre ? todasActividades.find(a => a.nombre.trim().toLowerCase() === (r as any).actividad_nombre.trim().toLowerCase())?.dimension : '')
                || ''
            ).trim();

            if (dim) {
                const match = DIM_BASE.find(d => dim.toLowerCase().includes(d.toLowerCase())) || dim;
                counts.set(match, (counts.get(match) || 0) + 1);
            } else {
                sinDimensionCount++;
            }
        });
        const opciones = DIM_BASE.map(d => ({
            valor: d,
            label: d,
            count: counts.get(d) || 0
        }));
        Array.from(counts.keys()).forEach(k => {
            if (!DIM_BASE.includes(k)) {
                opciones.push({ valor: k, label: k, count: counts.get(k) || 0 });
            }
        });
        return { opciones, sinDimensionCount };
    }, [recursosActual]);

    const opcionesFiltroActividades = useMemo(() => {
        const counts = new Map<number, number>();
        let sinActividadCount = 0;
        recursosActual.forEach(r => {
            if (r.id_actividad) {
                counts.set(r.id_actividad, (counts.get(r.id_actividad) || 0) + 1);
            } else {
                sinActividadCount++;
            }
        });
        const opciones = actividadesPresentesEnTabla.map(a => ({
            valor: String(a.id),
            label: a.nombre,
            count: counts.get(a.id) || 0
        })).sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
        return { opciones, sinActividadCount };
    }, [recursosActual, actividadesPresentesEnTabla]);

    // Recursos con su índice original preservado, aplicando los filtros de
    // "Presupuesto Actual". El índice original es clave: las acciones
    // (guardar/editar/eliminar) operan sobre recursosActual por posición.
    const filtroActivo = filtroPresupuesto.trim() !== ''
        || filtroEstadoPpto !== 'todos'
        || filtroMeses.length > 0
        || filtroDestinos.length > 0
        || filtroMotivos.length > 0
        || filtroDimensiones.length > 0
        || filtroActividades.length > 0;

    const totalFiltrosActivos = (filtroPresupuesto.trim() !== '' ? 1 : 0)
        + (filtroEstadoPpto !== 'todos' ? 1 : 0)
        + filtroMeses.length
        + filtroDestinos.length
        + filtroMotivos.length
        + filtroDimensiones.length
        + filtroActividades.length;

    const limpiarTodosFiltros = () => {
        setFiltroPresupuesto('');
        setFiltroEstadoPpto('todos');
        setFiltroMeses([]);
        setFiltroDestinos([]);
        setFiltroMotivos([]);
        setFiltroDimensiones([]);
        setFiltroActividades([]);
    };

    const recursosFiltrados = recursosActual
        .map((rec, index) => ({ rec, index }))
        .filter(({ rec }) => {
            const q = filtroPresupuesto.trim().toLowerCase();
            const matchTexto = !q
                || rec.nombre_producto.toLowerCase().includes(q)
                || (rec.descripcion || '').toLowerCase().includes(q)
                || (rec.motivo || '').toLowerCase().includes(q);
            const matchEstado = filtroEstadoPpto === 'todos'
                || (filtroEstadoPpto === 'confirmados' ? !!rec.id_pre_detalle : !rec.id_pre_detalle);

            // 1. Filtro Meses (Multiselección)
            const mesRec = rec.mes_ejecucion || (rec.fecha_ejecucion ? rec.fecha_ejecucion.substring(5, 7) : '');
            const matchMes = filtroMeses.length === 0 || filtroMeses.some(m => {
                if (m === '__SIN_MES__') return !mesRec;
                return mesRec === m;
            });

            // 2. Filtro Destinos (Multiselección)
            const destCanon = destinoCanonico((rec as any).destino_gasto);
            const matchDestino = filtroDestinos.length === 0 || filtroDestinos.some(d => {
                if (d === '__SIN_DESTINO__') return !destCanon;
                return destCanon === destinoCanonico(d);
            });

            // 3. Filtro Justificaciones / Motivo (Multiselección)
            const matchMotivos = filtroMotivos.length === 0 || filtroMotivos.some(m => {
                if (m === '__SIN_MOTIVO__') return !(rec.motivo || '').trim();
                return (rec.motivo || '').trim().toLowerCase() === m.trim().toLowerCase();
            });

            // 4. Filtro Dimensiones PME (Multiselección)
            const dimRec = (
                (rec as any).dimension_pme
                || (rec as any).actividad_seleccionada?.dimension
                || (rec.id_actividad ? todasActividades.find(a => a.id === rec.id_actividad)?.dimension : '')
                || ((rec as any).actividad_nombre ? todasActividades.find(a => a.nombre.trim().toLowerCase() === (rec as any).actividad_nombre.trim().toLowerCase())?.dimension : '')
                || ''
            ).toLowerCase().trim();

            const matchDimension = filtroDimensiones.length === 0 || filtroDimensiones.some(d => {
                if (d === '__SIN_DIMENSION__') return !dimRec;
                return dimRec.includes(d.toLowerCase());
            });

            // 5. Filtro Actividades PME (Multiselección)
            const matchActividad = filtroActividades.length === 0 || filtroActividades.some(idStr => {
                if (idStr === '__SIN_ACTIVIDAD__') return !rec.id_actividad;
                return rec.id_actividad === parseInt(idStr);
            });

            return matchTexto && matchEstado && matchMes && matchDestino && matchMotivos && matchDimension && matchActividad;
        });

    const totalPaginasPpto = Math.ceil(recursosFiltrados.length / itemsPorPaginaPpto) || 1;
    const recursosPaginados = recursosFiltrados.slice(
        (paginaPptoActual - 1) * itemsPorPaginaPpto,
        paginaPptoActual * itemsPorPaginaPpto
    );

    // Celda de acciones (Gestión), reutilizada por la tabla principal y la vista completa.
    // Ambas usan `abrirEditar` directamente: el modal de edición ahora se monta en las
    // dos vistas, así que editar desde la vista ampliada ya no obliga a encogerla.
    const renderGestion = (
        rec: DetallePresupuestoForm,
        index: number,
        onEdit: (i: number) => void = abrirEditar,
        esVistaCompleta: boolean = false
    ) => {
        const isSaving = savingItems.includes(index);
        const isRecentlyConfirmed = filasConfirmadasRecientes.has(index);
        const isModified = filasModificadas.has(index);

        return (
            <div className="flex justify-center gap-1.5 items-center">
                {isSaving ? (
                    <div className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-primary rounded-xl text-xs font-bold shadow-2xs">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-[11px]">Guardando...</span>
                    </div>
                ) : isRecentlyConfirmed ? (
                    <div className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold shadow-2xs animate-in fade-in">
                        <Check size={14} strokeWidth={3} />
                        <span className="text-[11px]">¡Confirmado!</span>
                    </div>
                ) : (esVistaCompleta || isModified || !rec.id_pre_detalle) ? (
                    <button
                        type="button"
                        onClick={() => confirmarFila(index)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer ${
                            isModified || !rec.id_pre_detalle
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/20 hover:shadow-md animate-pulse ring-2 ring-emerald-400/50'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 hover:border-emerald-300'
                        }`}
                        title={isModified ? "Confirmar cambios guardados en este insumo" : (!rec.id_pre_detalle ? "Confirmar y agregar recurso" : "Reconfirmar fila")}
                    >
                        <Check size={14} strokeWidth={2.5} />
                        <span>Confirmar</span>
                    </button>
                ) : (
                    <div className="p-2 text-green-500 bg-green-50 rounded-lg" title="Recurso ya agregado">
                        <Check size={16} strokeWidth={3} />
                    </div>
                )}
                <button onClick={() => copiarRecurso(index)} className="p-2 text-slate-600 hover:bg-white hover:shadow-md rounded-lg transition-all border border-transparent hover:border-slate-100 cursor-pointer" title="Copiar recurso">
                    <Copy size={16} />
                </button>
                <button onClick={() => onEdit(index)} className="p-2 text-blue-600 hover:bg-white hover:shadow-md rounded-lg transition-all border border-transparent hover:border-blue-100 cursor-pointer" title="Editar detalles">
                    <Edit2 size={16} />
                </button>
                <button onClick={() => solicitarEliminarRecurso(index)} className="p-2 text-red-600 hover:bg-white hover:shadow-md rounded-lg transition-all border border-transparent hover:border-red-100 cursor-pointer" title="Remover de lista">
                    <Trash2 size={16} />
                </button>
            </div>
        );
    };

    // Etiqueta legible de la fecha/periodo de un recurso.
    const labelFecha = (rec: DetallePresupuestoForm) => {
        const mesCodigo = rec.mes_ejecucion || (rec.fecha_ejecucion ? rec.fecha_ejecucion.substring(5, 7) : '');
        const matchMes = MESES.find(m => m.value === mesCodigo);
        if (matchMes) return matchMes.label;
        if (rec.tipo_fecha === 'fecha_especifica') {
            return `${rec.fecha_ejecucion.substring(5, 10)} / ${rec.fecha_termino?.substring(5, 10) || '...'}`;
        }
        return rec.fecha_ejecucion || 'Mensual';
    };

    const getSubvencionLabel = (idSubv: number | null | undefined): string => {
        if (!idSubv) return 'GENERAL';
        const match = subvencionesActivas.find(s => s.id_subvencion === idSubv);
        return match ? match.nombre_corto : 'GENERAL';
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
            <Loader2 className="animate-spin text-primary" size={48} />
            <p className="text-gray-500 font-bold animate-pulse">Cargando ecosistema de recursos...</p>
        </div>
    );

    // ── Vista de PANTALLA COMPLETA (URL ?view=completa) ─────────────────────────
    // Reutiliza el mismo estado y handlers; "editar" vuelve a la página principal.
    // Se arma como variable y no como `return` temprano: los modales compartidos
    // (Nuevo Insumo, Importar Excel, Sugerir recurso, ayuda de dimensiones) viven al
    // final del componente, así que con un return temprano no se montaban aquí — el
    // botón abría el modal pero no se veía nada hasta volver a la vista estándar.
    const col = columnasVisibles;
    const colCount = COLUMNAS_TABLA.filter(c => col[c.key]).length || 1;
    const vistaCompletaJsx = !vistaCompleta ? null : (
        <div className="animate-in fade-in duration-300 w-full max-w-none">
            {/* Header con botón volver */}
            <div className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
                    <button onClick={() => router.push(`/presupuesto/agregar-recursos?id=${solicitudId}`)} className="flex items-center gap-2 text-gray-500 hover:text-primary transition-all group font-bold text-xs">
                        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                        Volver a gestión de recursos
                    </button>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Presupuesto Actual — Vista completa</h2>
                        <span className="text-primary font-bold bg-primary/10 px-2 py-0.5 rounded text-[10px]">{solicitud?.codigo}</span>
                        {solicitud?.presupuesto_anual_nombre ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold" title="Presupuesto Anual Enlazado">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Presupuesto: {solicitud.presupuesto_anual_nombre} {solicitud.presupuesto_anual_year ? `(${solicitud.presupuesto_anual_year})` : ''}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold" title="Sin presupuesto anual asignado">
                                Sin presupuesto anual enlazado
                            </span>
                        )}
                        {pmeInfo && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold" title={`Plan de Mejoramiento Educativo (PME) en uso: ${pmeInfo.colegio || ''} ${pmeInfo.year ? `(${pmeInfo.year})` : ''}`}>
                                <GraduationCap size={13} className="text-indigo-600 shrink-0" />
                                PME: {pmeInfo.colegio || 'Colegio'} {pmeInfo.year ? `(${pmeInfo.year})` : ''}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 font-medium">
                        {recursosFiltrados.length} de {recursosActual.length} insumo(s)
                        <span className="mx-2 text-gray-300">·</span>
                        {formatCLP(recursosFiltrados.reduce((a, { rec }) => a + rec.total_iva, 0))}
                    </p>
                </div>

                {/* Grupo de Acciones perfeccionado y centrado verticalmente */}
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap self-start lg:self-center bg-white p-1.5 rounded-2xl border border-gray-200/80 shadow-sm">
                    {/* Botón para Confirmar todos los cambios pendientes */}
                    {filasModificadas.size > 0 && (
                        <>
                            <button
                                type="button"
                                onClick={confirmarTodasFilasModificadas}
                                disabled={savingItems.length > 0}
                                className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-3.5 py-2 rounded-xl font-bold transition-all active:scale-95 text-xs shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                                title="Confirmar y guardar todos los insumos editados"
                            >
                                <Check size={15} strokeWidth={2.5} />
                                <span>Confirmar cambios ({filasModificadas.size})</span>
                            </button>
                            <div className="h-5 w-px bg-gray-200 mx-0.5 hidden sm:block" />
                        </>
                    )}

                    {/* 1. Crear Insumo (Acción principal) */}
                    <button
                        onClick={abrirNuevoManual}
                        className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white px-3.5 py-2 rounded-xl font-bold transition-all active:scale-95 text-xs shadow-sm"
                        title="Crear un nuevo insumo no existente en el catálogo"
                    >
                        <Plus size={15} strokeWidth={2.5} /> Nuevo
                    </button>

                    <div className="h-5 w-px bg-gray-200 mx-0.5 hidden sm:block" />

                    {/* 2. Plantilla, Importar Excel & Preparar */}
                    {puedeVerPlantillaExcel && (
                        <button
                            onClick={() => descargarPlantillaPresupuesto(todasActividades, categorias as any)}
                            className="flex items-center gap-1.5 bg-gray-50 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 px-3 py-2 rounded-xl font-semibold transition-all active:scale-95 text-xs"
                            title="Descargar plantilla oficial de Excel para presupuesto"
                        >
                            <FileSpreadsheet size={15} className="text-emerald-600" /> Plantilla
                        </button>
                    )}
                    {puedeImportarExcel && (
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl font-bold transition-all active:scale-95 text-xs shadow-sm"
                            title="Importar plantilla de presupuesto en Excel"
                        >
                            <Upload size={15} strokeWidth={2.5} /> Importar
                        </button>
                    )}
                    {puedeVerBotonPreparar && (
                        <button
                            onClick={() => setShowPrepararModal(true)}
                            disabled={recursosActual.length === 0}
                            className="flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 px-3.5 py-2 rounded-xl font-bold transition-all active:scale-95 text-xs shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Agrupar filas repetidas, cruzar con el catálogo oficial y ver qué falta asesorar"
                        >
                            <Layers size={15} strokeWidth={2.5} /> Preparar
                        </button>
                    )}

                    {(puedeVerPlantillaExcel || puedeImportarExcel || puedeVerBotonPreparar) && (
                        <div className="h-5 w-px bg-gray-200 mx-0.5 hidden sm:block" />
                    )}

                    {/* 3. Exportar & Elegir columnas (Herramientas de tabla) */}
                    {recursosActual.length > 0 && (
                        <button
                            onClick={exportarAExcel}
                            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl font-semibold transition-all text-xs"
                            title="Exportar toda la lista a Excel"
                        >
                            <FileDown size={15} /> Exportar
                        </button>
                    )}
                    <button
                        onClick={() => setShowColumnasModal(true)}
                        className="flex items-center gap-1.5 bg-white text-gray-700 border border-gray-200 hover:border-primary hover:text-primary px-3 py-2 rounded-xl font-semibold transition-all active:scale-95 text-xs"
                    >
                        <SlidersHorizontal size={15} /> Columnas
                    </button>

                    {/* Descripción, Justificación y Actividad PME se recortan a una o dos
                        líneas para que quepan más filas; este toggle las despliega enteras. */}
                    <button
                        onClick={alternarTextoCompleto}
                        aria-pressed={textoCompleto}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold transition-all active:scale-95 text-xs border ${textoCompleto
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-primary hover:text-primary'}`}
                        title={textoCompleto
                            ? 'Volver a recortar descripción, justificación y actividad PME'
                            : 'Mostrar el texto completo de descripción, justificación y actividad PME'}
                    >
                        <AlignLeft size={15} /> Texto completo
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowGuiaModal(true)}
                        className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-2 rounded-xl font-bold transition-all active:scale-95 text-xs shadow-xs cursor-pointer"
                        title="Ver guía paso a paso del sistema y glosario de botones"
                    >
                        <HelpCircle size={15} strokeWidth={2.5} /> Guía
                    </button>

                    <div className="h-5 w-px bg-gray-200 mx-0.5 hidden sm:block" />

                    {/* Botón Encoger (Volver a la vista normal) */}
                    <button
                        onClick={() => router.push(`/presupuesto/agregar-recursos?id=${solicitudId}`)}
                        className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-3.5 py-2 rounded-xl font-bold transition-all active:scale-95 text-xs shadow-sm"
                        title="Volver a la vista estándar reducida"
                    >
                        <Maximize2 size={14} className="rotate-180" /> Encoger
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden mb-6">
                {/* Filtros Principales & Avanzados */}
                <div className="px-6 py-4 border-b border-gray-100 bg-slate-50/50 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                            <input
                                type="text"
                                placeholder="Buscar por insumo, descripción o motivo..."
                                value={filtroPresupuesto}
                                onChange={(e) => setFiltroPresupuesto(e.target.value)}
                                className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
                            />
                            {filtroPresupuesto && (
                                <button onClick={() => setFiltroPresupuesto('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-lg hover:bg-gray-100 transition-all" title="Limpiar">
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                            <div className="inline-flex bg-gray-100/80 p-1 rounded-xl border border-gray-200/60 shadow-inner">
                                {([
                                    { v: 'todos', label: 'Todos' },
                                    { v: 'confirmados', label: 'Confirmados' },
                                    { v: 'borrador', label: 'Sin confirmar' },
                                ] as const).map(op => (
                                    <button
                                        key={op.v}
                                        onClick={() => setFiltroEstadoPpto(op.v)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filtroEstadoPpto === op.v ? 'bg-white text-primary shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'}`}
                                    >
                                        {op.label}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={limpiarTodosFiltros}
                                disabled={!filtroActivo}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    filtroActivo
                                        ? 'text-rose-600 bg-rose-50 hover:bg-rose-100/90 border border-rose-200 cursor-pointer shadow-xs active:scale-95'
                                        : 'text-gray-300 bg-gray-50/70 border border-gray-200/50 cursor-not-allowed opacity-50'
                                }`}
                                title={filtroActivo ? 'Restablecer todos los filtros' : 'No hay filtros activos para limpiar'}
                            >
                                <RotateCcw size={13} className="shrink-0" />
                                <span>Limpiar filtros</span>
                                {totalFiltrosActivos > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-full bg-rose-200 text-rose-800 text-[10px] font-black leading-none">
                                        {totalFiltrosActivos}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Fila de Filtros Avanzados con selección múltiple: Mes, Destino, Motivo, Dimensión PME, Actividad PME */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-gray-200/60">
                        {/* 1. Filtro Meses */}
                        <FiltroMultiSelectGenerico
                            icono="🗓️"
                            tituloVacio="Todos los Meses"
                            tituloPlural="Meses"
                            seleccionados={filtroMeses}
                            onChange={setFiltroMeses}
                            opciones={opcionesFiltroMeses.opciones}
                            opcionSinValor={opcionesFiltroMeses.sinMesCount > 0 ? {
                                valorEspecial: '__SIN_MES__',
                                label: '— Sin mes asignado —',
                                count: opcionesFiltroMeses.sinMesCount
                            } : undefined}
                            placeholderBusqueda="Buscar mes..."
                        />

                        {/* 2. Filtro Destinos */}
                        <FiltroMultiSelectGenerico
                            icono="🎯"
                            tituloVacio="Todos los Destinos"
                            tituloPlural="Destinos"
                            seleccionados={filtroDestinos}
                            onChange={setFiltroDestinos}
                            opciones={opcionesFiltroDestinos.opciones}
                            opcionSinValor={opcionesFiltroDestinos.sinDestinoCount > 0 ? {
                                valorEspecial: '__SIN_DESTINO__',
                                label: '— Sin destino asignado —',
                                count: opcionesFiltroDestinos.sinDestinoCount
                            } : undefined}
                            placeholderBusqueda="Buscar destino..."
                        />

                        {/* 3. Filtro Justificación / Motivo */}
                        <FiltroMultiSelectGenerico
                            icono="🏷️"
                            tituloVacio="Todas las Justificaciones"
                            tituloPlural="Justificaciones"
                            seleccionados={filtroMotivos}
                            onChange={setFiltroMotivos}
                            opciones={opcionesFiltroMotivos.opciones}
                            opcionSinValor={opcionesFiltroMotivos.sinMotivoCount > 0 ? {
                                valorEspecial: '__SIN_MOTIVO__',
                                label: '— Sin justificación —',
                                count: opcionesFiltroMotivos.sinMotivoCount
                            } : undefined}
                            placeholderBusqueda="Buscar justificación..."
                        />

                        {/* 4. Filtro Dimensiones PME */}
                        <FiltroMultiSelectGenerico
                            icono="🏫"
                            tituloVacio="Todas las Dimensiones"
                            tituloPlural="Dimensiones"
                            seleccionados={filtroDimensiones}
                            onChange={setFiltroDimensiones}
                            opciones={opcionesFiltroDimensiones.opciones}
                            opcionSinValor={opcionesFiltroDimensiones.sinDimensionCount > 0 ? {
                                valorEspecial: '__SIN_DIMENSION__',
                                label: '— Sin dimensión PME —',
                                count: opcionesFiltroDimensiones.sinDimensionCount
                            } : undefined}
                            placeholderBusqueda="Buscar dimensión..."
                        />

                        {/* 5. Filtro Actividades PME */}
                        <FiltroMultiSelectGenerico
                            icono="📌"
                            tituloVacio={`Todas las Actividades (${actividadesPresentesEnTabla.length})`}
                            tituloPlural="Actividades"
                            seleccionados={filtroActividades}
                            onChange={setFiltroActividades}
                            opciones={opcionesFiltroActividades.opciones}
                            opcionSinValor={opcionesFiltroActividades.sinActividadCount > 0 ? {
                                valorEspecial: '__SIN_ACTIVIDAD__',
                                label: '— Sin actividad PME —',
                                count: opcionesFiltroActividades.sinActividadCount
                            } : undefined}
                            placeholderBusqueda="Buscar actividad PME..."
                        />
                    </div>
                </div>
                {/* Tabla con columnas configurables y orden dinámico con altura mínima y padding inferior */}
                <div className="overflow-x-auto min-h-[420px] pb-24">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                                {ordenColumnas.map(key => {
                                    if (!col[key]) return null;
                                    if (key === 'insumo') return (
                                        <th key={key} className="px-6 py-3 sticky left-0 z-20 bg-gray-50/95 backdrop-blur-xs shadow-[2px_0_5px_rgba(0,0,0,0.04)] border-r border-gray-100">
                                            Insumo
                                        </th>
                                    );
                                    if (key === 'descripcion') return <th key={key} className="px-4 py-3">Descripción</th>;
                                    if (key === 'justificacion') return (
                                        <th key={key} className="px-4 py-3">
                                            Justificación / Motivo
                                        </th>
                                    );
                                    if (key === 'cargo') return <th key={key} className="px-4 py-3">Cargo / Destinatario</th>;
                                    if (key === 'destino') return <th key={key} className="px-4 py-3">Destino del Gasto</th>;
                                    if (key === 'cantidad') return <th key={key} className="px-4 py-3 text-center">Cant.</th>;
                                    if (key === 'valorUnit') return <th key={key} className="px-4 py-3 text-right">Valor Unit.</th>;
                                    if (key === 'total') return <th key={key} className="px-4 py-3 text-right">Total</th>;
                                    if (key === 'fecha') return <th key={key} className="px-4 py-3 text-center">Fecha / Período</th>;
                                    if (key === 'subvencion') return <th key={key} className="px-4 py-3 text-center">Subvención</th>;
                                    if (key === 'codigoCuenta') return <th key={key} className="px-4 py-3 text-center">Código Contable</th>;
                                    if (key === 'dimensionPme') return <th key={key} className="px-4 py-3">Dimensión PME</th>;
                                    if (key === 'actividadPme') return <th key={key} className="px-4 py-3">Actividad PME</th>;
                                    if (key === 'estado') return <th key={key} className="px-4 py-3 text-center">Estado</th>;
                                    if (key === 'gestion') return (
                                        <th key={key} className="px-6 py-3 text-center sticky right-0 z-20 bg-gray-50/95 backdrop-blur-xs shadow-[-2px_0_5px_rgba(0,0,0,0.04)] border-l border-gray-100">
                                            Gestión
                                        </th>
                                    );
                                    return null;
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {recursosPaginados.length === 0 ? (
                                <tr>
                                    <td colSpan={colCount} className="px-8 py-16 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-40">
                                            <Search size={40} className="text-gray-400" />
                                            <p className="text-sm font-bold text-gray-700">Sin resultados para el filtro</p>
                                            <button onClick={limpiarTodosFiltros} className="text-xs font-bold text-primary hover:underline">Limpiar filtros</button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                recursosPaginados.map(({ rec, index }) => (
                                    <tr key={index} className={`transition-colors group align-top ${rec.recurso_estado === 'PENDIENTE_APROBACION' ? 'bg-amber-50/50 hover:bg-amber-50/80 border-l-4 border-l-amber-500 shadow-sm' : 'hover:bg-blue-50/20'}`}>
                                        {ordenColumnas.map(key => {
                                            if (!col[key]) return null;

                                            if (key === 'insumo') {
                                                const catNom = (rec as any).categoria_nombre || (categorias.find(c => c.id_cat_recurso === (rec as any).id_cat_recurso)?.nombre) || (rec as any).recurso_seleccionado?.categoria?.nombre || (rec as any).recurso_seleccionado?.categoria_nombre || null;
                                                return (
                                                    <td key={key} className="px-6 py-3 min-w-[220px] max-w-[280px] sticky left-0 z-10 bg-white group-hover:bg-slate-50/95 shadow-[2px_0_5px_rgba(0,0,0,0.04)] border-r border-gray-100 transition-colors">
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="font-bold text-sm text-gray-900 flex items-center gap-2 flex-wrap leading-snug">
                                                                <span>{rec.nombre_producto}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setDetalleInsumoModal({ item: rec, index })}
                                                                    className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
                                                                    title="Ver detalle del insumo"
                                                                >
                                                                    <Eye size={14} />
                                                                </button>
                                                                {rec.recurso_estado === 'PENDIENTE_APROBACION' && (
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[9px] font-black border border-amber-200 shrink-0">
                                                                        Nuevo / Sugerido
                                                                    </span>
                                                                )}
                                                                {(rec as any)._isClassifying && (
                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600 text-[9px] font-bold animate-pulse border border-violet-100 shrink-0">
                                                                        <Loader2 size={10} className="animate-spin" />
                                                                        Clasificando...
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {catNom && (
                                                                <span className="text-[10px] font-normal text-purple-600/80 leading-tight flex items-center gap-1 mt-0.5">
                                                                    <Tag size={9} className="text-purple-400 shrink-0" />
                                                                    {catNom}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            }

                                            if (key === 'descripcion') return (
                                                <td key={key} className="px-3 py-2 min-w-[240px]">
                                                    <textarea
                                                        rows={textoCompleto ? 3 : 1}
                                                        value={rec.descripcion || ''}
                                                        onChange={(e) => actualizarCampoEnFila(index, { descripcion: e.target.value })}
                                                        placeholder="Añadir descripción..."
                                                        className="w-full px-2.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 focus:border-primary focus:bg-white rounded-lg text-xs text-gray-800 transition-all font-medium placeholder:text-gray-400 placeholder:italic resize-y min-h-[34px] leading-snug"
                                                    />
                                                </td>
                                            );

                                            if (key === 'justificacion') return (
                                                <td key={key} className="px-3 py-2 min-w-[220px] max-w-[340px]">
                                                    <SelectorMotivoFila
                                                        motivoActual={rec.motivo}
                                                        motivos={motivosOrdenadosAlfabetico}
                                                        onSelect={(nuevoMotivo) => {
                                                            actualizarCampoEnFila(index, { motivo: nuevoMotivo });
                                                        }}
                                                    />
                                                </td>
                                            );

                                            if (key === 'cargo') return (
                                                <td key={key} className="px-4 py-3 text-[11px] font-semibold text-amber-900 whitespace-nowrap">
                                                    {nombreSubareaDeFila(rec) || '—'}
                                                </td>
                                            );

                                            if (key === 'destino') return (
                                                <td key={key} className="px-4 py-3 text-[11px] font-semibold whitespace-nowrap">
                                                    <select
                                                        value={destinoCanonico((rec as any).destino_gasto)}
                                                        onChange={(e) => cambiarDestinoGasto(index, e.target.value)}
                                                        className="px-2.5 py-1.5 bg-blue-50/80 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all cursor-pointer shadow-2xs"
                                                    >
                                                        <option value="">— sin destino —</option>
                                                        {DESTINOS.map(d => (
                                                            <option key={d.valor} value={d.valor}>{d.label}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            );

                                            if (key === 'cantidad') return (
                                                <td key={key} className="px-3 py-2 text-center whitespace-nowrap min-w-[110px]">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={rec.cantidad}
                                                            onChange={(e) => actualizarCampoEnFila(index, { cantidad: Number(e.target.value) })}
                                                            className="w-16 text-center px-2 py-1 bg-white hover:bg-gray-50 border border-gray-200 focus:border-primary focus:bg-white rounded-lg text-xs font-bold text-gray-900 transition-all shadow-2xs"
                                                        />
                                                        <span className="text-[10px] font-medium text-gray-500 uppercase">{rec.formato_unidad || 'unid.'}</span>
                                                    </div>
                                                </td>
                                            );

                                            if (key === 'valorUnit') return (
                                                <td key={key} className="px-3 py-2 text-right whitespace-nowrap min-w-[120px]">
                                                    <div className="relative inline-block w-28">
                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">$</span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            step={100}
                                                            value={rec.valor_unitario_iva}
                                                            onChange={(e) => actualizarCampoEnFila(index, { valor_unitario_iva: Number(e.target.value) })}
                                                            className="w-full pl-6 pr-2 py-1 text-right bg-white hover:bg-gray-50 border border-gray-200 focus:border-primary focus:bg-white rounded-lg text-xs font-bold text-gray-900 transition-all shadow-2xs"
                                                        />
                                                    </div>
                                                </td>
                                            );

                                            if (key === 'total') return (
                                                <td key={key} className="px-4 py-3 text-right font-extrabold text-primary text-xs whitespace-nowrap">
                                                    {formatCLP(rec.total_iva)}
                                                </td>
                                            );

                                            if (key === 'fecha') return (
                                                <td key={key} className="px-3 py-2 text-center whitespace-nowrap min-w-[140px]">
                                                    <select
                                                        value={rec.mes_ejecucion || (rec.fecha_ejecucion ? rec.fecha_ejecucion.substring(5, 7) : '')}
                                                        onChange={(e) => {
                                                            const mesVal = e.target.value;
                                                            const year = new Date().getFullYear();
                                                            const fechaFmt = mesVal ? `${year}-${mesVal}-01` : rec.fecha_ejecucion;
                                                            actualizarCampoEnFila(index, {
                                                                mes_ejecucion: mesVal,
                                                                fecha_ejecucion: fechaFmt
                                                            });
                                                        }}
                                                        className="px-2.5 py-1 bg-white hover:bg-gray-50 border border-gray-200 focus:border-primary focus:bg-white rounded-lg text-xs font-semibold text-gray-800 transition-all shadow-2xs cursor-pointer"
                                                    >
                                                        <option value="">🗓️ Mes...</option>
                                                        {MESES.map(m => (
                                                            <option key={m.value} value={m.value}>{m.label}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            );

                                            if (key === 'subvencion') return (
                                                <td key={key} className="px-4 py-3 text-center whitespace-nowrap">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-violet-50 text-violet-600 text-[10px] font-bold border border-violet-100">
                                                        {getSubvencionLabel((rec as any).id_subvencion)}
                                                    </span>
                                                </td>
                                            );

                                            if (key === 'codigoCuenta') return (
                                                <td key={key} className="px-4 py-3 text-center text-[11px] font-bold text-gray-700 whitespace-nowrap">
                                                    {rec.codigo_cuenta || '—'}
                                                </td>
                                            );

                                            if (key === 'dimensionPme') {
                                                const dim = (rec as any).dimension_pme
                                                    || (rec as any).actividad_seleccionada?.dimension
                                                    || (rec.id_actividad ? todasActividades.find(a => a.id === rec.id_actividad)?.dimension : null)
                                                    || ((rec as any).actividad_nombre ? todasActividades.find(a => a.nombre.trim().toLowerCase() === (rec as any).actividad_nombre.trim().toLowerCase())?.dimension : null);

                                                return (
                                                    <td key={key} className="px-4 py-3 text-[11px] font-semibold text-gray-700 whitespace-nowrap">
                                                        {dim || '—'}
                                                    </td>
                                                );
                                            }

                                            if (key === 'actividadPme') {
                                                const actActual = (rec as any).actividad_seleccionada || todasActividades.find(a => a.id === rec.id_actividad) || null;
                                                return (
                                                    <td key={key} className="px-3 py-2 min-w-[240px] max-w-[360px]">
                                                        <SelectorActividadPmeFila
                                                            actividadActual={actActual}
                                                            todasActividades={todasActividades}
                                                            onSelect={(act) => {
                                                                actualizarCampoEnFila(index, {
                                                                    id_actividad: act ? act.id : undefined,
                                                                    dimension_pme: act?.dimension || '',
                                                                    actividad_seleccionada: act || undefined,
                                                                });
                                                            }}
                                                        />
                                                    </td>
                                                );
                                            }

                                            if (key === 'estado') return (
                                                <td key={key} className="px-4 py-3 text-center whitespace-nowrap">
                                                    {filasModificadas.has(index) ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-200 animate-pulse">
                                                            ✏️ Editado (sin confirmar)
                                                        </span>
                                                    ) : rec.id_pre_detalle ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-green-50 text-green-600 text-[10px] font-bold">
                                                            <Check size={11} strokeWidth={3} /> Confirmado
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-600 text-[10px] font-bold">
                                                            Sin confirmar
                                                        </span>
                                                    )}
                                                </td>
                                            );

                                            if (key === 'gestion') return (
                                                <td key={key} className="px-6 py-3 sticky right-0 z-10 bg-white group-hover:bg-slate-50/95 shadow-[-2px_0_5px_rgba(0,0,0,0.04)] border-l border-gray-100 transition-colors">
                                                    {renderGestion(rec, index, abrirEditar, true)}
                                                </td>
                                            );

                                            return null;
                                        })}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paginador con selector de cantidad en vista completa */}
                {recursosFiltrados.length > 0 && (
                    <div className="px-6 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/50">
                        <span className="text-xs font-semibold text-gray-500">
                            Mostrando {((paginaPptoActual - 1) * itemsPorPaginaPpto) + 1} - {Math.min(paginaPptoActual * itemsPorPaginaPpto, recursosFiltrados.length)} de {recursosFiltrados.length}
                        </span>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                                <span>Mostrar:</span>
                                <select
                                    value={itemsPorPaginaPpto}
                                    onChange={(e) => {
                                        setItemsPorPaginaPpto(Number(e.target.value));
                                        setPaginaPptoActual(1);
                                    }}
                                    className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer shadow-2xs"
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={150}>150</option>
                                    <option value={200}>200</option>
                                </select>
                                <span>por pág.</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                                <button
                                    disabled={paginaPptoActual === 1}
                                    onClick={() => setPaginaPptoActual(prev => Math.max(prev - 1, 1))}
                                    className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                    title="Página Anterior"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-xs font-bold text-gray-700 px-2">
                                    Pág. {paginaPptoActual} de {totalPaginasPpto}
                                </span>
                                <button
                                    disabled={paginaPptoActual >= totalPaginasPpto}
                                    onClick={() => setPaginaPptoActual(prev => Math.min(prev + 1, totalPaginasPpto))}
                                    className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                    title="Página Siguiente"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Barra flotante inferior cuando hay filas modificadas sin confirmar */}
                {filasModificadas.size > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-200">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                            <p className="text-xs font-semibold">
                                Tienes <b className="text-emerald-300 font-bold">{filasModificadas.size}</b> insumo(s) con cambios sin confirmar.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={confirmarTodasFilasModificadas}
                            disabled={savingItems.length > 0}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                            {savingItems.length > 0 ? (
                                <>
                                    <Loader2 size={13} className="animate-spin" />
                                    <span>Guardando...</span>
                                </>
                            ) : (
                                <>
                                    <Check size={14} strokeWidth={2.5} />
                                    <span>Confirmar cambios</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Modal: selector de columnas */}
            {showColumnasModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-lg flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200" onClick={() => setShowColumnasModal(false)}>
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-900">Columnas a visualizar</h3>
                            <button onClick={() => setShowColumnasModal(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"><X size={16} /></button>
                        </div>
                        <div className="p-4 space-y-1 max-h-[60vh] overflow-auto">
                            {ordenColumnas.map((key, idx) => {
                                const c = COLUMNAS_TABLA.find(item => item.key === key);
                                if (!c) return null;
                                return (
                                    <div key={c.key} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl transition-all ${c.fijo ? 'bg-gray-50/70 border border-gray-100 opacity-70' : 'bg-white border border-gray-100 hover:border-gray-200 hover:shadow-xs'}`}>
                                        <label className={`flex items-center gap-3 flex-1 min-w-0 ${c.fijo ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                            <input type="checkbox" checked={!!columnasVisibles[c.key]} disabled={c.fijo}
                                                onChange={() => toggleColumnaVisible(c.key)}
                                                className="w-4 h-4 accent-primary shrink-0" />
                                            <span className="text-[12px] font-semibold text-gray-800 truncate">{c.label}</span>
                                            {c.fijo && <span className="ml-auto text-[9px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Fija</span>}
                                        </label>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                            <button
                                                disabled={idx === 0}
                                                onClick={() => moverColumna(idx, 'subir')}
                                                className="p-1 rounded text-gray-400 hover:text-primary hover:bg-primary/10 disabled:opacity-20 disabled:hover:bg-transparent transition-all"
                                                title="Mover hacia arriba"
                                            >
                                                <ChevronLeft size={14} className="rotate-90" />
                                            </button>
                                            <button
                                                disabled={idx === ordenColumnas.length - 1}
                                                onClick={() => moverColumna(idx, 'bajar')}
                                                className="p-1 rounded text-gray-400 hover:text-primary hover:bg-primary/10 disabled:opacity-20 disabled:hover:bg-transparent transition-all"
                                                title="Mover hacia abajo"
                                            >
                                                <ChevronRight size={14} className="rotate-90" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
                            <button onClick={() => setShowColumnasModal(false)} className="px-4 py-2 bg-primary text-white rounded-xl text-[12px] font-bold active:scale-95 transition-all">Listo</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <>
            {vistaCompletaJsx}
            {!vistaCompleta && (
                <div className="animate-in fade-in duration-500 w-full max-w-none">
                    {/* Header */}
                    <div className="mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                            <button onClick={() => router.back()} className="flex items-center gap-1.5 text-gray-500 hover:text-primary transition-all group font-bold text-xs">
                                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                                Volver a la solicitud
                            </button>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h2 className="text-xl font-bold text-gray-900 tracking-tight">Gestionar Recursos</h2>
                                <span className="text-primary font-bold bg-primary/10 px-2 py-0.5 rounded text-[10px]">{solicitud?.codigo}</span>
                                <span className="text-gray-300 hidden sm:inline">|</span>
                                <p className="text-xs text-gray-500 font-medium">
                                    {solicitud?.area_nombre} <span className="mx-1 text-gray-300">/</span> {solicitud?.subarea_nombre}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                {solicitud?.presupuesto_anual_nombre ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold" title="Presupuesto Anual Enlazado">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        Presupuesto: {solicitud.presupuesto_anual_nombre} {solicitud.presupuesto_anual_year ? `(${solicitud.presupuesto_anual_year})` : ''}
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold" title="Sin presupuesto anual asignado">
                                        Sin presupuesto anual enlazado
                                    </span>
                                )}
                                {pmeInfo && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold" title={`Plan de Mejoramiento Educativo (PME) en uso: ${pmeInfo.colegio || ''} ${pmeInfo.year ? `(${pmeInfo.year})` : ''}`}>
                                        <GraduationCap size={13} className="text-indigo-600 shrink-0" />
                                        PME: {pmeInfo.colegio || 'Colegio'} {pmeInfo.year ? `(${pmeInfo.year})` : ''}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Toolbar unificada: Pestañas de origen de insumos + Herramientas Excel */}
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap self-start xl:self-center bg-white p-1.5 rounded-2xl border border-gray-200/80 shadow-sm">
                            {/* Selector de pestañas / modo de insumos */}
                            <div className="flex items-center bg-slate-100/80 p-0.5 rounded-xl border border-slate-200/60">
                                <button
                                    onClick={() => setActiveTab('buscador')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        activeTab === 'buscador'
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                                    }`}
                                    title="Buscar insumos en el catálogo general"
                                >
                                    <Search size={14} className={activeTab === 'buscador' ? 'text-white' : 'text-slate-400'} />
                                    <span>Buscador</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('pme')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        activeTab === 'pme'
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                                    }`}
                                    title="Insumos vinculados al Plan de Mejoramiento Educativo"
                                >
                                    <ClipboardList size={14} className={activeTab === 'pme' ? 'text-white' : 'text-slate-400'} />
                                    <span>Planes PME</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('historial')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        activeTab === 'historial'
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                                    }`}
                                    title="Consultar compras e insumos de presupuestos anteriores"
                                >
                                    <History size={14} className={activeTab === 'historial' ? 'text-white' : 'text-slate-400'} />
                                    <span>Historial</span>
                                </button>
                            </div>

                            <div className="h-5 w-px bg-gray-200 mx-0.5 hidden sm:block" />

                            {/* Acciones de gestión Excel */}
                            {(puedeVerPlantillaExcel || puedeImportarExcel) && (
                                <div className="flex items-center gap-1.5">
                                    {puedeVerPlantillaExcel && (
                                        <button
                                            onClick={() => descargarPlantillaPresupuesto(todasActividades, categorias as any)}
                                            className="flex items-center gap-1.5 bg-gray-50 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 px-3 py-1.5 rounded-xl font-semibold transition-all active:scale-95 text-xs shadow-2xs"
                                            title="Descargar plantilla oficial de Excel para presupuesto"
                                        >
                                            <FileSpreadsheet size={15} className="text-emerald-600" />
                                            <span>Plantilla</span>
                                        </button>
                                    )}
                                    {puedeImportarExcel && (
                                        <button
                                            onClick={() => setShowImportModal(true)}
                                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl font-bold transition-all active:scale-95 text-xs shadow-sm hover:shadow-emerald-600/20"
                                            title="Importar plantilla de presupuesto en Excel"
                                        >
                                            <Upload size={14} strokeWidth={2.5} />
                                            <span>Importar Excel</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-6 items-start">
                        {/* Sidebar Dinámico */}
                        <div className={`shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-14' : 'w-full lg:w-[360px]'}`}>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-fit sticky top-6 overflow-hidden">
                                {sidebarCollapsed ? (
                                    /* Rail colapsado — solo íconos centrados */
                                    <div className="flex flex-col items-center gap-1 py-4 px-2">
                                        <button
                                            onClick={() => setSidebarCollapsed(false)}
                                            className="p-2.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all mb-1"
                                            title="Expandir"
                                        >
                                            <ChevronRight size={17} />
                                        </button>
                                        <div className="w-6 h-px bg-gray-100 my-1" />
                                        <button
                                            onClick={() => { setActiveTab('buscador'); setSidebarCollapsed(false); }}
                                            className={`p-2.5 rounded-xl transition-all ${activeTab === 'buscador' ? 'bg-primary text-white' : 'text-gray-400 hover:bg-primary/5 hover:text-primary'}`}
                                            title="Insumos"
                                        >
                                            <Search size={17} />
                                        </button>
                                        <button
                                            onClick={() => { setActiveTab('pme'); setSidebarCollapsed(false); }}
                                            className={`p-2.5 rounded-xl transition-all ${activeTab === 'pme' ? 'bg-primary text-white' : 'text-gray-400 hover:bg-primary/5 hover:text-primary'}`}
                                            title="Planes PME"
                                        >
                                            <ClipboardList size={17} />
                                        </button>
                                        <button
                                            onClick={() => { setActiveTab('historial'); setSidebarCollapsed(false); }}
                                            className={`p-2.5 rounded-xl transition-all ${activeTab === 'historial' ? 'bg-primary text-white' : 'text-gray-400 hover:bg-primary/5 hover:text-primary'}`}
                                            title="Historial"
                                        >
                                            <History size={17} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="p-6">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-[15px] font-bold text-gray-900">
                                                {activeTab === 'buscador' ? 'Insumos' : activeTab === 'pme' ? 'Planes de Acción' : 'Anteriores'}
                                            </h3>
                                            <button
                                                onClick={() => setSidebarCollapsed(true)}
                                                className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                                                title="Colapsar"
                                            >
                                                <ChevronLeft size={17} />
                                            </button>
                                        </div>
                                        {activeTab === 'buscador' ? (
                                            <>
                                                <div className="relative mb-4">
                                                    <input
                                                        type="text"
                                                        placeholder="Buscar por nombre..."
                                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium"
                                                        value={searchRecurso}
                                                        onChange={(e) => setSearchRecurso(e.target.value)}
                                                    />
                                                    <Search className="absolute left-3.5 top-3 text-gray-400" size={16} />
                                                </div>
                                                <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                                    {recursosEncontrados.length > 0 ? (
                                                        <table className="w-full text-left border-separate border-spacing-y-1">
                                                            <thead>
                                                                <tr className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                                                    <th className="px-2 pb-2">Recurso</th>
                                                                    <th className="px-2 pb-2">Formato</th>
                                                                    <th className="px-2 pb-2 text-right">Add</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {recursosEncontrados.map(r => (
                                                                    <tr key={r.id_recurso} className="group hover:bg-primary/5 transition-colors">
                                                                        <td className="px-2 py-2.5 rounded-l-xl border-y border-l border-transparent group-hover:border-primary/10">
                                                                            <div className="font-bold text-[12px] text-gray-900 group-hover:text-primary transition-colors leading-tight">{r.nombre}</div>
                                                                            <div className="text-[9px] text-gray-400 font-medium">{r.categoria_nombre}</div>
                                                                        </td>
                                                                        <td className="px-2 py-2.5 border-y border-transparent group-hover:border-primary/10">
                                                                            <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded uppercase">
                                                                                {r.formato || 'unid.'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-2 py-2.5 rounded-r-xl border-y border-r border-transparent group-hover:border-primary/10 text-right">
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setCatalogoDetalleModal(r)}
                                                                                    className="p-1.5 bg-white border border-gray-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 rounded-lg transition-all shadow-sm active:scale-90 cursor-pointer"
                                                                                    title="Ver detalle del insumo"
                                                                                >
                                                                                    <Eye size={14} />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => seleccionarRecurso(r)}
                                                                                    className="p-1.5 bg-white border border-gray-100 text-primary hover:bg-primary hover:text-white rounded-lg transition-all shadow-sm active:scale-90 cursor-pointer"
                                                                                    title="Añadir a la solicitud"
                                                                                >
                                                                                    <Plus size={14} />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    ) : (
                                                        <div className="p-8 text-center text-gray-400 italic text-sm space-y-3">
                                                            <p>{searchRecurso.length < 2 && searchRecurso.length > 0 ? 'Escriba más de 2 letras para buscar' : 'No se encontraron resultados'}</p>
                                                            {searchRecurso.length >= 2 && (
                                                                <button
                                                                    onClick={() => {
                                                                        setSugerirForm({
                                                                            nombre: searchRecurso,
                                                                            descripcion_solicitud: '',
                                                                            tipo: 'BIEN',
                                                                            id_cat_recurso: categorias[0]?.id_cat_recurso || 1
                                                                        });
                                                                        setShowSugerirModal(true);
                                                                    }}
                                                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-all active:scale-95 not-italic"
                                                                >
                                                                    <Plus size={14} /> Solicitar nuevo recurso
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {recursosEncontrados.length > 0 && (
                                                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                                                        <button
                                                            disabled={paginaRecursos === 1}
                                                            onClick={() => buscarRecursos(searchRecurso, paginaRecursos - 1)}
                                                            className="px-3 py-1.5 text-[10px] font-bold text-gray-500 hover:text-primary disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1"
                                                        >
                                                            <ChevronLeft size={14} /> Anterior
                                                        </button>
                                                        <span className="text-[10px] font-bold text-gray-400">Pag {paginaRecursos}</span>
                                                        <button
                                                            disabled={recursosEncontrados.length < 30}
                                                            onClick={() => buscarRecursos(searchRecurso, paginaRecursos + 1)}
                                                            className="px-3 py-1.5 text-[10px] font-bold text-gray-500 hover:text-primary disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1"
                                                        >
                                                            Siguiente <ChevronRight size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        ) : activeTab === 'pme' ? (
                                            <div className="space-y-4">
                                                {/* Selector de Colegio para PME (si el usuario pertenece a más de 1 o hay múltiples colegios) */}
                                                {(() => {
                                                    const colegiosPME = Array.from(new Set(todasActividades.map(a => a.colegio_nombre).filter(Boolean) as string[])).sort();
                                                    if (colegiosPME.length <= 1) return null;
                                                    return (
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-0.5">
                                                                Filtrar PME por Colegio:
                                                            </label>
                                                            <select
                                                                value={filtroColegioPME}
                                                                onChange={(e) => setFiltroColegioPME(e.target.value)}
                                                                className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all font-bold text-xs text-gray-800 cursor-pointer"
                                                            >
                                                                <option value="">-- Todos los colegios ({colegiosPME.length}) --</option>
                                                                {colegiosPME.map(col => (
                                                                    <option key={col} value={col}>
                                                                        🏫 {col}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    );
                                                })()}

                                                <div className="relative mb-4">
                                                    <input
                                                        type="text"
                                                        placeholder="Buscar actividad PME..."
                                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-primary/10 transition-all text-sm font-medium"
                                                        value={searchActividad}
                                                        onChange={(e) => setSearchActividad(e.target.value)}
                                                    />
                                                    <Search className="absolute left-3.5 top-3 text-gray-400" size={16} />
                                                </div>
                                                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                                    {(searchActividad ? actividadesEncontradas : todasActividades)
                                                        .filter(a => !filtroColegioPME || a.colegio_nombre === filtroColegioPME)
                                                        .map(a => (
                                                            <button key={a.id} onClick={() => seleccionarActividad(a)} className="w-full text-left p-3 rounded-xl border border-gray-50 hover:border-blue-300 hover:bg-blue-50 transition-all group">
                                                                <div className="font-bold text-gray-900 text-[11px] group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug mb-1">{a.nombre}</div>
                                                                <div className="flex items-center justify-between text-[9px] text-blue-400 font-bold tracking-wider">
                                                                    <span className="flex items-center gap-1"><ClipboardList size={10} /> CONSULTAR RECURSOS</span>
                                                                    {a.colegio_nombre && <span className="text-[9px] text-gray-400 font-normal">🏫 {a.colegio_nombre}</span>}
                                                                </div>
                                                            </button>
                                                        ))}
                                                    {(searchActividad ? actividadesEncontradas : todasActividades).filter(a => !filtroColegioPME || a.colegio_nombre === filtroColegioPME).length === 0 && (
                                                        <div className="p-8 text-center text-gray-400 italic text-sm">No se encontraron actividades PME para este colegio</div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                <div className="flex flex-col gap-2 mb-2">
                                                    {/* Selector de solicitudes aprobadas del usuario */}
                                                    {(() => {
                                                        const codigosUnicos = Array.from(new Set(historialRecursos.map(h => h.codigo_solicitud).filter(Boolean)));
                                                        return (
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-0.5">
                                                                    Filtrar por Solicitud Anterior:
                                                                </label>
                                                                <select
                                                                    value={filtroSolicitudHistorial}
                                                                    onChange={(e) => setFiltroSolicitudHistorial(e.target.value)}
                                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-xs font-bold text-gray-800 cursor-pointer"
                                                                >
                                                                    <option value="">-- Todas las solicitudes anteriores ({codigosUnicos.length}) --</option>
                                                                    {codigosUnicos.map(cod => (
                                                                        <option key={cod} value={cod}>
                                                                            📋 {cod} ({historialRecursos.filter(h => h.codigo_solicitud === cod).length} ítems)
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        );
                                                    })()}

                                                    <div className="flex justify-between items-center mt-1">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase">Selección rápida</span>
                                                        {selectedHistorial.length > 0 && (
                                                            <button onClick={copiarDelHistorial} className="flex items-center gap-2 bg-green-500 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-green-600 transition-colors shadow-sm">
                                                                <Copy size={12} /> COPIAR ({selectedHistorial.length})
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Botón para copiar o eliminar toda la solicitud seleccionada */}
                                                    {(() => {
                                                        const cod = filtroSolicitudHistorial || Array.from(new Set(historialRecursos.map(h => h.codigo_solicitud).filter(Boolean)))[0];
                                                        if (!cod) return null;
                                                        const count = historialRecursos.filter(h => h.codigo_solicitud === cod).length;
                                                        const esAdminOSos = user?.rol?.codigo === 'ADM' || user?.rol?.codigo === 'SOS';

                                                        return (
                                                            <div className="flex items-center gap-1.5 w-full">
                                                                <button
                                                                    onClick={() => copiarTodaLaSolicitud(cod)}
                                                                    className="flex-1 flex items-center justify-between px-3 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-xl text-xs font-extrabold transition-all group active:scale-98 shadow-sm border border-primary/20"
                                                                    title={`Copiar todos los insumos de la solicitud ${cod} de una sola vez`}
                                                                >
                                                                    <span className="flex items-center gap-1.5">
                                                                        <Copy size={13} className="shrink-0" />
                                                                        <span>Agregar todo {cod}</span>
                                                                    </span>
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white text-primary group-hover:bg-white/20 group-hover:text-white font-black">
                                                                        {count} ítems
                                                                    </span>
                                                                </button>
                                                                {esAdminOSos && (
                                                                    <button
                                                                        onClick={() => eliminarSolicitudHistorial(cod)}
                                                                        className="p-2 bg-red-50 hover:bg-red-500 text-red-600 hover:text-white rounded-xl transition-colors border border-red-200 shrink-0"
                                                                        title={`Eliminar solicitud ${cod} y sus ${count} insumos asociados (Solo Administrador)`}
                                                                    >
                                                                        <Trash2 size={15} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="max-h-[440px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                                    {historialRecursos
                                                        .filter(h => !filtroSolicitudHistorial || h.codigo_solicitud === filtroSolicitudHistorial)
                                                        .map(h => (
                                                            <div key={h.id_pre_detalle} className="p-3 bg-gray-50 rounded-xl border border-transparent hover:border-gray-200 transition-all">
                                                                <div className="flex items-start gap-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedHistorial.includes(h.id_pre_detalle)}
                                                                        onChange={() => {
                                                                            if (selectedHistorial.includes(h.id_pre_detalle)) {
                                                                                setSelectedHistorial(selectedHistorial.filter(id => id !== h.id_pre_detalle));
                                                                            } else {
                                                                                setSelectedHistorial([...selectedHistorial, h.id_pre_detalle]);
                                                                            }
                                                                        }}
                                                                        className="mt-1 rounded text-primary focus:ring-primary/20"
                                                                    />
                                                                    <div className="flex-1">
                                                                        <p className="text-[11px] font-bold text-gray-800 leading-tight">{h.nombre_producto}</p>
                                                                        <p className="text-[9px] text-gray-400 mt-1 uppercase">Solicitud: {h.codigo_solicitud}</p>
                                                                        <p className="text-[10px] font-bold text-primary mt-1">{formatCLP(h.valor_unitario_iva)}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    {historialRecursos.filter(h => !filtroSolicitudHistorial || h.codigo_solicitud === filtroSolicitudHistorial).length === 0 && (
                                                        <div className="p-8 text-center text-gray-400 italic text-sm">No hay ítems aprobados disponibles</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tabla de Recursos Actuales */}
                        <div className="flex-1 min-w-0 space-y-6 transition-all duration-300">
                            <div className="bg-white rounded-[32px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
                                    <div>
                                        <h3 className="text-[15px] font-bold text-gray-900 tracking-tight">Presupuesto Actual</h3>
                                        <p className="text-[11px] font-medium text-gray-400">Desglose de inversión aprobable</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => router.push(`/presupuesto/agregar-recursos?id=${solicitudId}&view=completa`)}
                                            disabled={recursosActual.length === 0}
                                            /* Mismo estilo ámbar que su contraparte "Encoger" de la vista completa. */
                                            className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-3.5 py-2 rounded-xl font-bold transition-all active:scale-95 text-xs shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                            title="Abrir tabla en pantalla completa ampliada"
                                        >
                                            <Maximize2 size={14} strokeWidth={2.5} />
                                            Ampliar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowGuiaModal(true)}
                                            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3.5 py-2 rounded-xl font-bold transition-all active:scale-95 text-xs shadow-xs cursor-pointer"
                                            title="Ver guía paso a paso y explicación de botones"
                                        >
                                            <HelpCircle size={15} strokeWidth={2.5} />
                                            Guía de Uso
                                        </button>
                                        <button
                                            onClick={abrirNuevoManual}
                                            className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white px-3.5 py-2 rounded-xl font-bold transition-all active:scale-95 text-[12px] shadow-sm"
                                            title="Crear un nuevo insumo no existente en el catálogo"
                                        >
                                            <Plus size={15} strokeWidth={2.5} />
                                            Nuevo Insumo
                                        </button>
                                        <div className="px-3 py-1 bg-white rounded-xl border border-gray-100 shadow-sm font-bold text-primary text-xs">
                                            {filtroActivo ? `${recursosFiltrados.length}/${recursosActual.length}` : recursosActual.length} items
                                        </div>
                                        {recursosActual.length > 0 && (
                                            <button
                                                onClick={exportarAExcel}
                                                className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl font-bold transition-all text-[12px]"
                                                title="Exportar toda la lista a Excel"
                                            >
                                                <FileDown size={15} /> Exportar Excel
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Filtros de la tabla */}
                                {recursosActual.length > 0 && (
                                    <div className="px-6 py-3.5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                                        <div className="relative flex-1 max-w-md">
                                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                            <input
                                                type="text"
                                                placeholder="Buscar por insumo, descripción o motivo..."
                                                value={filtroPresupuesto}
                                                onChange={(e) => setFiltroPresupuesto(e.target.value)}
                                                className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
                                            />
                                            {filtroPresupuesto && (
                                                <button onClick={() => setFiltroPresupuesto('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-lg hover:bg-gray-100 transition-all" title="Limpiar">
                                                    <X size={13} />
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 flex-wrap">
                                            <div className="inline-flex bg-gray-100/80 p-1 rounded-xl border border-gray-200/60 shadow-inner">
                                                {[
                                                    { v: 'todos', l: 'Todos' },
                                                    { v: 'confirmados', l: 'Confirmados' },
                                                    { v: 'borrador', l: 'Sin confirmar' }
                                                ].map(op => (
                                                    <button
                                                        key={op.v}
                                                        onClick={() => setFiltroEstadoPpto(op.v as any)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filtroEstadoPpto === op.v ? 'bg-white text-primary shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'}`}
                                                    >
                                                        {op.l}
                                                    </button>
                                                ))}
                                            </div>

                                            {(filtroPresupuesto || filtroEstadoPpto !== 'todos') && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setFiltroPresupuesto(''); setFiltroEstadoPpto('todos'); }}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100/90 border border-rose-200 transition-all cursor-pointer shadow-xs active:scale-95 animate-in fade-in"
                                                    title="Limpiar filtros"
                                                >
                                                    <RotateCcw size={13} className="shrink-0" />
                                                    <span>Limpiar</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Aviso: hay recursos sin confirmar (sin el check) */}
                                {recursosActual.some(r => !r.id_pre_detalle) && (
                                    <div className="mx-4 mt-4 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 animate-in slide-in-from-top-1 duration-200 flex-wrap">
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-amber-500 shrink-0 text-base">⚠️</span>
                                            <p className="text-[12px] text-amber-900 leading-relaxed font-semibold">
                                                Hay <b className="font-extrabold">{recursosActual.filter(r => !r.id_pre_detalle).length} recurso(s)</b> en borrador pendientes de guardar en la solicitud.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={eliminarTodosPendientes}
                                                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0"
                                                title="Eliminar todos los recursos en borrador sin guardar"
                                            >
                                                <Trash2 size={14} /> Eliminar pendientes
                                            </button>
                                            <button
                                                onClick={guardarTodosPendientes}
                                                disabled={guardandoTodos}
                                                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {guardandoTodos
                                                    ? <><Loader2 size={14} className="animate-spin" /> {progresoGuardado || 'Guardando…'}</>
                                                    : <><Save size={14} /> Guardar todos pendientes</>}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                                                <th className="px-6 py-3">Insumo / Descripción</th>
                                                <th className="px-4 py-3 text-center">Cant.</th>
                                                <th className="px-4 py-3 text-right">Valor Unit.</th>
                                                <th className="px-4 py-3 text-right">Total</th>
                                                <th className="px-6 py-3 text-center">Gestión</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {recursosPaginados.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center">
                                                        <div className="flex flex-col items-center gap-2 opacity-40">
                                                            <Search size={32} className="text-gray-400" />
                                                            <p className="text-sm font-bold text-gray-700">Sin insumos en la lista</p>
                                                            {filtroActivo && (
                                                                <button onClick={() => { setFiltroPresupuesto(''); setFiltroEstadoPpto('todos'); }} className="text-xs font-bold text-primary hover:underline">Limpiar filtros</button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                recursosPaginados.map(({ rec, index }) => (
                                                    <tr key={index} className={`transition-colors group ${rec.recurso_estado === 'PENDIENTE_APROBACION' ? 'bg-amber-50/50 hover:bg-amber-50/80 border-l-4 border-l-amber-500 shadow-sm' : 'hover:bg-blue-50/20'}`}>
                                                        <td className="px-6 py-3">
                                                            <div className="font-bold text-sm text-gray-900 group-hover:text-primary transition-colors flex items-center gap-2">
                                                                <span>{rec.nombre_producto}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setDetalleInsumoModal({ item: rec, index })}
                                                                    className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer"
                                                                    title="Ver detalle del insumo"
                                                                >
                                                                    <Eye size={14} />
                                                                </button>
                                                                {rec.recurso_estado === 'PENDIENTE_APROBACION' && (
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[9px] font-black border border-amber-200 shrink-0">
                                                                        Nuevo / Sugerido
                                                                    </span>
                                                                )}
                                                                {(rec as any)._isClassifying && (
                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600 text-[9px] font-bold animate-pulse border border-violet-100 shrink-0">
                                                                        <Loader2 size={10} className="animate-spin" />
                                                                        Clasificando...
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                                                <span className="text-[9px] font-bold bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 uppercase tracking-tighter">
                                                                    {labelFecha(rec)}
                                                                </span>
                                                                {(() => {
                                                                    const subareaLabel = nombreSubareaDeFila(rec);
                                                                    return subareaLabel ? (
                                                                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded tracking-tighter border border-amber-200 uppercase">
                                                                            {subareaLabel}
                                                                        </span>
                                                                    ) : null;
                                                                })()}
                                                                {(rec as any).destino_gasto && (
                                                                    <span className="text-[9px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded tracking-tighter border border-blue-100">
                                                                        {etiquetaDestino((rec as any).destino_gasto)}
                                                                    </span>
                                                                )}
                                                                {(rec as any).id_subvencion && (
                                                                    <span className="text-[9px] font-bold bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded uppercase tracking-tighter border border-violet-100">
                                                                        {getSubvencionLabel((rec as any).id_subvencion)}
                                                                    </span>
                                                                )}
                                                                <div className="text-[10px] text-gray-400 font-medium italic line-clamp-1" title={rec.motivo}>{rec.motivo}</div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center font-bold text-gray-900">
                                                            <span className="bg-gray-100 px-2.5 py-1 rounded-lg text-[11px] tracking-tight">
                                                                {rec.cantidad} {rec.formato_unidad}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap text-xs">
                                                            {formatCLP(rec.valor_unitario_iva)}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-bold text-primary text-base">
                                                            {formatCLP(rec.total_iva)}
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            {renderGestion(rec, index)}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Paginador con selector de cantidad (modo estándar / encoger) */}
                                {recursosFiltrados.length > 0 && (
                                    <div className="px-6 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/50">
                                        <span className="text-xs font-semibold text-gray-500">
                                            Mostrando {((paginaPptoActual - 1) * itemsPorPaginaPpto) + 1} - {Math.min(paginaPptoActual * itemsPorPaginaPpto, recursosFiltrados.length)} de {recursosFiltrados.length}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                                                <span>Mostrar:</span>
                                                <select
                                                    value={itemsPorPaginaPpto}
                                                    onChange={(e) => {
                                                        setItemsPorPaginaPpto(Number(e.target.value));
                                                        setPaginaPptoActual(1);
                                                    }}
                                                    className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer shadow-2xs"
                                                >
                                                    <option value={25}>25</option>
                                                    <option value={50}>50</option>
                                                    <option value={100}>100</option>
                                                    <option value={150}>150</option>
                                                    <option value={200}>200</option>
                                                </select>
                                                <span>por pág.</span>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    disabled={paginaPptoActual === 1}
                                                    onClick={() => setPaginaPptoActual(prev => Math.max(prev - 1, 1))}
                                                    className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                    title="Página Anterior"
                                                >
                                                    <ChevronLeft size={16} />
                                                </button>
                                                <span className="text-xs font-bold text-gray-700 px-2">
                                                    Pág. {paginaPptoActual} de {totalPaginasPpto}
                                                </span>
                                                <button
                                                    disabled={paginaPptoActual >= totalPaginasPpto}
                                                    onClick={() => setPaginaPptoActual(prev => Math.min(prev + 1, totalPaginasPpto))}
                                                    className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                    title="Página Siguiente"
                                                >
                                                    <ChevronRight size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Resumen Final */}
                            <div className="bg-white rounded-[24px] border border-gray-100 p-6 flex flex-col md:flex-row justify-between items-center gap-4 shadow-[0_10px_25px_rgb(0,0,0,0.04)] relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12" />
                                <div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Inversión Estimada Total</p>
                                    <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
                                        {formatCLP(recursosActual.reduce((acc, curr) => acc + curr.total_iva, 0))}
                                        <span className="text-[10px] font-semibold text-gray-400 ml-2 tracking-normal uppercase">IVA Incl.</span>
                                    </h3>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modales compartidos por la vista estándar y la vista completa ── */}

            {/* Modal de Recursos PME de la Actividad */}
            {showActividadModal && (() => {
                const recursosFiltrados = recursosActividad.filter(n =>
                    n.toLowerCase().includes(filtroRecursosPMEModal.toLowerCase())
                );
                return (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-lg flex items-center justify-center z-[100] p-4 sm:p-8 animate-in fade-in duration-300">
                        <div className="bg-white rounded-2xl w-[70vw] max-w-4xl min-w-[320px] h-[70vh] shadow-[0_24px_70px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/5 flex flex-col animate-in zoom-in-95">

                            {/* Header */}
                            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4 shrink-0">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Recursos asociados · Plan PME</p>
                                    <h3 className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-2">{selectedActividad?.nombre}</h3>
                                    {selectedActividad?.dimension && (
                                        <p className="text-[11px] text-gray-400 font-medium mt-0.5">Dimensión: {selectedActividad.dimension}</p>
                                    )}
                                </div>
                                <button onClick={() => setShowActividadModal(false)} className="shrink-0 p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-gray-700">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Buscador */}
                            <div className="px-6 py-3 border-b border-gray-100 shrink-0">
                                <div className="relative">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                    <input
                                        type="text"
                                        value={filtroRecursosPMEModal}
                                        onChange={(e) => setFiltroRecursosPMEModal(e.target.value)}
                                        placeholder="Filtrar recursos..."
                                        className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[12px] font-medium text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all"
                                    />
                                    {filtroRecursosPMEModal && (
                                        <button type="button" onClick={() => setFiltroRecursosPMEModal('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Lista con scroll */}
                            <div className="overflow-y-auto custom-scrollbar flex-1">
                                {recursosFiltrados.length > 0 ? (
                                    <ul className="divide-y divide-gray-50">
                                        {recursosFiltrados.map((nombre, i) => (
                                            <li key={i} className="flex items-center justify-between gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors group">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                                                    <span className="text-[13px] font-medium text-gray-700 leading-snug truncate">{nombre}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const nuevo = {
                                                            nombre_producto: nombre,
                                                            descripcion: `Recurso sugerido por actividad: ${selectedActividad?.nombre}`,
                                                            id_actividad: selectedActividad?.id,
                                                            formato_unidad: 'unidad',
                                                            cantidad: 1,
                                                            valor_unitario_iva: 0,
                                                            total_iva: 0,
                                                            tipo_fecha: 'mensual' as const,
                                                            fecha_ejecucion: `${new Date().getFullYear()}-01-01`,
                                                            motivo: `Añadido desde Plan de Acción: ${selectedActividad?.nombre}`
                                                        } as DetallePresupuestoForm;
                                                        setRecursosActual(prev => [...prev, nuevo]);
                                                    }}
                                                    className="shrink-0 w-8 h-8 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white flex items-center justify-center transition-all active:scale-90 sm:opacity-0 sm:group-hover:opacity-100"
                                                    title="Agregar a la solicitud"
                                                >
                                                    <Plus size={16} strokeWidth={2.5} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-12">
                                        <ClipboardList size={36} className="mb-3 opacity-20" />
                                        {filtroRecursosPMEModal ? (
                                            <>
                                                <p className="text-[13px] font-semibold">Sin resultados para "{filtroRecursosPMEModal}"</p>
                                                <button type="button" onClick={() => setFiltroRecursosPMEModal('')} className="text-[11px] text-primary font-bold mt-2 hover:underline">Limpiar filtro</button>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-[13px] font-semibold">Sin recursos definidos</p>
                                                <p className="text-[11px] mt-0.5">Contacte al encargado de PME</p>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
                                <span className="text-[11px] text-gray-400 font-medium">
                                    {recursosFiltrados.length} de {recursosActividad.length} recursos
                                </span>
                                <button onClick={() => setShowActividadModal(false)} className="px-4 py-2 text-[12px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all">
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showRecursoModal && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex justify-end z-[110] animate-in fade-in duration-300"
                    onClick={() => setShowRecursoModal(false)}
                >
                    <div
                        className={`bg-[#F8FAFC] w-full h-full shadow-2xl ring-1 ring-black/10 flex flex-col animate-in slide-in-from-right duration-300 ${layoutModo === 'columnas' ? 'max-w-4xl' : 'max-w-2xl'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-7 pt-6 pb-5 bg-white border-b border-gray-100">
                            <div className="flex justify-between items-center mb-1.5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                        <Package size={19} strokeWidth={2.2} />
                                    </div>
                                    <div>
                                        <h3 className="text-[19px] font-bold text-gray-900 tracking-tight leading-none">
                                            {isEditando ? 'Ajustar Insumo PPTO' : 'Panel de Insumo PPTO'}
                                        </h3>
                                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
                                            {formularioRecurso.nombre_producto ? (
                                                <span className="text-[11px] font-semibold text-gray-700 truncate max-w-[180px]">{formularioRecurso.nombre_producto}</span>
                                            ) : (
                                                <span className="text-[11px] font-medium text-gray-400 italic">Sin insumo seleccionado</span>
                                            )}
                                            {(user as any)?.cargo?.area?.nombre && (
                                                <>
                                                    <span className="text-gray-300 text-[10px]">·</span>
                                                    <span className="text-[10px] font-medium text-gray-400">{(user as any).cargo.area.nombre}</span>
                                                </>
                                            )}
                                            {(user as any)?.rol?.codigo && (
                                                <>
                                                    <span className="text-gray-300 text-[10px]">·</span>
                                                    <span className="text-[10px] font-medium text-primary">{(user as any).rol.codigo}</span>
                                                </>
                                            )}
                                            {(user as any)?.rol?.nombre && (
                                                <>
                                                    <span className="text-gray-300 text-[10px]">·</span>
                                                    <span className="text-[10px] font-medium text-gray-400">{(user as any).rol.nombre}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* Botón de Guía en el panel */}
                                    <button
                                        type="button"
                                        onClick={() => setShowGuiaModal(true)}
                                        title="Guía y explicación de fases"
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-blue-200 hover:border-blue-300 flex items-center justify-center cursor-pointer"
                                    >
                                        <HelpCircle size={16} strokeWidth={2.5} />
                                    </button>
                                    {/* Toggle layout: fases / dos columnas */}
                                    <div className="flex items-center gap-1 bg-gray-100/80 rounded-xl p-1">
                                        <button
                                            type="button"
                                            onClick={() => { setLayoutModo('fases'); setFaseActual(0); }}
                                            title="Por fases"
                                            className={`px-2.5 py-1.5 rounded-lg transition-all text-[10px] font-bold ${layoutModo === 'fases' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            Por fases
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLayoutModo('columnas')}
                                            title="Dos columnas"
                                            className={`p-2 rounded-lg transition-all ${layoutModo === 'columnas' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                                <rect x="1" y="2" width="5" height="10" rx="1" fill="currentColor" />
                                                <rect x="8" y="2" width="5" height="10" rx="1" fill="currentColor" />
                                            </svg>
                                        </button>
                                    </div>
                                    <button onClick={() => setShowRecursoModal(false)} className="p-2.5 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-gray-700">
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Indicador de fases premium */}
                            {layoutModo === 'fases' && (
                                <div className="flex items-center mt-5">
                                    {(esNuevoProducto
                                        ? ['Recurso Nuevo', 'Identificación y Costos', 'PME']
                                        : ['Clasificación', 'Identificación y Costos', 'PME']
                                    ).map((fase, i, arr) => (
                                        <React.Fragment key={i}>
                                            <button type="button" onClick={() => setFaseActual(i)} className="flex items-center gap-2.5 group shrink-0">
                                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all duration-300 ${faseActual === i ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-110' : faseActual > i ? 'bg-primary/15 text-primary' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
                                                    {faseActual > i ? <Check size={15} strokeWidth={3} /> : i + 1}
                                                </span>
                                                <span className={`text-[11px] font-bold transition-colors hidden sm:inline ${faseActual === i ? 'text-gray-900' : faseActual > i ? 'text-primary' : 'text-gray-400'}`}>{fase}</span>
                                            </button>
                                            {i < arr.length - 1 && (
                                                <div className="flex-1 h-[3px] mx-2.5 rounded-full bg-gray-100 overflow-hidden">
                                                    <div className={`h-full rounded-full bg-primary transition-all duration-500 ${faseActual > i ? 'w-full' : 'w-0'}`} />
                                                </div>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}
                        </div>

                        {(() => {
                            // Grupo y categoría son clasificaciones independientes del recurso
                            // (no hay relación directa en el modelo), por eso se muestran todas
                            // las categorías; el grupo solo se elige primero por orden lógico.
                            const categoriasDelGrupo = categorias;

                            // Dimensiones presentes en las actividades PME del colegio (para el filtro).
                            const dimensionesPME = Array.from(
                                new Set(todasActividades.map(a => a.dimension).filter(Boolean) as string[])
                            ).sort((a, b) => a.localeCompare(b));
                            // Actividades filtradas por dimensión + texto de búsqueda.
                            const actividadesPMEFiltradas = todasActividades.filter(a =>
                                (!filtroDimensionPME || a.dimension === filtroDimensionPME) &&
                                (searchPMEModal.length === 0 || searchPMEModal === 'NO_ASOCIADO' || a.nombre.toLowerCase().includes(searchPMEModal.toLowerCase()))
                            );

                            // Selector de cargo solicitante (reutilizable en cont0 y cont1).
                            const renderSubareaSelector = () => {
                                const areaNombre = solicitud?.area_nombre || (user as any)?.cargo?.area?.nombre || '';

                                // Cargos pertenecientes al área de la solicitud
                                const subareasDeArea = todasSubareas.filter(s => {
                                    if (!solicitud?.area_nombre && !(user as any)?.cargo?.area?.nombre) return true;
                                    const nombreAreaSub = s.area?.nombre;
                                    return nombreAreaSub && areaNombre && nombreAreaSub.toLowerCase().trim() === areaNombre.toLowerCase().trim();
                                });

                                const userSubareas: { id_subarea: number; nombre: string }[] =
                                    subareasDeArea.length > 0
                                        ? subareasDeArea
                                        : (user as any)?.cargos?.length > 0
                                            ? (user as any).cargos
                                            : (user as any)?.cargo
                                                ? [(user as any).cargo]
                                                : [];
                                return (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <MapPin size={11} className="text-primary" />
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                {areaNombre ? `${areaNombre} — ` : ''}Cargo solicitante <span className="text-red-500">*</span>
                                            </label>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {userSubareas.map(s => {
                                                const selected = formularioRecurso.id_subarea === s.id_subarea;
                                                return (
                                                    <label
                                                        key={s.id_subarea}
                                                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-all ${selected
                                                            ? 'bg-primary/8 border-primary/40 shadow-sm'
                                                            : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                                                            }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="id_subarea_detalle"
                                                            checked={selected}
                                                            onChange={() => setFormularioRecurso(prev => ({ ...prev, id_subarea: s.id_subarea }))}
                                                            className="w-3.5 h-3.5 text-primary border-gray-300 focus:ring-primary/20"
                                                        />
                                                        <span className={`text-[11px] font-semibold ${selected ? 'text-primary' : 'text-gray-700'}`}>
                                                            {s.nombre}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                            {/* Opción "Otros" (seleccionada por defecto) */}
                                            {(() => {
                                                const esOtros = !formularioRecurso.id_subarea || !userSubareas.some(s => s.id_subarea === formularioRecurso.id_subarea);
                                                return (
                                                    <label
                                                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-all ${esOtros
                                                            ? 'bg-primary/8 border-primary/40 shadow-sm'
                                                            : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                                                            }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="id_subarea_detalle"
                                                            checked={esOtros}
                                                            onChange={() => setFormularioRecurso(prev => ({ ...prev, id_subarea: null }))}
                                                            className="w-3.5 h-3.5 text-primary border-gray-300 focus:ring-primary/20"
                                                        />
                                                        <span className={`text-[11px] font-semibold ${esOtros ? 'text-primary' : 'text-gray-700'}`}>
                                                            {areaNombre || 'General'}
                                                        </span>
                                                    </label>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            };

                            const esContextoPIEMacro = Boolean(
                                (user as any)?.rol?.codigo === 'PIE' ||
                                codigoRol === 'PIE' ||
                                (solicitud?.area_nombre && solicitud.area_nombre.toUpperCase().includes('PIE')) ||
                                ((user as any)?.cargo?.area?.nombre && (user as any).cargo.area.nombre.toUpperCase().includes('PIE')) ||
                                ((user as any)?.area?.nombre && (user as any).area.nombre.toUpperCase().includes('PIE')) ||
                                ((user as any)?.cargo?.nombre && (user as any).cargo.nombre.toUpperCase().includes('PIE')) ||
                                ((user as any)?.cargos?.some((c: any) => c.nombre?.toUpperCase().includes('PIE'))) ||
                                todasSubareas.some(s => {
                                    const nombreAreaSub = s.area?.nombre;
                                    const areaNombre = solicitud?.area_nombre || (user as any)?.cargo?.area?.nombre || (user as any)?.area?.nombre || '';
                                    return (
                                        (nombreAreaSub && areaNombre && nombreAreaSub.toLowerCase().trim() === areaNombre.toLowerCase().trim() && s.nombre.toUpperCase().includes('PIE')) ||
                                        (s.id_subarea === formularioRecurso.id_subarea && s.nombre.toUpperCase().includes('PIE'))
                                    );
                                })
                            );

                            const renderTogglePIE = () => {
                                if (!esContextoPIEMacro) return null;
                                return (
                                    <div className="flex items-center justify-between p-3 bg-purple-50/70 border border-purple-200/80 rounded-2xl transition-all shadow-xs animate-in fade-in duration-200">
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-base leading-none">🟣</span>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs font-bold text-purple-950">Subvención PIE</p>
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold border ${financiarConPIE ? 'bg-purple-200 text-purple-900 border-purple-300' : 'bg-gray-200 text-gray-700 border-gray-300'}`}>
                                                        {financiarConPIE ? 'ACTIVADO' : 'DESACTIVADO'}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-purple-700 leading-tight mt-0.5">
                                                    {financiarConPIE
                                                        ? 'Financiamiento asignado directamente a fondos PIE.'
                                                        : 'Fondos PIE desactivados: se aplicará la subvención según el destino (SEP, General, etc.).'}
                                                </p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                                            <input
                                                type="checkbox"
                                                checked={financiarConPIE}
                                                onChange={(e) => setFinanciarConPIE(e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-10 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                                        </label>
                                    </div>
                                );
                            };

                            /* ── Contenedor 0 (solo "Nuevo Insumo"): Grupo + Categoría + detección de similares ── */
                            const cont0 = (
                                <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-gray-100 space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                        <span className="text-[12px] font-bold text-gray-900 tracking-tight">Clasificación del Recurso Nuevo</span>
                                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[9px] font-bold uppercase tracking-wider border border-amber-200">Sugerido</span>
                                    </div>

                                    {/* Cargo solicitante */}
                                    {renderSubareaSelector()}

                                    {/* Toggle exclusivo para contexto PIE */}
                                    {renderTogglePIE()}

                                    {/* 1. Nombre del Insumo con Autocompletado */}
                                    <div className="space-y-1 relative" ref={insumoDropdownRef}>
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                                                Nombre del Insumo <span className="text-red-500">*</span>
                                            </label>
                                            {buscandoSimilares && (
                                                <span className="flex items-center gap-1 text-[10px] text-primary font-semibold mr-1">
                                                    <Loader2 size={11} className="animate-spin" /> Buscando catálogo...
                                                </span>
                                            )}
                                        </div>

                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={formularioRecurso.nombre_producto}
                                                onFocus={() => setNombreInsumoFocused(true)}
                                                onChange={(e) => {
                                                    setFormularioRecurso(prev => ({ ...prev, nombre_producto: e.target.value }));
                                                    setNombreInsumoFocused(true);
                                                }}
                                                placeholder="Ej: Computador, Silla, Resma, Agua..."
                                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-semibold text-xs text-gray-900 focus:outline-none placeholder:text-gray-400 placeholder:font-medium pr-10"
                                            />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                {buscandoSimilares ? (
                                                    <Loader2 size={16} className="animate-spin text-primary" />
                                                ) : (
                                                    <Search size={16} />
                                                )}
                                            </div>
                                        </div>

                                        <p className="text-[10px] text-gray-400 font-medium ml-1 mt-1">
                                            Usa solo el nombre genérico. Las características (marca, modelo, RAM, color…) van en el Detalle más abajo.
                                        </p>

                                        {/* Dropdown flotante de autocompletado */}
                                        {nombreInsumoFocused && formularioRecurso.nombre_producto.trim().length >= 2 && (
                                            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                                <div className="px-3 py-2 bg-gradient-to-r from-slate-50 to-blue-50/50 border-b border-gray-100 flex items-center justify-between text-[10px] font-bold text-gray-600">
                                                    <span className="flex items-center gap-1.5">
                                                        <span>💡</span> Sugerencias de insumos ({similaresEncontrados.length + insumosSugeridosLocal.length})
                                                    </span>
                                                    <span className="text-[9px] text-gray-400 font-medium">Usa uno para estandarizar</span>
                                                </div>

                                                <div className="divide-y divide-gray-100">
                                                    {/* Insumos del Catálogo Oficial */}
                                                    {similaresEncontrados.map(s => (
                                                        <div
                                                            key={`cat-${s.id_recurso}`}
                                                            onMouseDown={() => {
                                                                setFormularioRecurso(prev => ({
                                                                    ...prev,
                                                                    id_recurso: s.id_recurso,
                                                                    nombre_producto: s.nombre,
                                                                    formato_unidad: s.formato || prev.formato_unidad || 'unidad',
                                                                    recurso_seleccionado: s
                                                                }));
                                                                setEsNuevoProducto(false);
                                                                setNombreInsumoFocused(false);
                                                            }}
                                                            className="p-2.5 hover:bg-blue-50/60 cursor-pointer flex items-center justify-between gap-3 transition-colors group"
                                                        >
                                                            <div className="min-w-0 flex items-center gap-2">
                                                                <span className="w-6 h-6 rounded-lg bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0 text-xs">
                                                                    📦
                                                                </span>
                                                                <div className="truncate">
                                                                    <p className="text-xs font-bold text-gray-900 group-hover:text-primary transition-colors truncate">
                                                                        {s.nombre}
                                                                    </p>
                                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                                        {s.categoria_nombre && (
                                                                            <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-gray-100 text-gray-600">
                                                                                {s.categoria_nombre}
                                                                            </span>
                                                                        )}
                                                                        {s.formato && (
                                                                            <span className="text-[9px] text-gray-400">
                                                                                ({s.formato})
                                                                            </span>
                                                                        )}
                                                                        <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded">
                                                                            Catálogo Oficial
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onMouseDown={(e) => {
                                                                        e.stopPropagation();
                                                                        seleccionarRecurso(s);
                                                                        setFaseActual(0);
                                                                        setNombreInsumoFocused(false);
                                                                    }}
                                                                    className="px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white text-[10px] font-bold transition-all"
                                                                    title="Cargar como ítem oficial del catálogo"
                                                                >
                                                                    Usar del catálogo
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {/* Insumos de la solicitud actual o historial */}
                                                    {insumosSugeridosLocal.map((item, idx) => (
                                                        <div
                                                            key={`local-${idx}`}
                                                            onMouseDown={() => {
                                                                setFormularioRecurso(prev => ({
                                                                    ...prev,
                                                                    nombre_producto: item.nombre,
                                                                    descripcion: prev.descripcion || item.detalle || '',
                                                                    ...(item.id_recurso ? { id_recurso: item.id_recurso } : {}),
                                                                    ...(item.formato ? { formato_unidad: item.formato } : {})
                                                                }));
                                                                if (item.id_recurso) {
                                                                    setEsNuevoProducto(false);
                                                                }
                                                                setNombreInsumoFocused(false);
                                                            }}
                                                            className="p-2.5 hover:bg-emerald-50/50 cursor-pointer flex items-center justify-between gap-3 transition-colors group"
                                                        >
                                                            <div className="min-w-0 flex items-center gap-2">
                                                                <span className="w-6 h-6 rounded-lg bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0 text-xs">
                                                                    📋
                                                                </span>
                                                                <div className="truncate">
                                                                    <p className="text-xs font-bold text-gray-900 group-hover:text-emerald-700 transition-colors truncate">
                                                                        {item.nombre}
                                                                    </p>
                                                                    <span className="text-[9px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded mt-0.5 inline-block">
                                                                        {item.origen}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <span className="text-[10px] text-gray-400 group-hover:text-gray-600 font-medium">
                                                                Usar nombre
                                                            </span>
                                                        </div>
                                                    ))}

                                                    {!buscandoSimilares && similaresEncontrados.length === 0 && insumosSugeridosLocal.length === 0 && (
                                                        <div className="p-3 text-center bg-slate-50/60">
                                                            <p className="text-xs font-medium text-gray-500">
                                                                No hay insumos similares registrados.
                                                            </p>
                                                            <p className="text-[10px] text-primary font-bold mt-0.5">
                                                                Se creará como nuevo insumo personalizado: "{formularioRecurso.nombre_producto}"
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div
                                                    onMouseDown={() => setNombreInsumoFocused(false)}
                                                    className="p-2 bg-gray-50 hover:bg-gray-100 border-t border-gray-100 text-center cursor-pointer transition-colors"
                                                >
                                                    <span className="text-[11px] font-semibold text-gray-600">
                                                        ✍️ Usar <b className="text-gray-900">"{formularioRecurso.nombre_producto}"</b> como nuevo insumo personalizado
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 2. ¿Para quién o para qué se destina este gasto? */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">¿Para quién o para qué se destina este gasto? <span className="text-red-500">*</span></label>
                                                {(() => {
                                                    const subNombre = subvencionesActivas.find(s => s.id_subvencion === formularioRecurso.id_subvencion)?.nombre_corto;
                                                    if (!subNombre) return null;
                                                    return (
                                                        <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[10px] font-extrabold border border-violet-200 shadow-sm animate-in fade-in duration-200">
                                                            Subvención: {subNombre}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowDestinoHelp(!showDestinoHelp)}
                                                className={`px-2.5 py-1 rounded-lg transition-all active:scale-95 flex items-center gap-1 text-[9px] font-bold border ${showDestinoHelp ? 'bg-blue-100 border-blue-200 text-blue-700 shadow-inner' : 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100 hover:text-blue-700 hover:scale-105'}`}
                                            >
                                                <HelpCircle size={11} className={`transition-transform duration-300 ${showDestinoHelp ? 'rotate-180' : ''}`} />
                                                <span>Saber más</span>
                                            </button>
                                        </div>
                                        <select
                                            value={formularioRecurso.destino_gasto}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const matching = mapeosRecurso.filter(m => m.destino_gasto === val);
                                                const subvId = matching.length > 0 ? matching[0].id_subvencion : null;
                                                setFormularioRecurso(prev => ({ ...prev, destino_gasto: val, id_subvencion: subvId, codigo_cuenta: null }));
                                                setSubcatResuelta(null);
                                            }}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-semibold text-xs text-gray-900 focus:outline-none"
                                        >
                                            <option value="">-- Seleccionar Destino --</option>
                                            {Object.entries(DESTINOS_LABELS)
                                                .filter(([key]) => key !== 'otros')
                                                .map(([key, label]) => (
                                                    <option key={key} value={key}>{label}</option>
                                                ))}
                                        </select>


                                        {showDestinoHelp && (
                                            <div className="bg-blue-50/65 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-900 space-y-2 mt-2 animate-in slide-in-from-top-2 duration-200">
                                                <div className="font-bold text-[10px] uppercase tracking-wider text-blue-950 border-b border-blue-100 pb-1 flex items-center gap-1.5">
                                                    <span>💡</span> Guía de Propósitos de Gasto
                                                </div>
                                                <div className="space-y-2 leading-relaxed">
                                                    <div><span className="font-bold text-blue-950">🏫 Estudiantes:</span><span className="text-blue-800"> Materiales educativos, talleres, salidas pedagógicas, actividades deportivas y eventos dirigidos a los estudiantes.</span></div>
                                                    <div><span className="font-bold text-blue-950">🏢 Funcionarios:</span><span className="text-blue-800"> Gastos para el personal del colegio, actividades de funcionarios y material administrativo de oficina.</span></div>
                                                    <div><span className="font-bold text-blue-950">🏆 Actividad (Premio Beneficio):</span><span className="text-blue-800"> Medallas, diplomas, incentivos de logro y beneficios para la comunidad escolar.</span></div>
                                                    <div><span className="font-bold text-blue-950">🔧 Mantención / Servicio:</span><span className="text-blue-800"> Reparaciones, mantenimiento, servicios generales y soporte técnico.</span></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 3. Detalle del Insumo */}
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 mb-1 ml-1">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                                                Detalle del Insumo <span className="text-red-500">*</span>
                                            </label>
                                            <span className="text-gray-300 font-light">|</span>
                                            <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                                                Color, Tamaño, Marca...{' '}
                                                <button type="button" onClick={() => setShowDetalleHelp(!showDetalleHelp)} className="inline font-bold underline underline-offset-2 hover:text-gray-600 transition-colors">
                                                    {showDetalleHelp ? 'ver menos' : 'ver más'}
                                                </button>
                                            </p>
                                        </div>
                                        {showDetalleHelp && (
                                            <p className="text-[10px] text-gray-500 font-medium ml-1 mb-1.5 leading-relaxed animate-in slide-in-from-top-1 duration-150">
                                                Especifica todas las características que permitan identificar exactamente qué se compra: color, talla, marca, modelo, dimensiones, capacidad, material, etc.
                                            </p>
                                        )}
                                        <textarea rows={3} value={formularioRecurso.descripcion} onChange={(e) => setFormularioRecurso({ ...formularioRecurso, descripcion: e.target.value })}
                                            className={`w-full px-4 py-3 rounded-xl transition-all font-medium placeholder:font-medium text-xs resize-none focus:outline-none ${formularioRecurso.descripcion.trim() ? 'bg-white border border-gray-200 hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10' : 'bg-white border-2 border-red-300 hover:border-red-400 focus:border-red-400 focus:ring-4 focus:ring-red-100 placeholder:text-gray-400'}`}
                                            placeholder="Ej: Silla ergonómica negra con ruedas, respaldo alto, altura regulable. Lapicera punta fina azul BIC. Resma papel carta 75g..."
                                        />
                                        {!formularioRecurso.descripcion.trim() && (
                                            <p className="text-[10px] text-red-500 font-medium ml-1 mt-1">Este campo es obligatorio: especifique las características.</p>
                                        )}
                                    </div>

                                    {/* 4. Justificacion / Motivo de Necesidad con Autocompletado */}
                                    <div className="space-y-1.5 relative" ref={motivoDropdownRef}>
                                        <div className="flex items-center justify-between mb-0.5">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                                                Justificación / Motivo de Necesidad <span className="text-red-500">*</span>
                                            </label>
                                            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[9px] font-bold uppercase tracking-wider border border-red-200">Obligatorio</span>
                                        </div>

                                        {/* Accesos rápidos: Top 3 más frecuentes para no saturar con 20 botones */}
                                        {motivosSugeridos.length > 0 && (
                                            <div className="flex items-center gap-1.5 flex-wrap text-[11px] pb-1">
                                                <span className="text-gray-400 font-bold text-[9px] uppercase tracking-wider">Top frecuentes:</span>
                                                {motivosSugeridos.slice(0, 3).map(({ motivo, count }) => {
                                                    const isSelected = formularioRecurso.motivo.trim().toLowerCase() === motivo.toLowerCase();
                                                    return (
                                                        <button
                                                            key={motivo}
                                                            type="button"
                                                            onClick={() => setFormularioRecurso(prev => ({ ...prev, motivo }))}
                                                            className={`px-2.5 py-0.5 rounded-lg text-[10px] font-semibold transition-all border flex items-center gap-1 cursor-pointer ${
                                                                isSelected
                                                                    ? 'bg-primary text-white border-primary shadow-xs'
                                                                    : 'bg-gray-50 hover:bg-primary/5 text-gray-700 border-gray-200 hover:border-primary/40'
                                                            }`}
                                                            title={`Usar "${motivo}"`}
                                                        >
                                                            <span className="truncate max-w-[140px]">{motivo}</span>
                                                            <span className={`text-[9px] px-1 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600 font-bold'}`}>
                                                                {count}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                                {motivosSugeridos.length > 3 && (
                                                    <span className="text-[9px] text-gray-400 font-medium italic">
                                                        +{motivosSugeridos.length - 3} más disponibles en el autocompletado
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        <div className="relative">
                                            <textarea
                                                rows={2}
                                                value={formularioRecurso.motivo}
                                                onFocus={() => setMotivoFocused(true)}
                                                onChange={(e) => {
                                                    setFormularioRecurso({ ...formularioRecurso, motivo: e.target.value });
                                                    setMotivoFocused(true);
                                                }}
                                                className={`w-full px-4 py-2.5 rounded-xl transition-all font-semibold text-xs resize-none text-gray-900 focus:outline-none ${formularioRecurso.motivo.trim() ? 'bg-white border border-gray-200 hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10' : 'bg-white border-2 border-red-300 hover:border-red-400 focus:border-red-400 focus:ring-4 focus:ring-red-100 placeholder:text-gray-400'}`}
                                                placeholder="Escribe el motivo o selecciona uno del autocompletado..."
                                            />
                                            {formularioRecurso.motivo.trim() && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFormularioRecurso(prev => ({ ...prev, motivo: '' }))}
                                                    className="absolute right-2.5 top-2.5 text-gray-300 hover:text-gray-500 text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center hover:bg-gray-100"
                                                    title="Limpiar motivo"
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>

                                        {/* Dropdown flotante de autocompletado para Motivos */}
                                        {motivoFocused && motivosSugeridos.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                                <div className="px-3 py-1.5 bg-slate-50 border-b border-gray-100 flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                                    <span className="flex items-center gap-1">
                                                        <span>📌</span> Motivos registrados ({motivosFiltrados.length})
                                                    </span>
                                                    <span className="text-[9px] text-gray-400 lowercase font-medium">clic para usar</span>
                                                </div>

                                                <div className="divide-y divide-gray-50">
                                                    {motivosFiltrados.length > 0 ? (
                                                        motivosFiltrados.map(({ motivo, count }) => {
                                                            const isMatch = formularioRecurso.motivo.trim().toLowerCase() === motivo.toLowerCase();
                                                            return (
                                                                <div
                                                                    key={motivo}
                                                                    onMouseDown={() => {
                                                                        setFormularioRecurso(prev => ({ ...prev, motivo }));
                                                                        setMotivoFocused(false);
                                                                    }}
                                                                    className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                                                                        isMatch ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-blue-50/60 text-gray-800'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <span className="text-primary text-xs shrink-0">{isMatch ? '✓' : '🏷️'}</span>
                                                                        <span className="text-xs truncate">{motivo}</span>
                                                                    </div>
                                                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                        isMatch ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
                                                                    }`}>
                                                                        {count} {count === 1 ? 'insumo' : 'insumos'}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="p-3 text-center bg-slate-50/50">
                                                            <p className="text-xs font-semibold text-gray-600">
                                                                No hay un motivo previo con "{formularioRecurso.motivo}"
                                                            </p>
                                                            <p className="text-[10px] text-primary font-bold mt-0.5">
                                                                Se guardará como motivo nuevo
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div
                                                    onMouseDown={() => setMotivoFocused(false)}
                                                    className="p-1.5 bg-gray-50 hover:bg-gray-100 border-t border-gray-100 text-center cursor-pointer transition-colors"
                                                >
                                                    <span className="text-[10px] font-semibold text-gray-500">
                                                        Cerrar sugerencias (o haz clic fuera)
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Alerta de sugerencia si escribió algo parecido a un motivo existente */}
                                        {motivoSimilar && !motivoFocused && (
                                            <div className="flex items-center justify-between gap-2 p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] animate-in fade-in duration-150">
                                                <div className="flex items-center gap-1.5 truncate">
                                                    <span className="shrink-0">💡</span>
                                                    <span className="truncate">¿Te refieres a <b>"{motivoSimilar.motivo}"</b> ({motivoSimilar.count} insumos)?</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormularioRecurso(prev => ({ ...prev, motivo: motivoSimilar.motivo }))}
                                                    className="px-2 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold rounded-lg shrink-0 text-[10px] transition-colors cursor-pointer"
                                                >
                                                    Usar este
                                                </button>
                                            </div>
                                        )}

                                        {!formularioRecurso.motivo.trim() && (
                                            <p className="text-[10px] text-red-500 font-medium ml-1 mt-0.5">Este campo es obligatorio: explica por qué se necesita el recurso.</p>
                                        )}
                                    </div>

                                    {/* 5. Aviso: clasificación automática */}
                                    <div className="flex items-start gap-2 text-[10px] text-violet-700 bg-violet-50/80 border border-violet-100 p-2.5 rounded-xl">
                                        <span className="shrink-0">✨</span>
                                        <span className="leading-snug">Se enviará como <b>sugerido</b>. La IA determinará automáticamente su <b>categoría</b> y <b>grupo</b>.</span>
                                    </div>
                                </div>
                            );
                            /* ── Contenedor 1 ── */
                            const cont1 = (
                                <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-gray-100 space-y-4">
                                    <div className="flex items-center pb-3 border-b border-gray-100">
                                        <span className="text-[12px] font-bold text-gray-900 tracking-tight">1. Clasificación Presupuestaria</span>
                                    </div>

                                    {/* Cargo(s) del insumo — en "Nuevo Insumo" va en cont0 */}
                                    {!esNuevoProducto && renderSubareaSelector()}

                                    {/* Toggle exclusivo para contexto PIE */}
                                    {!esNuevoProducto && renderTogglePIE()}

                                    {!esNuevoProducto && (
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">¿Para quién o para qué se destina este gasto? <span className="text-red-500">*</span></label>
                                                    {(() => {
                                                        const subNombre = subvencionesActivas.find(s => s.id_subvencion === formularioRecurso.id_subvencion)?.nombre_corto;
                                                        if (!subNombre) return null;
                                                        return (
                                                            <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[10px] font-extrabold border border-violet-200 shadow-sm animate-in fade-in duration-200">
                                                                Subvención: {subNombre}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowDestinoHelp(!showDestinoHelp)}
                                                    className={`px-2.5 py-1 rounded-lg transition-all active:scale-95 flex items-center gap-1 text-[9px] font-bold border ${showDestinoHelp
                                                        ? 'bg-blue-100 border-blue-200 text-blue-700 shadow-inner'
                                                        : 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100 hover:text-blue-700 hover:scale-105'
                                                        }`}
                                                >
                                                    <HelpCircle size={11} className={`transition-transform duration-300 ${showDestinoHelp ? 'rotate-180' : ''}`} />
                                                    <span>Saber más</span>
                                                </button>
                                            </div>
                                            <select
                                                value={formularioRecurso.destino_gasto}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const matching = mapeosRecurso.filter(m => m.destino_gasto === val);
                                                    const subvId = matching.length > 0 ? matching[0].id_subvencion : null;
                                                    setFormularioRecurso(prev => ({
                                                        ...prev,
                                                        destino_gasto: val,
                                                        id_subvencion: subvId,
                                                        codigo_cuenta: null
                                                    }));
                                                    setSubcatResuelta(null);
                                                }}
                                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-semibold text-xs text-gray-900 focus:outline-none"
                                            >
                                                <option value="">-- Seleccionar Destino --</option>
                                                {Object.entries(DESTINOS_LABELS)
                                                    .sort(([a], [b]) => Number(destinoEsOficial(b)) - Number(destinoEsOficial(a)))
                                                    .map(([key, label]) => {
                                                        const oficial = destinoEsOficial(key);
                                                        return (
                                                            <option
                                                                key={key}
                                                                value={key}
                                                                style={oficial ? { color: '#b45309', backgroundColor: '#fffbeb', fontWeight: 700 } : undefined}
                                                            >
                                                                {oficial ? `⭐ ${label} (oficial)` : label}
                                                            </option>
                                                        );
                                                    })}
                                            </select>
                                            <p className="text-[10px] text-amber-600 font-semibold ml-1 mt-1">
                                                ⭐ Los destinos en naranjo son los oficiales para este insumo.
                                            </p>



                                            {showDestinoHelp && (
                                                <div className="bg-blue-50/65 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-900 space-y-2 mt-2 animate-in slide-in-from-top-2 duration-200">
                                                    <div className="font-bold text-[10px] uppercase tracking-wider text-blue-950 border-b border-blue-100 pb-1 flex items-center gap-1.5">
                                                        <span>💡</span> Guía de Propósitos de Gasto
                                                    </div>
                                                    <div className="space-y-2 leading-relaxed">
                                                        <div>
                                                            <span className="font-bold text-blue-950">🏫 Sala de clases (Alumnos):</span>
                                                            <span className="text-blue-800"> No se limita al aula física. Incluye materiales educativos, talleres, salidas pedagógicas, actividades deportivas, recreación, ceremonias y eventos especiales dirigidos a los niños.</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-blue-950">🏢 Oficina / Adm. (Funcionarios):</span>
                                                            <span className="text-blue-800"> Gastos para el personal del colegio (docentes, asistentes, directivos) y material administrativo de oficina.</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-blue-950">🏆 Premio / Beneficio:</span>
                                                            <span className="text-blue-800"> Medallas, diplomas, incentivos de logro y beneficios directos para los alumnos.</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-blue-950">🔧 Mantención / Servicio:</span>
                                                            <span className="text-blue-800"> Reparaciones, mantenimiento de infraestructura, servicios generales, licencias de software y soporte técnico.</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-blue-950">📦 Otros:</span>
                                                            <span className="text-blue-800"> Gastos generales diversos que no encajen en las clasificaciones anteriores.</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}


                                </div>
                            ); // fin cont1

                            /* ── Contenedor 2 ── */
                            const cont2 = (
                                <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-gray-100 space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                        <span className="text-[12px] font-bold text-gray-900 tracking-tight">2. Identificación, Planificación y Justificación del Insumo</span>
                                        <button type="button" onClick={() => setShowIdentificacionHelp(v => !v)}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-all text-[11px] font-bold border ${showIdentificacionHelp ? 'bg-primary text-white border-primary' : 'bg-white text-gray-400 border-gray-300 hover:border-primary hover:text-primary'}`}>
                                            ?
                                        </button>
                                    </div>
                                    {showIdentificacionHelp && (
                                        <div className="flex items-start gap-2.5 text-[11px] text-gray-500 bg-slate-50 p-3 rounded-xl animate-in slide-in-from-top-1 duration-150">
                                            <span className="text-primary shrink-0 mt-0.5"><HelpCircle size={14} /></span>
                                            <span className="leading-relaxed">Registra las especificaciones técnicas del insumo, su fecha de entrega estimada y justifica su necesidad.</span>
                                        </div>
                                    )}
                                    <div className="space-y-1 relative" ref={insumoDropdownRef2}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                                                    Nombre del Insumo <span className="text-red-500">*</span>
                                                </label>
                                                {formularioRecurso.id_recurso && (
                                                    nombreDesbloqueado ? (
                                                        <span className="text-[10px] font-bold text-amber-700 flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-in fade-in">
                                                            <Unlock size={10} /> Editable
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-medium text-gray-500 flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full">
                                                            <Lock size={10} /> Bloqueado
                                                        </span>
                                                    )
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {formularioRecurso.id_recurso && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setNombreDesbloqueado(prev => !prev)}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shadow-2xs ${
                                                            nombreDesbloqueado
                                                                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                                                                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 hover:scale-102'
                                                        }`}
                                                        title={nombreDesbloqueado ? "Volver a bloquear el campo" : "Desbloquear campo para editar el nombre"}
                                                    >
                                                        {nombreDesbloqueado ? (
                                                            <>
                                                                <Lock size={12} className="text-amber-800" />
                                                                <span>Bloquear nombre</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Unlock size={12} className="text-blue-600" />
                                                                <span>Desbloquear nombre</span>
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                                {buscandoSimilares && (!formularioRecurso.id_recurso || nombreDesbloqueado) && (
                                                    <span className="flex items-center gap-1 text-[10px] text-primary font-semibold mr-1">
                                                        <Loader2 size={11} className="animate-spin" /> Buscando catálogo...
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="relative">
                                            <input
                                                type="text"
                                                disabled={!!formularioRecurso.id_recurso && !nombreDesbloqueado}
                                                value={formularioRecurso.nombre_producto}
                                                onFocus={() => { if (!formularioRecurso.id_recurso || nombreDesbloqueado) setNombreInsumoFocused2(true); }}
                                                onChange={(e) => {
                                                    setFormularioRecurso(prev => ({ ...prev, nombre_producto: e.target.value }));
                                                    if (!formularioRecurso.id_recurso || nombreDesbloqueado) setNombreInsumoFocused2(true);
                                                }}
                                                placeholder="Ej: Computador, Silla, Resma, Teclado..."
                                                className={`w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-semibold placeholder:font-medium text-xs disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${formularioRecurso.id_recurso && !nombreDesbloqueado ? 'pr-32' : 'pr-10'}`}
                                            />
                                            {formularioRecurso.id_recurso && !nombreDesbloqueado ? (
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => setNombreDesbloqueado(true)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 border border-blue-200 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                                                        title="Haz clic para desbloquear este campo y editar el nombre"
                                                    >
                                                        <Unlock size={13} className="text-blue-600" />
                                                        <span>Desbloquear</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                    {buscandoSimilares ? (
                                                        <Loader2 size={16} className="animate-spin text-primary" />
                                                    ) : (
                                                        <Search size={16} />
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Dropdown flotante de autocompletado en cont2 */}
                                        {(!formularioRecurso.id_recurso || nombreDesbloqueado) && nombreInsumoFocused2 && formularioRecurso.nombre_producto.trim().length >= 2 && (
                                            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                                <div className="px-3 py-2 bg-gradient-to-r from-slate-50 to-blue-50/50 border-b border-gray-100 flex items-center justify-between text-[10px] font-bold text-gray-600">
                                                    <span className="flex items-center gap-1.5">
                                                        <span>💡</span> Sugerencias de insumos ({similaresEncontrados.length + insumosSugeridosLocal.length})
                                                    </span>
                                                    <span className="text-[9px] text-gray-400 font-medium">Usa uno para estandarizar</span>
                                                </div>

                                                <div className="divide-y divide-gray-100">
                                                    {/* Insumos del Catálogo Oficial */}
                                                    {similaresEncontrados.map(s => (
                                                        <div
                                                            key={`cat-c2-${s.id_recurso}`}
                                                            onMouseDown={() => {
                                                                setFormularioRecurso(prev => ({
                                                                    ...prev,
                                                                    id_recurso: s.id_recurso,
                                                                    nombre_producto: s.nombre,
                                                                    formato_unidad: s.formato || prev.formato_unidad || 'unidad',
                                                                    recurso_seleccionado: s
                                                                }));
                                                                setEsNuevoProducto(false);
                                                                setNombreInsumoFocused2(false);
                                                            }}
                                                            className="p-2.5 hover:bg-blue-50/60 cursor-pointer flex items-center justify-between gap-3 transition-colors group"
                                                        >
                                                            <div className="min-w-0 flex items-center gap-2">
                                                                <span className="w-6 h-6 rounded-lg bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0 text-xs">
                                                                    📦
                                                                </span>
                                                                <div className="truncate">
                                                                    <p className="text-xs font-bold text-gray-900 group-hover:text-primary transition-colors truncate">
                                                                        {s.nombre}
                                                                    </p>
                                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                                        {s.categoria_nombre && (
                                                                            <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-gray-100 text-gray-600">
                                                                                {s.categoria_nombre}
                                                                            </span>
                                                                        )}
                                                                        {s.formato && (
                                                                            <span className="text-[9px] text-gray-400">
                                                                                ({s.formato})
                                                                            </span>
                                                                        )}
                                                                        <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded">
                                                                            Catálogo Oficial
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onMouseDown={(e) => {
                                                                        e.stopPropagation();
                                                                        seleccionarRecurso(s);
                                                                        setFaseActual(0);
                                                                        setNombreInsumoFocused2(false);
                                                                    }}
                                                                    className="px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white text-[10px] font-bold transition-all"
                                                                    title="Cargar como ítem oficial del catálogo"
                                                                >
                                                                    Usar del catálogo
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {/* Insumos de la solicitud actual o historial */}
                                                    {insumosSugeridosLocal.map((item, idx) => (
                                                        <div
                                                            key={`local-c2-${idx}`}
                                                            onMouseDown={() => {
                                                                setFormularioRecurso(prev => ({
                                                                    ...prev,
                                                                    nombre_producto: item.nombre,
                                                                    descripcion: prev.descripcion || item.detalle || '',
                                                                    ...(item.id_recurso ? { id_recurso: item.id_recurso } : {}),
                                                                    ...(item.formato ? { formato_unidad: item.formato } : {})
                                                                }));
                                                                if (item.id_recurso) {
                                                                    setEsNuevoProducto(false);
                                                                }
                                                                setNombreInsumoFocused2(false);
                                                            }}
                                                            className="p-2.5 hover:bg-emerald-50/50 cursor-pointer flex items-center justify-between gap-3 transition-colors group"
                                                        >
                                                            <div className="min-w-0 flex items-center gap-2">
                                                                <span className="w-6 h-6 rounded-lg bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0 text-xs">
                                                                    📋
                                                                </span>
                                                                <div className="truncate">
                                                                    <p className="text-xs font-bold text-gray-900 group-hover:text-emerald-700 transition-colors truncate">
                                                                        {item.nombre}
                                                                    </p>
                                                                    <span className="text-[9px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded mt-0.5 inline-block">
                                                                        {item.origen}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <span className="text-[10px] text-gray-400 group-hover:text-gray-600 font-medium">
                                                                Usar nombre
                                                            </span>
                                                        </div>
                                                    ))}

                                                    {!buscandoSimilares && similaresEncontrados.length === 0 && insumosSugeridosLocal.length === 0 && (
                                                        <div className="p-3 text-center bg-slate-50/60">
                                                            <p className="text-xs font-medium text-gray-500">
                                                                No hay insumos similares registrados.
                                                            </p>
                                                            <p className="text-[10px] text-primary font-bold mt-0.5">
                                                                Se creará como nuevo insumo: "{formularioRecurso.nombre_producto}"
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div
                                                    onMouseDown={() => setNombreInsumoFocused2(false)}
                                                    className="p-2 bg-gray-50 hover:bg-gray-100 border-t border-gray-100 text-center cursor-pointer transition-colors"
                                                >
                                                    <span className="text-[11px] font-semibold text-gray-600">
                                                        ✍️ Usar <b className="text-gray-900">"{formularioRecurso.nombre_producto}"</b>
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {!esNuevoProducto && (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 mb-1 ml-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                                                    Detalle del Insumo <span className="text-red-500">*</span>
                                                </label>
                                                <span className="text-gray-300 font-light">|</span>
                                                <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                                                    Color, Tamaño, Marca...{' '}
                                                    <button type="button" onClick={() => setShowDetalleHelp(!showDetalleHelp)} className="inline font-bold underline underline-offset-2 hover:text-gray-600 transition-colors">
                                                        {showDetalleHelp ? 'ver menos' : 'ver más'}
                                                    </button>
                                                </p>
                                            </div>
                                            {showDetalleHelp && (
                                                <p className="text-[10px] text-gray-500 font-medium ml-1 mb-1.5 leading-relaxed animate-in slide-in-from-top-1 duration-150">
                                                    Especifica todas las características que permitan identificar exactamente qué se compra: color, talla, marca, modelo, dimensiones, capacidad, material, etc. Mientras más detallado, más fácil es cotizar y aprobar.
                                                </p>
                                            )}
                                            <textarea ref={detalleInsumoRef} rows={3} value={formularioRecurso.descripcion} onChange={(e) => setFormularioRecurso({ ...formularioRecurso, descripcion: e.target.value })}
                                                className={`w-full px-4 py-3 rounded-xl transition-all font-medium placeholder:font-medium text-xs resize-none focus:outline-none ${formularioRecurso.descripcion.trim() ? 'bg-white border border-gray-200 hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10' : 'bg-white border-2 border-red-300 hover:border-red-400 focus:border-red-400 focus:ring-4 focus:ring-red-100 placeholder:text-gray-400'}`}
                                                placeholder="Ej: Silla ergonómica negra con ruedas, respaldo alto, altura regulable. Lapicera punta fina azul BIC. Resma papel carta 75g..."
                                            />
                                            {!formularioRecurso.descripcion.trim() && (
                                                <p className="text-[10px] text-red-500 font-medium ml-1 mt-1">Este campo es obligatorio: especifique las características.</p>
                                            )}
                                        </div>
                                    )}
                                    {!esNuevoProducto && (
                                        <div className="space-y-1.5 relative" ref={motivoDropdownRef2}>
                                        <div className="flex items-center justify-between mb-0.5">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                                                Justificación / Motivo de Necesidad <span className="text-red-500">*</span>
                                            </label>
                                            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[9px] font-bold uppercase tracking-wider border border-red-200">Obligatorio</span>
                                        </div>

                                        {/* Accesos rápidos: Top 3 más frecuentes */}
                                        {motivosSugeridos.length > 0 && (
                                            <div className="flex items-center gap-1.5 flex-wrap text-[11px] pb-1">
                                                <span className="text-gray-400 font-bold text-[9px] uppercase tracking-wider">Top frecuentes:</span>
                                                {motivosSugeridos.slice(0, 3).map(({ motivo, count }) => {
                                                    const isSelected = formularioRecurso.motivo.trim().toLowerCase() === motivo.toLowerCase();
                                                    return (
                                                        <button
                                                            key={motivo}
                                                            type="button"
                                                            onClick={() => setFormularioRecurso(prev => ({ ...prev, motivo }))}
                                                            className={`px-2.5 py-0.5 rounded-lg text-[10px] font-semibold transition-all border flex items-center gap-1 cursor-pointer ${
                                                                isSelected
                                                                    ? 'bg-primary text-white border-primary shadow-xs'
                                                                    : 'bg-gray-50 hover:bg-primary/5 text-gray-700 border-gray-200 hover:border-primary/40'
                                                            }`}
                                                            title={`Usar "${motivo}"`}
                                                        >
                                                            <span className="truncate max-w-[140px]">{motivo}</span>
                                                            <span className={`text-[9px] px-1 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600 font-bold'}`}>
                                                                {count}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                                {motivosSugeridos.length > 3 && (
                                                    <span className="text-[9px] text-gray-400 font-medium italic">
                                                        +{motivosSugeridos.length - 3} más disponibles en el autocompletado
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        <div className="relative">
                                            <textarea
                                                rows={2}
                                                value={formularioRecurso.motivo}
                                                onFocus={() => setMotivoFocused2(true)}
                                                onChange={(e) => {
                                                    setFormularioRecurso({ ...formularioRecurso, motivo: e.target.value });
                                                    setMotivoFocused2(true);
                                                }}
                                                className={`w-full px-4 py-2.5 rounded-xl transition-all font-semibold text-xs resize-none text-gray-900 focus:outline-none ${formularioRecurso.motivo.trim() ? 'bg-white border border-gray-200 hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10' : 'bg-white border-2 border-red-300 hover:border-red-400 focus:border-red-400 focus:ring-4 focus:ring-red-100 placeholder:text-gray-400'}`}
                                                placeholder="Escribe el motivo o selecciona uno del autocompletado..."
                                            />
                                            {formularioRecurso.motivo.trim() && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFormularioRecurso(prev => ({ ...prev, motivo: '' }))}
                                                    className="absolute right-2.5 top-2.5 text-gray-300 hover:text-gray-500 text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center hover:bg-gray-100"
                                                    title="Limpiar motivo"
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>

                                        {/* Dropdown flotante de autocompletado para Motivos */}
                                        {motivoFocused2 && motivosSugeridos.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                                <div className="px-3 py-1.5 bg-slate-50 border-b border-gray-100 flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                                    <span className="flex items-center gap-1">
                                                        <span>📌</span> Motivos registrados ({motivosFiltrados.length})
                                                    </span>
                                                    <span className="text-[9px] text-gray-400 lowercase font-medium">clic para usar</span>
                                                </div>

                                                <div className="divide-y divide-gray-50">
                                                    {motivosFiltrados.length > 0 ? (
                                                        motivosFiltrados.map(({ motivo, count }) => {
                                                            const isMatch = formularioRecurso.motivo.trim().toLowerCase() === motivo.toLowerCase();
                                                            return (
                                                                <div
                                                                    key={motivo}
                                                                    onMouseDown={() => {
                                                                        setFormularioRecurso(prev => ({ ...prev, motivo }));
                                                                        setMotivoFocused2(false);
                                                                    }}
                                                                    className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                                                                        isMatch ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-blue-50/60 text-gray-800'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <span className="text-primary text-xs shrink-0">{isMatch ? '✓' : '🏷️'}</span>
                                                                        <span className="text-xs truncate">{motivo}</span>
                                                                    </div>
                                                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                        isMatch ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
                                                                    }`}>
                                                                        {count} {count === 1 ? 'insumo' : 'insumos'}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="p-3 text-center bg-slate-50/50">
                                                            <p className="text-xs font-semibold text-gray-600">
                                                                No hay un motivo previo con "{formularioRecurso.motivo}"
                                                            </p>
                                                            <p className="text-[10px] text-primary font-bold mt-0.5">
                                                                Se guardará como motivo nuevo
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div
                                                    onMouseDown={() => setMotivoFocused2(false)}
                                                    className="p-1.5 bg-gray-50 hover:bg-gray-100 border-t border-gray-100 text-center cursor-pointer transition-colors"
                                                >
                                                    <span className="text-[10px] font-semibold text-gray-500">
                                                        Cerrar sugerencias (o haz clic fuera)
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Alerta de sugerencia si escribió algo parecido a un motivo existente */}
                                        {motivoSimilar && !motivoFocused2 && (
                                            <div className="flex items-center justify-between gap-2 p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] animate-in fade-in duration-150">
                                                <div className="flex items-center gap-1.5 truncate">
                                                    <span className="shrink-0">💡</span>
                                                    <span className="truncate">¿Te refieres a <b>"{motivoSimilar.motivo}"</b> ({motivoSimilar.count} insumos)?</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormularioRecurso(prev => ({ ...prev, motivo: motivoSimilar.motivo }))}
                                                    className="px-2 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold rounded-lg shrink-0 text-[10px] transition-colors cursor-pointer"
                                                >
                                                    Usar este
                                                </button>
                                            </div>
                                        )}

                                        {!formularioRecurso.motivo.trim() && (
                                            <p className="text-[10px] text-red-500 font-medium ml-1 mt-0.5">Este campo es obligatorio: explica por qué se necesita el recurso.</p>
                                        )}
                                    </div>
                                    )}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Estimación de Fecha</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <select value={formularioRecurso.tipo_fecha} onChange={(e) => setFormularioRecurso({ ...formularioRecurso, tipo_fecha: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-semibold text-xs text-gray-900">
                                                {TIPOS_FECHA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                            </select>
                                            {formularioRecurso.tipo_fecha === 'fecha_especifica' ? (
                                                <div className="flex items-center gap-1">
                                                    <input type="date" value={formularioRecurso.fecha_ejecucion} onChange={(e) => setFormularioRecurso({ ...formularioRecurso, fecha_ejecucion: e.target.value })} className="w-full px-2 py-3 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/10 font-bold text-[9px] text-gray-950" />
                                                    <span className="text-gray-400 font-bold">-</span>
                                                    <input type="date" value={formularioRecurso.fecha_termino} onChange={(e) => setFormularioRecurso({ ...formularioRecurso, fecha_termino: e.target.value })} className="w-full px-2 py-3 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/10 font-bold text-[9px] text-gray-950" />
                                                </div>
                                            ) : formularioRecurso.tipo_fecha === 'anual' ? (
                                                <div className="w-full px-4 py-3 bg-white border border-gray-200 text-gray-400 rounded-xl font-semibold flex items-center justify-center text-[10px]">Todo el año</div>
                                            ) : (
                                                <select value={formularioRecurso.mes_ejecucion} onChange={(e) => setFormularioRecurso({ ...formularioRecurso, mes_ejecucion: e.target.value })} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-primary/10 font-semibold text-xs text-gray-950">
                                                    {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                    {/* Costos y Cantidades */}
                                    <div className="border-t border-gray-100 pt-4 space-y-3">
                                        <div className="flex items-center justify-between pb-0.5">
                                            <span className="text-[12px] font-bold text-gray-900 tracking-tight">Costos y Cantidades</span>
                                            <button type="button" onClick={() => setShowCostosHelp(v => !v)}
                                                className={`w-5 h-5 rounded-full flex items-center justify-center transition-all text-[10px] font-bold border ${showCostosHelp ? 'bg-primary text-white border-primary' : 'bg-white text-gray-400 border-gray-300 hover:border-primary hover:text-primary'}`}
                                                title="Ayuda sobre Costos y Cantidades">
                                                ?
                                            </button>
                                        </div>
                                        {showCostosHelp && (
                                            <div className="flex items-start gap-2.5 text-[11px] text-gray-500 bg-slate-50 p-3 rounded-xl animate-in slide-in-from-top-1 duration-150">
                                                <span className="text-primary shrink-0 mt-0.5"><HelpCircle size={14} /></span>
                                                <span className="leading-relaxed">Especifica la cantidad requerida, formato de empaque y precio unitario estimado (debe incluir IVA).</span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className={`space-y-1 ${formatoEsOtros ? 'col-span-2' : ''}`}>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Formato</label>
                                                <div className="flex gap-2">
                                                    <select value={formatoEsOtros ? 'otros' : formularioRecurso.formato_unidad}
                                                        onChange={(e) => { if (e.target.value === 'otros') { setFormatoEsOtros(true); setFormularioRecurso(prev => ({ ...prev, formato_unidad: '' })); } else { setFormatoEsOtros(false); setFormularioRecurso(prev => ({ ...prev, formato_unidad: e.target.value })); } }}
                                                        className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-semibold text-[12px] text-gray-900">
                                                        {FORMATOS_UNIDAD.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                                    </select>
                                                    {formatoEsOtros && (
                                                        <input type="text" autoFocus placeholder="Especificar..." value={formularioRecurso.formato_unidad}
                                                            onChange={(e) => setFormularioRecurso(prev => ({ ...prev, formato_unidad: e.target.value }))}
                                                            className="w-full px-3.5 py-3 bg-white border-2 border-blue-400 rounded-xl focus:ring-4 focus:ring-blue-100 focus:outline-none font-semibold text-[12px] text-gray-900 placeholder:text-blue-400/70"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Cantidad</label>
                                                <input type="number" min="1"
                                                    value={formularioRecurso.cantidad === 0 ? '' : formularioRecurso.cantidad}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/^0+(?=\d)/, '');
                                                        setFormularioRecurso({ ...formularioRecurso, cantidad: val === '' ? 0 : parseInt(val) || 0 });
                                                    }}
                                                    className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-bold text-center text-[12px] text-gray-900"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">V. Unitario c/iva</label>
                                                <input type="number" min="0"
                                                    value={formularioRecurso.valor_unitario_iva === 0 ? '' : formularioRecurso.valor_unitario_iva}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/^0+(?=\d)/, '');
                                                        setFormularioRecurso({ ...formularioRecurso, valor_unitario_iva: val === '' ? 0 : parseInt(val) || 0 });
                                                    }}
                                                    className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-bold text-primary text-[12px]"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-br from-primary to-primary/80 text-white rounded-2xl shadow-lg shadow-primary/25">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                                                    <Package size={17} strokeWidth={2.2} />
                                                </div>
                                                <span className="text-[11px] font-bold uppercase tracking-widest text-white/80">Total Insumo</span>
                                            </div>
                                            <span className="text-2xl font-extrabold tracking-tight tabular-nums transition-all duration-300">{formatCLP(formularioRecurso.cantidad * formularioRecurso.valor_unitario_iva)}</span>
                                        </div>
                                    </div>
                                </div>
                            ); // fin cont2

                            /* ── Contenedor 3 ── */
                            const cont3 = (
                                <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-gray-100 space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[12px] font-bold text-gray-900 tracking-tight">3. Vinculación Plan PME</span>
                                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[9px] font-bold uppercase tracking-wider border border-gray-200">Opcional</span>
                                        </div>
                                        <button type="button" onClick={() => setShowPMEHelp(v => !v)}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-all text-[11px] font-bold border ${showPMEHelp ? 'bg-primary text-white border-primary' : 'bg-white text-gray-400 border-gray-300 hover:border-primary hover:text-primary'}`}>
                                            ?
                                        </button>
                                    </div>
                                    {showPMEHelp && (
                                        <div className="flex items-start gap-2.5 text-[11px] text-gray-500 bg-slate-50 p-3 rounded-xl animate-in slide-in-from-top-1 duration-150">
                                            <span className="text-primary shrink-0 mt-0.5"><HelpCircle size={14} /></span>
                                            <span className="leading-relaxed">Vincule este gasto con una actividad específica de su Plan de Mejoramiento Educativo (PME).</span>
                                        </div>
                                    )}
                                    <div className="space-y-2 relative">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                                <span>🏫</span> PME Colegio: <span className="text-primary font-extrabold">{todasActividades[0]?.colegio_nombre || (user as any)?.colegio?.nombre || 'Colegio'}</span> {todasActividades[0]?.ano_pme ? `(${todasActividades[0]?.ano_pme})` : ''}
                                            </label>
                                        </div>

                                        {/* Card de confirmación cuando hay actividad seleccionada */}
                                        {formularioRecurso.id_actividad && searchPMEModal !== 'NO_ASOCIADO' ? (
                                            <div className="flex items-start gap-3 p-3.5 bg-primary/5 border border-primary/20 rounded-xl animate-in fade-in duration-200">
                                                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                                                    <Check size={14} className="text-primary" strokeWidth={3} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[12px] font-bold text-gray-900 leading-snug">{formularioRecurso.actividad_seleccionada?.nombre}</p>
                                                    {formularioRecurso.actividad_seleccionada?.dimension && (
                                                        <p className="text-[10px] text-gray-400 font-medium mt-0.5 uppercase tracking-wide">Dimensión: {formularioRecurso.actividad_seleccionada.dimension}</p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => { setFormularioRecurso({ ...formularioRecurso, id_actividad: null, actividad_seleccionada: null }); setSearchPMEModal(''); }}
                                                    className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                                    title="Desvincular actividad"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : searchPMEModal !== 'NO_ASOCIADO' ? (
                                            /* Selección de Dimensión + Actividades */
                                            <div className="space-y-4">
                                                {/* Sugerencias basadas en actividades PME históricas aprobadas para este insumo (sin dar clic en asesorar) */}
                                                {(() => {
                                                    if (cargandoSugeridasRecurso && sugerenciasActividadCombinadas.length === 0) {
                                                        return (
                                                            <div className="flex items-center gap-2 px-1 text-[11px] font-semibold text-gray-400">
                                                                <Loader2 size={13} className="animate-spin" /> Buscando actividades PME asociadas a este insumo...
                                                            </div>
                                                        );
                                                    }
                                                    if (sugerenciasActividadCombinadas.length === 0) return null;

                                                    const listaActividadesPrevias = sugerenciasActividadCombinadas.map(s => ({
                                                        id_actividad: s.id_actividad,
                                                        nombre_actividad: s.nombre_actividad,
                                                        dimension: s.dimension || '',
                                                        count: s.veces_usado,
                                                        ultimoMotivo: s.ultimo_motivo || '',
                                                        origen: s.origen,
                                                        sugerencia: s
                                                    }));

                                                    return (
                                                        <div className="p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-2xl space-y-2.5 animate-in fade-in duration-200 shadow-sm">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[11px] font-extrabold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                                                                    <span>💡</span> Actividades PME asociadas a "{formularioRecurso.nombre_producto}":
                                                                </span>
                                                                <span className="text-[9px] font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-200">
                                                                    Selección rápida
                                                                </span>
                                                            </div>
                                                            <div className="space-y-2">
                                                                {listaActividadesPrevias.map((item, idx) => {
                                                                    const isSelected = formularioRecurso.id_actividad === item.id_actividad;
                                                                    return (
                                                                        <div
                                                                            key={idx}
                                                                            onClick={() => usarActividadSugerida(item.sugerencia)}
                                                                            className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 group active:scale-98 ${isSelected ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400/30' : 'bg-white hover:bg-amber-100/60 border-amber-200/60 hover:border-amber-300'}`}
                                                                        >
                                                                            <div className="space-y-0.5 min-w-0 flex-1">
                                                                                <p className="font-extrabold text-amber-950 text-xs leading-snug group-hover:text-amber-700 transition-colors">
                                                                                    📌 {item.nombre_actividad}
                                                                                </p>
                                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                                    {item.dimension && (
                                                                                        <span className="inline-block text-[9px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded uppercase">
                                                                                            {item.dimension}
                                                                                        </span>
                                                                                    )}
                                                                                    <span className="inline-block text-[9px] font-bold text-amber-700/90 bg-white border border-amber-200 px-2 py-0.5 rounded uppercase">
                                                                                        {item.origen === 'solicitud_actual'
                                                                                            ? 'Ya usada en esta solicitud'
                                                                                            : item.origen === 'historial'
                                                                                                ? `Usada ${item.count} ${item.count === 1 ? 'vez' : 'veces'} en solicitudes`
                                                                                                : 'Declarada en el Plan PME'}
                                                                                    </span>
                                                                                </div>
                                                                                {item.ultimoMotivo && (
                                                                                    <p className="text-[10px] text-gray-500 italic line-clamp-1 mt-0.5">
                                                                                        Motivo guardado: "{item.ultimoMotivo}"
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all ${isSelected ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800 group-hover:bg-amber-700 group-hover:text-white'}`}
                                                                            >
                                                                                {isSelected ? '✓ Seleccionado' : 'Usar esta'}
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                                {/* Encabezado y tarjetas con concepto de las 4 Dimensiones PME */}
                                                <div>
                                                    <div className="flex items-center justify-between gap-2 mb-2">
                                                        <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider ml-0.5">
                                                            1. Selecciona la Dimensión PME del Insumo:
                                                        </label>
                                                        {puedeVerBotonIA && (
                                                            <button
                                                                type="button"
                                                                disabled={!filtroDimensionPME || asesoriaPmeLoading}
                                                                onClick={ejecutarAsesoriaPmeIA}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl text-[11px] font-bold transition-all shadow-sm active:scale-95 disabled:cursor-not-allowed shrink-0"
                                                                title={!filtroDimensionPME ? "Selecciona una dimensión para asesorar con IA" : "Pedir recomendaciones a la IA"}
                                                            >
                                                                {asesoriaPmeLoading ? <Loader2 size={13} className="animate-spin" /> : <span>✨</span>}
                                                                {asesoriaPmeLoading ? 'Analizando con IA...' : 'Asesorar Actividad (IA)'}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Grid 2x2 de las 4 Dimensiones PME con sus descripciones normativas */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                        {[
                                                            {
                                                                nombre: 'Gestión Pedagógica',
                                                                icono: '📚',
                                                                desc: 'Enseñanza-aprendizaje, evaluación, desarrollo curricular o labor docente en aula (ej. proyectores, licencias, impresoras UTP, libros).'
                                                            },
                                                            {
                                                                nombre: 'Convivencia Escolar',
                                                                icono: '🤝',
                                                                desc: 'Bienestar socioemocional, inclusión, clima escolar o vinculación comunitaria (ej. premios convivencia, eventos, talleres padres).'
                                                            },
                                                            {
                                                                nombre: 'Liderazgo',
                                                                icono: '🎯',
                                                                desc: 'Planificación estratégica, monitoreo institucional o capacitación de equipos directivos/técnicos.'
                                                            },
                                                            {
                                                                nombre: 'Gestión de Recursos',
                                                                icono: '🏢',
                                                                desc: 'Infraestructura, equipamiento general, insumos administrativos globales o personal operativo.'
                                                            }
                                                        ].map(dim => {
                                                            const isSelected = filtroDimensionPME === dim.nombre;
                                                            const infoBd = dimensionesInfoBD.find(d => d.nombre === dim.nombre);
                                                            return (
                                                                <div
                                                                    key={dim.nombre}
                                                                    onClick={() => {
                                                                        setFiltroDimensionPME(isSelected ? '' : dim.nombre);
                                                                        setSugerenciasPmeIA(null);
                                                                        setShowPMEResults(true);
                                                                    }}
                                                                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${isSelected ? 'bg-primary/5 border-primary ring-2 ring-primary/20 shadow-sm' : 'bg-gray-50/70 border-gray-200 hover:border-gray-300 hover:bg-white'}`}
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                                                            <span>{dim.icono}</span>
                                                                            {dim.nombre}
                                                                        </span>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (infoBd) {
                                                                                        setDimensionHelpModal(infoBd);
                                                                                    } else {
                                                                                        setDimensionHelpModal({
                                                                                            nombre: dim.nombre,
                                                                                            icono: dim.icono,
                                                                                            descripcion: dim.desc,
                                                                                            enfoque_principal: 'Comunidad escolar y equipos de trabajo.',
                                                                                            ejemplos_insumos: dim.desc
                                                                                        });
                                                                                    }
                                                                                }}
                                                                                className="w-5 h-5 rounded-full bg-blue-100 hover:bg-blue-600 text-blue-700 hover:text-white flex items-center justify-center text-[10px] font-black transition-all shadow-sm active:scale-95"
                                                                                title={`Ver guía normativa y ejemplos de ${dim.nombre}`}
                                                                            >
                                                                                ?
                                                                            </button>
                                                                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white'}`}>
                                                                                {isSelected && <Check size={10} strokeWidth={3} />}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <p className="text-[10px] text-gray-500 font-medium leading-relaxed">
                                                                        {dim.desc}
                                                                    </p>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Selector de Actividades de la Dimensión Seleccionada */}
                                                <div className="space-y-1.5 pt-1">
                                                    <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider ml-0.5">
                                                        2. Actividad PME de esta Dimensión:
                                                    </label>

                                                    <div className="relative">
                                                        <select
                                                            disabled={!filtroDimensionPME}
                                                            value={formularioRecurso.id_actividad || ''}
                                                            onChange={(e) => {
                                                                const actId = e.target.value ? parseInt(e.target.value) : null;
                                                                if (actId) {
                                                                    const matched = todasActividades.find(a => a.id === actId);
                                                                    setFormularioRecurso({ ...formularioRecurso, id_actividad: actId, actividad_seleccionada: matched || null });
                                                                    setSearchPMEModal(matched?.nombre || '');
                                                                } else {
                                                                    setFormularioRecurso({ ...formularioRecurso, id_actividad: null, actividad_seleccionada: null });
                                                                    setSearchPMEModal('');
                                                                }
                                                            }}
                                                            className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-semibold text-[12px] text-gray-800 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 cursor-pointer"
                                                        >
                                                            <option value="">
                                                                {!filtroDimensionPME ? '← Primero selecciona una dimensión arriba' : `-- Seleccionar actividad de ${filtroDimensionPME} --`}
                                                            </option>
                                                            {actividadesEncontradas.map(act => (
                                                                <option key={act.id} value={act.id}>
                                                                    {act.nombre}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Tarjetas de Sugerencia IA */}
                                                {sugerenciasPmeIA && sugerenciasPmeIA.sugerencias.length > 0 && (
                                                    <div className="p-3.5 bg-violet-50/70 border border-violet-200/80 rounded-2xl space-y-2.5 animate-in fade-in duration-200">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-extrabold text-violet-900 uppercase tracking-widest flex items-center gap-1">
                                                                ✨ Recomendaciones IA para {filtroDimensionPME} ({sugerenciasPmeIA.modelo || 'gemini-3.1-flash-lite'})
                                                            </span>
                                                            <button type="button" onClick={() => setSugerenciasPmeIA(null)} className="text-violet-400 hover:text-violet-700">
                                                                <X size={14} />
                                                            </button>
                                                        </div>

                                                        <div className="space-y-2">
                                                            {sugerenciasPmeIA.sugerencias.map((sug) => {
                                                                const matchedAct = todasActividades.find(a => a.id === sug.id_actividad);
                                                                return (
                                                                    <div
                                                                        key={sug.id_actividad}
                                                                        onClick={() => {
                                                                            if (matchedAct) {
                                                                                setFormularioRecurso({ ...formularioRecurso, id_actividad: matchedAct.id, actividad_seleccionada: matchedAct });
                                                                                setSearchPMEModal(matchedAct.nombre);
                                                                                setShowPMEResults(false);
                                                                            }
                                                                        }}
                                                                        className="p-3 bg-white hover:bg-violet-100/50 border border-violet-100 rounded-xl cursor-pointer transition-all hover:shadow-sm space-y-1 group"
                                                                    >
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <p className="text-[12px] font-bold text-gray-900 group-hover:text-violet-900 transition-colors leading-snug">{sug.nombre_actividad}</p>
                                                                            <span className="shrink-0 px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-black">
                                                                                {sug.match_score}% coincidencia
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-[11px] text-gray-500 font-medium leading-relaxed">{sug.justificacion}</p>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {sugerenciasPmeIA && sugerenciasPmeIA.no_asociado_pme && sugerenciasPmeIA.sugerencias.length === 0 && (
                                                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-900 font-semibold leading-relaxed">
                                                        ⚠️ {sugerenciasPmeIA.motivo || "El recurso no presenta coincidencia pedagógica con las actividades de esta dimensión. Se clasificó como 'Otros gastos — no asociado a PME'."}
                                                    </div>
                                                )}

                                            </div>
                                        ) : null}

                                        <label className="flex items-center gap-2.5 mt-1 ml-0.5 cursor-pointer group">
                                            <input type="checkbox" checked={!formularioRecurso.id_actividad && searchPMEModal === 'NO_ASOCIADO'}
                                                onChange={(e) => { if (e.target.checked) { setFormularioRecurso({ ...formularioRecurso, id_actividad: null, actividad_seleccionada: null }); setSearchPMEModal('NO_ASOCIADO'); setShowPMEResults(false); } else { setSearchPMEModal(''); } }}
                                                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary/20 transition-all"
                                            />
                                            <span className="text-[11px] font-medium text-gray-500 group-hover:text-gray-700 transition-colors">Otros gastos — no asociado a PME</span>
                                        </label>
                                    </div>
                                </div>
                            ); // fin cont3

                            /* ── Render según modo ── */
                            // Secuencia de fases: con producto nuevo se antepone cont0.
                            // En "Nuevo Insumo" se omite la fase "1. Clasificación Presupuestaria" (cont1).
                            const fasesOrdenadas = esNuevoProducto ? [cont0, cont2, cont3] : [cont1, cont2, cont3];

                            if (layoutModo === 'columnas') return (
                                <div className="px-7 py-6 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-5 items-start">
                                    <div className="space-y-5">{esNuevoProducto ? cont0 : cont1}{cont3}</div>
                                    <div>{cont2}</div>
                                </div>
                            );

                            return (
                                <div className="px-7 py-6 overflow-y-auto custom-scrollbar space-y-5 flex-1">
                                    {toastAgregadoContinuo && (
                                        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                                            <div className="flex items-center gap-2">
                                                <span className="text-base">✅</span>
                                                <span>{toastAgregadoContinuo}</span>
                                            </div>
                                            <button type="button" onClick={() => setToastAgregadoContinuo(null)} className="text-emerald-600 hover:text-emerald-800 cursor-pointer p-0.5">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    )}
                                    {fasesOrdenadas[faseActual]}
                                </div>
                            );
                        })()}

                        <div className="px-7 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-white shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowRecursoModal(false)}
                                className="px-5 py-3 rounded-xl font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all text-[13px]"
                            >
                                Cancelar
                            </button>

                            <div className="flex items-center gap-2">
                                {layoutModo === 'fases' && faseActual > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setFaseActual(f => Math.max(0, f - 1))}
                                        className="px-5 py-3 rounded-xl bg-white border border-gray-200 text-[13px] font-bold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center gap-1.5"
                                    >
                                        <ChevronLeft size={16} strokeWidth={2.5} /> Anterior
                                    </button>
                                )}

                                {layoutModo === 'fases' && faseActual < (esNuevoProducto ? 2 : 2) ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (esNuevoProducto && faseActual === 0) {
                                                const faltan = getCamposFaltantes().filter(c => c !== 'Categoría del recurso');
                                                if (faltan.length > 0) { setCamposFaltantes(faltan); return; }
                                            }
                                            setFaseActual(f => Math.min(2, f + 1));
                                        }}
                                        className="px-6 py-3 rounded-xl bg-primary text-white text-[13px] font-bold hover:brightness-105 active:scale-[0.98] transition-all shadow-lg shadow-primary/30 flex items-center gap-1.5"
                                    >
                                        Siguiente <ChevronRight size={16} strokeWidth={2.5} />
                                    </button>
                                ) : (
                                    <>
                                        {!isEditando && (
                                            <button
                                                type="button"
                                                disabled={loadingSubcat || clasificandoNuevo}
                                                onClick={() => {
                                                    const faltan = getCamposFaltantes();
                                                    if (faltan.length > 0) { setCamposFaltantes(faltan); return; }
                                                    agregarRecursoYContinuar();
                                                }}
                                                className="px-5 py-3 bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 rounded-xl font-bold transition-all text-[13px] flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                                                title="Guarda este insumo y conserva el Motivo, Fecha y Actividad para ingresar el siguiente inmediatamente"
                                            >
                                                <Plus size={16} strokeWidth={2.5} />
                                                Guardar y agregar otro
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            disabled={loadingSubcat || clasificandoNuevo}
                                            onClick={() => {
                                                const faltan = getCamposFaltantes();
                                                if (faltan.length > 0) { setCamposFaltantes(faltan); return; }
                                                (isEditando ? actualizarRecurso : agregarRecurso)();
                                            }}
                                            className="px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:brightness-105 active:scale-[0.98] transition-all text-[13px] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
                                        >
                                            {(loadingSubcat || clasificandoNuevo) ? <Loader2 size={16} className="animate-spin" /> : (isEditando ? <Check size={16} strokeWidth={2.5} /> : <Check size={16} strokeWidth={2.5} />)}
                                            {clasificandoNuevo ? 'Clasificando con IA...' : (isEditando ? 'Actualizar' : 'Añadir y Cerrar')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal asesoría IA categoría */}
            {asesoriaCategoria && (asesoriaCategoria.recomendaciones.length > 0 || asesoriaCategoria.grupo) && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-6 animate-in fade-in duration-150">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl flex flex-col animate-in zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 text-base">✨</div>
                                <div>
                                    <p className="text-[13px] font-bold text-gray-900">Asesoría de Categoría</p>
                                    <p className="text-[10px] text-violet-500 font-semibold">{asesoriaCategoria.proveedor} · {asesoriaCategoria.modelo.split('/').pop()?.split(':')[0]}</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setAsesoriaCategoria(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-gray-700">
                                <X size={15} />
                            </button>
                        </div>
                        {/* Body */}
                        <div className="px-6 py-5 space-y-4">
                            <p className="text-[11px] text-gray-500 font-medium">
                                La IA analizó el insumo. Aplicamos la mejor categoría y grupo (marcados en verde). Puedes cambiar la categoría aquí abajo.
                            </p>
                            {asesoriaCategoria.recomendaciones.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Categorías recomendadas</p>
                                    <ul className="space-y-2.5">
                                        {asesoriaCategoria.recomendaciones.map((rec, i) => {
                                            const esActual = catSugeridaIA === rec.id_cat_recurso && categoriaSeleccionadaNuevo === rec.id_cat_recurso;
                                            return (
                                                <li key={rec.id_cat_recurso} className={`flex items-start gap-3 rounded-2xl px-4 py-3 border ${esActual ? 'bg-green-50 border-green-200' : 'bg-violet-50/60 border-violet-100'}`}>
                                                    <span className={`shrink-0 w-6 h-6 rounded-full text-white text-[10px] font-black flex items-center justify-center mt-0.5 ${esActual ? 'bg-green-600' : 'bg-violet-600'}`}>{i + 1}</span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[13px] font-bold text-gray-800">{rec.nombre}</p>
                                                        <p className="text-[11px] text-gray-500 font-medium leading-relaxed mt-0.5">{rec.razon}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setCategoriaSeleccionadaNuevo(rec.id_cat_recurso);
                                                            setCatNuevoSearch(rec.nombre);
                                                            setCatSugeridaIA(rec.id_cat_recurso);
                                                        }}
                                                        className={`shrink-0 px-3 py-1.5 rounded-xl text-white text-[11px] font-bold transition-all active:scale-95 self-center ${esActual ? 'bg-green-600 hover:bg-green-700' : 'bg-violet-600 hover:bg-violet-700'}`}
                                                    >
                                                        {esActual ? '✓ Usada' : 'Usar'}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}
                            {asesoriaCategoria.grupo && (
                                <div className="space-y-2">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Grupo de recurso recomendado</p>
                                    <div className="flex items-start gap-3 rounded-2xl px-4 py-3 border bg-green-50 border-green-200">
                                        <span className="shrink-0 w-6 h-6 rounded-full bg-green-600 text-white text-[11px] flex items-center justify-center mt-0.5">✨</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] font-bold text-gray-800">{asesoriaCategoria.grupo.nombre}</p>
                                            <p className="text-[11px] text-gray-500 font-medium leading-relaxed mt-0.5">{asesoriaCategoria.grupo.razon}</p>
                                        </div>
                                        <span className="shrink-0 px-2.5 py-1 rounded-xl bg-green-600 text-white text-[11px] font-bold self-center">Aplicado</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Footer */}
                        <div className="px-6 pb-5 flex justify-end">
                            <button type="button" onClick={() => setAsesoriaCategoria(null)}
                                className="px-6 py-2.5 rounded-xl bg-violet-600 text-white text-[13px] font-bold hover:bg-violet-700 transition-all active:scale-95">
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de validación: campos obligatorios faltantes */}
            {camposFaltantes && camposFaltantes.length > 0 && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[210] p-6 animate-in fade-in duration-150">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl flex flex-col animate-in zoom-in-95 duration-150">
                        <div className="px-6 pt-6 pb-4 flex items-center gap-3 border-b border-gray-100">
                            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                                <AlertCircle size={18} />
                            </div>
                            <div>
                                <p className="text-[14px] font-bold text-gray-900">Faltan campos obligatorios</p>
                                <p className="text-[11px] text-gray-400 font-medium">Completa lo siguiente para continuar.</p>
                            </div>
                        </div>
                        <div className="px-6 py-5">
                            <ul className="space-y-2">
                                {camposFaltantes.map((c, i) => (
                                    <li key={i} className="flex items-center gap-2.5 text-[13px] font-semibold text-gray-700 bg-red-50/60 border border-red-100 rounded-xl px-3 py-2.5">
                                        <span className="text-red-500 font-black">*</span>
                                        {c}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="px-6 pb-5 flex justify-end">
                            <button type="button" onClick={() => setCamposFaltantes(null)}
                                className="px-6 py-2.5 rounded-xl bg-primary text-white text-[13px] font-bold hover:brightness-105 active:scale-95 transition-all">
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal informativo: Clasificación Presupuestaria */}
            {showClasificacionInfo && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[130] p-6 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[28px] max-w-md w-full shadow-2xl flex flex-col animate-in zoom-in-95">
                        <div className="p-6 pb-3 flex justify-between items-start">
                            <div>
                                <h3 className="text-base font-bold text-gray-900">Clasificación Presupuestaria</h3>
                                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mt-0.5">¿Para qué sirve este campo?</p>
                            </div>
                            <button onClick={() => setShowClasificacionInfo(false)} className="p-2 hover:bg-gray-50 rounded-xl transition-all text-gray-400">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="px-6 pb-6 space-y-3">
                            <p className="text-[11px] text-gray-600 leading-relaxed">
                                Este campo determina cómo se clasifica contablemente el gasto. Cada destino tiene un <span className="font-bold text-gray-800">código contable distinto</span> según la normativa vigente, lo que afecta directamente cómo se reporta el uso de los fondos.
                            </p>
                            <div className="space-y-2">
                                {[
                                    { icon: '🏫', label: 'Sala de clases (Alumnos)', desc: 'Materiales, talleres, salidas pedagógicas y actividades dirigidas a los alumnos.' },
                                    { icon: '🏢', label: 'Oficina / Administración', desc: 'Insumos para el personal y material administrativo de la institución.' },
                                    { icon: '🏆', label: 'Premio / Beneficio', desc: 'Incentivos, diplomas, beneficios directos y apoyo social a estudiantes.' },
                                    { icon: '🔧', label: 'Mantención / Servicio', desc: 'Reparaciones, infraestructura, licencias de software y soporte técnico.' },
                                    { icon: '📦', label: 'Otros', desc: 'Gastos que no encajan en las categorías anteriores. Requiere indicar la categoría del recurso.' },
                                ].map(d => (
                                    <div key={d.label} className="flex items-start gap-2.5 bg-gray-50 rounded-xl p-3 border border-gray-100">
                                        <span className="text-base shrink-0">{d.icon}</span>
                                        <div>
                                            <p className="text-[11px] font-bold text-gray-800">{d.label}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{d.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => setShowClasificacionInfo(false)}
                                className="w-full py-3 bg-primary text-white rounded-xl font-bold text-xs active:scale-95 transition-all shadow-lg shadow-primary/20 mt-1"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Sugerencia de Nuevo Recurso */}
            {showSugerirModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[120] p-6 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[32px] max-w-md w-full overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95">
                        <div className="p-6 pb-4 bg-gray-50/50 border-b border-gray-100">
                            <div className="flex justify-between items-center mb-1">
                                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Solicitar Nuevo Recurso</h3>
                                <button onClick={() => setShowSugerirModal(false)} className="p-2 hover:bg-white rounded-xl transition-all text-gray-400 border border-transparent hover:border-gray-200">
                                    <X size={18} />
                                </button>
                            </div>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">El recurso se guardará temporalmente hasta ser clasificado</p>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nombre del Recurso</label>
                                <input
                                    type="text"
                                    value={sugerirForm.nombre}
                                    onChange={(e) => setSugerirForm({ ...sugerirForm, nombre: e.target.value })}
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-primary/10 transition-all font-semibold text-xs"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">¿Para qué se usará?</label>
                                <textarea
                                    rows={3}
                                    value={sugerirForm.descripcion_solicitud}
                                    onChange={(e) => setSugerirForm({ ...sugerirForm, descripcion_solicitud: e.target.value })}
                                    placeholder="Ej: Para el diseño de guías didácticas interactivas por parte de los profesores..."
                                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-primary/10 transition-all font-medium text-xs"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Tipo</label>
                                    <select
                                        value={sugerirForm.tipo}
                                        onChange={(e) => setSugerirForm({ ...sugerirForm, tipo: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-primary/10 font-semibold text-[11px]"
                                    >
                                        <option value="BIEN">Bien (Físico)</option>
                                        <option value="SERVICIO">Servicio / Licencia</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Categoría General</label>
                                    <select
                                        value={sugerirForm.id_cat_recurso}
                                        onChange={(e) => setSugerirForm({ ...sugerirForm, id_cat_recurso: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 bg-gray-50 border-none rounded-xl focus:ring-4 focus:ring-primary/10 font-semibold text-[11px]"
                                    >
                                        {categorias.map(c => (
                                            <option key={c.id_cat_recurso} value={c.id_cat_recurso}>{c.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 pt-4 border-t border-gray-50 flex justify-end gap-3 bg-gray-50/20">
                            <button onClick={() => setShowSugerirModal(false)} className="px-6 py-3 font-bold text-gray-400 hover:text-gray-900 transition-colors text-xs">
                                Cancelar
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        const res = await api.post('/presupuesto/recursos/sugerir', sugerirForm);
                                        setShowSugerirModal(false);
                                        // Auto-seleccionar el nuevo recurso recién sugerido
                                        seleccionarRecurso({
                                            id_recurso: res.data.id_recurso,
                                            nombre: res.data.nombre,
                                            id_cat_recurso: res.data.id_cat_recurso,
                                            categoria_nombre: res.data.categoria_nombre
                                        });
                                    } catch (err: any) {
                                        console.error(err);
                                        alert(err.response?.data?.detail || "Error al enviar sugerencia");
                                    }
                                }}
                                className="px-10 py-3 bg-primary text-white rounded-xl font-bold shadow-xl shadow-primary/20 active:scale-95 transition-all text-xs"
                            >
                                Enviar Solicitud
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Guía de Uso del Sistema */}
            <GuiaRecursosModal
                isOpen={showGuiaModal}
                onClose={() => setShowGuiaModal(false)}
            />

            {/* Modal de Importación de Excel */}
            <ImportarExcelModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                todasActividades={todasActividades}
                mapeosRecurso={mapeosRecurso}
                subareasUsuario={subareasSolicitables}
                subvencionesActivas={subvencionesActivas}
                categorias={categorias as any}
                /* La cargo de los insumos importados es la de quien importa (es quien
                   los pide), no la de la solicitud: en una solicitud de Dirección, lo que
                   suba la secretaria queda como "Secretaria" y lo que suba el director
                   como "Directivo". Solo si el usuario no tiene cargo se hereda la de
                   la solicitud. */
                idSubareaForm={(user as any)?.id_subarea || (solicitud as any)?.id_subarea || null}
                onImportarConfirmado={(nuevosDetalles) => {
                    setRecursosActual(prev => [...prev, ...nuevosDetalles]);
                }}
            />

            {/* Flujo por lote: diagnóstico del borrador (sin IA) y aplicación de lo
                determinístico. Solo toca el borrador en memoria/localStorage; para
                persistir sigue haciendo falta "Guardar todos pendientes". */}
            <PrepararInsumosModal
                isOpen={showPrepararModal}
                onClose={() => setShowPrepararModal(false)}
                items={recursosActual}
                categorias={categorias as any}
                actividadesPME={todasActividades}
                onAplicar={(parches) => {
                    setRecursosActual(prev => prev.map((rec, idx) => {
                        const parche = parches[idx];
                        if (!parche) return rec;
                        const actualizado: any = { ...rec };
                        if (parche.id_recurso) actualizado.id_recurso = parche.id_recurso;
                        if (parche.id_actividad) {
                            actualizado.id_actividad = parche.id_actividad;
                            // La tabla y el editor muestran el nombre desde el catálogo de
                            // actividades ya cargado; si no está, se usa lo que vino del análisis.
                            const enLista = todasActividades.find(a => a.id === parche.id_actividad);
                            actualizado.actividad_seleccionada = enLista || {
                                id: parche.id_actividad,
                                nombre: parche.actividad_nombre || '',
                                dimension: parche.actividad_dimension || ''
                            };
                        }
                        return actualizado;
                    }));
                }}
            />

            {/* Modal Guía Normativa y Ejemplos de Dimensión PME */}
            {dimensionHelpModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[150] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">{dimensionHelpModal.icono}</span>
                                <div>
                                    <h3 className="text-base font-extrabold text-gray-900 leading-tight">
                                        Dimensión: {dimensionHelpModal.nombre}
                                    </h3>
                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                                        Guía Normativa PME
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDimensionHelpModal(null)}
                                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-3.5 text-xs">
                            <div className="bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100 space-y-1">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Descripción Normativa:</p>
                                <p className="text-gray-800 font-medium leading-relaxed">{dimensionHelpModal.descripcion}</p>
                            </div>

                            <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-100/80 space-y-1">
                                <p className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">Enfoque Principal:</p>
                                <p className="text-blue-950 font-bold leading-relaxed">{dimensionHelpModal.enfoque_principal}</p>
                            </div>

                            <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/70 space-y-1">
                                <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">Ejemplos de Insumos y Gastos Típicos:</p>
                                <p className="text-amber-950 font-semibold leading-relaxed">{dimensionHelpModal.ejemplos_insumos}</p>
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setDimensionHelpModal(null)}
                                className="px-6 py-2.5 bg-primary text-white font-bold rounded-xl text-xs shadow-md active:scale-95 transition-all"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal UI: Resumen de Registro Masivo */}
            {modalResumenGuardado && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[300] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-gray-100 animate-in zoom-in-95 space-y-6">
                        <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 shadow-xs">
                                <Check size={26} strokeWidth={3} />
                            </div>
                            <div>
                                <h3 className="text-base font-extrabold text-gray-900 tracking-tight">¡Registro Completado con Éxito!</h3>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">Resumen de sincronización con la base de datos.</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 border border-gray-100">
                                <div className="flex items-center gap-2.5">
                                    <ClipboardList size={18} className="text-primary" />
                                    <span className="text-xs font-bold text-gray-700">Solicitud Actualizada</span>
                                </div>
                                <span className="text-xs font-black text-primary bg-primary/10 px-2.5 py-1 rounded-xl">
                                    {modalResumenGuardado.total} ítem(s)
                                </span>
                            </div>

                            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                                <div className="flex items-center gap-2.5">
                                    <Plus size={18} className="text-emerald-600" />
                                    <span className="text-xs font-bold text-emerald-950">Insumos Nuevos en Catálogo Oficial</span>
                                </div>
                                <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-xl">
                                    {modalResumenGuardado.nuevos} nuevo(s)
                                </span>
                            </div>

                            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100">
                                <div className="flex items-center gap-2.5">
                                    <Copy size={18} className="text-blue-600" />
                                    <span className="text-xs font-bold text-blue-950">Insumos Reutilizados del Catálogo</span>
                                </div>
                                <span className="text-xs font-black text-blue-700 bg-blue-100 px-2.5 py-1 rounded-xl">
                                    {modalResumenGuardado.reutilizados} existente(s)
                                </span>
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setModalResumenGuardado(null)}
                                className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-extrabold rounded-2xl text-xs shadow-md shadow-primary/20 active:scale-98 transition-all"
                            >
                                Entendido, continuar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal Obligatorio al Copiar Solicitudes Anteriores */}
            {modalRevisarCopiado && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md flex items-center justify-center z-[300] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl border border-amber-100 animate-in zoom-in-95 space-y-6">
                        <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200 shadow-xs">
                                <AlertCircle size={26} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h3 className="text-base font-extrabold text-gray-900 tracking-tight">Revisión Obligatoria de Insumos Copiados</h3>
                                <p className="text-xs text-amber-700 font-semibold mt-0.5">Se copiarán <span className="font-black underline">{modalRevisarCopiado.count} insumos</span> de la solicitud <span className="font-black">{modalRevisarCopiado.codigo}</span>.</p>
                            </div>
                        </div>

                        <div className="space-y-3 bg-amber-50/50 p-4 rounded-2xl border border-amber-200">
                            <div className="p-3 bg-amber-100/90 rounded-xl border border-amber-300 text-amber-950 text-xs font-bold leading-relaxed flex items-start gap-2 shadow-xs">
                                <span className="text-base shrink-0">⚠️</span>
                                <div>
                                    <strong>Atención requerida:</strong> Al copiar un presupuesto anterior, <u className="decoration-amber-500 font-extrabold">no se guardan ni las cantidades ni el mes asignado</u>. Debes revisar el presupuesto copiado y colocar las cantidades y el mes correspondiente, ya que estos son obligatorios e importantes.
                                </div>
                            </div>

                            <p className="text-xs font-bold text-gray-800 uppercase tracking-wider pt-1">
                                Pasos obligatorios a revisar:
                            </p>
                            <ul className="space-y-2.5 text-xs text-gray-700 font-medium">
                                <li className="flex items-start gap-2.5">
                                    <div className="p-1 bg-amber-100 text-amber-800 rounded-lg shrink-0 mt-0.5">
                                        <Package size={14} />
                                    </div>
                                    <span><strong>Revisar los {modalRevisarCopiado.count} insumos:</strong> Comprueba que todos los productos agregados correspondan al requerimiento actual.</span>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <div className="p-1 bg-blue-100 text-blue-800 rounded-lg shrink-0 mt-0.5">
                                        <Calendar size={14} />
                                    </div>
                                    <span><strong>Asignar Mes:</strong> El mes asignado no se copió del presupuesto anterior. Debes colocar el mes de ejecución asignado para este período.</span>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <div className="p-1 bg-green-100 text-green-800 rounded-lg shrink-0 mt-0.5">
                                        <DollarSign size={14} />
                                    </div>
                                    <span><strong>Colocar Cantidades:</strong> Las cantidades no fueron copiadas. Debes especificar la cantidad a solicitar de cada insumo.</span>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <div className="p-1 bg-purple-100 text-purple-800 rounded-lg shrink-0 mt-0.5">
                                        <ClipboardList size={14} />
                                    </div>
                                    <span><strong>Revisar Motivos y Justificaciones:</strong> Adapta la fundamentación técnica según la necesidad actual.</span>
                                </li>
                            </ul>
                        </div>

                        <div className="pt-2 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setModalRevisarCopiado(null)}
                                className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarAgregarInsumosCopiados}
                                className="flex-1 py-3 bg-primary hover:bg-blue-600 text-white font-extrabold rounded-2xl text-xs shadow-md shadow-primary/30 active:scale-98 transition-all flex items-center justify-center gap-2"
                            >
                                <Check size={16} />
                                Entendido, Agregar {modalRevisarCopiado.count} insumos
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Elegante de Confirmación de Eliminación */}
            {recursoAEliminar && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[350] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-in zoom-in-95 duration-200">
                        {/* Header con icono de alerta */}
                        <div className="flex items-center gap-3.5">
                            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center shrink-0 shadow-xs">
                                <Trash2 size={24} strokeWidth={2.2} />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900 tracking-tight">
                                    {recursoAEliminar.tipo === 'individual' ? '¿Eliminar este recurso?' : '¿Eliminar recursos pendientes?'}
                                </h3>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                    {recursoAEliminar.tipo === 'individual'
                                        ? 'Esta acción removerá el insumo de la solicitud de forma permanente.'
                                        : `Se eliminarán los ${recursoAEliminar.count} recursos en borrador sin guardar.`}
                                </p>
                            </div>
                        </div>

                        {/* Card del recurso a eliminar (si es individual) */}
                        {recursoAEliminar.tipo === 'individual' && (
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-2 text-xs">
                                <div className="flex justify-between items-start gap-2">
                                    <span className="font-extrabold text-gray-900 text-sm leading-tight">
                                        {recursoAEliminar.rec.nombre_producto}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-lg bg-white border border-gray-200 font-bold text-gray-700 shrink-0">
                                        {recursoAEliminar.rec.cantidad} {recursoAEliminar.rec.formato_unidad}
                                    </span>
                                </div>
                                {recursoAEliminar.rec.descripcion && (
                                    <p className="text-[11px] text-gray-500 italic line-clamp-2">
                                        {recursoAEliminar.rec.descripcion}
                                    </p>
                                )}
                                <div className="flex justify-between items-center pt-2 border-t border-slate-200/60">
                                    <span className="text-[11px] font-bold text-gray-500">Monto total estimado:</span>
                                    <span className="font-black text-emerald-700 text-sm">
                                        {formatCLP(recursoAEliminar.rec.total_iva || (recursoAEliminar.rec.cantidad * recursoAEliminar.rec.valor_unitario_iva))}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Botones de Acción */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setRecursoAEliminar(null)}
                                disabled={isEliminando}
                                className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarEliminacion}
                                disabled={isEliminando}
                                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all shadow-md shadow-red-600/25 active:scale-95 cursor-pointer"
                            >
                                {isEliminando ? (
                                    <>
                                        <Loader2 size={15} className="animate-spin" />
                                        Eliminando...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 size={15} />
                                        Sí, Eliminar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Detalle Completo de Insumo */}
            <DetalleInsumoModal
                isOpen={Boolean(detalleInsumoModal || catalogoDetalleModal)}
                onClose={() => {
                    setDetalleInsumoModal(null);
                    setCatalogoDetalleModal(null);
                }}
                item={detalleInsumoModal?.item}
                catalogoItem={catalogoDetalleModal}
                onEdit={detalleInsumoModal ? () => abrirEditar(detalleInsumoModal.index) : undefined}
                onSeleccionarCatalogo={catalogoDetalleModal ? (r) => seleccionarRecurso(r) : undefined}
                nombreSubarea={(detalleInsumoModal?.item ? nombreSubareaDeFila(detalleInsumoModal.item) : undefined) ?? undefined}
                nombreActividad={detalleInsumoModal?.item?.id_actividad ? (todasActividades.find(a => a.id === detalleInsumoModal.item.id_actividad)?.nombre || (detalleInsumoModal.item as any).actividad_seleccionada?.nombre || (detalleInsumoModal.item as any).actividad_nombre) : undefined}
                subvencionNombre={detalleInsumoModal?.item ? getSubvencionLabel(detalleInsumoModal.item.id_subvencion) : undefined}
                labelFecha={detalleInsumoModal?.item ? labelFecha(detalleInsumoModal.item) : undefined}
                nombreCategoria={
                    detalleInsumoModal?.item
                        ? ((detalleInsumoModal.item as any).categoria_nombre || categorias.find(c => c.id_cat_recurso === (detalleInsumoModal.item as any).id_cat_recurso)?.nombre || (detalleInsumoModal.item as any).recurso_seleccionado?.categoria_nombre || undefined)
                        : (catalogoDetalleModal?.categoria_nombre || (catalogoDetalleModal?.id_cat_recurso ? categorias.find(c => c.id_cat_recurso === catalogoDetalleModal.id_cat_recurso)?.nombre : undefined))
                }
                nombreGrupo={
                    detalleInsumoModal?.item
                        ? ((detalleInsumoModal.item as any).grupo_nombre || grupos.find(g => g.id_grupo_recurso === (detalleInsumoModal.item as any).id_grupo_recurso)?.nombre || (detalleInsumoModal.item as any).recurso_seleccionado?.grupo_nombre || undefined)
                        : (catalogoDetalleModal?.grupo_nombre || (catalogoDetalleModal?.id_grupo_recurso ? grupos.find(g => g.id_grupo_recurso === catalogoDetalleModal.id_grupo_recurso)?.nombre : undefined))
                }
            />
        </>
    );
}