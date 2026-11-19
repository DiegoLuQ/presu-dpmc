'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { ArrowLeft, ArrowUpDown, Download, ListFilter, Loader2, Receipt, School, Search } from 'lucide-react';
import api from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import { primeraRutaAccesible } from '@/lib/permissions/registry';
import { FiltroMultiSelectGenerico } from '@/components/presupuesto/FiltroMultiSelectGenerico';
import BotonRecargarOC from '@/components/go-contralor/BotonRecargarOC';

/**
 * Todas las órdenes aprobadas (BD db_central, vista v_oc_area, solo lectura): OC de Softland
 * y Órdenes de Pago de Servicio (OPS), por colegio, con filtros de área, centro de costo,
 * fecha, origen y tipo de documento. Mismo acceso que "Presupuesto vs Ejecutado"
 * (sección presupuesto.solicitudes).
 */

interface Orden {
    id: number;
    empresa: string;
    id_colegio: number;
    num_oc: number;
    fecha_oc: string | null;
    centro_costo: string | null;
    subtotal: number;
    total: number;
    iva: number | null;
    retencion: number | null;
    total_pagar: number;
    origen: 'softland' | 'OPS';
    tipo_documento: string | null;
    rut_proveedor: string | null;
    proveedor: string | null;
    solicitante: string | null;
    grupo: string | null;
    grupo_manual: boolean;
    area_key: string;
    area: string;
    cc_key: string;
    cc: string;
}
interface Opcion { key: string; label: string }
interface Respuesta {
    oc_disponible: boolean;
    ultima_sync: string | null;
    ordenes: Orden[];
    totales: { n: number; subtotal: number; total: number; total_pagar: number; n_ops: number };
    opciones: { areas: Opcion[]; centros: Opcion[] };
}
interface Colegio { id_colegio: number; nombre: string }
type Orden_ = 'fecha' | 'num' | 'total';

const formatCLP = (v: number) => `$${Math.round(v || 0).toLocaleString('es-CL')}`;
const formatFecha = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('-') : '—');
const isoHoy = () => new Date().toISOString().slice(0, 10);
const POR_PAGINA = 100;

