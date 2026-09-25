'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
    Plus, CheckCircle, AlertCircle, Loader2, Package, Lock, Search,
    SlidersHorizontal, Pencil, Trash2, X, Info, Video, ExternalLink, Copy, Check
} from 'lucide-react';
import { FORMATOS_UNIDAD, TIPOS_FECHA, MESES } from '@/lib/types';

const getApiUrl = () => {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return '/api';
    }
    return 'http://localhost:8001';
};
const API = getApiUrl();

export interface TutorialLink {
    id?: string;
    titulo: string;
    url: string;
    descripcion?: string;
}

interface ConvocatoriaInfo {
    id_convocatoria: number;
    subarea_nombre: string;
    area_nombre?: string | null;
    colegio_nombre?: string | null;
    fecha_expiracion: string;
    estado: string;
    activo: boolean;
    requiere_pin: boolean;
    tutoriales?: TutorialLink[];
    mostrar_tutoriales?: boolean;
}

interface RecursoSugerido {
    id_recurso: number;
    nombre: string;
    descripcion?: string;
    formato?: string;
}

interface ActividadPME {
    id_actividad: number;
    nombre_actividad: string;
    accion_nombre?: string;
    pme_year?: number;
}

interface PedidoEnviado {
    id_pedido: number;
    nombre_recurso: string;
    descripcion?: string;
    formato_unidad: string;
    cantidad: number;
    precio_estimado: number;
    total: number;
    motivo: string;
    destino?: string;
    id_actividad_pme?: number;
    actividad_pme_nombre?: string;
    estado_jefe?: 'pendiente' | 'aceptado' | 'rechazado' | 'importado';
}

// Destino del recurso solicitado (pilares oficiales establecidos)
const DESTINOS: { value: string; label: string; desc: string }[] = [
    { value: 'clases(alumno)', label: 'Estudiantes (Actividades, sala de clases, eventos etc)', desc: 'Recursos destinados a los estudiantes: uso en aula, eventos, salidas pedagógicas, actividades y beneficios directos para alumnos.' },
    { value: 'oficinas(administracion)', label: 'Funcionarios (Oficina, actividades de func., etc)', desc: 'Recursos de uso exclusivo de funcionarios y trabajadores del colegio: oficinas, gestión y labores administrativas.' },
    { value: 'premio/beneficio', label: 'Actividad (Premio Beneficio)', desc: 'Reconocimientos, premios o beneficios entregados como incentivo, ya sea a alumnos o funcionarios.' },
    { value: 'mantencion/servicio', label: 'Mantención / Servicio', desc: 'Mantención, reparación o servicios para la infraestructura y el funcionamiento del establecimiento.' },
];
const destinoDesc = (v?: string) => DESTINOS.find(d => d.value === normalizeDestino(v))?.desc || '';
const DESTINO_DEFAULT = 'clases(alumno)';
// Compatibilidad con pedidos antiguos guardados con los valores previos
const LEGACY_DESTINO: Record<string, string> = {
    alumno: 'clases(alumno)',
    funcionario: 'oficinas(administracion)',
    premio: 'premio/beneficio',
    mantencion: 'mantencion/servicio',
};
const normalizeDestino = (v?: string) => (v ? (LEGACY_DESTINO[v] || v) : DESTINO_DEFAULT);
const destinoLabel = (v?: string) => {
    if (!v) return '—';
    const norm = normalizeDestino(v);
    return DESTINOS.find(d => d.value === norm)?.label || v;
};

