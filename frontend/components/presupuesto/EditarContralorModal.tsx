'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Database, Loader2, Search, X } from 'lucide-react';
import api from '@/lib/api/client';
import { etiquetaDestino } from '@/lib/destinos';

export type ModoEdicionContralor = 'codigo' | 'subvencion' | 'actividad';

export interface DetalleEditable {
    id_pre_detalle: number;
    id_presupuesto: number;
    nombre_producto: string;
    codigo_solicitud?: string;
    colegio_nombre?: string;
    estado_aprobacion?: string;
    id_recurso?: number | null;
    destino_gasto?: string | null;
    codigo_cuenta?: string | null;
    id_subvencion?: number | null;
    subvencion_nombre?: string | null;
    id_actividad?: number | null;
    actividad_nombre?: string | null;
}

interface Subvencion { id_subvencion: number; nombre_corto?: string; nombre?: string }
interface Cuenta { codigo: string; nombre: string; oculta?: boolean }
interface ActividadOpcion { id: number; nombre: string; nombre_accion?: string; dimension?: string; ano_pme?: number; colegio_nombre?: string }

// Las cuentas contables casi no cambian: se descargan una vez y se reutilizan entre
// aperturas del modal (10 min). Solo se guarda lo que usa el modal, no las descripciones.
const CUENTAS_TTL_MS = 10 * 60 * 1000;
let cacheCuentas: { promesa: Promise<Cuenta[]>; desde: number } | null = null;

function obtenerCuentas(): Promise<Cuenta[]> {
    if (cacheCuentas && Date.now() - cacheCuentas.desde < CUENTAS_TTL_MS) return cacheCuentas.promesa;
    const promesa = api.get('/catalogos/cuentas').then(res =>
        (res.data || [])
            .filter((c: Cuenta) => !c.oculta)
            .map((c: Cuenta) => ({ codigo: c.codigo, nombre: c.nombre }))
    );
    cacheCuentas = { promesa, desde: Date.now() };
    promesa.catch(() => { cacheCuentas = null; });  // un error no queda guardado
    return promesa;
}

const TITULOS: Record<ModoEdicionContralor, string> = {
    codigo: 'Cambiar código contable',
    subvencion: 'Cambiar subvención',
    actividad: 'Cambiar actividad PME',
};

/**
 * Corrección del contralor sobre un ítem ya enviado (también aprobado).
 * Paso 1: elegir el nuevo valor. Paso 2: confirmar el cambio (antes → después).
 * El código contable también se guarda en el recurso del catálogo, y así lo avisa.
 */
