'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { PresupuestoAnual, BudgetRequest } from '@/lib/types';
import {
    Wallet, Loader2, ArrowLeft, Calendar, DollarSign, FileText, User, Building2,
    Link2, Unlink, Plus, X, Search, CheckCircle2, Lock, AlertCircle, AlertTriangle
} from 'lucide-react';

const ROLES_CON_ACCESO_TOTAL = ['ADM', 'FIN', 'DIR', 'SOS', 'GERENTE'];

const formatCLP = (value: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value || 0);

export default function PresupuestoAnualDetallePage() {
    const router = useRouter();
    const params = useParams();
    const id = Number(params.id);
    const { user } = useAuth();
    const puedeGestionar = !!user?.rol && ROLES_CON_ACCESO_TOTAL.includes(user.rol.codigo);
    const esAdmin = !!user?.rol && user.rol.codigo === 'ADM';

    const [presupuesto, setPresupuesto] = useState<PresupuestoAnual | null>(null);
    const [enlazadas, setEnlazadas] = useState<BudgetRequest[]>([]);
    const [todas, setTodas] = useState<BudgetRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [procesandoId, setProcesandoId] = useState<number | null>(null);
    const [solicitudAQuitar, setSolicitudAQuitar] = useState<BudgetRequest | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [resPpto, resEnlazadas, resTodas] = await Promise.all([
                api.get(`/presupuesto/presupuestos-anuales/${id}`),
                api.get(`/presupuesto/presupuestos-anuales/${id}/solicitudes`),
                api.get('/presupuesto/solicitudes'),
            ]);
            setPresupuesto(resPpto.data);
            setEnlazadas(resEnlazadas.data || []);
            setTodas(resTodas.data || []);
        } catch (e) {
            console.error('Error cargando presupuesto anual:', e);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) fetchData();
    }, [id, fetchData]);

    const asignar = async (idSolicitud: number, idPresupuestoAnual: number | null) => {
        setProcesandoId(idSolicitud);
        try {
            await api.patch(`/presupuesto/solicitudes/${idSolicitud}/presupuesto-anual`, {
                id_presupuesto_anual: idPresupuestoAnual,
            });
            await fetchData();
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'No se pudo actualizar la solicitud.');
        } finally {
            setProcesandoId(null);
        }
    };

    // Solicitudes disponibles para enlazar: las que no están en este presupuesto.
    const disponibles = todas.filter((s) => s.id_presupuesto_anual !== id);
    const disponiblesFiltradas = disponibles.filter((s) => {
        if (!busqueda.trim()) return true;
        const q = busqueda.toLowerCase();
        return (
            (s.user_nombre || '').toLowerCase().includes(q) ||
            (s.subarea_nombre || '').toLowerCase().includes(q) ||
            (s.area_nombre || '').toLowerCase().includes(q) ||
            String(s.id_presupuesto).includes(q)
        );
    });

    if (loading) {
        return (
            <div className="h-96 flex flex-col items-center justify-center gap-2 text-gray-400">
                <Loader2 className="animate-spin" size={28} />
                <span className="text-sm font-semibold">Cargando presupuesto...</span>
            </div>
        );
    }

    if (!presupuesto) {
        return (
            <div className="py-16 flex flex-col items-center gap-3 text-center">
                <AlertCircle size={32} className="text-gray-300" />
                <p className="font-medium text-gray-500">Presupuesto no encontrado.</p>
                <button onClick={() => router.push('/go-compras/presupuestos')} className="text-primary font-bold text-sm">
                    Volver
                </button>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500">
            {/* Volver */}
            <button
                onClick={() => router.push('/go-compras/presupuestos')}
                className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-primary transition-colors"
            >
                <ArrowLeft size={16} /> Volver a presupuestos
            </button>

            {/* Header */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                        <Wallet size={26} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">{presupuesto.nombre}</h2>
                            <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                                    presupuesto.estado === 'activo'
                                        ? 'bg-green-50 text-green-600'
                                        : 'bg-gray-100 text-gray-500'
                                }`}
                            >
                                {presupuesto.estado === 'activo' ? <CheckCircle2 size={13} /> : <Lock size={13} />}
                                {presupuesto.estado === 'activo' ? 'Activo' : 'Cerrado'}
                            </span>
                        </div>
                        <p className="text-gray-500 mt-1 font-medium flex items-center gap-1.5">
                            <Calendar size={15} /> Año {presupuesto.year}
                        </p>
                    </div>
                </div>
                {puedeGestionar && (
                    <button
                        onClick={() => { setBusqueda(''); setShowModal(true); }}
                        className="px-5 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-2xl text-sm font-bold flex items-center gap-2 transition-all shadow-md self-start md:self-auto"
                    >
                        <Plus size={18} /> Enlazar Solicitudes
                    </button>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-green-50 flex items-center justify-center text-green-600">
                        <DollarSign size={28} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Monto Total</p>
                        <h3 className="text-2xl font-bold text-gray-900">{formatCLP(presupuesto.monto_total)}</h3>
                    </div>
                </div>
                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <FileText size={28} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Solicitudes Enlazadas</p>
                        <h3 className="text-2xl font-bold text-gray-900">{enlazadas.length}</h3>
                    </div>
                </div>
            </div>

            {/* Tabla de enlazadas */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                    <Link2 size={18} className="text-primary" />
                    <h3 className="font-bold text-gray-900">Solicitudes de este presupuesto</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Solicitud</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Solicitante</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Área</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Monto</th>
                                {esAdmin && <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Acción</th>}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {enlazadas.length === 0 ? (
                                <tr>
                                    <td colSpan={esAdmin ? 6 : 5} className="px-6 py-14 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Unlink size={28} className="text-gray-300" />
                                            <p className="font-medium">Aún no hay solicitudes enlazadas a este presupuesto.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                enlazadas.map((s) => (
                                    <tr key={s.id_presupuesto} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                            <div className="flex items-center gap-2">
                                                <FileText size={16} className="text-gray-400" />
                                                <div className="flex flex-col">
                                                    <span>REQ-{new Date(s.fecha).getFullYear()}-{s.id_presupuesto.toString().padStart(3, '0')}</span>
                                                    <span className="text-xs text-gray-400 font-medium">
                                                        {new Date(s.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">
                                            <div className="flex items-center gap-2">
                                                <User size={14} className="text-gray-400" />
                                                {s.user_nombre || '—'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                            <div className="font-medium">{s.area_nombre || '—'}</div>
                                            {s.subarea_nombre && <div className="text-xs text-gray-500">{s.subarea_nombre}</div>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full text-xs font-bold">
                                                {s.estado}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                            {formatCLP(s.monto_total)}
                                        </td>
                                        {esAdmin && (
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <button
                                                    onClick={() => setSolicitudAQuitar(s)}
                                                    disabled={procesandoId === s.id_presupuesto}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                                                    title="Quitar esta solicitud del presupuesto anual"
                                                >
                                                    {procesandoId === s.id_presupuesto ? (
                                                        <Loader2 size={14} className="animate-spin" />
                                                    ) : (
                                                        <Unlink size={14} />
                                                    )}
                                                    Quitar de Presupuesto
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal enlazar */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-6 border-b border-gray-100">
                            <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                                <Link2 size={22} className="text-primary" /> Enlazar Solicitudes a {presupuesto.nombre}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 pb-3">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                <input
                                    type="text"
                                    value={busqueda}
                                    onChange={(e) => setBusqueda(e.target.value)}
                                    placeholder="Buscar por solicitante, área o N° de solicitud..."
                                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
                            {disponiblesFiltradas.length === 0 ? (
                                <div className="py-12 flex flex-col items-center gap-2 text-gray-400 text-center">
                                    <FileText size={28} className="text-gray-300" />
                                    <p className="font-medium">No hay solicitudes disponibles para enlazar.</p>
                                </div>
                            ) : (
                                disponiblesFiltradas.map((s) => (
                                    <div
                                        key={s.id_presupuesto}
                                        className="flex items-center justify-between gap-3 p-4 border border-gray-100 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                                <FileText size={15} className="text-gray-400 shrink-0" />
                                                REQ-{new Date(s.fecha).getFullYear()}-{s.id_presupuesto.toString().padStart(3, '0')}
                                                <span className="text-xs font-bold text-gray-900">· {formatCLP(s.monto_total)}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
                                                <span className="flex items-center gap-1"><User size={12} /> {s.user_nombre || '—'}</span>
                                                {s.area_nombre && <span className="flex items-center gap-1"><Building2 size={12} /> {s.area_nombre}</span>}
                                                {s.presupuesto_anual_nombre && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full font-semibold">
                                                        <Wallet size={11} /> {s.presupuesto_anual_nombre}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => asignar(s.id_presupuesto, id)}
                                            disabled={procesandoId === s.id_presupuesto}
                                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-white hover:bg-blue-600 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                                            title={s.presupuesto_anual_nombre ? 'Reasignar a este presupuesto' : 'Enlazar a este presupuesto'}
                                        >
                                            {procesandoId === s.id_presupuesto ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Link2 size={14} />
                                            )}
                                            {s.presupuesto_anual_nombre ? 'Reasignar' : 'Enlazar'}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de confirmación para Quitar de Presupuesto (Sólo Admin) */}
            {solicitudAQuitar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200 border border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
                                <AlertTriangle size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-extrabold text-gray-900">¿Quitar solicitud del presupuesto?</h3>
                                <p className="text-xs text-gray-500 font-medium">Esta acción requiere confirmación de Administrador</p>
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 text-xs space-y-1.5 text-gray-700">
                            <p>
                                Vas a desenlazar la solicitud <strong>REQ-{new Date(solicitudAQuitar.fecha).getFullYear()}-{solicitudAQuitar.id_presupuesto.toString().padStart(3, '0')}</strong> de <strong>{presupuesto.nombre}</strong>.
                            </p>
                            <p className="text-gray-500 font-medium">
                                • La solicitud ya no figurará en este presupuesto anual.
                                <br />
                                • Volverá a quedar disponible para ser enlazada a otro presupuesto.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => setSolicitudAQuitar(null)}
                                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={async () => {
                                    const targetId = solicitudAQuitar.id_presupuesto;
                                    setSolicitudAQuitar(null);
                                    await asignar(targetId, null);
                                }}
                                disabled={procesandoId === solicitudAQuitar.id_presupuesto}
                                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors shadow-md flex items-center gap-2 disabled:opacity-50"
                            >
                                {procesandoId === solicitudAQuitar.id_presupuesto ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Unlink size={14} />
                                )}
                                Confirmar y Quitar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
