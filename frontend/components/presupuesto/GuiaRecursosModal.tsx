'use client';

import React, { useState, useEffect } from 'react';
import {
    X, HelpCircle, Check, Package, FileText, Calendar, DollarSign,
    BookOpen, Layers, Plus, Copy, Edit2, Trash2, ArrowRight, ChevronRight,
    Search, Tag, Sparkles, Video, ExternalLink
} from 'lucide-react';
import api from '@/lib/api/client';

interface TutorialItem {
    id: string;
    titulo: string;
    url: string;
    descripcion?: string;
}

interface GuiaRecursosModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function GuiaRecursosModal({ isOpen, onClose }: GuiaRecursosModalProps) {
    const [pestañaActiva, setPestañaActiva] = useState<'fase1' | 'fase2' | 'fase3' | 'botones'>('fase1');

    // Estado para tutoriales exclusivos de Insumos
    const [tutoriales, setTutoriales] = useState<TutorialItem[]>([]);
    const [mostrarBoton, setMostrarBoton] = useState(true);
    const [modalTutoriales, setModalTutoriales] = useState(false);
    const [copiadoTut, setCopiadoTut] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            api.get('/catalogos/config/tutoriales_insumos')
                .then(res => {
                    if (res.data?.valor && Array.isArray(res.data.valor)) {
                        setTutoriales(res.data.valor);
                    } else {
                        setTutoriales([]);
                    }
                })
                .catch(() => setTutoriales([]));

