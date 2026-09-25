'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    FileText,
    Download,
    Search,
    Calendar,
    Building2,
    Eye,
    Trash2,
    Loader2,
    CheckCircle2,
    RefreshCw,
    X,
    Filter,
    Package,
    Edit3,
    Save
} from 'lucide-react';
import api from '@/lib/api/client';

interface ActaDetalle {
    id_acta_detalle: number;
    nombre_producto: string;
    descripcion?: string;
    cantidad: number;
    formato_unidad?: string;
    solicitud_codigo?: string;
    cargo_area?: string;
}

interface ActaEntrega {
    id_acta: number;
    id_colegio: number;
    colegio_nombre?: string;
    numero_correlativo: number;
    codigo_acta: string;
    fecha: string;
    ciudad: string;
    para_nombre: string;
    para_cargo?: string;
    de_emisor: string;
    asunto: string;
    numero_factura?: string;
    observacion?: string;
    created_at: string;
    detalles: ActaDetalle[];
}

export default function ActasPage() {
    const [actas, setActas] = useState<ActaEntrega[]>([]);
    const [loading, setLoading] = useState(true);
    const [colegioId, setColegioId] = useState<string>('');
    const [year, setYear] = useState<string>(new Date().getFullYear().toString());
    const [searchTerm, setSearchTerm] = useState('');
    const [colegios, setColegios] = useState<{ id_colegio: number; nombre: string }[]>([]);
    
    // Modal de vista previa/detalle
    const [selectedActa, setSelectedActa] = useState<ActaEntrega | null>(null);
    const [downloadingId, setDownloadingId] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    // Modal de Edición de Campos del Acta
    const [editingActa, setEditingActa] = useState<ActaEntrega | null>(null);
    const [editForm, setEditForm] = useState({
        codigo_acta: '',
        fecha: '',
        ciudad: '',
        para_nombre: '',
        para_cargo: '',
        de_emisor: '',
        asunto: '',
        numero_factura: '',
        observacion: ''
    });
    const [savingEdit, setSavingEdit] = useState(false);

    const handleOpenEdit = (acta: ActaEntrega) => {
        setEditingActa(acta);
        setEditForm({
            codigo_acta: acta.codigo_acta || '',
            fecha: acta.fecha || '',
            ciudad: acta.ciudad || 'ALTO HOSPICIO',
            para_nombre: acta.para_nombre || '',
            para_cargo: acta.para_cargo || '',
            de_emisor: acta.de_emisor || 'GERENCIA DE OPERACIONES',
            asunto: acta.asunto || '',
            numero_factura: acta.numero_factura || '',
            observacion: acta.observacion || ''
        });
    };

    const handleSaveEdit = async () => {
        if (!editingActa) return;
        if (!editForm.para_nombre.trim()) {
            alert('Por favor ingrese el nombre del receptor (PARA).');
            return;
        }
        if (!editForm.asunto.trim()) {
            alert('Por favor ingrese el asunto del acta.');
            return;
        }
        setSavingEdit(true);
        try {
            const res = await api.put(`/presupuesto/compras/actas/${editingActa.id_acta}`, editForm);
            setActas(prev => prev.map(a => a.id_acta === editingActa.id_acta ? { ...a, ...res.data } : a));
            if (selectedActa?.id_acta === editingActa.id_acta) {
                setSelectedActa(prev => prev ? { ...prev, ...res.data } : null);
            }
            setEditingActa(null);
        } catch (err: any) {
            console.error('Error guardando cambios del acta:', err);
            alert(err.response?.data?.detail || 'No se pudieron guardar los cambios del acta.');
        } finally {
            setSavingEdit(false);
        }
    };

    // Cargar colegios
    useEffect(() => {
        api.get('/usuarios/colegios')
            .then(res => setColegios(res.data || []))
            .catch(() => setColegios([]));
    }, []);

    // Cargar actas
    const fetchActas = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (colegioId) params.append('id_colegio', colegioId);
            if (year) params.append('year', year);
            if (searchTerm) params.append('search', searchTerm);

            const res = await api.get(`/presupuesto/compras/actas?${params.toString()}`);
            setActas(res.data || []);
        } catch (error) {
            console.error('Error cargando actas:', error);
            setActas([]);
        } finally {
            setLoading(false);
        }
    }, [colegioId, year, searchTerm]);

    useEffect(() => {
        fetchActas();
    }, [fetchActas]);

    // Descargar PDF de un acta específica
    const handleDownloadPdf = async (acta: ActaEntrega) => {
        setDownloadingId(acta.id_acta);
        try {
            const res = await api.get(`/presupuesto/compras/actas/${acta.id_acta}/pdf`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `Acta_${acta.codigo_acta.replace(/[\s\/]/g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error descargando PDF:', error);
            alert('No se pudo descargar el PDF del acta.');
        } finally {
            setDownloadingId(null);
        }
    };

    // Eliminar acta
    const handleDeleteActa = async (acta: ActaEntrega) => {
        if (!confirm(`¿Estás seguro de eliminar el acta ${acta.codigo_acta}?`)) return;
        setDeletingId(acta.id_acta);
        try {
            await api.delete(`/presupuesto/compras/actas/${acta.id_acta}`);
            setActas(prev => prev.filter(a => a.id_acta !== acta.id_acta));
            if (selectedActa?.id_acta === acta.id_acta) setSelectedActa(null);
        } catch (error) {
            console.error('Error eliminando acta:', error);
            alert('No se pudo eliminar el acta.');
        } finally {
            setDeletingId(null);
        }
    };

    // Estadísticas
    const totalInsumos = actas.reduce((acc, a) => acc + (a.detalles?.length || 0), 0);
    const ultimaActa = actas[0]?.codigo_acta || '—';

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-2xl shadow-xs">
                        <FileText size={26} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Actas de Entrega</h1>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                            Historial correlativo y descarga oficial de actas de recepción de compras emitidas.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchActas}
                        disabled={loading}
                        className="p-2.5 bg-white border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                        title="Refrescar lista"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Tarjetas de Estadísticas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-[0_2px_15px_rgba(0,0,0,0.03)] flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-primary/10 text-primary">
                        <FileText size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Total Actas Emitidas</span>
                        <span className="text-xl font-black text-gray-900">{actas.length}</span>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-[0_2px_15px_rgba(0,0,0,0.03)] flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
                        <Package size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Insumos Entregados</span>
                        <span className="text-xl font-black text-emerald-950">{totalInsumos}</span>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-[0_2px_15px_rgba(0,0,0,0.03)] flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
                        <CheckCircle2 size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Último Correlativo</span>
                        <span className="text-base font-black text-amber-950 font-mono">{ultimaActa}</span>
                    </div>
                </div>
            </div>

            {/* Barra de Filtros */}
            <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs flex flex-wrap items-center gap-3">
                {/* Buscador */}
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por código, receptor, asunto o factura..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                </div>

                {/* Filtro Colegio */}
                <div className="flex items-center gap-2 min-w-[180px]">
                    <Building2 size={15} className="text-gray-400 shrink-0" />
                    <select
                        value={colegioId}
                        onChange={(e) => setColegioId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                        <option value="">Todos los Colegios</option>
                        {colegios.map(c => (
                            <option key={c.id_colegio} value={c.id_colegio}>{c.nombre}</option>
                        ))}
                    </select>
                </div>

                {/* Filtro Año */}
                <div className="flex items-center gap-2 w-32">
                    <Calendar size={15} className="text-gray-400 shrink-0" />
                    <select
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    >
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                        <option value="2024">2024</option>
                    </select>
                </div>

                {(searchTerm || colegioId) && (
                    <button
                        onClick={() => { setSearchTerm(''); setColegioId(''); }}
                        className="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors cursor-pointer"
                    >
                        Limpiar
                    </button>
                )}
            </div>

            {/* Tabla de Actas */}
            <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-400 space-y-3">
                        <Loader2 size={32} className="animate-spin mx-auto text-primary" />
                        <p className="text-xs font-medium">Cargando actas registradas...</p>
                    </div>
                ) : actas.length === 0 ? (
                    <div className="p-12 text-center text-gray-400 space-y-3">
                        <FileText size={38} className="mx-auto text-gray-300" />
                        <p className="text-sm font-bold text-gray-600">No se encontraron actas registradas</p>
                        <p className="text-xs text-gray-400">
                            Emite actas desde la sección <b>Programar Compras</b> seleccionando recursos.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 text-xs">
                            <thead className="bg-slate-50 text-slate-600 font-bold tracking-wider uppercase text-[10px]">
                                <tr>
                                    <th className="px-4 py-3.5 text-left">Correlativo</th>
                                    <th className="px-4 py-3.5 text-left">Fecha</th>
                                    <th className="px-4 py-3.5 text-left">Receptor (PARA)</th>
                                    <th className="px-4 py-3.5 text-left">Asunto</th>
                                    <th className="px-4 py-3.5 text-left">Factura / Proveedor</th>
                                    <th className="px-4 py-3.5 text-center">Insumos</th>
                                    <th className="px-4 py-3.5 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {actas.map((acta) => (
                                    <tr key={acta.id_acta} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                            <span className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200/80 rounded-lg font-mono font-bold text-xs tracking-wider">
                                                {acta.codigo_acta}
                                            </span>
                                            {acta.colegio_nombre && (
                                                <span className="block text-[10px] text-gray-400 font-medium mt-1">
                                                    {acta.colegio_nombre}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 whitespace-nowrap font-medium text-gray-600">
                                            {acta.fecha}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <span className="font-bold text-gray-900 block">{acta.para_nombre}</span>
                                            {acta.para_cargo && (
                                                <span className="text-[11px] text-gray-500 block">{acta.para_cargo}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 max-w-xs truncate font-medium text-gray-800" title={acta.asunto}>
                                            {acta.asunto}
                                        </td>
                                        <td className="px-4 py-3.5 text-gray-600 font-medium max-w-xs truncate">
                                            {acta.numero_factura || <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/60 rounded-full font-bold text-[11px]">
                                                {acta.detalles?.length || 0} items
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => handleOpenEdit(acta)}
                                                    className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                                    title="Editar campos del acta"
                                                >
                                                    <Edit3 size={15} />
                                                </button>
                                                <button
                                                    onClick={() => setSelectedActa(acta)}
                                                    className="p-1.5 text-gray-500 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors cursor-pointer"
                                                    title="Ver detalle del acta"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDownloadPdf(acta)}
                                                    disabled={downloadingId === acta.id_acta}
                                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                                                    title="Descargar PDF Oficial"
                                                >
                                                    {downloadingId === acta.id_acta ? (
                                                        <Loader2 size={13} className="animate-spin" />
                                                    ) : (
                                                        <Download size={13} />
                                                    )}
                                                    PDF
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteActa(acta)}
                                                    disabled={deletingId === acta.id_acta}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                                    title="Eliminar acta"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Detalle de Acta */}
            {selectedActa && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col border border-gray-100">
                        {/* Header */}
                        <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
                                    <FileText size={22} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-black text-white">Detalle de Acta de Entrega</h3>
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-400 text-slate-950">
                                            {selectedActa.codigo_acta}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400">{selectedActa.colegio_nombre || 'Colegio'} · {selectedActa.fecha}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedActa(null)}
                                className="p-1.5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto space-y-5 text-xs">
                            {/* Ficha de Metadatos */}
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Para (Receptor):</span>
                                    <span className="font-extrabold text-gray-900 text-sm">{selectedActa.para_nombre}</span>
                                    {selectedActa.para_cargo && <span className="text-gray-500 block">{selectedActa.para_cargo}</span>}
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase block">De (Emisor):</span>
                                    <span className="font-extrabold text-gray-900 text-sm">{selectedActa.de_emisor}</span>
                                    <span className="text-gray-500 block">{selectedActa.ciudad}</span>
                                </div>
                                <div className="col-span-2 pt-2 border-t border-slate-200/60">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase block">Asunto:</span>
                                    <span className="font-bold text-gray-800">{selectedActa.asunto}</span>
                                </div>
                                {selectedActa.numero_factura && (
                                    <div className="col-span-2">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Factura / Proveedor:</span>
                                        <span className="font-semibold text-gray-700">{selectedActa.numero_factura}</span>
                                    </div>
                                )}
                                {selectedActa.observacion && (
                                    <div className="col-span-2 bg-amber-50/80 p-3 rounded-xl border border-amber-200/60">
                                        <span className="text-[10px] font-bold text-amber-900 uppercase block">Observación:</span>
                                        <p className="text-amber-900 italic mt-0.5">{selectedActa.observacion}</p>
                                    </div>
                                )}
                            </div>

                            {/* Insumos */}
                            <div>
                                <h4 className="font-bold text-gray-700 uppercase tracking-wider text-[11px] mb-2">
                                    Insumos Entregados ({selectedActa.detalles?.length || 0})
                                </h4>
                                <div className="border border-gray-200 rounded-xl overflow-hidden">
                                    <table className="min-w-full divide-y divide-gray-100 text-xs">
                                        <thead className="bg-slate-50 font-bold text-slate-600">
                                            <tr>
                                                <th className="px-3 py-2 text-center w-10">#</th>
                                                <th className="px-3 py-2 text-center w-20">Cantidad</th>
                                                <th className="px-3 py-2 text-left w-24">Unidad</th>
                                                <th className="px-3 py-2 text-left">Recurso / Especificación</th>
                                                <th className="px-3 py-2 text-left">Área / Cargo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {selectedActa.detalles?.map((det, i) => (
                                                <tr key={det.id_acta_detalle}>
                                                    <td className="px-3 py-2 text-center font-mono font-bold text-gray-400">{i + 1}</td>
                                                    <td className="px-3 py-2 text-center font-bold font-mono text-emerald-700 bg-emerald-50/30">{det.cantidad}</td>
                                                    <td className="px-3 py-2 font-bold text-gray-700">{det.formato_unidad || 'UNIDAD'}</td>
                                                    <td className="px-3 py-2">
                                                        <span className="font-bold text-gray-900 block">{det.nombre_producto}</span>
                                                        {det.descripcion && <span className="text-[11px] text-gray-500 block">{det.descripcion}</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-600 font-medium">{det.cargo_area || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center gap-2 shrink-0">
                            <button
                                onClick={() => {
                                    const a = selectedActa;
                                    setSelectedActa(null);
                                    handleOpenEdit(a);
                                }}
                                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                            >
                                <Edit3 size={14} /> Editar Datos
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleDownloadPdf(selectedActa)}
                                    disabled={downloadingId === selectedActa.id_acta}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm cursor-pointer"
                                >
                                    <Download size={15} /> Descargar PDF Oficial
                                </button>
                                <button
                                    onClick={() => setSelectedActa(null)}
                                    className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Editar Campos del Acta (Sin modificar ítems) */}
            {editingActa && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col border border-gray-100 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
                                    <Edit3 size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-white">Editar Datos del Acta</h3>
                                    <p className="text-xs text-slate-400">
                                        Modifica los campos oficiales del encabezado sin alterar los insumos vinculados.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingActa(null)}
                                className="p-1.5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Body Form */}
                        <div className="p-6 overflow-y-auto space-y-4 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Correlativo */}
                                <div>
                                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                        N° Correlativo Oficial *
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.codigo_acta}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, codigo_acta: e.target.value }))}
                                        placeholder="Ej: CS - N°001/2026"
                                        className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
                                    />
                                </div>

                                {/* Fecha */}
                                <div>
                                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                        Fecha de Emisión *
                                    </label>
                                    <input
                                        type="date"
                                        value={editForm.fecha}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, fecha: e.target.value }))}
                                        className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
                                    />
                                </div>

                                {/* Ciudad / Sede */}
                                <div>
                                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                        Ciudad / Sede
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.ciudad}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, ciudad: e.target.value }))}
                                        placeholder="ALTO HOSPICIO"
                                        className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
                                    />
                                </div>

                                {/* De (Emisor) */}
                                <div>
                                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                        De (Emisor)
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.de_emisor}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, de_emisor: e.target.value }))}
                                        placeholder="GERENCIA DE OPERACIONES"
                                        className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
                                    />
                                </div>

                                {/* Para (Receptor) */}
                                <div>
                                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                        Para (Nombre Receptor / Jefatura) *
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.para_nombre}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, para_nombre: e.target.value }))}
                                        placeholder="Nombre completo"
                                        className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
                                    />
                                </div>

                                {/* Cargo o Área */}
                                <div>
                                    <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                        Cargo o Área Receptor
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.para_cargo}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, para_cargo: e.target.value }))}
                                        placeholder="Ej: Finanzas / Jefatura"
                                        className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
                                    />
                                </div>
                            </div>

                            {/* Asunto */}
                            <div>
                                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                    Asunto de la Entrega *
                                </label>
                                <input
                                    type="text"
                                    value={editForm.asunto}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, asunto: e.target.value }))}
                                    placeholder="ENTREGA DE MATERIALES E INSUMOS"
                                    className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
                                />
                            </div>

                            {/* Factura / Proveedor */}
                            <div>
                                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                    N° Factura y Proveedor / Razón Social
                                </label>
                                <input
                                    type="text"
                                    value={editForm.numero_factura}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, numero_factura: e.target.value }))}
                                    placeholder="Ej: 1477608 LONZA HERMANOS LTDA."
                                    className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
                                />
                            </div>

                            {/* Observación */}
                            <div>
                                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                    Observación / Indicación adicional
                                </label>
                                <textarea
                                    value={editForm.observacion}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, observacion: e.target.value }))}
                                    rows={2}
                                    placeholder="Detalle o instrucción especial para la entrega..."
                                    className="w-full px-3 py-2 bg-slate-50 border border-gray-300 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs resize-none"
                                />
                            </div>

                            {/* Insumos informativos */}
                            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    Insumos Vinculados ({editingActa.detalles?.length || 0})
                                </span>
                                <p className="text-[11px] text-slate-600 font-medium">
                                    Los {editingActa.detalles?.length || 0} recursos vinculados a esta acta no sufrirán modificaciones y se conservarán íntegramente.
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setEditingActa(null)}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={savingEdit}
                                className="px-4 py-2 bg-primary hover:bg-blue-600 disabled:bg-primary/50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-primary/20 transition-all cursor-pointer"
                            >
                                {savingEdit ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" /> Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save size={14} /> Guardar Cambios
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
