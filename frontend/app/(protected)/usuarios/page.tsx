'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Search, Plus, Edit2, Trash2, Mail, Shield, AlertTriangle, Building, FileSpreadsheet, Download, Upload, CheckCircle } from 'lucide-react';
import api from '@/lib/api/client';
import Modal from '@/components/ui/Modal';
import UploadExcel from '@/components/ui/UploadExcel';
import * as XLSX from 'xlsx';

const formatRut = (value: string): string => {
    const numbers = value.replace(/[^0-9Kk]/g, '');
    if (numbers.length <= 1) return numbers;
    if (numbers.length <= 8) return `${numbers.slice(0, -1)}.${numbers.slice(-1)}`;
    if (numbers.length <= 11) return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}-${numbers.slice(8)}`;
    return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}-${numbers.slice(8, 9)}`;
};

const formatCelular = (value: string): string => {
    const numbers = value.replace(/[^0-9]/g, '');
    if (numbers.length === 0) return '';
    if (numbers.length <= 1) return numbers;
    if (numbers.length <= 4) return numbers.slice(0, 1) + ' ' + numbers.slice(1);
    if (numbers.length <= 8) return numbers.slice(0, 1) + ' ' + numbers.slice(1, 4) + ' ' + numbers.slice(4);
    return numbers.slice(0, 1) + ' ' + numbers.slice(1, 4) + ' ' + numbers.slice(4, 8);
};

interface Rol {
    id_rol: number;
    nombre: string;
    codigo: string;
}

interface Colegio {
    id_colegio: number;
    nombre: string;
}

interface Area {
    id_area: number;
    nombre: string;
}

interface Cargo {
    id_subarea: number;
    nombre: string;
    id_area?: number;
    area?: Area;
    areas_adicionales?: Area[];
}

interface Usuario {
    id_user: number;
    rut: string;
    nombre: string;
    correo: string;
    celular?: string;
    status: string;
    id_colegio?: number;
    id_subarea?: number;
    colegio?: Colegio;
    colegios?: Colegio[];
    rol?: Rol;
    cargo?: Cargo;
    cargos?: Cargo[];
}

