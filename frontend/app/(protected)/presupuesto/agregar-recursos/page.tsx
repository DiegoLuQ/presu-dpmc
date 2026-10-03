'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import {
    ArrowLeft, Plus, Trash2, Save, Search, Loader2,
    X, Package, Calendar, Check, Copy, Edit2, History, ClipboardList,
    ChevronLeft, ChevronRight, ChevronDown, HelpCircle, MapPin, AlertCircle, AlertTriangle, DollarSign,
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

// Error de una llamada al backend → mensaje breve para el usuario + pista para el programador
// (código HTTP, método y ruta, detalle técnico y request_id para buscarlo en el log del backend).
function describirErrorApi(err: any, mensajePorDefecto: string): { mensaje: string; pista: string } {
    const res = err?.response;
    const cfg = err?.config || {};
    const ruta = `${(cfg.method || '').toUpperCase()} ${cfg.url || ''}`.trim();

    if (!res) {
        return {
            mensaje: 'No hubo respuesta del servidor. Revisa tu conexión e inténtalo nuevamente.',
            pista: `Sin respuesta · ${ruta || 'petición'} · ${err?.message || 'error de red'}`,
        };
    }

    const data = res.data || {};
    const detail = data.detail;
    let mensaje = mensajePorDefecto;
    let tecnico = '';
    if (res.status === 422 && Array.isArray(detail)) {
        // Validación de FastAPI: campo + motivo del primer error
        mensaje = 'Uno de los datos no tiene un formato válido. Revísalo e inténtalo nuevamente.';
        tecnico = detail.slice(0, 2).map((d: any) => `${(d.loc || []).filter((x: any) => x !== 'body').join('.')}: ${d.msg}`).join(' | ');
    } else if (typeof detail === 'string' && res.status < 500) {
        mensaje = detail;
    } else if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        mensaje = detail.message || mensajePorDefecto;
    }
    if (data.pista) tecnico = data.pista;

    const rid = data.request_id || res.headers?.['x-request-id'];
    const pista = [`HTTP ${res.status}`, ruta, tecnico, rid ? `ref ${rid}` : ''].filter(Boolean).join(' · ');
    return { mensaje, pista };
}

// Límites de texto del Panel de Insumo PPTO
const MAX_DETALLE_INSUMO = 250;
const MAX_MOTIVO_INSUMO = 300;

