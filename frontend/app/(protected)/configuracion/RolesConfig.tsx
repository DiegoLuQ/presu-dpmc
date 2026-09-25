import React, { useState, useEffect } from 'react';
import { Shield, Plus, Edit2, Trash2, CheckCircle2, X } from 'lucide-react';
import api from '@/lib/api/client';
import { Accion, AccionNames } from './PermissionConstants';
import { MODULOS, permisoSeccion, SeccionDef } from '@/lib/permissions/registry';

interface Rol {
    id_rol: number;
    nombre: string;
    codigo: string;
    prefijo: string | null;
    permisos: string[];
}

function PermCheckbox({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {
    return (
        <div className="flex items-center justify-center">
            <label className={`relative flex items-center rounded-full p-2 group ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'}`}>
                <input
                    type="checkbox"
                    disabled={disabled}
                    className="peer cursor-pointer appearance-none rounded-md border-2 border-gray-300 w-5 h-5 transition-all checked:border-primary checked:bg-primary hover:border-blue-400 group-hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    checked={checked}
                    onChange={onChange}
                />
                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" strokeWidth="1">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                    </svg>
                </div>
            </label>
        </div>
    );
}

export default function RolesConfig() {
    const [roles, setRoles] = useState<Rol[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRol, setEditingRol] = useState<Rol | null>(null);
    const [formData, setFormData] = useState({
        nombre: '',
        codigo: '',
        prefijo: '',
        permisos: [] as string[]
    });

    const fetchRoles = async () => {
        try {
            const response = await api.get('/roles/');
            setRoles(response.data);
        } catch (err) {
            console.error("Error al cargar roles:", err);
            setError('No se pudieron cargar los roles del sistema.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoles();
    }, []);

    const handleOpenModal = (rol?: Rol) => {
        if (rol) {
            setEditingRol(rol);
            setFormData({
                nombre: rol.nombre,
                codigo: rol.codigo,
                prefijo: rol.prefijo || '',
                permisos: rol.permisos || []
            });
        } else {
            setEditingRol(null);
            setFormData({
                nombre: '',
                codigo: '',
                prefijo: '',
                permisos: []
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingRol(null);
    };

    const handleTogglePermission = (mod: string, acc: Accion, acciones: Accion[]) => {
        const permString = `${mod}.${acc}`;
        setFormData(prev => {
            const currentPerms = new Set(prev.permisos);
            const wildcardString = `${mod}.*`;
            const isWildcardActive = currentPerms.has(wildcardString);

            // Special case for "*" (TODOS)
            if (acc === Accion.TODOS) {
                if (isWildcardActive) {
                    // Turn OFF logic: remove the *
                    currentPerms.delete(wildcardString);
                } else {
                    // Turn ON logic: add * and remove specific actions of this module
                    currentPerms.add(wildcardString);
                    [Accion.VER, Accion.CREAR, Accion.EDITAR, Accion.ELIMINAR, Accion.APROBAR].forEach(a => {
                        currentPerms.delete(`${mod}.${a}`);
                    });
                }
            } else {
                // Handling specific action
                if (isWildcardActive) {
                    // If wildcard is on, clicking a specific one means we want to "break" it
                    // We remove the wildcard and add all OTHER available actions for this module
                    currentPerms.delete(wildcardString);

                    const availableActions = acciones.filter(a => a !== Accion.TODOS);
                    availableActions.forEach(a => {
                        if (a !== acc) {
                            currentPerms.add(`${mod}.${a}`);
                        }
                    });
                    // Note: 'acc' is NOT added, effectively unchecking it from the set of all actions
                } else {
                    // Normal toggle
                    if (currentPerms.has(permString)) {
                        currentPerms.delete(permString);
                    } else {
                        currentPerms.add(permString);
                    }
                }
            }

            return { ...prev, permisos: Array.from(currentPerms) };
        });
    };

    const isPermissionChecked = (mod: string, acc: Accion) => {
        if (acc !== Accion.TODOS && formData.permisos.includes(`${mod}.*`)) {
            return true;
        }
        return formData.permisos.includes(`${mod}.${acc}`);
    };

    // ── Permisos de sección (visualizar) ─────────────────────────────────────
    // Una sección es un token `modulo.<slug>` (o su permisoOverride). El wildcard
    // `modulo.*` la cubre automáticamente (Acceso Total).
    const seccionWildcard = (permiso: string) => `${permiso.split('.')[0]}.*`;

    const isSeccionChecked = (permiso: string) =>
        formData.permisos.includes(seccionWildcard(permiso)) || formData.permisos.includes(permiso);

    const isSeccionLockedByWildcard = (permiso: string) =>
        formData.permisos.includes(seccionWildcard(permiso));

    const handleToggleSeccion = (permiso: string) => {
        setFormData(prev => {
            const currentPerms = new Set(prev.permisos);
            if (currentPerms.has(permiso)) {
                currentPerms.delete(permiso);
            } else {
                currentPerms.add(permiso);
            }
            return { ...prev, permisos: Array.from(currentPerms) };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                nombre: formData.nombre,
                codigo: formData.codigo,
                prefijo: formData.prefijo || null,
                permisos: formData.permisos
            };

            if (editingRol) {
                await api.put(`/roles/${editingRol.id_rol}`, payload);
            } else {
                await api.post('/roles/', payload);
            }
            fetchRoles();
            handleCloseModal();
        } catch (err) {
            console.error("Error saving role:", err);
            alert("No se pudo guardar el rol. Verifica los datos.");
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("¿Seguro que deseas eliminar este rol permanentemente?")) return;
        try {
            await api.delete(`/roles/${id}`);
            fetchRoles();
        } catch (err: any) {
            console.error("Error deleting role:", err);
            const msg = err.response?.data?.detail || "No se pudo eliminar el rol.";
            alert(msg);
        }
    };

    if (loading) {
        return (
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-16 text-center animate-in fade-in duration-300">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
                <p className="mt-4 text-gray-500 font-medium">Cargando roles y permisos...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 rounded-[24px] border border-red-100 p-8 text-center animate-in fade-in">
                <p className="text-red-600 font-medium">{error}</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden text-gray-800 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header del Componente */}
            <div className="p-8 md:p-10 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="text-primary" size={24} />
                        Gestión de Roles y Accesos
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Configura qué secciones pueden visualizar o modificar los distintos perfiles de usuario.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-semibold rounded-xl text-sm shadow-md shadow-primary/30 hover:bg-blue-600 transition-all"
                >
                    <Plus size={18} />
                    Nuevo Rol
                </button>
            </div>

            {/* Tabla Principal */}
            <div className="overflow-x-auto hide-scrollbar">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/80 text-gray-600 uppercase text-xs font-bold tracking-wider">
                        <tr>
                            <th className="p-4 pl-10">Rol de Sistema</th>
                            <th className="p-4">Código / Pref</th>
                            <th className="p-4 hidden md:table-cell">Reglas Activas</th>
                            <th className="p-4 pr-10 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/80">
                        {roles.map((rol) => (
                            <tr key={rol.id_rol} className="hover:bg-gray-50/50 transition-colors group">
                                <td className="p-4 pl-10 font-bold text-gray-900">
                                    {rol.nombre}
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md font-mono text-xs">{rol.codigo}</span>
                                        {rol.prefijo && <span className="text-gray-400 text-xs">/ {rol.prefijo}</span>}
                                    </div>
                                </td>
                                <td className="p-4 hidden md:table-cell">
                                    <div className="flex items-center gap-1.5 justify-start">
                                        <CheckCircle2 size={16} className={(rol.permisos || []).length > 0 ? "text-green-500" : "text-gray-300"} />
                                        <span className="text-gray-600 font-medium">{(rol.permisos || []).length} mod.</span>
                                    </div>
                                </td>
                                <td className="p-4 pr-10 relative">
                                    <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleOpenModal(rol)}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Modificar Rol"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(rol.id_rol)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar Rol"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            {roles.length === 0 && (
                <div className="p-10 text-center text-gray-500 text-sm border-t border-gray-100">
                    No se han encontrado roles configurados en la base de datos.
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

                        {/* Modal Header */}
                        <div className="p-6 md:px-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="text-xl font-bold text-gray-900">
                                {editingRol ? 'Editar Rol' : 'Crear Nuevo Rol'}
                            </h2>
                            <button onClick={handleCloseModal} className="p-2 text-gray-400 hover:text-gray-700 bg-white rounded-full border border-gray-200 shadow-sm transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar flex-1">
                            <form id="roleForm" onSubmit={handleSubmit} className="space-y-8">
                                {/* Información Básica */}
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Detalles Generales</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                                        <div className="sm:col-span-1">
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Código Único *</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="Ej: ADM"
                                                maxLength={10}
                                                disabled={!!editingRol}
                                                value={formData.codigo}
                                                onChange={e => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
                                                className="w-full text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary uppercase font-mono disabled:opacity-60 disabled:cursor-not-allowed"
                                            />
                                            {editingRol && <p className="text-[11px] text-gray-400 mt-1 pl-1">El código no puede modificarse.</p>}
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nombre Público *</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="Ej: Administrador Sistema"
                                                value={formData.nombre}
                                                onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                                className="w-full text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Matriz de Permisos */}
                                <div>
                                    <div className="flex justify-between items-end mb-4">
                                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Matriz de Acceso</h4>
                                        <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                                            {formData.permisos.length} reglas activas
                                        </span>
                                    </div>

                                    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-gray-50 border-b border-gray-200 text-gray-700">
                                                    <tr>
                                                        <th className="px-6 py-4 font-semibold">Módulo del Sistema</th>
                                                        {(Object.values(Accion) as Accion[]).map(acc => (
                                                            <th key={acc} className="px-4 py-4 text-center font-semibold text-xs uppercase tracking-wider">
                                                                {AccionNames[acc]}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {(() => {
                                                        const acciones = Object.values(Accion) as Accion[];
                                                        const crudShown = new Set<string>();
                                                        const filas: React.ReactNode[] = [];

                                                        MODULOS.forEach((mod, idx) => {
                                                            const tieneCrud = !!mod.acciones && mod.acciones.length > 0;
                                                            const tieneSecciones = !!mod.secciones && mod.secciones.length > 0;
                                                            // Enlaces simples que comparten namespace con otro módulo (ej. Configuración) no llevan fila propia.
                                                            if (!tieneCrud && !tieneSecciones) return;

                                                            const showCrud = tieneCrud && !crudShown.has(mod.key);
                                                            if (showCrud) crudShown.add(mod.key);

                                                            // Fila de módulo (acciones CRUD)
                                                            filas.push(
                                                                <tr key={`mod-${idx}`} className="bg-gray-50/40 hover:bg-blue-50/30 transition-colors">
                                                                    <td className="px-6 py-3.5 font-bold text-gray-900">
                                                                        {mod.label}
                                                                    </td>
                                                                    {acciones.map(acc => {
                                                                        const isValidAction = showCrud && mod.acciones!.includes(acc);
                                                                        return (
                                                                            <td key={acc} className="px-4 py-3.5 text-center align-middle">
                                                                                {isValidAction ? (
                                                                                    <PermCheckbox
                                                                                        checked={isPermissionChecked(mod.key, acc)}
                                                                                        onChange={() => handleTogglePermission(mod.key, acc, mod.acciones!)}
                                                                                    />
                                                                                ) : (
                                                                                    <span className="text-gray-300 text-xs">-</span>
                                                                                )}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                </tr>
                                                            );

                                                            // Filas de sección (solo "Visualizar")
                                                            (mod.secciones || []).forEach((sec: SeccionDef) => {
                                                                const permiso = permisoSeccion(mod.key, sec);
                                                                filas.push(
                                                                    <tr key={`sec-${idx}-${sec.slug}`} className="hover:bg-blue-50/20 transition-colors">
                                                                        <td className="px-6 py-2.5 pl-12 text-gray-600 text-[13px]">
                                                                            <span className="text-gray-300 mr-2">└</span>{sec.label}
                                                                        </td>
                                                                        {acciones.map(acc => (
                                                                            <td key={acc} className="px-4 py-2.5 text-center align-middle">
                                                                                {acc === Accion.VER ? (
                                                                                    <PermCheckbox
                                                                                        checked={isSeccionChecked(permiso)}
                                                                                        disabled={isSeccionLockedByWildcard(permiso)}
                                                                                        onChange={() => handleToggleSeccion(permiso)}
                                                                                    />
                                                                                ) : (
                                                                                    <span className="text-gray-200 text-xs">-</span>
                                                                                )}
                                                                            </td>
                                                                        ))}
                                                                    </tr>
                                                                );
                                                            });
                                                        });

                                                        return filas;
                                                    })()}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 md:px-8 border-t border-gray-100 bg-white flex justify-end gap-3 rounded-b-3xl">
                            <button
                                type="button"
                                onClick={handleCloseModal}
                                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                form="roleForm"
                                className="px-6 py-2.5 bg-primary text-white font-semibold rounded-xl text-sm shadow-md shadow-primary/30 hover:bg-blue-600 transition-all flex items-center gap-2"
                            >
                                <CheckCircle2 size={18} />
                                {editingRol ? 'Actualizar Rol' : 'Crear Rol'}
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
