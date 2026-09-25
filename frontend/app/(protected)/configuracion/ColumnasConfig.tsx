'use client';

import React, { useEffect, useState } from 'react';
import {
    Loader2, Check, SlidersHorizontal, MessageSquareX, Plus, X, ShieldAlert,
    FileSpreadsheet, Users, ShieldCheck, Sparkles, EyeOff, Video, ExternalLink, Trash2, Pencil, Link as LinkIcon,
    BookOpen, Package, Layers, UploadCloud
} from 'lucide-react';
import api from '@/lib/api/client';

export interface TutorialItem {
    id: string;
    titulo: string;
    url: string;
    descripcion?: string;
}

// Columnas configurables de la tabla de detalle de solicitud (# y Producto van siempre).
const COLUMNAS = [
    { key: 'categoria', label: 'Categoría' },
    { key: 'formato', label: 'Formato' },
    { key: 'cantidad', label: 'Cantidad' },
    { key: 'valor', label: 'Valor Unitario' },
    { key: 'total', label: 'Total' },
    { key: 'fecha', label: 'Fecha' },
    { key: 'motivo', label: 'Motivo' },
    { key: 'actividad', label: 'Actividad PME' },
    { key: 'estado', label: 'Estado' },
];

const CLAVE_ACCESO_PLANTILLA = 'acceso_boton_plantilla_excel';
const CLAVE_ACCESO_IMPORTAR = 'acceso_importar_excel';
const CLAVE_ACCESO_BOTON_IA = 'acceso_boton_asesoria_pme_ia';
const CLAVE_ACCESO_BOTON_PREPARAR = 'acceso_boton_preparar_ppto';
const CLAVE_COLS = 'columnas_solicitud';
const CLAVE_MOTIVOS = 'motivos_rechazo';

// Tutoriales exclusivos por sección
const CLAVE_TUTORIALES_PEDIDOS = 'tutoriales_pedidos';
const CLAVE_MOSTRAR_TUTORIALES_PEDIDOS = 'mostrar_boton_tutoriales_pedidos';
const CLAVE_TUTORIALES_INSUMOS = 'tutoriales_insumos';
const CLAVE_MOSTRAR_TUTORIALES_INSUMOS = 'mostrar_boton_tutoriales_insumos';

const COLS_DEFECTO = ['formato', 'valor', 'total', 'fecha', 'motivo', 'actividad', 'estado'];
const MOTIVOS_DEFECTO = ['Ya se pidió', 'Fuera del presupuesto', 'No es necesario'];