export default function UsuariosPage() {
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [users, setUsers] = useState<Usuario[]>([]);
    const [roles, setRoles] = useState<Rol[]>([]);
    const [colegios, setColegios] = useState<Colegio[]>([]);
    const [areas, setAreas] = useState<Area[]>([]);
    const [cargos, setSubareas] = useState<Cargo[]>([]);
    const [loading, setLoading] = useState(true);

    // Upload & Import State
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [importResult, setImportResult] = useState<{ creados: number; omitidos: number; total: number; detalles: string[] } | null>(null);
    const [errorModalData, setErrorModalData] = useState<{ status?: number; title: string; message: string } | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingUser, setEditingUser] = useState<Usuario | null>(null);
    const [formData, setFormData] = useState({
        rut: '',
        nombre: '',
        correo: '',
        celular: '',
        password: '',
        id_rol: '',
        id_colegio: '',
        id_area: '',
        subareas_ids: [] as number[],
        colegios_ids: [] as number[]
    });
    const [errorMsg, setErrorMsg] = useState('');

    const downloadTemplate = () => {
        const templateData = [
            {
                'RUT': '18.888.888-2',
                'Nombre': 'Carlos Mendoza',
                'Correo': 'carlos.mendoza@colegio.cl',
                'Celular': '912345678',
                'Rol': 'Docente',
                'Colegio': colegios.length > 0 ? colegios[0].nombre : 'Colegio San Agustín',
                'Cargo': cargos.length > 0 ? cargos[0].nombre : 'Matemática',
                'Contraseña': ''
            },
            {
                'RUT': '19.999.999-1',
                'Nombre': 'María Silva',
                'Correo': 'maria.silva@colegio.cl',
                'Celular': '987654321',
                'Rol': 'Administrador',
                'Colegio': colegios.length > 0 ? colegios[0].nombre : 'Colegio San Agustín',
                'Cargo': cargos.length > 1 ? cargos[1].nombre : 'Administración',
                'Contraseña': ''
            }
        ];
        const ws = XLSX.utils.json_to_sheet(templateData);
        ws['!cols'] = [
            { wch: 15 }, { wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 25 }, { wch: 22 }, { wch: 15 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Usuarios');
        XLSX.writeFile(wb, 'plantilla_usuarios.xlsx');
    };

    const exportToExcel = () => {
        const exportData = filteredUsers.map(u => ({
            'RUT': u.rut,
            'Nombre': u.nombre,
            'Correo': u.correo,
            'Celular': u.celular || '',
            'Rol': u.rol?.nombre || '',
            'Colegio': u.colegio?.nombre || '',
            'Cargo': u.cargos?.map(s => s.nombre).join(', ') || u.cargo?.nombre || '',
            'Estado': u.status
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        ws['!cols'] = [
            { wch: 15 }, { wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 12 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
        XLSX.writeFile(wb, `usuarios_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleImportUsers = async (excelData: any[]) => {
        try {
            setIsSaving(true);
            const res = await api.post('/users/bulk-import', excelData);
            setImportResult(res.data);
            setIsUploadModalOpen(false);
            fetchData();
        } catch (error: any) {
            console.error("Error al importar usuarios:", error);
            alert(error.response?.data?.detail || "Error al procesar el archivo Excel.");
        } finally {
            setIsSaving(false);
        }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const [usersRes, rolesRes, colegiosRes, subareasRes, areasRes] = await Promise.all([
                api.get('/users/'),
                api.get('/roles/'),
                user?.rol?.codigo === 'ADM' ? api.get('/catalogos/colegios') : Promise.resolve({ data: [] }),
                api.get('/catalogos/cargos'),
                api.get('/catalogos/areas')
            ]);
            setUsers(usersRes.data);
            setRoles(rolesRes.data);
            setColegios(colegiosRes.data);
            setSubareas(subareasRes.data);
            setAreas(areasRes.data);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const resetForm = () => {
        setEditingUser(null);
        setFormData({ 
            rut: '', 
            nombre: '', 
            correo: '', 
            celular: '', 
            password: '', 
            id_rol: '',
            id_colegio: '',
            id_area: '',
            subareas_ids: [],
            colegios_ids: []
        });
    };

    const handleOpenNewUser = () => {
        resetForm();
        setIsModalOpen(true);
    };

    const handleEditUser = (userToEdit: Usuario) => {
        setEditingUser(userToEdit);

        let areaId = '';
        const userSubareas = userToEdit.cargos || [];
        if (userSubareas.length > 0 && userSubareas[0].id_area) {
            areaId = userSubareas[0].id_area.toString();
        } else if (userToEdit.cargo?.id_area) {
            areaId = userToEdit.cargo.id_area.toString();
        }

        const subIds = userSubareas.map(s => s.id_subarea) || [];
        if (subIds.length === 0 && userToEdit.id_subarea) {
            subIds.push(userToEdit.id_subarea);
        }

        const colIds = (userToEdit.colegios || []).map(c => c.id_colegio);
        if (colIds.length === 0 && userToEdit.id_colegio) {
            colIds.push(userToEdit.id_colegio);
        }

        setFormData({
            rut: userToEdit.rut,
            nombre: userToEdit.nombre,
            correo: userToEdit.correo,
            celular: userToEdit.celular || '',
            password: '',
            id_rol: userToEdit.rol ? userToEdit.rol.id_rol.toString() : '',
            id_colegio: userToEdit.id_colegio ? userToEdit.id_colegio.toString() : '',
            id_area: areaId,
            subareas_ids: subIds,
            colegios_ids: colIds
        });
        setIsModalOpen(true);
    };

    const handleSubmitUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setIsSaving(true);
        try {
            const payload: any = {
                rut: formData.rut,
                nombre: formData.nombre,
                correo: formData.correo,
                celular: formData.celular || undefined,
                id_rol: formData.id_rol ? parseInt(formData.id_rol) : undefined,
                id_colegio: formData.colegios_ids.length > 0
                    ? formData.colegios_ids[0]
                    : (formData.id_colegio ? parseInt(formData.id_colegio) : undefined),
                subareas_ids: formData.subareas_ids,
                colegios_ids: formData.colegios_ids
            };

            if (formData.password) {
                payload.password = formData.password;
            }

            if (editingUser) {
                await api.put(`/users/${editingUser.id_user}`, payload);
            } else {
                if (!payload.password) payload.password = "123456";
                await api.post('/users/', payload);
            }

            setIsModalOpen(false);
            resetForm();
            fetchData();
        } catch (error: any) {
            console.error("Error saving user:", error);
            let detailMsg = "Error inesperado al guardar el usuario";
            const status = error.response?.status;

            if (error.response?.data?.detail) {
                const rawDetail = error.response.data.detail;
                if (typeof rawDetail === 'string') {
                    detailMsg = rawDetail;
                } else if (Array.isArray(rawDetail)) {
                    detailMsg = rawDetail.map((item: any) => {
                        if (typeof item === 'string') return item;
                        const loc = item.loc ? item.loc.filter((l: string) => l !== 'body').join(' -> ') : '';
                        return `${loc ? loc + ': ' : ''}${item.msg || JSON.stringify(item)}`;
                    }).join(' | ');
                } else {
                    detailMsg = JSON.stringify(rawDetail);
                }
            } else if (error.message) {
                detailMsg = error.message;
            }

            setErrorMsg(detailMsg);
            setErrorModalData({
                status,
                title: status ? `Error ${status} al guardar usuario` : "Error al guardar usuario",
                message: detailMsg
            });
        } finally {
            setIsSaving(false);
        }
    };

    const toggleStatus = async (usuario: Usuario) => {
        // En un caso real, haríamos un PUT o DELETE según la API
        if (window.confirm(`¿Seguro que deseas inactivar/eliminar al usuario ${usuario.nombre}?`)) {
            try {
                await api.delete(`/users/${usuario.id_user}`);
                fetchData();
            } catch (error: any) {
                alert(error.response?.data?.detail || "Error al eliminar usuario");
            }
        }
    };

    const filteredUsers = users.filter(u =>
        u.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.rut.includes(searchTerm) ||
        u.correo.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Gestión de Usuarios</h2>
                    <p className="text-gray-500 mt-1.5 font-medium">Administra los accesos y roles del personal del colegio.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                    <div className="relative flex-1 md:w-60 min-w-[180px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar usuario..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm transition-colors text-gray-900"
                        />
                    </div>
                    
                    <button
                        onClick={downloadTemplate}
                        title="Descargar Plantilla Excel"
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 px-3 py-2 rounded-xl font-medium text-xs md:text-sm flex items-center transition-all whitespace-nowrap"
                    >
                        <FileSpreadsheet size={16} className="mr-1.5 text-emerald-600" />
                        <span>Plantilla</span>
                    </button>

                    <button
                        onClick={exportToExcel}
                        title="Exportar Usuarios a Excel"
                        className="bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 px-3 py-2 rounded-xl font-medium text-xs md:text-sm flex items-center transition-all whitespace-nowrap"
                    >
                        <Download size={16} className="mr-1.5 text-gray-500" />
                        <span>Exportar</span>
                    </button>

                    <button
                        onClick={() => setIsUploadModalOpen(true)}
                        title="Importar Usuarios desde Excel"
                        className="bg-blue-50 hover:bg-blue-100 text-primary border border-blue-200/60 px-3 py-2 rounded-xl font-medium text-xs md:text-sm flex items-center transition-all whitespace-nowrap"
                    >
                        <Upload size={16} className="mr-1.5 text-primary" />
                        <span>Importar</span>
                    </button>

                    <button
                        onClick={handleOpenNewUser}
                        className="bg-primary hover:bg-blue-600 text-white px-3.5 py-2 rounded-xl font-semibold text-xs md:text-sm shadow-md shadow-primary/30 flex items-center transition-all duration-200 whitespace-nowrap"
                    >
                        <Plus size={16} className="mr-1.5" />
                        <span>Nuevo Usuario</span>
                    </button>
                </div>
            </div>

            {/* Data Table Container */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    RUT
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Nombre / Correo
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Colegio
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Rol
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Estado
                                </th>
                                <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-gray-500 text-sm">Cargando usuarios...</td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-gray-500 text-sm">No se encontraron usuarios</td>
                                </tr>
                            ) : filteredUsers.map((person) => (
                                <tr key={person.id_user} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {person.rut}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-10 w-10 flex-shrink-0 bg-blue-50 rounded-full flex items-center justify-center text-primary font-bold text-sm">
                                                {person.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-semibold text-gray-900">{person.nombre}</div>
                                                <div className="text-sm text-gray-500 flex items-center mt-0.5">
                                                    <Mail size={12} className="mr-1" /> {person.correo}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div className="flex items-center">
                                            <Building size={14} className="mr-1.5 text-gray-400" />
                                            {person.colegio?.nombre || 'General'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div className="flex flex-col">
                                            <div className="flex items-center">
                                                <Shield size={14} className="mr-1.5 text-gray-400" />
                                                <span className="font-medium text-gray-700">{person.rol?.nombre || 'Docente'}</span>
                                            </div>
                                            {person.cargos && person.cargos.length > 0 ? (
                                                <div className="text-[11px] text-gray-400 mt-0.5 ml-5 whitespace-normal max-w-[180px]">
                                                    {person.cargos.map(s => s.nombre).join(', ')}
                                                </div>
                                            ) : person.cargo ? (
                                                <div className="text-[11px] text-gray-400 mt-0.5 ml-5">
                                                    {person.cargo.nombre}
                                                </div>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${person.status === 'Activo'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 self-center ${person.status === 'Activo' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                            {person.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => handleEditUser(person)}
                                                className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-blue-50"
                                                title="Editar Usuario"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => toggleStatus(person)}
                                                className="text-gray-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                                                title="Eliminar/Inactivar Usuario"
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

                {/* Pagination */}
                <div className="bg-white px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        Mostrando <span className="font-medium">{filteredUsers.length}</span> resultados
                    </p>
                </div>
            </div>

            {/* Modal de Nuevo/Editar Usuario */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => { if (!isSaving) { setIsModalOpen(false); resetForm(); } }}
                title={editingUser ? "Editar Usuario" : "Crear Nuevo Usuario"}
                maxWidth="max-w-2xl"
            >
                <form onSubmit={handleSubmitUser} className="space-y-4">
                    {errorMsg && (
                        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
                            <AlertTriangle size={16} />
                            {errorMsg}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">RUT</label>
                            <input
                                required
                                type="text"
                                placeholder="18.888.888-2"
                                maxLength={13}
                                value={formData.rut}
                                onChange={e => setFormData({ ...formData, rut: formatRut(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                            <input
                                required
                                type="text"
                                maxLength={80}
                                value={formData.nombre}
                                onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                            <input
                                required
                                type="email"
                                maxLength={80}
                                value={formData.correo}
                                onChange={e => setFormData({ ...formData, correo: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Celular (Opcional)</label>
                            <input
                                type="text"
                                placeholder="9 1111 1111"
                                maxLength={12}
                                value={formData.celular}
                                onChange={e => setFormData({ ...formData, celular: formatCelular(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                            <select
                                required
                                value={formData.id_rol}
                                onChange={e => setFormData({ ...formData, id_rol: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900 bg-white"
                            >
                                <option value="" disabled>Seleccionar rol</option>
                                {roles.map(r => (
                                    <option key={r.id_rol} value={r.id_rol}>{r.nombre}</option>
                                ))}
                            </select>
                        </div>
                        {user?.rol?.codigo === 'ADM' && (
                            <div className="md:col-span-2 bg-gray-50/50 p-4 rounded-xl border border-gray-100 space-y-2">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Colegios a los que pertenece *</label>
                                <p className="text-[11px] text-gray-400 -mt-1">Marca uno o varios. El primero marcado será el colegio principal.</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {colegios.map(c => {
                                        const isChecked = formData.colegios_ids.includes(c.id_colegio);
                                        return (
                                            <label key={c.id_colegio} className="flex items-start gap-2.5 p-2 rounded-lg bg-white border border-gray-100 hover:border-gray-200 transition-all cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                colegios_ids: [...prev.colegios_ids, c.id_colegio]
                                                            }));
                                                        } else {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                colegios_ids: prev.colegios_ids.filter(id => id !== c.id_colegio)
                                                            }));
                                                        }
                                                    }}
                                                    className="w-4 h-4 mt-0.5 text-primary border-gray-300 rounded focus:ring-primary/20 transition-all cursor-pointer"
                                                />
                                                <span className="text-xs font-semibold text-gray-700 group-hover:text-gray-950 transition-colors">
                                                    {c.nombre}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                                {formData.colegios_ids.length === 0 && (
                                    <p className="text-[11px] text-red-500 font-medium">Debe seleccionar al menos un colegio.</p>
                                )}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Área Principal</label>
                            <select
                                value={formData.id_area}
                                onChange={e => setFormData({ ...formData, id_area: e.target.value, subareas_ids: [] })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900 bg-white"
                            >
                                <option value="">Seleccionar área</option>
                                {areas.map(a => (
                                    <option key={a.id_area} value={a.id_area}>{a.nombre}</option>
                                ))}
                            </select>
                        </div>
                        {formData.id_area && (
                            <div className="md:col-span-2 bg-gray-50/50 p-4 rounded-xl border border-gray-100 space-y-2">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Cargos / Departamentos a Cargo *</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {cargos
                                        .filter(s => {
                                            const idAreaSel = parseInt(formData.id_area);
                                            return s.id_area === idAreaSel ||
                                                (s.areas_adicionales || []).some(a => a.id_area === idAreaSel);
                                        })
                                        .map(s => {
                                            const isChecked = formData.subareas_ids.includes(s.id_subarea);
                                            return (
                                                <label key={s.id_subarea} className="flex items-start gap-2.5 p-2 rounded-lg bg-white border border-gray-100 hover:border-gray-200 transition-all cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setFormData(prev => ({
                                                                    ...prev,
                                                                    subareas_ids: [...prev.subareas_ids, s.id_subarea]
                                                                }));
                                                            } else {
                                                                setFormData(prev => ({
                                                                    ...prev,
                                                                    subareas_ids: prev.subareas_ids.filter(id => id !== s.id_subarea)
                                                                }));
                                                            }
                                                        }}
                                                        className="w-4 h-4 mt-0.5 text-primary border-gray-300 rounded focus:ring-primary/20 transition-all cursor-pointer"
                                                    />
                                                    <span className="flex flex-col">
                                                        <span className="text-xs font-semibold text-gray-700 group-hover:text-gray-950 transition-colors">
                                                            {s.nombre}
                                                        </span>
                                                        {(s.area || (s.areas_adicionales && s.areas_adicionales.length > 0)) && (
                                                            <span className="flex flex-wrap gap-1 mt-1">
                                                                {s.area && (
                                                                    <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                                                                        {s.area.nombre}
                                                                    </span>
                                                                )}
                                                                {(s.areas_adicionales || []).map(a => (
                                                                    <span key={a.id_area} className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold">
                                                                        {a.nombre}
                                                                    </span>
                                                                ))}
                                                            </span>
                                                        )}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                </div>
                                {formData.subareas_ids.length === 0 && (
                                    <p className="text-[11px] text-red-500 font-medium">Debe seleccionar al menos una cargo.</p>
                                )}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Contraseña
                                {editingUser && <span className="text-gray-400 ml-1 font-normal">(Opcional para mantener)</span>}
                            </label>
                            <input
                                required={!editingUser}
                                type="password"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                            />
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
                            disabled={isSaving || (formData.id_area ? formData.subareas_ids.length === 0 : false)}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50 flex items-center"
                        >
                            {isSaving ? 'Guardando...' : 'Guardar Usuario'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Modal para Subida e Importación Masiva desde Excel */}
            {isUploadModalOpen && (
                <UploadExcel
                    onUpload={handleImportUsers}
                    onClose={() => setIsUploadModalOpen(false)}
                    templateColumns={['RUT', 'Nombre', 'Correo', 'Celular', 'Rol', 'Colegio', 'Cargo', 'Contraseña']}
                    templateExample={{
                        'RUT': '18.888.888-2',
                        'Nombre': 'Carlos Mendoza',
                        'Correo': 'carlos.mendoza@colegio.cl',
                        'Celular': '912345678',
                        'Rol': 'Docente',
                        'Colegio': colegios.length > 0 ? colegios[0].nombre : 'Colegio San Agustín',
                        'Cargo': cargos.length > 0 ? cargos[0].nombre : 'Matemática',
                        'Contraseña': ''
                    }}
                />
            )}

            {/* Modal de Resumen de Importación */}
            {importResult && (
                <Modal
                    isOpen={!!importResult}
                    onClose={() => setImportResult(null)}
                    title="Resultado de la Importación Masiva"
                    maxWidth="max-w-lg"
                >
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100 text-green-900">
                            <CheckCircle className="text-green-600 flex-shrink-0" size={24} />
                            <div>
                                <p className="font-semibold text-sm">Proceso finalizado</p>
                                <p className="text-xs text-green-700">Se procesaron {importResult.total} registros del archivo Excel.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-center">
                                <span className="block text-2xl font-black text-primary">{importResult.creados}</span>
                                <span className="text-xs text-gray-600 font-medium">Usuarios Creados</span>
                            </div>
                            <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl text-center">
                                <span className="block text-2xl font-black text-amber-600">{importResult.omitidos}</span>
                                <span className="text-xs text-gray-600 font-medium">Omitidos (Duplicados)</span>
                            </div>
                        </div>

                        {importResult.detalles && importResult.detalles.length > 0 && (
                            <div className="mt-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Detalles del proceso:</p>
                                <div className="max-h-40 overflow-y-auto bg-gray-50 p-3 rounded-lg border border-gray-100 space-y-1.5 text-xs text-gray-600">
                                    {importResult.detalles.map((det, idx) => (
                                        <p key={idx} className="leading-relaxed">• {det}</p>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-3 flex justify-end border-t border-gray-100">
                            <button
                                onClick={() => setImportResult(null)}
                                className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-blue-600 transition-colors shadow-sm"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal de Detalle de Error */}
            {errorModalData && (
                <Modal
                    isOpen={!!errorModalData}
                    onClose={() => setErrorModalData(null)}
                    title={errorModalData.title}
                    maxWidth="max-w-md"
                >
                    <div className="space-y-4">
                        <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-start gap-3">
                            <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={22} />
                            <div>
                                <h4 className="text-sm font-bold text-red-900 mb-1">
                                    {errorModalData.status ? `Respuesta HTTP ${errorModalData.status}` : 'Detalle de la falla'}
                                </h4>
                                <p className="text-xs text-red-700 leading-relaxed break-words font-mono bg-red-100/50 p-2.5 rounded-lg mt-1 border border-red-200/50">
                                    {errorModalData.message}
                                </p>
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <button
                                onClick={() => setErrorModalData(null)}
                                className="px-5 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors shadow-sm"
                            >
                                Cerrar y Corregir
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
