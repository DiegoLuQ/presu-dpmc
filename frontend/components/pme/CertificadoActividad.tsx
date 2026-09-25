'use client';

import React, { useRef, useState } from 'react';
import { FileText, X, Download, Loader2, SlidersHorizontal, Check } from 'lucide-react';
import { Actividad } from '@/lib/types';

interface CertificadoActividadProps {
    actividad: Actividad | null;
    isOpen: boolean;
    onClose: () => void;
}

type CertificadoFieldKey = 
    | 'dimension'
    | 'subdimension'
    | 'accion_nombre'
    | 'accion_descripcion'
    | 'nombre_actividad'
    | 'descripcion'
    | 'responsable'
    | 'medios_verificacion'
    | 'recursos'
    | 'costo';

interface FieldOption {
    key: CertificadoFieldKey;
    label: string;
}

const FIELD_OPTIONS: FieldOption[] = [
    { key: 'dimension', label: 'Dimensión' },
    { key: 'subdimension', label: 'Subdimensión' },
    { key: 'accion_nombre', label: 'Nombre Acción' },
    { key: 'accion_descripcion', label: 'Desc. Acción' },
    { key: 'nombre_actividad', label: 'Actividad' },
    { key: 'descripcion', label: 'Desc. Actividad' },
    { key: 'responsable', label: 'Responsable' },
    { key: 'medios_verificacion', label: 'Medios de Verificación' },
    { key: 'recursos', label: 'Recursos' },
    { key: 'costo', label: 'Costo Estimado' },
];

const DEFAULT_VISIBLE_FIELDS: Record<CertificadoFieldKey, boolean> = {
    dimension: true,
    subdimension: true,
    accion_nombre: true,
    accion_descripcion: true,
    nombre_actividad: true,
    descripcion: true,
    responsable: false,
    medios_verificacion: false,
    recursos: false,
    costo: false,
};