export default function ColumnasConfig() {
    const [accesoPlantilla, setAccesoPlantilla] = useState<'oculto' | 'solo_admin' | 'todos'>('todos');
    const [accesoImportar, setAccesoImportar] = useState<'oculto' | 'solo_admin' | 'todos'>('solo_admin');
    const [accesoBotonIA, setAccesoBotonIA] = useState<'oculto' | 'solo_admin' | 'todos'>('oculto');
    const [accesoBotonPreparar, setAccesoBotonPreparar] = useState<'oculto' | 'solo_admin' | 'todos'>('oculto');
    const [activas, setActivas] = useState<string[]>(COLS_DEFECTO);
    const [motivos, setMotivos] = useState<string[]>(MOTIVOS_DEFECTO);

    // Tutoriales para pedidos públicos (/pedidos/[token])
    const [tutorialesPedidos, setTutorialesPedidos] = useState<TutorialItem[]>([]);
    const [mostrarBotonTutPedidos, setMostrarBotonTutPedidos] = useState<boolean>(true);

    // Tutoriales para el panel de insumos y presupuesto (/presupuesto/agregar-recursos)
    const [tutorialesInsumos, setTutorialesInsumos] = useState<TutorialItem[]>([]);
    const [mostrarBotonTutInsumos, setMostrarBotonTutInsumos] = useState<boolean>(true);

    // Pestaña activa del bloque de tutoriales
    const [tabTutoriales, setTabTutoriales] = useState<'insumos' | 'pedidos'>('insumos');

    const [modalTut, setModalTut] = useState<{ open: boolean; tipo: 'insumos' | 'pedidos'; index: number | null }>({
        open: false,
        tipo: 'insumos',
        index: null,
    });
    const [formTut, setFormTut] = useState<{ titulo: string; url: string; descripcion: string }>({ titulo: '', url: '', descripcion: '' });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [guardado, setGuardado] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [accPlan, acc, accIA, accPrep, cols, mot, tutsPed, btnPed, tutsIns, btnIns] = await Promise.all([
                    api.get(`/catalogos/config/${CLAVE_ACCESO_PLANTILLA}`).catch(() => ({ data: { valor: null } })),
                    api.get(`/catalogos/config/${CLAVE_ACCESO_IMPORTAR}`).catch(() => ({ data: { valor: null } })),
                    api.get(`/catalogos/config/${CLAVE_ACCESO_BOTON_IA}`).catch(() => ({ data: { valor: null } })),
                    api.get(`/catalogos/config/${CLAVE_ACCESO_BOTON_PREPARAR}`).catch(() => ({ data: { valor: null } })),
                    api.get(`/catalogos/config/${CLAVE_COLS}`).catch(() => ({ data: { valor: null } })),
                    api.get(`/catalogos/config/${CLAVE_MOTIVOS}`).catch(() => ({ data: { valor: null } })),
                    api.get(`/catalogos/config/${CLAVE_TUTORIALES_PEDIDOS}`).catch(() => ({ data: { valor: null } })),
                    api.get(`/catalogos/config/${CLAVE_MOSTRAR_TUTORIALES_PEDIDOS}`).catch(() => ({ data: { valor: null } })),
                    api.get(`/catalogos/config/${CLAVE_TUTORIALES_INSUMOS}`).catch(() => ({ data: { valor: null } })),
                    api.get(`/catalogos/config/${CLAVE_MOSTRAR_TUTORIALES_INSUMOS}`).catch(() => ({ data: { valor: null } })),
                ]);
                if (['oculto', 'solo_admin', 'todos'].includes(accPlan.data?.valor)) {
                    setAccesoPlantilla(accPlan.data.valor);
                }
                if (['oculto', 'solo_admin', 'todos'].includes(acc.data?.valor)) {
                    setAccesoImportar(acc.data.valor);
                }
                if (['oculto', 'solo_admin', 'todos'].includes(accIA.data?.valor)) {
                    setAccesoBotonIA(accIA.data.valor);
                }
                if (['oculto', 'solo_admin', 'todos'].includes(accPrep.data?.valor)) {
                    setAccesoBotonPreparar(accPrep.data.valor);
                }
                if (Array.isArray(cols.data?.valor)) setActivas(cols.data.valor);
                if (Array.isArray(mot.data?.valor) && mot.data.valor.length > 0) setMotivos(mot.data.valor);
                if (Array.isArray(tutsPed.data?.valor)) setTutorialesPedidos(tutsPed.data.valor);
                if (typeof btnPed.data?.valor === 'boolean') setMostrarBotonTutPedidos(btnPed.data.valor);
                if (Array.isArray(tutsIns.data?.valor)) setTutorialesInsumos(tutsIns.data.valor);
                if (typeof btnIns.data?.valor === 'boolean') setMostrarBotonTutInsumos(btnIns.data.valor);
            } catch {
                /* sin config: usar defectos */
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const toggle = (key: string) => {
        setActivas(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const guardar = async () => {
        setSaving(true);
        setGuardado(false);
        try {
            const motivosLimpios = motivos.map(m => m.trim()).filter(Boolean);
            const tutPedLimpios = tutorialesPedidos.filter(t => t.titulo.trim() && t.url.trim());
            const tutInsLimpios = tutorialesInsumos.filter(t => t.titulo.trim() && t.url.trim());

            await Promise.all([
                api.put(`/catalogos/config/${CLAVE_ACCESO_PLANTILLA}`, { valor: accesoPlantilla }),
                api.put(`/catalogos/config/${CLAVE_ACCESO_IMPORTAR}`, { valor: accesoImportar }),
                api.put(`/catalogos/config/${CLAVE_ACCESO_BOTON_IA}`, { valor: accesoBotonIA }),
                api.put(`/catalogos/config/${CLAVE_ACCESO_BOTON_PREPARAR}`, { valor: accesoBotonPreparar }),
                api.put(`/catalogos/config/${CLAVE_COLS}`, { valor: activas }),
                api.put(`/catalogos/config/${CLAVE_MOTIVOS}`, { valor: motivosLimpios }),
                api.put(`/catalogos/config/${CLAVE_TUTORIALES_PEDIDOS}`, { valor: tutPedLimpios }),
                api.put(`/catalogos/config/${CLAVE_MOSTRAR_TUTORIALES_PEDIDOS}`, { valor: mostrarBotonTutPedidos }),
                api.put(`/catalogos/config/${CLAVE_TUTORIALES_INSUMOS}`, { valor: tutInsLimpios }),
                api.put(`/catalogos/config/${CLAVE_MOSTRAR_TUTORIALES_INSUMOS}`, { valor: mostrarBotonTutInsumos }),
            ]);
            setMotivos(motivosLimpios.length ? motivosLimpios : MOTIVOS_DEFECTO);
            setTutorialesPedidos(tutPedLimpios);
            setTutorialesInsumos(tutInsLimpios);
            setGuardado(true);
            setTimeout(() => setGuardado(false), 2500);
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Error al guardar la configuración');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* 1. Control de Acceso: Herramientas de Carga y Presupuesto (Plantilla, Importar y Preparar) */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                        <FileSpreadsheet size={18} />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-gray-900">Herramientas de Presupuesto: Plantilla, Importar y Preparar</h3>
                        <p className="text-[12px] text-gray-400 font-medium">
                            Controla de forma individual la visibilidad y acceso de los botones de carga y gestión masiva en el panel de presupuesto.
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center gap-2 text-gray-400 py-6 justify-center">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-sm font-medium">Cargando configuración...</span>
                    </div>
                ) : (
                    <div className="mt-5 space-y-4">
                        {/* 1. Botón Plantilla Excel */}
                        <div className="p-4 bg-gray-50/70 border border-gray-200/80 rounded-2xl">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                                        <FileSpreadsheet size={15} />
                                    </span>
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-900">Botón «Plantilla Excel»</h4>
                                        <p className="text-[11px] text-gray-500">Descarga de la planilla oficial de presupuesto en Excel.</p>
                                    </div>
                                </div>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    accesoPlantilla === 'oculto' ? 'bg-rose-100 text-rose-700' :
                                    accesoPlantilla === 'solo_admin' ? 'bg-violet-100 text-violet-700' :
                                    'bg-emerald-100 text-emerald-700'
                                }`}>
                                    {accesoPlantilla === 'oculto' ? 'Oculto' : accesoPlantilla === 'solo_admin' ? 'Solo Admin' : 'Todos'}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                <div
                                    onClick={() => setAccesoPlantilla('oculto')}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                                        accesoPlantilla === 'oculto' ? 'bg-rose-50/60 border-rose-400 shadow-2xs' : 'bg-white border-gray-200/80 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <EyeOff size={15} className={accesoPlantilla === 'oculto' ? 'text-rose-600' : 'text-gray-400'} />
                                        <span className="text-xs font-bold text-gray-800">Oculto (Deshabilitado)</span>
                                    </div>
                                    <input type="radio" checked={accesoPlantilla === 'oculto'} onChange={() => setAccesoPlantilla('oculto')} className="text-rose-500 focus:ring-rose-500 cursor-pointer" />
                                </div>
                                <div
                                    onClick={() => setAccesoPlantilla('solo_admin')}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                                        accesoPlantilla === 'solo_admin' ? 'bg-violet-50/60 border-violet-500 shadow-2xs' : 'bg-white border-gray-200/80 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck size={15} className={accesoPlantilla === 'solo_admin' ? 'text-violet-600' : 'text-gray-400'} />
                                        <span className="text-xs font-bold text-gray-800">Solo Administradores</span>
                                    </div>
                                    <input type="radio" checked={accesoPlantilla === 'solo_admin'} onChange={() => setAccesoPlantilla('solo_admin')} className="text-violet-600 focus:ring-violet-600 cursor-pointer" />
                                </div>
                                <div
                                    onClick={() => setAccesoPlantilla('todos')}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                                        accesoPlantilla === 'todos' ? 'bg-emerald-50/60 border-emerald-500 shadow-2xs' : 'bg-white border-gray-200/80 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Users size={15} className={accesoPlantilla === 'todos' ? 'text-emerald-600' : 'text-gray-400'} />
                                        <span className="text-xs font-bold text-gray-800">Habilitado (Todos)</span>
                                    </div>
                                    <input type="radio" checked={accesoPlantilla === 'todos'} onChange={() => setAccesoPlantilla('todos')} className="text-emerald-600 focus:ring-emerald-600 cursor-pointer" />
                                </div>
                            </div>
                        </div>

                        {/* 2. Botón Importar Excel */}
                        <div className="p-4 bg-gray-50/70 border border-gray-200/80 rounded-2xl">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                                        <UploadCloud size={15} />
                                    </span>
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-900">Botón «Importar Excel»</h4>
                                        <p className="text-[11px] text-gray-500">Carga masiva de ítems y recursos a través de la plantilla Excel.</p>
                                    </div>
                                </div>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    accesoImportar === 'oculto' ? 'bg-rose-100 text-rose-700' :
                                    accesoImportar === 'solo_admin' ? 'bg-violet-100 text-violet-700' :
                                    'bg-emerald-100 text-emerald-700'
                                }`}>
                                    {accesoImportar === 'oculto' ? 'Oculto' : accesoImportar === 'solo_admin' ? 'Solo Admin' : 'Todos'}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                <div
                                    onClick={() => setAccesoImportar('oculto')}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                                        accesoImportar === 'oculto' ? 'bg-rose-50/60 border-rose-400 shadow-2xs' : 'bg-white border-gray-200/80 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <EyeOff size={15} className={accesoImportar === 'oculto' ? 'text-rose-600' : 'text-gray-400'} />
                                        <span className="text-xs font-bold text-gray-800">Oculto (Deshabilitado)</span>
                                    </div>
                                    <input type="radio" checked={accesoImportar === 'oculto'} onChange={() => setAccesoImportar('oculto')} className="text-rose-500 focus:ring-rose-500 cursor-pointer" />
                                </div>
                                <div
                                    onClick={() => setAccesoImportar('solo_admin')}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                                        accesoImportar === 'solo_admin' ? 'bg-violet-50/60 border-violet-500 shadow-2xs' : 'bg-white border-gray-200/80 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck size={15} className={accesoImportar === 'solo_admin' ? 'text-violet-600' : 'text-gray-400'} />
                                        <span className="text-xs font-bold text-gray-800">Solo Administradores</span>
                                    </div>
                                    <input type="radio" checked={accesoImportar === 'solo_admin'} onChange={() => setAccesoImportar('solo_admin')} className="text-violet-600 focus:ring-violet-600 cursor-pointer" />
                                </div>
                                <div
                                    onClick={() => setAccesoImportar('todos')}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                                        accesoImportar === 'todos' ? 'bg-emerald-50/60 border-emerald-500 shadow-2xs' : 'bg-white border-gray-200/80 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Users size={15} className={accesoImportar === 'todos' ? 'text-emerald-600' : 'text-gray-400'} />
                                        <span className="text-xs font-bold text-gray-800">Habilitado (Todos)</span>
                                    </div>
                                    <input type="radio" checked={accesoImportar === 'todos'} onChange={() => setAccesoImportar('todos')} className="text-emerald-600 focus:ring-emerald-600 cursor-pointer" />
                                </div>
                            </div>
                        </div>

                        {/* 3. Botón Preparar */}
                        <div className="p-4 bg-gray-50/70 border border-gray-200/80 rounded-2xl">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="p-1.5 bg-violet-100 text-violet-700 rounded-lg">
                                        <Layers size={15} />
                                    </span>
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-900">Botón «Preparar»</h4>
                                        <p className="text-[11px] text-gray-500">Agrupar filas repetidas y cruzarlas con catálogo oficial y PME.</p>
                                    </div>
                                </div>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    accesoBotonPreparar === 'oculto' ? 'bg-rose-100 text-rose-700' :
                                    accesoBotonPreparar === 'solo_admin' ? 'bg-violet-100 text-violet-700' :
                                    'bg-emerald-100 text-emerald-700'
                                }`}>
                                    {accesoBotonPreparar === 'oculto' ? 'Oculto' : accesoBotonPreparar === 'solo_admin' ? 'Solo Admin' : 'Todos'}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                <div
                                    onClick={() => setAccesoBotonPreparar('oculto')}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                                        accesoBotonPreparar === 'oculto' ? 'bg-rose-50/60 border-rose-400 shadow-2xs' : 'bg-white border-gray-200/80 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <EyeOff size={15} className={accesoBotonPreparar === 'oculto' ? 'text-rose-600' : 'text-gray-400'} />
                                        <span className="text-xs font-bold text-gray-800">Oculto (Deshabilitado)</span>
                                    </div>
                                    <input type="radio" checked={accesoBotonPreparar === 'oculto'} onChange={() => setAccesoBotonPreparar('oculto')} className="text-rose-500 focus:ring-rose-500 cursor-pointer" />
                                </div>
                                <div
                                    onClick={() => setAccesoBotonPreparar('solo_admin')}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                                        accesoBotonPreparar === 'solo_admin' ? 'bg-violet-50/60 border-violet-500 shadow-2xs' : 'bg-white border-gray-200/80 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck size={15} className={accesoBotonPreparar === 'solo_admin' ? 'text-violet-600' : 'text-gray-400'} />
                                        <span className="text-xs font-bold text-gray-800">Solo Administradores</span>
                                    </div>
                                    <input type="radio" checked={accesoBotonPreparar === 'solo_admin'} onChange={() => setAccesoBotonPreparar('solo_admin')} className="text-violet-600 focus:ring-violet-600 cursor-pointer" />
                                </div>
                                <div
                                    onClick={() => setAccesoBotonPreparar('todos')}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                                        accesoBotonPreparar === 'todos' ? 'bg-emerald-50/60 border-emerald-500 shadow-2xs' : 'bg-white border-gray-200/80 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Users size={15} className={accesoBotonPreparar === 'todos' ? 'text-emerald-600' : 'text-gray-400'} />
                                        <span className="text-xs font-bold text-gray-800">Habilitado (Todos)</span>
                                    </div>
                                    <input type="radio" checked={accesoBotonPreparar === 'todos'} onChange={() => setAccesoBotonPreparar('todos')} className="text-emerald-600 focus:ring-emerald-600 cursor-pointer" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. Control de Acceso: Botón Asesorar Actividad (IA) */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-violet-700">
                        <Sparkles size={18} />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-gray-900">Botón «Asesorar Actividad (IA)» en Panel de Insumo</h3>
                        <p className="text-[12px] text-gray-400 font-medium">
                            Define quiénes pueden ver y usar el botón de Inteligencia Artificial para vincular actividades PME en el formulario de insumos.
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center gap-2 text-gray-400 py-6 justify-center">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-sm font-medium">Cargando configuración...</span>
                    </div>
                ) : (
                    <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        {/* Opción 1: Oculto */}
                        <div
                            onClick={() => setAccesoBotonIA('oculto')}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                                accesoBotonIA === 'oculto'
                                    ? 'bg-rose-50/50 border-rose-400 shadow-xs'
                                    : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50/50'
                            }`}
                        >
                            <div className={`p-2.5 rounded-xl mt-0.5 ${accesoBotonIA === 'oculto' ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                <EyeOff size={18} />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-gray-900">Oculto (Desactivado)</h4>
                                    <input
                                        type="radio"
                                        name="accesoBotonIA"
                                        checked={accesoBotonIA === 'oculto'}
                                        onChange={() => setAccesoBotonIA('oculto')}
                                        className="text-rose-500 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 font-medium mt-1">
                                    El botón no aparecerá en el panel de insumos para ningún usuario.
                                </p>
                            </div>
                        </div>

                        {/* Opción 2: Solo Administradores */}
                        <div
                            onClick={() => setAccesoBotonIA('solo_admin')}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                                accesoBotonIA === 'solo_admin'
                                    ? 'bg-violet-50/50 border-violet-500 shadow-xs'
                                    : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50/50'
                            }`}
                        >
                            <div className={`p-2.5 rounded-xl mt-0.5 ${accesoBotonIA === 'solo_admin' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                <ShieldCheck size={18} />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-gray-900">Solo Administradores</h4>
                                    <input
                                        type="radio"
                                        name="accesoBotonIA"
                                        checked={accesoBotonIA === 'solo_admin'}
                                        onChange={() => setAccesoBotonIA('solo_admin')}
                                        className="text-violet-600 focus:ring-violet-600 w-4 h-4 cursor-pointer"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 font-medium mt-1">
                                    Visible únicamente para Administrador, Directivo o Sostenedor.
                                </p>
                            </div>
                        </div>

                        {/* Opción 3: Todos los usuarios */}
                        <div
                            onClick={() => setAccesoBotonIA('todos')}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                                accesoBotonIA === 'todos'
                                    ? 'bg-emerald-50/50 border-emerald-500 shadow-xs'
                                    : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50/50'
                            }`}
                        >
                            <div className={`p-2.5 rounded-xl mt-0.5 ${accesoBotonIA === 'todos' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                <Users size={18} />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-gray-900">Todos los Usuarios</h4>
                                    <input
                                        type="radio"
                                        name="accesoBotonIA"
                                        checked={accesoBotonIA === 'todos'}
                                        onChange={() => setAccesoBotonIA('todos')}
                                        className="text-emerald-600 focus:ring-emerald-600 w-4 h-4 cursor-pointer"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 font-medium mt-1">
                                    Cualquier usuario con acceso al panel de insumos podrá utilizar la asesoría IA.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>



            {/* 3. Columnas visibles */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <SlidersHorizontal size={18} />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-gray-900">Columnas de la Tabla de Solicitud</h3>
                        <p className="text-[12px] text-gray-400 font-medium">
                            Elige qué columnas se muestran por defecto en el detalle de cada solicitud. Aplica a todos los usuarios del colegio.
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center gap-2 text-gray-400 py-10 justify-center">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-sm font-medium">Cargando configuración...</span>
                    </div>
                ) : (
                    <>
                        <p className="text-[11px] text-gray-400 font-medium mt-4 mb-2">Las columnas <b>#</b> y <b>Producto</b> siempre se muestran.</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {COLUMNAS.map(col => {
                                const checked = activas.includes(col.key);
                                return (
                                    <label
                                        key={col.key}
                                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${checked ? 'bg-primary/5 border-primary/40' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggle(col.key)}
                                            className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary/20"
                                        />
                                        <span className={`text-xs font-semibold ${checked ? 'text-primary' : 'text-gray-700'}`}>{col.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* 3. Motivos de rechazo */}
            {!loading && (
                <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                            <MessageSquareX size={18} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">Motivos de Rechazo</h3>
                            <p className="text-[12px] text-gray-400 font-medium">
                                Opciones rápidas que aparecen al rechazar un recurso en la revisión de una solicitud.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2 mt-4">
                        {motivos.map((m, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={m}
                                    onChange={(e) => setMotivos(prev => prev.map((x, idx) => idx === i ? e.target.value : x))}
                                    placeholder="Escribe un motivo..."
                                    className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                                <button
                                    onClick={() => setMotivos(prev => prev.filter((_, idx) => idx !== i))}
                                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                    title="Eliminar motivo"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() => setMotivos(prev => [...prev, ''])}
                            className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline mt-1"
                        >
                            <Plus size={14} /> Agregar motivo
                        </button>
                    </div>
                </div>
            )}

            {/* 4. Tutoriales y Enlaces de Ayuda Exclusivos por Sección */}
            {!loading && (
                <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                                <Video size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900">Tutoriales y Videos de Ayuda del Sistema</h3>
                                <p className="text-[12px] text-gray-400 font-medium">
                                    Gestiona videos y guías exclusivas para cada sección del sistema.
                                </p>
                            </div>
                        </div>

                        {/* Selector de Sección */}
                        <div className="flex items-center bg-gray-100/80 p-1 rounded-2xl border border-gray-200/60 self-start sm:self-auto">
                            <button
                                type="button"
                                onClick={() => setTabTutoriales('insumos')}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                                    tabTutoriales === 'insumos'
                                        ? 'bg-white text-blue-700 shadow-xs'
                                        : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                <span>Panel de Insumos</span>
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${tabTutoriales === 'insumos' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-600'}`}>
                                    {tutorialesInsumos.length}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setTabTutoriales('pedidos')}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                                    tabTutoriales === 'pedidos'
                                        ? 'bg-white text-blue-700 shadow-xs'
                                        : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                <span>Formulario de Pedidos</span>
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${tabTutoriales === 'pedidos' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-600'}`}>
                                    {tutorialesPedidos.length}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Contenido según sección seleccionada */}
                    {tabTutoriales === 'insumos' ? (
                        <div>
                            {/* Header del bloque Insumos */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 mb-4">
                                <div>
                                    <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                                        <BookOpen size={14} className="text-blue-600" />
                                        Videos para el Panel de Insumos y Presupuesto
                                    </h4>
                                    <p className="text-[11px] text-blue-700/80 mt-0.5">
                                        Aparecerán dentro del botón de tutoriales en el modal <b>«Guía de Uso: Panel de Insumo y Presupuesto»</b> (/presupuesto/agregar-recursos).
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <label className="flex items-center gap-2 cursor-pointer select-none bg-white px-3 py-1.5 rounded-xl border border-blue-200 text-xs font-semibold text-gray-700 shadow-2xs">
                                        <input
                                            type="checkbox"
                                            checked={mostrarBotonTutInsumos}
                                            onChange={e => setMostrarBotonTutInsumos(e.target.checked)}
                                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                        <span>Botón visible</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormTut({ titulo: '', url: '', descripcion: '' });
                                            setModalTut({ open: true, tipo: 'insumos', index: null });
                                        }}
                                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                                    >
                                        <Plus size={14} /> Agregar tutorial
                                    </button>
                                </div>
                            </div>

                            {/* Lista de tutoriales para Insumos */}
                            {tutorialesInsumos.length === 0 ? (
                                <div className="border border-dashed border-gray-200 rounded-2xl p-8 text-center bg-gray-50/50">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-2">
                                        <Video size={18} />
                                    </div>
                                    <p className="text-xs font-bold text-gray-700">No hay tutoriales para el panel de insumos</p>
                                    <p className="text-[11px] text-gray-400 max-w-sm mx-auto mt-0.5 mb-3">
                                        Agrega videos instructivos que orienten a los usuarios que cargan y revisan los recursos de presupuesto.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormTut({ titulo: '', url: '', descripcion: '' });
                                            setModalTut({ open: true, tipo: 'insumos', index: null });
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors"
                                    >
                                        <Plus size={14} /> Agregar primer tutorial
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {tutorialesInsumos.map((tut, idx) => (
                                        <div key={tut.id || idx} className="border border-gray-200 rounded-2xl p-4 bg-white hover:border-blue-300 transition-all group flex flex-col justify-between shadow-2xs">
                                            <div>
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                                            <Video size={14} />
                                                        </div>
                                                        <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                                                            {tut.titulo}
                                                        </h4>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setFormTut({
                                                                    titulo: tut.titulo,
                                                                    url: tut.url,
                                                                    descripcion: tut.descripcion || ''
                                                                });
                                                                setModalTut({ open: true, tipo: 'insumos', index: idx });
                                                            }}
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setTutorialesInsumos(prev => prev.filter((_, i) => i !== idx));
                                                            }}
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {tut.descripcion && (
                                                    <p className="text-xs text-gray-500 mb-2 line-clamp-2 leading-relaxed pl-9">
                                                        {tut.descripcion}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="pt-2 mt-2 border-t border-gray-100 flex items-center justify-between gap-2 text-xs">
                                                <span className="text-[11px] text-gray-400 font-mono truncate max-w-[220px]" title={tut.url}>
                                                    {tut.url}
                                                </span>
                                                <a
                                                    href={tut.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline shrink-0"
                                                >
                                                    <ExternalLink size={12} /> Probar link
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            {/* Header del bloque Pedidos */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 mb-4">
                                <div>
                                    <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                                        <Package size={14} className="text-emerald-600" />
                                        Videos para el Formulario Público de Pedidos
                                    </h4>
                                    <p className="text-[11px] text-emerald-700/80 mt-0.5">
                                        Aparecerán en la cabecera del formulario de pedidos públicos de convocatorias (/pedidos/[token]).
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <label className="flex items-center gap-2 cursor-pointer select-none bg-white px-3 py-1.5 rounded-xl border border-emerald-200 text-xs font-semibold text-gray-700 shadow-2xs">
                                        <input
                                            type="checkbox"
                                            checked={mostrarBotonTutPedidos}
                                            onChange={e => setMostrarBotonTutPedidos(e.target.checked)}
                                            className="w-3.5 h-3.5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                                        />
                                        <span>Botón visible</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormTut({ titulo: '', url: '', descripcion: '' });
                                            setModalTut({ open: true, tipo: 'pedidos', index: null });
                                        }}
                                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                                    >
                                        <Plus size={14} /> Agregar tutorial
                                    </button>
                                </div>
                            </div>

                            {/* Lista de tutoriales para Pedidos */}
                            {tutorialesPedidos.length === 0 ? (
                                <div className="border border-dashed border-gray-200 rounded-2xl p-8 text-center bg-gray-50/50">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                                        <Video size={18} />
                                    </div>
                                    <p className="text-xs font-bold text-gray-700">No hay tutoriales para el formulario de pedidos</p>
                                    <p className="text-[11px] text-gray-400 max-w-sm mx-auto mt-0.5 mb-3">
                                        Agrega videos para orientar a los usuarios externos y cargos que llenan pedidos de insumos.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormTut({ titulo: '', url: '', descripcion: '' });
                                            setModalTut({ open: true, tipo: 'pedidos', index: null });
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-colors"
                                    >
                                        <Plus size={14} /> Agregar primer tutorial
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {tutorialesPedidos.map((tut, idx) => (
                                        <div key={tut.id || idx} className="border border-gray-200 rounded-2xl p-4 bg-white hover:border-emerald-300 transition-all group flex flex-col justify-between shadow-2xs">
                                            <div>
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                                            <Video size={14} />
                                                        </div>
                                                        <h4 className="text-sm font-bold text-gray-900 group-hover:text-emerald-600 transition-colors truncate">
                                                            {tut.titulo}
                                                        </h4>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setFormTut({
                                                                    titulo: tut.titulo,
                                                                    url: tut.url,
                                                                    descripcion: tut.descripcion || ''
                                                                });
                                                                setModalTut({ open: true, tipo: 'pedidos', index: idx });
                                                            }}
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setTutorialesPedidos(prev => prev.filter((_, i) => i !== idx));
                                                            }}
                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {tut.descripcion && (
                                                    <p className="text-xs text-gray-500 mb-2 line-clamp-2 leading-relaxed pl-9">
                                                        {tut.descripcion}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="pt-2 mt-2 border-t border-gray-100 flex items-center justify-between gap-2 text-xs">
                                                <span className="text-[11px] text-gray-400 font-mono truncate max-w-[220px]" title={tut.url}>
                                                    {tut.url}
                                                </span>
                                                <a
                                                    href={tut.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:underline shrink-0"
                                                >
                                                    <ExternalLink size={12} /> Probar link
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Modal para Crear / Editar Tutorial */}
            {modalTut.open && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setModalTut({ open: false, tipo: modalTut.tipo, index: null })}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                                    <Video size={16} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-gray-900">
                                        {modalTut.index === null ? 'Agregar Tutorial o Enlace' : 'Editar Tutorial'}
                                    </h3>
                                    <p className="text-[11px] text-gray-400">
                                        Sección: <span className="font-semibold text-gray-600">{modalTut.tipo === 'insumos' ? 'Panel de Insumos y Presupuesto' : 'Formulario de Pedidos'}</span>
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setModalTut({ open: false, tipo: modalTut.tipo, index: null })}
                                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-3.5">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Título del tutorial o recurso <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formTut.titulo}
                                    onChange={e => setFormTut(f => ({ ...f, titulo: e.target.value }))}
                                    placeholder="Ej: Cómo ingresar recursos paso a paso"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Enlace / URL (YouTube, Loom, Drive, etc.) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="url"
                                    value={formTut.url}
                                    onChange={e => setFormTut(f => ({ ...f, url: e.target.value }))}
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 font-mono"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Descripción breve (opcional)
                                </label>
                                <textarea
                                    rows={2}
                                    value={formTut.descripcion}
                                    onChange={e => setFormTut(f => ({ ...f, descripcion: e.target.value }))}
                                    placeholder="Explicación o indicaciones sobre este contenido..."
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none"
                                />
                            </div>
                        </div>

                        <div className="mt-5 flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setModalTut({ open: false, tipo: modalTut.tipo, index: null })}
                                className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={!formTut.titulo.trim() || !formTut.url.trim()}
                                onClick={() => {
                                    if (!formTut.titulo.trim() || !formTut.url.trim()) return;
                                    const targetList = modalTut.tipo === 'insumos' ? tutorialesInsumos : tutorialesPedidos;
                                    const setTargetList = modalTut.tipo === 'insumos' ? setTutorialesInsumos : setTutorialesPedidos;

                                    const nuevo: TutorialItem = {
                                        id: modalTut.index !== null ? targetList[modalTut.index].id : String(Date.now()),
                                        titulo: formTut.titulo.trim(),
                                        url: formTut.url.trim(),
                                        descripcion: formTut.descripcion.trim() || undefined,
                                    };
                                    if (modalTut.index !== null) {
                                        setTargetList(prev => prev.map((item, i) => i === modalTut.index ? nuevo : item));
                                    } else {
                                        setTargetList(prev => [...prev, nuevo]);
                                    }
                                    setModalTut({ open: false, tipo: modalTut.tipo, index: null });
                                }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 shadow-sm"
                            >
                                {modalTut.index === null ? 'Agregar' : 'Guardar cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Botón guardar (común) */}
            {!loading && (
                <div className="flex items-center justify-end gap-3">
                    {guardado && (
                        <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                            <Check size={14} /> Guardado con éxito
                        </span>
                    )}
                    <button
                        onClick={guardar}
                        disabled={saving}
                        className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:brightness-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <Loader2 size={16} className="animate-spin" />}
                        Guardar configuración
                    </button>
                </div>
            )}
        </div>
    );
}
