'use client';

import React, { useState, useEffect } from 'react';
import { Lock, Search, Check, Save, Info, ShieldCheck, Loader2 } from 'lucide-react';
import api from '@/lib/api/client';

interface SeccionRestringida {
    seccion: string;
    label: string;
    id_users: number[];
}

interface Usuario {
    id_user: number;
    nombre: string;
    correo?: string;
    rol?: { nombre?: string; codigo?: string };
    colegio?: { nombre?: string };
}

export default function SeccionesAccesoConfig() {
    const [secciones, setSecciones] = useState<SeccionRestringida[]>([]);
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [loading, setLoading] = useState(true);
    // Selección local por sección (id_users) mientras se edita.
    const [seleccion, setSeleccion] = useState<Record<string, number[]>>({});
    const [busqueda, setBusqueda] = useState<Record<string, string>>({});
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [savedKey, setSavedKey] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [resSec, resUsers] = await Promise.all([
                api.get('/catalogos/secciones-restringidas'),
                api.get('/users').catch(() => ({ data: [] })),
            ]);
            const secs: SeccionRestringida[] = resSec.data || [];
            setSecciones(secs);
            setUsuarios(resUsers.data || []);
            const inicial: Record<string, number[]> = {};
            secs.forEach(s => { inicial[s.seccion] = [...s.id_users]; });
            setSeleccion(inicial);
        } catch (e) {
            console.error('Error cargando secciones restringidas:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const toggle = (seccion: string, id_user: number) => {
        setSeleccion(prev => {
            const actual = prev[seccion] || [];
            const nueva = actual.includes(id_user)
                ? actual.filter(id => id !== id_user)
                : [...actual, id_user];
            return { ...prev, [seccion]: nueva };
        });
        setSavedKey(null);
    };

    const guardar = async (seccion: string) => {
        setSavingKey(seccion);
        setSavedKey(null);
        try {
            await api.put(`/catalogos/secciones-restringidas/${seccion}`, {
                id_users: seleccion[seccion] || [],
            });
            setSavedKey(seccion);
            setTimeout(() => setSavedKey(k => (k === seccion ? null : k)), 2500);
        } catch (e) {
            console.error('Error guardando accesos:', e);
            alert('No se pudo guardar el acceso.');
        } finally {
            setSavingKey(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="animate-spin mr-2" size={18} /> Cargando...
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Aviso */}
            <div className="flex items-start gap-3 p-4 bg-blue-50/70 border border-blue-100 rounded-2xl">
                <Info className="text-primary shrink-0 mt-0.5" size={18} />
                <p className="text-sm text-gray-600">
                    Elige qué usuarios pueden <strong>ver y operar</strong> cada sección restringida.
                    Si no seleccionas a nadie, la sección queda con su comportamiento por rol.
                    En cuanto agregues al menos un usuario, el acceso se limita <strong>solo</strong> a los seleccionados
                    (los administradores siempre conservan acceso).
                </p>
            </div>

            {secciones.length === 0 && (
                <p className="text-sm text-gray-400 italic px-1">No hay secciones restringibles configuradas.</p>
            )}

            {secciones.map(sec => {
                const filtro = (busqueda[sec.seccion] || '').toLowerCase();
                const lista = usuarios.filter(u =>
                    !filtro ||
                    u.nombre.toLowerCase().includes(filtro) ||
                    (u.correo || '').toLowerCase().includes(filtro)
                );
                const seleccionados = seleccion[sec.seccion] || [];
                const sinRestriccion = seleccionados.length === 0;

                return (
                    <div key={sec.seccion} className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                        <div className="p-6 border-b border-gray-50 flex flex-wrap justify-between items-center gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Lock className="text-primary" size={18} />
                                    {sec.label}
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {sinRestriccion
                                        ? 'Sin restricción — acceso según el rol de cada usuario.'
                                        : `${seleccionados.length} usuario(s) con acceso exclusivo.`}
                                </p>
                            </div>
                            <button
                                onClick={() => guardar(sec.seccion)}
                                disabled={savingKey === sec.seccion}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all"
                            >
                                {savingKey === sec.seccion
                                    ? <><Loader2 size={15} className="animate-spin" /> Guardando...</>
                                    : savedKey === sec.seccion
                                        ? <><ShieldCheck size={15} /> Guardado</>
                                        : <><Save size={15} /> Guardar</>}
                            </button>
                        </div>

                        <div className="p-6">
                            {/* Buscador */}
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    type="text"
                                    value={busqueda[sec.seccion] || ''}
                                    onChange={e => setBusqueda(prev => ({ ...prev, [sec.seccion]: e.target.value }))}
                                    placeholder="Buscar usuario por nombre o correo..."
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-80 overflow-y-auto p-1">
                                {lista.map(u => {
                                    const checked = seleccionados.includes(u.id_user);
                                    return (
                                        <label
                                            key={u.id_user}
                                            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${checked ? 'bg-primary/5 border-primary/40' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggle(sec.seccion, u.id_user)}
                                                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary/20"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-sm font-semibold truncate ${checked ? 'text-primary' : 'text-gray-800'}`}>{u.nombre}</p>
                                                <p className="text-[11px] text-gray-400 truncate">
                                                    {u.rol?.nombre || 'Sin rol'}{u.colegio?.nombre ? ` · ${u.colegio.nombre}` : ''}
                                                </p>
                                            </div>
                                            {checked && <Check size={15} className="text-primary shrink-0" />}
                                        </label>
                                    );
                                })}
                                {lista.length === 0 && (
                                    <p className="col-span-full text-xs text-gray-400 italic px-1 py-4 text-center">
                                        No hay usuarios que coincidan.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
