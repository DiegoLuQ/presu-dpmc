'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Landmark, Loader2, Pencil, Plus, Search, Trash2, Truck } from 'lucide-react';
import api from '@/lib/api/client';
import { CuentasModal, ProveedorModal } from '@/components/go-contralor/ops/ProveedorModal';
import { Proveedor, SinAccesoOps, inputCls, mensajeError, useAccesoOps } from '@/components/go-contralor/ops/comun';

export default function ProveedoresOpsPage() {
    const { isLoading, puedeVer, puedeCrear, puedeEditar, puedeAnular } = useAccesoOps();
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [q, setQ] = useState('');
    const [inactivos, setInactivos] = useState(false);
    const [modal, setModal] = useState<{ abierto: boolean; prov: Proveedor | null }>({ abierto: false, prov: null });
    const [cuentasDe, setCuentasDe] = useState<Proveedor | null>(null);

    const cargar = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get('/ops/proveedores', { params: { q: q || undefined, incluir_inactivos: inactivos } });
            setProveedores(res.data || []);
        } catch (e) {
            setError(mensajeError(e, 'No se pudieron cargar los proveedores.'));
        } finally {
            setLoading(false);
        }
    }, [q, inactivos]);

    useEffect(() => {
        if (isLoading || !puedeVer) return;
        const t = setTimeout(cargar, 250);
        return () => clearTimeout(t);
    }, [cargar, isLoading, puedeVer]);

    const eliminar = async (p: Proveedor) => {
        const msg = p.n_ordenes > 0
            ? `${p.nombre} tiene ${p.n_ordenes} orden(es). Se desactivará (no se borra). ¿Continuar?`
            : `¿Eliminar a ${p.nombre}?`;
        if (!window.confirm(msg)) return;
        try {
            await api.delete(`/ops/proveedores/${p.id_proveedor}`);
            cargar();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo eliminar el proveedor.'));
        }
    };

    const reactivar = async (p: Proveedor) => {
        try {
            await api.put(`/ops/proveedores/${p.id_proveedor}`, { ...p, activo: true });
            cargar();
        } catch (e) {
            setError(mensajeError(e, 'No se pudo reactivar el proveedor.'));
        }
    };

    if (isLoading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" /></div>;
    if (!puedeVer) return <SinAccesoOps />;

    return (
        <div className="animate-in fade-in duration-500 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <Link href="/go-contralor/ops" className="text-xs font-semibold text-gray-400 hover:text-primary flex items-center gap-1 mb-1">
                        <ArrowLeft size={13} /> Órdenes de Pago
                    </Link>
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><Truck className="text-primary" /> Proveedores</h1>
                    <p className="text-sm text-gray-500">Proveedores de las Órdenes de Pago de Servicio y sus cuentas bancarias.</p>
                </div>
                {puedeCrear && (
                    <button onClick={() => setModal({ abierto: true, prov: null })}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 flex items-center gap-2">
                        <Plus size={16} /> Nuevo proveedor
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px] max-w-md">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input className={`${inputCls} pl-9`} placeholder="Buscar por nombre o RUT" value={q} onChange={e => setQ(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={inactivos} onChange={e => setInactivos(e.target.checked)} /> Mostrar inactivos
                </label>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                        <tr>
                            <th className="text-left px-4 py-3">RUT</th>
                            <th className="text-left px-4 py-3">Nombre</th>
                            <th className="text-left px-4 py-3">Contacto</th>
                            <th className="text-left px-4 py-3">Dirección</th>
                            <th className="text-center px-4 py-3">Cuentas</th>
                            <th className="text-center px-4 py-3">OPS</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr><td colSpan={7} className="py-12 text-center text-gray-400"><Loader2 className="animate-spin inline" /></td></tr>
                        ) : proveedores.length === 0 ? (
                            <tr><td colSpan={7} className="py-12 text-center text-gray-400">No hay proveedores{q ? ' que coincidan' : ''}.</td></tr>
                        ) : proveedores.map(p => (
                            <tr key={p.id_proveedor} className={`hover:bg-gray-50/60 ${p.activo ? '' : 'opacity-50'}`}>
                                <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{p.rut}</td>
                                <td className="px-4 py-3 font-semibold text-gray-900">{p.nombre}{!p.activo && <span className="ml-2 text-[10px] text-gray-400">(inactivo)</span>}</td>
                                <td className="px-4 py-3 text-gray-500 text-xs">{[p.telefono, p.correo].filter(Boolean).join(' · ') || '—'}</td>
                                <td className="px-4 py-3 text-gray-500 text-xs">{p.direccion || '—'}</td>
                                <td className="px-4 py-3 text-center">
                                    <button onClick={() => setCuentasDe(p)} disabled={!puedeEditar}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 disabled:text-gray-400 disabled:hover:bg-transparent">
                                        <Landmark size={13} /> {p.cuentas.length}
                                    </button>
                                </td>
                                <td className="px-4 py-3 text-center text-gray-600">{p.n_ordenes}</td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                    {puedeEditar && !p.activo && (
                                        <button onClick={() => reactivar(p)} className="px-2 py-1 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Reactivar</button>
                                    )}
                                    {puedeEditar && (
                                        <button onClick={() => setModal({ abierto: true, prov: p })} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100" title="Editar"><Pencil size={15} /></button>
                                    )}
                                    {puedeAnular && p.activo && (
                                        <button onClick={() => eliminar(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Eliminar"><Trash2 size={15} /></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ProveedorModal abierto={modal.abierto} proveedor={modal.prov} onCerrar={() => setModal({ abierto: false, prov: null })}
                onGuardado={() => { setModal({ abierto: false, prov: null }); cargar(); }} />
            <CuentasModal proveedor={cuentasDe} onCerrar={() => setCuentasDe(null)}
                onCambio={cuentas => setProveedores(ps => ps.map(p => p.id_proveedor === cuentasDe?.id_proveedor ? { ...p, cuentas } : p))} />
        </div>
    );
}
