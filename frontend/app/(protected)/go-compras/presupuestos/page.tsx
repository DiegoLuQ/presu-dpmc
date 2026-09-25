'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { PresupuestoAnual, Colegio } from '@/lib/types';
import {
    Wallet, Plus, Loader2, Calendar, FileText, DollarSign, Trash2, Pencil,
    ArrowRight, X, CheckCircle2, Lock, AlertCircle, AlertTriangle, Building2, UserRound
} from 'lucide-react';

const ROLES_CON_ACCESO_TOTAL = ['ADM', 'FIN', 'DIR', 'SOS', 'GERENTE'];
// Roles que pueden crear el presupuesto anual eligiendo el colegio destino.
const ROLES_ELIGE_COLEGIO = ['ADM', 'SOS', 'OPE'];
// Roles que pueden eliminar un presupuesto anual (incluye Operaciones).
const ROLES_ELIMINA = ['ADM', 'FIN', 'DIR', 'SOS', 'GERENTE', 'OPE'];

const formatCLP = (value: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value || 0);

const formatFecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });

export default function PresupuestosAnualesPage() {
    const router = useRouter();
    const { user } = useAuth();
    const subareaNombre = (user?.cargo?.nombre || '').toLowerCase();
    const subareasNombres = (user?.cargos || []).map(s => (s.nombre || '').toLowerCase());
    const esJefeComprasSubarea = subareaNombre.includes('jefe de compras') || 
                                 subareaNombre.includes('jefe compras') || 
                                 subareaNombre.includes('asistente de compras') || 
                                 subareaNombre.includes('asistente compras') || 
                                 subareasNombres.some(s => 
                                     s.includes('jefe de compras') || 
                                     s.includes('jefe compras') || 
                                     s.includes('asistente de compras') || 
                                     s.includes('asistente compras')
                                 );
    const esAdmin = user?.rol?.codigo === 'ADM';

    const puedeGestionar = esAdmin || esJefeComprasSubarea || (!!user?.rol && ROLES_CON_ACCESO_TOTAL.includes(user.rol.codigo));
    const puedeElegirColegio = esAdmin || esJefeComprasSubarea || (!!user?.rol && ROLES_ELIGE_COLEGIO.includes(user.rol.codigo));
    const puedeCrear = puedeGestionar || puedeElegirColegio;
    const puedeEliminar = esAdmin || esJefeComprasSubarea || (!!user?.rol && ROLES_ELIMINA.includes(user.rol.codigo));
    const puedeToggleActivo = esAdmin || esJefeComprasSubarea || puedeGestionar;

    const [presupuestos, setPresupuestos] = useState<PresupuestoAnual[]>([]);
    const [colegios, setColegios] = useState<Colegio[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [pptoParaEliminar, setPptoParaEliminar] = useState<PresupuestoAnual | null>(null);
    const [confirmNombre, setConfirmNombre] = useState('');

    const [pptoEditando, setPptoEditando] = useState<PresupuestoAnual | null>(null);

    const currentYear = new Date().getFullYear();
    const [form, setForm] = useState({ year: currentYear + 1, nombre: '', descripcion: '', id_colegio: user?.id_colegio });

    const fetchPresupuestos = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/presupuesto/presupuestos-anuales');
            setPresupuestos(res.data || []);
        } catch (e) {
            console.error('Error cargando presupuestos anuales:', e);
            setPresupuestos([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPresupuestos();
    }, [fetchPresupuestos]);

    useEffect(() => {
        if (!puedeElegirColegio) return;
        api.get('/catalogos/colegios')
            .then((res) => setColegios(res.data || []))
            .catch((e) => console.error('Error cargando colegios:', e));
    }, [puedeElegirColegio]);

    const abrirModal = () => {
        setPptoEditando(null);
        setForm({ year: currentYear + 1, nombre: '', descripcion: '', id_colegio: user?.id_colegio });
        setError('');
        setShowModal(true);
    };

    const abrirModalEditar = (p: PresupuestoAnual) => {
        setPptoEditando(p);
        setForm({
            year: p.year,
            nombre: p.nombre,
            descripcion: p.descripcion || '',
            id_colegio: p.id_colegio,
        });
        setError('');
        setShowModal(true);
    };

    const guardarPresupuesto = async () => {
        setSaving(true);
        setError('');
        try {
            if (pptoEditando) {
                await api.patch(`/presupuesto/presupuestos-anuales/${pptoEditando.id_presupuesto_anual}`, {
                    nombre: form.nombre.trim() || null,
                    descripcion: form.descripcion.trim() || null,
                });
            } else {
                await api.post('/presupuesto/presupuestos-anuales', {
                    year: Number(form.year),
                    nombre: form.nombre.trim() || null,
                    descripcion: form.descripcion.trim() || null,
                    ...(puedeElegirColegio && form.id_colegio ? { id_colegio: Number(form.id_colegio) } : {}),
                });
            }
            setShowModal(false);
            setPptoEditando(null);
            await fetchPresupuestos();
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'No se pudo guardar el presupuesto.');
        } finally {
            setSaving(false);
        }
    };

    const eliminarPresupuesto = (p: PresupuestoAnual) => {
        setConfirmNombre('');
        setPptoParaEliminar(p);
    };

    // El nombre escrito debe coincidir exactamente con el del presupuesto para habilitar el borrado.
    const nombreCoincide = !!pptoParaEliminar && confirmNombre.trim() === pptoParaEliminar.nombre.trim();

    const confirmarEliminacion = async () => {
        if (!pptoParaEliminar || !nombreCoincide) return;
        setDeletingId(pptoParaEliminar.id_presupuesto_anual);
        try {
            await api.delete(`/presupuesto/presupuestos-anuales/${pptoParaEliminar.id_presupuesto_anual}`);
            setPptoParaEliminar(null);
            setConfirmNombre('');
            await fetchPresupuestos();
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'No se pudo eliminar el presupuesto.');
        } finally {
            setDeletingId(null);
        }
    };

    const totalGeneral = presupuestos.reduce((acc, p) => acc + (p.monto_total || 0), 0);
    const totalSolicitudes = presupuestos.reduce((acc, p) => acc + (p.solicitudes_count || 0), 0);

    return (
        <div className="animate-in fade-in duration-500">
            {/* Header */}
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                        <Wallet size={26} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Presupuestos Anuales</h2>
                        <p className="text-gray-500 mt-1 font-medium">
                            Genera el presupuesto del año siguiente y enlaza las solicitudes que lo componen.
                        </p>
                    </div>
                </div>
                {puedeCrear && (
                    <button
                        onClick={abrirModal}
                        className="px-5 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-2xl text-sm font-bold flex items-center gap-2 transition-all shadow-md self-start md:self-auto"
                    >
                        <Plus size={18} /> Generar Presupuesto
                    </button>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <Wallet size={28} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Presupuestos</p>
                        <h3 className="text-2xl font-bold text-gray-900">{presupuestos.length}</h3>
                    </div>
                </div>
                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-green-50 flex items-center justify-center text-green-600">
                        <DollarSign size={28} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Monto Total</p>
                        <h3 className="text-2xl font-bold text-gray-900">{formatCLP(totalGeneral)}</h3>
                    </div>
                </div>
                <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500">
                        <FileText size={28} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-gray-500 mb-0.5">Solicitudes Enlazadas</p>
                        <h3 className="text-2xl font-bold text-gray-900">{totalSolicitudes}</h3>
                    </div>
                </div>
            </div>

            {/* Lista */}
            {loading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <Loader2 className="animate-spin" size={28} />
                    <span className="text-sm font-semibold">Cargando presupuestos...</span>
                </div>
            ) : presupuestos.length === 0 ? (
                <div className="bg-white rounded-[24px] border border-gray-100 py-16 flex flex-col items-center gap-3 text-center">
                    <div className="p-4 bg-gray-50 rounded-2xl">
                        <Wallet size={32} className="text-gray-300" />
                    </div>
                    <p className="font-medium text-gray-500">Aún no hay presupuestos anuales.</p>
                    {puedeCrear && (
                        <button
                            onClick={abrirModal}
                            className="mt-2 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-sm font-bold flex items-center gap-2"
                        >
                            <Plus size={16} /> Generar el primero
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {presupuestos.map((p) => (
                        <div
                            key={p.id_presupuesto_anual}
                            className="bg-white rounded-[24px] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 hover:-translate-y-1 hover:shadow-md transition-all group flex flex-col"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-2 text-primary">
                                    <Calendar size={18} />
                                    <span className="text-3xl font-extrabold text-gray-900">{p.year}</span>
                                </div>
                                <button
                                    disabled={!puedeToggleActivo}
                                    onClick={async () => {
                                        if (!puedeToggleActivo) return;
                                        const nuevoEstado = p.estado === 'activo' ? 'cerrado' : 'activo';
                                        try {
                                            await api.patch(`/presupuesto/presupuestos-anuales/${p.id_presupuesto_anual}`, {
                                                estado: nuevoEstado
                                            });
                                            setPresupuestos(prev => prev.map(item =>
                                                item.id_presupuesto_anual === p.id_presupuesto_anual
                                                    ? { ...item, estado: nuevoEstado }
                                                    : item
                                            ));
                                        } catch (err: any) {
                                            alert(err?.response?.data?.detail || 'No se pudo cambiar el estado.');
                                        }
                                    }}
                                    title={!puedeToggleActivo ? 'Solo el Administrador y Jefe de Compras pueden cambiar el estado' : (p.estado === 'activo' ? 'Desactivar presupuesto' : 'Activar presupuesto')}
                                    className={`relative inline-flex h-6 w-11 shrink-0 ${!puedeToggleActivo ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                        p.estado === 'activo' ? 'bg-green-500' : 'bg-gray-300'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                            p.estado === 'activo' ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            <h3 className="text-base font-bold text-gray-900 mb-1">{p.nombre}</h3>
                            {p.descripcion && (
                                <p className="text-xs text-gray-500 mb-2 line-clamp-2">{p.descripcion}</p>
                            )}

                            <p className="text-[11px] text-gray-400 mb-4 flex items-center gap-1.5">
                                <UserRound size={12} className="shrink-0" />
                                <span className="truncate">
                                    Creado por <span className="font-semibold text-gray-500">{p.creado_por_nombre || '—'}</span>
                                    {p.creado_en && ` · ${formatFecha(p.creado_en)}`}
                                </span>
                            </p>

                            <div className="grid grid-cols-2 gap-3 mt-auto mb-4">
                                <div className="p-3 bg-gray-50/60 rounded-xl">
                                    <p className="text-[11px] text-gray-400 font-medium">Solicitudes</p>
                                    <p className="text-lg font-extrabold text-gray-900">{p.solicitudes_count}</p>
                                </div>
                                <div className="p-3 bg-gray-50/60 rounded-xl">
                                    <p className="text-[11px] text-gray-400 font-medium">Monto</p>
                                    <p className="text-sm font-extrabold text-gray-900 mt-0.5">{formatCLP(p.monto_total)}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => router.push(`/go-compras/presupuestos/${p.id_presupuesto_anual}`)}
                                    className="flex-1 py-2.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                                >
                                    Gestionar Solicitudes <ArrowRight size={15} />
                                </button>
                                {puedeCrear && (
                                    <button
                                        onClick={() => abrirModalEditar(p)}
                                        className="p-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl transition-colors"
                                        title="Editar presupuesto"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal crear / editar */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md p-7 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                                <Wallet size={22} className="text-primary" /> {pptoEditando ? 'Editar Presupuesto' : 'Generar Presupuesto'}
                            </h3>
                            <button onClick={() => { setShowModal(false); setPptoEditando(null); }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>

                        {error && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm flex items-center gap-2">
                                <AlertCircle size={16} /> {error}
                            </div>
                        )}

                        <div className="space-y-4">
                            {pptoEditando && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
                                        <Building2 size={13} /> Colegio Asignado
                                    </label>
                                    <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 flex items-center gap-2">
                                        <Building2 size={16} className="text-primary shrink-0" />
                                        <span>
                                            {pptoEditando.colegio_nombre ||
                                             colegios.find(c => c.id_colegio === pptoEditando.id_colegio)?.nombre ||
                                             `Colegio N° ${pptoEditando.id_colegio}`}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5">Año del presupuesto</label>
                                <input
                                    type="number"
                                    value={form.year}
                                    disabled={!!pptoEditando}
                                    onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) || new Date().getFullYear() })}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-gray-50 disabled:text-gray-500"
                                    placeholder="Ej: 2026"
                                    min="2000"
                                    max="2100"
                                />

                                <p className="text-[11px] text-gray-400 mt-1">
                                    {pptoEditando ? 'El año del presupuesto no se puede modificar.' : `Se planifica el año anterior: las solicitudes creadas este año se enlazarán al presupuesto ${currentYear + 1}.`}
                                </p>
                            </div>
                            {puedeElegirColegio && colegios.length > 1 && !pptoEditando && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5">
                                        <Building2 size={13} /> Colegio
                                    </label>
                                    <select
                                        value={form.id_colegio ?? ''}
                                        onChange={(e) => setForm({ ...form, id_colegio: Number(e.target.value) })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                    >
                                        {colegios.map((c) => (
                                            <option key={c.id_colegio} value={c.id_colegio}>{c.nombre}</option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        El presupuesto se creará para el colegio seleccionado.
                                    </p>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5">Nombre</label>
                                <input
                                    type="text"
                                    value={form.nombre}
                                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                                    placeholder={`Presupuesto ${form.year}`}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5">Descripción (opcional)</label>
                                <textarea
                                    value={form.descripcion}
                                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                                    rows={2}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mt-6">
                            {pptoEditando && puedeEliminar && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const p = pptoEditando;
                                        setShowModal(false);
                                        setPptoEditando(null);
                                        eliminarPresupuesto(p);
                                    }}
                                    className="py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                                    title="Eliminar este presupuesto"
                                >
                                    <Trash2 size={15} />
                                    Eliminar
                                </button>
                            )}
                            <button
                                onClick={() => { setShowModal(false); setPptoEditando(null); }}
                                className="flex-1 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-bold transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={guardarPresupuesto}
                                disabled={saving}
                                className="flex-1 py-2.5 bg-primary hover:bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : pptoEditando ? <CheckCircle2 size={16} /> : <Plus size={16} />}
                                {pptoEditando ? 'Guardar' : 'Crear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal confirmar eliminación */}
            {pptoParaEliminar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md p-7 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4 text-red-600">
                            <div className="p-2 bg-red-50 rounded-xl">
                                <AlertTriangle size={24} />
                            </div>
                            <h3 className="text-xl font-extrabold text-gray-900">
                                ¿Eliminar Presupuesto?
                            </h3>
                        </div>

                        <div className="space-y-3 mb-6">
                            <p className="text-sm text-gray-600 font-medium">
                                Estás a punto de eliminar el presupuesto anual <strong className="text-gray-950">"{pptoParaEliminar.nombre}"</strong>.
                            </p>
                            
                            <div className="p-4 bg-red-50/50 border border-red-100 rounded-2xl space-y-2">
                                <p className="text-xs text-red-800 font-bold flex items-center gap-1.5">
                                    <AlertCircle size={14} /> Se eliminarán en cascada:
                                </p>
                                <ul className="text-xs text-red-700 font-semibold list-disc list-inside pl-1 space-y-1">
                                    <li>El presupuesto anual y sus configuraciones</li>
                                    <li>Las <strong className="text-red-900">{pptoParaEliminar.solicitudes_count}</strong> solicitudes de compra asociadas</li>
                                    <li>Todos los detalles de compras de dichas solicitudes</li>
                                </ul>
                            </div>

                            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
                                <p className="text-xs text-blue-800 font-bold flex items-center gap-1.5 mb-1">
                                    <CheckCircle2 size={14} className="text-blue-600" /> ¿Qué no se eliminará?
                                </p>
                                <p className="text-xs text-blue-700 font-medium leading-relaxed">
                                    El <strong>catálogo de recursos global (incluyendo recursos sugeridos)</strong> no se verá afectado de ninguna manera, ya que son entes independientes.
                                </p>
                            </div>
                            
                            <p className="text-xs text-gray-500 italic mt-2">
                                Esta acción no se puede deshacer.
                            </p>

                            {/* Confirmación de seguridad: escribir el nombre exacto */}
                            <div className="pt-1">
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">
                                    Para confirmar, escribe el nombre del presupuesto: <span className="text-gray-900">{pptoParaEliminar.nombre}</span>
                                </label>
                                <input
                                    type="text"
                                    value={confirmNombre}
                                    onChange={(e) => setConfirmNombre(e.target.value)}
                                    autoFocus
                                    placeholder={pptoParaEliminar.nombre}
                                    className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm font-medium focus:outline-none focus:ring-1 transition-colors ${
                                        confirmNombre.length === 0
                                            ? 'border-gray-200 focus:ring-primary focus:border-primary'
                                            : nombreCoincide
                                                ? 'border-green-300 focus:ring-green-400 focus:border-green-400'
                                                : 'border-red-300 focus:ring-red-400 focus:border-red-400'
                                    }`}
                                />
                                {confirmNombre.length > 0 && !nombreCoincide && (
                                    <p className="text-[11px] text-red-500 mt-1">El nombre no coincide.</p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => { setPptoParaEliminar(null); setConfirmNombre(''); }}
                                className="flex-1 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-bold transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmarEliminacion}
                                disabled={!nombreCoincide || deletingId === pptoParaEliminar.id_presupuesto_anual}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {deletingId === pptoParaEliminar.id_presupuesto_anual ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <Trash2 size={16} />
                                )}
                                Confirmar y Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
