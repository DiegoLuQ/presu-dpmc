'use client';

import React, { useEffect, useState } from 'react';
import {
    X, Loader2, CheckCircle2, Sparkles, Package, AlertTriangle, Layers, Calendar
} from 'lucide-react';
import api from '@/lib/api/client';
import { etiquetaDestino } from '@/lib/destinos';

const formatCLP = (val: number) => `$${Math.round(val || 0).toLocaleString('es-CL')}`;

// Modelo de tokens calibrado contra ai_uso_tokens (gemini-3.1-flash-lite, 3,36
// caracteres por token). Verificado: 15 actividades candidatas → 1.358 estimados
// vs 1.363 medidos; 78 → 4.760 vs 4.722. Sirve para mostrar el costo ANTES de
// gastar, no para facturar.
const TOK_SYSTEM = 428;
const TOK_CABECERA = 120;
// El payload 1x1 manda `descripcion`, `subdimension` y `responsable` (vacíos) por
// actividad; el del lote usa claves cortas y solo lo útil, así que sale más barato
// por actividad aunque lleve MÁS información (dimensión y subdimensión reales).
const TOK_POR_ACTIVIDAD_1X1 = 54;   // medido: 15 acts → 1.363 y 78 acts → 4.722
const TOK_POR_ACTIVIDAD_LOTE = 38;  // medido: 174 acts en un prompt de 7.260 de entrada
const DIMENSIONES_PME = 4;          // el flujo 1x1 filtra por una de las 4 dimensiones
const TOK_INSUMO_EN_LOTE = 55;
const TOK_SALIDA_1X1 = 258;
const TOK_SALIDA_LOTE = 70;
const LOTE = 30;                    // LOTE_PME_MAX del backend

// Las llamadas por lote son largas (prompt grande + reintentos del proveedor). El
// cliente axios no tiene timeout, así que una conexión que se cuelga dejaba el panel
// en "Lote 1 de N…" indefinidamente y sin forma de salir. Con timeout explícito el
// lote falla de forma visible y se puede reintentar solo lo que quedó pendiente.
const TIMEOUT_LOTE_MS = 120_000;

interface RecursoParecido {
    id_recurso: number;
    nombre: string;
    categoria_nombre?: string | null;
    formato?: string | null;
    score: number;
    /** Cuenta a la que rinde este recurso para el destino de la fila. */
    codigo_cuenta?: string | null;
}

interface ActividadSugerida {
    id_actividad: number;
    nombre_actividad: string;
    dimension?: string | null;
    origen: string;
    veces_usado: number;
}

export interface GrupoAnalizado {
    grupo_id: string;
    nombre_producto: string;
    destino_gasto?: string | null;
    dimension_pme?: string | null;
    filas: number[];
    cantidad_filas: number;
    periodos: string[];
    motivos: string[];
    motivos_distintos: boolean;
    total_iva: number;
    cantidad_total: number;
    id_recurso?: number | null;
    recurso_existente: boolean;
    recurso_nombre_catalogo?: string | null;
    recurso_categoria_catalogo?: string | null;
    recursos_parecidos: RecursoParecido[];
    /** Los parecidos rinden a cuentas distintas: la elección NO es indiferente. */
    codigos_parecidos_divergen: boolean;
    codigos_parecidos: string[];
    /** La planilla ya trajo código contable: elegir recurso no cambia la contabilidad. */
    tiene_codigo_propio: boolean;
    codigos_propios: string[];
    ya_vinculado: boolean;
    /** Actividad que alguna fila del grupo ya tiene; las demás la heredan sin IA. */
    id_actividad_grupo: number | null;
    actividad_grupo_nombre: string | null;
    actividad_grupo_dimension: string | null;
    filas_sin_actividad: number;
    actividades_sugeridas: ActividadSugerida[];
    requiere_ia: boolean;
}

export interface AnalisisLote {
    total_filas: number;
    total_grupos: number;
    filas_repetidas: number;
    grupos_resueltos: number;
    grupos_pendientes: number;
    sin_recurso_catalogo: number;
    con_codigo_propio: number;
    /** Actividades del PME vigente del colegio: es lo que domina el prompt. */
    actividades_pme_vigente: number;
    grupos: GrupoAnalizado[];
}

/** Parche a aplicar sobre una fila del borrador, indexado por su posición. */
export type ParchesPorFila = Record<number, {
    id_recurso?: number;
    id_actividad?: number;
    actividad_nombre?: string;
    actividad_dimension?: string;
}>;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Filas del borrador (recursosActual) a analizar. */
    items: any[];
    /** Fase 2: aplica los parches al borrador. Solo toca el navegador, no la BD. */
    onAplicar: (parches: ParchesPorFila) => void;
    /** Catálogo de categorías, para poder corregir lo que propone la IA. */
    categorias: { id_cat_recurso: number; nombre: string }[];
    /** Actividades del PME vigente, para asignar a mano lo que la IA no resolvió. */
    actividadesPME: { id: number; nombre: string; dimension?: string }[];
}

/** Valor centinela del desplegable: crear el insumo como recurso nuevo. */
const CREAR_NUEVO = '__nuevo__';

interface ClasificacionIA {
    id_cat_recurso: number | null;
    categoria_nombre: string | null;
    id_grupo_recurso: number | null;
    grupo_nombre: string | null;
    confianza: number | null;
    razon: string;
}

