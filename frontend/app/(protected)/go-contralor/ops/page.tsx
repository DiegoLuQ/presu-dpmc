'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Loader2, Plus, Printer, Receipt, Search, Settings, Truck } from 'lucide-react';
import api from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import Modal from '@/components/ui/Modal';
import {
    BadgeEstado, Colegio, ConfigOps, OrdenResumen, SinAccesoOps, abrirPdf, formatCLP, formatFecha,
    inputCls, labelCls, mensajeError, useAccesoOps,
} from '@/components/go-contralor/ops/comun';

/** GO-Contralor › Órdenes de Pago de Servicio (OPS). */
export default function OpsListaPage() {
    const { user, colegioActivo } = useAuth();
    const { isLoading, puedeVer, puedeCrear, puedeEditar } = useAccesoOps();

    const [colegios, setColegios] = useState<Colegio[]>([]);
    const [colegioId, setColegioId] = useState<string>(() => String(colegioActivo || user?.id_colegio || ''));
    const [estado, setEstado] = useState('');
    const [tipoDoc, setTipoDoc] = useState('');
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');
    const [q, setQ] = useState('');

    const [ordenes, setOrdenes] = useState<OrdenResumen[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [configAbierta, setConfigAbierta] = useState(false);

    useEffect(() => {
        api.get('/catalogos/colegios').then(r => setColegios(r.data || [])).catch(() => setColegios([]));
    }, []);

    const cargar = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get('/ops/ordenes', {
                params: {
                    id_colegio: colegioId || undefined, estado: estado || undefined, tipo_documento: tipoDoc || undefined,
                    desde: desde || undefined, hasta: hasta || undefined, q: q.trim() || undefined,
                },
            });
            setOrdenes(res.data || []);
        } catch (e) {
            setError(mensajeError(e, 'No se pudieron cargar las órdenes.'));
        } finally {
            setLoading(false);
        }
    }, [colegioId, estado, tipoDoc, desde, hasta, q]);

    useEffect(() => {
        if (isLoading || !puedeVer) return;
        const t = setTimeout(cargar, 250);
        return () => clearTimeout(t);
    }, [cargar, isLoading, puedeVer]);

    const vigentes = useMemo(() => ordenes.filter(o => o.estado !== 'ANULADA'), [ordenes]);
    const totalVigente = vigentes.reduce((s, o) => s + o.total_pagar, 0);
    const totalEmitido = ordenes.filter(o => o.estado === 'EMITIDA').reduce((s, o) => s + o.total_pagar, 0);
    const nBorradores = ordenes.filter(o => o.estado === 'BORRADOR').length;

    const pdf = async (o: OrdenResumen, descargar: boolean) => {
        try { await abrirPdf(o.id_ops, o.numero_ops, descargar); }
        catch (e) { setError(mensajeError(e, 'No se pudo generar el PDF.')); }
    };

    if (isLoading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" /></div>;
    if (!puedeVer) return <SinAccesoOps />;

    const mostrarColegio = !colegioId && colegios.length > 1;

    return (
        <div className="animate-in fade-in duration-500 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><Receipt className="text-primary" /> Órdenes de Pago de Servicio</h1>
                    <p className="text-sm text-gray-500">Crea, emite e imprime las OPS. El N° es correlativo por colegio y no se reinicia con el año.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href="/go-contralor/ops/proveedores" className="px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        <Truck size={16} /> Proveedores
                    </Link>
                    {puedeEditar && (
                        <button onClick={() => setConfigAbierta(true)} className="px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                            <Settings size={16} /> Configuración
                        </button>
                    )}
                    {puedeCrear && (
                        <Link href="/go-contralor/ops/nueva" className="px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 flex items-center gap-2">
                            <Plus size={16} /> Nueva OPS
                        </Link>
                    )}
                </div>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    ['Órdenes vigentes', String(vigentes.length), `${nBorradores} en borrador`],
                    ['Total vigente', formatCLP(totalVigente), 'Emitidas + borradores'],
                    ['Total emitido', formatCLP(totalEmitido), 'Solo órdenes emitidas'],
                ].map(([t, v, d]) => (
                    <div key={t} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
                        <p className="text-xs font-semibold text-gray-500">{t}</p>
                        <p className="text-2xl font-extrabold text-gray-900 mt-1 tracking-tight">{v}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{d}</p>
                    </div>
                ))}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3">
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input className={`${inputCls} pl-9`} placeholder="N°, proveedor, RUT o detalle" value={q} onChange={e => setQ(e.target.value)} />
                </div>
                <select className={`${inputCls} w-auto`} value={colegioId} onChange={e => setColegioId(e.target.value)}>
                    <option value="">Todos los colegios</option>
                    {colegios.map(c => <option key={c.id_colegio} value={c.id_colegio}>{c.nombre}</option>)}
                </select>
                <select className={`${inputCls} w-auto`} value={estado} onChange={e => setEstado(e.target.value)}>
                    <option value="">Todos los estados</option>
                    <option value="BORRADOR">Borrador</option>
                    <option value="EMITIDA">Emitida</option>
                    <option value="ANULADA">Anulada</option>
                </select>
                <select className={`${inputCls} w-auto`} value={tipoDoc} onChange={e => setTipoDoc(e.target.value)}>
                    <option value="">Factura y boleta</option>
                    <option value="FACTURA">Factura</option>
                    <option value="BOLETA">Boleta honorarios</option>
                </select>
                <input type="date" className={`${inputCls} w-auto`} value={desde} onChange={e => setDesde(e.target.value)} title="Desde" />
                <input type="date" className={`${inputCls} w-auto`} value={hasta} onChange={e => setHasta(e.target.value)} title="Hasta" />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                        <tr>
                            <th className="text-left px-4 py-3">N°</th>
                            <th className="text-left px-4 py-3">Fecha</th>
                            {mostrarColegio && <th className="text-left px-4 py-3">Colegio</th>}
                            <th className="text-left px-4 py-3">Proveedor</th>
                            <th className="text-left px-4 py-3">Área</th>
                            <th className="text-left px-4 py-3">Doc.</th>
                            <th className="text-right px-4 py-3">Total a pagar</th>
                            <th className="text-center px-4 py-3">Estado</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr><td colSpan={9} className="py-12 text-center text-gray-400"><Loader2 className="animate-spin inline" /></td></tr>
                        ) : ordenes.length === 0 ? (
                            <tr><td colSpan={9} className="py-12 text-center text-gray-400">
                                <FileText className="inline mb-2 text-gray-300" size={28} /><br />No hay órdenes de pago con estos filtros.
                            </td></tr>
                        ) : ordenes.map(o => (
                            <tr key={o.id_ops} className={`hover:bg-gray-50/60 ${o.estado === 'ANULADA' ? 'text-gray-400' : ''}`}>
                                <td className="px-4 py-3 font-bold text-gray-900">
                                    <Link href={`/go-contralor/ops/${o.id_ops}`} className="hover:text-primary">{o.numero_ops}</Link>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">{formatFecha(o.fecha_emision)}</td>
                                {mostrarColegio && <td className="px-4 py-3 text-xs">{o.colegio}</td>}
                                <td className="px-4 py-3">
                                    <p className="font-semibold text-gray-800">{o.proveedor}</p>
                                    <p className="text-[11px] text-gray-400 font-mono">{o.rut_proveedor}</p>
                                </td>
                                <td className="px-4 py-3 text-xs">{o.area || '—'}</td>
                                <td className="px-4 py-3 text-xs">{o.tipo_documento === 'FACTURA' ? 'Factura' : 'Boleta'}</td>
                                <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{formatCLP(o.total_pagar)}</td>
                                <td className="px-4 py-3 text-center"><BadgeEstado estado={o.estado} /></td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                    <button onClick={() => pdf(o, false)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100" title="Ver / imprimir"><Printer size={15} /></button>
                                    <button onClick={() => pdf(o, true)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100" title="Descargar PDF"><Download size={15} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <ConfigModal abierto={configAbierta} colegios={colegios} idInicial={Number(colegioId) || colegios[0]?.id_colegio || 0}
                onCerrar={() => setConfigAbierta(false)} />
        </div>
    );
}

/** % IVA, % retención boleta de honorarios, siguiente N° y razón social, por colegio. */
function ConfigModal({ abierto, colegios, idInicial, onCerrar }: {
    abierto: boolean; colegios: Colegio[]; idInicial: number; onCerrar: () => void;
}) {
    const [idColegio, setIdColegio] = useState(idInicial);
    const [cfg, setCfg] = useState<ConfigOps | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const [ok, setOk] = useState(false);

    useEffect(() => { if (abierto) setIdColegio(idInicial); }, [abierto, idInicial]);
    useEffect(() => {
        if (!abierto || !idColegio) return;
        setCfg(null);
        setError('');
        setOk(false);
        api.get('/ops/config', { params: { id_colegio: idColegio } })
            .then(r => setCfg(r.data))
            .catch(e => setError(mensajeError(e, 'No se pudo cargar la configuración.')));
    }, [abierto, idColegio]);

    const guardar = async () => {
        if (!cfg) return;
        setGuardando(true);
        setError('');
        setOk(false);
        try {
            const res = await api.put('/ops/config', {
                iva_pct: cfg.iva_pct, retencion_pct: cfg.retencion_pct,
                siguiente_numero: cfg.siguiente_numero, razon_social: cfg.razon_social,
            }, { params: { id_colegio: idColegio } });
            setCfg(res.data);
            setOk(true);
        } catch (e) {
            setError(mensajeError(e, 'No se pudo guardar la configuración.'));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal isOpen={abierto} onClose={onCerrar} title="Configuración de Órdenes de Pago">
            <div className="space-y-4">
                <div>
                    <label className={labelCls}>Colegio</label>
                    <select className={inputCls} value={idColegio || ''} onChange={e => setIdColegio(Number(e.target.value))}>
                        {colegios.map(c => <option key={c.id_colegio} value={c.id_colegio}>{c.nombre}</option>)}
                    </select>
                </div>
                {!cfg ? (
                    <div className="flex justify-center py-6 text-gray-400">{error ? null : <Loader2 className="animate-spin" />}</div>
                ) : (
                    <>
                        <div>
                            <label className={labelCls}>Razón social (aparece en el PDF)</label>
                            <input className={inputCls} value={cfg.razon_social} onChange={e => setCfg({ ...cfg, razon_social: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>IVA factura (%)</label>
                                <input type="number" min={0} max={100} step="0.01" className={inputCls} value={cfg.iva_pct}
                                    onChange={e => setCfg({ ...cfg, iva_pct: Number(e.target.value) })} />
                            </div>
                            <div>
                                <label className={labelCls}>Retención boleta honorarios (%)</label>
                                <input type="number" min={0} max={100} step="0.01" className={inputCls} value={cfg.retencion_pct}
                                    onChange={e => setCfg({ ...cfg, retencion_pct: Number(e.target.value) })} />
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Siguiente N° de OPS</label>
                            <input type="number" min={cfg.ultimo_numero + 1} className={inputCls} value={cfg.siguiente_numero}
                                onChange={e => setCfg({ ...cfg, siguiente_numero: Math.round(Number(e.target.value) || 0) })} />
                            <p className="text-[11px] text-gray-400 mt-1">
                                {cfg.ultimo_numero ? `Último N° usado: ${cfg.ultimo_numero}. ` : 'Aún no hay órdenes en este colegio. '}
                                Solo puede avanzar; no se reinicia con el año.
                            </p>
                        </div>
                        <p className="text-[11px] text-gray-400">Los % nuevos se aplican a las órdenes que se guarden desde ahora; las emitidas conservan el % con que se emitieron.</p>
                    </>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                {ok && <p className="text-sm text-emerald-600 font-semibold">Configuración guardada.</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onCerrar} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cerrar</button>
                    <button onClick={guardar} disabled={!cfg || guardando}
                        className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                        {guardando && <Loader2 size={14} className="animate-spin" />} Guardar
                    </button>
                </div>
            </div>
        </Modal>
    );
}
