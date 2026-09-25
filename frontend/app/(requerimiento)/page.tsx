'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import { Search, Plus, FileText, CheckCircle, Clock, XCircle, Loader2, Check, X, Package, LogOut } from 'lucide-react';
import { Requerimiento } from '@/lib/types';

export default function RequerimientosPage() {
    const { user, logout } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [requerimientos, setRequerimientos] = useState<Requerimiento[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    const canApprove = user?.rol?.codigo === 'ADM' || user?.rol?.codigo === 'GERENTE' || user?.rol?.codigo === 'FIN';

    const fetchRequerimientos = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/requerimientos');
            setRequerimientos(response.data);
        } catch (error) {
            console.error('Error fetching requerimientos:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleUpdateStatus = async (id: number, nuevoEstado: string) => {
        try {
            setActionLoading(id);
            await api.patch(`/requerimientos/${id}/estado?nuevo_estado=${nuevoEstado}`);
            await fetchRequerimientos();
        } catch (error) {
            console.error('Error updating status:', error);
        } finally {
            setActionLoading(null);
        }
    };

    useEffect(() => {
        fetchRequerimientos();
    }, [fetchRequerimientos]);

    const filtered = requerimientos.filter(req =>
        req.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.usuario_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.actividad_nombre?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusStyle = (estado: string) => {
        switch (estado) {
            case 'Aprobado':
                return { icon: CheckCircle, iconColor: 'text-green-500', bgColor: 'bg-green-100', txColor: 'text-green-800' };
            case 'Rechazado':
                return { icon: XCircle, iconColor: 'text-red-500', bgColor: 'bg-red-100', txColor: 'text-red-800' };
            default:
                return { icon: Clock, iconColor: 'text-amber-500', bgColor: 'bg-amber-100', txColor: 'text-amber-800' };
        }
    };

    const formatCLP = (value: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value);
    };

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Requerimientos</h2>
                    <p className="text-gray-500 mt-1.5 font-medium">Gestiona los requerimientos de materiales y servicios.</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar requerimiento..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm transition-colors text-gray-900"
                        />
                    </div>
                    <button 
                        className="bg-primary hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-primary/30 flex items-center transition-all duration-200 whitespace-nowrap"
                    >
                        <Plus size={20} className="md:mr-2" />
                        <span className="hidden md:inline">Nuevo Requerimiento</span>
                    </button>
                    <button
                        onClick={logout}
                        className="p-2.5 border border-gray-200 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                        title="Cerrar Sesión"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4 transition-transform hover:-translate-y-1">
                    <div className="h-14 w-14 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <FileText size={28} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Total Requerimientos</p>
                        <h3 className="text-2xl font-bold text-gray-900">{requerimientos.length}</h3>
                    </div>
                </div>

                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4 transition-transform hover:-translate-y-1">
                    <div className="h-14 w-14 shrink-0 rounded-2xl bg-green-50 flex items-center justify-center text-green-600">
                        <CheckCircle size={28} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Aprobados</p>
                        <h3 className="text-2xl font-bold text-gray-900">
                            {requerimientos.filter(r => r.estado === 'Aprobado').length}
                        </h3>
                    </div>
                </div>

                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4 transition-transform hover:-translate-y-1">
                    <div className="h-14 w-14 shrink-0 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500">
                        <Clock size={28} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Pendientes</p>
                        <h3 className="text-2xl font-bold text-gray-900">
                            {requerimientos.filter(r => r.estado === 'Pendiente').length}
                        </h3>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Número
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Fecha
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Solicitante
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Actividad
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Para
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Items
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Estado
                                </th>
                                {canApprove && (
                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Acciones
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="animate-spin" size={24} />
                                            <span>Cargando requerimientos...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                                        No se encontraron requerimientos.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((req) => {
                                    const style = getStatusStyle(req.estado);
                                    const StatusIcon = style.icon;
                                    const totalItems = req.detalles?.length || 0;
                                    const totalMonto = req.detalles?.reduce((acc, d) => acc + (d.precio * d.cantidad), 0) || 0;
                                    
                                    return (
                                        <tr key={req.id_requerimiento} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 border-l-2 border-transparent hover:border-primary">
                                                <div className="flex items-center gap-2">
                                                    <FileText size={16} className="text-gray-400" />
                                                    {req.numero}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {new Date(req.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">
                                                {req.usuario_nombre}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {req.actividad_nombre}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {req.para || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <div className="flex items-center gap-2">
                                                    <Package size={14} className="text-gray-400" />
                                                    <span className="font-medium text-gray-700">{totalItems}</span>
                                                    <span className="text-gray-400">items</span>
                                                </div>
                                                <div className="text-xs text-gray-400">
                                                    {formatCLP(totalMonto)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-3 py-1 inline-flex items-center text-xs leading-5 font-bold rounded-full ${style.bgColor} ${style.txColor}`}>
                                                    <StatusIcon size={14} className={`mr-1.5 ${style.iconColor}`} />
                                                    {req.estado}
                                                </span>
                                            </td>
                                            {canApprove && (
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    {req.estado === 'Pendiente' ? (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => handleUpdateStatus(req.id_requerimiento, 'Aprobado')}
                                                                disabled={actionLoading !== null}
                                                                className="p-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors border border-green-200"
                                                                title="Aprobar"
                                                            >
                                                                {actionLoading === req.id_requerimiento ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                                            </button>
                                                            <button
                                                                onClick={() => handleUpdateStatus(req.id_requerimiento, 'Rechazado')}
                                                                disabled={actionLoading !== null}
                                                                className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-red-200"
                                                                title="Rechazar"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Sin acciones</span>
                                                    )}
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
        </div>
    );
}
