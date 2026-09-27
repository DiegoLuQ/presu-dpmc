'use client';

import React, { useState } from 'react';
import {
    X, HelpCircle, Plus, Pencil, Trash2, SlidersHorizontal,
    Video, Package, CheckCircle, Info, BookOpen, Layers,
    Clock, Check, AlertCircle, ArrowRight
} from 'lucide-react';

interface GuiaConvocadoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function GuiaConvocadoModal({ isOpen, onClose }: GuiaConvocadoModalProps) {
    const [tab, setTab] = useState<'pasos' | 'botones' | 'preguntas'>('pasos');

    if (!isOpen) return null;

    const botonesInfo = [
        {
            nombre: 'Agregar recurso',
            visual: (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-xs">
                    <Plus size={14} />
                    Agregar recurso
                </div>
            ),
            descripcion: 'Registra el recurso actual en la lista oficial de tu solicitud. Cada recurso se guarda de inmediato en el servidor.',
            consejo: 'Agrega un recurso a la vez. Puedes ingresar todos los ítems que requieras para tu área o asignatura.'
        },
        {
            nombre: 'Editar recurso',
            visual: (
                <div className="p-1.5 rounded-lg text-blue-600 bg-blue-50 border border-blue-100 inline-flex items-center">
                    <Pencil size={13} />
                </div>
            ),
            descripcion: 'Abre la ventana para modificar cantidad, precio, motivo, formato o mes de un insumo ya agregado.',
            consejo: 'Solo puedes editar un recurso mientras su estado sea "Pendiente" (antes de que el jefe de área lo evalúe).'
        },
        {
            nombre: 'Eliminar recurso',
            visual: (
                <div className="p-1.5 rounded-lg text-red-500 bg-red-50 border border-red-100 inline-flex items-center">
                    <Trash2 size={13} />
                </div>
            ),
            descripcion: 'Elimina de forma permanente el recurso de tu lista de solicitudes si ya no lo necesitas o lo ingresaste por error.',
            consejo: 'Al eliminarlo se quita inmediatamente del sistema y el total de tu solicitud se recalcula.'
        },
        {
            nombre: 'Columnas',
            visual: (
                <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 rounded-lg">
                    <SlidersHorizontal size={13} />
                    Columnas
                </div>
            ),
            descripcion: 'Despliega un menú para activar o desactivar columnas en la tabla de tus pedidos (Descripción, Motivo, Destino, Línea, etc.).',
            consejo: 'Útil si estás en una pantalla pequeña de laptop o celular y quieres ver la tabla más compacta.'
        },
        {
            nombre: 'Ver tutoriales',
            visual: (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold rounded-lg shadow-xs">
                    <Video size={13} />
                    Ver tutoriales
                </div>
            ),
            descripcion: 'Abre una ventana con videos y enlaces de ayuda preparados por la administración para guiarte en el proceso.',
            consejo: 'Revísalos si tienes dudas sobre cómo estimar precios o categorizar tus recursos.'
        },
    ];

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 sm:p-6 animate-in fade-in duration-150" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                
                {/* Cabecera */}
                <div className="px-6 py-5 border-b border-gray-150 flex items-center justify-between bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
                            <BookOpen size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                                Guía de Ayuda: ¿Cómo solicitar tus recursos?
                            </h2>
                            <p className="text-xs text-gray-500 font-medium">
                                Aprende cómo completar tu solicitud y qué hace cada función de la pantalla.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                        title="Cerrar guía"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Barra de pestañas */}
                <div className="px-6 border-b border-gray-150 bg-gray-50/60 flex items-center gap-2 shrink-0 py-2.5">
                    <button
                        type="button"
                        onClick={() => setTab('pasos')}
                        className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                            tab === 'pasos'
                                ? 'bg-white text-blue-700 shadow-xs border border-gray-200'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/60'
                        }`}
                    >
                        Paso a Paso
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('botones')}
                        className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                            tab === 'botones'
                                ? 'bg-white text-blue-700 shadow-xs border border-gray-200'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/60'
                        }`}
                    >
                        Botones y Funciones
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('preguntas')}
                        className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                            tab === 'preguntas'
                                ? 'bg-white text-blue-700 shadow-xs border border-gray-200'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/60'
                        }`}
                    >
                        Estados y Preguntas Frecuentes
                    </button>
                </div>

                {/* Contenido con scroll */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-50/30">
                    {tab === 'pasos' && (
                        <div className="space-y-5">
                            <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900 flex items-start gap-3">
                                <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
                                <div className="leading-relaxed">
                                    <span className="font-bold">¡Bienvenido al formulario de pedidos!</span>
                                    <p className="mt-1 text-blue-800">
                                        Aquí puedes solicitar los materiales, insumos o servicios que necesitas para tus actividades del año escolar. No necesitas usuario ni contraseña especial; solo completa los campos del panel izquierdo.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="bg-white border border-gray-200 rounded-2xl p-4.5 shadow-xs flex items-start gap-3.5">
                                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">1</div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm mb-1">Nombre simple y Descripción</h4>
                                        <p className="text-xs text-gray-600 leading-relaxed">
                                            En <strong>Nombre del recurso</strong> escribe solo el producto básico (ej: <em>«Balón de fútbol»</em> o <em>«Resma de papel»</em>). Si requieres una marca, color o modelo específico, ingrésalo en el campo <strong>Descripción</strong>.
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-white border border-gray-200 rounded-2xl p-4.5 shadow-xs flex items-start gap-3.5">
                                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">2</div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm mb-1">Formato, Cantidad y Precio c/IVA</h4>
                                        <p className="text-xs text-gray-600 leading-relaxed">
                                            Selecciona la unidad (caja, unidad, pliego, etc.), la cantidad y el <strong>precio unitario estimado con IVA incluido</strong>. El sistema calculará automáticamente el monto total.
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-white border border-gray-200 rounded-2xl p-4.5 shadow-xs flex items-start gap-3.5">
                                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">3</div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm mb-1">Mes y Motivo / Justificación (Obligatorio)</h4>
                                        <p className="text-xs text-gray-600 leading-relaxed">
                                            Indica en qué mes se necesitará el insumo. En el cuadro rojo de <strong>Motivo</strong>, explica brevemente para qué actividad o proyecto se utilizará este recurso. ¡Una buena justificación facilita la aprobación!
                                        </p>
                                    </div>
                                </div>

                                <div className="bg-white border border-gray-200 rounded-2xl p-4.5 shadow-xs flex items-start gap-3.5">
                                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">4</div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm mb-1">¿Para quién es? (Destino) y Agregar</h4>
                                        <p className="text-xs text-gray-600 leading-relaxed">
                                            Elige a quién beneficia el recurso (Alumnos, Funcionarios, Beneficio o Mantención) y haz clic en el botón azul <strong>«Agregar recurso»</strong>. El pedido aparecerá en la tabla de la derecha y quedará guardado automáticamente.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'botones' && (
                        <div className="space-y-3.5">
                            <p className="text-xs text-gray-500 font-medium px-1">
                                Resumen visual de todos los botones y controles disponibles en tu pantalla:
                            </p>
                            <div className="grid grid-cols-1 gap-3">
                                {botonesInfo.map((btn, idx) => (
                                    <div key={idx} className="bg-white rounded-2xl border border-gray-200/90 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="space-y-1.5 flex-1">
                                            <div className="flex items-center gap-2.5">
                                                <span className="font-bold text-gray-900 text-sm">{btn.nombre}</span>
                                            </div>
                                            <p className="text-xs text-gray-700 leading-relaxed">{btn.descripcion}</p>
                                            <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-2 border border-gray-100">
                                                <span className="font-semibold text-gray-700">Dato clave: </span>
                                                {btn.consejo}
                                            </div>
                                        </div>
                                        <div className="shrink-0 self-start sm:self-center">
                                            {btn.visual}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === 'preguntas' && (
                        <div className="space-y-5">
                            {/* Estados */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-3">
                                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                    <Layers size={16} className="text-blue-600" />
                                    ¿Qué significa el estado de cada recurso en la tabla?
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div className="p-3 rounded-xl bg-yellow-50 border border-yellow-200">
                                        <span className="font-bold text-yellow-800 block mb-1">Pendiente</span>
                                        <p className="text-yellow-700">Tu recurso fue guardado correctamente y está esperando ser revisado por el jefe de área. Aún puedes editarlo o eliminarlo.</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                                        <span className="font-bold text-green-800 block mb-1">Aceptado</span>
                                        <p className="text-green-700">El jefe de área revisó tu recurso y lo aprobó para ser incluido en el presupuesto oficial.</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                                        <span className="font-bold text-red-800 block mb-1">Rechazado</span>
                                        <p className="text-red-700">El recurso no pudo ser aprobado. Puedes consultar directamente con tu jefatura de área para mayor retroalimentación.</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                                        <span className="font-bold text-blue-800 block mb-1">Importado</span>
                                        <p className="text-blue-700">El recurso ya forma parte oficial del presupuesto institucional y se encuentra en proceso de adquisición o programación.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Preguntas frecuentes */}
                            <div className="space-y-3">
                                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
                                    <h4 className="font-bold text-gray-900 text-xs mb-1">¿Tengo que presionar un botón de &ldquo;Enviar todo al final&rdquo;?</h4>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        No. Cada vez que pulsas el botón azul <strong>«Agregar recurso»</strong>, el ítem se guarda de inmediato en el sistema. Puedes cerrar el navegador y volver cuando desees.
                                    </p>
                                </div>
                                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
                                    <h4 className="font-bold text-gray-900 text-xs mb-1">¿Puedo ingresar pedidos desde mi teléfono móvil?</h4>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Sí, la página está adaptada para computadores, tablets y teléfonos móviles. En celulares verás primero el formulario y abajo la lista de tus pedidos.
                                    </p>
                                </div>
                                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
                                    <h4 className="font-bold text-gray-900 text-xs mb-1">¿Hasta cuándo puedo ingresar pedidos?</h4>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        En la parte superior verás la fecha límite indicada en <strong>«Formulario válido hasta»</strong>. Pasada esa fecha, el formulario quedará bloqueado automáticamente.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-150 bg-white flex items-center justify-between shrink-0">
                    <div className="text-xs text-gray-400">
                        Presupuesto Colegio Diego Portales &amp; Colegio Macaya
                    </div>
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-xs cursor-pointer"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}
