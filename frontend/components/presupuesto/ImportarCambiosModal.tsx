'use client';

import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Loader2, ArrowRight } from 'lucide-react';
import api from '@/lib/api/client';

/**
 * Importa el Excel que se exporta desde /presupuesto/solicitudes (vista "Todos los
 * Recursos") después de editarlo, y actualiza cada insumo cruzando por "ID Insumo".
 * Primero muestra una vista previa con los cambios detectados por el backend y
 * solo guarda cuando el usuario confirma.
 */

interface Cambio { campo: string; antes: any; despues: any }
interface FilaResultado {
    fila: number;
    id_pre_detalle: number | null;
    codigo_solicitud: string | null;
    producto: string | null;
    cambios: Cambio[];
    errores: string[];
}
interface Respuesta {
    aplicado: boolean;
    filas_aplicadas: number;
    resumen: { total_filas: number; con_cambios: number; sin_cambios: number; con_errores: number };
    filas: FilaResultado[];
}

// Columna del Excel exportado -> campo que espera el backend
const COLUMNAS: Record<string, string> = {
    'id insumo': 'id_pre_detalle',
    'recurso/producto': 'nombre_producto',
    'descripcion': 'descripcion',
    'cantidad': 'cantidad',
    'valor unitario': 'valor_unitario_iva',
    'mes/fecha': 'mes',
    'motivo': 'motivo',
    'linea': 'linea',
    'subvencion': 'subvencion',
};

function normalizarClave(clave: string): string {
    return (clave || '')
        .toString()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\(.*?\)/g, '')
        .replace(/\s*\/\s*/g, '/')
        .replace(/\s+/g, ' ')
        .trim();
}

const formatValor = (v: any) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'number') return Math.round(v * 100) / 100 === Math.round(v) ? Math.round(v).toLocaleString('es-CL') : v.toLocaleString('es-CL');
    return String(v);
};

interface Props {
    open: boolean;
    onClose: () => void;
    onAplicado: () => void;
}