// Campo "¿Para quién / qué es?" con select + ayuda contextual y "saber más"
function DestinoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [showInfo, setShowInfo] = useState(false);
    return (
        <div>
            <div className="flex items-center gap-1.5 mb-1">
                <label className="block text-xs font-semibold text-gray-700">¿Para quién / qué es? <span className="text-red-500">*</span></label>
                <button
                    type="button"
                    onClick={() => setShowInfo(s => !s)}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold transition-colors ${showInfo ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
                    title="Ver qué significa cada opción"
                >
                    <Info size={13} /> Saber más
                </button>
            </div>
            {showInfo && (
                <div className="mb-2 p-3 rounded-xl bg-blue-50 border border-blue-100 space-y-1.5">
                    {DESTINOS.map(d => (
                        <div key={d.value} className="text-[11px] leading-snug">
                            <span className="font-bold text-blue-800">{d.label}:</span>{' '}
                            <span className="text-blue-700/90">{d.desc}</span>
                        </div>
                    ))}
                </div>
            )}
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
            >
                {DESTINOS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {destinoDesc(value) && (
                <p className="mt-1 text-[11px] text-gray-500 leading-snug">{destinoDesc(value)}</p>
            )}
        </div>
    );
}

// Columnas configurables de la tabla (la columna "Recurso" siempre se muestra)
const COLUMNS: { key: keyof typeof DEFAULT_COLS; label: string }[] = [
    { key: 'descripcion', label: 'Descripción' },
    { key: 'cantidad', label: 'Cantidad' },
    { key: 'precio', label: 'Precio unit.' },
    { key: 'total', label: 'Total' },
    { key: 'motivo', label: 'Motivo' },
    { key: 'destino', label: 'Destino' },
    { key: 'actividad_pme', label: 'Actividad PME' },
];
const DEFAULT_COLS = { descripcion: true, cantidad: true, precio: true, total: true, motivo: true, destino: true, actividad_pme: false };
type ColState = typeof DEFAULT_COLS;

const COLS_STORAGE_KEY = 'pedidos_columnas';
const enviadosKey = (token: string) => `pedidos_enviados_${token}`;

const emptyForm = () => ({
    nombre_recurso: '',
    descripcion: '',
    formato_unidad: 'unidad',
    cantidad: '',
    precio_estimado: '',
    tipo_fecha: 'mensual',
    mes: '01',
    fecha_especifica: '',
    motivo: '',
    destino: DESTINO_DEFAULT,
    id_actividad_pme: 0,
    actividad_pme_nombre: '',
    id_recurso: null as number | null,
});

const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

// Buscador (select con búsqueda) de actividades del PME — opcional
function PmeAutocomplete({ token, valueNombre, onSelect }: {
    token: string;
    valueNombre: string;
    onSelect: (id: number, nombre: string) => void;
}) {
    const [query, setQuery] = useState(valueNombre);
    const [sug, setSug] = useState<ActividadPME[]>([]);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const ref = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { setQuery(valueNombre); }, [valueNombre]);

    const buscar = (val: string) => {
        if (ref.current) clearTimeout(ref.current);
        setBusy(true);
        ref.current = setTimeout(async () => {
            try {
                const res = await fetch(`${API}/convocatorias/publica/${token}/actividades-pme?q=${encodeURIComponent(val.trim())}`);
                const data = res.ok ? await res.json() : [];
                setSug(data);
                setOpen(true);
            } catch {
                setSug([]);
            } finally {
                setBusy(false);
            }
        }, 300);
    };

    const onChange = (val: string) => {
        setQuery(val);
        if (!val.trim()) onSelect(0, '');
        buscar(val);
    };

    return (
        <div className="relative">
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                    type="text"
                    value={query}
                    onChange={e => onChange(e.target.value)}
                    onFocus={() => buscar(query)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    placeholder="Buscar actividad del PME (opcional)..."
                    autoComplete="off"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                />
                {busy && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 animate-spin" />}
                {open && sug.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                        {sug.map(a => (
                            <button
                                key={a.id_actividad}
                                type="button"
                                onMouseDown={() => { onSelect(a.id_actividad, a.nombre_actividad); setOpen(false); }}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                            >
                                <div className="text-sm font-medium text-gray-800 line-clamp-2">{a.nombre_actividad}</div>
                                {(a.accion_nombre || a.pme_year) && (
                                    <div className="text-[11px] text-gray-400 line-clamp-1">
                                        {a.accion_nombre}{a.pme_year ? ` · PME ${a.pme_year}` : ''}
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                )}
                {open && !busy && sug.length === 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs text-gray-400">
                        No se encontraron actividades del PME.
                    </div>
                )}
            </div>
        </div>
    );
}

export default function FormularioPedidoPage() {
    const params = useParams();
    const token = params.token as string;

    const [info, setInfo] = useState<ConvocatoriaInfo | null>(null);
    const [loadingInfo, setLoadingInfo] = useState(true);
    const [form, setForm] = useState(emptyForm());
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');
    const [enviados, setEnviados] = useState<PedidoEnviado[]>([]);

    // Columnas visibles (persistidas en localStorage)
    const [cols, setCols] = useState<ColState>(DEFAULT_COLS);
    const [showColMenu, setShowColMenu] = useState(false);

    // Autocompletado de recursos
    const [sugerencias, setSugerencias] = useState<RecursoSugerido[]>([]);
    const [mostrarSug, setMostrarSug] = useState(false);
    const [buscando, setBuscando] = useState(false);
    const buscarRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // PIN
    const [pin, setPin] = useState('');
    const [pinValidado, setPinValidado] = useState(false);
    const [verificandoPin, setVerificandoPin] = useState(false);
    const [errorPin, setErrorPin] = useState('');

    // Edición / eliminación de un recurso ya enviado
    const [editPedido, setEditPedido] = useState<PedidoEnviado | null>(null);
    const [editForm, setEditForm] = useState({ nombre_recurso: '', descripcion: '', formato_unidad: 'unidad', cantidad: '', precio_estimado: '', motivo: '', destino: DESTINO_DEFAULT, id_actividad_pme: 0, actividad_pme_nombre: '' });
    const [guardandoEdit, setGuardandoEdit] = useState(false);
    const [errorEdit, setErrorEdit] = useState('');
    const [eliminando, setEliminando] = useState<number | null>(null);

    // Modal de tutoriales
    const [modalTutoriales, setModalTutoriales] = useState(false);
    const [copiadoTut, setCopiadoTut] = useState<string | null>(null);

    // Cargar info de la convocatoria
    useEffect(() => {
        fetch(`${API}/convocatorias/publica/${token}`)
            .then(r => r.json())
            .then(d => setInfo(d))
            .catch(() => setInfo(null))
            .finally(() => setLoadingInfo(false));
    }, [token]);

    // Cargar preferencias de columnas y pedidos enviados desde localStorage
    useEffect(() => {
        try {
            const rawCols = localStorage.getItem(COLS_STORAGE_KEY);
            if (rawCols) setCols({ ...DEFAULT_COLS, ...JSON.parse(rawCols) });
        } catch { /* ignore */ }
        try {
            const rawEnv = localStorage.getItem(enviadosKey(token));
            if (rawEnv) setEnviados(JSON.parse(rawEnv));
        } catch { /* ignore */ }
    }, [token]);

    const persistEnviados = (lista: PedidoEnviado[]) => {
        setEnviados(lista);
        try { localStorage.setItem(enviadosKey(token), JSON.stringify(lista)); } catch { /* ignore */ }
    };

    // Cargar desde el servidor los pedidos ya enviados (fuente de verdad), una vez con acceso
    useEffect(() => {
        if (!info || !info.activo) return;
        if (info.requiere_pin && !pinValidado) return;
        const url = `${API}/convocatorias/publica/${token}/pedidos` +
            (info.requiere_pin ? `?pin=${encodeURIComponent(pin.trim())}` : '');
        fetch(url)
            .then(r => (r.ok ? r.json() : null))
            .then(data => { if (Array.isArray(data)) persistEnviados(data); })
            .catch(() => { /* se mantiene lo de localStorage */ });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [info, pinValidado, token]);

    const toggleCol = (key: keyof ColState) => {
        setCols(prev => {
            const next = { ...prev, [key]: !prev[key] };
            try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    };

    const verificarPin = async () => {
        setVerificandoPin(true);
        setErrorPin('');
        try {
            const res = await fetch(`${API}/convocatorias/publica/${token}/verificar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: pin.trim() }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setErrorPin(d.detail || 'PIN incorrecto');
                return;
            }
            setPinValidado(true);
        } catch {
            setErrorPin('No se pudo verificar el PIN. Intenta de nuevo.');
        } finally {
            setVerificandoPin(false);
        }
    };

    const set = (field: string, val: string) => setForm(f => ({ ...f, [field]: val }));

    // Búsqueda de recursos con debounce
    const onNombreChange = (val: string) => {
        setForm(f => ({ ...f, nombre_recurso: val, id_recurso: null }));
        if (buscarRef.current) clearTimeout(buscarRef.current);
        if (val.trim().length < 2) {
            setSugerencias([]);
            setMostrarSug(false);
            return;
        }
        setBuscando(true);
        buscarRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`${API}/convocatorias/publica/${token}/recursos?q=${encodeURIComponent(val.trim())}`);
                const data = res.ok ? await res.json() : [];
                setSugerencias(data);
                setMostrarSug(true);
            } catch {
                setSugerencias([]);
            } finally {
                setBuscando(false);
            }
        }, 300);
    };

    const elegirRecurso = (r: RecursoSugerido) => {
        setForm(f => ({
            ...f,
            nombre_recurso: r.nombre,
            formato_unidad: r.formato && FORMATOS_UNIDAD.some(x => x.value === r.formato) ? r.formato! : f.formato_unidad,
            id_recurso: r.id_recurso,
        }));
        setMostrarSug(false);
        setSugerencias([]);
    };

    const validar = (): string | null => {
        if (!form.nombre_recurso.trim()) return 'El nombre del recurso es obligatorio';
        if (!form.cantidad || parseFloat(form.cantidad) <= 0) return 'La cantidad debe ser mayor a 0';
        if (!form.precio_estimado || parseFloat(form.precio_estimado) <= 0) return 'El precio debe ser mayor a 0';
        if (!form.motivo.trim()) return 'El motivo / justificación es obligatorio';
        if (form.tipo_fecha === 'fecha_especifica' && !form.fecha_especifica) return 'Ingresa la fecha específica';
        return null;
    };

    const getFechaEjecucion = (): string => {
        if (form.tipo_fecha === 'fecha_especifica') return form.fecha_especifica;
        const year = new Date().getFullYear();
        return `${year}-${form.mes}-01`;
    };

    const agregar = async () => {
        const err = validar();
        if (err) { setError(err); return; }
        setError('');
        setEnviando(true);
        const body = {
            nombre_recurso: form.nombre_recurso.trim(),
            descripcion: form.descripcion.trim() || undefined,
            formato_unidad: form.formato_unidad,
            cantidad: parseFloat(form.cantidad),
            precio_estimado: parseFloat(form.precio_estimado),
            fecha_ejecucion: getFechaEjecucion(),
            tipo_fecha: form.tipo_fecha,
            motivo: form.motivo.trim(),
            destino: form.destino,
            id_actividad_pme: form.id_actividad_pme || undefined,
            id_recurso: form.id_recurso || undefined,
            pin: info?.requiere_pin ? pin.trim() : undefined,
        };
        try {
            const res = await fetch(`${API}/convocatorias/publica/${token}/pedidos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError(d.detail || 'Error al guardar el recurso');
                return;
            }
            const saved: PedidoEnviado = await res.json();
            persistEnviados([...enviados, saved]);
            setForm(emptyForm());
            setSugerencias([]);
            setMostrarSug(false);
        } catch {
            setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    const abrirEditar = (p: PedidoEnviado) => {
        setEditPedido(p);
        setEditForm({
            nombre_recurso: p.nombre_recurso,
            descripcion: p.descripcion || '',
            formato_unidad: p.formato_unidad,
            cantidad: String(p.cantidad),
            precio_estimado: String(p.precio_estimado),
            motivo: p.motivo,
            destino: normalizeDestino(p.destino),
            id_actividad_pme: p.id_actividad_pme || 0,
            actividad_pme_nombre: p.actividad_pme_nombre || '',
        });
        setErrorEdit('');
    };

    const guardarEdit = async () => {
        if (!editPedido) return;
        if (!editForm.nombre_recurso.trim()) { setErrorEdit('El nombre es obligatorio'); return; }
        if (!editForm.cantidad || parseFloat(editForm.cantidad) <= 0) { setErrorEdit('La cantidad debe ser mayor a 0'); return; }
        if (!editForm.precio_estimado || parseFloat(editForm.precio_estimado) <= 0) { setErrorEdit('El precio debe ser mayor a 0'); return; }
        if (!editForm.motivo.trim()) { setErrorEdit('El motivo es obligatorio'); return; }
        setGuardandoEdit(true);
        setErrorEdit('');
        try {
            const res = await fetch(`${API}/convocatorias/publica/${token}/pedidos/${editPedido.id_pedido}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre_recurso: editForm.nombre_recurso.trim(),
                    descripcion: editForm.descripcion.trim() || undefined,
                    formato_unidad: editForm.formato_unidad,
                    cantidad: parseFloat(editForm.cantidad),
                    precio_estimado: parseFloat(editForm.precio_estimado),
                    motivo: editForm.motivo.trim(),
                    destino: editForm.destino,
                    id_actividad_pme: editForm.id_actividad_pme || 0,
                    pin: info?.requiere_pin ? pin.trim() : undefined,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setErrorEdit(d.detail || 'No se pudo guardar el cambio');
                return;
            }
            const updated: PedidoEnviado = await res.json();
            persistEnviados(enviados.map(p => p.id_pedido === updated.id_pedido ? updated : p));
            setEditPedido(null);
        } catch {
            setErrorEdit('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
        } finally {
            setGuardandoEdit(false);
        }
    };

    const eliminarPedido = async (p: PedidoEnviado) => {
        if (!confirm(`¿Eliminar "${p.nombre_recurso}" de la lista?`)) return;
        setEliminando(p.id_pedido);
        try {
            const url = `${API}/convocatorias/publica/${token}/pedidos/${p.id_pedido}` +
                (info?.requiere_pin ? `?pin=${encodeURIComponent(pin.trim())}` : '');
            const res = await fetch(url, { method: 'DELETE' });
            if (!res.ok && res.status !== 204) {
                const d = await res.json().catch(() => ({}));
                alert(d.detail || 'No se pudo eliminar el recurso');
                return;
            }
            persistEnviados(enviados.filter(x => x.id_pedido !== p.id_pedido));
        } catch {
            alert('No se pudo eliminar. Revisa tu conexión e intenta de nuevo.');
        } finally {
            setEliminando(null);
        }
    };

    // ── Loading ────────────────────────────────────────────────────────────────
    if (loadingInfo) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="animate-spin text-blue-600" size={32} />
            </div>
        );
    }

    if (!info) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
                <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
                    <AlertCircle className="mx-auto mb-3 text-red-500" size={40} />
                    <h2 className="text-lg font-bold text-gray-800">Formulario no encontrado</h2>
                    <p className="text-sm text-gray-500 mt-1">El enlace puede ser incorrecto o haber expirado.</p>
                </div>
            </div>
        );
    }

    if (!info.activo) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
                <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
                    <AlertCircle className="mx-auto mb-3 text-orange-500" size={40} />
                    <h2 className="text-lg font-bold text-gray-800">
                        {info.estado === 'expirado' ? 'Formulario expirado' : 'Formulario cerrado'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {info.estado === 'expirado'
                            ? `Este formulario venció el ${new Date(info.fecha_expiracion).toLocaleDateString('es-CL')}.`
                            : 'El jefe de área ha cerrado este formulario.'}
                    </p>
                </div>
            </div>
        );
    }

    // ── Gate de PIN ──────────────────────────────────────────────────────────
    if (info.requiere_pin && !pinValidado) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                        <Lock className="text-blue-600" size={24} />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 text-center">Formulario protegido</h2>
                    <p className="text-sm text-gray-500 mt-1 text-center">
                        Ingresa el PIN entregado por el jefe de área para acceder a <span className="font-semibold text-blue-700">{info.subarea_nombre}</span>.
                    </p>

                    {errorPin && (
                        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center gap-1.5">
                            <AlertCircle size={13} /> {errorPin}
                        </div>
                    )}

                    <input
                        type="text"
                        inputMode="numeric"
                        value={pin}
                        onChange={e => setPin(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && pin.trim()) verificarPin(); }}
                        placeholder="PIN de acceso"
                        autoFocus
                        className="mt-4 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                    />

                    <button
                        onClick={verificarPin}
                        disabled={verificandoPin || !pin.trim()}
                        className="mt-3 w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow"
                    >
                        {verificandoPin ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                        Acceder
                    </button>
                </div>
            </div>
        );
    }

    const totalEnviado = enviados.reduce((s, p) => s + p.total, 0);

    return (
        <div className="min-h-screen bg-slate-50 py-8 px-4">
            <div className="max-w-6xl mx-auto space-y-5">

                {/* Header */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                <Package className="text-blue-600" size={20} />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-gray-900">Solicitud de Recursos</h1>
                                {info.colegio_nombre && (
                                    <p className="text-sm font-bold text-gray-700">{info.colegio_nombre}</p>
                                )}
                                <p className="text-sm text-blue-700 font-semibold">
                                    {info.area_nombre ? `${info.area_nombre} · ` : ''}{info.subarea_nombre}
                                </p>
                            </div>
                        </div>

                        {info.mostrar_tutoriales !== false && (
                            <button
                                type="button"
                                onClick={() => setModalTutoriales(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all self-start sm:self-center"
                            >
                                <Video size={16} /> Ver tutoriales {(info.tutoriales?.length ?? 0) > 0 ? `(${info.tutoriales!.length})` : ''}
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-gray-500">
                        Agrega un recurso a la vez. Cada recurso que agregues queda guardado en la lista de la derecha para revisión del jefe de área.
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                        <span>Formulario válido hasta:</span>
                        <span className="font-semibold text-gray-600">
                            {new Date(info.fecha_expiracion).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                    </div>
                </div>

                {/* Layout: formulario (izq) + listado (der) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

                    {/* Formulario */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4 lg:sticky lg:top-6">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Nuevo recurso</span>

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center gap-1.5">
                                <AlertCircle size={13} /> {error}
                            </div>
                        )}

                        {/* Nombre con autocompletado */}
                        <div className="relative">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre del recurso <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                                <input
                                    type="text"
                                    value={form.nombre_recurso}
                                    onChange={e => onNombreChange(e.target.value)}
                                    onFocus={() => { if (sugerencias.length) setMostrarSug(true); }}
                                    onBlur={() => setTimeout(() => setMostrarSug(false), 150)}
                                    placeholder="Ej: Balón de vóley"
                                    autoComplete="off"
                                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                />
                                {buscando && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 animate-spin" />}

                                {mostrarSug && sugerencias.length > 0 && (
                                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                        {sugerencias.map(r => (
                                            <button
                                                key={r.id_recurso}
                                                type="button"
                                                onMouseDown={() => elegirRecurso(r)}
                                                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                                            >
                                                <div className="text-sm font-medium text-gray-800">{r.nombre}</div>
                                                {r.descripcion && <div className="text-[11px] text-gray-400 line-clamp-1">{r.descripcion}</div>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1">
                                Escribe <span className="font-semibold text-gray-500">solo el nombre del recurso</span>, sin marcas ni detalles. Ej: «Balón de vóley», no «Balón de vóley marca X». Los detalles van en la descripción.
                            </p>
                        </div>

                        {/* Descripción */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Descripción - Detalle del Recurso</label>
                            <input
                                type="text"
                                value={form.descripcion}
                                onChange={e => set('descripcion', e.target.value)}
                                placeholder="Marca, color, características, especificaciones..."
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                            />
                        </div>

                        {/* Formato / Cantidad / Precio */}
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Formato</label>
                                <select
                                    value={form.formato_unidad}
                                    onChange={e => set('formato_unidad', e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                                >
                                    {FORMATOS_UNIDAD.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Cantidad <span className="text-red-500">*</span></label>
                                <input
                                    type="number"
                                    min="1"
                                    value={form.cantidad}
                                    onChange={e => set('cantidad', e.target.value)}
                                    placeholder="0"
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Precio unit. C/Iva <span className="text-red-500">*</span></label>
                                <input
                                    type="number"
                                    min="1"
                                    value={form.precio_estimado}
                                    onChange={e => set('precio_estimado', e.target.value)}
                                    placeholder="$0"
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                />
                            </div>
                        </div>

                        {form.cantidad && form.precio_estimado && (
                            <p className="text-xs text-gray-500">
                                Total estimado: <span className="font-bold text-gray-800">{fmt(parseFloat(form.cantidad) * parseFloat(form.precio_estimado))}</span>
                            </p>
                        )}

                        {/* Fecha */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo de fecha</label>
                                <select
                                    value={form.tipo_fecha}
                                    onChange={e => set('tipo_fecha', e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                                >
                                    {TIPOS_FECHA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div>
                                {form.tipo_fecha === 'fecha_especifica' ? (
                                    <>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha <span className="text-red-500">*</span></label>
                                        <input
                                            type="date"
                                            value={form.fecha_especifica}
                                            onChange={e => set('fecha_especifica', e.target.value)}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                        />
                                    </>
                                ) : (
                                    <>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Mes de inicio</label>
                                        <select
                                            value={form.mes}
                                            onChange={e => set('mes', e.target.value)}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                                        >
                                            {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                        </select>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Motivo — obligatorio, destacado en rojo */}
                        <div className="rounded-xl border border-red-200 bg-red-50/40 p-3">
                            <label className="block text-xs font-bold text-red-600 mb-1">Motivo / justificación <span className="text-red-500">*</span> (obligatorio) / Actividad / Evento</label>
                            <textarea
                                rows={2}
                                value={form.motivo}
                                onChange={e => set('motivo', e.target.value)}
                                placeholder="¿Para qué se necesita este recurso? Explica brevemente la justificación."
                                className="w-full px-3 py-2.5 border border-red-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 resize-none bg-white"
                            />
                        </div>

                        {/* Destino del recurso */}
                        <DestinoField value={form.destino} onChange={v => set('destino', v)} />

                        {/* Actividad del PME — opcional, con búsqueda */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Actividad del PME <span className="text-gray-400 font-normal">(opcional)</span></label>
                            <PmeAutocomplete
                                token={token}
                                valueNombre={form.actividad_pme_nombre}
                                onSelect={(id, nombre) => setForm(f => ({ ...f, id_actividad_pme: id, actividad_pme_nombre: nombre }))}
                            />
                        </div>

                        <button
                            onClick={agregar}
                            disabled={enviando}
                            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow"
                        >
                            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                            Agregar recurso
                        </button>
                    </div>

                    {/* Listado */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                            <div className="text-sm font-bold text-gray-800">
                                Recursos solicitados
                                <span className="ml-2 text-xs font-medium text-gray-400">({enviados.length})</span>
                            </div>
                            {/* Selector de columnas */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowColMenu(s => !s)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <SlidersHorizontal size={14} /> Columnas
                                </button>
                                {showColMenu && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowColMenu(false)} />
                                        <div className="absolute right-0 mt-1 z-20 w-44 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5">
                                            {COLUMNS.map(c => (
                                                <label key={c.key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={cols[c.key]}
                                                        onChange={() => toggleCol(c.key)}
                                                        className="accent-blue-600"
                                                    />
                                                    {c.label}
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {enviados.length > 0 && (
                            <div className="px-5 py-2.5 bg-green-50 border-b border-green-100 flex items-center gap-2 text-green-700 text-xs font-medium">
                                <CheckCircle size={14} />
                                {enviados.length} {enviados.length === 1 ? 'recurso guardado' : 'recursos guardados'} · Total: <span className="font-bold">{fmt(totalEnviado)}</span>
                            </div>
                        )}

                        {enviados.length === 0 ? (
                            <div className="py-14 text-center text-sm text-gray-400 px-6">
                                <Package size={32} className="mx-auto mb-3 text-gray-200" />
                                Aún no has agregado recursos. Completa el formulario y presiona «Agregar recurso».
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-semibold">
                                            <th className="px-4 py-3 text-left">Recurso</th>
                                            {cols.descripcion && <th className="px-3 py-3 text-left">Descripción</th>}
                                            {cols.cantidad && <th className="px-3 py-3 text-right">Cant.</th>}
                                            {cols.precio && <th className="px-3 py-3 text-right">Precio</th>}
                                            {cols.total && <th className="px-3 py-3 text-right">Total</th>}
                                            {cols.motivo && <th className="px-3 py-3 text-left">Motivo</th>}
                                            {cols.destino && <th className="px-3 py-3 text-left">Destino</th>}
                                            {cols.actividad_pme && <th className="px-3 py-3 text-left">Actividad PME</th>}
                                            <th className="px-3 py-3 text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {enviados.map(p => (
                                            <tr key={p.id_pedido} className="hover:bg-gray-50/60 transition-colors">
                                                <td className="px-4 py-3 font-semibold text-gray-800">{p.nombre_recurso}</td>
                                                {cols.descripcion && <td className="px-3 py-3 text-gray-500 max-w-[160px]"><span className="line-clamp-2">{p.descripcion || '—'}</span></td>}
                                                {cols.cantidad && <td className="px-3 py-3 text-right text-gray-700 whitespace-nowrap">{p.cantidad} {p.formato_unidad}</td>}
                                                {cols.precio && <td className="px-3 py-3 text-right text-gray-700">{fmt(p.precio_estimado)}</td>}
                                                {cols.total && <td className="px-3 py-3 text-right font-semibold text-gray-900">{fmt(p.total)}</td>}
                                                {cols.motivo && <td className="px-3 py-3 text-gray-600 max-w-[180px]"><span className="line-clamp-2">{p.motivo}</span></td>}
                                                {cols.destino && <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{destinoLabel(p.destino)}</td>}
                                                {cols.actividad_pme && <td className="px-3 py-3 text-gray-600 max-w-[160px]"><span className="line-clamp-2">{p.actividad_pme_nombre || '—'}</span></td>}
                                                <td className="px-3 py-3">
                                                    {(!p.estado_jefe || p.estado_jefe === 'pendiente') ? (
                                                        <div className="flex items-center gap-1 justify-center">
                                                            <button
                                                                onClick={() => abrirEditar(p)}
                                                                title="Editar recurso"
                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                            >
                                                                <Pencil size={13} />
                                                            </button>
                                                            <button
                                                                onClick={() => eliminarPedido(p)}
                                                                disabled={eliminando === p.id_pedido}
                                                                title="Eliminar recurso"
                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                                                            >
                                                                {eliminando === p.id_pedido ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-center">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.estado_jefe === 'aceptado' ? 'bg-green-100 text-green-700'
                                                                : p.estado_jefe === 'rechazado' ? 'bg-red-100 text-red-700'
                                                                    : 'bg-blue-100 text-blue-700'
                                                                }`}>
                                                                {p.estado_jefe === 'aceptado' ? 'Aceptado'
                                                                    : p.estado_jefe === 'rechazado' ? 'Rechazado'
                                                                        : 'Importado'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <p className="text-center text-xs text-gray-400 pb-4">
                    Cada recurso queda registrado al agregarlo. La lista se conserva en este dispositivo aunque recargues la página.
                </p>
            </div>

            {/* Modal editar recurso */}
            {editPedido && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditPedido(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-base font-bold text-gray-900">Editar recurso</h3>
                            <button onClick={() => setEditPedido(null)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
                                <X size={16} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">Solo puedes editarlo mientras el jefe de área no lo haya revisado.</p>

                        {errorEdit && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2 mb-4 flex items-center gap-1.5">
                                <AlertCircle size={13} /> {errorEdit}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre del recurso <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={editForm.nombre_recurso}
                                    onChange={e => setEditForm(f => ({ ...f, nombre_recurso: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Descripción (opcional)</label>
                                <input
                                    type="text"
                                    value={editForm.descripcion}
                                    onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Formato</label>
                                    <select
                                        value={editForm.formato_unidad}
                                        onChange={e => setEditForm(f => ({ ...f, formato_unidad: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                    >
                                        {FORMATOS_UNIDAD.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Cantidad <span className="text-red-500">*</span></label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={editForm.cantidad}
                                        onChange={e => setEditForm(f => ({ ...f, cantidad: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Precio unit. <span className="text-red-500">*</span></label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={editForm.precio_estimado}
                                        onChange={e => setEditForm(f => ({ ...f, precio_estimado: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                                    />
                                </div>
                            </div>
                            {editForm.cantidad && editForm.precio_estimado && (
                                <p className="text-xs text-gray-500">
                                    Total: <span className="font-bold text-gray-800">{fmt(parseFloat(editForm.cantidad) * parseFloat(editForm.precio_estimado))}</span>
                                </p>
                            )}
                            <div className="rounded-xl border border-red-200 bg-red-50/40 p-3">
                                <label className="block text-xs font-bold text-red-600 mb-1">Motivo / justificación <span className="text-red-500">*</span></label>
                                <textarea
                                    rows={2}
                                    value={editForm.motivo}
                                    onChange={e => setEditForm(f => ({ ...f, motivo: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-red-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 resize-none bg-white"
                                />
                            </div>
                            <DestinoField value={editForm.destino} onChange={v => setEditForm(f => ({ ...f, destino: v }))} />
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Actividad del PME <span className="text-gray-400 font-normal">(opcional)</span></label>
                                <PmeAutocomplete
                                    token={token}
                                    valueNombre={editForm.actividad_pme_nombre}
                                    onSelect={(id, nombre) => setEditForm(f => ({ ...f, id_actividad_pme: id, actividad_pme_nombre: nombre }))}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 mt-6">
                            <button onClick={() => setEditPedido(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">
                                Cancelar
                            </button>
                            <button
                                onClick={guardarEdit}
                                disabled={guardandoEdit}
                                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {guardandoEdit && <Loader2 size={15} className="animate-spin" />}
                                Guardar cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Tutoriales y Enlaces de Ayuda */}
            {modalTutoriales && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setModalTutoriales(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                                    <Video size={18} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-gray-900">Tutoriales y Guías de Ayuda</h3>
                                    <p className="text-xs text-gray-500">Recursos y videos explicativos para completar tus pedidos de insumos</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setModalTutoriales(false)}
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {(!info?.tutoriales || info.tutoriales.length === 0) ? (
                            <div className="border border-dashed border-gray-200 rounded-2xl p-8 text-center bg-gray-50/50 my-6">
                                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
                                    <Video size={22} />
                                </div>
                                <p className="text-sm font-bold text-gray-800">Aún no hay tutoriales configurados</p>
                                <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
                                    Los enlaces y videos de ayuda agregados en la sección de configuración aparecerán aquí automáticamente.
                                </p>
                            </div>
                        ) : (
                            <div className="mt-4 overflow-y-auto space-y-3 pr-1 flex-1">
                                {info.tutoriales.map((tut, i) => {
                                const isVideo = tut.url.includes('youtube.com') || tut.url.includes('youtu.be') || tut.url.includes('loom.com') || tut.url.includes('vimeo.com');

                                return (
                                    <div key={tut.id || i} className="border border-gray-200 hover:border-blue-300 rounded-2xl p-4 bg-white hover:bg-blue-50/20 transition-all shadow-xs flex flex-col justify-between gap-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className="text-sm font-bold text-gray-900">{tut.titulo}</h4>
                                                    {isVideo ? (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                                                            Video
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                            Enlace
                                                        </span>
                                                    )}
                                                </div>
                                                {tut.descripcion && (
                                                    <p className="text-xs text-gray-600 leading-relaxed">{tut.descripcion}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                                            <span className="text-[11px] text-gray-400 font-mono truncate max-w-[260px]" title={tut.url}>
                                                {tut.url}
                                            </span>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(tut.url);
                                                        setCopiadoTut(tut.url);
                                                        setTimeout(() => setCopiadoTut(null), 2000);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 hover:border-gray-300 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                                                >
                                                    {copiadoTut === tut.url ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                                                    {copiadoTut === tut.url ? 'Copiado' : 'Copiar'}
                                                </button>
                                                <a
                                                    href={tut.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                                                >
                                                    <ExternalLink size={13} /> Ver tutorial
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setModalTutoriales(false)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
