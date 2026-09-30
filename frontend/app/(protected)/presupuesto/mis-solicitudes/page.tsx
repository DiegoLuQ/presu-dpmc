'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import { Search, Plus, DollarSign, FileText, CheckCircle, Clock, XCircle, Loader2, Download, Eye, ArrowRight, Package, Trash2, AlertTriangle, Send, Wallet, Link2, Share2, Users } from 'lucide-react';
import { CompartirSolicitudModal } from '@/components/presupuesto/CompartirSolicitudModal';
import { BudgetRequest, PresupuestoAnual } from '@/lib/types';
import * as XLSX from 'xlsx';

import ComprasFilters from '@/components/go-compras/ComprasFilters';

const YEAR_STORAGE_KEY = 'mis_solicitudes_year';

export default function MisSolicitudesPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedColegio, setSelectedColegio] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<string>('');
    const [solicitudes, setSolicitudes] = useState<BudgetRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [solicitudAEliminar, setSolicitudAEliminar] = useState<BudgetRequest | null>(null);
    const [solicitudAEnviar, setSolicitudAEnviar] = useState<BudgetRequest | null>(null);
    const [eliminando, setEliminando] = useState(false);
    const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
    const [enviando, setEnviando] = useState<number | null>(null);

    const esAdmin = !!user?.rol && user.rol.codigo === 'ADM';
    const [presupuestosAnuales, setPresupuestosAnuales] = useState<PresupuestoAnual[]>([]);
    const [enlazandoId, setEnlazandoId] = useState<number | null>(null);
    // Compartir con otras áreas: modal (solo ADM) y permisos de las compartidas conmigo
    const [solicitudACompartir, setSolicitudACompartir] = useState<BudgetRequest | null>(null);
    const [compartidasConmigo, setCompartidasConmigo] = useState<Record<number, 'ver' | 'editar'>>({});

    // Inicializar colegio del usuario y recordar el último presupuesto elegido en este navegador
    useEffect(() => {
        if (user?.id_colegio && !selectedColegio) {
            setSelectedColegio(String(user.id_colegio));
        }
    }, [user, selectedColegio]);

    useEffect(() => {
        try {
            const guardado = localStorage.getItem(YEAR_STORAGE_KEY);
            if (guardado) setSelectedYear(guardado);
        } catch { /* sin localStorage: el usuario elige el presupuesto */ }
    }, []);

    const cambiarYear = (y: string) => {
        setSelectedYear(y);
        try {
            if (y) localStorage.setItem(YEAR_STORAGE_KEY, y); else localStorage.removeItem(YEAR_STORAGE_KEY);
        } catch { /* ignorar */ }
    };

    // Datos livianos que no dependen del filtro
    useEffect(() => {
        api.get('/presupuesto/presupuestos-anuales')
            .then(res => setPresupuestosAnuales(res.data || []))
            .catch(() => setPresupuestosAnuales([]));
        api.get('/presupuesto/solicitudes/compartidas-conmigo')
            .then(res => setCompartidasConmigo(res.data || {}))
            .catch(() => setCompartidasConmigo({}));
    }, []);

    // Las solicitudes (con todos sus ítems) solo se piden con un presupuesto elegido,
    // y el servidor filtra por colegio y año para no traer todo.
    const hayFiltro = !!selectedYear;
    const fetchSolicitudes = useCallback(async () => {
        if (!selectedYear) {
            setSolicitudes([]);
            return;
        }
        try {
            setLoading(true);
            const res = await api.get('/presupuesto/solicitudes/mis', {
                params: { year: selectedYear, id_colegio: selectedColegio || undefined },
            });
            setSolicitudes(res.data);
        } catch (error) {
            console.error('Error fetching solicitudes:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedYear, selectedColegio]);

    useEffect(() => {
        fetchSolicitudes();
    }, [fetchSolicitudes]);

    // Presupuestos sugeridos para el estado inicial (del colegio elegido, o años únicos)
    const opcionesPresupuesto = selectedColegio
        ? presupuestosAnuales.filter(p => String(p.id_colegio) === String(selectedColegio))
            .sort((a, b) => b.year - a.year)
            .map(p => ({ year: String(p.year), label: p.nombre || `Presupuesto ${p.year}` }))
        : Array.from(new Set(presupuestosAnuales.map(p => p.year))).sort((a, b) => b - a)
            .map(y => ({ year: String(y), label: `Presupuesto ${y}` }));

    const handleEnlazarPresupuesto = async (idSolicitud: number, idPresupuestoAnual: number | null) => {
        setEnlazandoId(idSolicitud);
        try {
            await api.patch(`/presupuesto/solicitudes/${idSolicitud}/presupuesto-anual`, {
                id_presupuesto_anual: idPresupuestoAnual,
            });
            const pptoEncontrado = presupuestosAnuales.find(p => p.id_presupuesto_anual === idPresupuestoAnual);
            setSolicitudes(prev => prev.map(s => {
                if (s.id_presupuesto === idSolicitud) {
                    return {
                        ...s,
                        id_presupuesto_anual: idPresupuestoAnual,
                        presupuesto_anual_nombre: pptoEncontrado ? pptoEncontrado.nombre : null,
                        presupuesto_anual_year: pptoEncontrado ? pptoEncontrado.year : null,
                    };
                }
                return s;
            }));
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'No se pudo enlazar el presupuesto anual.');
        } finally {
            setEnlazandoId(null);
        }
    };

    const handleEliminar = async () => {
        if (!solicitudAEliminar) return;
        try {
            setEliminando(true);
            setErrorEliminar(null);
            await api.delete(`/presupuesto/solicitudes/${solicitudAEliminar.id_presupuesto}`);
            setSolicitudes(prev => prev.filter(s => s.id_presupuesto !== solicitudAEliminar.id_presupuesto));
            setSolicitudAEliminar(null);
        } catch (error: any) {
            console.error('Error eliminando solicitud:', error);
            setErrorEliminar(error?.response?.data?.detail || 'No se pudo eliminar la solicitud. Intenta nuevamente.');
        } finally {
            setEliminando(false);
        }
    };

    const handleEnviar = async () => {
        if (!solicitudAEnviar) return;
        const req = solicitudAEnviar;
        try {
            setEnviando(req.id_presupuesto);
            await api.patch(`/presupuesto/solicitudes/${req.id_presupuesto}/enviar`);
            // Actualiza solo el estado local, sin recargar la tabla.
            setSolicitudes(prev => prev.map(s => s.id_presupuesto === req.id_presupuesto ? { ...s, estado: 'Enviado' } : s));
            setSolicitudAEnviar(null);
        } catch (error: any) {
            alert(error?.response?.data?.detail || 'No se pudo enviar la solicitud.');
        } finally {
            setEnviando(null);
        }
    };

    const formatCLP = (value: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value);
    };

    const getMontoSolicitado = (s: BudgetRequest) => s.monto_total || 0;

    const getMontoAprobado = (s: BudgetRequest) => {
        if (!s.detalles || s.detalles.length === 0) {
            return s.estado === 'Aprobado' || s.estado === 'Aceptado' ? (s.monto_total || 0) : 0;
        }
        return s.detalles
            .filter(d => d.estado_aprobacion === 'Aprobado' || d.estado_aprobacion === 'Aceptado')
            .reduce((sum, d) => sum + (d.total_iva || 0), 0);
    };

    const getMontoConAjustes = (s: BudgetRequest) => {
        if (!s.detalles || s.detalles.length === 0) return 0;
        return s.detalles
            .filter(d => d.estado_aprobacion === 'Con Ajustes' || d.estado_aprobacion === 'Aprobado con Ajustes' || d.estado_aprobacion === 'Aprobado con ajustes')
            .reduce((sum, d) => sum + (d.total_iva || 0), 0);
    };

    const filtered = solicitudes.filter(req => {
        const q = searchTerm.toLowerCase();
        const matchSearch = !q ||
            req.id_presupuesto.toString().includes(q) ||
            (req.area_nombre || '').toLowerCase().includes(q) ||
            (req.subarea_nombre || '').toLowerCase().includes(q) ||
            (req.presupuesto_anual_nombre || '').toLowerCase().includes(q);

        const matchColegio = !selectedColegio || String(req.id_colegio) === String(selectedColegio);
        const matchYear = !selectedYear || String(req.presupuesto_anual_year) === String(selectedYear) || new Date(req.fecha).getFullYear().toString() === String(selectedYear);

        return matchSearch && matchColegio && matchYear;
    });

    const getStatusStyle = (estado: string) => {
        switch (estado) {
            case 'Aprobado':
                return { icon: CheckCircle, iconColor: 'text-green-500', bgColor: 'bg-green-100', txColor: 'text-green-800' };
            case 'Rechazado':
                return { icon: XCircle, iconColor: 'text-red-500', bgColor: 'bg-red-100', txColor: 'text-red-800' };
            case 'Aceptado':
                return { icon: CheckCircle, iconColor: 'text-green-500', bgColor: 'bg-green-100', txColor: 'text-green-800' };
            case 'Revisar':
                return { icon: AlertTriangle, iconColor: 'text-orange-500', bgColor: 'bg-orange-100', txColor: 'text-orange-800' };
            case 'Enviado':
                return { icon: Send, iconColor: 'text-blue-500', bgColor: 'bg-blue-100', txColor: 'text-blue-800', label: 'Por Revisar' };
            default:
                return { icon: Clock, iconColor: 'text-amber-500', bgColor: 'bg-amber-100', txColor: 'text-amber-800' };
        }
    };

    const exportToExcel = () => {
        const data = filtered.map(req => ({
            'ID': req.id_presupuesto,
            'Fecha': new Date(req.fecha).toLocaleDateString('es-CL'),
            'Área': req.area_nombre || '',
            'Cargo': req.subarea_nombre || '',
            'Presupuesto Anual': req.presupuesto_anual_nombre || 'Sin enlazar',
            'Monto Enviado (Solicitado)': getMontoSolicitado(req),
            'Monto Aprobado': getMontoAprobado(req),
            'Monto Con Ajustes': getMontoConAjustes(req),
            'Estado': req.estado,
            'Recursos': req.detalles?.length || 0
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mis Solicitudes');
        XLSX.writeFile(wb, `mis_solicitudes_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const totalSolicitudes = filtered.length;
    const pendientes = filtered.filter(s => s.estado === 'Pendiente' || s.estado === 'Enviado' || s.estado === 'Revisar').length;
    const aprobados = filtered.filter(s => s.estado === 'Aprobado' || s.estado === 'Aceptado').length;
    const totalMontoSolicitado = filtered.reduce((acc, s) => acc + getMontoSolicitado(s), 0);
    const totalMontoAprobado = filtered.reduce((acc, s) => acc + getMontoAprobado(s), 0);

    // Datos derivados de una fila, usados por la tabla y por las tarjetas
    const infoFila = (req: BudgetRequest) => {
        const permisoCompartido = compartidasConmigo[req.id_presupuesto];
        return {
            style: getStatusStyle(req.estado),
            montoSol: getMontoSolicitado(req),
            montoAprob: getMontoAprobado(req),
            montoAjustes: getMontoConAjustes(req),
            permisoCompartido,
            // Compartida conmigo por un administrador (y no soy el dueño)
            soloCompartida: !!permisoCompartido && req.id_user !== user?.id_user,
        };
    };

    const renderEstado = (req: BudgetRequest) => {
        const style = getStatusStyle(req.estado);
        const StatusIcon = style.icon;
        return (
            <span className={`px-2.5 py-0.5 inline-flex items-center text-[11px] leading-5 font-bold rounded-full whitespace-nowrap ${style.bgColor} ${style.txColor}`}>
                <StatusIcon size={12} className={`mr-1 ${style.iconColor}`} />
                {style.label || req.estado}
            </span>
        );
    };

    const renderCompartida = (permiso?: 'ver' | 'editar') => permiso && (
        <span
            className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold"
            title="Un administrador compartió esta solicitud con tu área"
        >
            <Users size={10} /> Compartida · {permiso === 'editar' ? 'puedes editar' : 'solo ver'}
        </span>
    );

    const renderPresupuestoAnual = (req: BudgetRequest) => {
        if (req.presupuesto_anual_nombre) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-full text-[11px] font-bold">
                    <Wallet size={12} className="text-amber-600 shrink-0" />
                    {req.presupuesto_anual_nombre}
                </span>
            );
        }
        if (!esAdmin) {
            return <span className="text-[11px] font-medium text-gray-400 italic">Sin enlazar</span>;
        }
        if (enlazandoId === req.id_presupuesto) {
            return (
                <div className="flex items-center gap-1 text-[11px] text-primary font-semibold">
                    <Loader2 size={12} className="animate-spin" /> Enlazando...
                </div>
            );
        }
        return (
            <select
                defaultValue=""
                onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    if (val !== null) handleEnlazarPresupuesto(req.id_presupuesto, val);
                }}
                className="max-w-full px-2 py-1 bg-amber-50/80 hover:bg-amber-100/80 text-amber-800 border border-amber-300/70 rounded-lg text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer transition-colors"
            >
                <option value="" disabled>+ Enlazar Presupuesto</option>
                {presupuestosAnuales
                    .filter(p => p.id_colegio === req.id_colegio)
                    .map(p => (
                        <option key={p.id_presupuesto_anual} value={p.id_presupuesto_anual}>
                            {p.nombre} ({p.year})
                        </option>
                    ))}
            </select>
        );
    };

    const renderMontoAprobado = (req: BudgetRequest, montoSol: number, montoAprob: number, montoAjustes: number) => (
        <>
            {montoAprob > 0 ? (
                <div>
                    <span className="font-extrabold text-green-600">{formatCLP(montoAprob)}</span>
                    {montoAprob < montoSol && (
                        <span className="ml-1 text-[10px] text-gray-400 font-semibold">
                            ({((montoAprob / montoSol) * 100).toFixed(0)}%)
                        </span>
                    )}
                </div>
            ) : req.estado === 'Rechazado' ? (
                <span className="font-semibold text-red-400">$0</span>
            ) : (
                <span className="font-medium text-gray-400 italic">Por evaluar</span>
            )}
            {montoAjustes > 0 && (
                <div className="text-[10px] text-teal-600 font-bold mt-0.5">
                    + {formatCLP(montoAjustes)} (con ajustes)
                </div>
            )}
        </>
    );

    // grande = botones más altos para el dedo (tarjetas en móvil)
    const renderAcciones = (req: BudgetRequest, soloCompartida: boolean, permisoCompartido: 'ver' | 'editar' | undefined, grande = false) => {
        const btn = grande ? 'px-3 py-2 text-xs' : 'px-2 py-1 text-[11px]';
        const icono = grande ? 'p-2' : 'p-1';
        const editable = req.estado === 'Pendiente' || req.estado === 'Revisar';
        return (
            <>
                {/* Enviar es solo del dueño (el backend lo exige); integrantes del área y compartidas solo editan */}
                {editable && req.id_user === user?.id_user && (
                    <button
                        onClick={() => setSolicitudAEnviar(req)}
                        disabled={enviando === req.id_presupuesto}
                        title={req.estado === 'Revisar' ? 'Reenviar solicitud corregida' : 'Enviar solicitud para revisión'}
                        className={`${btn} bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors inline-flex items-center gap-1 font-bold disabled:opacity-50 border border-blue-200/60 cursor-pointer`}
                    >
                        {enviando === req.id_presupuesto ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        {req.estado === 'Revisar' ? 'Reenviar' : 'Enviar'}
                    </button>
                )}
                {editable && !(soloCompartida && permisoCompartido === 'ver') && (
                    <button
                        onClick={() => router.push(`/presupuesto/agregar-recursos?id=${req.id_presupuesto}`)}
                        title="Editar o agregar recursos a esta solicitud"
                        className={`${btn} bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors inline-flex items-center gap-1 font-bold border border-green-200/60 cursor-pointer`}
                    >
                        <Package size={13} />
                        Editar
                    </button>
                )}
                <button
                    onClick={() => router.push(`/presupuesto/${req.id_presupuesto}`)}
                    className={`${btn} bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors inline-flex items-center gap-1 font-bold border border-gray-200/60 cursor-pointer`}
                >
                    <Eye size={13} />
                    Ver
                    <ArrowRight size={12} />
                </button>
                {esAdmin && (
                    <button
                        onClick={() => setSolicitudACompartir(req)}
                        title="Compartir con otra área"
                        aria-label="Compartir con otra área"
                        className={`${icono} text-gray-400 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer`}
                    >
                        <Share2 size={grande ? 16 : 14} />
                    </button>
                )}
                {esAdmin && (
                    <button
                        onClick={() => { setSolicitudAEliminar(req); setErrorEliminar(null); }}
                        title="Eliminar solicitud"
                        aria-label="Eliminar solicitud"
                        className={`${icono} text-gray-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer`}
                    >
                        <Trash2 size={grande ? 16 : 14} />
                    </button>
                )}
            </>
        );
    };

    const th = "px-3.5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider";

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 sm:mb-6 gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Mis Solicitudes</h2>
                    <p className="text-sm sm:text-base text-gray-500 mt-1 sm:mt-1.5 font-medium">Visualiza y gestiona tus solicitudes de presupuesto.</p>
                </div>

                <div className="grid grid-cols-2 sm:flex items-center gap-2 sm:gap-3 w-full md:w-auto">
                    <button
                        onClick={exportToExcel}
                        disabled={filtered.length === 0}
                        className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-semibold border border-gray-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs shadow-2xs"
                    >
                        <Download size={16} />
                        <span>Exportar</span>
                    </button>
                    <button
                        onClick={() => router.push('/presupuesto/crear')}
                        className="bg-primary hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-primary/30 flex items-center justify-center transition-all text-xs"
                    >
                        <Plus size={16} className="mr-1.5" />
                        Nueva Solicitud
                    </button>
                </div>
            </div>

            {/* Barra de Filtros por Colegio y Presupuesto Registrado */}
            <div className="mb-5 sm:mb-6 [&_select]:max-w-full [&>div]:p-3 sm:[&>div]:p-4">
                <ComprasFilters
                    colegioId={selectedColegio}
                    year={selectedYear}
                    onColegioChange={setSelectedColegio}
                    onYearChange={cambiarYear}
                >
                    <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                        <input
                            type="text"
                            placeholder="Buscar por código, área, cargo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            disabled={!hayFiltro}
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm sm:text-xs text-gray-900 shadow-2xs font-semibold disabled:bg-gray-50 disabled:cursor-not-allowed"
                        />
                    </div>
                </ComprasFilters>
            </div>

            {!hayFiltro ? (
                /* Estado inicial: aún no se ha cargado nada */
                <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 px-5 py-10 sm:py-14 text-center">
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                        <Wallet size={22} />
                    </div>
                    <h3 className="text-base font-bold text-gray-900">Elige un presupuesto para ver tus solicitudes</h3>
                    <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                        Para que la página cargue rápido, las solicitudes se muestran por presupuesto anual.
                    </p>
                    {opcionesPresupuesto.length > 0 && (
                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                            {opcionesPresupuesto.map(o => (
                                <button
                                    key={o.year}
                                    onClick={() => cambiarYear(o.year)}
                                    className="px-4 py-2 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary text-sm font-bold transition-colors cursor-pointer"
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <>
                    {/* Tarjetas Superiores de Métricas */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5 mb-5 sm:mb-6">
                        <div className="bg-white rounded-[20px] p-3.5 sm:p-4 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col justify-between min-h-[85px]">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Solicitudes</p>
                            <h3 className="text-2xl font-black text-gray-900 mt-1">{totalSolicitudes}</h3>
                            <span className="text-[9px] text-gray-400 font-semibold">{solicitudes.length} en el presupuesto</span>
                        </div>
                        <div className="bg-white rounded-[20px] p-3.5 sm:p-4 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col justify-between min-h-[85px]">
                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Pendientes</p>
                            <h3 className="text-2xl font-black text-amber-600 mt-1">{pendientes}</h3>
                            <span className="text-[9px] text-gray-400 font-semibold">En revisión</span>
                        </div>
                        <div className="bg-white rounded-[20px] p-3.5 sm:p-4 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col justify-between min-h-[85px]">
                            <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Aprobadas</p>
                            <h3 className="text-2xl font-black text-green-600 mt-1">{aprobados}</h3>
                            <span className="text-[9px] text-gray-400 font-semibold">{totalSolicitudes > 0 ? ((aprobados / totalSolicitudes) * 100).toFixed(0) : 0}% efectividad</span>
                        </div>
                        <div className="bg-white rounded-[20px] p-3.5 sm:p-4 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col justify-between min-h-[85px]">
                            <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Monto Solicitado</p>
                            <h3 className="text-base sm:text-lg font-black text-gray-900 mt-1 break-all">{formatCLP(totalMontoSolicitado)}</h3>
                            <span className="text-[9px] text-gray-400 font-semibold">Enviado</span>
                        </div>
                        <div className="col-span-2 sm:col-span-1 bg-green-50/60 rounded-[20px] p-3.5 sm:p-4 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-green-200/80 flex flex-col justify-between min-h-[85px]">
                            <p className="text-[10px] font-bold text-green-700 uppercase tracking-wider">Monto Aprobado</p>
                            <h3 className="text-base sm:text-lg font-black text-green-700 mt-1 break-all">{formatCLP(totalMontoAprobado)}</h3>
                            <span className="text-[9px] text-green-600 font-semibold">{totalMontoSolicitado > 0 ? ((totalMontoAprobado / totalMontoSolicitado) * 100).toFixed(1) : '0.0'}% del solicitado</span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="bg-white rounded-[24px] border border-gray-100 px-6 py-12 flex flex-col items-center gap-2 text-gray-400">
                            <Loader2 className="animate-spin" size={24} />
                            <span className="text-sm">Cargando solicitudes...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-[24px] border border-gray-100 px-6 py-12 text-center text-sm text-gray-400">
                            No tienes solicitudes de presupuesto con los filtros seleccionados.
                        </div>
                    ) : (
                        <>
                            {/* Móvil y tablet: tarjetas */}
                            <div className="lg:hidden space-y-3">
                                {filtered.map(req => {
                                    const { montoSol, montoAprob, montoAjustes, permisoCompartido, soloCompartida } = infoFila(req);
                                    return (
                                        <article key={req.id_presupuesto} className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold">
                                                        <FileText size={13} className="text-gray-400 shrink-0" />
                                                        #{req.id_presupuesto}
                                                        <span className="text-gray-300">·</span>
                                                        {new Date(req.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </div>
                                                    <div className="mt-1 text-sm font-bold text-gray-900 leading-tight">{req.area_nombre || 'N/A'}</div>
                                                    {req.subarea_nombre && <div className="text-xs text-gray-400 leading-tight">{req.subarea_nombre}</div>}
                                                    {renderCompartida(permisoCompartido)}
                                                </div>
                                                <div className="shrink-0">{renderEstado(req)}</div>
                                            </div>

                                            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                                                <div>
                                                    <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Enviado</dt>
                                                    <dd className="font-bold text-gray-900">{formatCLP(montoSol)}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Aprobado</dt>
                                                    <dd>{renderMontoAprobado(req, montoSol, montoAprob, montoAjustes)}</dd>
                                                </div>
                                                <div className="min-w-0">
                                                    <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Presupuesto</dt>
                                                    <dd className="min-w-0">{renderPresupuestoAnual(req)}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recursos</dt>
                                                    <dd className="font-semibold text-gray-700">{req.detalles?.length || 0} ítems</dd>
                                                </div>
                                            </dl>

                                            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
                                                {renderAcciones(req, soloCompartida, permisoCompartido, true)}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>

                            {/* Escritorio: tabla */}
                            <div className="hidden lg:block bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-100">
                                        <thead className="bg-gray-50/50">
                                            <tr>
                                                <th scope="col" className={th}>ID</th>
                                                <th scope="col" className={th}>Fecha</th>
                                                <th scope="col" className={th}>Área / Cargo</th>
                                                <th scope="col" className={th}>Presupuesto Anual</th>
                                                <th scope="col" className={th}>Recursos</th>
                                                <th scope="col" className={th}>Monto Enviado</th>
                                                <th scope="col" className={th}>Monto Aprobado</th>
                                                <th scope="col" className={th}>Estado</th>
                                                <th scope="col" className={`${th} text-center`}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-100">
                                            {filtered.map(req => {
                                                const { montoSol, montoAprob, montoAjustes, permisoCompartido, soloCompartida } = infoFila(req);
                                                return (
                                                    <tr key={req.id_presupuesto} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-3.5 py-3.5 whitespace-nowrap text-xs font-semibold text-gray-900">
                                                            <div className="flex items-center gap-1.5">
                                                                <FileText size={14} className="text-gray-400 shrink-0" />
                                                                #{req.id_presupuesto}
                                                            </div>
                                                        </td>
                                                        <td className="px-3.5 py-3.5 whitespace-nowrap text-xs text-gray-600">
                                                            {new Date(req.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                                                        </td>
                                                        <td className="px-3.5 py-3.5 text-xs">
                                                            <div className="font-semibold text-gray-900 leading-tight">{req.area_nombre || 'N/A'}</div>
                                                            {req.subarea_nombre && <div className="text-gray-400 text-[11px] leading-tight">{req.subarea_nombre}</div>}
                                                            {renderCompartida(permisoCompartido)}
                                                        </td>
                                                        <td className="px-3.5 py-3.5 whitespace-nowrap text-xs">{renderPresupuestoAnual(req)}</td>
                                                        <td className="px-3.5 py-3.5 whitespace-nowrap text-xs text-gray-700">
                                                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-[11px] font-bold">
                                                                {req.detalles?.length || 0} items
                                                            </span>
                                                        </td>
                                                        <td className="px-3.5 py-3.5 whitespace-nowrap text-xs font-bold text-gray-900">{formatCLP(montoSol)}</td>
                                                        <td className="px-3.5 py-3.5 whitespace-nowrap text-xs">{renderMontoAprobado(req, montoSol, montoAprob, montoAjustes)}</td>
                                                        <td className="px-3.5 py-3.5 whitespace-nowrap">{renderEstado(req)}</td>
                                                        <td className="px-3.5 py-3.5 whitespace-nowrap text-center">
                                                            <div className="flex justify-center items-center gap-1">
                                                                {renderAcciones(req, soloCompartida, permisoCompartido)}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}

            {solicitudACompartir && (
                <CompartirSolicitudModal
                    solicitud={solicitudACompartir}
                    onClose={() => setSolicitudACompartir(null)}
                />
            )}

            {/* Modal Confirmar Enviar / Reenviar */}
            {solicitudAEnviar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                    <Send size={24} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-gray-900">
                                        {solicitudAEnviar.estado === 'Revisar' ? 'Reenviar solicitud' : 'Enviar solicitud'}
                                    </h3>
                                    <p className="text-sm text-gray-600 mt-1.5 font-medium">
                                        ¿Seguro que deseas enviar tu solicitud de presupuesto?
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 border border-gray-100">
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">Solicitud</span>
                                    <span className="font-bold text-gray-900">#{solicitudAEnviar.id_presupuesto}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">Área / Cargo</span>
                                    <span className="font-semibold text-gray-900 text-right">
                                        {solicitudAEnviar.area_nombre || 'N/A'}
                                        {solicitudAEnviar.subarea_nombre ? ` · ${solicitudAEnviar.subarea_nombre}` : ''}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">Monto total</span>
                                    <span className="font-bold text-gray-900">{formatCLP(solicitudAEnviar.monto_total)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">Recursos incluidos</span>
                                    <span className="font-semibold text-gray-900">{solicitudAEnviar.detalles?.length || 0} items</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                            <button
                                onClick={() => setSolicitudAEnviar(null)}
                                disabled={enviando !== null}
                                className="flex-1 px-4 py-3 sm:py-2.5 rounded-xl font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleEnviar}
                                disabled={enviando !== null}
                                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-600/20"
                            >
                                {enviando !== null ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Enviando...
                                    </>
                                ) : (
                                    <>
                                        <Send size={18} />
                                        Sí
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {solicitudAEliminar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                    <AlertTriangle className="text-red-600" size={24} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-gray-900">Eliminar solicitud</h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        ¿Seguro que deseas eliminar la solicitud <span className="font-semibold text-gray-700">#{solicitudAEliminar.id_presupuesto}</span>?
                                        Esta acción es permanente y no se puede deshacer.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 bg-gray-50 rounded-xl p-4 text-sm space-y-1.5">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Área / Cargo</span>
                                    <span className="font-medium text-gray-900 text-right">
                                        {solicitudAEliminar.area_nombre || 'N/A'}
                                        {solicitudAEliminar.subarea_nombre ? ` · ${solicitudAEliminar.subarea_nombre}` : ''}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Monto total</span>
                                    <span className="font-semibold text-gray-900">{formatCLP(solicitudAEliminar.monto_total)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Recursos asociados</span>
                                    <span className="font-semibold text-gray-900">{solicitudAEliminar.detalles?.length || 0} items</span>
                                </div>
                            </div>

                            <p className="mt-3 text-xs text-red-600 flex items-center gap-1.5">
                                <AlertTriangle size={14} />
                                Se eliminarán también todos los recursos y datos asociados a esta solicitud.
                            </p>

                            {errorEliminar && (
                                <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                                    {errorEliminar}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                            <button
                                onClick={() => setSolicitudAEliminar(null)}
                                disabled={eliminando}
                                className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleEliminar}
                                disabled={eliminando}
                                className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {eliminando ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Eliminando...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 size={18} />
                                        Eliminar
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