export default function CertificadoActividad({ actividad, isOpen, onClose }: CertificadoActividadProps) {
    const certificateRef = useRef<HTMLDivElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showColumnsMenu, setShowColumnsMenu] = useState(false);
    const [visibleFields, setVisibleFields] = useState<Record<CertificadoFieldKey, boolean>>(DEFAULT_VISIBLE_FIELDS);

    const toggleField = (key: CertificadoFieldKey) => {
        setVisibleFields(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const resetFields = () => {
        setVisibleFields(DEFAULT_VISIBLE_FIELDS);
    };

    const selectAllFields = () => {
        const all: Record<CertificadoFieldKey, boolean> = {
            dimension: true,
            subdimension: true,
            accion_nombre: true,
            accion_descripcion: true,
            nombre_actividad: true,
            descripcion: true,
            responsable: true,
            medios_verificacion: true,
            recursos: true,
            costo: true,
        };
        setVisibleFields(all);
    };

    const generatePDF = async () => {
        if (!certificateRef.current) return;
        
        setIsGenerating(true);
        try {
            const { default: html2pdf } = await import('html2pdf.js');
            
            const element = certificateRef.current;
            
            const opciones = {
                margin: 0,
                filename: `certificado_${actividad?.nombre_actividad?.replace(/\s+/g, '_') || 'actividad'}.pdf`,
                image: { type: 'jpeg', quality: 0.98 } as const,
                html2canvas: { 
                    scale: 2,
                    useCORS: true,
                    scrollY: 0
                },
                jsPDF: { 
                    unit: 'mm' as const, 
                    format: 'letter' as const,
                    orientation: 'portrait' as const
                }
            };
            
            await html2pdf().set(opciones).from(element).save();
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error al generar el PDF');
        } finally {
            setIsGenerating(false);
        }
    };

    if (!isOpen || !actividad) return null;

    const formatCosto = (val?: number | string | null) => {
        if (!val) return '$0';
        const num = typeof val === 'string' ? parseFloat(val) : val;
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(num || 0);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col border border-gray-100">
                {/* Barra Superior */}
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/80 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 text-primary rounded-xl">
                            <FileText size={20} />
                        </div>
                        <div>
                            <span className="font-extrabold text-gray-900 text-sm block">Certificado de Actividad PME</span>
                            <span className="text-[11px] text-gray-500 font-medium">Personaliza qué campos incluir en el documento</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 relative">
                        {/* Botón Selector de Columnas */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowColumnsMenu(!showColumnsMenu)}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shadow-xs cursor-pointer ${
                                    showColumnsMenu
                                        ? 'bg-primary text-white border-primary shadow-primary/20'
                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                                }`}
                                title="Seleccionar qué columnas/campos incluir en el certificado"
                            >
                                <SlidersHorizontal size={14} />
                                Columnas
                            </button>

                            {/* Menú Desplegable de Columnas */}
                            {showColumnsMenu && (
                                <>
                                    <div 
                                        className="fixed inset-0 z-40" 
                                        onClick={() => setShowColumnsMenu(false)}
                                    />
                                    <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3">
                                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                            <span className="text-xs font-extrabold text-gray-900 uppercase tracking-wide">
                                                Campos del Certificado
                                            </span>
                                            <div className="flex items-center gap-2 text-[10px]">
                                                <button
                                                    type="button"
                                                    onClick={selectAllFields}
                                                    className="text-primary hover:underline font-bold"
                                                >
                                                    Todos
                                                </button>
                                                <span className="text-gray-300">|</span>
                                                <button
                                                    type="button"
                                                    onClick={resetFields}
                                                    className="text-gray-500 hover:underline font-medium"
                                                >
                                                    Por defecto
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                                            {FIELD_OPTIONS.map((opt) => {
                                                const checked = visibleFields[opt.key];
                                                return (
                                                    <label
                                                        key={opt.key}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            toggleField(opt.key);
                                                        }}
                                                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                                                            checked
                                                                ? 'bg-primary/5 text-primary border border-primary/20'
                                                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-transparent'
                                                        }`}
                                                    >
                                                        <span>{opt.label}</span>
                                                        <div className={`w-4 h-4 rounded-md flex items-center justify-center transition-colors ${
                                                            checked ? 'bg-primary text-white' : 'border border-gray-300 bg-white'
                                                        }`}>
                                                            {checked && <Check size={11} strokeWidth={3} />}
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setShowColumnsMenu(false)}
                                            className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                                        >
                                            Aplicar Selección
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Botón Descargar PDF */}
                        <button
                            onClick={generatePDF}
                            disabled={isGenerating}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 text-xs font-extrabold shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
                        >
                            {isGenerating ? (
                                <Loader2 size={15} className="animate-spin" />
                            ) : (
                                <Download size={15} />
                            )}
                            Descargar PDF
                        </button>

                        {/* Cerrar Modal */}
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Previsualización del Certificado */}
                <div className="flex-1 overflow-auto p-6 bg-slate-100/70">
                    <div 
                        ref={certificateRef}
                        style={{ 
                            width: '216mm', 
                            minHeight: '279mm', 
                            padding: '40px 48px', 
                            background: 'white', 
                            margin: '0 auto',
                            fontFamily: '"Times New Roman", Times, Georgia, serif',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                            color: '#111827',
                            position: 'relative'
                        }}
                    >
                        {/* Header: Insignia a la izquierda, Nombre e información institucional alineados a la derecha */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                            <div style={{ width: '30%' }}>
                                {actividad.colegio_url_img ? (
                                    <img 
                                        src={actividad.colegio_url_img} 
                                        alt="Insignia Colegio" 
                                        style={{ maxHeight: '90px', maxWidth: '100%', objectFit: 'contain' }}
                                    />
                                ) : (
                                    <div style={{ width: '80px', height: '90px', border: '1px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                                        <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' }}>Insignia</span>
                                    </div>
                                )}
                            </div>

                            <div style={{ width: '68%', textAlign: 'right' }}>
                                <h2 style={{ fontSize: '15px', fontWeight: 'bold', textTransform: 'uppercase', margin: '0 0 3px 0', color: '#000000', letterSpacing: '0.5px' }}>
                                    {actividad.colegio_nombre_completo || actividad.colegio_nombre || 'COLEGIO DIEGO PORTALES'}
                                </h2>
                                <p style={{ margin: '1px 0', fontSize: '10px', color: '#6b7280' }}>
                                    {actividad.colegio_direccion || 'Av. Los Condores #3881'}
                                </p>
                                <p style={{ margin: '1px 0', fontSize: '10px', color: '#6b7280' }}>
                                    {actividad.colegio_celular || '572543227'}
                                </p>
                                <p style={{ margin: '1px 0', fontSize: '10px', color: '#6b7280' }}>
                                    RBD: {actividad.colegio_rbd || '12549'} | RUT: {actividad.colegio_rut || '65151095-1'}
                                </p>
                                <p style={{ fontSize: '15px', fontWeight: 'bold', marginTop: '14px', color: '#000000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    PME AÑO {actividad.pme_year || new Date().getFullYear()}
                                </p>
                            </div>
                        </div>

                        {/* Línea divisoria superior */}
                        <div style={{ width: '100%', height: '1.5px', background: '#374151', marginBottom: '28px' }}></div>

                        {/* Título de documento con doble subrayado fino */}
                        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                            <h1 style={{ fontSize: '21px', fontWeight: 'bold', textTransform: 'uppercase', margin: '0 0 6px 0', color: '#000000', letterSpacing: '1px' }}>
                                CERTIFICADO DE ACCIÓN SEP
                            </h1>
                            <div style={{ width: '380px', height: '1px', background: '#d1d5db', margin: '0 auto' }}></div>
                        </div>

                        {/* Bloques de Información Configurables */}
                        <div style={{ width: '100%', marginBottom: '40px', fontSize: '12px', lineHeight: '1.6' }}>
                            
                            {/* Fila: Dimensión */}
                            {visibleFields.dimension && (
                                <div style={{ display: 'flex', alignItems: 'baseline', padding: '6px 8px' }}>
                                    <div style={{ width: '140px', fontWeight: 'bold', color: '#111827' }}>Dimensión</div>
                                    <div style={{ width: '20px', fontWeight: 'bold', color: '#111827' }}>:</div>
                                    <div style={{ flex: 1, color: '#374151' }}>{actividad.dimension || 'Gestión Pedagógica'}</div>
                                </div>
                            )}

                            {/* Fila: Subdimensión */}
                            {visibleFields.subdimension && (
                                <div style={{ display: 'flex', alignItems: 'baseline', padding: '6px 8px' }}>
                                    <div style={{ width: '140px', fontWeight: 'bold', color: '#111827' }}>Subdimensión</div>
                                    <div style={{ width: '20px', fontWeight: 'bold', color: '#111827' }}>:</div>
                                    <div style={{ flex: 1, color: '#374151' }}>{actividad.subdimension || 'Enseñanza Y Aprendizaje En El Aula'}</div>
                                </div>
                            )}

                            {/* Fila: Nombre Acción (Destacada en bloque gris claro) */}
                            {visibleFields.accion_nombre && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 8px', background: '#f9fafb', borderRadius: '4px', margin: '6px 0' }}>
                                    <div style={{ width: '140px', fontWeight: 'bold', color: '#111827' }}>Nombre Acción</div>
                                    <div style={{ width: '20px', fontWeight: 'bold', color: '#111827' }}>:</div>
                                    <div style={{ flex: 1, fontWeight: 'bold', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                        {actividad.accion_nombre || 'PLAN DE ACOMPAÑAMIENTO EN AULA'}
                                    </div>
                                </div>
                            )}

                            {/* Fila: Desc. Acción */}
                            {visibleFields.accion_descripcion && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', padding: '8px 8px', margin: '4px 0' }}>
                                    <div style={{ width: '140px', fontWeight: 'bold', color: '#111827' }}>Desc. Acción</div>
                                    <div style={{ width: '20px', fontWeight: 'bold', color: '#111827' }}>:</div>
                                    <div style={{ flex: 1, color: '#4b5563', fontStyle: 'italic', textAlign: 'justify' }}>
                                        {actividad.accion_descripcion || 'Se potenciarán las prácticas pedagógicas a través de acompañamiento docente en aula, como una instancia de reflexión sobre las prácticas, metodologías y criterios acordados para mejorar los aprendizajes e indicadores de eficiencia para mejora continua de la enseñanza'}
                                    </div>
                                </div>
                            )}

                            {/* Fila: Actividad (Destacada en bloque gris claro) */}
                            {visibleFields.nombre_actividad && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 8px', background: '#f9fafb', borderRadius: '4px', margin: '8px 0' }}>
                                    <div style={{ width: '140px', fontWeight: 'bold', color: '#111827' }}>Actividad</div>
                                    <div style={{ width: '20px', fontWeight: 'bold', color: '#111827' }}>:</div>
                                    <div style={{ flex: 1, fontWeight: 'bold', color: '#111827', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                        {actividad.nombre_actividad || 'ACOMPAÑAMIENTO DE AULA ENTRE EL UTP Y LAS EDUCADORAS, Y ENTRE ELLAS'}
                                    </div>
                                </div>
                            )}

                            {/* Fila: Desc. Actividad */}
                            {visibleFields.descripcion && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', padding: '8px 8px' }}>
                                    <div style={{ width: '140px', fontWeight: 'bold', color: '#111827' }}>Desc. Actividad</div>
                                    <div style={{ width: '20px', fontWeight: 'bold', color: '#111827' }}>:</div>
                                    <div style={{ flex: 1, color: '#4b5563', textAlign: 'justify' }}>
                                        {actividad.descripcion || 'Se realiza acompañamiento de aula, entorno a la implementación curricular entre el UTP y las educadoras de párvulos, el acompañamiento se debe realizar mensualmente.'}
                                    </div>
                                </div>
                            )}

                            {/* Fila: Responsable */}
                            {visibleFields.responsable && (
                                <div style={{ display: 'flex', alignItems: 'baseline', padding: '6px 8px' }}>
                                    <div style={{ width: '140px', fontWeight: 'bold', color: '#111827' }}>Responsable</div>
                                    <div style={{ width: '20px', fontWeight: 'bold', color: '#111827' }}>:</div>
                                    <div style={{ flex: 1, color: '#374151' }}>{actividad.responsable || 'Equipo Directivo / UTP'}</div>
                                </div>
                            )}

                            {/* Fila: Medios de Verificación */}
                            {visibleFields.medios_verificacion && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', padding: '6px 8px' }}>
                                    <div style={{ width: '140px', fontWeight: 'bold', color: '#111827' }}>Medios Verificación</div>
                                    <div style={{ width: '20px', fontWeight: 'bold', color: '#111827' }}>:</div>
                                    <div style={{ flex: 1, color: '#374151' }}>{actividad.medios_verificacion || 'Pautas de observación, lista de asistencia, registro fotográfico.'}</div>
                                </div>
                            )}

                            {/* Fila: Recursos */}
                            {visibleFields.recursos && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', padding: '6px 8px' }}>
                                    <div style={{ width: '140px', fontWeight: 'bold', color: '#111827' }}>Recursos</div>
                                    <div style={{ width: '20px', fontWeight: 'bold', color: '#111827' }}>:</div>
                                    <div style={{ flex: 1, color: '#374151' }}>{actividad.lista_recursos || 'Materiales fungibles, equipamiento multimedia.'}</div>
                                </div>
                            )}

                            {/* Fila: Costo Estimado */}
                            {visibleFields.costo && (
                                <div style={{ display: 'flex', alignItems: 'baseline', padding: '6px 8px', background: '#f0fdf4', borderRadius: '4px', margin: '6px 0' }}>
                                    <div style={{ width: '140px', fontWeight: 'bold', color: '#166534' }}>Costo Estimado</div>
                                    <div style={{ width: '20px', fontWeight: 'bold', color: '#166534' }}>:</div>
                                    <div style={{ flex: 1, fontWeight: 'bold', color: '#166534' }}>{formatCosto(actividad.costo_estimado)}</div>
                                </div>
                            )}

                        </div>

                        {/* Pie del documento: Ciudad a la izquierda y firma del Director con logo a la derecha */}
                        <div style={{ position: 'absolute', bottom: '40px', left: '48px', right: '48px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                                <div>
                                    <p style={{ fontSize: '15px', color: '#111827', fontWeight: 'normal', fontFamily: '"Times New Roman", serif' }}>
                                        Alto Hospicio
                                    </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    {actividad.colegio_url_img && (
                                        <img 
                                            src={actividad.colegio_url_img} 
                                            alt="Insignia" 
                                            style={{ height: '54px', objectFit: 'contain' }}
                                        />
                                    )}
                                    <div style={{ textAlign: 'left' }}>
                                        <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#000000', margin: '0 0 2px 0' }}>
                                            {actividad.director_nombre || 'Cristian Saavedra'}
                                        </p>
                                        <p style={{ fontSize: '10px', color: '#4b5563', margin: '0 0 1px 0' }}>Director</p>
                                        <p style={{ fontSize: '10px', color: '#4b5563', margin: 0, fontStyle: 'italic' }}>
                                            {actividad.colegio_nombre_completo || actividad.colegio_nombre || 'Colegio Diego Portales'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Línea divisoria de pie de página */}
                            <div style={{ width: '100%', height: '1px', background: '#d1d5db', marginBottom: '8px' }}></div>
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#111827', margin: '0 0 2px 0', fontFamily: '"Times New Roman", serif' }}>
                                    {actividad.colegio_nombre_completo || actividad.colegio_nombre || 'Colegio Diego Portales'}
                                </p>
                                <p style={{ fontSize: '10px', color: '#4b5563', margin: 0, fontFamily: '"Times New Roman", serif' }}>
                                    {actividad.colegio_direccion || 'Av. Los Condores #3881'} - Fono: {actividad.colegio_celular || '572543227'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}