export default function EditarContralorModal({ detalle, modo, subvenciones, subvencionInicial, onClose, onGuardado }: {
    detalle: DetalleEditable;
    modo: ModoEdicionContralor;
    subvenciones: Subvencion[];
    /** Subvención ya elegida (desde el selector de la tabla): abre directo en la confirmación */
    subvencionInicial?: number | null;
    onClose: () => void;
    onGuardado: (detalleActualizado: any) => void;
}) {
    const [paso, setPaso] = useState<'editar' | 'confirmar'>(subvencionInicial ? 'confirmar' : 'editar');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    const [codigo, setCodigo] = useState(detalle.codigo_cuenta || '');
    const [idSubvencion, setIdSubvencion] = useState<number | null>(subvencionInicial ?? detalle.id_subvencion ?? null);
    const [actividad, setActividad] = useState<ActividadOpcion | null>(
        detalle.id_actividad ? { id: detalle.id_actividad, nombre: detalle.actividad_nombre || `Actividad #${detalle.id_actividad}` } : null
    );

    const [cuentas, setCuentas] = useState<Cuenta[]>([]);
    const [busquedaCuenta, setBusquedaCuenta] = useState('');
    const [actividades, setActividades] = useState<ActividadOpcion[]>([]);
    const [busquedaActividad, setBusquedaActividad] = useState('');
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        if (modo !== 'codigo') return;
        setCargando(true);
        obtenerCuentas()
            .then(setCuentas)
            .catch(() => setError('No se pudieron cargar las cuentas contables.'))
            .finally(() => setCargando(false));
    }, [modo]);

    // Actividades del PME del colegio de la solicitud
    useEffect(() => {
        if (modo !== 'actividad') return;
        setCargando(true);
        api.get('/presupuesto/contralor/actividades', { params: { id_presupuesto: detalle.id_presupuesto } })
            .then(res => setActividades(res.data || []))
            .catch(() => setError('No se pudieron cargar las actividades del PME.'))
            .finally(() => setCargando(false));
    }, [modo, detalle.id_presupuesto]);

    const cuentasFiltradas = useMemo(() => {
        const q = busquedaCuenta.trim().toLowerCase();
        return q ? cuentas.filter(c => c.codigo.includes(q) || (c.nombre || '').toLowerCase().includes(q)) : cuentas;
    }, [cuentas, busquedaCuenta]);

    const actividadesFiltradas = useMemo(() => {
        const q = busquedaActividad.trim().toLowerCase();
        return q
            ? actividades.filter(a => (a.nombre || '').toLowerCase().includes(q) || (a.nombre_accion || '').toLowerCase().includes(q))
            : actividades;
    }, [actividades, busquedaActividad]);

    const nombreSubv = (id?: number | null) => {
        if (!id) return 'Sin subvención';
        const s = subvenciones.find(x => x.id_subvencion === id);
        return s ? (s.nombre_corto || s.nombre || `#${id}`) : `#${id}`;
    };
    const nombreCuenta = (cod?: string | null) => {
        if (!cod) return 'Sin código';
        const c = cuentas.find(x => x.codigo === cod);
        return c ? `${c.codigo} — ${c.nombre}` : cod;
    };

    // Filas "antes → después" de la confirmación
    const cambios: { campo: string; antes: string; despues: string }[] = [];
    if (modo === 'codigo') {
        if (codigo !== (detalle.codigo_cuenta || '')) cambios.push({ campo: 'Código contable', antes: nombreCuenta(detalle.codigo_cuenta), despues: nombreCuenta(codigo) });
        if ((idSubvencion ?? null) !== (detalle.id_subvencion ?? null)) cambios.push({ campo: 'Subvención', antes: nombreSubv(detalle.id_subvencion), despues: nombreSubv(idSubvencion) });
    } else if (modo === 'subvencion') {
        if ((idSubvencion ?? null) !== (detalle.id_subvencion ?? null)) cambios.push({ campo: 'Subvención', antes: detalle.subvencion_nombre || nombreSubv(detalle.id_subvencion), despues: nombreSubv(idSubvencion) });
    } else if ((actividad?.id ?? null) !== (detalle.id_actividad ?? null)) {
        cambios.push({ campo: 'Actividad PME', antes: detalle.actividad_nombre || 'Sin actividad PME', despues: actividad?.nombre || 'Sin actividad PME' });
    }

    // Un cambio de código se guarda también en el recurso del catálogo (para el destino del ítem)
    const actualizaCatalogo = modo === 'codigo' && !!detalle.id_recurso && !!codigo;

    const puedeContinuar = modo === 'codigo' ? !!codigo && cambios.length > 0 : cambios.length > 0;

    const guardar = async () => {
        setGuardando(true);
        setError('');
        try {
            const payload: Record<string, unknown> =
                modo === 'codigo' ? { codigo_cuenta: codigo, id_subvencion: idSubvencion, actualizar_catalogo: actualizaCatalogo }
                    : modo === 'subvencion' ? { id_subvencion: idSubvencion }
                        : actividad ? { id_actividad: actividad.id } : { quitar_actividad: true };
            const { data } = await api.patch(`/presupuesto/detalles/${detalle.id_pre_detalle}/contralor`, payload);
            onGuardado(data);
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'No se pudo guardar el cambio.');
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className={`p-5 flex items-start gap-3 ${paso === 'confirmar' ? 'bg-amber-50' : 'bg-violet-50'}`}>
                    <div className={`p-2.5 rounded-xl ${paso === 'confirmar' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'}`}>
                        {paso === 'confirmar' ? <AlertTriangle size={20} /> : <Database size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-gray-900">{paso === 'confirmar' ? 'Confirmar cambio' : TITULOS[modo]}</h3>
                        <p className="text-xs text-gray-600 font-medium truncate" title={detalle.nombre_producto}>{detalle.nombre_producto}</p>
                        <p className="text-[11px] text-gray-400">
                            {[detalle.codigo_solicitud, detalle.colegio_nombre, detalle.destino_gasto ? `Destino: ${etiquetaDestino(detalle.destino_gasto)}` : null, detalle.estado_aprobacion].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    <button onClick={onClose} disabled={guardando} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg" aria-label="Cerrar">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    {paso === 'editar' && modo === 'codigo' && (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Código contable</label>
                                <div className="relative mb-2">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        value={busquedaCuenta}
                                        onChange={e => setBusquedaCuenta(e.target.value)}
                                        placeholder="Buscar por código o nombre..."
                                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                                    />
                                </div>
                                <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                                    {cargando && <div className="p-4 text-center text-xs text-gray-400"><Loader2 size={14} className="inline animate-spin mr-1" />Cargando cuentas...</div>}
                                    {!cargando && cuentasFiltradas.map(c => (
                                        <button
                                            key={c.codigo}
                                            type="button"
                                            onClick={() => setCodigo(c.codigo)}
                                            className={`w-full text-left px-3 py-2 text-xs flex gap-2 ${codigo === c.codigo ? 'bg-violet-50 text-violet-800 font-bold' : 'hover:bg-gray-50 text-gray-700'}`}
                                        >
                                            <span className="font-mono font-bold shrink-0">{c.codigo}</span>
                                            <span className="truncate">{c.nombre}</span>
                                        </button>
                                    ))}
                                    {!cargando && cuentasFiltradas.length === 0 && <div className="p-4 text-center text-xs text-gray-400 italic">Sin resultados</div>}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Subvención</label>
                                <select
                                    value={idSubvencion ?? ''}
                                    onChange={e => setIdSubvencion(e.target.value ? Number(e.target.value) : null)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                >
                                    {/* Una subvención asignada se cambia por otra, no se quita */}
                                    <option value="" disabled={!!detalle.id_subvencion}>Sin subvención</option>
                                    {subvenciones.map(s => <option key={s.id_subvencion} value={s.id_subvencion}>{s.nombre_corto || s.nombre}</option>)}
                                </select>
                            </div>
                        </>
                    )}

                    {paso === 'editar' && modo === 'subvencion' && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Subvención</label>
                            <select
                                value={idSubvencion ?? ''}
                                onChange={e => setIdSubvencion(e.target.value ? Number(e.target.value) : null)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                            >
                                <option value="" disabled>Elegir subvención</option>
                                {subvenciones.map(s => <option key={s.id_subvencion} value={s.id_subvencion}>{s.nombre_corto || s.nombre}</option>)}
                            </select>
                        </div>
                    )}

                    {paso === 'editar' && modo === 'actividad' && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                Actividad PME {actividades[0]?.colegio_nombre ? `— ${actividades[0].colegio_nombre}` : ''} {actividades[0]?.ano_pme ? `(PME ${actividades[0].ano_pme})` : ''}
                            </label>
                            <div className="relative mb-2">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={busquedaActividad}
                                    onChange={e => setBusquedaActividad(e.target.value)}
                                    placeholder="Buscar actividad o acción..."
                                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                                />
                            </div>
                            <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                                <button
                                    type="button"
                                    onClick={() => setActividad(null)}
                                    className={`w-full text-left px-3 py-2 text-xs ${!actividad ? 'bg-violet-50 text-violet-800 font-bold' : 'hover:bg-gray-50 text-gray-500 italic'}`}
                                >
                                    Sin actividad PME (otros gastos)
                                </button>
                                {cargando && <div className="p-4 text-center text-xs text-gray-400"><Loader2 size={14} className="inline animate-spin mr-1" />Cargando actividades...</div>}
                                {!cargando && actividadesFiltradas.map(a => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => setActividad(a)}
                                        className={`w-full text-left px-3 py-2 text-xs ${actividad?.id === a.id ? 'bg-violet-50 text-violet-800' : 'hover:bg-gray-50 text-gray-700'}`}
                                    >
                                        <div className={actividad?.id === a.id ? 'font-bold' : 'font-semibold'}>{a.nombre}</div>
                                        {(a.nombre_accion || a.dimension) && (
                                            <div className="text-[10px] text-gray-400 truncate">{[a.dimension, a.nombre_accion].filter(Boolean).join(' · ')}</div>
                                        )}
                                    </button>
                                ))}
                                {!cargando && actividades.length === 0 && (
                                    <div className="p-4 text-center text-xs text-gray-400 italic">El colegio de esta solicitud no tiene PME cargado.</div>
                                )}
                            </div>
                        </div>
                    )}

                    {paso === 'confirmar' && (
                        <>
                            <p className="text-sm text-gray-700">Vas a modificar este ítem{detalle.estado_aprobacion === 'Aprobado' ? ', que ya está aprobado' : ''}:</p>
                            <div className="space-y-2">
                                {cambios.map(c => (
                                    <div key={c.campo} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{c.campo}</div>
                                        <div className="flex items-center gap-2 text-xs flex-wrap">
                                            <span className="text-gray-500 line-through">{c.antes}</span>
                                            <ArrowRight size={13} className="text-gray-400 shrink-0" />
                                            <span className="font-bold text-gray-900">{c.despues}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {modo === 'codigo' && (
                                actualizaCatalogo ? (
                                    <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900 flex gap-2">
                                        <Database size={16} className="shrink-0 mt-0.5" />
                                        <div>
                                            <b>También se cambiará el recurso en la base de datos.</b> El insumo «{detalle.nombre_producto}» quedará en el catálogo
                                            con este código y subvención{detalle.destino_gasto ? <> para el destino <b>{etiquetaDestino(detalle.destino_gasto)}</b></> : null}.
                                            Los próximos pedidos de este insumo los usarán; los ítems ya registrados no se modifican.
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-3 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-600">
                                        Este ítem no está ligado a un recurso del catálogo: solo se cambiará en esta solicitud.
                                    </div>
                                )
                            )}
                            <p className="text-[11px] text-gray-400">El cambio queda registrado con tu usuario y la fecha.</p>
                        </>
                    )}

                    {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
                </div>

                <div className="p-4 bg-gray-50 flex justify-end gap-2">
                    {paso === 'confirmar' && !subvencionInicial ? (
                        <button onClick={() => setPaso('editar')} disabled={guardando} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl text-sm font-medium">
                            Volver
                        </button>
                    ) : (
                        <button onClick={onClose} disabled={guardando} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl text-sm font-medium">
                            Cancelar
                        </button>
                    )}
                    {paso === 'editar' ? (
                        <button
                            onClick={() => setPaso('confirmar')}
                            disabled={!puedeContinuar}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium disabled:opacity-40 flex items-center gap-1.5"
                        >
                            Continuar <ArrowRight size={15} />
                        </button>
                    ) : (
                        <button
                            onClick={guardar}
                            disabled={guardando || cambios.length === 0}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                        >
                            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                            Sí, confirmar cambio
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