// Badge "usados / máximo" para los campos de texto con límite
function LimiteCaracteres({ actual, max }: { actual: number; max: number }) {
    const excedido = actual > max;
    const cerca = !excedido && actual >= max * 0.9;
    return (
        <span
            title={`Máximo ${max} caracteres`}
            className={`px-2 py-0.5 rounded-full text-[9px] font-bold tabular-nums border shrink-0 ${
                excedido ? 'bg-red-50 text-red-600 border-red-200'
                    : cerca ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'}`}
        >
            {actual}/{max}
        </span>
    );
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
    id_grupo_recurso?: number | null;
    grupo_nombre?: string | null;
    solicitante_nombre?: string | null;
    colegio_nombre?: string | null;
    subarea_nombre?: string | null;
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
    // Clave de persistencia para el Panel de Insumo PPTO en localStorage ("cada vez que pase algo").
    const panelStorageKey = solicitudId ? `borrador_panel_insumo_${solicitudId}` : null;
    // Marca que la carga inicial (con restauración de borrador) ya ocurrió,
    // para no sobrescribir el localStorage antes de hidratar.
    const hidratadoRef = useRef(false);
    const panelHidratadoRef = useRef(false);

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
    // "Anteriores": primero solo la lista de solicitudes (sin ítems); los ítems se cargan al elegir una
    const [solicitudesAnteriores, setSolicitudesAnteriores] = useState<{
        id_presupuesto: number; codigo: string; cargo_nombre?: string | null; n_items: number;
    }[]>([]);

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
    const [busquedaActividadPME, setBusquedaActividadPME] = useState('');
    const [selectActividadPMEOpen, setSelectActividadPMEOpen] = useState(false);
    const selectActividadPMERef = useRef<HTMLDivElement>(null);
    const [borradorRestaurado, setBorradorRestaurado] = useState(false);
    const [filtroColegioPME, setFiltroColegioPME] = useState('');
    const [showPMEResults, setShowPMEResults] = useState(false);
    const [selectedHistorial, setSelectedHistorial] = useState<number[]>([]);
    const [filtroSolicitudHistorial, setFiltroSolicitudHistorial] = useState<string>('');
    // "Anteriores": buscador por nombre, filtro múltiple por motivo y paginación
    const HISTORIAL_POR_PAGINA = 25;
    const SIN_MOTIVO = '(Sin motivo)';
    const [busquedaHistorial, setBusquedaHistorial] = useState('');
    const [filtroMotivosHistorial, setFiltroMotivosHistorial] = useState<string[]>([]);
    const [filtroActividadesHistorial, setFiltroActividadesHistorial] = useState<string[]>([]);
    const [filtroCargosHistorial, setFiltroCargosHistorial] = useState<string[]>([]);
    const [filtroMesesHistorial, setFiltroMesesHistorial] = useState<string[]>([]);
    const SIN_ACTIVIDAD = '(Sin actividad PME)';
    const SIN_CARGO = '(Sin cargo)';
    const SIN_MES = '(Sin mes)';
    const [paginaHistorial, setPaginaHistorial] = useState(1);
    const normalizarTexto = (t?: string | null) =>
        (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const motivoDe = (h: RecursoHistorial) => (h.motivo || '').trim() || SIN_MOTIVO;
    const actividadDe = (h: RecursoHistorial) => (h.actividad_nombre || '').trim() || SIN_ACTIVIDAD;
    const cargoDe = (h: RecursoHistorial) =>
        (h.subarea_nombre || todasSubareas.find(sa => sa.id_subarea === h.id_subarea)?.nombre || '').trim() || SIN_CARGO;
    // Mes como "01".."12" (desde la fecha de ejecución); SIN_MES si no tiene
    const mesDe = (h: RecursoHistorial) => {
        const m = (h.fecha_ejecucion || '').substring(5, 7);
        return /^(0[1-9]|1[0-2])$/.test(m) ? m : SIN_MES;
    };

    // Ítems de la solicitud anterior elegida (o de todas)
    const historialBase = useMemo(
        () => historialRecursos.filter(h => !filtroSolicitudHistorial || h.codigo_solicitud === filtroSolicitudHistorial),
        [historialRecursos, filtroSolicitudHistorial]
    );
    // Ítems del/los cargo(s) elegidos: las opciones de motivo, actividad PME y mes
    // se calculan sobre esto, para ver solo lo que ese cargo solicitó.
    const historialPorCargo = useMemo(
        () => filtroCargosHistorial.length === 0
            ? historialBase
            : historialBase.filter(h => filtroCargosHistorial.includes(cargoDe(h))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [historialBase, filtroCargosHistorial, todasSubareas]
    );
    // Motivos disponibles (con conteo) para el filtro múltiple
    const opcionesMotivoHistorial = useMemo(() => {
        const conteo: Record<string, number> = {};
        historialPorCargo.forEach(h => { const m = motivoDe(h); conteo[m] = (conteo[m] || 0) + 1; });
        return Object.keys(conteo)
            .sort((a, b) => a.localeCompare(b, 'es'))
            .map(m => ({ valor: m, label: m, count: conteo[m] }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historialPorCargo]);
    const opcionesActividadHistorial = useMemo(() => {
        const conteo: Record<string, number> = {};
        historialPorCargo.forEach(h => { const a = actividadDe(h); conteo[a] = (conteo[a] || 0) + 1; });
        return Object.keys(conteo)
            .sort((a, b) => (a === SIN_ACTIVIDAD ? 1 : b === SIN_ACTIVIDAD ? -1 : a.localeCompare(b, 'es')))
            .map(a => ({ valor: a, label: a, count: conteo[a] }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historialPorCargo]);
    const opcionesCargoHistorial = useMemo(() => {
        const conteo: Record<string, number> = {};
        historialBase.forEach(h => { const c = cargoDe(h); conteo[c] = (conteo[c] || 0) + 1; });
        return Object.keys(conteo)
            .sort((a, b) => (a === SIN_CARGO ? 1 : b === SIN_CARGO ? -1 : a.localeCompare(b, 'es')))
            .map(c => ({ valor: c, label: c, count: conteo[c] }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historialBase, todasSubareas]);
    const opcionesMesHistorial = useMemo(() => {
        const conteo: Record<string, number> = {};
        historialPorCargo.forEach(h => { const m = mesDe(h); conteo[m] = (conteo[m] || 0) + 1; });
        // Orden calendario; "(Sin mes)" al final
        return Object.keys(conteo)
            .sort((a, b) => (a === SIN_MES ? 1 : b === SIN_MES ? -1 : a.localeCompare(b)))
            .map(m => ({ valor: m, label: MESES.find(x => x.value === m)?.label || m, count: conteo[m] }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historialPorCargo]);
    // Al cambiar de cargo, quitar las selecciones de motivo/actividad/mes que ya no
    // existen para ese cargo (si no, quedarían filtros ocultos dejando la lista vacía).
    useEffect(() => {
        const podar = (sel: string[], opciones: { valor: string }[]) => {
            const validas = sel.filter(v => opciones.some(o => o.valor === v));
            return validas.length === sel.length ? sel : validas;
        };
        setFiltroMotivosHistorial(prev => podar(prev, opcionesMotivoHistorial));
        setFiltroActividadesHistorial(prev => podar(prev, opcionesActividadHistorial));
        setFiltroMesesHistorial(prev => podar(prev, opcionesMesHistorial));
    }, [opcionesMotivoHistorial, opcionesActividadHistorial, opcionesMesHistorial]);
    const historialFiltrado = useMemo(() => {
        const q = normalizarTexto(busquedaHistorial);
        return historialBase.filter(h =>
            (!q || normalizarTexto(h.nombre_producto).includes(q)) &&
            (filtroMotivosHistorial.length === 0 || filtroMotivosHistorial.includes(motivoDe(h))) &&
            (filtroActividadesHistorial.length === 0 || filtroActividadesHistorial.includes(actividadDe(h))) &&
            (filtroCargosHistorial.length === 0 || filtroCargosHistorial.includes(cargoDe(h))) &&
            (filtroMesesHistorial.length === 0 || filtroMesesHistorial.includes(mesDe(h)))
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historialBase, busquedaHistorial, filtroMotivosHistorial, filtroActividadesHistorial, filtroCargosHistorial, filtroMesesHistorial, todasSubareas]);
    const totalPaginasHistorial = Math.max(1, Math.ceil(historialFiltrado.length / HISTORIAL_POR_PAGINA));
    const paginaHistorialActual = Math.min(paginaHistorial, totalPaginasHistorial);
    const historialPagina = historialFiltrado.slice(
        (paginaHistorialActual - 1) * HISTORIAL_POR_PAGINA,
        paginaHistorialActual * HISTORIAL_POR_PAGINA
    );
    // Volver a la página 1 al cambiar cualquier filtro
    useEffect(() => { setPaginaHistorial(1); }, [busquedaHistorial, filtroMotivosHistorial, filtroActividadesHistorial, filtroCargosHistorial, filtroMesesHistorial, filtroSolicitudHistorial]);
    const [filtroAlcanceHistorial, setFiltroAlcanceHistorial] = useState<'mis' | 'area'>('area');
    const [cargandoHistorial, setCargandoHistorial] = useState(false);
    const [savingItems, setSavingItems] = useState<number[]>([]);
    const [filasModificadas, setFilasModificadas] = useState<Set<number>>(new Set());
    const [filasConfirmadasRecientes, setFilasConfirmadasRecientes] = useState<Set<number>>(new Set());
    const [asesorandoCategoria, setAsesorandoCategoria] = useState(false);
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
    // Detalle de un ítem de la pestaña "Anteriores": usa los datos ya cargados, sin consultas
    const [detalleAnterior, setDetalleAnterior] = useState<RecursoHistorial | null>(null);
    // Al abrir el detalle: ítem guardado → lo que hay en la BD; borrador → solo el código
    // que el catálogo asignará al confirmar. `clave` evita mezclar respuestas de otra fila.
    const [detalleGuardado, setDetalleGuardado] = useState<{ clave: string; data: any | null; cargando: boolean; borrador: boolean } | null>(null);
    const [catalogoDetalleModal, setCatalogoDetalleModal] = useState<RecursoOption | null>(null);
    const [motivosOficiales, setMotivosOficiales] = useState<{
        id_motivo: number;
        nombre: string;
        descripcion?: string | null;
        id_grupo_recurso?: number | null;
        grupo_nombre?: string | null;
        activo: boolean;
        orden: number;
    }[]>([]);

    // Lista de motivos sugeridos (oficiales del sistema + historial y usados en esta solicitud)
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
        motivosOficiales.forEach(mo => {
            const m = (mo.nombre || '').trim();
            if (m && !counts.has(m)) counts.set(m, 0);
        });
        return Array.from(counts.entries())
            .map(([motivo, count]) => ({ motivo, count }))
            .sort((a, b) => b.count - a.count);
    }, [recursosActual, historialRecursos, motivosOficiales]);

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
        motivosOficiales.forEach(mo => {
            const m = (mo.nombre || '').trim();
            if (m) setMotivos.add(m);
        });
        return Array.from(setMotivos).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }, [recursosActual, historialRecursos, motivosOficiales]);

    // Motivos creados o utilizados previamente por el usuario actual (excluyendo los registrados oficiales)
    const motivosUsuario = useMemo(() => {
        const setOficiales = new Set(motivosOficiales.map(mo => mo.nombre.trim().toLowerCase()));
        const setMotivos = new Set<string>();
        recursosActual.forEach(r => {
            const m = (r.motivo || '').trim();
            if (m && !setOficiales.has(m.toLowerCase())) setMotivos.add(m);
        });
        historialRecursos.forEach(h => {
            const m = (h.motivo || '').trim();
            if (m && !setOficiales.has(m.toLowerCase())) setMotivos.add(m);
        });
        return Array.from(setMotivos).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }, [recursosActual, historialRecursos, motivosOficiales]);

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
    const [filtroCargos, setFiltroCargos] = useState<string[]>([]);
    // Vista de pantalla completa (URL ?view=completa) y selector de columnas
    const vistaCompleta = searchParams.get('view') === 'completa';
    const [showColumnasModal, setShowColumnasModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showPrepararModal, setShowPrepararModal] = useState(false);
    const [showGuiaModal, setShowGuiaModal] = useState(false);
    const [modalResumenGuardado, setModalResumenGuardado] = useState<{ total: number; nuevos: number; reutilizados: number } | null>(null);
    const [modalDiagnosticoPendientes, setModalDiagnosticoPendientes] = useState<{
        totalConfirmados: number;
        totalPendientes: number;
        sinCantidad: number;
        sinMes: number;
        sinPrecio: number;
        listos: number;
    } | null>(null);

    // Modal de notificación genérico (reemplaza browser alert())
    const [modalNotificacion, setModalNotificacion] = useState<{
        tipo: 'error' | 'warning' | 'success' | 'info';
        titulo: string;
        mensaje: string;
        // Detalle técnico breve para el programador (solo en errores del backend)
        pista?: string;
    } | null>(null);
    const mostrarNotificacion = (tipo: 'error' | 'warning' | 'success' | 'info', titulo: string, mensaje: string | object, pista?: string) => {
        const msg = typeof mensaje === 'string' ? mensaje : (mensaje && typeof mensaje === 'object' ? JSON.stringify(mensaje) : String(mensaje));
        setModalNotificacion({ tipo, titulo, mensaje: msg, pista });
    };

    // Métricas y diagnóstico continuo de insumos (confirmados vs pendientes, sin cantidad, sin mes)
    const statsPendientes = useMemo(() => {
        const confirmados = recursosActual.filter(r => !!r.id_pre_detalle).length;
        const pendientes = recursosActual.filter(r => !r.id_pre_detalle);
        const sinCantidad = pendientes.filter(r => !r.cantidad || Number(r.cantidad) <= 0 || isNaN(Number(r.cantidad))).length;
        const sinMes = pendientes.filter(r => (!r.fecha_ejecucion || r.fecha_ejecucion.trim() === '') && (!r.mes_ejecucion || r.mes_ejecucion.trim() === '')).length;
        const sinPrecio = pendientes.filter(r => !r.valor_unitario_iva || Number(r.valor_unitario_iva) <= 0).length;
        const listos = pendientes.filter(r => 
            (r.cantidad && Number(r.cantidad) > 0) &&
            ((r.fecha_ejecucion && r.fecha_ejecucion.trim() !== '') || (r.mes_ejecucion && r.mes_ejecucion.trim() !== ''))
        ).length;

        return {
            totalConfirmados: confirmados,
            totalPendientes: pendientes.length,
            sinCantidad,
            sinMes,
            sinPrecio,
            listos,
            tieneIncompletos: sinCantidad > 0 || sinMes > 0
        };
    }, [recursosActual]);

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
        id_subarea: null as number | null,
        id_grupo_recurso: null as number | null
    });

    // Determina si el formulario del panel contiene datos de borrador ingresados por el usuario
    const tieneContenidoBorrador = (form: typeof formularioRecurso) => {
        if (!form) return false;
        return Boolean(
            (form.nombre_producto && form.nombre_producto.trim() !== '') ||
            (form.motivo && form.motivo.trim() !== '') ||
            (form.descripcion && form.descripcion.trim() !== '') ||
            (Number(form.valor_unitario_iva) > 0) ||
            (form.id_recurso !== null && form.id_recurso !== undefined) ||
            (form.id_actividad !== null && form.id_actividad !== undefined) ||
            (form.destino_gasto && form.destino_gasto.trim() !== '') ||
            // (id_subvencion y codigo_cuenta no cuentan: los completa la página automáticamente)
            (form.id_subarea !== null && form.id_subarea !== undefined) ||
            (form.id_grupo_recurso !== null && form.id_grupo_recurso !== undefined)
        );
    };

    // Punto de partida del formulario (vacío, o los datos que "Guardar y agregar otro" arrastra al
    // siguiente insumo). Solo hay borrador si el usuario cambió algo respecto de él.
    const borradorBaseRef = useRef<string | null>(null);
    const firmaBorrador = (form: typeof formularioRecurso) => JSON.stringify([
        form.nombre_producto, form.descripcion, Number(form.valor_unitario_iva) || 0, Number(form.cantidad) || 0,
        form.formato_unidad, form.id_recurso, form.motivo, form.id_actividad, form.destino_gasto,
        form.id_grupo_recurso, form.id_subarea, form.mes_ejecucion, form.tipo_fecha,
        form.fecha_ejecucion, form.fecha_termino, form.dimension_pme,
    ]);
    const esInsumoYaGuardado = (form: any, lista: any[]) => {
        if (!form || form.id_pre_detalle) return false; // edición de un ítem existente: no es fantasma
        const norm = (v: any) => String(v ?? '').trim().toLowerCase();
        return lista.some(d =>
            norm(d.nombre_producto) === norm(form.nombre_producto) &&
            Number(d.cantidad) === Number(form.cantidad) &&
            Number(d.valor_unitario_iva) === Number(form.valor_unitario_iva) &&
            norm(d.motivo) === norm(form.motivo)
        );
    };
    const hayBorrador = (form: typeof formularioRecurso) =>
        tieneContenidoBorrador(form) && firmaBorrador(form) !== borradorBaseRef.current;

    // Aplica un motivo predeterminado y auto-asigna el grupo/línea sugerido si existe
    const aplicarMotivo = (motivoTexto: string) => {
        const oficial = motivosOficiales.find(
            mo => mo.nombre.trim().toLowerCase() === motivoTexto.trim().toLowerCase()
        );
        setFormularioRecurso(prev => {
            const next = { ...prev, motivo: motivoTexto };
            if (oficial?.id_grupo_recurso) {
                next.id_grupo_recurso = oficial.id_grupo_recurso;
                setGrupoSeleccionado(oficial.id_grupo_recurso);
            }
            return next;
        });
    };

    // Cambia el grupo/línea explícitamente seleccionado
    const cambiarGrupo = (idGrupo: number | null) => {
        setFormularioRecurso(prev => ({ ...prev, id_grupo_recurso: idGrupo }));
        setGrupoSeleccionado(idGrupo);
    };

    // Estados y refs para Autocompletado de Nombre de Insumo
    const [nombreInsumoFocused, setNombreInsumoFocused] = useState(false);
    const [nombreInsumoFocused2, setNombreInsumoFocused2] = useState(false);
    const insumoDropdownRef = useRef<HTMLDivElement>(null);
    const insumoDropdownRef2 = useRef<HTMLDivElement>(null);

    // Cerrar dropdowns de autocompletado al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (insumoDropdownRef.current && !insumoDropdownRef.current.contains(event.target as Node)) {
                setNombreInsumoFocused(false);
            }
            if (insumoDropdownRef2.current && !insumoDropdownRef2.current.contains(event.target as Node)) {
                setNombreInsumoFocused2(false);
            }
            if (selectActividadPMERef.current && !selectActividadPMERef.current.contains(event.target as Node)) {
                setSelectActividadPMEOpen(false);
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

    // Actividades PME para el selector de la Fase 3:
    // - Si no se elige ninguna dimensión, aparecen todas las actividades del PME actual del colegio.
    // - Si se elige una dimensión, se filtra por esa dimensión.
    // - Permite búsqueda y filtrado rápido en tiempo real por palabra o letra.
    const actividadesPMEParaSelect = useMemo(() => {
        let list = todasActividades;
        if (filtroDimensionPME) {
            list = list.filter(a => (a.dimension || '').toUpperCase() === filtroDimensionPME.toUpperCase());
        }
        const q = busquedaActividadPME.trim().toLowerCase();
        if (q) {
            list = list.filter(a =>
                a.nombre.toLowerCase().includes(q) ||
                (a.dimension && a.dimension.toLowerCase().includes(q))
            );
        }
        return list;
    }, [todasActividades, filtroDimensionPME, busquedaActividadPME]);

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
            const detail = error.response?.data?.detail;
            const msg = typeof detail === 'string'
                ? detail
                : (detail && typeof detail === 'object'
                    ? (detail.message || JSON.stringify(detail))
                    : "Error al obtener asesoría de la IA. Verifica la configuración del proveedor IA.");
            mostrarNotificacion('error', 'Error en Asesoría PME', msg);
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
        if (formularioRecurso.id_recurso && (showRecursoModal || isEditando)) {
            api.get(`/presupuesto/recursos/${formularioRecurso.id_recurso}/mapeos`)
                .then(res => {
                    setMapeosRecurso(res.data);
                })
                .catch(() => {
                    setMapeosRecurso([]);
                });
        } else if (!formularioRecurso.id_recurso) {
            setMapeosRecurso([]);
        }
    }, [formularioRecurso.id_recurso, showRecursoModal, isEditando]);

    useEffect(() => {
        if (mapeosRecurso.length > 0) {
            const dests = Array.from(new Set(mapeosRecurso.map(m => m.destino_gasto)));

            // Solo sobrescribir por mapeos si destino_gasto está vacío o no seleccionado
            if (!formularioRecurso.destino_gasto) {
                const matchedMapping = mapeosRecurso.find(m => m.codigo_cuenta === formularioRecurso.codigo_cuenta);
                if (matchedMapping) {
                    setFormularioRecurso(prev => ({ ...prev, destino_gasto: matchedMapping.destino_gasto }));
                } else if (dests.length > 0) {
                    setFormularioRecurso(prev => ({ ...prev, destino_gasto: dests[0] }));
                }
            }
        }
    }, [mapeosRecurso]);

    // ¿El ítem se pide desde un contexto PIE? (rol, cargo o área/subárea PIE)
    const esContextoPIEDe = (idSubarea: number | null | undefined): boolean => {
        const subareaObj = todasSubareas.find(s => s.id_subarea === idSubarea);
        const subareaNom = subareaObj ? subareaObj.nombre : solicitud?.subarea_nombre;
        const areaNom = solicitud?.area_nombre || subareaObj?.area?.nombre || (user as any)?.cargo?.area?.nombre || (user as any)?.area?.nombre;
        const rolCodigo = (user as any)?.rol?.codigo || codigoRol || '';
        return Boolean(
            rolCodigo === 'PIE' ||
            (areaNom && areaNom.toUpperCase().includes('PIE')) ||
            (subareaNom && subareaNom.toUpperCase().includes('PIE')) ||
            (user as any)?.cargo?.nombre?.toUpperCase().includes('PIE') ||
            (user as any)?.cargos?.some((c: any) => c.nombre?.toUpperCase().includes('PIE'))
        );
    };

    // "Ver detalle del insumo": para un ítem confirmado se trae lo guardado en el servidor
    // (código contable, descripción, motivo…). Una sola consulta al abrir; nada en segundo plano.
    const claveDetalle = (item?: DetallePresupuestoForm | null, index?: number) =>
        item ? (item.id_pre_detalle ? `id:${item.id_pre_detalle}` : `fila:${index}:${item.id_recurso || item.nombre_producto}:${item.destino_gasto || ''}`) : '';

    useEffect(() => {
        const item = detalleInsumoModal?.item;
        if (!item) { setDetalleGuardado(null); return; }
        const clave = claveDetalle(item, detalleInsumoModal?.index);
        const borrador = !item.id_pre_detalle;
        if (borrador && !(item.destino_gasto && (item.id_recurso || item.nombre_producto))) { setDetalleGuardado(null); return; }

        let vigente = true;
        setDetalleGuardado({ clave, data: null, cargando: true, borrador });
        const peticion = borrador
            ? api.get('/presupuesto/recursos/codigo-catalogo', {
                params: { destino_gasto: item.destino_gasto, id_recurso: item.id_recurso || undefined, nombre: item.nombre_producto || undefined },
            })
            : api.get(`/presupuesto/detalles/${item.id_pre_detalle}`);
        peticion
            .then(res => { if (vigente) setDetalleGuardado({ clave, data: res.data, cargando: false, borrador }); })
            .catch(() => { if (vigente) setDetalleGuardado({ clave, data: null, cargando: false, borrador }); });
        return () => { vigente = false; };
    }, [detalleInsumoModal]);

    // RESOLUCIÓN AUTOMÁTICA DE SUBVENCIÓN POR JERARQUÍA DE REGLAS (ÁREA + DESTINO)
    useEffect(() => {
        const subareaObj = todasSubareas.find(s => s.id_subarea === formularioRecurso.id_subarea);
        const subareaNom = subareaObj ? subareaObj.nombre : solicitud?.subarea_nombre;
        const areaNom = solicitud?.area_nombre || subareaObj?.area?.nombre || (user as any)?.cargo?.area?.nombre || (user as any)?.area?.nombre;

        const esContextoPIE = esContextoPIEDe(formularioRecurso.id_subarea);

        const resSub = calcularSubvencion(
            areaNom,
            subareaNom,
            formularioRecurso.destino_gasto,
            `${formularioRecurso.nombre_producto} ${formularioRecurso.motivo}`,
            null,
            esContextoPIE ? financiarConPIE : true,
            esContextoPIE
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

    // El código contable no se resuelve en el formulario: lo asigna el backend al
    // guardar, buscando el insumo (id + nombre) y su destino en el catálogo. Un insumo
    // nuevo queda sin código hasta que el Contralor lo revise.




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
        // PIE solo aplica al destino Estudiantes; Funcionarios sigue siendo GENERAL.
        const esContextoPIE = esContextoPIEDe(formularioRecurso.id_subarea) && destino === 'clases(alumno)';

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

        if (destino === 'oficinas(administracion)' || destino === 'apoderados') {
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

    // Persistir el estado del Panel de Insumo PPTO en localStorage ("cada vez que pase algo")
    useEffect(() => {
        if (!panelHidratadoRef.current || !panelStorageKey) return;
        try {
            // Guardar automáticamente cada vez que el usuario haya ingresado algo nuevo
            if (hayBorrador(formularioRecurso)) {
                const payload = {
                    showRecursoModal: Boolean(showRecursoModal),
                    formularioRecurso,
                    faseActual,
                    layoutModo,
                    isEditando,
                    editIndex,
                    esNuevoProducto,
                    grupoSeleccionado,
                    categoriaSeleccionadaNuevo,
                    catNuevoSearch,
                    filtroDimensionPME,
                    formatoEsOtros,
                    busquedaActividadPME,
                    timestamp: Date.now()
                };
                localStorage.setItem(panelStorageKey, JSON.stringify(payload));
            } else {
                // Sin datos nuevos (p. ej. tras "Añadir y Cerrar" o "Guardar y agregar otro"): no dejar
                // un borrador viejo que luego se restauraría como si fuera un insumo pendiente
                localStorage.removeItem(panelStorageKey);
            }
            // ¡CRÍTICO!: Cuando showRecursoModal pasa a false (el usuario cerró el modal o cambió de pestaña),
            // NUNCA se borra el borrador de localStorage. Queda preservado intacto hasta que se guarde o descarte.
        } catch (e) {
            console.error('Error guardando panel de insumo en localStorage:', e);
        }
    }, [
        showRecursoModal,
        formularioRecurso,
        faseActual,
        layoutModo,
        isEditando,
        editIndex,
        esNuevoProducto,
        grupoSeleccionado,
        categoriaSeleccionadaNuevo,
        catNuevoSearch,
        filtroDimensionPME,
        formatoEsOtros,
        busquedaActividadPME,
        panelStorageKey
    ]);

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
                configRes,
                motivosRes
            ] = await Promise.all([
                api.get(`/presupuesto/solicitudes/${solicitudId}`),
                api.get('/presupuesto/categoria-recurso'),
                api.get(`/presupuesto/actividades/buscar?q=&id_presupuesto=${solicitudId}`),
                api.get('/presupuesto/subvenciones/activas'),
                api.get('/presupuesto/grupos-recurso'),
                api.get('/catalogos/cargos'),
                api.get('/catalogos/config', {
                    params: { claves: 'acceso_boton_plantilla_excel,acceso_importar_excel,acceso_boton_asesoria_pme_ia,acceso_boton_preparar_ppto' }
                }).catch(() => ({ data: {} })),
                api.get('/presupuesto/motivos-recurso').catch(() => ({ data: [] }))
            ]);

            // Si una clave no está configurada se conserva el valor por defecto del estado
            const cfg = configRes.data || {};
            const esAcceso = (v: unknown) => ['oculto', 'solo_admin', 'todos'].includes(v as string);
            if (esAcceso(cfg.acceso_boton_plantilla_excel)) setAccesoPlantillaExcel(cfg.acceso_boton_plantilla_excel);
            if (esAcceso(cfg.acceso_importar_excel)) setAccesoImportarExcel(cfg.acceso_importar_excel);
            if (esAcceso(cfg.acceso_boton_asesoria_pme_ia)) setAccesoBotonIA(cfg.acceso_boton_asesoria_pme_ia);
            if (esAcceso(cfg.acceso_boton_preparar_ppto)) setAccesoBotonPreparar(cfg.acceso_boton_preparar_ppto);

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
            setMotivosOficiales(motivosRes.data || []);
            setTodasSubareas(subareasRes.data || []);

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

            // Restaurar borrador del Panel de Insumo PPTO si existía antes de recargar
            if (panelStorageKey) {
                try {
                    const rawPanel = localStorage.getItem(panelStorageKey);
                    if (rawPanel) {
                        const data = JSON.parse(rawPanel);
                        if (data && data.formularioRecurso && esInsumoYaGuardado(data.formularioRecurso, detalles)) {
                            // Borrador de un insumo que ya se agregó (quedaba guardado por error): descartarlo
                            localStorage.removeItem(panelStorageKey);
                        } else if (data && data.formularioRecurso && tieneContenidoBorrador(data.formularioRecurso)) {
                            if (data.formularioRecurso) setFormularioRecurso(data.formularioRecurso);
                            if (typeof data.faseActual === 'number') setFaseActual(data.faseActual);
                            if (data.layoutModo) setLayoutModo(data.layoutModo);
                            if (typeof data.isEditando === 'boolean') setIsEditando(data.isEditando);
                            if (data.editIndex !== undefined) setEditIndex(data.editIndex);
                            if (typeof data.esNuevoProducto === 'boolean') setEsNuevoProducto(data.esNuevoProducto);
                            if (data.grupoSeleccionado !== undefined) setGrupoSeleccionado(data.grupoSeleccionado);
                            if (data.categoriaSeleccionadaNuevo !== undefined) setCategoriaSeleccionadaNuevo(data.categoriaSeleccionadaNuevo);
                            if (data.catNuevoSearch !== undefined) setCatNuevoSearch(data.catNuevoSearch);
                            if (data.filtroDimensionPME !== undefined) setFiltroDimensionPME(data.filtroDimensionPME);
                            if (typeof data.formatoEsOtros === 'boolean') setFormatoEsOtros(data.formatoEsOtros);
                            if (data.busquedaActividadPME !== undefined) setBusquedaActividadPME(data.busquedaActividadPME);
                            if (data.showRecursoModal) {
                                setShowRecursoModal(true);
                            }
                            setBorradorRestaurado(true);
                        }
                    }
                } catch (e) {
                    console.error('Error restaurando panel de insumo de localStorage:', e);
                }
            }
            panelHidratadoRef.current = true;
        } catch (error) {
            console.error('Error cargando datos:', error);
            alert('Error al cargar la solicitud');
            router.push('/presupuesto/mis-solicitudes');
        } finally {
            setLoading(false);
        }
    };

    // Lista de solicitudes anteriores (resumen, sin ítems) del alcance elegido
    const cargarHistorial = async (alcanceOverride?: 'mis' | 'colegio' | 'area') => {
        const alcance = alcanceOverride || filtroAlcanceHistorial;
        setCargandoHistorial(true);
        setHistorialRecursos([]);
        setSelectedHistorial([]);
        setFiltroSolicitudHistorial('');
        try {
            const res = await api.get('/presupuesto/solicitudes/mis', {
                params: { alcance: alcance === 'mis' ? 'mis' : 'area', resumen: true },
            });
            // Solo las que tienen ítems copiables: todos si la solicitud está aprobada, si no, los aprobados
            const lista = (res.data || [])
                .map((sol: any) => {
                    const solAprobada = sol.estado === 'Aprobado' || sol.estado === 'Aceptado';
                    return {
                        id_presupuesto: sol.id_presupuesto,
                        codigo: sol.codigo,
                        cargo_nombre: sol.cargo_nombre || sol.subarea_nombre || null,
                        n_items: solAprobada ? (sol.n_items || 0) : (sol.n_items_aprobados || 0),
                    };
                })
                .filter((sol: { n_items: number; codigo: string }) => sol.n_items > 0 && sol.codigo);
            setSolicitudesAnteriores(lista);
        } catch (error) {
            console.error('Error cargando solicitudes anteriores:', error);
        } finally {
            setCargandoHistorial(false);
        }
    };

    // Ítems de UNA solicitud anterior (se piden recién al elegirla)
    const cargarItemsAnterior = async (codigo: string) => {
        setHistorialRecursos([]);
        setSelectedHistorial([]);
        const sol = solicitudesAnteriores.find(x => x.codigo === codigo);
        if (!sol) return;
        setCargandoHistorial(true);
        try {
            const res = await api.get('/presupuesto/solicitudes/mis', {
                params: { alcance: filtroAlcanceHistorial === 'mis' ? 'mis' : 'area', id_presupuesto: sol.id_presupuesto },
            });
            const todas = res.data;
            const hist: RecursoHistorial[] = [];
            for (const sol of todas) {
                const solAprobada = sol.estado === 'Aprobado' || sol.estado === 'Aceptado';
                for (const det of sol.detalles || []) {
                    if (det.estado_aprobacion === 'Aprobado' || solAprobada) {
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
                            dimension_pme: det.dimension_pme || det.actividad?.dimension || (det.id_actividad ? todasActividades.find(a => a.id === det.id_actividad)?.dimension : null) || null,
                            id_grupo_recurso: det.id_grupo_recurso || null,
                            grupo_nombre: det.grupo_nombre || null,
                            solicitante_nombre: sol.user_nombre || null,
                            colegio_nombre: sol.colegio_nombre || null,
                            subarea_nombre: det.subarea_nombre || det.cargo_nombre || sol.subarea_nombre || null
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
            console.error('Error cargando ítems de la solicitud anterior:', error);
        } finally {
            setCargandoHistorial(false);
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
                id_subvencion: subvencionPorDestino(h.destino_gasto, h.id_subvencion || null, h.id_subarea) || undefined,
                codigo_cuenta: undefined,
                id_subarea: h.id_subarea || undefined,
                id_grupo_recurso: h.id_grupo_recurso || undefined,
                grupo_nombre: h.grupo_nombre || undefined,
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
                id_subvencion: subvencionPorDestino(h.destino_gasto, h.id_subvencion || null, h.id_subarea) || undefined,
                codigo_cuenta: undefined,
                id_subarea: h.id_subarea || undefined,
                id_grupo_recurso: h.id_grupo_recurso || undefined,
                grupo_nombre: h.grupo_nombre || undefined,
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
            mostrarNotificacion('success', 'Solicitud Eliminada', `La solicitud ${codigoSolicitud} y sus insumos asociados fueron eliminados del historial.`);
        } catch (error: any) {
            console.error('Error al eliminar la solicitud del historial:', error);
            const detail = error.response?.data?.detail;
            const msg = typeof detail === 'string'
                ? detail
                : (detail && typeof detail === 'object'
                    ? (detail.message || JSON.stringify(detail))
                    : 'Error al eliminar la solicitud');
            mostrarNotificacion('error', 'Error al eliminar', msg);
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

    // Búsqueda de recursos en el servidor: solo depende del texto y la pestaña.
    // (Separada del filtro de actividades para no repetir la petición cuando
    // llegan las actividades del PME.)
    useEffect(() => {
        if (activeTab !== 'buscador') return;
        const timer = setTimeout(() => {
            setPaginaRecursos(1);
            buscarRecursos(searchRecurso, 1);
        }, 200);
        return () => clearTimeout(timer);
    }, [searchRecurso, activeTab, buscarRecursos]);

    // Filtro local de actividades PME (no hace peticiones)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (activeTab === 'pme') {
                buscarActividades(searchActividad, filtroDimensionPME);
            } else {
                buscarActividades(searchPMEModal, filtroDimensionPME);
            }
        }, 200);
        return () => clearTimeout(timer);
    }, [searchActividad, searchPMEModal, filtroDimensionPME, activeTab, buscarActividades]);

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
            id_subarea: null, // por defecto "Otros"
            id_grupo_recurso: recurso.id_grupo_recurso || null
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


    // Limpia el formulario y borra el borrador del panel en localStorage
    const limpiarFormularioRecurso = () => {
        if (panelStorageKey) {
            try {
                localStorage.removeItem(panelStorageKey);
            } catch (e) {
                console.error('Error al limpiar borrador:', e);
            }
        }
        borradorBaseRef.current = null;
        setBorradorRestaurado(false);
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
            id_subarea: null,
            id_grupo_recurso: null
        });
        setSearchPMEModal('');
        setIsEditando(false);
        setEditIndex(null);
        setFormatoEsOtros(false);
        setEsNuevoProducto(true);
        resetNuevoProducto();
        setLayoutModo('fases');
        setFaseActual(0);
        setCamposFaltantes(null);
    };

    const abrirNuevoManual = () => {
        // Si hay un borrador guardado previamente en localStorage, restaurarlo para no perder datos
        if (panelStorageKey) {
            try {
                const rawPanel = localStorage.getItem(panelStorageKey);
                if (rawPanel) {
                    const data = JSON.parse(rawPanel);
                    if (data && data.formularioRecurso && esInsumoYaGuardado(data.formularioRecurso, recursosActual)) {
                        localStorage.removeItem(panelStorageKey);
                    } else if (data && data.formularioRecurso && tieneContenidoBorrador(data.formularioRecurso)) {
                        setFormularioRecurso(data.formularioRecurso);
                        if (typeof data.faseActual === 'number') setFaseActual(data.faseActual);
                        if (data.layoutModo) setLayoutModo(data.layoutModo);
                        if (typeof data.isEditando === 'boolean') setIsEditando(data.isEditando);
                        if (data.editIndex !== undefined) setEditIndex(data.editIndex);
                        if (typeof data.esNuevoProducto === 'boolean') setEsNuevoProducto(data.esNuevoProducto);
                        if (data.grupoSeleccionado !== undefined) setGrupoSeleccionado(data.grupoSeleccionado);
                        if (data.categoriaSeleccionadaNuevo !== undefined) setCategoriaSeleccionadaNuevo(data.categoriaSeleccionadaNuevo);
                        if (data.catNuevoSearch !== undefined) setCatNuevoSearch(data.catNuevoSearch);
                        if (data.filtroDimensionPME !== undefined) setFiltroDimensionPME(data.filtroDimensionPME);
                        if (typeof data.formatoEsOtros === 'boolean') setFormatoEsOtros(data.formatoEsOtros);
                        if (data.busquedaActividadPME !== undefined) setBusquedaActividadPME(data.busquedaActividadPME);
                        setShowRecursoModal(true);
                        setBorradorRestaurado(true);
                        return;
                    }
                }
            } catch (e) {
                console.error('Error restaurando borrador en abrirNuevoManual:', e);
            }
        }
        // Si no hay borrador, limpiar e inicializar
        limpiarFormularioRecurso();
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

    // La copia se inserta justo debajo de la fila original (no al final). Varias
    // marcas de la tabla identifican la fila por su posición, así que las que
    // quedan debajo se corren una posición para no apuntar a la fila equivocada.
    const copiarRecurso = (index: number) => {
        // Los guardados en curso actualizan "la fila en la posición X" al volver del
        // servidor; insertar en medio los haría caer sobre otra fila.
        if (savingItems.length > 0 || guardandoTodos) {
            mostrarNotificacion('info', 'Guardado en curso', 'Espera a que termine de guardarse para copiar el insumo.');
            return;
        }
        const original = recursosActual[index];
        if (!original) return;
        const copia: DetallePresupuestoForm = {
            ...original,
            id_pre_detalle: undefined,
            _tempId: crypto.randomUUID(),
            _isClassifying: false
        } as DetallePresupuestoForm;
        const posCopia = index + 1;
        const correr = (i: number) => (i >= posCopia ? i + 1 : i);
        const correrSet = (prev: Set<number>) => new Set(Array.from(prev, correr));

        setRecursosActual(prev => [...prev.slice(0, posCopia), copia, ...prev.slice(posCopia)]);
        setFilasModificadas(correrSet);
        setFilasConfirmadasRecientes(correrSet);
        setGuardados(prev => prev.map(correr));
        setEditIndex(prev => (prev === null ? prev : correr(prev)));
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
            id_subarea: (rec as any).id_subarea ?? (user as any)?.id_subarea ?? null,
            id_grupo_recurso: (rec as any).id_grupo_recurso || (rec as any)._idGrupo || null
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
        if (formularioRecurso.descripcion.length > MAX_DETALLE_INSUMO) faltan.push(`Detalle del Insumo (máximo ${MAX_DETALLE_INSUMO} caracteres)`);
        if (formularioRecurso.motivo.length > MAX_MOTIVO_INSUMO) faltan.push(`Justificación / Motivo de Necesidad (máximo ${MAX_MOTIVO_INSUMO} caracteres)`);
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
            id_grupo_recurso: formularioRecurso.id_grupo_recurso ?? (esNuevoProducto ? grupoSeleccionado : undefined) ?? undefined,
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

        // Al confirmar y guardar con éxito el insumo, limpiar el borrador en localStorage.
        // El formulario conserva los datos hasta la próxima apertura; se marcan como punto de
        // partida para que el guardado automático no los vuelva a guardar como borrador.
        borradorBaseRef.current = firmaBorrador(formularioRecurso);
        if (panelStorageKey) {
            try { localStorage.removeItem(panelStorageKey); } catch {}
        }
        setBorradorRestaurado(false);

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
            id_grupo_recurso: formularioRecurso.id_grupo_recurso ?? (esNuevoProducto ? grupoSeleccionado : undefined) ?? undefined,
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
        const grupoActual = formularioRecurso.id_grupo_recurso;
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

        const siguienteFormulario = {
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
            id_subarea: subareaActual,
            id_grupo_recurso: grupoActual
        };
        // Lo arrastrado al siguiente insumo es el nuevo punto de partida: no es un borrador
        borradorBaseRef.current = firmaBorrador(siguienteFormulario as typeof formularioRecurso);
        if (panelStorageKey) {
            try { localStorage.removeItem(panelStorageKey); } catch {}
        }
        setBorradorRestaurado(false);
        setFormularioRecurso(siguienteFormulario as typeof formularioRecurso);

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
            id_grupo_recurso: formularioRecurso.id_grupo_recurso ?? undefined,
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

        // Al confirmar y guardar con éxito el insumo editado, limpiar el borrador en localStorage
        borradorBaseRef.current = firmaBorrador(formularioRecurso);
        if (panelStorageKey) {
            try { localStorage.removeItem(panelStorageKey); } catch {}
        }
        setBorradorRestaurado(false);

        setShowRecursoModal(false);
        setIsEditando(false);
    };

    const guardarRecursoIndividual = async (index: number, manualData?: any) => {
        const data = manualData || recursosActual[index];
        if (!data) return;

        const cantidadNum = Number(data.cantidad);
        if (!data.cantidad || isNaN(cantidadNum) || cantidadNum <= 0) {
            mostrarNotificacion(
                'warning',
                'Cantidad no válida',
                `El insumo "${data.nombre_producto || 'seleccionado'}" debe tener una cantidad mayor a 0 para poder guardarse en la solicitud.`
            );
            return;
        }

        const tieneMes = (data.fecha_ejecucion && data.fecha_ejecucion.trim() !== '') || (data.mes_ejecucion && String(data.mes_ejecucion).trim() !== '');
        if (!tieneMes) {
            mostrarNotificacion(
                'warning',
                'Mes / Período requerido',
                `El insumo "${data.nombre_producto || 'seleccionado'}" debe tener asignado un mes o fecha de ejecución antes de confirmarse.`
            );
            return;
        }

        setSavingItems(prev => [...prev, index]);

        try {
            // Producto nuevo (viene de "+ Nuevo Insumo"): primero se crea el recurso
            // como SUGERIDO (PENDIENTE_APROBACION) y se obtiene su id_recurso real.
            let idRecursoFinal = data.id_recurso ?? undefined;
            if (data._esNuevo && !data.id_recurso) {
                const idCatInicial = data._idCategoria;
                const idGrpInicial = data._idGrupo;

                // Sin clasificación automática por IA: se usa la categoría y la línea que eligió el
                // usuario (si no eligió, el recurso queda "Nuevo / Sugerido" sin categoría y el
                // administrador lo clasifica al aprobarlo).

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
            const anioActual = new Date().getFullYear();
            const fechaFinal = data.fecha_ejecucion && data.fecha_ejecucion.trim() !== ''
                ? data.fecha_ejecucion
                : (data.mes_ejecucion ? `${anioActual}-${data.mes_ejecucion}-01` : `${anioActual}-03-01`);

            const valor_unitario_iva = data.valor_unitario_iva ?? 0;
            const payload = {
                nombre_producto: data.nombre_producto,
                descripcion: data.descripcion ?? undefined,
                id_recurso: idRecursoFinal,
                codigo_cuenta: data.codigo_cuenta ?? undefined,
                formato_unidad: data.formato_unidad || 'Unidad',
                cantidad: Number(data.cantidad) || 1,
                valor_unitario: Math.round(valor_unitario_iva / 1.19),
                valor_unitario_iva,
                total_iva: data.total_iva ?? (Number(data.cantidad) || 1) * valor_unitario_iva,
                fecha_ejecucion: fechaFinal,
                fecha_termino: (data.fecha_termino && String(data.fecha_termino).trim() !== '') ? data.fecha_termino : undefined,
                tipo_fecha: data.tipo_fecha || 'mensual',
                motivo: data.motivo || 'Insumo presupuestario',
                id_actividad: data.id_actividad ?? undefined,
                id_subvencion: data.id_subvencion ?? undefined,
                destino_gasto: data.destino_gasto ?? '',
                id_subarea: data.id_subarea ?? undefined,
                id_grupo_recurso: data.id_grupo_recurso ?? data._idGrupo ?? undefined
            };

            if (data.id_pre_detalle) {
                // UPDATE
                await api.put(`/presupuesto/detalles/${data.id_pre_detalle}`, payload);
                setGuardados(prev => prev.includes(index) ? prev : [...prev, index]);
            } else {
                // CREATE
                const res = await api.post(`/presupuesto/solicitudes/${solicitudId}/recursos`, { detalles: [payload] });
                // `detalles` trae todos los ítems de la solicitud: el creado se ubica por su id.
                const idNuevo: number | undefined = res.data.ids_nuevos?.[0];
                const nuevoConId = idNuevo ? (res.data.detalles || []).find((d: any) => d.id_pre_detalle === idNuevo) : undefined;
                if (nuevoConId) {
                    // Actualización FUNCIONAL, obligatoria aquí: "Guardar todos
                    // pendientes" llama a esta función en un bucle con await, y con
                    // `[...recursosActual]` cada vuelta partía del array capturado en
                    // el render, deshaciendo las marcas de las vueltas anteriores. Solo
                    // la última fila quedaba como guardada, las demás seguían de
                    // borrador en localStorage y al recargar aparecían duplicadas
                    // (las persistidas del servidor + los borradores no limpiados).
                    const grpMatch = grupos.find(g => g.id_grupo_recurso === (nuevoConId.id_grupo_recurso || data.id_grupo_recurso));
                    setRecursosActual(prev => prev.map((item, i) => i === index
                        ? {
                            ...data,
                            id_pre_detalle: nuevoConId.id_pre_detalle,
                            id_recurso: nuevoConId.id_recurso ?? idRecursoFinal,
                            codigo_cuenta: nuevoConId.codigo_cuenta ?? null,
                            id_grupo_recurso: nuevoConId.id_grupo_recurso ?? data.id_grupo_recurso ?? null,
                            grupo_nombre: nuevoConId.grupo_nombre ?? grpMatch?.nombre ?? data.grupo_nombre ?? null,
                            _esNuevo: false,
                            _isClassifying: false
                        }
                        : item));
                    setGuardados(prev => [...prev, index]);
                }
            }
        } catch (error: any) {
            console.error('Error al persistir recurso:', error);
            const { mensaje, pista } = describirErrorApi(error, 'No se pudo guardar el insumo. Por favor verifica los datos ingresados.');
            mostrarNotificacion('error', 'Error al guardar insumo', mensaje, pista);
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

    // Subvención según el destino:
    // Alumnos / Estudiantes -> SEP
    // Funcionarios / Apoderados -> GENERAL
    // Premio / Beneficio -> SEP
    // Mantención / Servicio -> MANTENCION (o GENERAL si no existe código MANTENCION)
    const subvencionPorDestino = (destino: string | undefined | null, actual: number | null = null, idSubarea?: number | null): number | null => {
        let nuevaSubvId = actual;
        const subPIE = subvencionesActivas.find(s => s.nombre_corto.toUpperCase() === 'PIE');
        const subSEP = subvencionesActivas.find(s => s.nombre_corto.toUpperCase() === 'SEP' || (s as any).codigo?.toUpperCase() === 'SEP');
        const subGEN = subvencionesActivas.find(s => s.nombre_corto.toUpperCase() === 'GENERAL' || (s as any).codigo?.toUpperCase() === 'GENERAL');
        const subMAN = subvencionesActivas.find(s => s.nombre_corto.toUpperCase().includes('MANT') || (s as any).codigo?.toUpperCase().includes('MANT'));

        const destinoCanon = destinoCanonico(destino);

        if (destinoCanon === 'clases(alumno)' && subPIE && financiarConPIE && esContextoPIEDe(idSubarea)) {
            // Cargo o área PIE + Estudiantes → PIE
            nuevaSubvId = subPIE.id_subvencion;
        } else if (destinoCanon === 'clases(alumno)' || destinoCanon === 'premio/beneficio') {
            if (subSEP) nuevaSubvId = subSEP.id_subvencion;
        } else if (destinoCanon === 'oficinas(administracion)' || destinoCanon === 'apoderados') {
            if (subGEN) nuevaSubvId = subGEN.id_subvencion;
        } else if (destinoCanon === 'mantencion/servicio') {
            if (subMAN) nuevaSubvId = subMAN.id_subvencion;
            else if (subGEN) nuevaSubvId = subGEN.id_subvencion;
        }
        return nuevaSubvId;
    };

    const cambiarDestinoGasto = async (index: number, nuevoDestino: string) => {
        const itemOriginal = recursosActual[index];
        if (!itemOriginal) return;

        // El selector emite el valor canónico; se normaliza igual por si llega una
        // etiqueta antigua desde otro punto del código.
        const destinoCanon = destinoCanonico(nuevoDestino);
        const itemActualizado = {
            ...itemOriginal,
            destino_gasto: destinoCanon,
            id_subvencion: subvencionPorDestino(destinoCanon, (itemOriginal as any).id_subvencion || null, itemOriginal.id_subarea),
            // El código se vuelve a tomar del catálogo al guardar
            codigo_cuenta: undefined,
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
            mostrarNotificacion('error', 'Error al eliminar', 'No se pudo eliminar el recurso. Por favor intente nuevamente.');
        } finally {
            setIsEliminando(false);
        }
    };


    // Evita que un segundo clic (o un doble clic) reenvíe filas que ya se están
    // guardando: cada reenvío crearía un detalle duplicado en la solicitud.
    const guardandoTodosRef = useRef(false);
    const [guardandoTodos, setGuardandoTodos] = useState(false);
    const [progresoGuardado, setProgresoGuardado] = useState<string | null>(null);

    const guardarTodosPendientes = async (soloListos: boolean = false) => {
        if (guardandoTodosRef.current) return;

        const pendientes = recursosActual
            .map((rec, index) => ({ rec, index }))
            .filter(({ rec }) => !rec.id_pre_detalle);

        if (pendientes.length === 0) return;

        const sinCantidad = pendientes.filter(({ rec }) => !rec.cantidad || Number(rec.cantidad) <= 0 || isNaN(Number(rec.cantidad)));
        const sinMes = pendientes.filter(({ rec }) => (!rec.fecha_ejecucion || rec.fecha_ejecucion.trim() === '') && (!rec.mes_ejecucion || rec.mes_ejecucion.trim() === ''));
        const sinPrecio = pendientes.filter(({ rec }) => !rec.valor_unitario_iva || Number(rec.valor_unitario_iva) <= 0);
        const listos = pendientes.filter(({ rec }) => 
            (rec.cantidad && Number(rec.cantidad) > 0) &&
            ((rec.fecha_ejecucion && rec.fecha_ejecucion.trim() !== '') || (rec.mes_ejecucion && rec.mes_ejecucion.trim() !== ''))
        );

        const confirmadosCount = recursosActual.filter(r => !!r.id_pre_detalle).length;

        // Si hay insumos con datos incompletos y no se eligió explícitamente guardar solo los listos,
        // abrimos el modal de diagnóstico interactivo para que el usuario sepa exactamente el estado
        if (!soloListos && (sinCantidad.length > 0 || sinMes.length > 0)) {
            setModalDiagnosticoPendientes({
                totalConfirmados: confirmadosCount,
                totalPendientes: pendientes.length,
                sinCantidad: sinCantidad.length,
                sinMes: sinMes.length,
                sinPrecio: sinPrecio.length,
                listos: listos.length
            });
            return;
        }

        const itemsAProcesar = soloListos ? listos : pendientes;
        if (itemsAProcesar.length === 0) {
            mostrarNotificacion(
                'warning',
                'Insumos incompletos',
                'No hay insumos pendientes con datos completos (cantidad mayor a 0 y mes asignado) para guardar.'
            );
            return;
        }

        if (soloListos) {
            setModalDiagnosticoPendientes(null);
        }

        guardandoTodosRef.current = true;
        setGuardandoTodos(true);
        try {
            // 1. Sin clasificación automática por IA: los insumos nuevos se registran con la
            //    categoría y línea que eligió el usuario (o sin ellas, para que las asigne el administrador).

            // 2. Resolver sugerencia de recursos nuevos mediante el endpoint masivo /recursos/sugerir-lote
            setProgresoGuardado(`Procesando insumos a registrar en catálogo…`);
            const mapaRecursosFinales: Record<number, number | undefined> = {};
            const totalmenteNuevos = itemsAProcesar.filter(({ rec }) => !rec.id_recurso);

            let totalCreadosCatalogo = 0;
            let totalReutilizadosCatalogo = 0;

            if (totalmenteNuevos.length > 0) {
                const recursosPayload = totalmenteNuevos.map(({ rec, index }) => ({
                    ref: String(index),
                    nombre: rec.nombre_producto,
                    descripcion_solicitud: rec.descripcion || rec.nombre_producto,
                    formato: rec.formato_unidad || 'Unidad',
                    id_cat_recurso: (rec as any).id_cat_recurso || (rec as any)._idCategoria || undefined,
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
            for (const { rec, index } of itemsAProcesar) {
                if (!mapaRecursosFinales[index]) {
                    mapaRecursosFinales[index] = rec.id_recurso ?? undefined;
                }
            }

            // 3. Construir el payload masivo con TODOS los detalles en una sola peticion HTTP
            setProgresoGuardado(`Guardando los ${itemsAProcesar.length} recursos en el servidor…`);
            const anioActual = new Date().getFullYear();
            const detallesPayload = itemsAProcesar.map(({ rec, index }) => {
                const valor_unitario_iva = rec.valor_unitario_iva ?? 0;
                const fechaFinal = rec.fecha_ejecucion && rec.fecha_ejecucion.trim() !== ''
                    ? rec.fecha_ejecucion
                    : (rec.mes_ejecucion ? `${anioActual}-${rec.mes_ejecucion}-01` : `${anioActual}-03-01`);

                return {
                    nombre_producto: rec.nombre_producto,
                    descripcion: rec.descripcion ?? undefined,
                    id_recurso: mapaRecursosFinales[index],
                    codigo_cuenta: rec.codigo_cuenta ?? undefined,
                    formato_unidad: rec.formato_unidad || 'Unidad',
                    cantidad: Number(rec.cantidad) || 1,
                    valor_unitario: Math.round(valor_unitario_iva / 1.19),
                    valor_unitario_iva,
                    total_iva: rec.total_iva ?? (Number(rec.cantidad) || 1) * valor_unitario_iva,
                    fecha_ejecucion: fechaFinal,
                    fecha_termino: (rec.fecha_termino && String(rec.fecha_termino).trim() !== '') ? rec.fecha_termino : undefined,
                    tipo_fecha: rec.tipo_fecha || 'mensual',
                    motivo: rec.motivo || 'Insumo presupuestario',
                    id_actividad: rec.id_actividad ?? undefined,
                    id_subvencion: (rec as any).id_subvencion ?? undefined,
                    destino_gasto: (rec as any).destino_gasto ?? '',
                    id_subarea: rec.id_subarea ?? undefined
                };
            });

            // UNA SOLA PETICION HTTP MASIVA
            const res = await api.post(`/presupuesto/solicitudes/${solicitudId}/recursos`, { detalles: detallesPayload });
            // `detalles` trae todos los ítems de la solicitud: los creados se ubican por
            // `ids_nuevos`, que viene en el mismo orden en que se enviaron.
            const porId = new Map<number, any>((res.data.detalles || []).map((d: any) => [d.id_pre_detalle, d]));
            const nuevosDetalles: any[] = (res.data.ids_nuevos || []).map((id: number) => porId.get(id)).filter(Boolean);

            // Actualizar el estado local con los IDs reales devueltos por la BD
            const indicesProcesados = new Set(itemsAProcesar.map(it => it.index));
            setRecursosActual(prev => {
                let detIdx = 0;
                return prev.map((item, idx) => {
                    if (indicesProcesados.has(idx) && !item.id_pre_detalle) {
                        const devuelto = nuevosDetalles[detIdx];
                        detIdx++;
                        if (devuelto) {
                            return {
                                ...item,
                                id_pre_detalle: devuelto.id_pre_detalle,
                                id_recurso: devuelto.id_recurso || item.id_recurso,
                                codigo_cuenta: devuelto.codigo_cuenta ?? null,
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
                total: itemsAProcesar.length,
                nuevos: totalCreadosCatalogo,
                reutilizados: itemsAProcesar.length - totalCreadosCatalogo
            });
        } catch (err: any) {
            console.error('Error al guardar todos los pendientes masivamente:', err);
            const { mensaje, pista } = describirErrorApi(err, 'No se pudieron guardar los insumos pendientes.');
            mostrarNotificacion('error', 'Error al guardar pendientes', mensaje, pista);
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
    }, [filtroPresupuesto, filtroEstadoPpto, filtroMeses, filtroDestinos, filtroMotivos, filtroDimensiones, filtroActividades, filtroCargos, itemsPorPaginaPpto]);

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

    // Cargo solicitante: se agrupa por el mismo nombre que muestra la columna
    // "Cargo / Destinatario" (el detalle guarda el cargo, no el usuario).
    const opcionesFiltroCargos = useMemo(() => {
        const counts = new Map<string, number>();
        let sinCargoCount = 0;
        recursosActual.forEach(r => {
            const c = nombreSubareaDeFila(r);
            if (c) {
                counts.set(c, (counts.get(c) || 0) + 1);
            } else {
                sinCargoCount++;
            }
        });
        const opciones = Array.from(counts.entries())
            .map(([cargo, count]) => ({ valor: cargo, label: cargo, count }))
            .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
        return { opciones, sinCargoCount };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recursosActual, todasSubareas, solicitud?.subarea_nombre]);

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
        || filtroActividades.length > 0
        || filtroCargos.length > 0;

    const totalFiltrosActivos = (filtroPresupuesto.trim() !== '' ? 1 : 0)
        + (filtroEstadoPpto !== 'todos' ? 1 : 0)
        + filtroMeses.length
        + filtroDestinos.length
        + filtroMotivos.length
        + filtroDimensiones.length
        + filtroActividades.length
        + filtroCargos.length;

    const limpiarTodosFiltros = () => {
        setFiltroPresupuesto('');
        setFiltroEstadoPpto('todos');
        setFiltroMeses([]);
        setFiltroDestinos([]);
        setFiltroMotivos([]);
        setFiltroDimensiones([]);
        setFiltroActividades([]);
        setFiltroCargos([]);
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

            // 6. Filtro Cargo solicitante (Multiselección)
            const cargoRec = nombreSubareaDeFila(rec) || '';
            const matchCargo = filtroCargos.length === 0 || filtroCargos.some(c => {
                if (c === '__SIN_CARGO__') return !cargoRec;
                return cargoRec === c;
            });

            return matchTexto && matchEstado && matchMes && matchDestino && matchMotivos && matchDimension && matchActividad && matchCargo;
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
    // (Nuevo Insumo, Importar Excel, ayuda de dimensiones) viven al
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

                    {/* Fila de Filtros Avanzados con selección múltiple: Mes, Destino, Motivo, Dimensión PME, Actividad PME, Cargo solicitante */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 pt-2 border-t border-gray-200/60">
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

                        {/* 6. Filtro Cargo solicitante */}
                        <FiltroMultiSelectGenerico
                            icono="👤"
                            tituloVacio="Todos los Cargos"
                            tituloPlural="Cargos"
                            seleccionados={filtroCargos}
                            onChange={setFiltroCargos}
                            opciones={opcionesFiltroCargos.opciones}
                            opcionSinValor={opcionesFiltroCargos.sinCargoCount > 0 ? {
                                valorEspecial: '__SIN_CARGO__',
                                label: '— Sin cargo —',
                                count: opcionesFiltroCargos.sinCargoCount
                            } : undefined}
                            placeholderBusqueda="Buscar cargo solicitante..."
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
                                                                        Guardando...
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
                                            onClick={() => {
                                                setActiveTab('historial');
                                                setSidebarCollapsed(false);
                                                if (solicitudesAnteriores.length === 0) cargarHistorial();
                                            }}
                                            className={`p-2.5 rounded-xl transition-all ${activeTab === 'historial' ? 'bg-primary text-white' : 'text-gray-400 hover:bg-primary/5 hover:text-primary'}`}
                                            title="Historial"
                                        >
                                            <History size={17} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="p-5">
                                        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-gray-100">
                                            {/* Pestañas de navegación del Sidebar */}
                                            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl flex-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveTab('buscador')}
                                                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                        activeTab === 'buscador'
                                                            ? 'bg-white text-primary shadow-xs'
                                                            : 'text-gray-500 hover:text-gray-900'
                                                    }`}
                                                >
                                                    <Search size={13} />
                                                    <span>Insumos</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveTab('pme')}
                                                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                        activeTab === 'pme'
                                                            ? 'bg-white text-primary shadow-xs'
                                                            : 'text-gray-500 hover:text-gray-900'
                                                    }`}
                                                >
                                                    <ClipboardList size={13} />
                                                    <span>PME</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveTab('historial');
                                                        if (solicitudesAnteriores.length === 0) cargarHistorial();
                                                    }}
                                                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                        activeTab === 'historial'
                                                            ? 'bg-white text-primary shadow-xs'
                                                            : 'text-gray-500 hover:text-gray-900'
                                                    }`}
                                                >
                                                    <History size={13} />
                                                    <span>Anteriores</span>
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => setSidebarCollapsed(true)}
                                                className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all shrink-0"
                                                title="Colapsar panel lateral"
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
                                                    {/* Selector de Alcance: Mis solicitudes vs Compartidas del Colegio */}
                                                    <div className="flex items-center p-1 bg-gray-100 rounded-xl">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setFiltroAlcanceHistorial('area');
                                                                setFiltroSolicitudHistorial('');
                                                                cargarHistorial('area');
                                                            }}
                                                            className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-lg transition-all ${
                                                                filtroAlcanceHistorial === 'area'
                                                                    ? 'bg-white text-primary shadow-xs'
                                                                    : 'text-gray-500 hover:text-gray-800'
                                                            }`}
                                                        >
                                                            👥 De Mi Área / Equipo
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setFiltroAlcanceHistorial('mis');
                                                                setFiltroSolicitudHistorial('');
                                                                cargarHistorial('mis');
                                                            }}
                                                            className={`flex-1 py-1.5 px-2 text-[11px] font-bold rounded-lg transition-all ${
                                                                filtroAlcanceHistorial === 'mis'
                                                                    ? 'bg-white text-primary shadow-xs'
                                                                    : 'text-gray-500 hover:text-gray-800'
                                                            }`}
                                                        >
                                                            👤 Solo Mías
                                                        </button>
                                                    </div>

                                                    {/* Selector de solicitudes aprobadas */}
                                                    {(() => {
                                                        const codigosUnicos = solicitudesAnteriores.map(x => x.codigo);
                                                        return (
                                                            <div className="space-y-1">
                                                                <div className="flex items-center justify-between">
                                                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider ml-0.5">
                                                                        Filtrar por Solicitud Anterior:
                                                                    </label>
                                                                    {cargandoHistorial && (
                                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-primary animate-pulse">
                                                                            <Loader2 size={11} className="animate-spin" /> Cargando...
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <select
                                                                    value={filtroSolicitudHistorial}
                                                                    onChange={(e) => {
                                                                        setFiltroSolicitudHistorial(e.target.value);
                                                                        setFiltroMotivosHistorial([]);
                                                                        setFiltroActividadesHistorial([]);
                                                                        setFiltroCargosHistorial([]);
                                                                        setFiltroMesesHistorial([]);
                                                                        setBusquedaHistorial('');
                                                                        if (e.target.value) cargarItemsAnterior(e.target.value);
                                                                        else { setHistorialRecursos([]); setSelectedHistorial([]); }
                                                                    }}
                                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-xs font-bold text-gray-800 cursor-pointer"
                                                                >
                                                                    <option value="">-- Elige una solicitud anterior ({codigosUnicos.length}) --</option>
                                                                    {codigosUnicos.map(cod => {
                                                                        const solAnt = solicitudesAnteriores.find(x => x.codigo === cod);
                                                                        const cargo = solAnt?.cargo_nombre ? ` • ${solAnt.cargo_nombre}` : '';
                                                                        const count = solAnt?.n_items || 0;
                                                                        return (
                                                                            <option key={cod} value={cod}>
                                                                                📋 {cod}{cargo} ({count} ítems)
                                                                            </option>
                                                                        );
                                                                    })}
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
                                                        const cod = filtroSolicitudHistorial;
                                                        const count = historialRecursos.filter(h => h.codigo_solicitud === cod).length;
                                                        if (!cod || count === 0) return null;
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
                                                {/* Buscador por nombre y filtro múltiple por motivo */}
                                                {historialBase.length > 0 && (
                                                <div className="space-y-2">
                                                    <div className="relative">
                                                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                        <input
                                                            type="text"
                                                            value={busquedaHistorial}
                                                            onChange={(e) => setBusquedaHistorial(e.target.value)}
                                                            placeholder="Buscar insumo por nombre..."
                                                            className="w-full pl-8 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                                                        />
                                                        {busquedaHistorial && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setBusquedaHistorial('')}
                                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-md"
                                                                title="Limpiar búsqueda"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {opcionesMotivoHistorial.length > 0 && (
                                                        <FiltroMultiSelectGenerico
                                                            icono="📝"
                                                            tituloVacio="Todos los motivos"
                                                            tituloPlural="motivos"
                                                            seleccionados={filtroMotivosHistorial}
                                                            onChange={setFiltroMotivosHistorial}
                                                            opciones={opcionesMotivoHistorial}
                                                            placeholderBusqueda="Buscar motivo..."
                                                            anchoMinimo="min-w-[260px]"
                                                        />
                                                    )}
                                                    {/* Actividades PME: solo las usadas en esta solicitud anterior */}
                                                    {opcionesActividadHistorial.length > 0 && (
                                                        <FiltroMultiSelectGenerico
                                                            icono="🎯"
                                                            tituloVacio="Todas las actividades PME"
                                                            tituloPlural="actividades"
                                                            seleccionados={filtroActividadesHistorial}
                                                            onChange={setFiltroActividadesHistorial}
                                                            opciones={opcionesActividadHistorial}
                                                            placeholderBusqueda="Buscar actividad..."
                                                            anchoMinimo="min-w-[300px]"
                                                        />
                                                    )}
                                                    {opcionesCargoHistorial.length > 0 && (
                                                        <FiltroMultiSelectGenerico
                                                            icono="👥"
                                                            tituloVacio="Todos los cargos / subáreas"
                                                            tituloPlural="cargos"
                                                            seleccionados={filtroCargosHistorial}
                                                            onChange={setFiltroCargosHistorial}
                                                            opciones={opcionesCargoHistorial}
                                                            placeholderBusqueda="Buscar cargo..."
                                                            anchoMinimo="min-w-[260px]"
                                                        />
                                                    )}
                                                    {opcionesMesHistorial.length > 0 && (
                                                        <FiltroMultiSelectGenerico
                                                            icono="🗓️"
                                                            tituloVacio="Todos los meses"
                                                            tituloPlural="meses"
                                                            seleccionados={filtroMesesHistorial}
                                                            onChange={setFiltroMesesHistorial}
                                                            opciones={opcionesMesHistorial}
                                                            placeholderBusqueda="Buscar mes..."
                                                            anchoMinimo="min-w-[220px]"
                                                        />
                                                    )}
                                                    {(busquedaHistorial || filtroMotivosHistorial.length > 0 || filtroActividadesHistorial.length > 0 || filtroCargosHistorial.length > 0 || filtroMesesHistorial.length > 0) && (
                                                        <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500">
                                                            <span>{historialFiltrado.length} de {historialBase.length} ítems</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setBusquedaHistorial(''); setFiltroMotivosHistorial([]); setFiltroActividadesHistorial([]); setFiltroCargosHistorial([]); setFiltroMesesHistorial([]); }}
                                                                className="text-red-600 hover:underline font-bold"
                                                            >
                                                                Limpiar filtros
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                )}

                                                <div className="max-h-[440px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                                    {historialPagina
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
                                                                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                                            <span className="text-[9px] font-semibold text-gray-500 bg-gray-200/70 px-1.5 py-0.5 rounded">
                                                                                {h.codigo_solicitud}
                                                                            </span>
                                                                            {/* Cargo solicitante del insumo (el elegido en "Cargo solicitante"),
                                                                                no el usuario que lo registró: ese queda solo en el tooltip. */}
                                                                            {cargoDe(h) !== SIN_CARGO && (
                                                                                <span className="text-[9px] text-primary/80 font-medium truncate max-w-[130px]" title={`Cargo solicitante: ${cargoDe(h)}${h.solicitante_nombre ? ` · Registrado por: ${h.solicitante_nombre}` : ''}`}>
                                                                                    👤 {cargoDe(h)}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <p className="text-[10px] font-bold text-primary mt-1">{formatCLP(h.valor_unitario_iva)}</p>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setDetalleAnterior(h)}
                                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors shrink-0"
                                                                        title="Ver detalle del insumo en ese presupuesto"
                                                                    >
                                                                        <Eye size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    {historialFiltrado.length === 0 && !cargandoHistorial && (
                                                        <div className="p-8 text-center text-gray-400 italic text-sm">
                                                            {!filtroSolicitudHistorial
                                                                ? (solicitudesAnteriores.length > 0
                                                                    ? 'Elige una solicitud anterior para ver sus ítems'
                                                                    : 'No hay solicitudes anteriores con ítems aprobados')
                                                                : historialBase.length === 0
                                                                    ? 'Esta solicitud no tiene ítems aprobados disponibles'
                                                                    : 'Ningún ítem coincide con la búsqueda'}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Paginación (25 por página) */}
                                                {historialFiltrado.length > HISTORIAL_POR_PAGINA && (
                                                    <div className="flex items-center justify-between gap-2 pt-1">
                                                        <span className="text-[10px] font-semibold text-gray-500">
                                                            {(paginaHistorialActual - 1) * HISTORIAL_POR_PAGINA + 1}–{Math.min(paginaHistorialActual * HISTORIAL_POR_PAGINA, historialFiltrado.length)} de {historialFiltrado.length}
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setPaginaHistorial(p => Math.max(1, p - 1))}
                                                                disabled={paginaHistorialActual <= 1}
                                                                className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                aria-label="Página anterior"
                                                            >
                                                                <ChevronLeft size={14} />
                                                            </button>
                                                            <span className="text-[11px] font-bold text-gray-700 px-1.5">
                                                                {paginaHistorialActual} / {totalPaginasHistorial}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setPaginaHistorial(p => Math.min(totalPaginasHistorial, p + 1))}
                                                                disabled={paginaHistorialActual >= totalPaginasHistorial}
                                                                className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                aria-label="Página siguiente"
                                                            >
                                                                <ChevronRight size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
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
                                            <div className="w-56">
                                                <FiltroMultiSelectGenerico
                                                    icono="👤"
                                                    tituloVacio="Todos los Cargos"
                                                    tituloPlural="Cargos"
                                                    seleccionados={filtroCargos}
                                                    onChange={setFiltroCargos}
                                                    opciones={opcionesFiltroCargos.opciones}
                                                    opcionSinValor={opcionesFiltroCargos.sinCargoCount > 0 ? {
                                                        valorEspecial: '__SIN_CARGO__',
                                                        label: '— Sin cargo —',
                                                        count: opcionesFiltroCargos.sinCargoCount
                                                    } : undefined}
                                                    placeholderBusqueda="Buscar cargo solicitante..."
                                                />
                                            </div>
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

                                            {/* Limpia todos: los filtros avanzados puestos en la vista ampliada también aplican aquí */}
                                            {filtroActivo && (
                                                <button
                                                    type="button"
                                                    onClick={limpiarTodosFiltros}
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

                                {/* Aviso detallado: estado de insumos y recursos sin confirmar */}
                                {recursosActual.some(r => !r.id_pre_detalle) && (
                                    <div className="mx-4 mt-4 bg-gradient-to-r from-amber-50 to-orange-50/50 border border-amber-200/90 rounded-2xl p-4 animate-in slide-in-from-top-1 duration-200 shadow-xs">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-amber-500 text-base shrink-0">⚠️</span>
                                                    <span className="text-xs font-black text-amber-950 uppercase tracking-wider">
                                                        Control de Insumos:
                                                    </span>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                        ✓ {statsPendientes.totalConfirmados} Confirmados
                                                    </span>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                                                        ⏳ {statsPendientes.totalPendientes} Pendientes
                                                    </span>
                                                    {statsPendientes.sinCantidad > 0 && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-red-100 text-red-700 border border-red-200 animate-pulse">
                                                            ⚠️ {statsPendientes.sinCantidad} sin cantidad (0)
                                                        </span>
                                                    )}
                                                    {statsPendientes.sinMes > 0 && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-orange-100 text-orange-800 border border-orange-200">
                                                            📅 {statsPendientes.sinMes} sin mes
                                                        </span>
                                                    )}
                                                    {statsPendientes.listos > 0 && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                                                            ✨ {statsPendientes.listos} listos
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[12px] text-amber-900/90 leading-relaxed font-medium">
                                                    {statsPendientes.tieneIncompletos ? (
                                                        <>Hay <b className="font-extrabold">{statsPendientes.totalPendientes} insumo(s)</b> en borrador. Para guardarlos en la solicitud deben tener <b>cantidad mayor a 0</b> y <b>mes asignado</b>.</>
                                                    ) : (
                                                        <>Los <b className="font-extrabold">{statsPendientes.totalPendientes} insumo(s)</b> pendientes tienen sus datos completos y están listos para guardarse.</>
                                                    )}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                                <button
                                                    onClick={eliminarTodosPendientes}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100/80 hover:bg-red-200 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0 cursor-pointer"
                                                    title="Eliminar todos los recursos en borrador sin guardar"
                                                >
                                                    <Trash2 size={13} /> Eliminar pendientes
                                                </button>
                                                <button
                                                    onClick={() => guardarTodosPendientes(false)}
                                                    disabled={guardandoTodos}
                                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed text-white cursor-pointer ${
                                                        statsPendientes.tieneIncompletos
                                                            ? 'bg-amber-600 hover:bg-amber-700'
                                                            : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                                                    }`}
                                                >
                                                    {guardandoTodos ? (
                                                        <><Loader2 size={14} className="animate-spin" /> {progresoGuardado || 'Guardando…'}</>
                                                    ) : statsPendientes.tieneIncompletos ? (
                                                        <><AlertTriangle size={14} /> Revisar y Guardar pendientes ({statsPendientes.totalPendientes})</>
                                                    ) : (
                                                        <><Save size={14} /> Guardar todos pendientes ({statsPendientes.totalPendientes})</>
                                                    )}
                                                </button>
                                            </div>
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
                                                                        Guardando...
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                                                                    !rec.id_pre_detalle && (!rec.fecha_ejecucion || rec.fecha_ejecucion.trim() === '') && (!rec.mes_ejecucion || rec.mes_ejecucion.trim() === '')
                                                                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                                                        : 'bg-gray-100 text-gray-500'
                                                                }`}>
                                                                    {(!rec.id_pre_detalle && (!rec.fecha_ejecucion || rec.fecha_ejecucion.trim() === '') && (!rec.mes_ejecucion || rec.mes_ejecucion.trim() === ''))
                                                                        ? 'Sin Mes'
                                                                        : labelFecha(rec)}
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
                                                            <span className={`px-2.5 py-1 rounded-lg text-[11px] tracking-tight ${
                                                                !rec.id_pre_detalle && (!rec.cantidad || Number(rec.cantidad) <= 0)
                                                                    ? 'bg-red-100 text-red-700 border border-red-200 font-extrabold'
                                                                    : 'bg-gray-100'
                                                            }`} title={!rec.id_pre_detalle && (!rec.cantidad || Number(rec.cantidad) <= 0) ? 'Cantidad en 0. Debes asignarle una cantidad mayor a 0.' : undefined}>
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
                                            {formularioRecurso.id_grupo_recurso && (
                                                <>
                                                    <span className="text-gray-300 text-[10px]">·</span>
                                                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                                                        📁 {grupos.find(g => g.id_grupo_recurso === formularioRecurso.id_grupo_recurso)?.nombre || 'Línea asignada'}
                                                    </span>
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
                                    <button
                                        type="button"
                                        onClick={() => setShowRecursoModal(false)}
                                        className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-800 rounded-xl transition-all border border-rose-200 hover:border-rose-300 flex items-center justify-center cursor-pointer shadow-xs active:scale-95"
                                        title="Cerrar panel"
                                    >
                                        <X size={18} strokeWidth={2.5} />
                                    </button>
                                </div>
                            </div>

                            {/* Banner informativo de persistencia automática en localStorage */}
                            {hayBorrador(formularioRecurso) && (
                                <div className="mt-3 px-3.5 py-1.5 bg-emerald-50/90 border border-emerald-200/90 rounded-xl flex items-center justify-between text-[11px] text-emerald-900 animate-in fade-in duration-200">
                                    <span className="flex items-center gap-1.5 font-medium">
                                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <span>💾 <strong>Datos protegidos:</strong> guardados automáticamente en tu navegador.</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={limpiarFormularioRecurso}
                                        className="text-[10px] font-bold text-emerald-800 hover:text-red-700 hover:underline cursor-pointer ml-2 flex items-center gap-1 transition-colors"
                                        title="Descartar borrador y limpiar el formulario"
                                    >
                                        <span>🗑️</span> Descartar borrador
                                    </button>
                                </div>
                            )}

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
                                                setFormularioRecurso(prev => ({ ...prev, destino_gasto: val, id_subvencion: null, codigo_cuenta: null }));
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

                                    {/* 2.1 Grupo / Línea de compras */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                                <span>📁 Grupo / Línea</span>
                                                {formularioRecurso.id_grupo_recurso && (
                                                    <span className="text-[9px] px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                                                        {grupos.find(g => g.id_grupo_recurso === formularioRecurso.id_grupo_recurso)?.nombre || 'Asignado'}
                                                    </span>
                                                )}
                                            </label>
                                            <span className="text-[10px] text-gray-400 font-medium">Clasificación de compras</span>
                                        </div>
                                        <select
                                            value={formularioRecurso.id_grupo_recurso ?? ''}
                                            onChange={(e) => {
                                                const val = e.target.value ? Number(e.target.value) : null;
                                                cambiarGrupo(val);
                                            }}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-semibold text-xs text-gray-900 focus:outline-none"
                                        >
                                            <option value="">-- Sin Grupo / Línea (Opcional) --</option>
                                            {grupos.map(g => (
                                                <option key={g.id_grupo_recurso} value={g.id_grupo_recurso}>
                                                    {g.nombre}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-gray-500 font-medium ml-1">
                                            Permite clasificar el recurso (Librería, Aseo, Tecnología, Salud, etc.). Se sugiere automáticamente con el motivo.
                                        </p>
                                    </div>

                                    {/* 3. Detalle del Insumo */}
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 mb-1 ml-1">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                                                Detalle del Insumo <span className="text-red-500">*</span>
                                            </label>
                                                <LimiteCaracteres actual={formularioRecurso.descripcion.length} max={MAX_DETALLE_INSUMO} />
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
                                        <textarea rows={3} maxLength={MAX_DETALLE_INSUMO} value={formularioRecurso.descripcion} onChange={(e) => setFormularioRecurso({ ...formularioRecurso, descripcion: e.target.value })}
                                            className={`w-full px-4 py-3 rounded-xl transition-all font-medium placeholder:font-medium text-xs resize-none focus:outline-none ${formularioRecurso.descripcion.trim() ? 'bg-white border border-gray-200 hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10' : 'bg-white border-2 border-red-300 hover:border-red-400 focus:border-red-400 focus:ring-4 focus:ring-red-100 placeholder:text-gray-400'}`}
                                            placeholder="Ej: Silla ergonómica negra con ruedas, respaldo alto, altura regulable. Lapicera punta fina azul BIC. Resma papel carta 75g..."
                                        />
                                        {!formularioRecurso.descripcion.trim() && (
                                            <p className="text-[10px] text-red-500 font-medium ml-1 mt-1">Este campo es obligatorio: especifique las características.</p>
                                        )}
                                    </div>

                                    {/* 4. Justificación / Motivo de Necesidad */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                                <span>Justificación / Motivo de Necesidad</span>
                                                <LimiteCaracteres actual={formularioRecurso.motivo.length} max={MAX_MOTIVO_INSUMO} />
                                                <span className="text-red-500">*</span>
                                            </label>
                                            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[9px] font-bold uppercase tracking-wider border border-red-200">Obligatorio</span>
                                        </div>

                                        {/* Selector combo: Únicamente motivos creados/usados previamente por el usuario actual */}
                                        <div>
                                            <select
                                                value={
                                                    motivosUsuario.includes(formularioRecurso.motivo.trim())
                                                        ? formularioRecurso.motivo.trim()
                                                        : ''
                                                }
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val) {
                                                        aplicarMotivo(val);
                                                    }
                                                }}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all font-semibold text-xs text-gray-800 focus:outline-none"
                                            >
                                                <option value="">
                                                    {motivosUsuario.length > 0
                                                        ? `-- Mis motivos anteriores (${motivosUsuario.length}) --`
                                                        : '-- Sin motivos previos del usuario --'}
                                                </option>
                                                {motivosUsuario.map((mot, idx) => (
                                                    <option key={idx} value={mot}>
                                                        {mot}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Sugeridos: Motivos oficiales predeterminados registrados */}
                                        {motivosOficiales.filter(m => m.activo).length > 0 && (
                                            <div className="flex items-center gap-1.5 flex-wrap text-[11px] pt-0.5 pb-0.5">
                                                <span className="text-gray-400 font-bold text-[9px] uppercase tracking-wider">Sugeridos:</span>
                                                {motivosOficiales.filter(m => m.activo).map(mo => {
                                                    const isSelected = formularioRecurso.motivo.trim().toLowerCase() === mo.nombre.toLowerCase();
                                                    return (
                                                        <button
                                                            key={mo.id_motivo}
                                                            type="button"
                                                            onClick={() => aplicarMotivo(mo.nombre)}
                                                            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border flex items-center gap-1 cursor-pointer ${
                                                                isSelected
                                                                    ? 'bg-primary text-white border-primary shadow-xs'
                                                                    : 'bg-gray-50 hover:bg-primary/5 text-gray-700 border-gray-200 hover:border-primary/40'
                                                            }`}
                                                            title={mo.grupo_nombre ? `Motivo: ${mo.nombre} · Línea: ${mo.grupo_nombre}` : `Motivo: ${mo.nombre}`}
                                                        >
                                                            <span>{mo.nombre}</span>
                                                            {mo.grupo_nombre && (
                                                                <span className={`text-[8.5px] px-1 py-0.2 rounded font-bold ${
                                                                    isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                                                                }`}>
                                                                    {mo.grupo_nombre}
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Área de texto libre y editable sin bloqueos */}
                                        <div className="relative">
                                            <textarea
                                                rows={2}
                                                maxLength={MAX_MOTIVO_INSUMO}
                                                value={formularioRecurso.motivo}
                                                onChange={(e) => {
                                                    setFormularioRecurso(prev => ({ ...prev, motivo: e.target.value }));
                                                }}
                                                className={`w-full px-4 py-2.5 rounded-xl transition-all font-semibold text-xs resize-none text-gray-900 focus:outline-none ${formularioRecurso.motivo.trim() ? 'bg-white border border-gray-200 hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10' : 'bg-white border-2 border-red-300 hover:border-red-400 focus:border-red-400 focus:ring-4 focus:ring-red-100 placeholder:text-gray-400'}`}
                                                placeholder="Puedes ajustar el motivo o escribir uno personalizado..."
                                            />
                                            {formularioRecurso.motivo.trim() && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFormularioRecurso(prev => ({ ...prev, motivo: '' }))}
                                                    className="absolute right-2.5 top-2.5 text-gray-300 hover:text-gray-500 text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center hover:bg-gray-100 cursor-pointer"
                                                    title="Limpiar motivo"
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>

                                        {/* Badge de Grupo / Línea vinculado */}
                                        {formularioRecurso.id_grupo_recurso && (
                                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-800 bg-emerald-50/80 border border-emerald-200 px-3 py-1.5 rounded-xl animate-in fade-in duration-150">
                                                <span className="font-bold">📁 Línea sugerida:</span>
                                                <span className="font-extrabold text-emerald-950">
                                                    {grupos.find(g => g.id_grupo_recurso === formularioRecurso.id_grupo_recurso)?.nombre || 'Asignado'}
                                                </span>
                                                <span className="text-emerald-600 text-[9px] ml-auto">Válido para compras</span>
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
                                                    setFormularioRecurso(prev => ({
                                                        ...prev,
                                                        destino_gasto: val,
                                                        id_subvencion: null,
                                                        codigo_cuenta: null
                                                    }));
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

                                    {/* Grupo / Línea de compras */}
                                    {!esNuevoProducto && (
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                                    <span>📁 Grupo / Línea</span>
                                                    {formularioRecurso.id_grupo_recurso && (
                                                        <span className="text-[9px] px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                                                            {grupos.find(g => g.id_grupo_recurso === formularioRecurso.id_grupo_recurso)?.nombre || 'Asignado'}
                                                        </span>
                                                    )}
                                                </label>
                                                <span className="text-[10px] text-gray-400 font-medium">Clasificación de compras</span>
                                            </div>
                                            <select
                                                value={formularioRecurso.id_grupo_recurso ?? ''}
                                                onChange={(e) => {
                                                    const val = e.target.value ? Number(e.target.value) : null;
                                                    cambiarGrupo(val);
                                                }}
                                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-semibold text-xs text-gray-900 focus:outline-none"
                                            >
                                                <option value="">-- Sin Grupo / Línea (Opcional) --</option>
                                                {grupos.map(g => (
                                                    <option key={g.id_grupo_recurso} value={g.id_grupo_recurso}>
                                                        {g.nombre}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-[10px] text-gray-500 font-medium ml-1">
                                                Permite agrupar insumos por tipo de compra (Librería, Aseo, Tecnología, Salud, etc.). Se sugiere automáticamente con el motivo.
                                            </p>
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
                                                    <LimiteCaracteres actual={formularioRecurso.descripcion.length} max={MAX_DETALLE_INSUMO} />
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
                                            <textarea ref={detalleInsumoRef} rows={3} maxLength={MAX_DETALLE_INSUMO} value={formularioRecurso.descripcion} onChange={(e) => setFormularioRecurso({ ...formularioRecurso, descripcion: e.target.value })}
                                                className={`w-full px-4 py-3 rounded-xl transition-all font-medium placeholder:font-medium text-xs resize-none focus:outline-none ${formularioRecurso.descripcion.trim() ? 'bg-white border border-gray-200 hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10' : 'bg-white border-2 border-red-300 hover:border-red-400 focus:border-red-400 focus:ring-4 focus:ring-red-100 placeholder:text-gray-400'}`}
                                                placeholder="Ej: Silla ergonómica negra con ruedas, respaldo alto, altura regulable. Lapicera punta fina azul BIC. Resma papel carta 75g..."
                                            />
                                            {!formularioRecurso.descripcion.trim() && (
                                                <p className="text-[10px] text-red-500 font-medium ml-1 mt-1">Este campo es obligatorio: especifique las características.</p>
                                            )}
                                        </div>
                                    )}
                                    {!esNuevoProducto && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                                    <span>Justificación / Motivo de Necesidad</span>
                                                    <LimiteCaracteres actual={formularioRecurso.motivo.length} max={MAX_MOTIVO_INSUMO} />
                                                    <span className="text-red-500">*</span>
                                                </label>
                                                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[9px] font-bold uppercase tracking-wider border border-red-200">Obligatorio</span>
                                            </div>

                                            {/* Selector combo: Únicamente motivos creados/usados previamente por el usuario actual */}
                                            <div>
                                                <select
                                                    value={
                                                        motivosUsuario.includes(formularioRecurso.motivo.trim())
                                                            ? formularioRecurso.motivo.trim()
                                                            : ''
                                                    }
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val) {
                                                            aplicarMotivo(val);
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all font-semibold text-xs text-gray-800 focus:outline-none"
                                                >
                                                    <option value="">
                                                        {motivosUsuario.length > 0
                                                            ? `-- Mis motivos anteriores (${motivosUsuario.length}) --`
                                                            : '-- Sin motivos previos del usuario --'}
                                                    </option>
                                                    {motivosUsuario.map((mot, idx) => (
                                                        <option key={idx} value={mot}>
                                                            {mot}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Sugeridos: Motivos oficiales predeterminados registrados */}
                                            {motivosOficiales.filter(m => m.activo).length > 0 && (
                                                <div className="flex items-center gap-1.5 flex-wrap text-[11px] pt-0.5 pb-0.5">
                                                    <span className="text-gray-400 font-bold text-[9px] uppercase tracking-wider">Sugeridos:</span>
                                                    {motivosOficiales.filter(m => m.activo).map(mo => {
                                                        const isSelected = formularioRecurso.motivo.trim().toLowerCase() === mo.nombre.toLowerCase();
                                                        return (
                                                            <button
                                                                key={mo.id_motivo}
                                                                type="button"
                                                                onClick={() => aplicarMotivo(mo.nombre)}
                                                                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border flex items-center gap-1 cursor-pointer ${
                                                                    isSelected
                                                                        ? 'bg-primary text-white border-primary shadow-xs'
                                                                        : 'bg-gray-50 hover:bg-primary/5 text-gray-700 border-gray-200 hover:border-primary/40'
                                                                }`}
                                                                title={mo.grupo_nombre ? `Motivo: ${mo.nombre} · Línea: ${mo.grupo_nombre}` : `Motivo: ${mo.nombre}`}
                                                            >
                                                                <span>{mo.nombre}</span>
                                                                {mo.grupo_nombre && (
                                                                    <span className={`text-[8.5px] px-1 py-0.2 rounded font-bold ${
                                                                        isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                                                                    }`}>
                                                                        {mo.grupo_nombre}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Área de texto libre y editable sin bloqueos */}
                                            <div className="relative">
                                                <textarea
                                                    rows={2}
                                                    maxLength={MAX_MOTIVO_INSUMO}
                                                    value={formularioRecurso.motivo}
                                                    onChange={(e) => {
                                                        setFormularioRecurso(prev => ({ ...prev, motivo: e.target.value }));
                                                    }}
                                                    className={`w-full px-4 py-2.5 rounded-xl transition-all font-semibold text-xs resize-none text-gray-900 focus:outline-none ${formularioRecurso.motivo.trim() ? 'bg-white border border-gray-200 hover:border-gray-300 focus:border-primary focus:ring-4 focus:ring-primary/10' : 'bg-white border-2 border-red-300 hover:border-red-400 focus:border-red-400 focus:ring-4 focus:ring-red-100 placeholder:text-gray-400'}`}
                                                    placeholder="Puedes ajustar el motivo o escribir uno personalizado..."
                                                />
                                                {formularioRecurso.motivo.trim() && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormularioRecurso(prev => ({ ...prev, motivo: '' }))}
                                                        className="absolute right-2.5 top-2.5 text-gray-300 hover:text-gray-500 text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center hover:bg-gray-100 cursor-pointer"
                                                        title="Limpiar motivo"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>

                                            {/* Badge de Grupo / Línea vinculado */}
                                            {formularioRecurso.id_grupo_recurso && (
                                                <div className="flex items-center gap-1.5 text-[10px] text-emerald-800 bg-emerald-50/80 border border-emerald-200 px-3 py-1.5 rounded-xl animate-in fade-in duration-150">
                                                    <span className="font-bold">📁 Línea sugerida:</span>
                                                    <span className="font-extrabold text-emerald-950">
                                                        {grupos.find(g => g.id_grupo_recurso === formularioRecurso.id_grupo_recurso)?.nombre || 'Asignado'}
                                                    </span>
                                                    <span className="text-emerald-600 text-[9px] ml-auto">Válido para compras</span>
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

                                                {/* Selector de Actividades de la Dimensión Seleccionada o de Todas */}
                                                <div className="space-y-2 pt-1">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-[10px] font-bold text-gray-700 uppercase tracking-wider ml-0.5 flex items-center gap-1.5">
                                                            <span>2. Actividad PME</span>
                                                            {filtroDimensionPME ? (
                                                                <span className="text-primary font-extrabold normal-case">
                                                                    · {filtroDimensionPME}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-400 font-semibold normal-case">
                                                                    · Todas las dimensiones
                                                                </span>
                                                            )}
                                                        </label>
                                                        <div className="flex items-center gap-2">
                                                            {filtroDimensionPME && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setFiltroDimensionPME('')}
                                                                    className="text-[10px] font-bold text-primary hover:underline transition-all cursor-pointer"
                                                                    title="Quitar filtro de dimensión y ver todas"
                                                                >
                                                                    Ver todas las actividades
                                                                </button>
                                                            )}
                                                            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                                                {actividadesPMEParaSelect.length} {actividadesPMEParaSelect.length === 1 ? 'actividad' : 'actividades'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Selector con Buscador Integrado y Alto Predeterminado */}
                                                    <div className="relative" ref={selectActividadPMERef}>
                                                        {/* Botón Trigger del Select */}
                                                        <div
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => setSelectActividadPMEOpen(prev => !prev)}
                                                            className={`w-full px-3.5 py-3 bg-white border rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2 shadow-2xs select-none ${
                                                                selectActividadPMEOpen 
                                                                    ? 'border-primary ring-4 ring-primary/10 shadow-sm' 
                                                                    : 'border-gray-200 hover:border-gray-300'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                                                {formularioRecurso.id_actividad && (todasActividades.find(a => a.id === formularioRecurso.id_actividad) || formularioRecurso.actividad_seleccionada) ? (
                                                                    (() => {
                                                                        const act = todasActividades.find(a => a.id === formularioRecurso.id_actividad) || formularioRecurso.actividad_seleccionada!;
                                                                        return (
                                                                            <div className="flex items-center gap-1.5 truncate">
                                                                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                                                {act.dimension && (
                                                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 shrink-0 border border-blue-100">
                                                                                        {act.dimension}
                                                                                    </span>
                                                                                )}
                                                                                <span className="text-xs font-bold text-gray-900 truncate">
                                                                                    {act.nombre}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })()
                                                                ) : (
                                                                    <span className="text-xs font-semibold text-gray-400 truncate">
                                                                        {filtroDimensionPME
                                                                            ? `-- Seleccionar actividad de ${filtroDimensionPME} (${actividadesPMEParaSelect.length}) --`
                                                                            : `-- Seleccionar actividad (${actividadesPMEParaSelect.length} disponibles) --`}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                {formularioRecurso.id_actividad && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setFormularioRecurso(prev => ({
                                                                                ...prev,
                                                                                id_actividad: null,
                                                                                actividad_seleccionada: null
                                                                            }));
                                                                            setSearchPMEModal('');
                                                                        }}
                                                                        className="w-5 h-5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-red-600 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
                                                                        title="Deseleccionar actividad"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                                <ChevronDown 
                                                                    size={16} 
                                                                    className={`text-gray-400 transition-transform duration-200 ${selectActividadPMEOpen ? 'rotate-180 text-primary' : ''}`} 
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Dropdown flotante con filtro de búsqueda integrado y ALTO PREDETERMINADO */}
                                                        {selectActividadPMEOpen && (
                                                            <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                                                {/* 1. Filtro de búsqueda integrado dentro del select */}
                                                                <div className="p-2.5 bg-slate-50 border-b border-gray-100">
                                                                    <div className="relative">
                                                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                                        <input
                                                                            type="text"
                                                                            autoFocus
                                                                            value={busquedaActividadPME}
                                                                            onChange={(e) => setBusquedaActividadPME(e.target.value)}
                                                                            placeholder={filtroDimensionPME ? `Buscar en ${filtroDimensionPME}...` : "Buscar actividad por palabra o letra..."}
                                                                            className="w-full pl-8.5 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium shadow-2xs"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        />
                                                                        {busquedaActividadPME && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setBusquedaActividadPME('');
                                                                                }}
                                                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center hover:bg-gray-100 cursor-pointer"
                                                                                title="Limpiar búsqueda"
                                                                            >
                                                                                ×
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* 2. Lista de actividades con ALTO PREDETERMINADO (max-h-60 / 240px) y scroll */}
                                                                <div className="max-h-60 overflow-y-auto custom-scrollbar divide-y divide-gray-50">
                                                                    {actividadesPMEParaSelect.length === 0 ? (
                                                                        <div className="py-7 px-4 text-center">
                                                                            <span className="text-2xl block mb-1">🔍</span>
                                                                            <p className="text-xs font-bold text-gray-700">Sin coincidencias</p>
                                                                            <p className="text-[11px] text-gray-400 mt-0.5">
                                                                                {busquedaActividadPME 
                                                                                    ? `No hay actividades que coincidan con "${busquedaActividadPME}".`
                                                                                    : 'No hay actividades registradas en esta dimensión.'}
                                                                            </p>
                                                                        </div>
                                                                    ) : (
                                                                        actividadesPMEParaSelect.map(act => {
                                                                            const isActSelected = formularioRecurso.id_actividad === act.id;
                                                                            return (
                                                                                <div
                                                                                    key={act.id}
                                                                                    onClick={() => {
                                                                                        setFormularioRecurso(prev => ({
                                                                                            ...prev,
                                                                                            id_actividad: act.id,
                                                                                            actividad_seleccionada: act,
                                                                                            dimension_pme: act.dimension || prev.dimension_pme
                                                                                        }));
                                                                                        setSearchPMEModal(act.nombre || '');
                                                                                        if (act.dimension && !filtroDimensionPME) {
                                                                                            setFiltroDimensionPME(act.dimension);
                                                                                        }
                                                                                        setSelectActividadPMEOpen(false);
                                                                                    }}
                                                                                    className={`px-3.5 py-2.5 transition-colors cursor-pointer flex items-center justify-between gap-3 group ${
                                                                                        isActSelected 
                                                                                            ? 'bg-primary/10 text-primary font-bold' 
                                                                                            : 'hover:bg-slate-50 text-gray-800'
                                                                                    }`}
                                                                                >
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                                                            {!filtroDimensionPME && act.dimension && (
                                                                                                <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                                                                                    {act.dimension}
                                                                                                </span>
                                                                                            )}
                                                                                            <span className={`text-xs leading-snug line-clamp-2 ${isActSelected ? 'font-extrabold text-primary' : 'font-medium group-hover:text-primary'}`}>
                                                                                                {act.nombre}
                                                                                            </span>
                                                                                        </div>
                                                                                        {act.lista_recursos && (
                                                                                            <p className="text-[10px] text-gray-400 truncate">
                                                                                                Recursos: {act.lista_recursos}
                                                                                            </p>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="shrink-0">
                                                                                        {isActSelected ? (
                                                                                            <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center">
                                                                                                <Check size={12} strokeWidth={3} />
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div className="w-5 h-5 rounded-full border border-gray-200 group-hover:border-primary/40 flex items-center justify-center" />
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })
                                                                    )}
                                                                </div>

                                                                {/* Footer resumen del dropdown */}
                                                                <div className="px-3.5 py-2 bg-slate-50/90 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500 font-medium">
                                                                    <span>{actividadesPMEParaSelect.length} actividades disponibles</span>
                                                                    {busquedaActividadPME && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); setBusquedaActividadPME(''); }}
                                                                            className="text-primary font-bold hover:underline cursor-pointer"
                                                                        >
                                                                            Limpiar filtro
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
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
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowRecursoModal(false)}
                                    className="px-5 py-3 rounded-xl font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all text-[13px]"
                                    title="Cerrar ventana (el borrador se conservará en tu navegador)"
                                >
                                    Cerrar
                                </button>
                                {hayBorrador(formularioRecurso) && (
                                    <button
                                        type="button"
                                        onClick={limpiarFormularioRecurso}
                                        className="px-3 py-2 text-[12px] text-gray-400 hover:text-red-600 transition-colors font-medium cursor-pointer"
                                        title="Descartar borrador y limpiar el formulario"
                                    >
                                        Descartar borrador
                                    </button>
                                )}
                            </div>

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
                                            onClick={() => {
                                                const faltan = getCamposFaltantes();
                                                if (faltan.length > 0) { setCamposFaltantes(faltan); return; }
                                                (isEditando ? actualizarRecurso : agregarRecurso)();
                                            }}
                                            className="px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:brightness-105 active:scale-[0.98] transition-all text-[13px] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
                                        >
                                            <Check size={16} strokeWidth={2.5} />
                                            {isEditando ? 'Actualizar' : 'Añadir y Cerrar'}
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
                                    { icon: '👪', label: 'Apoderados', desc: 'Recursos destinados a apoderados: reuniones, talleres para padres y actividades con las familias.' },
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

            {/* Modal de Diagnóstico y Validación de Insumos Pendientes */}
            {modalDiagnosticoPendientes && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md flex items-center justify-center z-[300] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl border border-gray-100 animate-in zoom-in-95 space-y-5">
                        <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200 shadow-xs">
                                <AlertTriangle size={26} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h3 className="text-base font-extrabold text-gray-900 tracking-tight">
                                    No se pueden guardar todos los pendientes
                                </h3>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                    Hay recursos con datos requeridos incompletos antes de enviarse a la base de datos.
                                </p>
                            </div>
                        </div>

                        {/* Grid de Métricas y Diagnóstico Solicitado */}
                        <div className="grid grid-cols-2 gap-2.5">
                            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
                                <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                                    <Check size={14} className="text-emerald-600" /> Confirmados en Solicitud
                                </div>
                                <div className="text-xl font-black text-emerald-700 mt-1">
                                    {modalDiagnosticoPendientes.totalConfirmados} <span className="text-xs font-semibold text-emerald-600 font-normal">guardados</span>
                                </div>
                            </div>

                            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl">
                                <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                                    <History size={14} className="text-amber-600" /> Pendientes en Borrador
                                </div>
                                <div className="text-xl font-black text-amber-800 mt-1">
                                    {modalDiagnosticoPendientes.totalPendientes} <span className="text-xs font-semibold text-amber-700 font-normal">por guardar</span>
                                </div>
                            </div>

                            <div className={`p-3 rounded-2xl border ${modalDiagnosticoPendientes.sinCantidad > 0 ? 'bg-red-50/80 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                                <div className="text-[11px] font-bold text-red-800 uppercase tracking-wider flex items-center gap-1.5">
                                    <AlertCircle size={14} className="text-red-500" /> Sin Cantidad (Cant = 0)
                                </div>
                                <div className="text-xl font-black text-red-700 mt-1">
                                    {modalDiagnosticoPendientes.sinCantidad} <span className="text-xs font-semibold text-red-600 font-normal">insumos</span>
                                </div>
                            </div>

                            <div className={`p-3 rounded-2xl border ${modalDiagnosticoPendientes.sinMes > 0 ? 'bg-orange-50/80 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
                                <div className="text-[11px] font-bold text-orange-900 uppercase tracking-wider flex items-center gap-1.5">
                                    <Calendar size={14} className="text-orange-500" /> Sin Mes / Período
                                </div>
                                <div className="text-xl font-black text-orange-800 mt-1">
                                    {modalDiagnosticoPendientes.sinMes} <span className="text-xs font-semibold text-orange-700 font-normal">insumos</span>
                                </div>
                            </div>
                        </div>

                        {/* Aviso explicativo */}
                        <div className="text-[12px] text-gray-600 bg-gray-50 border border-gray-200/70 p-3 rounded-2xl space-y-1">
                            <p className="font-semibold text-gray-800">¿Cómo resolverlo?</p>
                            <p>
                                1. En la tabla de insumos, ingresa una <b>cantidad mayor a 0</b> en cada fila marcada en rojo.
                            </p>
                            <p>
                                2. Asegúrate de que cada una tenga su <b>mes asignado</b>.
                            </p>
                        </div>

                        {/* Botones de Acción */}
                        <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
                            <button
                                type="button"
                                onClick={() => {
                                    setFiltroEstadoPpto('borrador');
                                    setModalDiagnosticoPendientes(null);
                                }}
                                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs transition-all cursor-pointer"
                            >
                                Filtrar pendientes en tabla
                            </button>

                            <div className="flex items-center gap-2">
                                {modalDiagnosticoPendientes.listos > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => guardarTodosPendientes(true)}
                                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs transition-all shadow-sm shadow-emerald-600/20 active:scale-95 cursor-pointer"
                                    >
                                        Guardar solo los {modalDiagnosticoPendientes.listos} listos
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setModalDiagnosticoPendientes(null)}
                                    className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-2xl text-xs transition-all shadow-xs active:scale-95 cursor-pointer"
                                >
                                    Entendido, ir a editar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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

            {/* Modal de Notificación Elegante (Reemplazo moderno de alert()) */}
            {modalNotificacion && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[400] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-in zoom-in-95 duration-200">
                        <div className="flex items-start gap-3.5">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xs border ${
                                modalNotificacion.tipo === 'error'
                                    ? 'bg-red-50 text-red-600 border-red-100'
                                    : modalNotificacion.tipo === 'warning'
                                    ? 'bg-amber-50 text-amber-600 border-amber-200'
                                    : modalNotificacion.tipo === 'success'
                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                    : 'bg-blue-50 text-blue-600 border-blue-100'
                            }`}>
                                {modalNotificacion.tipo === 'error' && <AlertCircle size={26} strokeWidth={2.4} />}
                                {modalNotificacion.tipo === 'warning' && <AlertTriangle size={26} strokeWidth={2.4} />}
                                {modalNotificacion.tipo === 'success' && <Check size={26} strokeWidth={2.8} />}
                                {modalNotificacion.tipo === 'info' && <HelpCircle size={26} strokeWidth={2.4} />}
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                                <h3 className="text-base font-black text-gray-900 tracking-tight">
                                    {modalNotificacion.titulo}
                                </h3>
                                <p className="text-xs text-gray-600 font-medium mt-1 leading-relaxed whitespace-pre-line">
                                    {modalNotificacion.mensaje}
                                </p>
                                {modalNotificacion.pista && (
                                    <p className="mt-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-mono text-gray-500 break-all select-all" title="Detalle técnico para el equipo de desarrollo">
                                        Pista: {modalNotificacion.pista}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setModalNotificacion(null)}
                                className={`w-full py-3 text-white font-extrabold rounded-2xl text-xs shadow-md active:scale-98 transition-all cursor-pointer ${
                                    modalNotificacion.tipo === 'error'
                                        ? 'bg-red-600 hover:bg-red-700 shadow-red-600/25'
                                        : modalNotificacion.tipo === 'warning'
                                        ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/25'
                                        : modalNotificacion.tipo === 'success'
                                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                                        : 'bg-primary hover:bg-primary/90 shadow-primary/25'
                                }`}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detalle de un insumo de un presupuesto anterior (solo lectura) */}
            <DetalleInsumoModal
                isOpen={Boolean(detalleAnterior)}
                onClose={() => setDetalleAnterior(null)}
                item={detalleAnterior ? {
                    nombre_producto: detalleAnterior.nombre_producto,
                    descripcion: detalleAnterior.descripcion || '',
                    formato_unidad: detalleAnterior.formato_unidad,
                    cantidad: detalleAnterior.cantidad,
                    valor_unitario_iva: detalleAnterior.valor_unitario_iva,
                    total_iva: detalleAnterior.total_iva,
                    fecha_ejecucion: detalleAnterior.fecha_ejecucion,
                    fecha_termino: detalleAnterior.fecha_termino,
                    tipo_fecha: detalleAnterior.tipo_fecha,
                    motivo: detalleAnterior.motivo,
                    destino_gasto: detalleAnterior.destino_gasto || undefined,
                    id_subvencion: detalleAnterior.id_subvencion || undefined,
                    codigo_cuenta: detalleAnterior.codigo_cuenta || undefined,
                    id_actividad: detalleAnterior.id_actividad || undefined,
                    id_subarea: detalleAnterior.id_subarea || undefined,
                    grupo_nombre: detalleAnterior.grupo_nombre || undefined,
                } as DetallePresupuestoForm : null}
                etiquetaOrigen={detalleAnterior ? `Presupuesto anterior · ${detalleAnterior.codigo_solicitud}` : undefined}
                nombreSubarea={detalleAnterior ? (nombreSubareaDeFila({ id_subarea: detalleAnterior.id_subarea } as any) ?? undefined) : undefined}
                nombreActividad={detalleAnterior?.actividad_nombre || undefined}
                subvencionNombre={detalleAnterior ? getSubvencionLabel(detalleAnterior.id_subvencion) : undefined}
                labelFecha={detalleAnterior ? labelFecha(detalleAnterior as any) : undefined}
            />

            {/* Modal de Detalle Completo de Insumo */}
            <DetalleInsumoModal
                isOpen={Boolean(detalleInsumoModal || catalogoDetalleModal)}
                onClose={() => {
                    setDetalleInsumoModal(null);
                    setCatalogoDetalleModal(null);
                }}
                item={detalleInsumoModal?.item && detalleGuardado?.data && !detalleGuardado.borrador
                    && detalleGuardado.clave === claveDetalle(detalleInsumoModal.item, detalleInsumoModal.index)
                    ? {
                        ...detalleInsumoModal.item,
                        descripcion: detalleGuardado.data.descripcion ?? detalleInsumoModal.item.descripcion,
                        motivo: detalleGuardado.data.motivo ?? detalleInsumoModal.item.motivo,
                        codigo_cuenta: detalleGuardado.data.codigo_cuenta ?? null,
                        destino_gasto: detalleGuardado.data.destino_gasto ?? detalleInsumoModal.item.destino_gasto,
                        id_subvencion: detalleGuardado.data.id_subvencion ?? detalleInsumoModal.item.id_subvencion,
                        cantidad: detalleGuardado.data.cantidad ?? detalleInsumoModal.item.cantidad,
                        formato_unidad: detalleGuardado.data.formato_unidad ?? detalleInsumoModal.item.formato_unidad,
                        valor_unitario_iva: detalleGuardado.data.valor_unitario_iva ?? detalleInsumoModal.item.valor_unitario_iva,
                        total_iva: detalleGuardado.data.total_iva ?? detalleInsumoModal.item.total_iva,
                    }
                    : detalleInsumoModal?.item && detalleGuardado?.borrador && detalleGuardado.data
                        && detalleGuardado.clave === claveDetalle(detalleInsumoModal.item, detalleInsumoModal.index)
                        ? { ...detalleInsumoModal.item, codigo_cuenta: detalleGuardado.data.codigo_cuenta ?? null }
                        : detalleInsumoModal?.item}
                nombreCuenta={detalleGuardado?.data?.codigo_cuenta_nombre ?? null}
                codigoPorConfirmar={Boolean(detalleGuardado?.borrador)}
                cargando={Boolean(detalleGuardado?.cargando)}
                catalogoItem={catalogoDetalleModal}
                onEdit={detalleInsumoModal ? () => abrirEditar(detalleInsumoModal.index) : undefined}
                onSeleccionarCatalogo={catalogoDetalleModal ? (r) => seleccionarRecurso(r) : undefined}
                nombreSubarea={(detalleInsumoModal?.item ? nombreSubareaDeFila(detalleInsumoModal.item) : undefined) ?? undefined}
                nombreActividad={detalleInsumoModal?.item?.id_actividad ? (todasActividades.find(a => a.id === detalleInsumoModal.item.id_actividad)?.nombre || (detalleInsumoModal.item as any).actividad_seleccionada?.nombre || (detalleInsumoModal.item as any).actividad_nombre) : undefined}
                subvencionNombre={detalleInsumoModal?.item
                    ? ((!detalleGuardado?.borrador && detalleGuardado?.data?.subvencion_nombre) || getSubvencionLabel(detalleInsumoModal.item.id_subvencion))
                    : undefined}
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