export default function ImportarCambiosModal({ open, onClose, onAplicado }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [archivo, setArchivo] = useState<string>('');
    const [filas, setFilas] = useState<Record<string, any>[]>([]);
    const [preview, setPreview] = useState<Respuesta | null>(null);
    const [resultado, setResultado] = useState<Respuesta | null>(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string>('');
    const [verSoloCambios, setVerSoloCambios] = useState(true);

    if (!open) return null;

    const reiniciar = () => {
        setArchivo(''); setFilas([]); setPreview(null); setResultado(null); setError('');
        if (inputRef.current) inputRef.current.value = '';
    };

    const cerrar = () => { reiniciar(); onClose(); };

    const enviar = async (payloadFilas: Record<string, any>[], aplicar: boolean) => {
        const { data } = await api.post<Respuesta>('/presupuesto/detalles/importar-cambios', { filas: payloadFilas, aplicar });
        return data;
    };

    const leerArchivo = async (file: File) => {
        reiniciar();
        setArchivo(file.name);
        setCargando(true);
        try {
            const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const hoja = wb.Sheets[wb.SheetNames[0]];
            const filasExcel = XLSX.utils.sheet_to_json<Record<string, any>>(hoja, { defval: '', raw: true });
            if (filasExcel.length === 0) throw new Error('El archivo no tiene filas.');

            // Solo se envían las columnas que vienen en el archivo: una columna
            // eliminada del Excel no borra nada, simplemente no se toca.
            const encabezados = Object.keys(filasExcel[0]);
            const mapeo = encabezados
                .map(h => [h, COLUMNAS[normalizarClave(h)]] as const)
                .filter(([, campo]) => !!campo);
            if (!mapeo.some(([, c]) => c === 'id_pre_detalle')) {
                throw new Error('El archivo no tiene la columna "ID Insumo". Exporta de nuevo desde la vista "Todos los Recursos".');
            }

            const payload = filasExcel
                .map((row, i) => {
                    const out: Record<string, any> = { fila: i + 2 };
                    for (const [h, campo] of mapeo) out[campo] = row[h];
                    return out;
                })
                // Filas completamente vacías (p.ej. al final de la hoja)
                .filter(r => Object.entries(r).some(([k, v]) => k !== 'fila' && String(v ?? '').trim() !== ''));

            setFilas(payload);
            setPreview(await enviar(payload, false));
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'No se pudo leer el archivo.');
        } finally {
            setCargando(false);
        }
    };

    const aplicar = async () => {
        setCargando(true);
        setError('');
        try {
            const r = await enviar(filas, true);
            setResultado(r);
            onAplicado();
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'No se pudieron guardar los cambios.');
        } finally {
            setCargando(false);
        }
    };

    const datos = resultado || preview;
    const filasVisibles = (datos?.filas || []).filter(f => !verSoloCambios || f.cambios.length > 0 || f.errores.length > 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div className="flex items-center gap-2">
                        <FileSpreadsheet size={20} className="text-emerald-600" />
                        <h2 className="text-base font-bold text-gray-900">Importar cambios desde Excel</h2>
                    </div>
                    <button onClick={cerrar} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"><X size={18} /></button>
                </div>

                <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
                    {!datos && (
                        <div className="text-xs text-gray-600 space-y-1 bg-gray-50 rounded-xl p-3.5">
                            <p>1. Exporta el Excel desde la vista <b>Todos los Recursos</b>.</p>
                            <p>2. Modifica: Recurso / Producto, Descripción, Cantidad, Valor Unitario (IVA), Mes, Motivo, Línea o Subvención. <b>No cambies la columna ID Insumo.</b></p>
                            <p>3. Sube el archivo: verás los cambios detectados antes de guardarlos. El Total se recalcula solo; las demás columnas se ignoran.</p>
                        </div>
                    )}

                    {!resultado && (
                        <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-6 cursor-pointer transition-colors ${cargando ? 'opacity-60 pointer-events-none' : 'hover:border-emerald-400 hover:bg-emerald-50/40'} border-gray-200`}>
                            {cargando ? <Loader2 size={22} className="animate-spin text-gray-400" /> : <Upload size={22} className="text-gray-400" />}
                            <span className="text-sm font-semibold text-gray-700">{archivo || 'Seleccionar archivo .xlsx'}</span>
                            {archivo && !cargando && <span className="text-xs text-gray-400">Haz clic para elegir otro archivo</span>}
                            <input
                                ref={inputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) leerArchivo(f); }}
                            />
                        </label>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-xl p-3">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
                        </div>
                    )}

                    {resultado && (
                        <div className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 rounded-xl p-3">
                            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                            <span>Se actualizaron <b>{resultado.filas_aplicadas}</b> insumo(s).{resultado.resumen.con_errores > 0 && ` ${resultado.resumen.con_errores} fila(s) con errores no se modificaron.`}</span>
                        </div>
                    )}

                    {datos && (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                <div className="rounded-xl bg-gray-50 p-2.5"><div className="text-lg font-bold text-gray-900">{datos.resumen.total_filas}</div><div className="text-[11px] text-gray-500">Filas leídas</div></div>
                                <div className="rounded-xl bg-emerald-50 p-2.5"><div className="text-lg font-bold text-emerald-700">{datos.resumen.con_cambios}</div><div className="text-[11px] text-emerald-700">Con cambios</div></div>
                                <div className="rounded-xl bg-gray-50 p-2.5"><div className="text-lg font-bold text-gray-500">{datos.resumen.sin_cambios}</div><div className="text-[11px] text-gray-500">Sin cambios</div></div>
                                <div className="rounded-xl bg-red-50 p-2.5"><div className="text-lg font-bold text-red-600">{datos.resumen.con_errores}</div><div className="text-[11px] text-red-600">Con errores</div></div>
                            </div>

                            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                <input type="checkbox" checked={verSoloCambios} onChange={e => setVerSoloCambios(e.target.checked)} />
                                Mostrar solo filas con cambios o errores
                            </label>

                            <div className="border rounded-xl divide-y">
                                {filasVisibles.length === 0 && (
                                    <p className="text-sm text-gray-500 text-center py-6">No se detectaron cambios en el archivo.</p>
                                )}
                                {filasVisibles.map(f => (
                                    <div key={`${f.fila}-${f.id_pre_detalle}`} className={`px-4 py-3 ${f.errores.length ? 'bg-red-50/40' : ''}`}>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-1.5 flex-wrap">
                                            <span className="font-semibold text-gray-700">Fila {f.fila}</span>
                                            {f.id_pre_detalle && <span>· ID {f.id_pre_detalle}</span>}
                                            {f.codigo_solicitud && <span>· {f.codigo_solicitud}</span>}
                                            {f.producto && <span className="font-medium text-gray-800">· {f.producto}</span>}
                                        </div>
                                        {f.errores.map((er, i) => (
                                            <div key={i} className="flex items-center gap-1.5 text-xs text-red-700"><AlertTriangle size={12} /> {er}</div>
                                        ))}
                                        {f.cambios.map((c, i) => (
                                            <div key={i} className="flex items-center gap-2 text-xs py-0.5 flex-wrap">
                                                <span className="w-36 shrink-0 text-gray-500">{c.campo}</span>
                                                <span className="text-gray-400 line-through break-all">{formatValor(c.antes)}</span>
                                                <ArrowRight size={12} className="text-gray-400 shrink-0" />
                                                <span className="font-semibold text-gray-900 break-all">{formatValor(c.despues)}</span>
                                            </div>
                                        ))}
                                        {!f.errores.length && !f.cambios.length && <div className="text-xs text-gray-400">Sin cambios</div>}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
                    <button onClick={cerrar} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer">
                        {resultado ? 'Cerrar' : 'Cancelar'}
                    </button>
                    {preview && !resultado && (
                        <button
                            onClick={aplicar}
                            disabled={cargando || preview.resumen.con_cambios === 0}
                            className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                        >
                            {cargando && <Loader2 size={15} className="animate-spin" />}
                            Aplicar {preview.resumen.con_cambios} cambio(s)
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