export default function OrdenesCompraPage() {
    const router = useRouter();
    const { user, tienePermiso, puedeSeccion, isLoading: authLoading, colegioActivo } = useAuth();
    const puedeVer = puedeSeccion('presupuesto.solicitudes');
    const esMulticolegio = user?.rol?.codigo === 'ADM' || user?.rol?.codigo === 'SOS' || user?.rol?.codigo === 'GERENTE' || (user?.colegios && user.colegios.length > 1);

    const [colegios, setColegios] = useState<Colegio[]>([]);
    const [colegioId, setColegioId] = useState(() => String(colegioActivo || user?.id_colegio || ''));
    const [desde, setDesde] = useState(() => `${new Date().getFullYear()}-01-01`);
    const [hasta, setHasta] = useState(isoHoy);
    const [areas, setAreas] = useState<string[]>([]);
    const [centros, setCentros] = useState<string[]>([]);
    const [origen, setOrigen] = useState('');
    const [tipo, setTipo] = useState('');
    const [q, setQ] = useState('');
    const [orden, setOrden] = useState<{ campo: Orden_; asc: boolean }>({ campo: 'fecha', asc: false });
    const [pagina, setPagina] = useState(1);

    const [data, setData] = useState<Respuesta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!authLoading && !puedeVer) router.replace(primeraRutaAccesible(tienePermiso, puedeSeccion) || '/dashboard');
    }, [authLoading, puedeVer, tienePermiso, puedeSeccion, router]);

    useEffect(() => {
        api.get('/catalogos/colegios').then(r => setColegios(r.data || [])).catch(() => setColegios([]));
    }, []);

    const fetchData = useCallback(async () => {
        if (!puedeVer) return;
        setLoading(true);
        setError('');
        try {
            const p = new URLSearchParams();
            if (colegioId) p.append('id_colegio', colegioId);
            if (desde) p.append('desde', desde);
            if (hasta) p.append('hasta', hasta);
            if (origen) p.append('origen', origen);
            if (tipo) p.append('tipo', tipo);
            if (q.trim()) p.append('q', q.trim());
            areas.forEach(a => p.append('areas', a));
            centros.forEach(c => p.append('centros', c));
            const res = await api.get(`/presupuesto/ejecucion/ordenes?${p.toString()}`);
            setData(res.data);
            setPagina(1);
        } catch (e) {
            setError((axios.isAxiosError(e) && e.response?.data?.detail) || 'No se pudieron cargar las órdenes de compra.');
        } finally {
            setLoading(false);
        }
    }, [puedeVer, colegioId, desde, hasta, origen, tipo, q, areas, centros]);

    useEffect(() => {
        const t = setTimeout(fetchData, 300);
        return () => clearTimeout(t);
    }, [fetchData]);

    const ordenadas = useMemo(() => {
        const lista = [...(data?.ordenes || [])];
        const dir = orden.asc ? 1 : -1;
        lista.sort((a, b) => {
            if (orden.campo === 'total') return (a.total - b.total) * dir;
            if (orden.campo === 'num') return (a.num_oc - b.num_oc) * dir;
            return ((a.fecha_oc || '').localeCompare(b.fecha_oc || '') || a.num_oc - b.num_oc) * dir;
        });
        return lista;
    }, [data, orden]);
    const paginas = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA));
    const visibles = ordenadas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

    const porArea = useMemo(() => {
        const m = new Map<string, { label: string; total: number; n: number }>();
        for (const o of data?.ordenes || []) {
            const x = m.get(o.area_key) || { label: o.area, total: 0, n: 0 };
            x.total += o.total;
            x.n += 1;
            m.set(o.area_key, x);
        }
        return Array.from(m.values()).sort((a, b) => b.total - a.total);
    }, [data]);

    const ordenarPor = (campo: Orden_) => setOrden(o => ({ campo, asc: o.campo === campo ? !o.asc : false }));
    const colegioNombre = (id: number) => colegios.find(c => c.id_colegio === id)?.nombre || `Colegio ${id}`;

    const exportarExcel = () => {
        if (!data) return;
        const filas = ordenadas.map(o => ({
            'N°': o.num_oc,
            Origen: o.origen === 'OPS' ? 'OPS' : 'Softland',
            Tipo: o.tipo_documento || '',
            Fecha: formatFecha(o.fecha_oc),
            Colegio: colegioNombre(o.id_colegio),
            'RUT proveedor': o.rut_proveedor || '',
            Proveedor: o.proveedor || '',
            Solicitante: o.solicitante || '',
            'Grupo OC': o.grupo || '',
            Área: o.area,
            'Centro de costo': o.centro_costo || '',
            Subvención: o.cc,
            Subtotal: o.subtotal,
            IVA: o.iva ?? '',
            Retención: o.retencion ?? '',
            Total: o.total,
            'A pagar': o.total_pagar,
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Órdenes de compra');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porArea.map(a => ({ Área: a.label, 'N° órdenes': a.n, Total: a.total }))), 'Por área');
        const nombre = colegioId ? colegioNombre(Number(colegioId)) : 'Todos';
        XLSX.writeFile(wb, `Ordenes_Compra_${nombre.replace(/\s+/g, '_')}_${desde || 'inicio'}_${hasta || 'hoy'}.xlsx`);
    };

    if (authLoading || !puedeVer) {
        return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="animate-spin" /></div>;
    }

    const th = (campo: Orden_, label: string, derecha = false) => (
        <th className={`px-4 py-3 ${derecha ? 'text-right' : 'text-left'}`}>
            <button onClick={() => ordenarPor(campo)} className={`inline-flex items-center gap-1 uppercase hover:text-gray-800 ${orden.campo === campo ? 'text-gray-800' : ''}`}>
                {label} <ArrowUpDown size={11} />
            </button>
        </th>
    );
    const totales = data?.totales || { n: 0, subtotal: 0, total: 0, total_pagar: 0, n_ops: 0 };
    const selectCls = 'py-2.5 px-3 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary';

    return (
        <div className="animate-in fade-in duration-500 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><Receipt size={26} /></div>
                    <div>
                        <Link href="/go-contralor/ejecucion" className="text-xs font-semibold text-gray-400 hover:text-primary flex items-center gap-1">
                            <ArrowLeft size={13} /> Presupuesto vs Ejecutado
                        </Link>
                        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Órdenes de Compra</h2>
                        <p className="text-gray-500 mt-1 font-medium">OC aprobadas en Softland y Órdenes de Pago de Servicio (OPS), por colegio, área y fecha.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {data?.oc_disponible && <BotonRecargarOC ultimaSync={data.ultima_sync} onRecargar={fetchData} cargando={loading} />}
                    <button onClick={exportarExcel} disabled={!data || loading || !data.ordenes.length}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
                        <Download size={14} /> Excel
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
                <span className="flex items-center gap-2 text-xs font-semibold text-gray-500"><ListFilter size={16} className="text-gray-400" />Filtrar por:</span>
                <div className="relative">
                    <School size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <select value={colegioId} onChange={e => { setColegioId(e.target.value); setAreas([]); setCentros([]); }} disabled={!esMulticolegio}
                        className={`${selectCls} pl-9 pr-8 disabled:bg-gray-50`}>
                        {esMulticolegio && <option value="">Todos los colegios</option>}
                        {colegios.map(c => <option key={c.id_colegio} value={c.id_colegio}>{c.nombre}</option>)}
                    </select>
                </div>
                <FiltroMultiSelectGenerico
                    icono="🏷️" tituloVacio="Todas las áreas" tituloPlural="áreas"
                    seleccionados={areas} onChange={setAreas}
                    opciones={(data?.opciones.areas || []).map(a => ({ valor: a.key, label: a.label }))}
                    placeholderBusqueda="Buscar área..." anchoMinimo="min-w-[200px]"
                />
                <FiltroMultiSelectGenerico
                    icono="💼" tituloVacio="Todos los centros" tituloPlural="centros"
                    seleccionados={centros} onChange={setCentros}
                    opciones={(data?.opciones.centros || []).map(c => ({ valor: c.key, label: c.label }))}
                    placeholderBusqueda="Buscar centro..." anchoMinimo="min-w-[200px]"
                />
                <select value={origen} onChange={e => setOrigen(e.target.value)} className={selectCls}>
                    <option value="">Todos los orígenes</option>
                    <option value="softland">Softland (OC)</option>
                    <option value="OPS">Órdenes de pago (OPS)</option>
                </select>
                <select value={tipo} onChange={e => setTipo(e.target.value)} className={selectCls}>
                    <option value="">Todos los documentos</option>
                    <option value="OC">Orden de compra</option>
                    <option value="Factura">Factura</option>
                    <option value="Boleta">Boleta de honorarios</option>
                </select>
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                    <span>Desde</span>
                    <input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} className={selectCls} />
                    <span>hasta</span>
                    <input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} className={selectCls} />
                </div>
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="N°, solicitante, proveedor o RUT"
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
            </div>

            {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}
            {data && !data.oc_disponible && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3">La base de órdenes de compra no está disponible en este servidor.</p>
            )}

            {/* Resumen */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
                    <p className="text-xs font-semibold text-gray-500">Órdenes</p>
                    <p className="text-2xl font-extrabold text-gray-900 mt-1">{totales.n.toLocaleString('es-CL')}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                        {(totales.n - totales.n_ops).toLocaleString('es-CL')} OC · {totales.n_ops.toLocaleString('es-CL')} OPS · Neto {formatCLP(totales.subtotal)}
                    </p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
                    <p className="text-xs font-semibold text-gray-500">Gasto total</p>
                    <p className="text-2xl font-extrabold text-gray-900 mt-1">{formatCLP(totales.total)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                        A pagar {formatCLP(totales.total_pagar)} · {formatFecha(desde)} a {formatFecha(hasta)}
                    </p>
                </div>
                <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Por área</p>
                    <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                        {porArea.length === 0 && <p className="text-xs text-gray-400">Sin datos.</p>}
                        {porArea.map(a => (
                            <div key={a.label} className="flex items-center gap-2 text-xs">
                                <span className="w-40 truncate text-gray-600" title={a.label}>{a.label}</span>
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary rounded-full" style={{ width: `${totales.total ? (a.total / totales.total) * 100 : 0}%` }} />
                                </div>
                                <span className="w-28 text-right font-semibold text-gray-800">{formatCLP(a.total)}</span>
                                <span className="w-12 text-right text-gray-400">{a.n}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_20px_rgba(0,0,0,0.02)] overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                            {th('num', 'N°')}
                            {th('fecha', 'Fecha')}
                            {!colegioId && <th className="text-left px-4 py-3 uppercase">Colegio</th>}
                            <th className="text-left px-4 py-3 uppercase">Proveedor</th>
                            <th className="text-left px-4 py-3 uppercase">Solicitante</th>
                            <th className="text-left px-4 py-3 uppercase">Área</th>
                            <th className="text-left px-4 py-3 uppercase">Centro de costo</th>
                            <th className="text-right px-4 py-3 uppercase">Neto</th>
                            {th('total', 'Total', true)}
                            <th className="text-right px-4 py-3 uppercase">A pagar</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr><td colSpan={10} className="py-12 text-center text-gray-400"><Loader2 className="animate-spin inline" /></td></tr>
                        ) : visibles.length === 0 ? (
                            <tr><td colSpan={10} className="py-12 text-center text-gray-400">No hay órdenes con estos filtros.</td></tr>
                        ) : visibles.map(o => (
                            <tr key={o.id} className="hover:bg-gray-50/60">
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                    <span className="font-bold text-gray-900">{o.num_oc}</span>
                                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${o.origen === 'OPS' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>
                                        {o.origen === 'OPS' ? 'OPS' : 'OC'}
                                    </span>
                                    {o.tipo_documento && o.tipo_documento !== 'OC' && (
                                        <span className="block text-[10px] text-gray-400">{o.tipo_documento}</span>
                                    )}
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{formatFecha(o.fecha_oc)}</td>
                                {!colegioId && <td className="px-4 py-2.5 text-xs text-gray-500">{colegioNombre(o.id_colegio)}</td>}
                                <td className="px-4 py-2.5 text-xs max-w-[14rem]">
                                    <span className="block truncate text-gray-700" title={o.proveedor || ''}>{o.proveedor || '—'}</span>
                                    {o.rut_proveedor && <span className="block text-[10px] text-gray-400">{o.rut_proveedor}</span>}
                                </td>
                                <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate" title={o.solicitante || ''}>{o.solicitante || '—'}</td>
                                <td className="px-4 py-2.5 text-xs">
                                    <span className={o.area_key.startsWith('a') ? 'text-gray-700' : 'text-amber-600'}>{o.area}</span>
                                    {o.grupo && <span className="block text-[10px] text-gray-400">Grupo OC: {o.grupo}{o.grupo_manual ? ' (manual)' : ''}</span>}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-gray-600" title={o.cc}>{o.centro_costo || '—'}</td>
                                <td className="px-4 py-2.5 text-right text-gray-500 whitespace-nowrap">{formatCLP(o.subtotal)}</td>
                                <td className="px-4 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap">{formatCLP(o.total)}</td>
                                <td className="px-4 py-2.5 text-right text-gray-600 whitespace-nowrap"
                                    title={o.retencion != null ? `Retención ${formatCLP(o.retencion)}` : o.iva != null ? `IVA ${formatCLP(o.iva)}` : ''}>
                                    {formatCLP(o.total_pagar)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {paginas > 1 && (
                <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Mostrando {((pagina - 1) * POR_PAGINA + 1).toLocaleString('es-CL')}–{Math.min(pagina * POR_PAGINA, ordenadas.length).toLocaleString('es-CL')} de {ordenadas.length.toLocaleString('es-CL')}</span>
                    <div className="flex gap-1">
                        <button disabled={pagina === 1} onClick={() => setPagina(p => p - 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold disabled:opacity-40 hover:bg-gray-50">Anterior</button>
                        <span className="px-3 py-1.5">{pagina} / {paginas}</span>
                        <button disabled={pagina === paginas} onClick={() => setPagina(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 font-semibold disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
                    </div>
                </div>
            )}
        </div>
    );
}
