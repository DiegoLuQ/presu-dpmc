'use client';

import React from 'react';
import { X, Package, Edit2, Calendar, Tag, DollarSign, Layers, MapPin, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { DetallePresupuestoForm, RecursoOption } from '@/lib/types';
import { etiquetaDestino } from '@/lib/destinos';

interface DetalleInsumoModalProps {
    isOpen: boolean;
    onClose: () => void;
    item?: DetallePresupuestoForm | null;
    catalogoItem?: RecursoOption | null;
    onEdit?: () => void;
    onSeleccionarCatalogo?: (r: RecursoOption) => void;
    nombreSubarea?: string;
    nombreActividad?: string;
    subvencionNombre?: string;
    labelFecha?: string;
    nombreCategoria?: string;
    nombreGrupo?: string;
}

const formatCLP = (val: number) => {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0
    }).format(val || 0);
};

export function DetalleInsumoModal({
    isOpen,
    onClose,
    item,
    catalogoItem,
    onEdit,
    onSeleccionarCatalogo,
    nombreSubarea,
    nombreActividad,
    subvencionNombre,
    labelFecha,
    nombreCategoria,
    nombreGrupo
}: DetalleInsumoModalProps) {
    if (!isOpen || (!item && !catalogoItem)) return null;

    const resolvedCategoria = nombreCategoria
        || item?.categoria_nombre
        || (item as any)?.recurso_seleccionado?.categoria_nombre
        || (item as any)?.recurso_seleccionado?.categoria?.nombre
        || catalogoItem?.categoria_nombre
        || null;

    const resolvedGrupo = nombreGrupo
        || item?.grupo_nombre
        || (item as any)?.recurso_seleccionado?.grupo_nombre
        || (item as any)?.recurso_seleccionado?.grupo?.nombre
        || catalogoItem?.grupo_nombre
        || null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[250] p-4 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Cabecera */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-blue-50/40 to-white shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
                            📦
                        </div>
                        <div className="truncate">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base font-extrabold text-gray-900 truncate">
                                    {item ? item.nombre_producto : catalogoItem?.nombre}
                                </h3>
                                {item && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        item.id_pre_detalle
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}>
                                        {item.id_pre_detalle ? '✓ Guardado' : 'Borrador'}
                                    </span>
                                )}
                                {catalogoItem && (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                        Catálogo Oficial
                                    </span>
                                )}
                                {resolvedCategoria && (
                                    <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold flex items-center gap-1">
                                        <Tag size={10} className="text-purple-500" />
                                        {resolvedCategoria}
                                    </span>
                                )}
                                {resolvedGrupo && (
                                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold flex items-center gap-1">
                                        <Layers size={10} className="text-indigo-500" />
                                        Línea: {resolvedGrupo}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                                {item ? 'Ficha de información y desglose del insumo' : 'Detalles del recurso en catálogo'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                        title="Cerrar detalle"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Contenido */}
                <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">

                    {/* Caso 1: Detalle de un insumo de la solicitud */}
                    {item && (
                        <>
                            {/* Métricas Principales */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-center space-y-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Cantidad</span>
                                    <span className="text-base font-extrabold text-gray-900">
                                        {item.cantidad} <span className="text-xs font-semibold text-gray-500">{item.formato_unidad}</span>
                                    </span>
                                </div>
                                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-center space-y-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Valor Unitario</span>
                                    <span className="text-base font-extrabold text-gray-900">
                                        {formatCLP(item.valor_unitario_iva)}
                                    </span>
                                    <span className="text-[9px] text-gray-400 block font-medium">con IVA</span>
                                </div>
                                <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-2xl text-center space-y-1">
                                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">Total Inversión</span>
                                    <span className="text-base font-black text-primary">
                                        {formatCLP(item.total_iva)}
                                    </span>
                                    <span className="text-[9px] text-primary/70 block font-medium">con IVA</span>
                                </div>
                            </div>

                            {/* Especificaciones / Detalle */}
                            <div className="p-4 bg-white border border-gray-200 rounded-2xl space-y-1.5">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block flex items-center gap-1.5">
                                    <span>📝</span> Especificaciones y Detalle del Insumo
                                </span>
                                <p className="text-xs font-semibold text-gray-800 leading-relaxed whitespace-pre-wrap">
                                    {item.descripcion?.trim() || 'Sin especificaciones adicionales registradas.'}
                                </p>
                            </div>

                            {/* Justificación / Motivo */}
                            <div className="p-4 bg-white border border-gray-200 rounded-2xl space-y-1.5">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block flex items-center gap-1.5">
                                    <span>📌</span> Justificación / Motivo de Necesidad
                                </span>
                                <p className="text-xs font-semibold text-gray-800 leading-relaxed whitespace-pre-wrap">
                                    {item.motivo?.trim() || 'Sin justificación registrada.'}
                                </p>
                            </div>

                            {/* Clasificación y Planificación */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                {resolvedCategoria && (
                                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block flex items-center gap-1">
                                            <Tag size={11} className="text-purple-500" /> Categoría del Insumo
                                        </span>
                                        <span className="font-bold text-purple-900 bg-purple-100/60 px-2 py-0.5 rounded-lg inline-block text-[11px] border border-purple-200">
                                            {resolvedCategoria}
                                        </span>
                                    </div>
                                )}

                                {resolvedGrupo && (
                                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block flex items-center gap-1">
                                            <Layers size={11} className="text-indigo-500" /> Grupo / Línea
                                        </span>
                                        <span className="font-bold text-indigo-900 bg-indigo-100/60 px-2 py-0.5 rounded-lg inline-block text-[11px] border border-indigo-200">
                                            {resolvedGrupo}
                                        </span>
                                    </div>
                                )}

                                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Destino del Gasto</span>
                                    <span className="font-bold text-gray-900 block">{etiquetaDestino(item.destino_gasto)}</span>
                                </div>

                                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Cargo / Área</span>
                                    <span className="font-bold text-gray-900 block">{nombreSubarea || 'General'}</span>
                                </div>

                                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Subvención</span>
                                    <span className="font-bold text-violet-800 bg-violet-100/70 px-2 py-0.5 rounded-lg inline-block text-[11px]">
                                        {subvencionNombre || 'GENERAL'}
                                    </span>
                                </div>

                                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Fecha Estimada</span>
                                    <span className="font-bold text-gray-900 block">{labelFecha || 'Mensual'}</span>
                                </div>

                                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1 sm:col-span-2">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Actividad PME Asociada</span>
                                    <span className="font-bold text-gray-900 block">
                                        {nombreActividad || 'Otros gastos — no asociado a PME'}
                                    </span>
                                </div>

                                {item.codigo_cuenta && (
                                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1 sm:col-span-2">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Cuenta Contable</span>
                                        <span className="font-mono text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded-lg border border-slate-200 inline-block">
                                            {item.codigo_cuenta}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Caso 2: Detalle de recurso del Catálogo Oficial */}
                    {catalogoItem && !item && (
                        <div className="space-y-4">
                            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
                                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                                    Recurso Oficial del Catálogo
                                </span>
                                <h4 className="text-base font-extrabold text-gray-900">{catalogoItem.nombre}</h4>
                                <div className="flex items-center gap-2 pt-1 flex-wrap">
                                    {resolvedCategoria && (
                                        <span className="px-2.5 py-1 bg-white rounded-xl text-xs font-bold text-purple-700 border border-purple-200 flex items-center gap-1">
                                            <Tag size={12} className="text-purple-500" />
                                            Categoría: {resolvedCategoria}
                                        </span>
                                    )}
                                    {resolvedGrupo && (
                                        <span className="px-2.5 py-1 bg-white rounded-xl text-xs font-bold text-indigo-700 border border-indigo-200 flex items-center gap-1">
                                            <Layers size={12} className="text-indigo-500" />
                                            Grupo / Línea: {resolvedGrupo}
                                        </span>
                                    )}
                                    <span className="px-2.5 py-1 bg-white rounded-xl text-xs font-bold text-gray-700 border border-gray-200 uppercase">
                                        Formato: {catalogoItem.formato || 'unidad'}
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Este recurso está homologado en el catálogo central de la institución. Al utilizarlo en tu solicitud se asocia automáticamente a la cuenta contable correspondiente.
                            </p>
                        </div>
                    )}

                </div>

                {/* Pie del modal */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold transition-all cursor-pointer"
                    >
                        Cerrar
                    </button>

                    <div className="flex items-center gap-2">
                        {item && onEdit && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onEdit();
                                }}
                                className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:brightness-105 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                            >
                                <Edit2 size={13} /> Editar Insumo
                            </button>
                        )}
                        {catalogoItem && !item && onSeleccionarCatalogo && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onSeleccionarCatalogo(catalogoItem);
                                }}
                                className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:brightness-105 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                            >
                                <Plus size={14} /> Usar este recurso
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
