'use client';

import React, { useState } from 'react';
import {
    X, HelpCircle, Plus, Copy, Check, CheckCircle, XCircle,
    Download, RotateCcw, Pencil, Lock, Trash2, SlidersHorizontal,
    ArrowLeft, ChevronDown, ChevronUp, Link2, ExternalLink,
    Info, BookOpen, Layers, CheckCheck
} from 'lucide-react';

interface GuiaConvocatoriasModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function GuiaConvocatoriasModal({ isOpen, onClose }: GuiaConvocatoriasModalProps) {
    const [tab, setTab] = useState<'botones' | 'flujo'>('botones');
    const [filtro, setFiltro] = useState('');

    if (!isOpen) return null;

    const listaBotones = [
        {
            seccion: 'Encabezado y Configuración',
            botones: [
                {
                    nombre: 'Volver a la solicitud',
                    renderVisual: () => (
                        <div className="p-2 rounded-xl bg-gray-100 text-gray-600 inline-flex items-center">
                            <ArrowLeft size={16} />
                        </div>
                    ),
                    icono: ArrowLeft,
                    descripcion: 'Regresa a la página principal del presupuesto oficial (Solicitud de Presupuesto) sin perder ningún cambio.',
                    detalle: 'Úsalo cuando termines de revisar o crear convocatorias para volver a la tabla general del presupuesto.'
                },
                {
                    nombre: 'Columnas',
                    renderVisual: () => (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-semibold rounded-xl bg-white shadow-xs">
                            <SlidersHorizontal size={13} />
                            Columnas
                        </div>
                    ),
                    icono: SlidersHorizontal,
                    descripcion: 'Despliega un menú para mostrar u ocultar columnas de la tabla de pedidos (Cant., Precio, Total, Motivo, Destino, Mes).',
                    detalle: 'Ideal para pantallas pequeñas o cuando deseas enfocarte solo en costos o justificaciones.'
                },
                {
                    nombre: '+ Nueva convocatoria',
                    renderVisual: () => (
                        <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-white text-xs font-bold rounded-xl shadow-xs">
                            <Plus size={14} />
                            Nueva convocatoria
                        </div>
                    ),
                    icono: Plus,
                    descripcion: 'Abre el modal para crear un nuevo proceso de solicitud para un cargo/subárea específica.',
                    detalle: 'Permite seleccionar el cargo destinatario, los días de vigencia (ej. 30 días) y un PIN numérico opcional de seguridad.'
                },
            ]
        },
        {
            seccion: 'Gestión de la Convocatoria',
            botones: [
                {
                    nombre: 'Copiar enlace público',
                    renderVisual: () => (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-primary bg-primary/10 rounded-lg">
                            <Copy size={13} />
                            Copiar
                        </div>
                    ),
                    icono: Copy,
                    descripcion: 'Copia al portapapeles la dirección web única del formulario externo para este cargo.',
                    detalle: 'Comparte este enlace por WhatsApp, correo o Teams con los profesores o encargados para que ingresen sus pedidos directamente.'
                },
                {
                    nombre: 'Cerrar convocatoria',
                    renderVisual: () => (
                        <div className="p-1.5 rounded-lg text-orange-600 bg-orange-50 border border-orange-200 inline-flex items-center">
                            <X size={15} />
                        </div>
                    ),
                    icono: X,
                    descripcion: 'Bloquea el formulario público para que no se puedan ingresar más pedidos una vez expirado el plazo.',
                    detalle: 'No elimina nada: todos los pedidos previamente enviados por los profesores se conservan intactos para su revisión.'
                },
                {
                    nombre: 'Eliminar convocatoria',
                    renderVisual: () => (
                        <div className="p-1.5 rounded-lg text-red-600 bg-red-50 border border-red-200 inline-flex items-center">
                            <Trash2 size={15} />
                        </div>
                    ),
                    icono: Trash2,
                    descripcion: 'Borra definitivamente la convocatoria y todos sus pedidos externos asociados.',
                    detalle: 'Ten precaución: solo borra los pedidos que aún no han sido importados. Los que ya fueron importados al presupuesto oficial no se tocan.'
                },
                {
                    nombre: 'Desplegar / Colapsar pedidos',
                    renderVisual: () => (
                        <div className="p-1.5 rounded-lg text-gray-600 bg-gray-100 inline-flex items-center">
                            <ChevronDown size={15} />
                        </div>
                    ),
                    icono: ChevronDown,
                    descripcion: 'Muestra u oculta la tabla con el listado detallado de pedidos recibidos para este cargo.',
                    detalle: 'Permite ordenar visualmente la pantalla cuando tienes múltiples convocatorias abiertas.'
                },
            ]
        },
        {
            seccion: 'Acciones Masivas & Integración al Presupuesto',
            botones: [
                {
                    nombre: 'Aceptar todos los pendientes',
                    renderVisual: () => (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-green-300 text-green-700 text-xs font-bold rounded-lg shadow-xs">
                            <CheckCircle size={13} />
                            Aceptar todos los pendientes
                        </div>
                    ),
                    icono: CheckCircle,
                    descripcion: 'Aprueba en bloque todos los recursos en estado "Pendiente" de esta convocatoria con un solo clic.',
                    detalle: 'Ahorra tiempo cuando ya revisaste el listado completo y deseas dejar todos los recursos listos para la importación.'
                },
                {
                    nombre: 'Importar al presupuesto',
                    renderVisual: () => (
                        <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg shadow-xs">
                            <Download size={13} />
                            Importar al presupuesto
                        </div>
                    ),
                    icono: Download,
                    descripcion: 'Convierte todos los pedidos aceptados en ítems presupuestarios oficiales.',
                    detalle: 'Al hacer clic, el sistema genera automáticamente el registro en PresupuestoDetalle, asigna la cuenta contable con IA, la subvención adecuada y marca los pedidos como "Importados".'
                },
            ]
        },
        {
            seccion: 'Acciones por Recurso en la Tabla',
            botones: [
                {
                    nombre: 'Editar pedido',
                    renderVisual: () => (
                        <div className="p-1.5 rounded-lg text-primary bg-primary/10 inline-flex items-center">
                            <Pencil size={13} />
                        </div>
                    ),
                    icono: Pencil,
                    descripcion: 'Abre la ventana para modificar los datos del pedido antes de aceptarlo o importarlo.',
                    detalle: 'Permite corregir el nombre del recurso, formato/unidad, cantidad, precio estimado, motivo, destino o mes requerido.'
                },
                {
                    nombre: 'Aceptar pedido individual',
                    renderVisual: () => (
                        <div className="p-1.5 rounded-lg text-green-700 bg-green-100 inline-flex items-center">
                            <CheckCircle size={13} />
                        </div>
                    ),
                    icono: CheckCircle,
                    descripcion: 'Aprueba individualmente el pedido de este recurso.',
                    detalle: 'Cambia su estado a "Aceptado", lo que habilitará el botón de importar al presupuesto.'
                },
                {
                    nombre: 'Rechazar pedido',
                    renderVisual: () => (
                        <div className="p-1.5 rounded-lg text-red-600 bg-red-100 inline-flex items-center">
                            <XCircle size={13} />
                        </div>
                    ),
                    icono: XCircle,
                    descripcion: 'Rechaza la solicitud de este recurso específico.',
                    detalle: 'Abre un cuadro de texto para ingresar un motivo u observación del rechazo para dar feedback al docente o encargado.'
                },
                {
                    nombre: 'Revertir a Pendiente',
                    renderVisual: () => (
                        <div className="p-1.5 rounded-lg text-amber-600 bg-amber-100 inline-flex items-center">
                            <RotateCcw size={13} />
                        </div>
                    ),
                    icono: RotateCcw,
                    descripcion: 'Devuelve un recurso aceptado o rechazado nuevamente al estado "Pendiente".',
                    detalle: 'Úsalo si cambiaste de opinión o necesitas verificar detalles adicionales antes de tomar una decisión final.'
                },
            ]
        }
    ];