            api.get('/catalogos/config/mostrar_boton_tutoriales_insumos')
                .then(res => {
                    if (res.data?.valor !== undefined && res.data.valor !== null) {
                        setMostrarBoton(Boolean(res.data.valor));
                    } else {
                        setMostrarBoton(true);
                    }
                })
                .catch(() => setMostrarBoton(true));
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[250] p-4 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Cabecera */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md shadow-primary/20 shrink-0">
                            <BookOpen size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                                Guía de Uso: Panel de Insumo y Presupuesto
                            </h2>
                            <p className="text-xs text-gray-500 font-medium">
                                Conoce cómo ingresar tus insumos paso a paso y el propósito de cada función.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                        {mostrarBoton && (
                            <button
                                type="button"
                                onClick={() => setModalTutoriales(true)}
                                className="inline-flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-red-500/20 hover:shadow-lg hover:shadow-red-500/30 transition-all cursor-pointer transform active:scale-95"
                                title="Ver tutoriales y videos de ayuda"
                            >
                                <Video size={15} />
                                <span>Ver tutoriales {tutoriales.length > 0 ? `(${tutoriales.length})` : ''}</span>
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                            title="Cerrar guía"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Pestañas de Navegación */}
                <div className="px-6 border-b border-gray-100 bg-gray-50/50 flex space-x-2 overflow-x-auto hide-scrollbar shrink-0 pt-2">
                    {[
                        { id: 'fase1', label: '1. Búsqueda y Clasificación', icon: Search, badge: 'Fase 1' },
                        { id: 'fase2', label: '2. Identificación, Costos y Motivo', icon: FileText, badge: 'Fase 2' },
                        { id: 'fase3', label: '3. Actividad PME', icon: Layers, badge: 'Fase 3' },
                        { id: 'botones', label: 'Glosario de Botones', icon: Plus, badge: 'Acciones' },
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = pestañaActiva === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setPestañaActiva(tab.id as any)}
                                className={`px-4 py-3 border-b-2 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                                    isActive
                                        ? 'border-primary text-primary bg-white rounded-t-xl shadow-xs'
                                        : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-white/40'
                                }`}
                            >
                                <Icon size={15} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Contenido scrolleable */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">

                    {/* ── PESTAÑA: FASE 1 ── */}
                    {pestañaActiva === 'fase1' && (
                        <div className="space-y-5 animate-in fade-in duration-150">
                            <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-start gap-3">
                                <span className="text-xl">🔍</span>
                                <div className="text-xs text-blue-900 space-y-1">
                                    <p className="font-extrabold text-sm text-blue-950">Fase 1: ¿Cómo elegir o crear tu recurso?</p>
                                    <p className="leading-relaxed">
                                        Antes de detallar cantidades o costos, debes seleccionar el insumo desde el catálogo oficial o crearlo si no existe.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl border border-gray-200 bg-white space-y-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">A</span>
                                        <h4 className="font-bold text-gray-900 text-sm">Buscador del Catálogo</h4>
                                    </div>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Escribe en el buscador del catálogo principal. Encontrarás miles de insumos estandarizados que ya cuentan con cuenta contable y formato homologado.
                                    </p>
                                    <div className="p-2.5 bg-gray-50 rounded-xl text-[11px] text-gray-500 font-medium">
                                        💡 <b>Recomendación:</b> Siempre busca primero en el catálogo para asegurar compras consistentes.
                                    </div>
                                </div>

                                <div className="p-4 rounded-2xl border border-gray-200 bg-white space-y-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="w-7 h-7 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs">B</span>
                                        <h4 className="font-bold text-gray-900 text-sm">Botón «Nuevo Insumo»</h4>
                                    </div>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Si el producto exacto no aparece en el catálogo, haz clic en el botón azul <b>«Nuevo Insumo»</b>. Te abrirá un formulario para redactar el nombre genérico y clasificarlo.
                                    </p>
                                    <div className="p-2.5 bg-violet-50 rounded-xl text-[11px] text-violet-800 font-medium">
                                        ✨ El sistema asignará su clasificación adecuada para agilizar su aprobación.
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl border border-gray-200 bg-white space-y-3">
                                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                    <span>🎯</span> ¿Para quién o para qué se destina este gasto? (Destino del Gasto)
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                                        <span className="font-bold text-gray-900">🏫 Sala de clases (Alumnos)</span>
                                        <p className="text-gray-500 text-[11px] leading-relaxed">Materiales pedagógicos, salidas a terreno, talleres, actividades deportivas y eventos dirigidos a estudiantes.</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                                        <span className="font-bold text-gray-900">🏢 Oficina / Adm. (Funcionarios)</span>
                                        <p className="text-gray-500 text-[11px] leading-relaxed">Insumos para personal docente, asistentes y directivos; materiales administrativos de oficina.</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                                        <span className="font-bold text-gray-900">🏆 Premio / Beneficio</span>
                                        <p className="text-gray-500 text-[11px] leading-relaxed">Medallas, diplomas, reconocimientos e incentivos directos para la comunidad escolar.</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                                        <span className="font-bold text-gray-900">🔧 Mantención / Servicio</span>
                                        <p className="text-gray-500 text-[11px] leading-relaxed">Reparaciones, soporte informático, infraestructura y servicios generales del colegio.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── PESTAÑA: FASE 2 ── */}
                    {pestañaActiva === 'fase2' && (
                        <div className="space-y-5 animate-in fade-in duration-150">
                            <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-start gap-3">
                                <span className="text-xl">✍️</span>
                                <div className="text-xs text-amber-900 space-y-1">
                                    <p className="font-extrabold text-sm text-amber-950">Fase 2: Identificación, Especificaciones Técnicas y Costos</p>
                                    <p className="leading-relaxed">
                                        En este paso especificas las características concretas del producto, la justificación de compra, fechas y valores.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3.5">
                                {/* Autocompletado del Nombre */}
                                <div className="p-4 rounded-2xl border border-gray-200 bg-white space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                            <span>📦</span> Nombre del Insumo y Autocompletado en Tiempo Real
                                        </h4>
                                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-primary text-[10px] font-bold">Autocompletado activo</span>
                                    </div>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Ingresa solo el nombre genérico (ej. <i>Computador, Resma carta, Silla ergonómica</i>). Al escribir <b>2 letras o más</b>, se despliega automáticamente un menú con coincidencias del catálogo oficial y de insumos ingresados previamente. Al hacer clic en una opción, se estandariza el nombre al instante.
                                    </p>
                                </div>

                                {/* Detalle del Insumo */}
                                <div className="p-4 rounded-2xl border border-gray-200 bg-white space-y-2">
                                    <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                        <span>📝</span> Detalle del Insumo (Obligatorio)
                                    </h4>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Aquí van todas las especificaciones concretas: <b>color, marca sugerida, modelo, dimensiones, capacidad, gramaje o material</b>.
                                        Mientras más detallado sea, más rápido podrá el equipo de compras cotizar y aprobar el recurso.
                                    </p>
                                </div>

                                {/* Justificación y Motivo con Autocompletado */}
                                <div className="p-4 rounded-2xl border border-gray-200 bg-white space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                            <span>📌</span> Justificación / Motivo de Necesidad con Autocompletado
                                        </h4>
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">Anti-errores de tipeo</span>
                                    </div>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Describe brevemente por qué es indispensable el recurso y qué objetivo pedagógico o institucional cumple.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                                            <span className="font-bold text-gray-900">Top frecuentes (máx. 3):</span>
                                            <p className="text-gray-500 text-[11px] leading-relaxed">Botones de acceso rápido arriba del campo con los motivos más usados en tu solicitud para seleccionarlos con 1 clic.</p>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                                            <span className="font-bold text-gray-900">Buscador en el campo:</span>
                                            <p className="text-gray-500 text-[11px] leading-relaxed">Al escribir en el campo se despliega la lista filtrada de todos los motivos existentes para no repetir variaciones ortográficas.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Fechas y Costos */}
                                <div className="p-4 rounded-2xl border border-gray-200 bg-white space-y-2">
                                    <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                        <span>📅</span> Estimación de Fecha, Costos y Cantidad
                                    </h4>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        * <b>Tipo de fecha:</b> Elige "Mensual" (indicando el mes de uso) o "Fecha específica" (para eventos puntuales con fecha de inicio y término).<br />
                                        * <b>Valores:</b> Ingresa la <b>Cantidad</b> y el <b>Valor Unitario con IVA incluido</b>. El sistema calcula automáticamente el monto total presupuestado.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── PESTAÑA: FASE 3 ── */}
                    {pestañaActiva === 'fase3' && (
                        <div className="space-y-5 animate-in fade-in duration-150">
                            <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex items-start gap-3">
                                <span className="text-xl">📚</span>
                                <div className="text-xs text-emerald-900 space-y-1">
                                    <p className="font-extrabold text-sm text-emerald-950">Fase 3: Vinculación con el PME (Plan de Mejoramiento Educativo)</p>
                                    <p className="leading-relaxed">
                                        Permite que el gasto quede asociado al instrumento de gestión oficial del colegio para su correcta rendición de cuentas.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="font-bold text-gray-900 text-sm">Las 4 Dimensiones del PME:</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div className="p-3.5 rounded-2xl border border-gray-200 bg-white space-y-1">
                                        <span className="font-bold text-gray-900 flex items-center gap-1.5">
                                            <span>📚</span> Gestión Pedagógica
                                        </span>
                                        <p className="text-gray-500 text-[11px] leading-relaxed">
                                            Enseñanza en aula, desarrollo curricular, labor docente, recursos didácticos y evaluaciones escolares.
                                        </p>
                                    </div>
                                    <div className="p-3.5 rounded-2xl border border-gray-200 bg-white space-y-1">
                                        <span className="font-bold text-gray-900 flex items-center gap-1.5">
                                            <span>🤝</span> Convivencia Escolar
                                        </span>
                                        <p className="text-gray-500 text-[11px] leading-relaxed">
                                            Bienestar socioemocional, talleres comunitarios, formación valórica, inclusión y clima de respeto.
                                        </p>
                                    </div>
                                    <div className="p-3.5 rounded-2xl border border-gray-200 bg-white space-y-1">
                                        <span className="font-bold text-gray-900 flex items-center gap-1.5">
                                            <span>🎯</span> Liderazgo
                                        </span>
                                        <p className="text-gray-500 text-[11px] leading-relaxed">
                                            Planificación institucional, monitoreo directivo, capacitación de equipos técnicos y metas del colegio.
                                        </p>
                                    </div>
                                    <div className="p-3.5 rounded-2xl border border-gray-200 bg-white space-y-1">
                                        <span className="font-bold text-gray-900 flex items-center gap-1.5">
                                            <span>🏢</span> Gestión de Recursos
                                        </span>
                                        <p className="text-gray-500 text-[11px] leading-relaxed">
                                            Mobiliario, equipamiento general, mantención de espacios escolares y funcionamiento operativo.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl border border-gray-200 bg-white space-y-2.5">
                                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                    <span>⚙️</span> ¿Qué hacer si el gasto no es del PME?
                                </h4>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Si el insumo solicitado corresponde a un gasto general que no pertenece a ninguna de las acciones del Plan de Mejoramiento del colegio, marca la casilla:
                                    <br />
                                    <b>☑️ Otros gastos — no asociado a PME</b> ubicada al final de este paso.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── PESTAÑA: BOTONES ── */}
                    {pestañaActiva === 'botones' && (
                        <div className="space-y-4 animate-in fade-in duration-150">
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
                                <span className="text-xl">💡</span>
                                <div className="text-xs text-gray-800 space-y-1">
                                    <p className="font-extrabold text-sm text-gray-900">Glosario de Botones y Acciones Rápidas</p>
                                    <p className="text-gray-500">
                                        Conoce la función exacta de cada botón para cargar tus presupuestos en el menor tiempo posible.
                                    </p>
                                </div>
                            </div>

                            <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
                                <div className="p-3.5 flex items-start gap-3.5">
                                    <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs shrink-0 flex items-center gap-1">
                                        <Plus size={14} /> Guardar y agregar otro
                                    </span>
                                    <div className="text-xs text-gray-600">
                                        <p className="font-bold text-gray-900 mb-0.5">Guarda y conserva el contexto</p>
                                        Guarda de inmediato el insumo actual en la base de datos y te deja listo para ingresar el siguiente, <b>conservando automáticamente el Motivo, Fecha, Destino y Actividad</b> para que no tengas que escribirlos de nuevo.
                                    </div>
                                </div>

                                <div className="p-3.5 flex items-start gap-3.5">
                                    <span className="px-3 py-1.5 rounded-xl bg-primary text-white font-bold text-xs shrink-0 flex items-center gap-1">
                                        <Check size={14} /> Añadir y Cerrar / Actualizar
                                    </span>
                                    <div className="text-xs text-gray-600">
                                        <p className="font-bold text-gray-900 mb-0.5">Finalizar ingreso</p>
                                        Guarda el recurso actual y cierra el panel lateral para volver a la tabla principal del presupuesto.
                                    </div>
                                </div>

                                <div className="p-3.5 flex items-start gap-3.5">
                                    <span className="px-2.5 py-1.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-xs shrink-0 flex items-center gap-1">
                                        Por fases / Columnas
                                    </span>
                                    <div className="text-xs text-gray-600">
                                        <p className="font-bold text-gray-900 mb-0.5">Modo de visualización del formulario</p>
                                        Ubicado en la esquina superior del panel. <b>"Por fases"</b> te guía paso a paso (1, 2 y 3). <b>"Columnas"</b> despliega todos los campos en dos columnas simultáneas si prefieres una vista continua.
                                    </div>
                                </div>

                                <div className="p-3.5 flex items-start gap-3.5">
                                    <span className="px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 font-bold text-xs shrink-0">
                                        Ampliar / Encoger
                                    </span>
                                    <div className="text-xs text-gray-600">
                                        <p className="font-bold text-gray-900 mb-0.5">Pantalla Completa</p>
                                        Expande la tabla a pantalla completa con todas sus columnas (fechas, actividades, categorías, motivos) para revisar presupuestos extensos con total comodidad.
                                    </div>
                                </div>

                                <div className="p-3.5 flex items-start gap-3.5">
                                    <div className="flex items-center gap-1 shrink-0">
                                        <span className="p-1.5 rounded-lg bg-gray-100 text-slate-700"><Copy size={13} /></span>
                                        <span className="p-1.5 rounded-lg bg-gray-100 text-blue-700"><Edit2 size={13} /></span>
                                        <span className="p-1.5 rounded-lg bg-gray-100 text-red-700"><Trash2 size={13} /></span>
                                    </div>
                                    <div className="text-xs text-gray-600">
                                        <p className="font-bold text-gray-900 mb-0.5">Acciones directas en la tabla</p>
                                        Al pasar el cursor sobre cualquier insumo agregado puedes <b>Duplicarlo</b> (crear una copia rápida), <b>Editarlo</b> (abrir sus campos) o <b>Eliminarlo</b>.
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* Pie del modal */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <p className="text-[11px] text-gray-400 font-medium hidden sm:block">
                            Puedes consultar esta guía en cualquier momento haciendo clic en el botón «Guía del Sistema».
                        </p>
                        {mostrarBoton && (
                            <button
                                type="button"
                                onClick={() => setModalTutoriales(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 text-gray-700 hover:text-red-700 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                            >
                                <Video size={13} className="text-red-600" />
                                <span>Ver tutoriales {tutoriales.length > 0 ? `(${tutoriales.length})` : ''}</span>
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {pestañaActiva !== 'botones' && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (pestañaActiva === 'fase1') setPestañaActiva('fase2');
                                    else if (pestañaActiva === 'fase2') setPestañaActiva('fase3');
                                    else if (pestañaActiva === 'fase3') setPestañaActiva('botones');
                                }}
                                className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                                Siguiente paso <ArrowRight size={13} />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:brightness-105 transition-all shadow-sm cursor-pointer"
                        >
                            Entendido, cerrar
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal de Tutoriales y Enlaces de Ayuda (Panel de Insumos) */}
            {modalTutoriales && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[300] p-4 animate-in fade-in duration-150"
                    onClick={() => setModalTutoriales(false)}
                >
                    <div
                        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-150 border border-gray-100"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shadow-xs">
                                    <Video size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-gray-900">Tutoriales y Guías: Panel de Insumos</h3>
                                    <p className="text-xs text-gray-500">Recursos y videos explicativos para cargar tus presupuestos e insumos</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setModalTutoriales(false)}
                                className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
                                title="Cerrar ventana de tutoriales"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {tutoriales.length === 0 ? (
                            <div className="border border-dashed border-gray-200 rounded-2xl p-8 text-center bg-gray-50/50 my-6">
                                <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-2">
                                    <Video size={22} />
                                </div>
                                <p className="text-sm font-bold text-gray-800">Aún no hay tutoriales configurados</p>
                                <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
                                    Los enlaces y videos agregados en Configuración &gt; Columnas y Motivos (pestaña Panel de Insumos) aparecerán aquí automáticamente.
                                </p>
                            </div>
                        ) : (
                            <div className="mt-4 overflow-y-auto space-y-3 pr-1 flex-1 custom-scrollbar">
                                {tutoriales.map((tut, i) => {
                                    const isVideo = tut.url.includes('youtube.com') || tut.url.includes('youtu.be') || tut.url.includes('loom.com') || tut.url.includes('vimeo.com');

                                    return (
                                        <div
                                            key={tut.id || i}
                                            className="border border-gray-200 hover:border-red-300 rounded-2xl p-4 bg-white hover:bg-red-50/15 transition-all shadow-xs flex flex-col justify-between gap-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="text-sm font-bold text-gray-900">{tut.titulo}</h4>
                                                        {isVideo ? (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                                                                Video
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                                Enlace
                                                            </span>
                                                        )}
                                                    </div>
                                                    {tut.descripcion && (
                                                        <p className="text-xs text-gray-600 leading-relaxed">{tut.descripcion}</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                                                <span className="text-[11px] text-gray-400 font-mono truncate max-w-[260px]" title={tut.url}>
                                                    {tut.url}
                                                </span>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(tut.url);
                                                            setCopiadoTut(tut.url);
                                                            setTimeout(() => setCopiadoTut(null), 2000);
                                                        }}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 hover:border-gray-300 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                                                    >
                                                        {copiadoTut === tut.url ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                                                        {copiadoTut === tut.url ? 'Copiado' : 'Copiar'}
                                                    </button>
                                                    <a
                                                        href={tut.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                                                    >
                                                        <span>Ver tutorial</span>
                                                        <ExternalLink size={13} />
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="pt-4 border-t border-gray-100 flex justify-end mt-2">
                            <button
                                type="button"
                                onClick={() => setModalTutoriales(false)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                                Volver a la guía
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
