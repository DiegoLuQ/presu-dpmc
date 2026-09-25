'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import { ArrowLeft, Plus, Send, Loader2, Package, Check, AlertCircle, AlertTriangle, X, ArrowRight } from 'lucide-react';
import { Area, Cargo } from '@/lib/types';

export default function CrearSolicitudPage() {
    const { user } = useAuth();
    const router = useRouter();
    
    const [areas, setAreas] = useState<Area[]>([]);
    const [cargos, setSubareas] = useState<Cargo[]>([]);
    
    const [idArea, setIdArea] = useState<number | null>(null);
    const [idSubarea, setIdSubarea] = useState<number | null>(null);
    const [comentario, setComentario] = useState('');
    const [loading, setLoading] = useState(false);
    const [creando, setCreando] = useState(false);

    // Modal de advertencia / solicitud existente
    const [modalAdvertencia, setModalAdvertencia] = useState<{
        abierto: boolean;
        titulo: string;
        mensaje: string;
        codigo?: string;
        area?: string;
        year?: number | string;
        idPresupuesto?: number;
        tipo?: 'warning' | 'error' | 'info';
    } | null>(null);

    // Solicitudes existentes para verificar unicidad por área y año
    const [solicitudesExistentes, setSolicitudesExistentes] = useState<any[]>([]);

    // Todas las cargos con sus áreas (principal + adicionales).
    const [todasSubareas, setTodasSubareas] = useState<any[]>([]);

    // Cargos asignadas al usuario (para derivar qué áreas gestiona).
    const subareasAsignadas = useMemo<any[]>(() => {
        if (!user) return [];
        const list: any[] = [...((user as any).cargos || [])];
        if (user.cargo && !list.some((s: any) => s.id_subarea === user.cargo!.id_subarea)) {
            list.push(user.cargo);
        }
        return list;
    }, [user]);

    // Áreas que gestiona el usuario (las áreas de sus cargos asignadas).
    const userAreas = useMemo<number[]>(() => {
        const ids = new Set<number>();
        subareasAsignadas.forEach((s: any) => {
            const idA = s.area?.id_area ?? s.id_area;
            if (idA) ids.add(idA);
        });
        return Array.from(ids);
    }, [subareasAsignadas]);

    // Si el usuario gestiona alguna área, restringimos a sus cargos.
    const restringido = userAreas.length > 0;

    // Cargos cuya área (principal O adicional) coincide con un área del usuario.
    const misSubareas = useMemo<Cargo[]>(() => {
        if (!restringido) return [];
        return todasSubareas.filter((s: any) => {
            const primaria = s.area?.id_area ?? s.id_area;
            const adicionales = (s.areas_adicionales || []).map((a: any) => a.id_area);
            return userAreas.includes(primaria) || adicionales.some((id: number) => userAreas.includes(id));
        });
    }, [todasSubareas, userAreas, restringido]);

    // Selects del modo no restringido (admin/dirección).
    const areasMostradas = areas;
    const subareasMostradas = cargos;

    const [presupuestosAnuales, setPresupuestosAnuales] = useState<any[]>([]);
    const [idPptoAnual, setIdPptoAnual] = useState<number | null>(null);

    useEffect(() => {
        cargarCatalogos();        // áreas (para selects de admin)
        cargarTodasSubareas();    // todas las cargos con sus áreas (para filtro restringido)
        cargarPresupuestosAnuales();
    }, []);

    const cargarPresupuestosAnuales = async () => {
        try {
            const res = await api.get('/presupuesto/presupuestos-anuales');
            setPresupuestosAnuales(res.data || []);
            if (res.data && res.data.length > 0) {
                // Seleccionar por defecto el primero (más reciente activo)
                setIdPptoAnual(res.data[0].id_presupuesto_anual);
            }
        } catch (error) {
            console.error('Error cargando presupuestos anuales:', error);
        }
    };

    // Cargar solicitudes existentes cuando cambie el presupuesto anual seleccionado
    useEffect(() => {
        if (!idPptoAnual) {
            setSolicitudesExistentes([]);
            return;
        }
        const cargarExistentes = async () => {
            try {
                const res = await api.get(`/presupuesto/solicitudes?id_presupuesto_anual=${idPptoAnual}`);
                setSolicitudesExistentes(res.data || []);
            } catch (error) {
                console.error('Error cargando solicitudes existentes:', error);
            }
        };
        cargarExistentes();
    }, [idPptoAnual]);

    // Detectar si el área seleccionada ya tiene una solicitud para este presupuesto anual
    const solicitudExistente = useMemo(() => {
        if (!idPptoAnual) return null;
        let targetAreaId = idArea;
        if (!targetAreaId && idSubarea) {
            const matched = todasSubareas.find((s: any) => s.id_subarea === idSubarea);
            targetAreaId = matched?.area?.id_area ?? matched?.id_area ?? null;
        }
        if (!targetAreaId && userAreas.length > 0) {
            targetAreaId = userAreas[0];
        }
        if (!targetAreaId) return null;

        const pptoSel = presupuestosAnuales.find((p: any) => p.id_presupuesto_anual === idPptoAnual);
        const year = pptoSel?.year || new Date().getFullYear();

        const match = solicitudesExistentes.find((s: any) => {
            const sAreaId = s.cargo?.area?.id_area || s.cargo?.id_area || s.subarea?.id_area || s.subarea?.area?.id_area;
            return sAreaId === targetAreaId && s.activo !== false;
        });

        if (match) {
            return {
                ...match,
                year,
                area_nombre: match.cargo?.area?.nombre || match.subarea?.area?.nombre || areas.find(a => a.id_area === targetAreaId)?.nombre || 'esta área'
            };
        }
        return null;
    }, [idPptoAnual, idArea, idSubarea, userAreas, todasSubareas, solicitudesExistentes, presupuestosAnuales, areas]);

    useEffect(() => {
        if (!user || !restringido || misSubareas.length === 0) return;
        // La solicitud se crea con la cargo principal del usuario (o la primera).
        const principal = (user.id_subarea && misSubareas.some(s => s.id_subarea === user.id_subarea))
            ? user.id_subarea
            : misSubareas[0]?.id_subarea ?? null;
        setIdSubarea(principal);
        const primera = misSubareas[0] as any;
        setIdArea(primera?.area?.id_area ?? primera?.id_area ?? null);
    }, [user, restringido, misSubareas]);

    const cargarTodasSubareas = async () => {
        try {
            const res = await api.get('/catalogos/cargos');
            setTodasSubareas(res.data);
        } catch (error) {
            console.error('Error cargando cargos:', error);
        }
    };

    const cargarCatalogos = async () => {
        try {
            const res = await api.get('/catalogos/areas');
            setAreas(res.data);
        } catch (error) {
            console.error('Error cargando catálogos:', error);
        }
    };

    const cargarSubareas = async (areaId: number) => {
        try {
            const res = await api.get(`/catalogos/cargos?area=${areaId}`);
            setSubareas(res.data);
        } catch (error) {
            console.error('Error cargando cargos:', error);
        }
    };

    const crearSolicitud = async () => {
        if (!idSubarea) {
            setModalAdvertencia({
                abierto: true,
                titulo: 'Selección Requerida',
                mensaje: 'Por favor seleccione un área y cargo antes de continuar.',
                tipo: 'info'
            });
            return;
        }

        if (solicitudExistente) {
            setModalAdvertencia({
                abierto: true,
                titulo: 'Solicitud Ya Existente',
                mensaje: `Ya existe una solicitud de presupuesto (${solicitudExistente.codigo}) para el área '${solicitudExistente.area_nombre}' en el año ${solicitudExistente.year}. Solo se permite una solicitud por área al año. Comuníquese con Administración si requiere realizar ajustes o solicitar un presupuesto adicional.`,
                codigo: solicitudExistente.codigo,
                idPresupuesto: solicitudExistente.id_presupuesto,
                area: solicitudExistente.area_nombre,
                year: solicitudExistente.year,
                tipo: 'warning'
            });
            return;
        }

        setCreando(true);
        try {
            const pptoSeleccionado = presupuestosAnuales.find((p: any) => p.id_presupuesto_anual === idPptoAnual);
            const res = await api.post('/presupuesto/solicitudes', {
                id_subarea: idSubarea,
                id_colegio: pptoSeleccionado?.id_colegio || undefined,
                comentario: comentario,
                id_presupuesto_anual: idPptoAnual,
                detalles: []
            });
            
            router.push(`/presupuesto/agregar-recursos?id=${res.data.id_presupuesto}`);
        } catch (error: any) {
            const detail = error.response?.data?.detail || 'Error al crear solicitud';
            const codigoMatch = detail.match(/\(([A-Za-z0-9\-]+)\)/);
            const codigo = codigoMatch ? codigoMatch[1] : (solicitudExistente?.codigo || undefined);

            setModalAdvertencia({
                abierto: true,
                titulo: detail.toLowerCase().includes('ya existe') ? 'Solicitud Ya Existente' : 'Atención',
                mensaje: detail,
                codigo: codigo,
                idPresupuesto: solicitudExistente?.id_presupuesto,
                tipo: 'warning'
            });
        } finally {
            setCreando(false);
        }
    };

    return (
        <div className="animate-in fade-in duration-500">
            <div className="mb-6">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
                >
                    <ArrowLeft size={20} />
                    <span className="font-medium">Volver</span>
                </button>
                <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Crear Solicitud de Presupuesto</h2>
                <p className="text-gray-500 mt-1.5 font-medium">Ingrese los datos generales de su solicitud.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Información General</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {restringido ? (
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cargos a tu cargo</label>
                                    <p className="text-xs text-gray-400 mb-3">El presupuesto se creará para todas las cargos bajo tu responsabilidad.</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {misSubareas.map(s => (
                                            <div
                                                key={s.id_subarea}
                                                className="flex items-center gap-3 p-4 rounded-2xl border border-green-200 bg-green-50/50"
                                            >
                                                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-green-500 text-white">
                                                    <Check size={14} strokeWidth={3} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-gray-900 truncate">{s.nombre}</p>
                                                    {s.area?.nombre && <p className="text-[11px] text-gray-400 font-medium truncate">{s.area.nombre}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Área *</label>
                                        <select
                                            value={idArea || ''}
                                            onChange={(e) => {
                                                const nuevoId = Number(e.target.value) || null;
                                                setIdArea(nuevoId);
                                                setIdSubarea(null);
                                                setSubareas([]);
                                                if (nuevoId) cargarSubareas(nuevoId);
                                            }}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                                        >
                                            <option value="">Seleccione un área</option>
                                            {areasMostradas.map(a => (
                                                <option key={a.id_area} value={a.id_area}>{a.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cargo *</label>
                                        <select
                                            value={idSubarea || ''}
                                            onChange={(e) => setIdSubarea(Number(e.target.value) || null)}
                                            disabled={!idArea}
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm disabled:bg-gray-100"
                                        >
                                            <option value="">Seleccione una cargo</option>
                                            {subareasMostradas.map(s => (
                                                <option key={s.id_subarea} value={s.id_subarea}>{s.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                            {presupuestosAnuales.length > 0 && (
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Presupuesto Anual Destino *</label>
                                    <select
                                        value={idPptoAnual || ''}
                                        onChange={(e) => setIdPptoAnual(Number(e.target.value) || null)}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm font-semibold text-gray-900 bg-white"
                                    >
                                        {presupuestosAnuales.map((p: any) => (
                                            <option key={p.id_presupuesto_anual} value={p.id_presupuesto_anual}>
                                                 📅 Presupuesto {p.year} - {p.nombre || `Presupuesto ${p.year}`} {p.colegio_nombre ? `(${p.colegio_nombre})` : ''} {p.estado === 'activo' ? '• Activo' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {solicitudExistente && (
                                <div className="md:col-span-2 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3.5 text-amber-900 animate-in fade-in">
                                    <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-600 font-bold text-base">
                                        ⚠️
                                    </div>
                                    <div className="space-y-1.5 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-bold text-amber-950">
                                                Ya existe una solicitud para tu área ({solicitudExistente.codigo})
                                            </p>
                                            <span className="text-[11px] font-semibold bg-amber-200/70 text-amber-800 px-2 py-0.5 rounded-full">
                                                Presupuesto {solicitudExistente.year}
                                            </span>
                                        </div>
                                        <p className="text-xs text-amber-800 leading-relaxed font-medium">
                                            Solo se permite <strong>una solicitud por área</strong> para este año.
                                            Si requieres realizar modificaciones o solicitar un presupuesto adicional, por favor <strong>comunícate con Administración</strong>.
                                        </p>
                                        <div className="pt-1">
                                            <button
                                                type="button"
                                                onClick={() => router.push(`/presupuesto/agregar-recursos?id=${solicitudExistente.id_presupuesto}`)}
                                                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                                            >
                                                Ver solicitud existente ({solicitudExistente.codigo}) →
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Comentario (opcional)</label>
                                <textarea
                                    value={comentario}
                                    onChange={(e) => setComentario(e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                                    placeholder="Agregue alguna observación o comentario..."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Recursos</h3>
                        <p className="text-gray-600 text-sm mb-4">
                            Después de crear la solicitud, podrá agregar los recursos en la siguiente pantalla.
                        </p>
                        <div className="flex items-center gap-2 text-blue-700">
                            <Package size={18} />
                            <span className="text-sm font-medium">Buscar recursos existentes o crear nuevos</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6 sticky top-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Resumen</h3>
                        
                        <div className="space-y-3 mb-6">
                            {restringido ? (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Cargos a tu cargo:</span>
                                    <span className="font-semibold">{misSubareas.length}</span>
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Área:</span>
                                        <span className="font-semibold">{idArea ? areasMostradas.find(a => a.id_area === idArea)?.nombre : '-'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Cargo:</span>
                                        <span className="font-semibold">{idSubarea ? cargos.find(s => s.id_subarea === idSubarea)?.nombre : '-'}</span>
                                    </div>
                                </>
                            )}
                            {idPptoAnual && (
                                <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
                                    <span className="text-gray-500">Presupuesto Anual:</span>
                                    <span className="font-bold text-primary">
                                        {presupuestosAnuales.find(p => p.id_presupuesto_anual === idPptoAnual)?.nombre || `Presupuesto ${presupuestosAnuales.find(p => p.id_presupuesto_anual === idPptoAnual)?.year}`}
                                    </span>
                                </div>
                            )}
                            {solicitudExistente && (
                                <div 
                                    onClick={() => setModalAdvertencia({
                                        abierto: true,
                                        titulo: 'Solicitud Ya Existente',
                                        mensaje: `Ya existe una solicitud de presupuesto (${solicitudExistente.codigo}) para el área '${solicitudExistente.area_nombre}' en el año ${solicitudExistente.year}. Solo se permite una solicitud por área al año. Comuníquese con Administración si requiere realizar ajustes o solicitar un presupuesto adicional.`,
                                        codigo: solicitudExistente.codigo,
                                        idPresupuesto: solicitudExistente.id_presupuesto,
                                        area: solicitudExistente.area_nombre,
                                        year: solicitudExistente.year,
                                        tipo: 'warning'
                                    })}
                                    className="p-3 bg-amber-50/90 border border-amber-200/90 rounded-2xl text-xs text-amber-900 font-medium cursor-pointer hover:bg-amber-100/80 transition-all flex items-start gap-2.5 shadow-xs"
                                >
                                    <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                                    <div>
                                        <p className="font-bold text-amber-950">Solicitud existente: {solicitudExistente.codigo}</p>
                                        <p className="text-amber-800 text-[11px] mt-0.5">Click para ver detalles o acceder a la solicitud.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => {
                                if (solicitudExistente) {
                                    setModalAdvertencia({
                                        abierto: true,
                                        titulo: 'Solicitud Ya Existente',
                                        mensaje: `Ya existe una solicitud de presupuesto (${solicitudExistente.codigo}) para el área '${solicitudExistente.area_nombre}' en el año ${solicitudExistente.year}. Solo se permite una solicitud por área al año. Comuníquese con Administración si requiere realizar ajustes o solicitar un presupuesto adicional.`,
                                        codigo: solicitudExistente.codigo,
                                        idPresupuesto: solicitudExistente.id_presupuesto,
                                        area: solicitudExistente.area_nombre,
                                        year: solicitudExistente.year,
                                        tipo: 'warning'
                                    });
                                } else {
                                    crearSolicitud();
                                }
                            }}
                            disabled={creando || (!idSubarea && !solicitudExistente)}
                            className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
                                solicitudExistente 
                                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm hover:shadow cursor-pointer'
                                    : 'bg-primary hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                        >
                            {creando ? (
                                <Loader2 size={20} className="animate-spin" />
                            ) : solicitudExistente ? (
                                <>
                                    <AlertTriangle size={18} />
                                    <span>Ver Solicitud Existente</span>
                                </>
                            ) : (
                                <>
                                    <Plus size={20} />
                                    <span>Crear Solicitud</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal de Advertencia / Duplicidad */}
            {modalAdvertencia?.abierto && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setModalAdvertencia(null)}
                >
                    <div 
                        className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header con icono y botón cerrar */}
                        <div className="p-6 pb-3">
                            <div className="flex items-start justify-between">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${
                                    modalAdvertencia.tipo === 'info' 
                                        ? 'bg-blue-50 border border-blue-200/80 text-blue-600'
                                        : 'bg-amber-50 border border-amber-200/80 text-amber-600'
                                }`}>
                                    {modalAdvertencia.tipo === 'info' ? (
                                        <AlertCircle size={24} strokeWidth={2.2} />
                                    ) : (
                                        <AlertTriangle size={24} strokeWidth={2.2} />
                                    )}
                                </div>
                                <button 
                                    onClick={() => setModalAdvertencia(null)}
                                    className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mt-4">
                                {modalAdvertencia.titulo || 'Atención'}
                            </h3>
                        </div>

                        {/* Contenido / Mensaje */}
                        <div className="px-6 pb-6 space-y-4">
                            <p className="text-sm text-gray-600 leading-relaxed">
                                {modalAdvertencia.mensaje}
                            </p>

                            {/* Tarjeta con detalles de la solicitud si aplica */}
                            {modalAdvertencia.codigo && (
                                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2 text-xs">
                                    <div className="flex justify-between items-center text-slate-600">
                                        <span className="font-medium">Código Solicitud:</span>
                                        <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                                            {modalAdvertencia.codigo}
                                        </span>
                                    </div>
                                    {modalAdvertencia.area && (
                                        <div className="flex justify-between items-center text-slate-600">
                                            <span className="font-medium">Área:</span>
                                            <span className="font-semibold text-slate-900">{modalAdvertencia.area}</span>
                                        </div>
                                    )}
                                    {modalAdvertencia.year && (
                                        <div className="flex justify-between items-center text-slate-600">
                                            <span className="font-medium">Año:</span>
                                            <span className="font-semibold text-slate-900">{modalAdvertencia.year}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl text-xs text-blue-900 flex items-start gap-2.5">
                                <span className="font-bold text-blue-700 shrink-0">Nota:</span>
                                <span className="leading-snug">
                                    Para solicitar un presupuesto adicional o realizar cambios sobre la solicitud existente, comuníquese con el equipo de Administración.
                                </span>
                            </div>
                        </div>

                        {/* Footer / Botones */}
                        <div className="bg-gray-50/80 px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setModalAdvertencia(null)}
                                className="px-4 py-2.5 text-sm font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-200/60 rounded-xl transition-colors cursor-pointer"
                            >
                                Entendido
                            </button>
                            {modalAdvertencia.idPresupuesto && (
                                <button
                                    onClick={() => {
                                        setModalAdvertencia(null);
                                        router.push(`/presupuesto/agregar-recursos?id=${modalAdvertencia.idPresupuesto}`);
                                    }}
                                    className="px-4 py-2.5 text-sm font-semibold bg-primary hover:bg-blue-600 text-white rounded-xl shadow-sm hover:shadow flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    <span>Ir a la Solicitud</span>
                                    <ArrowRight size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}