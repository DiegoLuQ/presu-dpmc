'use client';

import React, { useEffect, useState } from 'react';
import {
    Plus, Trash2, Pencil, Check, X, Layers, Loader2,
    CheckCircle2, AlertCircle, Tag, Sparkles
} from 'lucide-react';
import api from '@/lib/api/client';

export interface MotivoRecursoItem {
    id_motivo: number;
    nombre: string;
    descripcion?: string | null;
    id_grupo_recurso?: number | null;
    grupo_nombre?: string | null;
    activo: boolean;
    orden: number;
}

export interface GrupoRecursoOption {
    id_grupo_recurso: number;
    nombre: string;
}

export default function MotivosInsumoConfig() {
    const [motivos, setMotivos] = useState<MotivoRecursoItem[]>([]);
    const [grupos, setGrupos] = useState<GrupoRecursoOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<MotivoRecursoItem | null>(null);

    // Formulario modal
    const [formNombre, setFormNombre] = useState('');
    const [formDescripcion, setFormDescripcion] = useState('');
    const [formIdGrupo, setFormIdGrupo] = useState<number | ''>('');
    const [formActivo, setFormActivo] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [motivosRes, gruposRes] = await Promise.all([
                api.get('/presupuesto/motivos-recurso?include_inactive=true'),
                api.get('/presupuesto/grupos-recurso')
            ]);
            setMotivos(motivosRes.data || []);
            setGrupos(gruposRes.data || []);
        } catch (err) {
            console.error('Error cargando motivos o grupos:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const abrirCrear = () => {
        setEditingItem(null);
        setFormNombre('');
        setFormDescripcion('');
        setFormIdGrupo('');
        setFormActivo(true);
        setErrorMsg(null);
        setModalOpen(true);
    };

    const abrirEditar = (item: MotivoRecursoItem) => {
        setEditingItem(item);
        setFormNombre(item.nombre);
        setFormDescripcion(item.descripcion || '');
        setFormIdGrupo(item.id_grupo_recurso ?? '');
        setFormActivo(item.activo);
        setErrorMsg(null);
        setModalOpen(true);
    };

    const guardarMotivo = async (e: React.FormEvent) => {
        e.preventDefault();
        const nombreLimpio = formNombre.trim();
        if (!nombreLimpio) {
            setErrorMsg('El nombre del motivo es obligatorio.');
            return;
        }

        try {
            setSaving(true);
            setErrorMsg(null);

            const payload = {
                nombre: nombreLimpio,
                descripcion: formDescripcion.trim() || null,
                id_grupo_recurso: formIdGrupo === '' ? null : Number(formIdGrupo),
                activo: formActivo,
            };

            if (editingItem) {
                await api.put(`/presupuesto/motivos-recurso/${editingItem.id_motivo}`, payload);
            } else {
                await api.post('/presupuesto/motivos-recurso', payload);
            }

            setModalOpen(false);
            await fetchData();
        } catch (err: any) {
            console.error('Error guardando motivo:', err);
            setErrorMsg(err.response?.data?.detail || 'Ocurrió un error al guardar el motivo.');
        } finally {
            setSaving(false);
        }
    };

    const toggleEstado = async (item: MotivoRecursoItem) => {
        try {
            await api.put(`/presupuesto/motivos-recurso/${item.id_motivo}`, {
                activo: !item.activo
            });
            setMotivos(prev => prev.map(m => m.id_motivo === item.id_motivo ? { ...m, activo: !m.activo } : m));
        } catch (err) {
            console.error('Error al cambiar estado del motivo:', err);
        }
    };

    const eliminarMotivo = async (item: MotivoRecursoItem) => {
        if (!window.confirm(`¿Estás seguro de eliminar el motivo "${item.nombre}"?`)) return;

        try {
            await api.delete(`/presupuesto/motivos-recurso/${item.id_motivo}`);
            setMotivos(prev => prev.filter(m => m.id_motivo !== item.id_motivo));
        } catch (err: any) {
            console.error('Error eliminando motivo:', err);
            alert(err.response?.data?.detail || 'Error al eliminar el motivo');
        }
    };

    return (
        <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <Tag size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-gray-900">Motivos Predeterminados de Insumos</h3>
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider border border-indigo-200">
                                Panel PPTO
                            </span>
                        </div>
                        <p className="text-[12px] text-gray-400 font-medium">
                            Opciones sugeridas para el campo «Justificación / Motivo de Necesidad». Al seleccionarlos en el panel, pueden sugerir automáticamente el Grupo / Línea correspondiente.
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={abrirCrear}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                    <Plus size={15} />
                    <span>Nuevo Motivo</span>
                </button>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-gray-400 py-10 justify-center">
                    <Loader2 size={18} className="animate-spin text-indigo-600" />
                    <span className="text-sm font-medium">Cargando motivos de insumos...</span>
                </div>
            ) : motivos.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                    <Tag size={32} className="mx-auto text-gray-400 mb-2" />
                    <p className="text-sm font-bold text-gray-700">No hay motivos configurados</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                        Haz clic en «Nuevo Motivo» para registrar las justificaciones estándar del colegio.
                    </p>
                    <button
                        type="button"
                        onClick={abrirCrear}
                        className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                        Agregar primer motivo
                    </button>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                <th className="pb-3 pl-2">Motivo de Necesidad</th>
                                <th className="pb-3">Descripción</th>
                                <th className="pb-3">Grupo / Línea Sugerido</th>
                                <th className="pb-3 text-center">Estado</th>
                                <th className="pb-3 text-right pr-2">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {motivos.map((m) => {
                                const grupo = grupos.find(g => g.id_grupo_recurso === m.id_grupo_recurso);
                                const grupoNombre = m.grupo_nombre || grupo?.nombre;

                                return (
                                    <tr key={m.id_motivo} className="hover:bg-slate-50/60 transition-colors group">
                                        <td className="py-3 pl-2 font-bold text-gray-900">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full shrink-0 bg-indigo-500" />
                                                <span>{m.nombre}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 text-gray-500 max-w-xs truncate font-medium">
                                            {m.descripcion || <span className="text-gray-300 italic">Sin descripción</span>}
                                        </td>
                                        <td className="py-3">
                                            {grupoNombre ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold">
                                                    <Layers size={12} className="text-indigo-500" />
                                                    {grupoNombre}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 text-[11px] italic">Sin grupo vinculado</span>
                                            )}
                                        </td>
                                        <td className="py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => toggleEstado(m)}
                                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                                                    m.activo
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                                                }`}
                                                title={m.activo ? 'Clic para desactivar' : 'Clic para activar'}
                                            >
                                                {m.activo ? 'Activo' : 'Inactivo'}
                                            </button>
                                        </td>
                                        <td className="py-3 text-right pr-2">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => abrirEditar(m)}
                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                                    title="Editar motivo"
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => eliminarMotivo(m)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                                    title="Eliminar motivo"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal Crear / Editar Motivo */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
                    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-indigo-50/40">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                                    <Tag size={16} />
                                </div>
                                <h4 className="text-sm font-bold text-gray-900">
                                    {editingItem ? 'Editar Motivo de Insumo' : 'Nuevo Motivo de Insumo'}
                                </h4>
                            </div>
                            <button
                                type="button"
                                onClick={() => setModalOpen(false)}
                                className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={guardarMotivo} className="p-6 space-y-4">
                            {errorMsg && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2 animate-in fade-in">
                                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                                    <span>{errorMsg}</span>
                                </div>
                            )}

                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                    Nombre del Motivo <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formNombre}
                                    onChange={(e) => setFormNombre(e.target.value)}
                                    placeholder="Ej: Materiales de librería, Insumos de limpieza..."
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-xs font-semibold text-gray-900 focus:outline-none"
                                />
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Aparecerá en el desplegable de opciones estándar del Panel PPTO.
                                </p>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                    <Layers size={13} className="text-indigo-600" />
                                    <span>Grupo / Línea Sugerido</span>
                                    <span className="text-gray-400 font-normal lowercase">(opcional)</span>
                                </label>
                                <select
                                    value={formIdGrupo}
                                    onChange={(e) => setFormIdGrupo(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-xs font-semibold text-gray-900 focus:outline-none bg-white"
                                >
                                    <option value="">-- Sin sugerencia de grupo --</option>
                                    {grupos.map((g) => (
                                        <option key={g.id_grupo_recurso} value={g.id_grupo_recurso}>
                                            {g.nombre}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-indigo-600/80 mt-1 flex items-center gap-1">
                                    <Sparkles size={11} /> Al elegir este motivo en el Panel, se auto-seleccionará este Grupo/Línea para el usuario.
                                </p>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                    Descripción / Guía de Uso <span className="text-gray-400 font-normal lowercase">(opcional)</span>
                                </label>
                                <textarea
                                    rows={2}
                                    value={formDescripcion}
                                    onChange={(e) => setFormDescripcion(e.target.value)}
                                    placeholder="Ej: Para cuadernos, carpetas, lápices y resmas de papel..."
                                    className="w-full px-3.5 py-2 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-xs font-medium text-gray-900 focus:outline-none resize-none"
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={formActivo}
                                        onChange={(e) => setFormActivo(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                    />
                                    <span>Habilitado (visible para los usuarios en el Panel)</span>
                                </label>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                                >
                                    {saving && <Loader2 size={13} className="animate-spin" />}
                                    <span>{editingItem ? 'Guardar Cambios' : 'Crear Motivo'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
