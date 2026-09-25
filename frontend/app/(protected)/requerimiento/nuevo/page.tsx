'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import { ArrowLeft, Save, Image as ImageIcon, Trash2, Plus, Loader2 } from 'lucide-react';

interface Actividad {
    id_actividad: number;
    nombre_actividad: string;
    dimension?: string;
    subdimension?: string;
}

interface DetalleForm {
    lugar: string;
    descripcion: string;
    fecha_hora: string;
    justificacion: string;
    precio: number;
    cantidad: number;
    id_estado: number | null;
}

export default function NuevoRequerimientoPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [actividades, setActividades] = useState<Actividad[]>([]);
    const [estados, setEstados] = useState<{ id_estado: number; nombre: string }[]>([]);
    
    const [formData, setFormData] = useState({
        id_actividad: '',
        para: '',
    });
    
    const [detalles, setDetalles] = useState<DetalleForm[]>([
        { lugar: '', descripcion: '', fecha_hora: '', justificacion: '', precio: 0, cantidad: 1, id_estado: null }
    ]);
    
    const [imagenes, setImagenes] = useState<string[]>([]);
    const [imageInput, setImageInput] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [actRes, estRes] = await Promise.all([
                    api.get('/catalogos/actividades'),
                    api.get('/requerimientos/estados')
                ]);
                setActividades(actRes.data);
                setEstados(estRes.data);
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const addDetalle = () => {
        setDetalles([...detalles, { lugar: '', descripcion: '', fecha_hora: '', justificacion: '', precio: 0, cantidad: 1, id_estado: null }]);
    };

    const removeDetalle = (index: number) => {
        if (detalles.length > 1) {
            setDetalles(detalles.filter((_, i) => i !== index));
        }
    };

    const updateDetalle = (index: number, field: keyof DetalleForm, value: string | number | null) => {
        const newDetalles = [...detalles];
        newDetalles[index] = { ...newDetalles[index], [field]: value };
        setDetalles(newDetalles);
    };

    const addImagen = () => {
        if (imageInput.trim()) {
            setImagenes([...imagenes, imageInput.trim()]);
            setImageInput('');
        }
    };

    const removeImagen = (index: number) => {
        setImagenes(imagenes.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        
        try {
            const numero = `REQ-${Date.now()}`;
            
            const response = await api.post('/requerimientos', {
                numero,
                id_actividad: formData.id_actividad ? parseInt(formData.id_actividad) : null,
                para: formData.para,
                detalles: detalles.map(d => ({
                    lugar: d.lugar,
                    descripcion: d.descripcion,
                    fecha_hora: d.fecha_hora,
                    justificacion: d.justificacion,
                    precio: d.precio,
                    cantidad: d.cantidad,
                    id_estado: d.id_estado
                }))
            });
            
            const idRequerimiento = response.data.id_requerimiento;
            
            for (const url of imagenes) {
                await api.post(`/requerimientos/${idRequerimiento}/imagenes`, { url_img: url });
            }
            
            router.push('/requerimiento');
        } catch (error) {
            console.error('Error creating requerimiento:', error);
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500 max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <button
                    onClick={() => router.push('/requerimiento')}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Nuevo Requerimiento</h2>
                    <p className="text-gray-500 mt-1.5 font-medium">Crea un nuevo requerimiento de materiales o servicios.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Datos del Requerimiento</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Actividad</label>
                            <select
                                value={formData.id_actividad}
                                onChange={(e) => setFormData({ ...formData, id_actividad: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                            >
                                <option value="">Seleccionar actividad...</option>
                                {actividades.map((act) => (
                                    <option key={act.id_actividad} value={act.id_actividad}>
                                        {act.nombre_actividad}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Para</label>
                            <input
                                type="text"
                                value={formData.para}
                                onChange={(e) => setFormData({ ...formData, para: e.target.value })}
                                placeholder="Destinatario"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-900">Detalles del Requerimiento</h3>
                        <button
                            type="button"
                            onClick={addDetalle}
                            className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors text-sm font-semibold"
                        >
                            <Plus size={18} />
                            Agregar Item
                        </button>
                    </div>
                    
                    <div className="space-y-4">
                        {detalles.map((detalle, index) => (
                            <div key={index} className="p-4 bg-gray-50 rounded-xl space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold text-gray-600">Item {index + 1}</span>
                                    {detalles.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeDetalle(index)}
                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Lugar</label>
                                        <input
                                            type="text"
                                            value={detalle.lugar}
                                            onChange={(e) => updateDetalle(index, 'lugar', e.target.value)}
                                            placeholder="Ubicación"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Fecha y Hora</label>
                                        <input
                                            type="text"
                                            value={detalle.fecha_hora}
                                            onChange={(e) => updateDetalle(index, 'fecha_hora', e.target.value)}
                                            placeholder="Ej: 15/04/2026 14:00"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-gray-900"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Descripción</label>
                                        <textarea
                                            value={detalle.descripcion}
                                            onChange={(e) => updateDetalle(index, 'descripcion', e.target.value)}
                                            placeholder="Descripción del requerimiento"
                                            rows={2}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-gray-900"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Justificación</label>
                                        <textarea
                                            value={detalle.justificacion}
                                            onChange={(e) => updateDetalle(index, 'justificacion', e.target.value)}
                                            placeholder="Justificación del requerimiento"
                                            rows={2}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Precio Estimado ($)</label>
                                        <input
                                            type="number"
                                            value={detalle.precio}
                                            onChange={(e) => updateDetalle(index, 'precio', parseInt(e.target.value) || 0)}
                                            min="0"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Cantidad</label>
                                        <input
                                            type="number"
                                            value={detalle.cantidad}
                                            onChange={(e) => updateDetalle(index, 'cantidad', parseInt(e.target.value) || 1)}
                                            min="1"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Estado Detalle</label>
                                        <select
                                            value={detalle.id_estado ?? ''}
                                            onChange={(e) => updateDetalle(index, 'id_estado', e.target.value ? parseInt(e.target.value) : null)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-gray-900"
                                        >
                                            <option value="">Seleccionar...</option>
                                            {estados.map((est) => (
                                                <option key={est.id_estado} value={est.id_estado}>{est.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <ImageIcon size={20} />
                        Imágenes Adjuntas
                    </h3>
                    
                    <div className="flex gap-2 mb-4">
                        <input
                            type="url"
                            value={imageInput}
                            onChange={(e) => setImageInput(e.target.value)}
                            placeholder="Ingresa URL de imagen..."
                            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                        />
                        <button
                            type="button"
                            onClick={addImagen}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-semibold"
                        >
                            Agregar
                        </button>
                    </div>
                    
                    {imagenes.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {imagenes.map((url, index) => (
                                <div key={index} className="relative group">
                                    <img
                                        src={url}
                                        alt={`Imagen ${index + 1}`}
                                        className="w-full h-32 object-cover rounded-lg"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Imagen';
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeImagen(index)}
                                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-400 text-center py-4">No hay imágenes agregadas</p>
                    )}
                </div>

                <div className="flex justify-end gap-4">
                    <button
                        type="button"
                        onClick={() => router.push('/requerimiento')}
                        className="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-2.5 bg-primary text-white rounded-xl hover:bg-blue-600 transition-colors font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                        Guardar Requerimiento
                    </button>
                </div>
            </form>
        </div>
    );
}