interface VinculacionIA {
    id_actividad: number | null;
    nombre_actividad: string | null;
    dimension: string | null;
    match_score: number | null;
    no_asociado_pme: boolean;
    justificacion: string;
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * Contexto de un grupo para poder decidir a mano su dimensión PME: destino,
 * categoría del catálogo (o la que se le acaba de proponer), detalle y motivo. Sin
 * esto solo se ve el nombre del insumo, que rara vez alcanza para clasificarlo.
 */
function contextoGrupo(
    g: GrupoAnalizado,
    items: any[],
    categoriaPropuesta?: string | null,
): { linea: string[]; detalle: string; motivo: string } {
    const linea: string[] = [];
    const destino = etiquetaDestino(g.destino_gasto);
    if (destino) linea.push(destino);
    const categoria = g.recurso_categoria_catalogo || categoriaPropuesta;
    if (categoria) linea.push(categoria);
    if (g.dimension_pme) linea.push(`dim. ${g.dimension_pme}`);
    return {
        linea,
        detalle: (items[g.filas[0]]?.descripcion || '').trim(),
        motivo: g.motivos.join(' · '),
    };
}

function etiquetaPeriodo(p: string): string {
    // p viene como "YYYY-MM"
    const mes = parseInt((p || '').slice(5, 7), 10);
    return mes >= 1 && mes <= 12 ? MESES_CORTOS[mes - 1] : (p || '—');
}

export function PrepararInsumosModal({ isOpen, onClose, items, onAplicar, categorias, actividadesPME }: Props) {
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analisis, setAnalisis] = useState<AnalisisLote | null>(null);
    const [filtro, setFiltro] = useState<'todos' | 'pendientes' | 'resueltos' | 'sin_catalogo'>('todos');
    const [expandido, setExpandido] = useState<string | null>(null);
    // Recurso del catálogo elegido para los grupos sin coincidencia exacta.
    // '' = sin decidir (no se aplica nada a ese grupo); CREAR_NUEVO = darlo de alta.
    const [eleccionRecurso, setEleccionRecurso] = useState<Record<string, string>>({});
    // Fase 2b: clasificación propuesta por la IA para los que se van a crear.
    const [clasificaciones, setClasificaciones] = useState<Record<string, ClasificacionIA>>({});
    const [clasificando, setClasificando] = useState(false);
    const [creando, setCreando] = useState(false);
    const [avisoCreacion, setAvisoCreacion] = useState<string | null>(null);
    // Fase 3: actividad PME propuesta por la IA para los grupos que la necesitan,
    // y qué grupos aceptó el usuario (se aceptan solos los de score alto).
    const [vinculaciones, setVinculaciones] = useState<Record<string, VinculacionIA>>({});
    const [aceptadas, setAceptadas] = useState<Record<string, boolean>>({});
    const [asesorando, setAsesorando] = useState(false);
    const [progresoAsesoria, setProgresoAsesoria] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let vigente = true;
        setCargando(true);
        setError(null);
        setAnalisis(null);
        api.post('/presupuesto/insumos/analizar-lote', {
            items: items.map(r => ({
                nombre_producto: r.nombre_producto,
                descripcion: r.descripcion || null,
                motivo: r.motivo || null,
                destino_gasto: r.destino_gasto || null,
                dimension_pme: r.dimension_pme || null,
                codigo_cuenta: r.codigo_cuenta || null,
                id_recurso: r.id_recurso ?? null,
                id_actividad: r.id_actividad ?? null,
                cantidad: r.cantidad ?? null,
                valor_unitario_iva: r.valor_unitario_iva ?? null,
                total_iva: r.total_iva ?? null,
                fecha_ejecucion: r.fecha_ejecucion || null,
                tipo_fecha: r.tipo_fecha || null,
            })),
        }).then(res => {
            if (vigente) {
                setAnalisis(res.data);
                setEleccionRecurso({});
                setClasificaciones({});
                setAvisoCreacion(null);
                setVinculaciones({});
                setAceptadas({});
                setProgresoAsesoria(null);
            }
        }).catch(err => {
            if (vigente) setError(err.response?.data?.detail || 'No se pudo analizar el borrador.');
        }).finally(() => {
            if (vigente) setCargando(false);
        });
        return () => { vigente = false; };
    }, [isOpen, items]);

    if (!isOpen) return null;

    const gruposFiltrados = (analisis?.grupos || []).filter(g => {
        if (filtro === 'pendientes') return g.requiere_ia;
        if (filtro === 'resueltos') return !g.requiere_ia;
        if (filtro === 'sin_catalogo') return !g.id_recurso;
        return true;
    });

    // Comparativa de consumo: el flujo actual (una consulta por fila) vs el lote
    // sobre los grupos que de verdad necesitan IA.
    const p = analisis?.grupos_pendientes ?? 0;
    const actsCatalogo = analisis?.actividades_pme_vigente ?? 0;
    const actsPorDimension = actsCatalogo / DIMENSIONES_PME;
    const tok1x1Filas = analisis
        ? analisis.total_filas * (TOK_SYSTEM + TOK_CABECERA + Math.round(actsPorDimension * TOK_POR_ACTIVIDAD_1X1) + TOK_SALIDA_1X1)
        : 0;
    const llamadasLote = Math.ceil(p / LOTE);
    const tokLote = llamadasLote * (TOK_SYSTEM + 120 + actsCatalogo * TOK_POR_ACTIVIDAD_LOTE)
        + p * (TOK_INSUMO_EN_LOTE + TOK_SALIDA_LOTE);
    const factor = tokLote > 0 ? tok1x1Filas / tokLote : 0;

    // ── Fase 2: qué se aplicaría al borrador ──
    // Recurso: la coincidencia exacta se aplica sola; para los grupos con solo
    // parecidos se aplica lo que el usuario haya elegido en el desplegable.
    // Actividad PME: la primera de `actividades_sugeridas` (vienen ordenadas:
    // historial antes que Plan PME, y las más usadas primero).
    // Grupos marcados para darse de alta en el catálogo (Fase 2b): los "Sin
    // coincidencia" se marcan solos, porque no hay alternativa; los que tienen
    // parecidos solo si el usuario eligió "Crear como nuevo" a propósito.
    const gruposACrear = (analisis?.grupos || []).filter(g => {
        if (g.id_recurso) return false;
        if (g.recursos_parecidos.length === 0) return true;
        return eleccionRecurso[g.grupo_id] === CREAR_NUEVO;
    });
    const sinClasificar = gruposACrear.filter(g => !clasificaciones[g.grupo_id]?.id_cat_recurso).length;

    const parches: ParchesPorFila = {};
    let filasConRecurso = 0;
    let filasConActividad = 0;
    for (const g of analisis?.grupos || []) {
        const elegido = eleccionRecurso[g.grupo_id];
        const idRecurso = g.id_recurso
            ?? (elegido && elegido !== CREAR_NUEVO ? parseInt(elegido) : undefined);
        // Actividad del grupo, en orden de prioridad:
        //  1. la que YA tiene alguna fila del grupo (las demás la heredan, gratis);
        //  2. la resuelta por historial o Plan PME;
        //  3. la que sugirió la IA y el usuario aceptó (o eligió a mano).
        const heredada = g.id_actividad_grupo
            ? {
                id_actividad: g.id_actividad_grupo,
                nombre_actividad: g.actividad_grupo_nombre || '',
                dimension: g.actividad_grupo_dimension,
            }
            : null;
        const sinIA = !heredada && g.actividades_sugeridas.length > 0
            ? g.actividades_sugeridas[0] : null;
        const conIA = vinculaciones[g.grupo_id];
        const act = heredada || sinIA || (
            aceptadas[g.grupo_id] && conIA?.id_actividad
                ? { id_actividad: conIA.id_actividad, nombre_actividad: conIA.nombre_actividad || '', dimension: conIA.dimension }
                : null
        );
        if (!idRecurso && !act) continue;
        for (const fila of g.filas) {
            const parche: ParchesPorFila[number] = {};
            if (idRecurso && !items[fila]?.id_recurso) {
                parche.id_recurso = idRecurso;
                filasConRecurso++;
            }
            // Solo se cuenta y se escribe donde falta: una fila que ya tiene la
            // actividad no necesita parche.
            if (act && !items[fila]?.id_actividad) {
                parche.id_actividad = act.id_actividad!;
                parche.actividad_nombre = act.nombre_actividad || '';
                parche.actividad_dimension = act.dimension || '';
                filasConActividad++;
            }
            if (Object.keys(parche).length > 0) parches[fila] = parche;
        }
    }
    const totalFilasAfectadas = Object.keys(parches).length;

    // ── Fase 3: vincular a actividad PME por lote ──
    const gruposParaIA = (analisis?.grupos || []).filter(g => g.requiere_ia);

    const asesorarPME = async () => {
        // Solo los que aún no tienen sugerencia: si un lote falló antes, al volver a
        // pulsar se reintenta únicamente lo que falta, sin repagar lo ya resuelto.
        const pendientes = gruposParaIA.filter(g => !vinculaciones[g.grupo_id]);
        if (pendientes.length === 0) return;

        setAsesorando(true);
        setProgresoAsesoria(null);
        const proveedorOverride = localStorage.getItem('ai_provider_override');

        // Los lotes se arman por DIMENSIÓN declarada: cuando el Excel la trae, a la IA
        // se le ofrecen solo las actividades de esa dimensión, así elige entre ~25 en
        // vez de ~193 y el prompt baja a una cuarta parte. Las filas sin dimensión van
        // en su propio lote contra el catálogo completo.
        const porDimension = new Map<string, GrupoAnalizado[]>();
        for (const g of pendientes) {
            const dim = (g.dimension_pme || '').trim();
            if (!porDimension.has(dim)) porDimension.set(dim, []);
            porDimension.get(dim)!.push(g);
        }
        const lotes: { dimension: string; grupos: GrupoAnalizado[] }[] = [];
        for (const [dim, grupos] of porDimension) {
            for (let i = 0; i < grupos.length; i += LOTE) {
                lotes.push({ dimension: dim, grupos: grupos.slice(i, i + LOTE) });
            }
        }

        let resueltos = 0;
        let fallo: string | null = null;

        for (let l = 0; l < lotes.length; l++) {
            const nLote = l + 1;
            const { dimension, grupos: trozo } = lotes[l];
            setProgresoAsesoria(
                `Lote ${nLote} de ${lotes.length}${dimension ? ` · ${dimension}` : ' · sin dimensión declarada'}…`
            );
            try {
                const res = await api.post('/ai/asesorar-actividades-pme-lote', {
                    proveedor_override: proveedorOverride,
                    dimension: dimension || null,
                    insumos: trozo.map((g, idx) => ({
                        ref: idx,
                        nombre: g.nombre_producto,
                        descripcion: items[g.filas[0]]?.descripcion || '',
                        motivo: g.motivos[0] || '',
                        destino: g.destino_gasto || '',
                    })),
                }, { timeout: TIMEOUT_LOTE_MS });
                const nuevas: Record<string, VinculacionIA> = {};
                const nuevasAceptadas: Record<string, boolean> = {};
                for (const v of (res.data.vinculaciones || [])) {
                    const g = trozo[v.ref];
                    if (!g) continue;
                    nuevas[g.grupo_id] = v;
                    // Se preaceptan solo las de afinidad alta; el resto queda para
                    // revisión manual, que es el punto de la Fase 4.
                    nuevasAceptadas[g.grupo_id] = !v.no_asociado_pme && (v.match_score ?? 0) >= 70;
                    resueltos++;
                }
                // Se guarda lote por lote: si el siguiente falla (un 503 del proveedor,
                // por ejemplo), lo ya conseguido —y pagado— no se pierde.
                setVinculaciones(prev => ({ ...prev, ...nuevas }));
                setAceptadas(prev => ({ ...prev, ...nuevasAceptadas }));
            } catch (err: any) {
                fallo = err.code === 'ECONNABORTED'
                    ? `El lote ${nLote} superó los ${TIMEOUT_LOTE_MS / 1000}s sin respuesta.`
                    : (err.response?.data?.detail || 'No se pudo asesorar con la IA.');
                break;
            }
        }

        setAsesorando(false);
        if (fallo) {
            const faltan = pendientes.length - resueltos;
            setProgresoAsesoria(
                `${resueltos} resuelto(s) y guardado(s). Quedan ${faltan} sin asesorar: ${fallo} ` +
                `Vuelve a pulsar "Asesorar" para reintentar solo los que faltan.`
            );
        } else {
            setProgresoAsesoria(
                `${resueltos} de ${pendientes.length} con respuesta · ` +
                `revisa las de afinidad baja y pulsa Aplicar.`
            );
        }
    };

    // ── Fase 2b: clasificar con la IA en un solo lote y crear los recursos ──
    const LOTE_CLASIFICACION = 40;

    const clasificarConIA = async () => {
        if (gruposACrear.length === 0) return;
        setClasificando(true);
        setAvisoCreacion(null);
        try {
            const proveedorOverride = localStorage.getItem('ai_provider_override');
            const resultado: Record<string, ClasificacionIA> = {};
            // El catálogo de categorías se paga una vez por llamada, así que se manda
            // el lote más grande que acepta el endpoint.
            for (let i = 0; i < gruposACrear.length; i += LOTE_CLASIFICACION) {
                const trozo = gruposACrear.slice(i, i + LOTE_CLASIFICACION);
                const res = await api.post('/ai/clasificar-insumos-lote', {
                    proveedor_override: proveedorOverride,
                    insumos: trozo.map((g, idx) => ({
                        ref: idx,
                        nombre: g.nombre_producto,
                        descripcion: items[g.filas[0]]?.descripcion || '',
                        motivo: g.motivos[0] || '',
                        destino: g.destino_gasto || '',
                    })),
                }, { timeout: TIMEOUT_LOTE_MS });
                for (const c of (res.data.clasificaciones || [])) {
                    const g = trozo[c.ref];
                    if (g) resultado[g.grupo_id] = c;
                }
            }
            setClasificaciones(prev => ({ ...prev, ...resultado }));
        } catch (err: any) {
            setAvisoCreacion(err.response?.data?.detail || 'No se pudo clasificar con la IA.');
        } finally {
            setClasificando(false);
        }
    };

    const crearRecursos = async () => {
        const listos = gruposACrear.filter(g => clasificaciones[g.grupo_id]?.id_cat_recurso);
        if (listos.length === 0) return;
        setCreando(true);
        setAvisoCreacion(null);
        try {
            const res = await api.post('/presupuesto/recursos/sugerir-lote', {
                recursos: listos.map((g, idx) => ({
                    ref: idx,
                    nombre: g.nombre_producto,
                    descripcion_solicitud: items[g.filas[0]]?.descripcion || g.motivos[0] || g.nombre_producto,
                    formato: items[g.filas[0]]?.formato_unidad || 'Unidad',
                    id_cat_recurso: clasificaciones[g.grupo_id].id_cat_recurso,
                    id_grupo_recurso: clasificaciones[g.grupo_id].id_grupo_recurso,
                })),
            });
            // Los recién creados se aplican al borrador de inmediato, junto con lo que
            // ya estaba resuelto, para no perder el trabajo si se cierra el modal.
            const nuevos: ParchesPorFila = { ...parches };
            const asignar = (ref: number, idRecurso: number) => {
                const g = listos[ref];
                if (!g) return;
                for (const fila of g.filas) {
                    nuevos[fila] = { ...(nuevos[fila] || {}), id_recurso: idRecurso };
                }
            };
            for (const c of (res.data.creados || [])) asignar(c.ref, c.id_recurso);
            for (const c of (res.data.reutilizados || [])) asignar(c.ref, c.id_recurso);

            onAplicar(nuevos);
            const nCreados = (res.data.creados || []).length;
            const nReuso = (res.data.reutilizados || []).length;
            setAvisoCreacion(
                `${nCreados} recurso(s) creados como pendientes de aprobación` +
                (nReuso > 0 ? ` y ${nReuso} reutilizados porque ya existían` : '') +
                '. Aplicados al borrador.'
            );
            onClose();
        } catch (err: any) {
            setAvisoCreacion(err.response?.data?.detail || 'No se pudieron crear los recursos.');
        } finally {
            setCreando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-lg flex items-center justify-center z-[200] p-4 sm:p-8 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4 bg-slate-50/60 shrink-0">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-0.5">Fase 1 · Sin IA, sin escribir nada</p>
                        <h3 className="text-[15px] font-bold text-gray-900">Preparar insumos del borrador</h3>
                        <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                            Agrupa las filas equivalentes, las cruza con el catálogo oficial y detecta las que ya tienen actividad PME.
                        </p>
                    </div>
                    <button onClick={onClose} className="shrink-0 p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-gray-700">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
                    {cargando && (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                            <Loader2 size={32} className="animate-spin text-primary" />
                            <p className="text-[12px] font-bold">Analizando {items.length} fila(s)…</p>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2.5 p-4 bg-red-50 border border-red-200 rounded-2xl">
                            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                            <p className="text-[12px] font-semibold text-red-800">{error}</p>
                        </div>
                    )}

                    {analisis && !cargando && (
                        <>
                            {/* Resumen */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { label: 'Filas del borrador', valor: analisis.total_filas, icono: <Package size={14} />, color: 'text-gray-900 bg-gray-50 border-gray-200' },
                                    { label: 'Grupos a evaluar', valor: analisis.total_grupos, icono: <Layers size={14} />, color: 'text-primary bg-primary/5 border-primary/20' },
                                    { label: 'Ya resueltos sin IA', valor: analisis.grupos_resueltos, icono: <CheckCircle2 size={14} />, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                                    { label: 'Pendientes de IA', valor: analisis.grupos_pendientes, icono: <Sparkles size={14} />, color: 'text-violet-700 bg-violet-50 border-violet-200' },
                                ].map(c => (
                                    <div key={c.label} className={`p-3.5 rounded-2xl border ${c.color}`}>
                                        <div className="flex items-center gap-1.5 opacity-70">
                                            {c.icono}
                                            <span className="text-[9px] font-bold uppercase tracking-wider">{c.label}</span>
                                        </div>
                                        <p className="text-2xl font-extrabold tabular-nums mt-1">{c.valor}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                                <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                                    {analisis.filas_repetidas} fila(s) se repiten entre sí
                                </span>
                                <span className="px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-200">
                                    {analisis.sin_recurso_catalogo} grupo(s) sin recurso del catálogo oficial
                                </span>
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {analisis.con_codigo_propio} grupo(s) ya traen código contable del Excel
                                </span>
                            </div>

                            {/* Estimación de consumo */}
                            <div className="p-4 bg-violet-50/60 border border-violet-200 rounded-2xl space-y-1.5">
                                <p className="text-[10px] font-extrabold text-violet-900 uppercase tracking-widest flex items-center gap-1.5">
                                    <Sparkles size={12} /> Consumo estimado de la asesoría
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
                                    <div>
                                        <p className="text-gray-500 font-medium">Una consulta por fila (hoy)</p>
                                        <p className="font-extrabold text-gray-900 tabular-nums">{tok1x1Filas.toLocaleString('es-CL')} tokens</p>
                                        <p className="text-[10px] text-gray-400">{analisis.total_filas} llamadas</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 font-medium">Por lote, solo los pendientes</p>
                                        <p className="font-extrabold text-violet-800 tabular-nums">{tokLote.toLocaleString('es-CL')} tokens</p>
                                        <p className="text-[10px] text-gray-400">{llamadasLote} llamada(s) de hasta {LOTE}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 font-medium">Diferencia</p>
                                        <p className="font-extrabold text-emerald-700 tabular-nums">
                                            {factor > 0 ? `${factor.toFixed(1)}× menos` : '—'}
                                        </p>
                                        <p className="text-[10px] text-gray-400">
                                            estimación sobre {actsCatalogo} actividades del PME
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Fase 2b: alta en el catálogo de los insumos que no existen */}
                            {gruposACrear.length > 0 && (
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wider">
                                                {gruposACrear.length} insumo(s) a crear en el catálogo
                                            </p>
                                            <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                                                Sin coincidencia ni parecido elegido. Se crean como <b>pendientes de aprobación</b>,
                                                con la categoría propuesta por la IA en {Math.ceil(gruposACrear.length / LOTE_CLASIFICACION)} llamada(s).
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={clasificarConIA}
                                                disabled={clasificando || creando}
                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold transition-all active:scale-95 disabled:opacity-40"
                                            >
                                                {clasificando ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                                {clasificando ? 'Clasificando…' : 'Clasificar con IA'}
                                            </button>
                                            <button
                                                onClick={crearRecursos}
                                                disabled={creando || clasificando || sinClasificar === gruposACrear.length}
                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-[11px] font-bold transition-all active:scale-95 disabled:opacity-40"
                                                title={sinClasificar > 0 ? `${sinClasificar} sin categoría: se omitirán` : undefined}
                                            >
                                                {creando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                                Crear {gruposACrear.length - sinClasificar}
                                            </button>
                                        </div>
                                    </div>

                                    {avisoCreacion && (
                                        <p className="text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2">
                                            {avisoCreacion}
                                        </p>
                                    )}

                                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto custom-scrollbar">
                                        {gruposACrear.map(g => {
                                            const c = clasificaciones[g.grupo_id];
                                            const dudosa = c?.confianza != null && c.confianza < 60;
                                            return (
                                                <div key={g.grupo_id} className="flex items-start gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 flex-wrap">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[11px] font-bold text-gray-900">
                                                            {g.nombre_producto}
                                                            <span className="text-gray-400 font-medium"> · {g.cantidad_filas} fila(s)</span>
                                                        </p>
                                                        {/* Detalle y motivo: es lo que permite juzgar si la categoría
                                                            propuesta por la IA tiene sentido antes de crear el recurso. */}
                                                        {(() => {
                                                            const ctx = contextoGrupo(g, items);
                                                            return (
                                                                <>
                                                                    {ctx.linea.length > 0 && (
                                                                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">
                                                                            {ctx.linea.join(' · ')}
                                                                        </p>
                                                                    )}
                                                                    {ctx.detalle && <p className="text-[10px] text-gray-600">{ctx.detalle}</p>}
                                                                    {ctx.motivo && (
                                                                        <p className="text-[10px] text-gray-500 italic">Motivo: “{ctx.motivo}”</p>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                    {/* La categoría propuesta se puede corregir antes de crear. */}
                                                    <select
                                                        value={c?.id_cat_recurso ?? ''}
                                                        onChange={e => setClasificaciones(prev => ({
                                                            ...prev,
                                                            [g.grupo_id]: {
                                                                ...(prev[g.grupo_id] || {
                                                                    id_grupo_recurso: null, grupo_nombre: null,
                                                                    confianza: null, razon: 'Elegida a mano.',
                                                                }),
                                                                id_cat_recurso: e.target.value ? parseInt(e.target.value) : null,
                                                                categoria_nombre: categorias.find(cat => cat.id_cat_recurso === parseInt(e.target.value))?.nombre ?? null,
                                                            } as ClasificacionIA,
                                                        }))}
                                                        className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border max-w-[260px] focus:outline-none cursor-pointer ${c?.id_cat_recurso ? (dudosa ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-emerald-50 border-emerald-300 text-emerald-800') : 'bg-gray-50 border-gray-300 text-gray-500'}`}
                                                    >
                                                        <option value="">— sin categoría (no se creará) —</option>
                                                        {categorias.map(cat => (
                                                            <option key={cat.id_cat_recurso} value={cat.id_cat_recurso}>{cat.nombre}</option>
                                                        ))}
                                                    </select>
                                                    {c?.confianza != null && (
                                                        <span
                                                            className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${dudosa ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}
                                                            title={c.razon}
                                                        >
                                                            {c.confianza}%
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Fase 3: vinculación a actividad PME por lote */}
                            {gruposParaIA.length > 0 && (
                                <div className="p-4 bg-violet-50/50 border border-violet-200 rounded-2xl space-y-3">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-extrabold text-violet-900 uppercase tracking-wider">
                                                {gruposParaIA.length} grupo(s) sin actividad PME
                                            </p>
                                            {(() => {
                                                const conDim = gruposParaIA.filter(g => (g.dimension_pme || '').trim()).length;
                                                const sinDim = gruposParaIA.length - conDim;
                                                return (
                                                    <p className="text-[10px] text-violet-700/80 font-medium mt-0.5">
                                                        {conDim > 0 && (
                                                            <>
                                                                {conDim} grupo(s) traen dimensión declarada en el Excel: se comparan solo
                                                                contra las actividades de esa dimensión.{' '}
                                                            </>
                                                        )}
                                                        {sinDim > 0 && (
                                                            <>
                                                                {sinDim} sin dimensión: la IA elige entre las {actsCatalogo} del PME e infiere la dimensión.
                                                            </>
                                                        )}
                                                    </p>
                                                );
                                            })()}
                                        </div>
                                        {(() => {
                                            const faltan = gruposParaIA.filter(g => !vinculaciones[g.grupo_id]).length;
                                            return (
                                                <button
                                                    onClick={asesorarPME}
                                                    disabled={asesorando || clasificando || creando || faltan === 0}
                                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold transition-all active:scale-95 disabled:opacity-40 shrink-0"
                                                >
                                                    {asesorando ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                                    {asesorando
                                                        ? 'Asesorando…'
                                                        : faltan === 0
                                                            ? 'Todos asesorados'
                                                            : `Asesorar ${faltan} con IA`}
                                                </button>
                                            );
                                        })()}
                                    </div>

                                    {progresoAsesoria && (
                                        <p className="text-[11px] font-semibold text-violet-900 bg-white border border-violet-200 rounded-xl px-3 py-2">
                                            {progresoAsesoria}
                                        </p>
                                    )}

                                    {Object.keys(vinculaciones).length > 0 && (() => {
                                        const conRespuesta = gruposParaIA.filter(g => vinculaciones[g.grupo_id]);
                                        const sinAceptar = conRespuesta.filter(g => !aceptadas[g.grupo_id]);
                                        const filasSinAceptar = sinAceptar.reduce((a, g) => a + g.cantidad_filas, 0);
                                        return (
                                            <>
                                                {sinAceptar.length > 0 && (
                                                    <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex-wrap">
                                                        <p className="text-[10px] font-bold text-amber-900">
                                                            {sinAceptar.length} grupo(s) sin aceptar ({filasSinAceptar} fila(s)) quedarán SIN actividad.
                                                            Solo se preaceptan las de afinidad ≥70%.
                                                        </p>
                                                        <button
                                                            onClick={() => setAceptadas(prev => {
                                                                const next = { ...prev };
                                                                for (const g of sinAceptar) {
                                                                    if (vinculaciones[g.grupo_id]?.id_actividad) next[g.grupo_id] = true;
                                                                }
                                                                return next;
                                                            })}
                                                            className="text-[10px] font-extrabold text-amber-900 underline shrink-0"
                                                        >
                                                            Aceptar todas las que tengan actividad
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="space-y-1.5 max-h-[260px] overflow-y-auto custom-scrollbar">
                                                    {conRespuesta.map(g => {
                                                        const v = vinculaciones[g.grupo_id];
                                                        const score = v.match_score ?? 0;
                                                        const tieneActividad = !!v.id_actividad;
                                                        return (
                                                            <div
                                                                key={g.grupo_id}
                                                                className={`flex items-start gap-2.5 bg-white border rounded-xl px-3 py-2 ${tieneActividad ? 'border-violet-200' : 'border-amber-200'}`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    disabled={!tieneActividad}
                                                                    checked={!!aceptadas[g.grupo_id]}
                                                                    onChange={e => setAceptadas(prev => ({ ...prev, [g.grupo_id]: e.target.checked }))}
                                                                    className="w-3.5 h-3.5 accent-violet-600 shrink-0 mt-1"
                                                                    title={tieneActividad ? 'Aplicar esta actividad al grupo' : 'Elige una actividad para poder aceptarla'}
                                                                />
                                                                <div className="min-w-0 flex-1 space-y-1">
                                                                    <p className="text-[11px] font-bold text-gray-900">
                                                                        {g.nombre_producto}
                                                                        <span className="text-gray-400 font-medium"> · {g.cantidad_filas} fila(s)</span>
                                                                    </p>
                                                                    {/* Contexto para decidir la dimensión a mano. */}
                                                                    {(() => {
                                                                        const ctx = contextoGrupo(g, items, clasificaciones[g.grupo_id]?.categoria_nombre);
                                                                        return (
                                                                            <>
                                                                                {ctx.linea.length > 0 && (
                                                                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">
                                                                                        {ctx.linea.join(' · ')}
                                                                                    </p>
                                                                                )}
                                                                                {ctx.detalle && (
                                                                                    <p className="text-[10px] text-gray-600">{ctx.detalle}</p>
                                                                                )}
                                                                                {ctx.motivo && (
                                                                                    <p className="text-[10px] text-gray-500 italic">
                                                                                        Motivo: “{ctx.motivo}”
                                                                                    </p>
                                                                                )}
                                                                            </>
                                                                        );
                                                                    })()}
                                                                    {!tieneActividad && (
                                                                        <p className="text-[10px] font-semibold text-amber-700">
                                                                            La IA lo dio por no asociado: {v.justificacion}
                                                                        </p>
                                                                    )}
                                                                    {/* La decisión de la IA siempre se puede cambiar a mano: si dijo
                                                                        "no asociado" pero el insumo sí pertenece a una actividad
                                                                        (agua o café dentro de una acción de clima laboral, por
                                                                        ejemplo), aquí se elige y deja de estar bloqueado. */}
                                                                    <select
                                                                        value={v.id_actividad ?? ''}
                                                                        onChange={e => {
                                                                            const id = e.target.value ? parseInt(e.target.value) : null;
                                                                            const act = actividadesPME.find(a => a.id === id);
                                                                            setVinculaciones(prev => ({
                                                                                ...prev,
                                                                                [g.grupo_id]: {
                                                                                    ...prev[g.grupo_id],
                                                                                    id_actividad: id,
                                                                                    nombre_actividad: act?.nombre ?? null,
                                                                                    dimension: act?.dimension ?? null,
                                                                                    no_asociado_pme: id === null,
                                                                                    justificacion: id === null
                                                                                        ? prev[g.grupo_id].justificacion
                                                                                        : 'Elegida a mano.',
                                                                                },
                                                                            }));
                                                                            setAceptadas(prev => ({ ...prev, [g.grupo_id]: id !== null }));
                                                                        }}
                                                                        className={`w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer focus:outline-none ${tieneActividad ? 'bg-violet-50 border-violet-300 text-violet-900' : 'bg-amber-50 border-amber-300 text-amber-900'}`}
                                                                    >
                                                                        <option value="">— sin actividad (no asociado a PME) —</option>
                                                                        {actividadesPME.map(a => (
                                                                            <option key={a.id} value={a.id}>
                                                                                {a.dimension ? `[${a.dimension}] ` : ''}{a.nombre}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                    {tieneActividad && (
                                                                        <p className="text-[9px] text-gray-500 italic">{v.justificacion}</p>
                                                                    )}
                                                                </div>
                                                                {v.match_score != null && (
                                                                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0 mt-1 ${score >= 70 ? 'bg-emerald-100 text-emerald-700' : score > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>
                                                                        {score}%
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Filtros */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {([
                                    ['todos', `Todos (${analisis.total_grupos})`],
                                    ['pendientes', `Pendientes de IA (${analisis.grupos_pendientes})`],
                                    ['resueltos', `Resueltos (${analisis.grupos_resueltos})`],
                                    ['sin_catalogo', `Sin catálogo (${analisis.sin_recurso_catalogo})`],
                                ] as const).map(([key, label]) => (
                                    <button
                                        key={key}
                                        onClick={() => setFiltro(key)}
                                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${filtro === key ? 'bg-primary text-white shadow-sm' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-gray-300'}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* Grupos */}
                            <div className="border border-gray-100 rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-2.5">Insumo</th>
                                            <th className="px-3 py-2.5 text-center">Filas</th>
                                            <th className="px-3 py-2.5">Períodos</th>
                                            <th className="px-3 py-2.5">Destino</th>
                                            <th className="px-4 py-2.5">Catálogo oficial</th>
                                            <th className="px-4 py-2.5">Actividad PME</th>
                                            <th className="px-3 py-2.5 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-xs">
                                        {gruposFiltrados.map(g => {
                                            const abierto = expandido === g.grupo_id;
                                            return (
                                                <React.Fragment key={g.grupo_id}>
                                                    <tr
                                                        onClick={() => setExpandido(abierto ? null : g.grupo_id)}
                                                        className={`cursor-pointer transition-colors ${abierto ? 'bg-primary/5' : 'hover:bg-gray-50/70'}`}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <p className="font-bold text-gray-900">{g.nombre_producto}</p>
                                                            {g.motivos_distintos && (
                                                                <span className="inline-flex items-center gap-1 mt-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                                                                    <AlertTriangle size={9} /> Motivos distintos
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <span className={`inline-block px-2 py-0.5 rounded-lg font-bold tabular-nums ${g.cantidad_filas > 1 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                                                                {g.cantidad_filas}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-1 flex-wrap text-[10px] font-semibold text-gray-500">
                                                                <Calendar size={10} className="text-gray-300" />
                                                                {g.periodos.length > 0 ? g.periodos.map(etiquetaPeriodo).join(' · ') : '—'}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-[11px] font-medium text-gray-600">
                                                            {etiquetaDestino(g.destino_gasto) || '—'}
                                                        </td>
                                                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                            {g.recurso_existente ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                                                                    <CheckCircle2 size={10} /> #{g.id_recurso} {g.recurso_nombre_catalogo}
                                                                </span>
                                                            ) : g.recursos_parecidos.length > 0 ? (
                                                                /* Solo parecidos: la decisión es humana, elegir mal contamina el
                                                                   catálogo. Si ya se aplicó uno antes, queda preseleccionado y
                                                                   se puede cambiar. */
                                                                <select
                                                                    value={eleccionRecurso[g.grupo_id] ?? (g.id_recurso ? String(g.id_recurso) : '')}
                                                                    onChange={e => setEleccionRecurso(prev => ({ ...prev, [g.grupo_id]: e.target.value }))}
                                                                    className={`w-full max-w-[210px] px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all focus:outline-none focus:ring-4 focus:ring-amber-200/40 cursor-pointer ${(eleccionRecurso[g.grupo_id] ?? g.id_recurso) ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}
                                                                >
                                                                    <option value="">
                                                                        {g.recursos_parecidos.length} parecido(s) — elegir
                                                                    </option>
                                                                    {g.recursos_parecidos.map(r => (
                                                                        <option key={r.id_recurso} value={r.id_recurso}>
                                                                            #{r.id_recurso} {r.nombre}
                                                                            {r.codigo_cuenta ? ` → ${r.codigo_cuenta}` : ''}
                                                                        </option>
                                                                    ))}
                                                                    <option value={CREAR_NUEVO}>
                                                                        ➕ Ninguno: crear "{g.nombre_producto}" como nuevo
                                                                    </option>
                                                                </select>
                                                            ) : (
                                                                <span className="text-[10px] font-semibold text-gray-400">Sin coincidencia</span>
                                                            )}
                                                            {g.tiene_codigo_propio && (
                                                                <p className="mt-1 text-[9px] font-bold text-emerald-700 leading-tight">
                                                                    Ya trae cuenta {g.codigos_propios.join(' / ')} del Excel — elegir recurso es opcional
                                                                </p>
                                                            )}
                                                            {g.codigos_parecidos_divergen && !g.tiene_codigo_propio && (
                                                                <p className="mt-1 text-[9px] font-bold text-red-600 flex items-start gap-1 leading-tight">
                                                                    <AlertTriangle size={9} className="shrink-0 mt-px" />
                                                                    Rinden a cuentas distintas ({g.codigos_parecidos.join(' / ')}) — la elección no es indiferente
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {g.ya_vinculado ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                                                                    <CheckCircle2 size={10} />
                                                                    {g.filas_sin_actividad > 0
                                                                        ? `${g.filas_sin_actividad} fila(s) heredan la del grupo`
                                                                        : 'Ya vinculada'}
                                                                </span>
                                                            ) : g.actividades_sugeridas.length > 0 ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                                                                    <CheckCircle2 size={10} /> Resuelta sin IA
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-lg">
                                                                    <Sparkles size={10} /> Requiere IA
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 text-right font-bold text-gray-900 tabular-nums">{formatCLP(g.total_iva)}</td>
                                                    </tr>

                                                    {abierto && (
                                                        <tr className="bg-slate-50/70">
                                                            <td colSpan={7} className="px-4 py-3 space-y-2">
                                                                {g.motivos.length > 0 && (
                                                                    <div className="text-[11px] text-gray-600">
                                                                        <span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider">Motivos: </span>
                                                                        {g.motivos.map((m, i) => (
                                                                            <span key={i} className="italic">“{m}”{i < g.motivos.length - 1 ? ' · ' : ''}</span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {g.actividades_sugeridas.length > 0 && (
                                                                    <div className="text-[11px] text-gray-700 space-y-0.5">
                                                                        <span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider">Actividades asociadas</span>
                                                                        {g.actividades_sugeridas.map(a => (
                                                                            <p key={a.id_actividad}>
                                                                                📌 {a.nombre_actividad}
                                                                                <span className="text-gray-400"> — {a.dimension} · {a.origen === 'historial' ? `usada ${a.veces_usado}×` : 'Plan PME'}</span>
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {g.recursos_parecidos.length > 0 && (
                                                                    <div className="text-[11px] text-gray-700 space-y-0.5">
                                                                        <span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider">Recursos parecidos en el catálogo</span>
                                                                        {g.recursos_parecidos.map(r => (
                                                                            <p key={r.id_recurso}>
                                                                                #{r.id_recurso} {r.nombre}
                                                                                <span className="text-gray-400"> — {r.categoria_nombre || 'sin categoría'} · afinidad {Math.round(r.score * 100)}%</span>
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                <p className="text-[10px] text-gray-400">
                                                                    Filas del borrador en este grupo: {g.filas.map(i => `#${i + 1}`).join(', ')}
                                                                </p>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                        {gruposFiltrados.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-10 text-center text-[12px] text-gray-400 italic">
                                                    No hay grupos en este filtro.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0 bg-slate-50/50 flex-wrap">
                    <p className="text-[11px] text-gray-500 font-medium">
                        {totalFilasAfectadas > 0 ? (
                            <>
                                Se actualizarán <b className="text-gray-800">{totalFilasAfectadas} fila(s)</b> del borrador:{' '}
                                {filasConRecurso} con recurso del catálogo, {filasConActividad} con actividad PME.
                                <span className="text-gray-400"> No se guarda en la solicitud todavía.</span>
                            </>
                        ) : (
                            'Nada que aplicar: no hay coincidencias de catálogo ni actividades ya asociadas.'
                        )}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-all active:scale-95"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={() => { onAplicar(parches); onClose(); }}
                            disabled={totalFilasAfectadas === 0}
                            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all active:scale-95 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                            <CheckCircle2 size={15} strokeWidth={2.5} />
                            Aplicar a {totalFilasAfectadas} fila(s)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
