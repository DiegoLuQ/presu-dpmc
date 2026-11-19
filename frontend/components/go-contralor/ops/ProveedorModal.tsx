'use client';

import React, { useEffect, useState } from 'react';
import { Landmark, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import api from '@/lib/api/client';
import {
    Cuenta, Proveedor, TIPOS_CUENTA, inputCls, labelCls, mensajeError, normalizarRut, rutValido,
} from './comun';

/** Alta / edición de proveedor (RUT y nombre obligatorios). */
export function ProveedorModal({ abierto, proveedor, onCerrar, onGuardado }: {
    abierto: boolean;
    proveedor: Proveedor | null;
    onCerrar: () => void;
    onGuardado: (p: Proveedor) => void;
}) {
    const vacio = { rut: '', nombre: '', telefono: '', direccion: '', correo: '' };
    const [form, setForm] = useState(vacio);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!abierto) return;
        setError('');
        setForm(proveedor ? {
            rut: proveedor.rut, nombre: proveedor.nombre, telefono: proveedor.telefono || '',
            direccion: proveedor.direccion || '', correo: proveedor.correo || '',
        } : vacio);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abierto, proveedor]);

    const rutOk = !form.rut || rutValido(form.rut);

    const guardar = async () => {
        if (!form.rut.trim() || !form.nombre.trim()) { setError('RUT y nombre son obligatorios.'); return; }
        if (!rutOk) { setError('El RUT no es válido (revisa el dígito verificador).'); return; }
        setGuardando(true);
        setError('');
        try {
            const body = { ...form, rut: normalizarRut(form.rut), activo: true };
            const res = proveedor
                ? await api.put(`/ops/proveedores/${proveedor.id_proveedor}`, body)
                : await api.post('/ops/proveedores', body);
            onGuardado(res.data);
        } catch (e) {
            setError(mensajeError(e, 'No se pudo guardar el proveedor.'));
        } finally {
            setGuardando(false);
        }
    };

    const campo = (k: keyof typeof vacio, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
        <div>
            <label className={labelCls}>{label}</label>
            <input className={inputCls} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} {...extra} />
        </div>
    );

    return (
        <Modal isOpen={abierto} onClose={onCerrar} title={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}>
            <div className="space-y-3">
                <div>
                    <label className={labelCls}>RUT *</label>
                    <input className={`${inputCls} ${rutOk ? '' : 'border-red-300'}`} value={form.rut} placeholder="77287761-7"
                        onChange={e => setForm({ ...form, rut: e.target.value })}
                        onBlur={() => form.rut && setForm(f => ({ ...f, rut: normalizarRut(f.rut) }))} />
                    {!rutOk && <p className="text-[11px] text-red-500 mt-1">RUT inválido</p>}
                </div>
                {campo('nombre', 'Nombre o razón social *')}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {campo('telefono', 'Teléfono')}
                    {campo('correo', 'Correo', { type: 'email' })}
                </div>
                {campo('direccion', 'Dirección')}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onCerrar} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancelar</button>
                    <button onClick={guardar} disabled={guardando}
                        className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                        {guardando && <Loader2 size={14} className="animate-spin" />} Guardar
                    </button>
                </div>
            </div>
        </Modal>
    );
}

