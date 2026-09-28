'use client';

import React, { useEffect, useState } from 'react';
import { Share2, X, Loader2, Trash2, AlertCircle, Eye, Pencil } from 'lucide-react';
import api from '@/lib/api/client';
import { BudgetRequest } from '@/lib/types';

interface AreaItem {
    id_area: number;
    nombre: string;
}

interface Comparticion {
    id_compartida: number;
    id_area: number;
    area_nombre: string | null;
    permiso: 'ver' | 'editar';
}

const PERMISOS: { value: 'ver' | 'editar'; label: string; desc: string }[] = [
    { value: 'ver', label: 'Solo ver', desc: 'Puede ver la solicitud y sus ítems, sin modificarlos.' },
    { value: 'editar', label: 'Ver y editar', desc: 'Puede agregar, editar y eliminar ítems de la solicitud.' },
];

const errorDetalle = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

// Modal (solo Administrador): compartir una solicitud de presupuesto con otras áreas
export function CompartirSolicitudModal({ solicitud, onClose }: {
    solicitud: BudgetRequest;
    onClose: () => void;
}) {
    const [areas, setAreas] = useState<AreaItem[]>([]);
    const [compartidas, setCompartidas] = useState<Comparticion[]>([]);
    const [idArea, setIdArea] = useState<number | ''>('');
    const [permiso, setPermiso] = useState<'ver' | 'editar'>('ver');
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [quitando, setQuitando] = useState<number | null>(null);
    const [error, setError] = useState('');

    const id = solicitud.id_presupuesto;

    useEffect(() => {
        Promise.all([
            api.get('/catalogos/areas'),
            api.get(`/presupuesto/solicitudes/${id}/compartir`),
        ])
            .then(([resAreas, resComp]) => {
                setAreas((resAreas.data || []).sort((a: AreaItem, b: AreaItem) => a.nombre.localeCompare(b.nombre)));
                setCompartidas(resComp.data || []);
            })
            .catch(e => setError(errorDetalle(e, 'No se pudo cargar la información.')))
            .finally(() => setCargando(false));
    }, [id]);

    const idsCompartidas = new Set(compartidas.map(c => c.id_area));
    const areasDisponibles = areas.filter(a => !idsCompartidas.has(a.id_area));

    const compartir = async () => {
        if (!idArea) return;
        setGuardando(true);
        setError('');
        try {
            const { data } = await api.post(`/presupuesto/solicitudes/${id}/compartir`, { id_area: idArea, permiso });
            setCompartidas(prev => [...prev.filter(c => c.id_area !== data.id_area), data]);
            setIdArea('');
            setPermiso('ver');
        } catch (e) {
            setError(errorDetalle(e, 'No se pudo compartir la solicitud.'));
        } finally {
            setGuardando(false);
        }
    };

    const cambiarPermiso = async (c: Comparticion, nuevo: 'ver' | 'editar') => {
        setError('');
        try {
            const { data } = await api.post(`/presupuesto/solicitudes/${id}/compartir`, { id_area: c.id_area, permiso: nuevo });
            setCompartidas(prev => prev.map(x => (x.id_area === data.id_area ? data : x)));
        } catch (e) {
            setError(errorDetalle(e, 'No se pudo cambiar el permiso.'));
        }
    };

    const quitar = async (c: Comparticion) => {
        setQuitando(c.id_area);
        setError('');
        try {
            await api.delete(`/presupuesto/solicitudes/${id}/compartir/${c.id_area}`);
            setCompartidas(prev => prev.filter(x => x.id_area !== c.id_area));
        } catch (e) {
            setError(errorDetalle(e, 'No se pudo dejar de compartir.'));
        } finally {
            setQuitando(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Cabecera */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                            <Share2 size={18} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">Compartir solicitud #{id}</h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {solicitud.area_nombre || 'N/A'}{solicitud.subarea_nombre ? ` · ${solicitud.subarea_nombre}` : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 cursor-pointer">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2 flex items-center gap-1.5">
                            <AlertCircle size={14} className="shrink-0" /> {error}
                        </div>
                    )}

                    {/* Nueva compartición */}
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Compartir con el área</label>
                            <select
                                value={idArea}
                                onChange={e => setIdArea(e.target.value ? Number(e.target.value) : '')}
                                disabled={cargando}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                            >
                                <option value="">{cargando ? 'Cargando áreas...' : '-- Selecciona un área --'}</option>
                                {areasDisponibles.map(a => <option key={a.id_area} value={a.id_area}>{a.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Permiso</label>
                            <div className="grid grid-cols-2 gap-2">
                                {PERMISOS.map(p => (
                                    <button
                                        key={p.value}
                                        type="button"
                                        onClick={() => setPermiso(p.value)}
                                        className={`text-left px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${permiso === p.value
                                            ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                                            : 'border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                            {p.value === 'ver' ? <Eye size={13} /> : <Pencil size={13} />} {p.label}
                                        </div>
                                        <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{p.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={compartir}
                            disabled={!idArea || guardando}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                            Compartir
                        </button>
                    </div>

                    {/* Comparticiones actuales */}
                    <div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                            Compartida con ({compartidas.length})
                        </div>
                        {cargando ? (
                            <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-indigo-600" size={22} /></div>
                        ) : compartidas.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">Aún no se ha compartido con ninguna área.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                                {compartidas.map(c => (
                                    <li key={c.id_area} className="flex items-center justify-between gap-2 px-3 py-2.5">
                                        <span className="text-sm font-semibold text-gray-800">{c.area_nombre || `Área ${c.id_area}`}</span>
                                        <div className="flex items-center gap-1.5">
                                            <select
                                                value={c.permiso}
                                                onChange={e => cambiarPermiso(c, e.target.value as 'ver' | 'editar')}
                                                className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer"
                                            >
                                                {PERMISOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                            </select>
                                            <button
                                                onClick={() => quitar(c)}
                                                disabled={quitando === c.id_area}
                                                title="Dejar de compartir"
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
                                            >
                                                {quitando === c.id_area ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl font-semibold text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
