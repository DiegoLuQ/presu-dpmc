'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Building2, Edit2, Trash2, Plus, AlertTriangle } from 'lucide-react';
import api from '@/lib/api/client';
import Modal from '@/components/ui/Modal';

interface Director {
    id_user: number;
    nombre: string;
    correo: string;
    rol?: string;
    rol_codigo?: string;
}

interface Colegio {
    id_colegio: number;
    nombre: string;
    rut?: string;
    direccion?: string;
    correo?: string;
    celular?: string;
    url_img?: string;
    rbd?: string;
    id_director?: number;
    director_nombre?: string;
}

export default function ColegioConfig() {
    const { user } = useAuth();
    const isAdmin = user?.rol?.codigo === 'ADM';

    const [colegios, setColegios] = useState<Colegio[]>([]);
    const [loading, setLoading] = useState(true);
    const [directores, setDirectores] = useState<Director[]>([]);

    // Modal state for Admins
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingColegio, setEditingColegio] = useState<Colegio | null>(null);
    const [formData, setFormData] = useState({
        nombre: '',
        rut: '',
        direccion: '',
        correo: '',
        celular: '',
        url_img: '',
        rbd: '',
        id_director: ''
    });
    const [errorMsg, setErrorMsg] = useState('');

    const fetchColegios = async () => {
        try {
            setLoading(true);
            const res = await api.get('/catalogos/colegios');
            setColegios(res.data);

            // If not admin, populate the read-only form with the first (and only) result
            if (!isAdmin && res.data.length > 0) {
                const c = res.data[0];
                setFormData({
                    nombre: c.nombre || '',
                    rut: c.rut || '',
                    direccion: c.direccion || '',
                    correo: c.correo || '',
                    celular: c.celular || '',
                    url_img: c.url_img || '',
                    rbd: c.rbd || '',
                    id_director: c.id_director?.toString() || ''
                });
            }
        } catch (error) {
            console.error("Error fetching colegios:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDirectores = async (idColegio: number) => {
        try {
            const res = await api.get(`/catalogos/colegios/${idColegio}/directores`);
            setDirectores(res.data);
        } catch (error) {
            console.error("Error fetching directores:", error);
            setDirectores([]);
        }
    };

    useEffect(() => {
        fetchColegios();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resetForm = () => {
        setEditingColegio(null);
        setFormData({ nombre: '', rut: '', direccion: '', correo: '', celular: '', url_img: '', rbd: '', id_director: '' });
        setErrorMsg('');
        setDirectores([]);
    };

    const handleOpenNew = () => {
        resetForm();
        setIsModalOpen(true);
    };

    const handleEdit = (col: Colegio) => {
        setEditingColegio(col);
        setFormData({
            nombre: col.nombre || '',
            rut: col.rut || '',
            direccion: col.direccion || '',
            correo: col.correo || '',
            celular: col.celular || '',
            url_img: col.url_img || '',
            rbd: col.rbd || '',
            id_director: col.id_director?.toString() || ''
        });
        fetchDirectores(col.id_colegio);
        setIsModalOpen(true);
    };

    const handleDelete = async (col: Colegio) => {
        if (window.confirm(`¿Seguro que deseas eliminar el colegio ${col.nombre}?`)) {
            try {
                await api.delete(`/catalogos/colegios/${col.id_colegio}`);
                fetchColegios();
            } catch (error: any) {
                alert(error.response?.data?.detail || "Error al eliminar colegio");
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setIsSaving(true);
        try {
            const payload = {
                nombre: formData.nombre,
                rut: formData.rut || null,
                direccion: formData.direccion || null,
                correo: formData.correo || null,
                celular: formData.celular || null,
                url_img: formData.url_img || null,
                rbd: formData.rbd || null,
                id_director: formData.id_director ? parseInt(formData.id_director) : null
            };
            
            if (editingColegio) {
                await api.put(`/catalogos/colegios/${editingColegio.id_colegio}`, payload);
            } else {
                await api.post('/catalogos/colegios', payload);
            }
            setIsModalOpen(false);
            resetForm();
            fetchColegios();
        } catch (error: any) {
            console.error("Error saving colegio:", error);
            setErrorMsg(error.response?.data?.detail || "Error al guardar el colegio");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden text-gray-800 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="p-8 md:p-10 border-b border-gray-100 flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-bold text-gray-900">Datos Institucionales</h3>
                    {isAdmin && <p className="text-sm text-gray-500 mt-1">Gestiona los colegios inscritos en el sistema.</p>}
                </div>
                {isAdmin && (
                    <button
                        onClick={handleOpenNew}
                        className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-xl font-semibold shadow-md shadow-primary/30 flex items-center transition-all duration-200"
                    >
                        <Plus size={18} className="mr-2" />
                        Nuevo Colegio
                    </button>
                )}
            </div>

            {isAdmin ? (
                // ADMIN VIEW: Table of Colegios
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Colegio
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Contacto
                                </th>
                                <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={3} className="text-center py-8 text-gray-500 text-sm">Cargando colegios...</td>
                                </tr>
                            ) : colegios.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="text-center py-8 text-gray-500 text-sm">No hay colegios registrados</td>
                                </tr>
                            ) : colegios.map((col) => (
                                <tr key={col.id_colegio} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-10 w-10 flex-shrink-0 bg-blue-50 rounded-lg flex items-center justify-center text-primary font-bold text-sm">
                                                <Building2 size={20} />
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-semibold text-gray-900">{col.nombre}</div>
                                                <div className="text-xs text-gray-500 mt-0.5">RUT: {col.rut || 'N/A'} {col.rbd ? `| RBD: ${col.rbd}` : ''}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div>{col.correo || 'Sin correo'}</div>
                                        <div className="text-xs text-gray-400 mt-0.5">{col.celular || 'Sin teléfono'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => handleEdit(col)}
                                                className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-blue-50"
                                                title="Editar Colegio"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(col)}
                                                className="text-gray-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                                                title="Eliminar Colegio"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                // NORMAL USER VIEW: Read-only form
                <div className="p-8 md:p-10">
                    <form className="space-y-8 max-w-4xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">RUT del Colegio</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={formData.rut}
                                    className="block w-full border border-gray-200 rounded-xl text-sm p-3 leading-5 bg-gray-50/50 text-gray-900 font-medium transition-colors cursor-not-allowed"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">RBD</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={formData.rbd}
                                    className="block w-full border border-gray-200 rounded-xl text-sm p-3 leading-5 bg-gray-50/50 text-gray-900 font-medium transition-colors cursor-not-allowed"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre de la Institución</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={formData.nombre}
                                    className="block w-full border border-gray-200 rounded-xl text-sm p-3 leading-5 bg-gray-50/50 text-gray-900 font-medium transition-colors cursor-not-allowed"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Dirección</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={formData.direccion}
                                    className="block w-full border border-gray-200 rounded-xl text-sm p-3 leading-5 bg-gray-50/50 text-gray-900 font-medium transition-colors cursor-not-allowed"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono de Contacto</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={formData.celular}
                                    className="block w-full border border-gray-200 rounded-xl text-sm p-3 leading-5 bg-gray-50/50 text-gray-900 font-medium transition-colors cursor-not-allowed"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Correo Electrónico Oficial</label>
                                <input
                                    type="email"
                                    readOnly
                                    value={formData.correo}
                                    className="block w-full border border-gray-200 rounded-xl text-sm p-3 leading-5 bg-gray-50/50 text-gray-900 font-medium transition-colors cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* Modal de Nuevo/Editar Colegio (Solo Admin) */}
            {isAdmin && (
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => { if (!isSaving) { setIsModalOpen(false); resetForm(); } }}
                    title={editingColegio ? "Editar Colegio" : "Crear Nuevo Colegio"}
                    maxWidth="max-w-2xl"
                >
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {errorMsg && (
                            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
                                <AlertTriangle size={16} />
                                {errorMsg}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Institución *</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.nombre}
                                    onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">RUT</label>
                                <input
                                    type="text"
                                    placeholder="12.345.678-9"
                                    value={formData.rut}
                                    onChange={e => setFormData({ ...formData, rut: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                                <input
                                    type="text"
                                    value={formData.direccion}
                                    onChange={e => setFormData({ ...formData, direccion: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono de Contacto</label>
                                <input
                                    type="text"
                                    value={formData.celular}
                                    onChange={e => setFormData({ ...formData, celular: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico Oficial</label>
                                <input
                                    type="email"
                                    value={formData.correo}
                                    onChange={e => setFormData({ ...formData, correo: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">RBD (Registro Básico de Datos)</label>
                                <input
                                    type="text"
                                    placeholder="Ej: 12345"
                                    value={formData.rbd}
                                    onChange={e => setFormData({ ...formData, rbd: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">URL del Logo</label>
                                <input
                                    type="url"
                                    placeholder="https://ejemplo.com/logo.png"
                                    value={formData.url_img}
                                    onChange={e => setFormData({ ...formData, url_img: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Director(a) del Colegio</label>
                                <select
                                    value={formData.id_director}
                                    onChange={e => setFormData({ ...formData, id_director: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                                >
                                    <option value="">Seleccionar usuario...</option>
                                    {directores.map(d => (
                                        <option key={d.id_user} value={d.id_user}>{d.nombre} ({d.rol})</option>
                                    ))}
                                </select>
                                {directores.length === 0 && editingColegio && (
                                    <p className="text-xs text-amber-600 mt-1">No hay usuarios registrados en este colegio.</p>
                                )}
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-6">
                            <button
                                type="button"
                                onClick={() => { setIsModalOpen(false); resetForm(); }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50 flex items-center"
                            >
                                {isSaving ? 'Guardando...' : 'Guardar Colegio'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