/** Cuentas bancarias de un proveedor (puede tener varias). */
export function CuentasModal({ proveedor, onCerrar, onCambio }: {
    proveedor: Proveedor | null;
    onCerrar: () => void;
    onCambio: (cuentas: Cuenta[]) => void;
}) {
    const vacio = { banco: '', tipo_cuenta: 'Corriente', numero_cuenta: '', rut_titular: '', nombre_titular: '', correo: '' };
    const [cuentas, setCuentas] = useState<Cuenta[]>([]);
    const [form, setForm] = useState(vacio);
    const [editando, setEditando] = useState<number | null>(null);  // id_cuenta | 0 = nueva | null = cerrado
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setCuentas(proveedor?.cuentas || []);
        setEditando(null);
        setError('');
    }, [proveedor]);

    const actualizar = (lista: Cuenta[]) => { setCuentas(lista); onCambio(lista); };

    const abrir = (c: Cuenta | null) => {
        setError('');
        setEditando(c ? c.id_cuenta : 0);
        setForm(c ? {
            banco: c.banco, tipo_cuenta: c.tipo_cuenta, numero_cuenta: c.numero_cuenta, rut_titular: c.rut_titular,
            nombre_titular: c.nombre_titular || '', correo: c.correo || '',
        } : { ...vacio, rut_titular: proveedor?.rut || '', nombre_titular: proveedor?.nombre || '', correo: proveedor?.correo || '' });
    };

    const guardar = async () => {
        if (!proveedor) return;
        if (!form.banco.trim() || !form.numero_cuenta.trim() || !form.rut_titular.trim()) {
            setError('Banco, N° de cuenta y RUT del titular son obligatorios.'); return;
        }
        if (!rutValido(form.rut_titular)) { setError('El RUT del titular no es válido.'); return; }
        setGuardando(true);
        setError('');
        try {
            const body = { ...form, rut_titular: normalizarRut(form.rut_titular), activo: true };
            const base = `/ops/proveedores/${proveedor.id_proveedor}/cuentas`;
            if (editando) {
                const res = await api.put(`${base}/${editando}`, body);
                actualizar(cuentas.map(c => c.id_cuenta === editando ? res.data : c));
            } else {
                const res = await api.post(base, body);
                actualizar([...cuentas, res.data]);
            }
            setEditando(null);
        } catch (e) {
            setError(mensajeError(e, 'No se pudo guardar la cuenta.'));
        } finally {
            setGuardando(false);
        }
    };

    const eliminar = async (c: Cuenta) => {
        if (!proveedor || !window.confirm(`¿Eliminar la cuenta ${c.banco} N° ${c.numero_cuenta}?`)) return;
        try {
            await api.delete(`/ops/proveedores/${proveedor.id_proveedor}/cuentas/${c.id_cuenta}`);
            actualizar(cuentas.filter(x => x.id_cuenta !== c.id_cuenta));
        } catch (e) {
            setError(mensajeError(e, 'No se pudo eliminar la cuenta.'));
        }
    };

    return (
        <Modal isOpen={!!proveedor} onClose={onCerrar} title={`Cuentas bancarias · ${proveedor?.nombre || ''}`} maxWidth="max-w-2xl">
            <div className="space-y-3">
                {cuentas.length === 0 && editando === null && (
                    <p className="text-sm text-gray-400 text-center py-6">Este proveedor aún no tiene cuentas bancarias.</p>
                )}
                {cuentas.map(c => (
                    <div key={c.id_cuenta} className="flex items-start gap-3 border border-gray-100 rounded-xl p-3">
                        <Landmark size={18} className="text-gray-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0 text-sm">
                            <p className="font-bold text-gray-800">{c.banco} · {c.tipo_cuenta} N° {c.numero_cuenta}</p>
                            <p className="text-gray-500 text-xs">{c.nombre_titular || '—'} · RUT {c.rut_titular}{c.correo ? ` · ${c.correo}` : ''}</p>
                        </div>
                        <button onClick={() => abrir(c)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-50" title="Editar"><Pencil size={15} /></button>
                        <button onClick={() => eliminar(c)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Eliminar"><Trash2 size={15} /></button>
                    </div>
                ))}

                {editando !== null ? (
                    <div className="border border-primary/20 bg-primary/5 rounded-xl p-3 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-gray-700">{editando ? 'Editar cuenta' : 'Nueva cuenta'}</p>
                            <button onClick={() => setEditando(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className={labelCls}>Banco *</label>
                                <input className={inputCls} value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} placeholder="BancoEstado" />
                            </div>
                            <div>
                                <label className={labelCls}>Tipo de cuenta *</label>
                                <select className={inputCls} value={form.tipo_cuenta} onChange={e => setForm({ ...form, tipo_cuenta: e.target.value })}>
                                    {TIPOS_CUENTA.map(t => <option key={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>N° de cuenta *</label>
                                <input className={inputCls} value={form.numero_cuenta} onChange={e => setForm({ ...form, numero_cuenta: e.target.value })} />
                            </div>
                            <div>
                                <label className={labelCls}>RUT titular *</label>
                                <input className={inputCls} value={form.rut_titular} onChange={e => setForm({ ...form, rut_titular: e.target.value })}
                                    onBlur={() => setForm(f => ({ ...f, rut_titular: normalizarRut(f.rut_titular) }))} />
                            </div>
                            <div>
                                <label className={labelCls}>Nombre titular</label>
                                <input className={inputCls} value={form.nombre_titular} onChange={e => setForm({ ...form, nombre_titular: e.target.value })} />
                            </div>
                            <div>
                                <label className={labelCls}>E-mail</label>
                                <input className={inputCls} type="email" value={form.correo} onChange={e => setForm({ ...form, correo: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button onClick={guardar} disabled={guardando}
                                className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                                {guardando && <Loader2 size={14} className="animate-spin" />} Guardar cuenta
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => abrir(null)} className="w-full border border-dashed border-gray-300 rounded-xl py-2.5 text-sm font-semibold text-gray-500 hover:border-primary hover:text-primary flex items-center justify-center gap-2">
                        <Plus size={15} /> Agregar cuenta
                    </button>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
        </Modal>
    );
}
