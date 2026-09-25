'use client';

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, X, Loader2, Info, ChevronRight, Check, Download, Tag } from 'lucide-react';
import { destinoCanonico, etiquetaDestino } from '@/lib/destinos';
import { descargarPlantillaPresupuesto } from '@/lib/excel/presupuestoTemplate';
import api from '@/lib/api/client';

const formatCLP = (val: number) => `$${Math.round(val || 0).toLocaleString('es-CL')}`;

/**
 * Normaliza un encabezado de columna para poder compararlo: sin tildes, sin
 * mayúsculas, sin el asterisco de "obligatorio", sin espacios alrededor de las
 * barras, sin paréntesis y con los espacios colapsados.
 */
function normalizarClave(clave: string): string {
    return (clave || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\*/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/[_]/g, ' ')
        .replace(/\s*\/\s*/g, '/')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Lector de celdas tolerante al encabezado. Antes cada columna se buscaba por
 * coincidencia exacta del texto del encabezado; si la planilla traía otra
 * capitalización o un espacio de más, la columna se leía como vacía y el valor
 * caía en un default silencioso (el destino terminaba siempre en "Estudiantes").
 */
function crearLector(row: Record<string, any>) {
    const porClave = new Map<string, any>();
    for (const [k, v] of Object.entries(row)) porClave.set(normalizarClave(k), v);
    return (...alias: string[]): any => {
        for (const a of alias) {
            const v = porClave.get(normalizarClave(a));
            if (v !== undefined && v !== null && String(v).trim() !== '') return v;
        }
        return undefined;
    };
}

interface FilaImportada {
    nombre_producto: string;
    descripcion: string;
    cantidad: number;
    formato_unidad: string;
    valor_unitario_iva: number;
    total_iva: number;
    tipo_fecha: string;
    mes_ejecucion: string;
    fecha_ejecucion?: string;
    destino_gasto: string;
    motivo: string;
    actividad_nombre_excel?: string;
    id_actividad: number | null;
    id_subvencion: number | null;
    id_cat_recurso?: number | null;
    categoria_nombre?: string | null;
    valida: boolean;
    errores: string[];
}

interface ImportarExcelModalProps {
    isOpen: boolean;
    onClose: () => void;
    todasActividades: { id: number; nombre: string; dimension?: string }[];
    mapeosRecurso: any[];
    subareasUsuario: any[];
    subvencionesActivas?: { id_subvencion: number; nombre_corto: string; codigo?: string }[];
    categorias?: { id_cat_recurso?: number; id?: number; nombre: string; descripcion?: string }[];
    idSubareaForm: number | null;
    onImportarConfirmado: (filasValidas: any[]) => void;
}

export function ImportarExcelModal({
    isOpen,
    onClose,
    todasActividades,
    mapeosRecurso,
    subareasUsuario,
    subvencionesActivas = [],
    categorias = [],
    idSubareaForm,
    onImportarConfirmado
}: ImportarExcelModalProps) {
    const [paso, setPaso] = useState<'subida' | 'revision'>('subida');
    const [cargando, setCargando] = useState(false);
    const [filas, setFilas] = useState<FilaImportada[]>([]);
    const [nombreArchivo, setNombreArchivo] = useState('');
    const [listaCategorias, setListaCategorias] = useState<any[]>(categorias || []);
    // Cargo solicitante que se aplicará a los insumos importados. Arranca en la de
    // quien importa (`idSubareaForm`) y se puede cambiar entre las cargos del
    // usuario, igual que en el paso 1 del alta manual.
    const [idSubareaImport, setIdSubareaImport] = useState<number | null>(idSubareaForm);

    // Cargar categorías si no llegaron por props
    useEffect(() => {
        if (categorias && categorias.length > 0) {
            setListaCategorias(categorias);
        } else if (isOpen) {
            api.get('/presupuesto/categoria-recurso')
                .then(res => setListaCategorias(res.data || []))
                .catch(() => { });
        }
    }, [categorias, isOpen]);

    // El usuario se carga de forma asíncrona, así que `idSubareaForm` puede llegar
    // después del montaje: se realinea cada vez que se abre el modal.
    useEffect(() => {
        if (isOpen) setIdSubareaImport(idSubareaForm);
    }, [isOpen, idSubareaForm]);

    if (!isOpen) return null;

    // Devuelve el destino en vocabulario canónico (el que guarda pre_detalle y con el
    // que están escritos los mapeos contables), no la etiqueta de presentación.
    // Cadena vacía si no se reconoce: el llamador lo reporta como error de la fila en
    // vez de adivinar un destino.
    const normalizarDestino = (val: string): string => {
        if (!val) return '';
        const canonico = destinoCanonico(val);
        return canonico || '';
    };

    const normalizarMes = (val: any): string => {
        if (!val) return '01';
        const str = String(val).toLowerCase().trim();
        const mapaMeses: Record<string, string> = {
            'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
            'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
            'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
            'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04',
            'may': '05', 'jun': '06', 'jul': '07', 'ago': '08',
            'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
        };
        if (mapaMeses[str]) return mapaMeses[str];
        const num = parseInt(str, 10);
        if (!isNaN(num) && num >= 1 && num <= 12) {
            return num < 10 ? `0${num}` : `${num}`;
        }
        return '01';
    };

    const normalizarTexto = (texto: string) => {
        return (texto || '')
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    };

    const tokenizar = (texto: string): string[] => {
        const stopWords = new Set(['de', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'un', 'una', 'unos', 'unas', 'para', 'por', 'con', 'al', 'del', 'a', 'o', 'u']);
        return normalizarTexto(texto)
            .split(' ')
            .filter(w => w.length > 1 && !stopWords.has(w));
    };

    const calcularSimilitudActividad = (excelTexto: string, dbTexto: string): number => {
        const normExcel = normalizarTexto(excelTexto);
        const normDb = normalizarTexto(dbTexto);
        if (!normExcel || !normDb) return 0;
        if (normExcel === normDb) return 1.0;
        if (normDb.includes(normExcel) || normExcel.includes(normDb)) return 0.95;

        const tokensExcel = tokenizar(normExcel);
        const tokensDb = tokenizar(normDb);
        if (tokensExcel.length === 0 || tokensDb.length === 0) return 0;

        let matches = 0;
        for (const tE of tokensExcel) {
            const found = tokensDb.some(tD => {
                if (tE === tD) return true;
                if (tE.startsWith(tD) || tD.startsWith(tE)) return true;
                // Coincidencia de raíz para singular/plural o variantes (ej: tecnologico/tecnologicos, informativos/informaticos)
                if (tE.length >= 5 && tD.length >= 5 && tE.slice(0, 5) === tD.slice(0, 5)) {
                    return true;
                }
                return false;
            });
            if (found) matches++;
        }

        return matches / tokensExcel.length;
    };

    const procesarArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setCargando(true);
        setNombreArchivo(file.name);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });

                // Priorizar hoja "Presupuesto" o la primera hoja
                const wsname = wb.SheetNames.find(n => n.toLowerCase().includes('presupuesto')) || wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

                if (data.length === 0) {
                    alert('La hoja de Excel está vacía.');
                    setCargando(false);
                    return;
                }

                const catsDisponibles = listaCategorias.length > 0 ? listaCategorias : (categorias || []);

                const procesadas: FilaImportada[] = data.map((row) => {
                    const errores: string[] = [];

                    // Lectura de columnas tolerante a mayúsculas, tildes, asteriscos y
                    // espacios en los encabezados.
                    const celda = crearLector(row);
                    const nombre = (celda('Nombre del Insumo', 'Nombre Insumo', 'Insumo', 'Producto') ?? '').toString().trim();
                    const detalle = (celda('Detalle / Especificaciones', 'Detalle', 'Descripcion', 'Especificaciones') ?? '').toString().trim();
                    const cantRaw = Number(celda('Cantidad') ?? 1);
                    const formato = (celda('Formato de Unidad', 'Formato', 'Unidad') ?? 'Unidad').toString().trim();
                    const celdaValor = celda('Valor Unitario con IVA', 'Valor Unitario', 'Precio Unitario', 'Valor', 'Precio');
                    const valorUnitRaw = (celdaValor !== undefined && celdaValor !== null && String(celdaValor).trim() !== '') ? Number(celdaValor) : 0;
                    const mesRaw = celda('Mes de Ejecución', 'Mes') ?? '01';
                    const destinoRaw = (celda('Destino del Gasto', 'Destino') ?? '').toString().trim();
                    const motivo = (celda('Justificación / Motivo', 'Justificación', 'Motivo') ?? '').toString().trim();
                    const dimensionRaw = (celda('Dimensión PME (Opcional)', 'Dimensión PME', 'Dimension PME', 'Dimensión', 'Dimension') ?? '').toString().trim();
                    const idActividadRaw = celda(
                        'ID Actividad (Opcional)', 'ID Actividad', 'ID Actividad PME', 'Id Actividad',
                        'id_actividad', 'ID Act', 'Id Act', 'Cod Actividad', 'Codigo Actividad', 'ID Actividad PME (Opcional)'
                    );
                    const actividadRaw = (celda('Actividad PME (Opcional)', 'Actividad PME', 'Actividad', 'Nombre Actividad') ?? '').toString().trim();

                    // Normalizaciones. El destino NO tiene valor por defecto: si la
                    // columna falta o trae algo que no se reconoce, la fila se marca
                    // con error. Antes caía en "Estudiantes" y el gasto quedaba mal
                    // clasificado sin que nadie se enterara.
                    const destinoNormalizado = normalizarDestino(destinoRaw);
                    const mesNormalizado = normalizarMes(mesRaw);
                    const totalIva = cantRaw * valorUnitRaw;

                    // Mapeo opcional de Subvención y Código Contable directo del Excel
                    const subvencionRaw = (celda('Subvención Aplicable', 'Subvención', 'Subvencion') ?? '').toString().trim();

                    // Extraer código general o según el destino mapeado
                    let codigoCuentaRaw = (
                        celda('Código Contable', 'Cuenta Contable', 'Codigo Cuenta', 'Codigo Contable') ?? ''
                    ).toString().trim();

                    if (!nombre) errores.push('El nombre del insumo es obligatorio.');
                    if (!detalle) errores.push('Las especificaciones/detalle son obligatorias.');
                    if (!destinoNormalizado) {
                        errores.push(destinoRaw
                            ? `Destino del gasto no reconocido: «${destinoRaw}».`
                            : 'Falta el destino del gasto.');
                    }
                    if (!cantRaw || isNaN(cantRaw) || cantRaw <= 0) errores.push('Cantidad inválida.');
                    if (isNaN(valorUnitRaw) || valorUnitRaw < 0) errores.push('Precio unitario inválido.');
                    if (!motivo) errores.push('El motivo/justificación es obligatorio.');

                    if (!codigoCuentaRaw) {
                        if (destinoNormalizado === 'clases(alumno)') {
                            codigoCuentaRaw = (celda('Código Contable (Sala Clases)', 'Codigo Contable Sala Clases') ?? '').toString().trim();
                        } else if (destinoNormalizado === 'oficinas(administracion)') {
                            codigoCuentaRaw = (celda('Código Contable (Administración)', 'Codigo Contable Administracion') ?? '').toString().trim();
                        } else if (destinoNormalizado === 'premio/beneficio') {
                            codigoCuentaRaw = (celda('Código Contable (Premios)', 'Codigo Contable Premios') ?? '').toString().trim();
                        } else if (destinoNormalizado === 'mantencion/servicio') {
                            codigoCuentaRaw = (celda('Código Contable (Mantención)', 'Codigo Contable Mantencion') ?? '').toString().trim();
                        }
                    }

                    // Resolver Subvención
                    let subvId: number | null = null;
                    if (subvencionRaw && subvencionesActivas.length > 0) {
                        const matchSubv = subvencionesActivas.find(s =>
                            s.nombre_corto.toLowerCase() === subvencionRaw.toLowerCase() ||
                            (s.codigo && s.codigo.toLowerCase() === subvencionRaw.toLowerCase())
                        );
                        if (matchSubv) subvId = matchSubv.id_subvencion;
                    }
                    if (!subvId) {
                        const matchingMap = mapeosRecurso.filter(m => m.destino_gasto === destinoNormalizado);
                        if (matchingMap.length > 0) subvId = matchingMap[0].id_subvencion;
                    }

                    // Resolver Categoría (por ID o por Nombre)
                    const idCatRaw = celda(
                        'ID Categoría', 'ID Categoria', 'Id Categoria', 'id_cat_recurso',
                        'ID Cat', 'Id Cat', 'ID', 'Id', 'Cod Categoria', 'Categoria Id',
                        'ID Categoria Opcional', 'ID Categoría Opcional'
                    );
                    const catNombreRaw = (celda('Categoría', 'Categoria', 'Nombre Categoría', 'Nombre Categoria', 'Categorias') ?? '').toString().trim();

                    let idCatResuelto: number | null = null;
                    let catNombreResuelto: string | null = null;

                    if (idCatRaw !== undefined && idCatRaw !== null && String(idCatRaw).trim() !== '' && !isNaN(Number(idCatRaw))) {
                        const numId = Number(idCatRaw);
                        const match = catsDisponibles.find((c: any) => (c.id_cat_recurso ?? c.id) === numId);
                        if (match) {
                            idCatResuelto = numId;
                            catNombreResuelto = match.nombre;
                        } else {
                            idCatResuelto = numId;
                            catNombreResuelto = `Categoría #${numId}`;
                        }
                    } else if (catNombreRaw && catsDisponibles.length > 0) {
                        const match = catsDisponibles.find((c: any) => 
                            c.nombre.toLowerCase().trim() === catNombreRaw.toLowerCase().trim() ||
                            c.nombre.toLowerCase().trim().includes(catNombreRaw.toLowerCase().trim())
                        );
                        if (match) {
                            idCatResuelto = (match.id_cat_recurso ?? match.id) ?? null;
                            catNombreResuelto = match.nombre;
                        } else {
                            catNombreResuelto = catNombreRaw;
                        }
                    }

                    // Resolver Actividad PME:
                    // 1. PRIORIDAD MÁXIMA: Si viene texto en la columna de actividad (actividadRaw),
                    // buscar la mejor coincidencia inteligente en el catálogo de actividades del colegio.
                    let idAct: number | null = null;
                    let actividadNombreResuelta: string = '';
                    let dimensionResuelta: string | null = dimensionRaw || null;

                    if (actividadRaw && String(actividadRaw).trim() !== '') {
                        const actNorm = normalizarTexto(actividadRaw);

                        // 1.1 Coincidencia exacta
                        let matchAct = todasActividades.find((a: any) => normalizarTexto(a.nombre) === actNorm);

                        // 1.2 Búsqueda difusa por similitud de palabras clave (tokens y raíces)
                        if (!matchAct) {
                            let mejorScore = 0;
                            let mejorCandidata: any = null;

                            for (const a of todasActividades) {
                                const score = calcularSimilitudActividad(actividadRaw, a.nombre);
                                if (score > mejorScore) {
                                    mejorScore = score;
                                    mejorCandidata = a;
                                }
                            }

                            // Si tiene más del 50% de palabras coincidentes, es la actividad buscada
                            if (mejorScore >= 0.50 && mejorCandidata) {
                                matchAct = mejorCandidata;
                            }
                        }

                        if (matchAct) {
                            idAct = (matchAct as any).id ?? (matchAct as any).id_actividad;
                            actividadNombreResuelta = matchAct.nombre;
                            if (!dimensionResuelta && matchAct.dimension) {
                                dimensionResuelta = matchAct.dimension;
                            }
                        }
                    } else if (idActividadRaw !== undefined && idActividadRaw !== null && String(idActividadRaw).trim() !== '' && !isNaN(Number(idActividadRaw))) {
                        // 2. Solo si la columna de nombre vino vacía, se intenta buscar por ID explícito
                        const numId = Number(idActividadRaw);
                        const matchById = todasActividades.find((a: any) => (a.id ?? a.id_actividad) === numId);
                        if (matchById) {
                            idAct = (matchById as any).id ?? (matchById as any).id_actividad;
                            actividadNombreResuelta = matchById.nombre;
                            if (!dimensionResuelta && matchById.dimension) {
                                dimensionResuelta = matchById.dimension;
                            }
                        }
                    }

                    // 3. Si no hubo ninguna coincidencia válida en el catálogo, queda totalmente en blanco
                    if (!idAct) {
                        idAct = null;
                        actividadNombreResuelta = '';
                    }

                    return {
                        nombre_producto: nombre,
                        descripcion: detalle,
                        cantidad: cantRaw,
                        formato_unidad: formato || 'Unidad',
                        valor_unitario_iva: valorUnitRaw,
                        total_iva: totalIva,
                        tipo_fecha: 'mes',
                        mes_ejecucion: mesNormalizado,
                        destino_gasto: destinoNormalizado,
                        motivo: motivo,
                        dimension_pme: dimensionResuelta,
                        actividad_nombre_excel: actividadNombreResuelta,
                        id_actividad: idAct,
                        id_subvencion: subvId,
                        id_cat_recurso: idCatResuelto ?? null,
                        categoria_nombre: catNombreResuelto || null,
                        codigo_cuenta: codigoCuentaRaw || null,
                        subvencion_excel: subvencionRaw,
                        valida: errores.length === 0,
                        errores
                    };
                });

                setFilas(procesadas);
                setPaso('revision');
            } catch (err) {
                console.error('Error al procesar Excel:', err);
                alert('No se pudo leer el archivo Excel. Asegúrese de que tenga un formato válido .xlsx o .xls');
            } finally {
                setCargando(false);
            }
        };

        reader.readAsBinaryString(file);
    };

    const handleConfirmarImportacion = () => {
        const validas = filas.filter(f => f.valida);
        if (validas.length === 0) {
            alert('No hay filas válidas para importar. Por favor corrija las filas marcadas en rojo.');
            return;
        }

        const preparadas = validas.map(f => {
            const actSel = f.id_actividad ? todasActividades.find(a => (a.id ?? (a as any).id_actividad) === f.id_actividad) : null;
            return {
                nombre_producto: f.nombre_producto,
                descripcion: f.descripcion,
                cantidad: f.cantidad,
                formato_unidad: f.formato_unidad,
                valor_unitario_iva: f.valor_unitario_iva,
                total_iva: f.total_iva,
                tipo_fecha: f.tipo_fecha,
                mes_ejecucion: f.mes_ejecucion,
                fecha_ejecucion: `2027-${f.mes_ejecucion}-01`,
                destino_gasto: f.destino_gasto,
                motivo: f.motivo,
                id_actividad: f.id_actividad,
                actividad_seleccionada: actSel,
                id_subvencion: f.id_subvencion,
                id_cat_recurso: f.id_cat_recurso || null,
                _idCategoria: f.id_cat_recurso || null,
                _esNuevo: true,
                categoria_nombre: f.categoria_nombre || null,
                codigo_cuenta: (f as any).codigo_cuenta || null,
                dimension_pme: (f as any).dimension_pme || null,
                id_subarea: idSubareaImport
            };
        });

        onImportarConfirmado(preparadas);
        onClose();
    };

    const totalValidas = filas.filter(f => f.valida).length;
    const totalInvalidas = filas.filter(f => !f.valida).length;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-6 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
                            <FileSpreadsheet size={22} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900">Importar Presupuesto desde Excel</h3>
                            <p className="text-xs text-gray-500 font-medium">Carga masiva de insumos requeridos mediante la plantilla oficial</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                    {paso === 'subida' ? (
                        <div className="space-y-6 py-6">
                            <div className="border-2 border-dashed border-gray-200 rounded-3xl p-10 text-center hover:border-primary/50 transition-all bg-gray-50/50 flex flex-col items-center justify-center">
                                <Upload size={40} className="text-primary mb-3 opacity-80" />
                                <h4 className="text-sm font-bold text-gray-800 mb-1">Selecciona o arrastra tu plantilla llena (.xlsx)</h4>
                                <p className="text-xs text-gray-400 font-medium mb-6 max-w-sm">Asegúrate de haber completado la plantilla oficial descargada previamente.</p>
                                
                                <div className="flex items-center gap-3 flex-wrap justify-center">
                                    <button
                                        type="button"
                                        onClick={() => descargarPlantillaPresupuesto(todasActividades, categorias)}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-bold text-xs cursor-pointer transition-all active:scale-95 shadow-xs"
                                    >
                                        <Download size={16} className="text-gray-500" />
                                        <span>Descargar Plantilla Oficial</span>
                                    </button>

                                    <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold text-xs cursor-pointer transition-all active:scale-95 shadow-md shadow-primary/20">
                                        {cargando ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                                        {cargando ? 'Procesando Excel...' : 'Buscar Archivo Excel'}
                                        <input type="file" accept=".xlsx, .xls" onChange={procesarArchivo} disabled={cargando} className="hidden" />
                                    </label>
                                </div>
                            </div>

                            <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
                                <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
                                <div className="text-xs text-blue-900 leading-relaxed font-medium space-y-1">
                                    <p className="font-bold">Información importante sobre la importación:</p>
                                    <p>• Puedes incluir la columna <b>ID Categoría</b> para clasificar los recursos de inmediato.</p>
                                    <p>• La subvención se asignará automáticamente calculando el Área y el Destino del gasto.</p>
                                    <p>• Los insumos que no existan en el catálogo se registrarán como <b>Nuevos / Sugeridos</b> para su aprobación.</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Resumen de diagnóstico */}
                            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-gray-100 flex-wrap gap-3">
                                <div>
                                    <p className="text-xs font-bold text-gray-800">Archivo: <span className="text-primary">{nombreArchivo}</span></p>
                                    <p className="text-[11px] text-gray-500 font-semibold">{filas.length} insumos detectados en total</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-xl text-xs font-bold">
                                        <CheckCircle2 size={14} /> {totalValidas} Válidos
                                    </span>
                                    {totalInvalidas > 0 && (
                                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold">
                                            <XCircle size={14} /> {totalInvalidas} Con Errores
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Cargo solicitante: se aplica a todas las filas importadas.
                                Se muestra explícita para que el badge del presupuesto no
                                salga con una cargo que el usuario nunca eligió. */}
                            <div className="flex items-center justify-between gap-3 bg-amber-50/70 border border-amber-200 p-3.5 rounded-2xl flex-wrap">
                                <div className="min-w-0">
                                    <p className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider">
                                        Cargo solicitante de estos insumos
                                    </p>
                                    <p className="text-[10px] text-amber-700/90 font-medium mt-0.5">
                                        Es la que aparecerá en el badge de cada fila del presupuesto.
                                    </p>
                                </div>
                                <select
                                    value={idSubareaImport ?? ''}
                                    onChange={(e) => setIdSubareaImport(e.target.value ? parseInt(e.target.value) : null)}
                                    className="px-3 py-2 bg-white border border-amber-300 rounded-xl text-[11px] font-bold text-amber-900 focus:outline-none focus:ring-4 focus:ring-amber-200/50 cursor-pointer"
                                >
                                    <option value="">Heredar de la solicitud</option>
                                    {subareasUsuario.map((s: any) => (
                                        <option key={s.id_subarea} value={s.id_subarea}>{s.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Tabla de revisión previa */}
                            <div className="border border-gray-100 rounded-2xl overflow-hidden max-h-[350px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50 sticky top-0 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider z-10">
                                        <tr>
                                            <th className="px-4 py-2.5">Estado</th>
                                            <th className="px-4 py-2.5">Insumo / Detalle</th>
                                            <th className="px-3 py-2.5">Categoría</th>
                                            <th className="px-3 py-2.5 text-center">Cant.</th>
                                            <th className="px-3 py-2.5 text-right">Unitario</th>
                                            <th className="px-3 py-2.5 text-right">Total</th>
                                            <th className="px-4 py-2.5">Destino</th>
                                            <th className="px-4 py-2.5">Actividad PME</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-xs font-medium">
                                        {filas.map((f, idx) => (
                                            <tr key={idx} className={f.valida ? 'hover:bg-gray-50/60' : 'bg-red-50/40 hover:bg-red-50/70'}>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {f.valida ? (
                                                        <span className="inline-flex items-center gap-1 text-green-600 font-bold text-[10px]">
                                                             Listo
                                                        </span>
                                                    ) : (
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="inline-flex items-center gap-1 text-red-600 font-bold text-[10px]" title={f.errores.join(' | ')}>
                                                                <AlertTriangle size={14} /> Error
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-gray-900">{f.nombre_producto || '—'}</div>
                                                    <div className="text-[10px] text-gray-400 line-clamp-1">{f.descripcion}</div>
                                                    {!f.valida && f.errores.length > 0 && (
                                                        <div className="mt-1 text-[10px] font-semibold text-red-600 bg-red-100/80 px-2 py-0.5 rounded-md inline-block">
                                                            ⚠️ {f.errores.join(' · ')}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap">
                                                    {f.categoria_nombre ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                                                            <Tag size={10} className="text-purple-500" />
                                                            {f.categoria_nombre}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-gray-400 font-medium">—</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 text-center font-bold text-gray-700">{f.cantidad} {f.formato_unidad}</td>
                                                <td className="px-3 py-3 text-right font-medium text-gray-600">{formatCLP(f.valor_unitario_iva)}</td>
                                                <td className="px-3 py-3 text-right font-bold text-primary">{formatCLP(f.total_iva)}</td>
                                                <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-700">{etiquetaDestino(f.destino_gasto)}</td>
                                                <td className="px-4 py-3 text-[11px] text-gray-500">
                                                    {f.id_actividad ? (
                                                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100" title={f.actividad_nombre_excel}>
                                                            ✓ PME Vinculado
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400 font-normal">Sin PME</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-white shrink-0">
                    {paso === 'revision' ? (
                        <button
                            type="button"
                            onClick={() => setPaso('subida')}
                            className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-800 transition-all"
                        >
                            ← Elegir otro archivo
                        </button>
                    ) : <div />}

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all"
                        >
                            Cancelar
                        </button>
                        {paso === 'revision' && (
                            <button
                                type="button"
                                disabled={totalValidas === 0}
                                onClick={handleConfirmarImportacion}
                                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Check size={16} strokeWidth={2.5} />
                                Importar {totalValidas} Insumos a la Solicitud
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
