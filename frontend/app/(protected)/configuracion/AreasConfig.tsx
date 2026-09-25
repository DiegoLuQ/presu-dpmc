'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Layers, Plus, Edit2, Trash2, ChevronRight, Tags, Building2, AlertTriangle } from 'lucide-react';
import api from '@/lib/api/client';
import Modal from '@/components/ui/Modal';

interface JefeInfo {
    id_jefe: number;
    jefe_nombre?: string;
}

interface Area {
    id_area: number;
    nombre: string;
    prefijo?: string;
    id_jefe?: number;
    jefe_nombre?: string;
    jefes?: JefeInfo[];
}

interface Cargo {
    id_subarea: number;
    nombre: string;
    id_area: number;
    area?: Area;
    areas_adicionales?: Area[];
}

export default function AreasConfig() {
    const { user } = useAuth();
    const isAdmin = user?.rol?.codigo === 'ADM';

    const [areas, setAreas] = useState<Area[]>([]);
    const [cargos, setSubareas] = useState<Cargo[]>([]);
    const [usuarios, setUsuarios] = useState<any[]>([]);
    const [colegios, setColegios] = useState<any[]>([]);
    const [selectedColegio, setSelectedColegio] = useState<number | ''>('');
    const [filtroAreaCargos, setFiltroAreaCargos] = useState<number | 'todos'>('todos');
    const [loading, setLoading] = useState(true);

    // Modals
    const [areaModal, setAreaModal] = useState({ open: false, editing: null as Area | null });
    const [subareaModal, setSubareaModal] = useState({ open: false, editing: null as Cargo | null });
    
    const [areaForm, setAreaForm] = useState({ nombre: '', prefijo: '', id_jefes: [] as number[] });
    const [subareaForm, setSubareaForm] = useState({ nombre: '', id_area: 0, areas_adicionales_ids: [] as number[] });
    
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const fetchData = async () => {
        try {
            setLoading(true);
            const [resAreas, resSub, resUsers, resCol] = await Promise.all([
                api.get('/catalogos/areas/jefes', {
                    params: selectedColegio ? { id_colegio: selectedColegio } : {}
                }),
                api.get('/catalogos/cargos'),
                api.get('/users').catch(() => ({ data: [] })),
                (user?.rol?.codigo === 'SOS' || user?.rol?.codigo === 'ADM')
                    ? api.get('/catalogos/colegios').catch(() => ({ data: [] }))
                    : Promise.resolve({ data: [] })
            ]);
            setAreas(resAreas.data);
            setSubareas(resSub.data);
            setUsuarios(resUsers.data || []);
            setColegios(resCol.data || []);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Initialize default colegio
    useEffect(() => {
        if (user?.id_colegio) {
            setSelectedColegio(user.id_colegio);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [selectedColegio]);

    // Area CRUD
    const handleSaveArea = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setErrorMsg('');
        try {
            if (areaModal.editing) {
                await api.put(`/catalogos/areas/${areaModal.editing.id_area}`, {
                    nombre: areaForm.nombre,
                    prefijo: areaForm.prefijo
                });
                const urlJefe = `/catalogos/areas/${areaModal.editing.id_area}/jefes` +
                    (selectedColegio ? `?id_colegio=${selectedColegio}` : '');
                await api.put(urlJefe, { id_jefes: areaForm.id_jefes });
            } else {
                const res = await api.post('/catalogos/areas', {
                    nombre: areaForm.nombre,
                    prefijo: areaForm.prefijo
                });
                const newIdArea = res.data.id_area;
                const urlJefe = `/catalogos/areas/${newIdArea}/jefes` +
                    (selectedColegio ? `?id_colegio=${selectedColegio}` : '');
                await api.put(urlJefe, { id_jefes: areaForm.id_jefes });
            }
            setAreaModal({ open: false, editing: null });
            fetchData();
        } catch (error: any) {
            setErrorMsg(error.response?.data?.detail || "Error al guardar área");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteArea = async (area: Area) => {
        if (window.confirm(`¿Seguro que deseas eliminar el área ${area.nombre}?`)) {
            try {
                await api.delete(`/catalogos/areas/${area.id_area}`);
                // Actualizar solo el estado local (sin recargar toda la tabla).
                setAreas(prev => prev.filter(a => a.id_area !== area.id_area));
            } catch (error: any) {
                alert(error.response?.data?.detail || "Error al eliminar área");
            }
        }
    };

    // Cargo CRUD
    const handleSaveSubarea = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setErrorMsg('');
        try {
            if (subareaModal.editing) {
                await api.put(`/catalogos/cargos/${subareaModal.editing.id_subarea}`, subareaForm);
            } else {
                await api.post('/catalogos/cargos', subareaForm);
            }
            setSubareaModal({ open: false, editing: null });
            fetchData();
        } catch (error: any) {
            setErrorMsg(error.response?.data?.detail || "Error al guardar cargo");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteSubarea = async (sub: Cargo) => {
        if (window.confirm(`¿Seguro que deseas eliminar la cargo ${sub.nombre}?`)) {
            try {
                await api.delete(`/catalogos/cargos/${sub.id_subarea}`);
                // Actualizar solo el estado local (sin recargar toda la tabla).
                setSubareas(prev => prev.filter(s => s.id_subarea !== sub.id_subarea));
            } catch (error: any) {
                alert(error.response?.data?.detail || "Error al eliminar cargo");
            }
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* AREAS SECTION */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden flex flex-col">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Layers className="text-primary" size={20} />
                            Áreas Principales
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">Departamentos de alto nivel.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {colegios.length > 0 && (
                            <select
                                value={selectedColegio}
                                onChange={(e) => setSelectedColegio(e.target.value ? Number(e.target.value) : '')}
                                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="">Todos los colegios</option>
                                {colegios.map((col) => (
                                    <option key={col.id_colegio} value={col.id_colegio}>
                                        {col.nombre}
                                    </option>
                                ))}
                            </select>
                        )}
                        {isAdmin && (
                            <button
                                onClick={() => {
                                    setAreaForm({ nombre: '', prefijo: '', id_jefes: [] });
                                    setAreaModal({ open: true, editing: null });
                                }}
                                className="p-2 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg transition-all"
                            >
                                <Plus size={18} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-auto max-h-[500px]">
                    <table className="min-w-full divide-y divide-gray-50">
                        <thead className="bg-gray-50/50 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nombre</th>
                                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Prefijo</th>
                                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Jefe de Área</th>
                                <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</td></tr>
                            ) : areas.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-400">No hay áreas</td></tr>
                            ) : areas.map(a => (
                                <tr key={a.id_area} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-800">{a.nombre}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[10px] font-bold uppercase">{a.prefijo || '-'}</span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-700">
                                        {(a.jefes && a.jefes.length > 0) ? (
                                            <div className="flex flex-wrap gap-1">
                                                {a.jefes.map(j => (
                                                    <span key={j.id_jefe} className="inline-flex px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                                                        {j.jefe_nombre}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 italic text-xs">No asignado</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                        <div className="flex justify-end gap-1">
                                            <button 
                                                onClick={() => {
                                                    setAreaForm({
                                                        nombre: a.nombre,
                                                        prefijo: a.prefijo || '',
                                                        id_jefes: (a.jefes || []).map(j => j.id_jefe)
                                                    });
                                                    setAreaModal({ open: true, editing: a });
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-primary rounded-md hover:bg-blue-50 transition-colors"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteArea(a)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* SUBAREAS SECTION */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden flex flex-col">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center flex-wrap gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Tags className="text-primary" size={20} />
                            Cargos
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">Cargos y funciones específicas de cada área.</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                        {/* Selector para filtrar por área */}
                        <select
                            value={filtroAreaCargos}
                            onChange={(e) => setFiltroAreaCargos(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
                            className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary shadow-xs font-semibold"
                        >
                            <option value="todos">Todas las áreas ({cargos.length})</option>
                            {areas.map(a => (
                                <option key={a.id_area} value={a.id_area}>{a.nombre}</option>
                            ))}
                        </select>

                        {isAdmin && (
                            <button
                                onClick={() => {
                                    setSubareaForm({ nombre: '', id_area: (filtroAreaCargos !== 'todos' ? Number(filtroAreaCargos) : (areas[0]?.id_area || 0)), areas_adicionales_ids: [] });
                                    setSubareaModal({ open: true, editing: null });
                                }}
                                className="p-2 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg transition-all"
                                title="Nuevo Cargo"
                            >
                                <Plus size={18} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-auto max-h-[500px]">
                    <table className="min-w-full divide-y divide-gray-50">
                        <thead className="bg-gray-50/50 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cargo</th>
                                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Área Perteneciente</th>
                                <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-400">Cargando...</td></tr>
                            ) : (() => {
                                const cargosFiltrados = cargos.filter(c => {
                                    if (filtroAreaCargos === 'todos') return true;
                                    const mainAreaMatch = (c.area?.id_area ?? c.id_area) === filtroAreaCargos;
                                    const additionalAreaMatch = (c.areas_adicionales || []).some(a => a.id_area === filtroAreaCargos);
                                    return mainAreaMatch || additionalAreaMatch;
                                });

                                return cargosFiltrados.length === 0 ? (
                                    <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-400">No hay cargos para el área seleccionada</td></tr>
                                ) : cargosFiltrados.map(s => (
                                <tr key={s.id_subarea} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-800">{s.nombre}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                                                <div className="w-1 h-3 bg-primary rounded-full" />
                                                {s.area?.nombre}
                                            </span>
                                            {(s.areas_adicionales || []).map(a => (
                                                <span key={a.id_area} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold">
                                                    {a.nombre}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                onClick={() => {
                                                    setSubareaForm({ nombre: s.nombre, id_area: s.id_area, areas_adicionales_ids: (s.areas_adicionales || []).map(a => a.id_area) });
                                                    setSubareaModal({ open: true, editing: s });
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-primary rounded-md hover:bg-blue-50 transition-colors"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteSubarea(s)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ));
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL AREA */}
            <Modal
                isOpen={areaModal.open}
                onClose={() => !isSaving && setAreaModal({ open: false, editing: null })}
                title={areaModal.editing ? "Editar Área" : "Nueva Área"}
            >
                <form onSubmit={handleSaveArea} className="space-y-4">
                    {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2"><AlertTriangle size={14}/>{errorMsg}</div>}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Área</label>
                        <input
                            required
                            type="text"
                            value={areaForm.nombre}
                            onChange={e => setAreaForm({...areaForm, nombre: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-sm"
                            placeholder="Ej: Administración, Académica..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prefijo (Opcional)</label>
                        <input
                            type="text"
                            value={areaForm.prefijo}
                            onChange={e => setAreaForm({...areaForm, prefijo: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-sm uppercase"
                            placeholder="Ej: ADM, ACA..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Jefes de Área <span className="font-normal text-gray-400">(opcional)</span></label>
                        <p className="text-xs text-gray-400 mb-2">Un área puede tener más de un jefe. Marca a todos los que correspondan.</p>
                        <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto p-1">
                            {usuarios.map(u => {
                                const checked = areaForm.id_jefes.includes(u.id_user);
                                return (
                                    <label key={u.id_user} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${checked ? 'bg-primary/5 border-primary/40' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => {
                                                setAreaForm(prev => ({
                                                    ...prev,
                                                    id_jefes: e.target.checked
                                                        ? [...prev.id_jefes, u.id_user]
                                                        : prev.id_jefes.filter(id => id !== u.id_user)
                                                }));
                                            }}
                                            className="w-3.5 h-3.5 text-primary border-gray-300 rounded focus:ring-primary/20"
                                        />
                                        <span className={`text-xs font-semibold ${checked ? 'text-primary' : 'text-gray-700'}`}>
                                            {u.nombre} <span className="font-normal text-gray-400">({u.rol?.nombre || 'Sin Rol'})</span>
                                        </span>
                                    </label>
                                );
                            })}
                            {usuarios.length === 0 && (
                                <p className="text-xs text-gray-400 italic px-1">No hay usuarios disponibles.</p>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setAreaModal({ open: false, editing: null })} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 disabled:opacity-50">{isSaving ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                </form>
            </Modal>

            {/* MODAL SUBAREA */}
            <Modal
                isOpen={subareaModal.open}
                onClose={() => !isSaving && setSubareaModal({ open: false, editing: null })}
                title={subareaModal.editing ? "Editar Cargo" : "Nueva Cargo"}
            >
                <form onSubmit={handleSaveSubarea} className="space-y-4">
                    {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2"><AlertTriangle size={14}/>{errorMsg}</div>}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Cargo</label>
                        <input
                            required
                            type="text"
                            value={subareaForm.nombre}
                            onChange={e => setSubareaForm({...subareaForm, nombre: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-sm"
                            placeholder="Ej: Finanzas, Docencia, TI..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Área Principal</label>
                        <select
                            required
                            value={subareaForm.id_area}
                            onChange={e => setSubareaForm({...subareaForm, id_area: parseInt(e.target.value)})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary text-sm"
                        >
                            <option value={0}>Seleccione un área...</option>
                            {areas.map(a => (
                                <option key={a.id_area} value={a.id_area}>{a.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Áreas adicionales <span className="font-normal text-gray-400">(opcional)</span></label>
                        <p className="text-xs text-gray-400 mb-2">Marca otras áreas a las que también pertenece esta cargo.</p>
                        <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto p-1">
                            {areas.filter(a => a.id_area !== subareaForm.id_area).map(a => {
                                const checked = subareaForm.areas_adicionales_ids.includes(a.id_area);
                                return (
                                    <label key={a.id_area} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${checked ? 'bg-primary/5 border-primary/40' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => {
                                                setSubareaForm(prev => ({
                                                    ...prev,
                                                    areas_adicionales_ids: e.target.checked
                                                        ? [...prev.areas_adicionales_ids, a.id_area]
                                                        : prev.areas_adicionales_ids.filter(id => id !== a.id_area)
                                                }));
                                            }}
                                            className="w-3.5 h-3.5 text-primary border-gray-300 rounded focus:ring-primary/20"
                                        />
                                        <span className={`text-xs font-semibold ${checked ? 'text-primary' : 'text-gray-700'}`}>{a.nombre}</span>
                                    </label>
                                );
                            })}
                            {areas.filter(a => a.id_area !== subareaForm.id_area).length === 0 && (
                                <p className="col-span-2 text-xs text-gray-400 italic px-1">No hay otras áreas disponibles.</p>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setSubareaModal({ open: false, editing: null })} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 disabled:opacity-50">{isSaving ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
