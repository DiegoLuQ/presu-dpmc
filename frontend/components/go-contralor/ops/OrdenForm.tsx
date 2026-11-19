'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle, ArrowLeft, Ban, CheckCircle2, Download, Landmark, Loader2, Plus, Printer, Save, Send, Split, Trash2,
} from 'lucide-react';
import api from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import Modal from '@/components/ui/Modal';
import { CuentasModal, ProveedorModal } from './ProveedorModal';
import {
    Area, BadgeEstado, Colegio, ConfigOps, Item, MEDIOS, OrdenDetalle, Pago, Proveedor,
    abrirPdf, calcularTotales, dividirCuotas, formatCLP, formatFecha, hoyISO, inputCls, labelCls,
    mensajeError, totalItem, useAccesoOps,
} from './comun';

type TipoDoc = 'FACTURA' | 'BOLETA';

const itemVacio = (): Item => ({ cantidad: null, detalle: '', valor_unitario: 0 });
const pagoVacio = (monto = 0): Pago => ({ monto, fecha_pago: null, medio: 'CHEQUE', nro_cheque: null });

/** Crear (orden = null) o ver/editar una Orden de Pago de Servicio. */
export default function OrdenForm({ orden: inicial }: { orden: OrdenDetalle | null }) {
    const router = useRouter();
    const { user, colegioActivo } = useAuth();
    const { puedeCrear, puedeEditar, puedeAnular } = useAccesoOps();

    const [orden, setOrden] = useState<OrdenDetalle | null>(inicial);
    const soloLectura = !!orden && orden.estado !== 'BORRADOR' || (!orden && !puedeCrear) || (!!orden && !puedeEditar);

    const [colegios, setColegios] = useState<Colegio[]>([]);
    const [areas, setAreas] = useState<Area[]>([]);
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [config, setConfig] = useState<ConfigOps | null>(null);

    const [idColegio, setIdColegio] = useState<number>(inicial?.id_colegio || Number(colegioActivo || user?.id_colegio || 0));
    const [fecha, setFecha] = useState(inicial?.fecha_emision || hoyISO());
    const [tipoOrden, setTipoOrden] = useState<'SERVICIO' | 'COMPRA'>(inicial?.tipo_orden || 'SERVICIO');
    const [tipoDoc, setTipoDoc] = useState<TipoDoc>(inicial?.tipo_documento || 'FACTURA');
    const [idProveedor, setIdProveedor] = useState<number>(inicial?.id_proveedor || 0);
    const [idArea, setIdArea] = useState<number>(inicial?.id_area || 0);
    const [items, setItems] = useState<Item[]>(inicial?.items.length ? inicial.items : [itemVacio()]);
    const [descuento, setDescuento] = useState<number>(inicial?.descuento_monto || 0);
    const [pagos, setPagos] = useState<Pago[]>(inicial?.pagos.length ? inicial.pagos : [pagoVacio()]);
    const [pagosTocados, setPagosTocados] = useState(!!inicial);
    const [formaPago, setFormaPago] = useState<string>(inicial?.forma_pago || '');
    const [idCuenta, setIdCuenta] = useState<number>(inicial?.id_cuenta || 0);
    const [observacion, setObservacion] = useState(inicial?.observacion || '');

    const [guardando, setGuardando] = useState<'' | 'guardar' | 'emitir' | 'anular'>('');
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    const [modalProv, setModalProv] = useState(false);
    const [cuentasDe, setCuentasDe] = useState<Proveedor | null>(null);
    const [anulando, setAnulando] = useState(false);
    const [motivo, setMotivo] = useState('');

    useEffect(() => {
        api.get('/catalogos/colegios').then(r => setColegios(r.data || [])).catch(() => setColegios([]));
        api.get('/catalogos/areas').then(r => setAreas((r.data || []).sort((a: Area, b: Area) => a.nombre.localeCompare(b.nombre)))).catch(() => setAreas([]));
    }, []);

    const cargarProveedores = useCallback(async () => {
        try {
            const r = await api.get('/ops/proveedores', { params: { incluir_inactivos: !!inicial } });
            setProveedores(r.data || []);
        } catch { setProveedores([]); }
    }, [inicial]);
    useEffect(() => { cargarProveedores(); }, [cargarProveedores]);

    useEffect(() => {
        if (!idColegio) return;
        api.get('/ops/config', { params: { id_colegio: idColegio } }).then(r => setConfig(r.data)).catch(() => setConfig(null));
    }, [idColegio]);

    useEffect(() => {
        if (!idColegio && colegios.length === 1) setIdColegio(colegios[0].id_colegio);
    }, [colegios, idColegio]);

    const proveedor = proveedores.find(p => p.id_proveedor === idProveedor) || null;
    const cuentasProv = proveedor?.cuentas.filter(c => c.activo || c.id_cuenta === idCuenta) || [];

    // % de la orden guardada si es solo lectura; si no, los vigentes de la configuración
    const ivaPct = soloLectura ? (orden?.iva_pct ?? config?.iva_pct ?? 19) : (config?.iva_pct ?? 19);
    const retPct = soloLectura ? (orden?.retencion_pct ?? config?.retencion_pct ?? 15.25) : (config?.retencion_pct ?? 15.25);
    const tot = useMemo(() => calcularTotales(tipoDoc, items, descuento, ivaPct, retPct), [tipoDoc, items, descuento, ivaPct, retPct]);

    // Con una sola cuota sin tocar, sigue al total automáticamente
    useEffect(() => {
        if (soloLectura || pagosTocados) return;
        setPagos(ps => ps.length === 1 ? [{ ...ps[0], monto: tot.total }] : ps);
    }, [tot.total, pagosTocados, soloLectura]);

    const sumaPagos = pagos.reduce((s, p) => s + (p.monto || 0), 0);
    const difPagos = sumaPagos - tot.total;

    const setItem = (i: number, cambios: Partial<Item>) => setItems(its => its.map((it, k) => k === i ? { ...it, ...cambios } : it));
    const setPago = (i: number, cambios: Partial<Pago>) => { setPagosTocados(true); setPagos(ps => ps.map((p, k) => k === i ? { ...p, ...cambios } : p)); };

    const repartir = (n: number) => {
        if (n < 1) return;
        setPagosTocados(true);
        const montos = dividirCuotas(tot.total, n);
        setPagos(ps => montos.map((m, i) => ({ ...(ps[i] || pagoVacio()), monto: m })));
    };

    const payload = () => ({
        id_colegio: idColegio,
        fecha_emision: fecha,
        id_proveedor: idProveedor,
        id_area: idArea || null,
        tipo_orden: tipoOrden,
        tipo_documento: tipoDoc,
        descuento_monto: descuento || 0,
        forma_pago: formaPago || null,
        observacion: observacion || null,
        id_cuenta: idCuenta || null,
        items: items.filter(i => i.detalle.trim()).map(i => ({ cantidad: i.cantidad || null, detalle: i.detalle, valor_unitario: i.valor_unitario || 0 })),
        pagos: pagos.filter(p => p.monto > 0).map(p => ({ monto: p.monto, fecha_pago: p.fecha_pago || null, medio: p.medio, nro_cheque: p.nro_cheque || null })),
    });

    const validar = (): string => {
        if (!idColegio) return 'Selecciona el colegio que emite la orden.';
        if (!idProveedor) return 'Selecciona el proveedor.';
        if (!items.some(i => i.detalle.trim())) return 'Agrega al menos una línea de detalle.';
        if (tot.total <= 0) return 'El total a pagar debe ser mayor que cero.';
        return '';
    };

    const guardar = async (emitir: boolean) => {
        const msg = validar();
        if (msg) { setError(msg); return; }
        if (emitir && !window.confirm('Al emitir la orden ya no se podrá editar, quedará firmada a tu nombre y se registrará en la base central de órdenes (cuenta en la ejecución presupuestaria). ¿Continuar?')) return;
        setGuardando(emitir ? 'emitir' : 'guardar');
        setError('');
        setAviso('');
        try {
            let res = orden
                ? await api.put(`/ops/ordenes/${orden.id_ops}`, payload())
                : await api.post('/ops/ordenes', payload());
            if (emitir) res = await api.post(`/ops/ordenes/${res.data.id_ops}/emitir`);
            const nueva: OrdenDetalle = res.data;
            setOrden(nueva);
            setPagos(nueva.pagos);
            setAviso(emitir ? `OPS N° ${nueva.numero_ops} emitida.` : `OPS N° ${nueva.numero_ops} guardada como borrador.`);
            if (!orden) router.replace(`/go-contralor/ops/${nueva.id_ops}`);
        } catch (e) {
            setError(mensajeError(e, 'No se pudo guardar la orden.'));
        } finally {
            setGuardando('');
        }
    };

    const anular = async () => {
        if (!orden || !motivo.trim()) return;
        setGuardando('anular');
        try {
            const res = await api.post(`/ops/ordenes/${orden.id_ops}/anular`, { motivo });
            setOrden(res.data);
            setAnulando(false);
            setAviso(`OPS N° ${res.data.numero_ops} anulada.`);
        } catch (e) {
            setError(mensajeError(e, 'No se pudo anular la orden.'));
        } finally {
            setGuardando('');
        }
    };

    const pdf = async (descargar: boolean) => {
        if (!orden) return;
        try { await abrirPdf(orden.id_ops, orden.numero_ops, descargar); }
        catch (e) { setError(mensajeError(e, 'No se pudo generar el PDF.')); }
    };

    const colegioNombre = colegios.find(c => c.id_colegio === idColegio)?.nombre;
    const card = 'bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]';
    const alertas = orden?.estado !== 'ANULADA' ? orden?.alertas || [] : [];

    return (
        <div className="animate-in fade-in duration-500 space-y-6 pb-12">
            {/* Encabezado */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link href="/go-contralor/ops" className="text-xs font-semibold text-gray-400 hover:text-primary flex items-center gap-1 mb-1">
                        <ArrowLeft size={13} /> Órdenes de Pago
                    </Link>
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-3">
                        {orden ? `OPS N° ${orden.numero_ops}` : 'Nueva Orden de Pago'}
                        {orden && <BadgeEstado estado={orden.estado} />}
                    </h1>
                    <p className="text-sm text-gray-500">
                        {orden
                            ? `${orden.colegio || ''}${orden.firmante_nombre ? ` · Emitida por ${orden.firmante_nombre}` : ''}`
                            : `El N° se asigna al guardar${config ? ` (siguiente: ${config.siguiente_numero})` : ''}.`}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {orden && (
                        <>
                            <button onClick={() => pdf(false)} className="px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Printer size={15} /> Ver / Imprimir</button>
                            <button onClick={() => pdf(true)} className="px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Download size={15} /> PDF</button>
                        </>
                    )}
                    {orden && orden.estado !== 'ANULADA' && puedeAnular && (
                        <button onClick={() => { setMotivo(''); setAnulando(true); }} className="px-3 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-2"><Ban size={15} /> Anular</button>
                    )}
                </div>
            </div>

            {aviso && <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-xl px-4 py-3"><CheckCircle2 size={16} /> {aviso}</div>}
            {orden?.estado === 'ANULADA' && (
                <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3"><b>Anulada</b>{orden.fecha_anulada ? ` el ${formatFecha(orden.fecha_anulada)}` : ''}: {orden.motivo_anulacion}</div>
            )}
            {alertas.length > 0 && (
                <div className="bg-amber-50 text-amber-800 text-sm rounded-xl px-4 py-3 space-y-1">
                    {alertas.map(a => <p key={a.codigo} className="flex items-center gap-2"><AlertTriangle size={14} className="shrink-0" /> {a.mensaje}</p>)}
                </div>
            )}

            <fieldset disabled={soloLectura} className="space-y-6">
                {/* Datos generales */}
                <div className={card}>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className={labelCls}>Colegio / Fundación *</label>
                            <select className={inputCls} value={idColegio || ''} disabled={!!orden} onChange={e => setIdColegio(Number(e.target.value))}>
                                <option value="">Seleccionar…</option>
                                {colegios.map(c => <option key={c.id_colegio} value={c.id_colegio}>{c.nombre}</option>)}
                            </select>
                            {config?.razon_social && config.razon_social !== colegioNombre && <p className="text-[11px] text-gray-400 mt-1">{config.razon_social}</p>}
                        </div>
                        <div>
                            <label className={labelCls}>Fecha de emisión *</label>
                            <input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} />
                        </div>
                        <div>
                            <label className={labelCls}>Tipo de orden</label>
                            <select className={inputCls} value={tipoOrden} onChange={e => setTipoOrden(e.target.value as 'SERVICIO' | 'COMPRA')}>
                                <option value="SERVICIO">Servicio</option>
                                <option value="COMPRA">Compra</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Documento *</label>
                            <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1">
                                {(['FACTURA', 'BOLETA'] as TipoDoc[]).map(t => (
                                    <button key={t} type="button" onClick={() => setTipoDoc(t)}
                                        className={`py-1.5 rounded-lg text-xs font-bold ${tipoDoc === t ? 'bg-white shadow text-primary' : 'text-gray-500'}`}>
                                        {t === 'FACTURA' ? 'Factura' : 'Boleta honorarios'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelCls}>Proveedor *</label>
                            <div className="flex gap-2">
                                <select className={inputCls} value={idProveedor || ''} onChange={e => { setIdProveedor(Number(e.target.value)); setIdCuenta(0); }}>
                                    <option value="">Seleccionar…</option>
                                    {proveedores.filter(p => p.activo || p.id_proveedor === idProveedor).map(p => (
                                        <option key={p.id_proveedor} value={p.id_proveedor}>{p.nombre} · {p.rut}</option>
                                    ))}
                                </select>
                                {!soloLectura && (
                                    <button type="button" onClick={() => setModalProv(true)} title="Nuevo proveedor"
                                        className="px-3 rounded-xl border border-gray-200 text-gray-500 hover:text-primary hover:border-primary"><Plus size={16} /></button>
                                )}
                            </div>
                            {proveedor && <p className="text-[11px] text-gray-400 mt-1">{[proveedor.direccion, proveedor.telefono, proveedor.correo].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</p>}
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelCls}>Área solicitante</label>
                            <select className={inputCls} value={idArea || ''} onChange={e => setIdArea(Number(e.target.value))}>
                                <option value="">Sin área</option>
                                {areas.map(a => <option key={a.id_area} value={a.id_area}>{a.nombre}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Detalle */}
                <div className={card}>
                    <h2 className="text-sm font-bold text-gray-800 mb-3">Detalle</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="text-xs text-gray-500">
                                <tr>
                                    <th className="text-left font-semibold pb-2 w-24">Cantidad</th>
                                    <th className="text-left font-semibold pb-2">Descripción</th>
                                    <th className="text-right font-semibold pb-2 w-40">Unitario</th>
                                    <th className="text-right font-semibold pb-2 w-36">Total</th>
                                    <th className="w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((it, i) => (
                                    <tr key={i} className="align-top">
                                        <td className="pr-2 pb-2">
                                            <input type="number" min={0} step="any" className={inputCls} placeholder="—" value={it.cantidad ?? ''}
                                                onChange={e => setItem(i, { cantidad: e.target.value === '' ? null : Number(e.target.value) })} />
                                        </td>
                                        <td className="pr-2 pb-2">
                                            <textarea rows={Math.min(4, Math.max(1, it.detalle.split('\n').length))} className={`${inputCls} resize-y`} value={it.detalle}
                                                placeholder="Descripción del servicio o producto" onChange={e => setItem(i, { detalle: e.target.value })} />
                                        </td>
                                        <td className="pr-2 pb-2">
                                            <input type="number" min={0} className={`${inputCls} text-right`} value={it.valor_unitario || ''}
                                                onChange={e => setItem(i, { valor_unitario: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                                        </td>
                                        <td className="pb-2 text-right font-semibold text-gray-800 pt-2">{formatCLP(totalItem(it))}</td>
                                        <td className="pb-2 text-right">
                                            {!soloLectura && items.length > 1 && (
                                                <button type="button" onClick={() => setItems(its => its.filter((_, k) => k !== i))}
                                                    className="p-1.5 mt-0.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!soloLectura && (
                        <button type="button" onClick={() => setItems(its => [...its, itemVacio()])}
                            className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"><Plus size={14} /> Agregar línea</button>
                    )}

                    <div className="mt-4 ml-auto max-w-sm space-y-1.5 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">{tipoDoc === 'FACTURA' ? 'Total neto' : 'Total bruto'}</span><span className="font-semibold">{formatCLP(tot.base)}</span></div>
                        <div className="flex justify-between items-center gap-3">
                            <span className="text-gray-500">Descuento</span>
                            <input type="number" min={0} className="w-36 border border-gray-200 rounded-lg px-2 py-1 text-right text-sm" value={descuento || ''}
                                placeholder="0" onChange={e => setDescuento(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
                        </div>
                        {tipoDoc === 'FACTURA'
                            ? <div className="flex justify-between"><span className="text-gray-500">IVA {ivaPct}%</span><span className="font-semibold">{formatCLP(tot.iva)}</span></div>
                            : <div className="flex justify-between"><span className="text-gray-500">Impuesto retenido {retPct}%</span><span className="font-semibold">−{formatCLP(tot.retencion)}</span></div>}
                        <div className="flex justify-between border-t border-gray-100 pt-2 text-base"><span className="font-bold text-gray-800">Total a pagar</span><span className="font-extrabold text-gray-900">{formatCLP(tot.total)}</span></div>
                    </div>
                </div>

                {/* Pago */}
                <div className={card}>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <h2 className="text-sm font-bold text-gray-800">Pago en cuotas</h2>
                        {!soloLectura && (
                            <div className="flex items-center gap-2 text-sm">
                                <Split size={14} className="text-gray-400" />
                                <span className="text-gray-500">Repartir total en</span>
                                {[1, 2, 3, 4].map(n => (
                                    <button key={n} type="button" onClick={() => repartir(n)}
                                        className={`w-8 h-8 rounded-lg text-xs font-bold border ${pagos.length === n ? 'border-primary text-primary bg-primary/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{n}</button>
                                ))}
                                <span className="text-gray-500">cuotas</span>
                            </div>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="text-xs text-gray-500">
                                <tr>
                                    <th className="text-left font-semibold pb-2 w-10">N°</th>
                                    <th className="text-right font-semibold pb-2 w-40">Valor</th>
                                    <th className="text-right font-semibold pb-2 w-16">%</th>
                                    <th className="text-left font-semibold pb-2 pl-3">Fecha de pago</th>
                                    <th className="text-left font-semibold pb-2">Medio</th>
                                    <th className="text-left font-semibold pb-2">N° cheque</th>
                                    <th className="w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {pagos.map((p, i) => (
                                    <tr key={i}>
                                        <td className="pb-2 text-gray-500 font-semibold">{i + 1}</td>
                                        <td className="pb-2 pr-2"><input type="number" min={0} className={`${inputCls} text-right`} value={p.monto || ''}
                                            onChange={e => setPago(i, { monto: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></td>
                                        <td className="pb-2 text-right text-gray-500">{tot.total ? `${Math.round(p.monto / tot.total * 1000) / 10}%` : '—'}</td>
                                        <td className="pb-2 pl-3 pr-2"><input type="date" className={inputCls} value={p.fecha_pago || ''} onChange={e => setPago(i, { fecha_pago: e.target.value || null })} /></td>
                                        <td className="pb-2 pr-2">
                                            <select className={inputCls} value={p.medio} onChange={e => setPago(i, { medio: e.target.value })}>
                                                {MEDIOS.map(m => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
                                            </select>
                                        </td>
                                        <td className="pb-2 pr-2"><input className={inputCls} value={p.nro_cheque || ''} disabled={p.medio !== 'CHEQUE' || soloLectura}
                                            onChange={e => setPago(i, { nro_cheque: e.target.value })} /></td>
                                        <td className="pb-2 text-right">
                                            {!soloLectura && pagos.length > 1 && (
                                                <button type="button" onClick={() => { setPagosTocados(true); setPagos(ps => ps.filter((_, k) => k !== i)); }}
                                                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        {!soloLectura ? (
                            <button type="button" onClick={() => { setPagosTocados(true); setPagos(ps => [...ps, pagoVacio(Math.max(0, -difPagos))]); }}
                                className="font-semibold text-primary hover:underline flex items-center gap-1"><Plus size={14} /> Agregar cuota</button>
                        ) : <span />}
                        <span className={Math.abs(difPagos) > 2 ? 'text-amber-600 font-semibold flex items-center gap-1' : 'text-gray-500'}>
                            {Math.abs(difPagos) > 2 && <AlertTriangle size={14} />}
                            Cuotas: {formatCLP(sumaPagos)}{difPagos !== 0 && ` (diferencia ${formatCLP(difPagos)})`}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 pt-4 border-t border-gray-50">
                        <div>
                            <label className={labelCls}>Forma de pago</label>
                            <div className="flex gap-4 text-sm pt-2">
                                {[['', 'Sin marcar'], ['CONTADO', 'Contado'], ['ANTICIPO', 'Anticipo']].map(([v, l]) => (
                                    <label key={v} className="flex items-center gap-1.5"><input type="radio" checked={formaPago === v} onChange={() => setFormaPago(v)} /> {l}</label>
                                ))}
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelCls}>Observación</label>
                            <input className={inputCls} value={observacion} maxLength={300} placeholder="Ej: PAGO A PROVEEDOR" onChange={e => setObservacion(e.target.value)} />
                        </div>
                    </div>
                </div>

                {/* Datos bancarios */}
                <div className={card}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Landmark size={16} className="text-gray-400" /> Datos para transferencia</h2>
                        {proveedor && !soloLectura && (
                            <button type="button" onClick={() => setCuentasDe(proveedor)} className="text-sm font-semibold text-primary hover:underline">Gestionar cuentas del proveedor</button>
                        )}
                    </div>
                    {soloLectura ? (
                        orden?.cuenta ? (
                            <p className="text-sm text-gray-700">{orden.cuenta.banco} · {orden.cuenta.tipo} N° {orden.cuenta.numero} · {orden.cuenta.titular} (RUT {orden.cuenta.rut}){orden.cuenta.correo ? ` · ${orden.cuenta.correo}` : ''}</p>
                        ) : <p className="text-sm text-gray-400">Sin cuenta bancaria.</p>
                    ) : !proveedor ? (
                        <p className="text-sm text-gray-400">Selecciona primero el proveedor.</p>
                    ) : (
                        <select className={inputCls} value={idCuenta || ''} onChange={e => setIdCuenta(Number(e.target.value))}>
                            <option value="">Sin cuenta (pago con cheque)</option>
                            {cuentasProv.map(c => <option key={c.id_cuenta} value={c.id_cuenta}>{c.banco} · {c.tipo_cuenta} N° {c.numero_cuenta} · {c.nombre_titular || c.rut_titular}</option>)}
                        </select>
                    )}
                </div>
            </fieldset>

            {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}

            {!soloLectura && (
                <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={() => guardar(false)} disabled={!!guardando}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2">
                        {guardando === 'guardar' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar borrador
                    </button>
                    <button onClick={() => guardar(true)} disabled={!!guardando}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                        {guardando === 'emitir' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Guardar y emitir
                    </button>
                </div>
            )}

            <ProveedorModal abierto={modalProv} proveedor={null} onCerrar={() => setModalProv(false)}
                onGuardado={p => { setModalProv(false); setProveedores(ps => [...ps, p].sort((a, b) => a.nombre.localeCompare(b.nombre))); setIdProveedor(p.id_proveedor); setIdCuenta(0); }} />
            <CuentasModal proveedor={cuentasDe} onCerrar={() => setCuentasDe(null)}
                onCambio={cuentas => setProveedores(ps => ps.map(p => p.id_proveedor === cuentasDe?.id_proveedor ? { ...p, cuentas } : p))} />
            <Modal isOpen={anulando} onClose={() => setAnulando(false)} title={`Anular OPS N° ${orden?.numero_ops ?? ''}`}>
                <div className="space-y-3">
                    <p className="text-sm text-gray-500">La orden queda registrada como anulada y su número no se reutiliza.</p>
                    <div>
                        <label className={labelCls}>Motivo *</label>
                        <textarea className={inputCls} rows={3} value={motivo} maxLength={300} onChange={e => setMotivo(e.target.value)} />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setAnulando(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancelar</button>
                        <button onClick={anular} disabled={!motivo.trim() || guardando === 'anular'}
                            className="px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                            {guardando === 'anular' && <Loader2 size={14} className="animate-spin" />} Anular orden
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
