'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import { Plus, Loader2, Copy, Calendar, Building2, Target, BookOpen, Trash2, Edit } from 'lucide-react';
import { PME, Colegio } from '@/lib/types';
import Modal from '@/components/ui/Modal';

interface PMEResponse extends PME {
  acciones_count?: number;
  actividades_count?: number;
  nombre_colegio?: string;
}

export default function GestionPMEPage() {
    const { user } = useAuth();
    const [pmes, setPmes] = useState<PMEResponse[]>([]);
    const [colegios, setColegios] = useState<Colegio[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const [formData, setFormData] = useState({
        id_colegio: '',
        year: new Date().getFullYear().toString(),
        copy_from_previous: false,
        previous_year: ''
    });
    
    const [copyData, setCopyData] = useState({
        id_pme_origen: '',
        id_pme_destino: ''
    });

    const isAdmin = user?.rol?.codigo === 'ADM';

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [pmesRes, colegiosRes] = await Promise.all([
                api.get('/pme'),
                api.get('/catalogos/colegios')
            ]);
            setPmes(pmesRes.data);
            setColegios(colegiosRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const getAvailableYears = () => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = currentYear - 5; i <= currentYear + 2; i++) {
            years.push(i);
        }
        return years;
    };

    const getYearsWithPME = () => {
        const yearsWithPME = pmes.map(p => p.year);
        return getAvailableYears().filter(y => yearsWithPME.includes(y));
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await api.post('/pme', {
                id_colegio: parseInt(formData.id_colegio),
                year: parseInt(formData.year)
            });
            
            if (formData.copy_from_previous && formData.previous_year) {
                const prevPME = pmes.find(p => p.year === parseInt(formData.previous_year) && p.id_colegio === parseInt(formData.id_colegio));
                const newPME = pmes.find(p => p.year === parseInt(formData.year) && p.id_colegio === parseInt(formData.id_colegio));
                
                if (prevPME && newPME) {
                    await api.post(`/pme/copiar?id_pme_origen=${prevPME.id_pme}&id_pme_destino=${newPME.id_pme}`);
                }
            }
            
            setIsCreateModalOpen(false);
            resetForm();
            fetchData();
            alert('PME creado exitosamente');
        } catch (error) {
            console.error('Error creating PME:', error);
            alert('Error al crear PME');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCopy = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await api.post(`/pme/copiar?id_pme_origen=${copyData.id_pme_origen}&id_pme_destino=${copyData.id_pme_destino}`);
            setIsCopyModalOpen(false);
            setCopyData({ id_pme_origen: '', id_pme_destino: '' });
            fetchData();
            alert('PME copiado exitosamente');
        } catch (error) {
            console.error('Error copying PME:', error);
            alert('Error al copiar PME');
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setFormData({
            id_colegio: '',
            year: new Date().getFullYear().toString(),
            copy_from_previous: false,
            previous_year: ''
        });
    };

    const getPMEStats = (pmeId: number) => {
        const pme = pmes.find(p => p.id_pme === pmeId);
        return { acciones: pme?.acciones_count || 0, actividades: pme?.actividades_count || 0 };
    };

    const canEdit = true;

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Gestión PME</h2>
                    <p className="text-gray-500 mt-1.5 font-medium">Administra los Planes de Mejoramiento Educativo.</p>
                </div>

                {canEdit && (
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsCopyModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 text-amber-700 rounded-xl font-semibold hover:bg-amber-200 transition-colors"
                        >
                            <Copy size={20} />
                            Copiar PME
                        </button>
                        <button
                            onClick={() => { resetForm(); setIsCreateModalOpen(true); }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-semibold shadow-md shadow-primary/30 hover:bg-blue-600 transition-colors"
                        >
                            <Plus size={20} />
                            Nuevo PME
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    <div className="flex items-center gap-2">
                                        <Calendar size={16} />
                                        Año
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    <div className="flex items-center gap-2">
                                        <Building2 size={16} />
                                        Colegio
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    <div className="flex items-center gap-2">
                                        <Target size={16} />
                                        Acciones
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    <div className="flex items-center gap-2">
                                        <BookOpen size={16} />
                                        Actividades
                                    </div>
                                </th>
                                {canEdit && (
                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Acciones
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="animate-spin" size={24} />
                                            <span>Cargando PMEs...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : pmes.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                                        No hay PMEs registrados.
                                    </td>
                                </tr>
                            ) : (
                                pmes.map((pme) => {
                                    const stats = getPMEStats(pme.id_pme);
                                    const colegio = colegios.find(c => c.id_colegio === pme.id_colegio);
                                    return (
                                        <tr key={pme.id_pme} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <span className="text-lg font-bold text-gray-900">{pme.year}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-medium text-gray-700">
                                                    {colegio?.nombre || `Colegio ${pme.id_colegio}`}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                                                    {stats.acciones} acciones
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                                                    {stats.actividades} actividades
                                                </span>
                                            </td>
                                            {canEdit && (
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Editar">
                                                            <Edit size={18} />
                                                        </button>
                                                        <button className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Crear Nuevo PME"
                maxWidth="max-w-lg"
            >
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Colegio</label>
                        <select
                            value={formData.id_colegio}
                            onChange={(e) => setFormData({ ...formData, id_colegio: e.target.value })}
                            required
                            disabled={!isAdmin}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        >
                            <option value="">Seleccionar Colegio...</option>
                            {colegios.map(col => (
                                <option key={col.id_colegio} value={col.id_colegio}>{col.nombre}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Año</label>
                        <select
                            value={formData.year}
                            onChange={(e) => setFormData({ ...formData, year: e.target.value, copy_from_previous: false })}
                            required
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                        >
                            {getAvailableYears().map(year => {
                                const exists = pmes.some(p => p.year === year && p.id_colegio === parseInt(formData.id_colegio || '0'));
                                return (
                                    <option key={year} value={year} disabled={exists}>
                                        {year} {exists ? '(Ya existe)' : ''}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.copy_from_previous}
                                onChange={(e) => setFormData({ ...formData, copy_from_previous: e.target.checked, previous_year: '' })}
                                className="w-5 h-5 text-primary rounded border-gray-300 focus:ring-primary"
                            />
                            <span className="text-sm font-medium text-gray-700">Copiar acciones del año anterior</span>
                        </label>
                    </div>

                    {formData.copy_from_previous && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Año origen (copiar desde)</label>
                            <select
                                value={formData.previous_year}
                                onChange={(e) => setFormData({ ...formData, previous_year: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                            >
                                <option value="">Seleccionar año...</option>
                                {getYearsWithPME().map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => setIsCreateModalOpen(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || (formData.copy_from_previous && !formData.previous_year)}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSaving && <Loader2 size={16} className="animate-spin" />}
                            Crear PME
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={isCopyModalOpen}
                onClose={() => setIsCopyModalOpen(false)}
                title="Copiar Acciones de Otro PME"
                maxWidth="max-w-lg"
            >
                <form onSubmit={handleCopy} className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">PME Origen (origen de acciones)</label>
                        <select
                            value={copyData.id_pme_origen}
                            onChange={(e) => setCopyData({ ...copyData, id_pme_origen: e.target.value })}
                            required
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                        >
                            <option value="">Seleccionar PME origen...</option>
                            {pmes.map(pme => {
                                const stats = getPMEStats(pme.id_pme);
                                const colegio = colegios.find(c => c.id_colegio === pme.id_colegio);
                                return (
                                    <option key={pme.id_pme} value={pme.id_pme}>
                                        {pme.year} - {colegio?.nombre} ({stats.acciones} acciones)
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">PME Destino (donde se copiarán)</label>
                        <select
                            value={copyData.id_pme_destino}
                            onChange={(e) => setCopyData({ ...copyData, id_pme_destino: e.target.value })}
                            required
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                        >
                            <option value="">Seleccionar PME destino...</option>
                            {pmes.map(pme => {
                                const stats = getPMEStats(pme.id_pme);
                                const colegio = colegios.find(c => c.id_colegio === pme.id_colegio);
                                return (
                                    <option key={pme.id_pme} value={pme.id_pme}>
                                        {pme.year} - {colegio?.nombre} ({stats.acciones} acciones)
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        <strong>Nota:</strong> Esta acción copiará todas las acciones y actividades del PME origen al PME destino. Las acciones copiadas se crearán con estado "Pendiente".
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => setIsCopyModalOpen(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || !copyData.id_pme_origen || !copyData.id_pme_destino}
                            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSaving && <Loader2 size={16} className="animate-spin" />}
                            Copiar PME
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}