    const filtroLower = filtro.toLowerCase().trim();
    const seccionesFiltradas = listaBotones.map(sec => ({
        ...sec,
        botones: sec.botones.filter(b =>
            !filtroLower ||
            b.nombre.toLowerCase().includes(filtroLower) ||
            b.descripcion.toLowerCase().includes(filtroLower) ||
            b.detalle.toLowerCase().includes(filtroLower)
        )
    })).filter(sec => sec.botones.length > 0);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 sm:p-6 animate-in fade-in duration-150" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                
                {/* Cabecera */}
                <div className="px-6 py-5 border-b border-gray-150 flex items-center justify-between bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md shadow-primary/20 shrink-0">
                            <BookOpen size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                                Guía de Convocatorias y Botones
                            </h2>
                            <p className="text-xs text-gray-500 font-medium">
                                Explicación detallada de cada botón y del ciclo de vida de los pedidos externos.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                        title="Cerrar"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Sub-barra de Pestañas */}
                <div className="px-6 border-b border-gray-150 bg-gray-50/60 flex items-center justify-between gap-3 shrink-0 pt-2 pb-2">
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setTab('botones')}
                            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                                tab === 'botones'
                                    ? 'bg-white text-primary shadow-xs border border-gray-200'
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/60'
                            }`}
                        >
                            Catálogo de Botones
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab('flujo')}
                            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                                tab === 'flujo'
                                    ? 'bg-white text-primary shadow-xs border border-gray-200'
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/60'
                            }`}
                        >
                            Flujo de Trabajo (Paso a Paso)
                        </button>
                    </div>

                    {tab === 'botones' && (
                        <div className="w-56">
                            <input
                                type="text"
                                placeholder="Buscar botón..."
                                value={filtro}
                                onChange={e => setFiltro(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                        </div>
                    )}
                </div>

                {/* Contenido con scroll */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-50/30">
                    {tab === 'flujo' ? (
                        <div className="space-y-6">
                            <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900 leading-relaxed flex items-start gap-3">
                                <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold">¿Cómo funciona el módulo de Convocatorias?</span>
                                    <p className="mt-1 text-blue-800">
                                        Permite descentralizar el levantamiento de necesidades: cada encargado o profesor ingresa directamente lo que necesita a través de un enlace web público, sin requerir una cuenta de usuario en el sistema. Tú solo revisas, ajustas y apruebas.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="bg-white border border-gray-200 rounded-2xl p-4 relative shadow-xs">
                                    <div className="w-7 h-7 rounded-xl bg-primary text-white font-bold text-xs flex items-center justify-center mb-3">1</div>
                                    <h4 className="font-bold text-gray-900 text-sm mb-1">Crear Convocatoria</h4>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        Presiona <strong>+ Nueva convocatoria</strong>, elige el cargo (ej. Docente de Inglés, Jefe Técnico) y fija el plazo de días.
                                    </p>
                                </div>

                                <div className="bg-white border border-gray-200 rounded-2xl p-4 relative shadow-xs">
                                    <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center mb-3">2</div>
                                    <h4 className="font-bold text-gray-900 text-sm mb-1">Compartir Enlace</h4>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        Haz clic en <strong>Copiar</strong> para enviar el enlace público al encargado. Ellos llenan el formulario con sus recursos requeridos.
                                    </p>
                                </div>

                                <div className="bg-white border border-gray-200 rounded-2xl p-4 relative shadow-xs">
                                    <div className="w-7 h-7 rounded-xl bg-amber-500 text-white font-bold text-xs flex items-center justify-center mb-3">3</div>
                                    <h4 className="font-bold text-gray-900 text-sm mb-1">Revisar y Decidir</h4>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        Puedes <strong>Editar</strong> montos o cantidades, <strong>Aceptar</strong> recursos válidos o <strong>Rechazar</strong> con observación.
                                    </p>
                                </div>

                                <div className="bg-white border border-gray-200 rounded-2xl p-4 relative shadow-xs">
                                    <div className="w-7 h-7 rounded-xl bg-green-600 text-white font-bold text-xs flex items-center justify-center mb-3">4</div>
                                    <h4 className="font-bold text-gray-900 text-sm mb-1">Importar Oficial</h4>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        Haz clic en <strong>Importar al presupuesto</strong>. Los ítems aprobados entran al presupuesto oficial con su cuenta contable sugerida por IA.
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs space-y-3">
                                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                    <Layers size={16} className="text-primary" />
                                    Estados de un Pedido y qué significan
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                    <div className="p-3 rounded-xl bg-yellow-50 border border-yellow-200">
                                        <span className="font-bold text-yellow-800 block mb-1">Pendiente</span>
                                        <p className="text-yellow-700">Enviado por el solicitante externo. En espera de evaluación por el jefe de área.</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-green-50 border border-green-200">
                                        <span className="font-bold text-green-800 block mb-1">Aceptado</span>
                                        <p className="text-green-700">Aprobado para formar parte del presupuesto. Habilita el botón de importación.</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                                        <span className="font-bold text-red-800 block mb-1">Rechazado</span>
                                        <p className="text-red-700">Descartado. Contiene un comentario explicativo para el solicitante.</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                                        <span className="font-bold text-blue-800 block mb-1">Importado</span>
                                        <p className="text-blue-700">Ya traspasado con éxito al presupuesto oficial. No se vuelve a duplicar.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {seccionesFiltradas.length === 0 ? (
                                <div className="text-center py-12 text-gray-400 text-sm">
                                    No se encontraron botones que coincidan con &ldquo;{filtro}&rdquo;.
                                </div>
                            ) : (
                                seccionesFiltradas.map((seccion, sIdx) => (
                                    <div key={sIdx} className="space-y-3">
                                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
                                            {seccion.seccion}
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {seccion.botones.map((btn, bIdx) => (
                                                <div
                                                    key={bIdx}
                                                    className="bg-white rounded-2xl border border-gray-200/80 p-4 hover:border-gray-300 hover:shadow-xs transition-all flex flex-col justify-between"
                                                >
                                                    <div>
                                                        <div className="flex items-center justify-between gap-2 mb-2">
                                                            <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                                                {btn.nombre}
                                                            </div>
                                                            <div>{btn.renderVisual()}</div>
                                                        </div>
                                                        <p className="text-xs font-medium text-gray-700 mb-2 leading-relaxed">
                                                            {btn.descripcion}
                                                        </p>
                                                    </div>
                                                    <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-500 leading-relaxed bg-gray-50/50 -mx-4 -mb-4 px-4 py-2 rounded-b-2xl">
                                                        <span className="font-semibold text-gray-700">Uso: </span>
                                                        {btn.detalle}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
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
                        className="px-5 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:brightness-105 active:scale-95 transition-all shadow-xs"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}
