'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import * as XLSX from 'xlsx';
import { primeraRutaAccesible } from '@/lib/permissions/registry';
import {
    Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, XCircle,
    Loader2, Building2, Tag, RefreshCw, Trash2, PackageSearch, Info, Calendar,
    Wallet, UserRound, Plus, X, Lock, ClipboardList, ArrowRight, Search,
} from 'lucide-react';
import { MESES, PresupuestoAnual, Colegio } from '@/lib/types';
import { DESTINOS_LABELS } from '@/lib/destinos';

interface Area { id_area: number; nombre: string; }
interface Cargo { id_subarea: number; nombre: string; id_area: number; area?: Area; }
interface CategoriaRecurso { id_cat_recurso: number; nombre: string; }
interface Subvencion { id_subvencion: number; nombre_corto: string; nombre_completo: string; estado: string; }
interface UsuarioColegio { id_user: number; nombre: string; correo: string; rol: string; rol_codigo: string; }
interface AreaJefe { id_area: number; nombre: string; id_jefe?: number | null; jefe_nombre?: string | null; }

/** Solicitud contra la que se cargará la planilla (recién creada o ya existente). */
interface SolicitudCreada {
    id_presupuesto: number;
    codigo: string;
    subarea_nombre: string;
    solicitante_nombre: string;
    estado: string;
    /** Recursos que ya tiene cargados (0 si acaba de crearse). */
    recursos: number;
    /** true si se retomó una solicitud previa en vez de crearla ahora. */
    esExistente: boolean;
}

/** Fila del listado de solicitudes ya creadas dentro del presupuesto anual. */
interface SolicitudExistente {
    id_presupuesto: number;
    codigo: string;
    subarea_nombre: string | null;
    user_nombre: string | null;
    estado: string;
    monto_total: number;
    detalles: unknown[];
}

interface FilaExcel {
    categoria_nombre: string;
    nombre_producto: string;
    descripcion?: string;
    cantidad: number;
    precio: number;
    formato_unidad?: string;
    codigo_cuenta?: string;
    motivo?: string;
    fechaEjecucion?: string;                        // 'YYYY-MM-DD' ya resuelta
    tipoFecha?: 'mensual' | 'fecha_especifica';
    fechaIlegible?: string;                         // texto original si no se pudo interpretar
    idActividad?: number;
    destinoGasto?: string;
    subvencionNombre?: string;
    subareaNombre?: string;
}

/** Una hoja leída del archivo. Solo se importa la que el usuario elija. */
interface HojaLeida {
    nombreHoja: string;
    filas: FilaExcel[];
}

/** Recurso del catálogo, venga del buscador o de las sugerencias del análisis. */
interface RecursoCatalogo {
    id_recurso: number;
    nombre: string;
    descripcion?: string | null;
    categoria_nombre?: string | null;
    id_cat_recurso?: number | null;
    formato?: string | null;
}

/** Diagnóstico que devuelve el backend por cada fila, antes de escribir nada. */
interface AnalisisFila {
    fila: number;
    nombre_producto: string;
    id_recurso: number | null;
    recurso_existente: boolean;
    recurso_descripcion_catalogo: string | null;
    recurso_categoria_catalogo: string | null;
    sugerencias: RecursoCatalogo[];
    id_cat_recurso: number | null;
    categoria_encontrada: boolean;
    codigo_cuenta_valido: boolean;
    codigo_cuenta_nombre: string | null;
    problemas: string[];
}

/** Fila ya editable en la pantalla de revisión (Excel + diagnóstico + ediciones). */
interface FilaRevision extends FilaExcel {
    fila: number;
    incluir: boolean;
    /** Nombre tal como venía en el Excel, antes de vincularlo a un recurso del catálogo. */
    nombreOriginal: string;
    idRecurso: number | null;
    recursoExistente: boolean;
    descripcionCatalogo: string | null;
    categoriaCatalogo: string | null;
    sugerencias: RecursoCatalogo[];
    idCatRecurso: number | '';
    codigoValido: boolean;
    codigoNombre: string | null;
    // Editables por fila en la tabla de revisión (antes eran solo defaults de la carga).
    destinoFila: string;
    idSubvencionFila: number | '';
    mesFila: number;
}

interface ResultadoImport {
    id_presupuesto: number;
    codigo: string;
    subarea_nombre: string;
    solicitante_nombre: string;
    filas_importadas: number;
    filas_omitidas: { fila: number; motivo: string }[];
    recursos_creados: number;
    recursos_reutilizados: number;
}

const NOMBRES_MES: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Fecha resuelta de una fila: o un mes del año presupuestado, o una fecha exacta. */
interface FechaFila {
    fecha: string;                                // 'YYYY-MM-DD'
    tipoFecha: 'mensual' | 'fecha_especifica';
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** Nº de serie de Excel (días desde 1899-12-30) → año/mes/día, sin sesgo de zona horaria. */
function serialExcelAFecha(serial: number): { y: number; m: number; d: number } {
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const f = new Date(ms);
    return { y: f.getUTCFullYear(), m: f.getUTCMonth() + 1, d: f.getUTCDate() };
}

/**
 * Interpreta la columna "Mes o Fecha". Acepta:
 *   - nombre de mes: "marzo"            → tipo mensual, día 1 del año presupuestado
 *   - número 1-12:   3                  → tipo mensual
 *   - fecha exacta:  "15/08/2026"       → tipo fecha_especifica
 *   - fecha ISO:     "2026-08-15"       → tipo fecha_especifica
 *   - nº de serie de Excel (celda con formato fecha) → tipo fecha_especifica
 * Devuelve undefined si no logra interpretarla (el llamador avisa, no descarta en silencio).
 */
function parseFecha(valor: any, year: number): FechaFila | undefined {
    if (valor === null || valor === undefined || valor === '') return undefined;

    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
        return {
            fecha: `${valor.getUTCFullYear()}-${dosDigitos(valor.getUTCMonth() + 1)}-${dosDigitos(valor.getUTCDate())}`,
            tipoFecha: 'fecha_especifica',
        };
    }

    if (typeof valor === 'number' && !Number.isNaN(valor)) {
        // 1-12 se interpreta como mes; valores mayores son el nº de serie de Excel.
        if (valor >= 1 && valor <= 12) {
            return { fecha: `${year}-${dosDigitos(Math.trunc(valor))}-01`, tipoFecha: 'mensual' };
        }
        if (valor > 12) {
            const { y, m, d } = serialExcelAFecha(valor);
            return { fecha: `${y}-${dosDigitos(m)}-${dosDigitos(d)}`, tipoFecha: 'fecha_especifica' };
        }
        return undefined;
    }

    const texto = String(valor).trim();
    if (!texto) return undefined;

    // dd/mm/yyyy o dd-mm-yyyy (formato chileno)
    const dmy = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (dmy) {
        const d = Number(dmy[1]), m = Number(dmy[2]), y = Number(dmy[3]);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            return { fecha: `${y}-${dosDigitos(m)}-${dosDigitos(d)}`, tipoFecha: 'fecha_especifica' };
        }
        return undefined;
    }

    // yyyy-mm-dd
    const ymd = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymd) {
        const y = Number(ymd[1]), m = Number(ymd[2]), d = Number(ymd[3]);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            return { fecha: `${y}-${dosDigitos(m)}-${dosDigitos(d)}`, tipoFecha: 'fecha_especifica' };
        }
        return undefined;
    }

    const soloNumero = Number(texto);
    if (!Number.isNaN(soloNumero)) return parseFecha(soloNumero, year);

    const mes = NOMBRES_MES[texto.toLowerCase()];
    if (mes) return { fecha: `${year}-${dosDigitos(mes)}-01`, tipoFecha: 'mensual' };

    return undefined;
}

// DESTINOS_LABELS ahora viene de lib/destinos (importado arriba). Antes este archivo
// tenía las 4 etiquetas duplicadas (etiqueta + canónico) y los `<select>` que iteran
// sus entradas mostraban 8 opciones, la mitad repetidas.

// Texto libre aceptado en la columna "Destino" del Excel → clave interna del sistema.
const DESTINOS_ALIAS: Record<string, string> = {
    'clases(alumno)': 'clases(alumno)',
    'alumnos': 'clases(alumno)',
    'alumno': 'clases(alumno)',
    'sala de clases (alumnos)': 'clases(alumno)',
    'sala de clases': 'clases(alumno)',
    'estudiantes': 'clases(alumno)',
    'estudiantes (actividades, sala de clases, eventos etc)': 'clases(alumno)',
    'oficinas(administracion)': 'oficinas(administracion)',
    'funcionarios': 'oficinas(administracion)',
    'funcionarios (oficina, actividades de func., etc)': 'oficinas(administracion)',
    'oficina / administración (funcionarios)': 'oficinas(administracion)',
    'administracion': 'oficinas(administracion)',
    'administración': 'oficinas(administracion)',
    'oficina': 'oficinas(administracion)',
    'premio/beneficio': 'premio/beneficio',
    'premio / beneficio': 'premio/beneficio',
    'actividad (premio beneficio)': 'premio/beneficio',
    'premio': 'premio/beneficio',
    'beneficio': 'premio/beneficio',
    'mantencion/servicio': 'mantencion/servicio',
    'mantención / servicio': 'mantencion/servicio',
    'mantencion': 'mantencion/servicio',
    'mantención': 'mantencion/servicio',
    'servicio': 'mantencion/servicio',
};

function parseDestino(valor: any): string | undefined {
    if (!valor) return undefined;
    return DESTINOS_ALIAS[String(valor).trim().toLowerCase()];
}

const formatCLP = (value: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value || 0);

const formatFecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

export default function ImportarPresupuestoPage() {
    const { user, tienePermiso, puedeSeccion, isLoading: authLoading } = useAuth();
    const router = useRouter();
    // Sección exclusiva del rol Administrador (no depende de permisos configurables por rol).
    const puedeImportar = user?.rol?.codigo === 'ADM';

    // ── Paso 1: colegio + presupuesto anual ──────────────────────────────────
    const [colegios, setColegios] = useState<Colegio[]>([]);
    const [idColegioSel, setIdColegioSel] = useState<number | ''>('');
    const [presupuestos, setPresupuestos] = useState<PresupuestoAnual[]>([]);
    const [idPptoSel, setIdPptoSel] = useState<number | ''>('');
    const [cargandoPptos, setCargandoPptos] = useState(true);
    const [showCrearPpto, setShowCrearPpto] = useState(false);
    const [formPpto, setFormPpto] = useState({ year: new Date().getFullYear(), nombre: '', descripcion: '' });
    const [creandoPpto, setCreandoPpto] = useState(false);
    const [errorPpto, setErrorPpto] = useState('');

    // ── Paso 2: solicitud ────────────────────────────────────────────────────
    const [areas, setAreas] = useState<Area[]>([]);
    const [cargos, setSubareas] = useState<Cargo[]>([]);
    const [usuarios, setUsuarios] = useState<UsuarioColegio[]>([]);
    const [areasJefes, setAreasJefes] = useState<AreaJefe[]>([]);
    const [formSol, setFormSol] = useState<{ idArea: number | ''; idSubarea: number | ''; idUser: number | ''; comentario: string }>(
        { idArea: '', idSubarea: '', idUser: '', comentario: '' }
    );
    const [creandoSol, setCreandoSol] = useState(false);
    const [errorSol, setErrorSol] = useState('');
    const [solicitud, setSolicitud] = useState<SolicitudCreada | null>(null);
    // Se puede crear una solicitud nueva o retomar una ya creada del mismo presupuesto.
    const [modoSol, setModoSol] = useState<'nueva' | 'existente'>('nueva');
    const [solicitudesPpto, setSolicitudesPpto] = useState<SolicitudExistente[]>([]);
    const [cargandoSols, setCargandoSols] = useState(false);

    // ── Paso 3: planilla ─────────────────────────────────────────────────────
    const [categorias, setCategorias] = useState<CategoriaRecurso[]>([]);
    const [subvenciones, setSubvenciones] = useState<Subvencion[]>([]);
    const [cargandoCatalogos, setCargandoCatalogos] = useState(true);
    const [fileName, setFileName] = useState('');
    const [hojas, setHojas] = useState<HojaLeida[]>([]);
    const [hojaSel, setHojaSel] = useState('');
    const [leyendoArchivo, setLeyendoArchivo] = useState(false);
    const [errorArchivo, setErrorArchivo] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [destinoGasto, setDestinoGasto] = useState('');
    const [idSubvencion, setIdSubvencion] = useState<number | ''>('');
    const [motivoDefault, setMotivoDefault] = useState('');
    const [mesDefault, setMesDefault] = useState(new Date().getMonth() + 1);
    const [importando, setImportando] = useState(false);
    const [errorImportar, setErrorImportar] = useState('');

    // ── Paso 4: revisión recurso por recurso ─────────────────────────────────
    const [revision, setRevision] = useState<FilaRevision[]>([]);
    const [analizando, setAnalizando] = useState(false);
    const [errorAnalisis, setErrorAnalisis] = useState('');
    const [soloProblemas, setSoloProblemas] = useState(false);
    const [catModal, setCatModal] = useState<{ fila: number; nombre: string } | null>(null);
    const [catDestinos, setCatDestinos] = useState<string[]>([]);
    const [creandoCat, setCreandoCat] = useState(false);
    const [errorCat, setErrorCat] = useState('');

    // ── Paso 4: resultado ────────────────────────────────────────────────────
    const [resultado, setResultado] = useState<ResultadoImport | null>(null);
    const [aprobando, setAprobando] = useState(false);
    const [aprobada, setAprobada] = useState(false);
    const [errorAprobar, setErrorAprobar] = useState('');

    // Sección exclusiva del rol Administrador: si no lo es, se redirige a su módulo.
    useEffect(() => {
        if (!authLoading && !puedeImportar) {
            router.replace(primeraRutaAccesible(tienePermiso, puedeSeccion) || '/dashboard');
        }
    }, [authLoading, puedeImportar, tienePermiso, puedeSeccion, router]);

    useEffect(() => {
        const fetchCatalogos = async () => {
            try {
                setCargandoCatalogos(true);
                const [resAreas, resSub, resCat, resSubv] = await Promise.all([
                    api.get('/catalogos/areas'),
                    api.get('/catalogos/cargos'),
                    api.get('/presupuesto/categoria-recurso'),
                    api.get('/presupuesto/subvenciones'),
                ]);
                setAreas(resAreas.data || []);
                setSubareas(resSub.data || []);
                setCategorias(resCat.data || []);
                setSubvenciones(resSubv.data || []);
            } catch (e) {
                console.error('Error cargando catálogos:', e);
            } finally {
                setCargandoCatalogos(false);
            }
        };
        if (puedeImportar) fetchCatalogos();
    }, [puedeImportar]);

    // Colegios disponibles; por defecto se preselecciona el del usuario.
    useEffect(() => {
        if (!puedeImportar) return;
        api.get('/catalogos/colegios')
            .then(res => setColegios(res.data || []))
            .catch(e => console.error('Error cargando colegios:', e));
    }, [puedeImportar]);

    useEffect(() => {
        if (user?.id_colegio && idColegioSel === '') setIdColegioSel(user.id_colegio);
    }, [user?.id_colegio, idColegioSel]);

    // Presupuestos anuales del colegio elegido.
    const fetchPresupuestos = useCallback(async () => {
        if (!idColegioSel) {
            setPresupuestos([]);
            setCargandoPptos(false);
            return;
        }
        try {
            setCargandoPptos(true);
            const res = await api.get('/presupuesto/presupuestos-anuales', {
                params: { id_colegio: idColegioSel },
            });
            setPresupuestos(res.data || []);
        } catch (e) {
            console.error('Error cargando presupuestos anuales:', e);
            setPresupuestos([]);
        } finally {
            setCargandoPptos(false);
        }
    }, [idColegioSel]);

    useEffect(() => {
        if (puedeImportar) fetchPresupuestos();
    }, [puedeImportar, fetchPresupuestos]);

    // Usuarios y jefaturas del colegio elegido: alimentan el selector de solicitante.
    useEffect(() => {
        if (!puedeImportar || !idColegioSel) { setUsuarios([]); setAreasJefes([]); return; }
        Promise.all([
            api.get(`/catalogos/colegios/${idColegioSel}/usuarios`),
            api.get('/catalogos/areas/jefes', { params: { id_colegio: idColegioSel } }),
        ])
            .then(([resU, resJ]) => { setUsuarios(resU.data || []); setAreasJefes(resJ.data || []); })
            .catch(e => console.error('Error cargando usuarios del colegio:', e));
    }, [puedeImportar, idColegioSel]);

    const pptoSel = useMemo(
        () => presupuestos.find(p => p.id_presupuesto_anual === idPptoSel) || null,
        [presupuestos, idPptoSel]
    );

    // El año ya no se escribe: lo manda el presupuesto anual elegido.
    const year = pptoSel?.year ?? new Date().getFullYear();

    const categoriasSet = useMemo(
        () => new Set(categorias.map(c => c.nombre.trim().toLowerCase())),
        [categorias]
    );

    const subareasDelArea = useMemo(
        () => formSol.idArea === '' ? [] : cargos.filter(s => (s.area?.id_area ?? s.id_area) === formSol.idArea),
        [cargos, formSol.idArea]
    );

    const filas = useMemo(
        () => hojas.find(h => h.nombreHoja === hojaSel)?.filas ?? [],
        [hojas, hojaSel]
    );

    // ── Paso 1: acciones ─────────────────────────────────────────────────────

    /** Vuelve al Paso 2 en limpio, conservando colegio y presupuesto. */
    const reiniciarSolicitud = () => {
        setSolicitud(null);
        setFormSol({ idArea: '', idSubarea: '', idUser: '', comentario: '' });
        setErrorSol('');
        reiniciarArchivo();
        setResultado(null);
        setAprobada(false);
        setErrorAprobar('');
    };

    const reiniciarArchivo = () => {
        setHojas([]);
        setHojaSel('');
        setFileName('');
        setErrorArchivo('');
        setErrorImportar('');
        setRevision([]);
        setErrorAnalisis('');
        setSoloProblemas(false);
        setDestinoGasto('');
        setIdSubvencion('');
        setMesDefault(new Date().getMonth() + 1);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const seleccionarPpto = (id: number | '') => {
        setIdPptoSel(id);
        reiniciarSolicitud();
    };

    // Cambiar de colegio invalida el presupuesto y los usuarios ya elegidos.
    const cambiarColegio = (id: number | '') => {
        setIdColegioSel(id);
        setIdPptoSel('');
        reiniciarSolicitud();
    };

    const crearPresupuesto = async () => {
        setCreandoPpto(true);
        setErrorPpto('');
        try {
            const res = await api.post('/presupuesto/presupuestos-anuales', {
                year: Number(formPpto.year),
                nombre: formPpto.nombre.trim() || null,
                descripcion: formPpto.descripcion.trim() || null,
                ...(idColegioSel ? { id_colegio: Number(idColegioSel) } : {}),
            });
            await fetchPresupuestos();
            setIdPptoSel(res.data.id_presupuesto_anual);
            setShowCrearPpto(false);
        } catch (e: any) {
            setErrorPpto(e?.response?.data?.detail || 'No se pudo crear el presupuesto anual.');
        } finally {
            setCreandoPpto(false);
        }
    };

    // ── Paso 2: acciones ─────────────────────────────────────────────────────

    /** Solicitudes ya creadas dentro del presupuesto anual elegido. */
    const fetchSolicitudesPpto = useCallback(async () => {
        if (!idPptoSel) { setSolicitudesPpto([]); return; }
        try {
            setCargandoSols(true);
            const res = await api.get(`/presupuesto/presupuestos-anuales/${idPptoSel}/solicitudes`);
            setSolicitudesPpto(res.data || []);
        } catch (e) {
            console.error('Error cargando solicitudes del presupuesto:', e);
            setSolicitudesPpto([]);
        } finally {
            setCargandoSols(false);
        }
    }, [idPptoSel]);

    useEffect(() => {
        if (puedeImportar) fetchSolicitudesPpto();
    }, [puedeImportar, fetchSolicitudesPpto]);

    /** Retoma una solicitud ya creada para cargarle (más) recursos. */
    const retomarSolicitud = (id: number | '') => {
        if (id === '') { setSolicitud(null); return; }
        const s = solicitudesPpto.find(x => x.id_presupuesto === id);
        if (!s) return;
        setSolicitud({
            id_presupuesto: s.id_presupuesto,
            codigo: s.codigo,
            subarea_nombre: s.subarea_nombre || '—',
            solicitante_nombre: s.user_nombre || '—',
            estado: s.estado,
            recursos: s.detalles?.length || 0,
            esExistente: true,
        });
        setMotivoDefault(`Presupuesto ${year} — importado desde planilla de ${s.subarea_nombre || 'área'}.`);
        reiniciarArchivo();
        setResultado(null);
        setAprobada(false);
        setErrorAprobar('');
    };

    /** Cambiar de área limpia la cargo y propone al jefe del área como solicitante. */
    const cambiarArea = (idArea: number | '') => {
        const jefe = areasJefes.find(a => a.id_area === idArea)?.id_jefe;
        const sugerido = jefe && usuarios.some(u => u.id_user === jefe) ? jefe : '';
        setFormSol(f => ({ ...f, idArea, idSubarea: '', idUser: sugerido || f.idUser }));
    };

    const crearSolicitud = async () => {
        if (!pptoSel || formSol.idSubarea === '' || formSol.idUser === '') return;
        setCreandoSol(true);
        setErrorSol('');
        try {
            const res = await api.post('/presupuesto/importar/solicitud', {
                id_presupuesto_anual: pptoSel.id_presupuesto_anual,
                id_subarea: Number(formSol.idSubarea),
                id_user: Number(formSol.idUser),
                comentario: formSol.comentario.trim() || null,
            });
            const sub = cargos.find(s => s.id_subarea === Number(formSol.idSubarea));
            const usr = usuarios.find(u => u.id_user === Number(formSol.idUser));
            setSolicitud({
                id_presupuesto: res.data.id_presupuesto,
                codigo: res.data.codigo,
                subarea_nombre: sub?.nombre || '—',
                solicitante_nombre: usr?.nombre || '—',
                estado: res.data.estado || 'Pendiente',
                recursos: 0,
                esExistente: false,
            });
            setMotivoDefault(`Presupuesto ${pptoSel.year} — importado desde planilla de ${sub?.nombre || 'área'}.`);
            fetchSolicitudesPpto();   // la nueva ya cuenta en el listado de "existentes"
        } catch (e: any) {
            setErrorSol(e?.response?.data?.detail || 'No se pudo crear la solicitud.');
        } finally {
            setCreandoSol(false);
        }
    };

    // ── Paso 3: acciones ─────────────────────────────────────────────────────

    const descargarPlantilla = () => {
        const catA = categorias[0]?.nombre || 'Materiales de Oficina';
        const catB = categorias[1]?.nombre || catA;

        const ejemplo = [
            {
                'Categoría': catA,
                'Recurso': 'Resma de papel carta 75gr',
                'Detalle': 'Caja de 10 resmas',
                'Precio (con IVA)': 25000,
                'Cantidad': 1,
                'Formato': 'caja',
                'Código Contable': '410901',
                'Motivo': '',
                'Mes o Fecha': '',
                'ID Actividad PME': '',
                'Destino': '',
                'Subvención': '',
                'Cargo': '',
            },
            {
                'Categoría': catA,
                'Recurso': 'Lápices grafito',
                'Detalle': 'Caja de 12 unidades',
                'Precio (con IVA)': 3500,
                'Cantidad': 5,
                'Formato': 'caja',
                'Código Contable': '',
                'Motivo': '',
                'Mes o Fecha': 'Marzo',
                'ID Actividad PME': '',
                'Destino': '',
                'Subvención': '',
                'Cargo': '',
            },
            {
                'Categoría': catB,
                'Recurso': 'Servicio de mantención de impresoras',
                'Detalle': '',
                'Precio (con IVA)': 120000,
                'Cantidad': 1,
                'Formato': 'unidad',
                'Código Contable': '',
                'Motivo': 'Contrato de mantención preventiva anual.',
                'Mes o Fecha': '15/08/2026',
                'ID Actividad PME': '',
                'Destino': 'Funcionarios',
                'Subvención': '',
                'Cargo': '',
            },
        ];

        const notas = [
            { 'Columna': 'Categoría', 'Obligatoria': 'Sí', 'Notas': 'Debe coincidir EXACTO (sin importar mayúsculas) con una categoría existente en Presupuesto › Categorías de Recursos. Si no coincide, la fila se omite.' },
            { 'Columna': 'Recurso', 'Obligatoria': 'Sí', 'Notas': 'Nombre del recurso. Si ya existe uno con el mismo nombre en el catálogo, se reutiliza; si no, se crea uno nuevo — igual que al escribir un "Nuevo Insumo" en Agregar Recursos.' },
            { 'Columna': 'Detalle', 'Obligatoria': 'No', 'Notas': 'Descripción del recurso (en Agregar Recursos es obligatoria; aquí es opcional para no bloquear filas de una carga masiva).' },
            { 'Columna': 'Precio (con IVA)', 'Obligatoria': 'Sí', 'Notas': 'Valor unitario CON IVA incluido — mismo campo "Valor Unitario" de Agregar Recursos. El valor sin IVA se calcula solo (precio / 1.19).' },
            { 'Columna': 'Cantidad', 'Obligatoria': 'No', 'Notas': 'Si se deja vacía, se asume 1.' },
            { 'Columna': 'Formato', 'Obligatoria': 'No', 'Notas': 'Formato/unidad de empaque: unidad, caja, docena, pack, set, kit, lote, resma, rollo, bolsa, sobre, kg, litro, metro, global, etc. (mismas opciones que en Agregar Recursos). Si se deja vacía, se asume "unidad".' },
            { 'Columna': 'Código Contable', 'Obligatoria': 'No', 'Notas': 'Si se deja vacía, el recurso se importa igual sin código (se puede completar después desde GO-Compras). Si el código no existe en el Manual de Cuentas, se ignora automáticamente.' },
            { 'Columna': 'Motivo', 'Obligatoria': 'No', 'Notas': 'Justificación de la necesidad (obligatoria en Agregar Recursos, igual "Justificación / Motivo de Necesidad"). Si se deja vacía, se usa el "Motivo por defecto" que se define en la pantalla.' },
            { 'Columna': 'Mes o Fecha', 'Obligatoria': 'No', 'Notas': 'Acepta DOS formatos: (a) un mes — "Marzo" o el número 3 — y se guarda como Estimación de Fecha tipo "Mensual"; o (b) una fecha exacta — "15/08/2026" o una celda con formato de fecha — y se guarda como tipo "Fecha específica". Si se deja vacía, se usa el "Mes de ejecución por defecto" de la pantalla. Si el texto no se logra interpretar, la pantalla lo avisa antes de importar (no se descarta en silencio).' },
            { 'Columna': 'ID Actividad PME', 'Obligatoria': 'No', 'Notas': 'Vínculo opcional a una Actividad del PME (mismo campo "Vincular a Actividad PME"). Si el ID no existe, se ignora sin bloquear la fila.' },
            { 'Columna': 'Destino', 'Obligatoria': 'No', 'Notas': 'Mismo campo "¿Para quién o para qué se destina este gasto?" de Agregar Recursos. Acepta: Alumnos, Funcionarios, Premio / Beneficio, Mantención / Servicio (o sus claves internas). Si se deja vacía, se usa el destino elegido en la pantalla.' },
            { 'Columna': 'Subvención', 'Obligatoria': 'No', 'Notas': 'Nombre corto de la Subvención / Centro de Costos (debe existir en el catálogo). Si se deja vacía, se usa la subvención elegida en la pantalla.' },
            { 'Columna': 'Cargo', 'Obligatoria': 'No', 'Notas': 'Cargo solicitante DE ESA FILA (mismo selector "Cargo solicitante" que aparece por ítem en Agregar Recursos). Debe coincidir con el nombre exacto de una cargo existente. Si se deja vacía, se usa la cargo de la solicitud — que es lo normal.' },
            { 'Columna': '(el archivo)', 'Obligatoria': '—', 'Notas': 'La planilla se carga sobre UNA solicitud ya creada en la pantalla (un área y un usuario solicitante). Si el archivo trae varias hojas, se elige cuál importar. Destino, Subvención, Motivo y Mes definidos en la pantalla son solo el VALOR POR DEFECTO: cualquier fila puede traer su propia columna para sobrescribirlo.' },
        ];

        const wb = XLSX.utils.book_new();
        const wsInstrucciones = XLSX.utils.json_to_sheet(notas);
        wsInstrucciones['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 95 }];
        XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');

        const wsEjemplo = XLSX.utils.json_to_sheet(ejemplo);
        wsEjemplo['!cols'] = [{ wch: 22 }, { wch: 32 }, { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 34 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, wsEjemplo, 'Recursos');

        XLSX.writeFile(wb, 'plantilla_importar_presupuesto.xlsx');
    };

    const leerArchivo = (file: File) => {
        setErrorArchivo('');
        setErrorImportar('');
        setResultado(null);
        setLeyendoArchivo(true);
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const wb = XLSX.read(data, { type: 'binary' });
                const nuevasHojas: HojaLeida[] = wb.SheetNames.map((nombreHoja): HojaLeida => {
                    const sheet = wb.Sheets[nombreHoja];
                    const filasRaw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                    const filasHoja: FilaExcel[] = filasRaw
                        .map((row: any): FilaExcel => ({
                            categoria_nombre: String(row['Categoría'] ?? row['Categoria'] ?? '').trim(),
                            nombre_producto: String(row['Recurso'] ?? row['Nombre'] ?? '').trim(),
                            descripcion: String(row['Detalle'] ?? row['Descripción'] ?? row['Descripcion'] ?? '').trim() || undefined,
                            cantidad: parseFloat(String(row['Cantidad'] ?? '1').replace(',', '.')) || 1,
                            precio: parseFloat(String(row['Precio (con IVA)'] ?? row['Precio'] ?? '').replace(',', '.')),
                            formato_unidad: String(row['Formato'] ?? '').trim() || undefined,
                            codigo_cuenta: String(row['Código Contable'] ?? row['Codigo Contable'] ?? '').trim() || undefined,
                            motivo: String(row['Motivo'] ?? '').trim() || undefined,
                            ...(() => {
                                const crudo = row['Mes o Fecha'] ?? row['Mes'] ?? row['Fecha'] ?? row['Mes de Ejecución'] ?? row['Mes de Ejecucion'] ?? '';
                                if (crudo === '' || crudo === null || crudo === undefined) return {};
                                const f = parseFecha(crudo, year);
                                if (!f) return { fechaIlegible: String(crudo).trim() };
                                return { fechaEjecucion: f.fecha, tipoFecha: f.tipoFecha };
                            })(),
                            idActividad: (() => {
                                const raw = row['ID Actividad PME'] ?? row['Actividad PME'] ?? '';
                                const n = parseInt(String(raw), 10);
                                return Number.isNaN(n) ? undefined : n;
                            })(),
                            destinoGasto: parseDestino(row['Destino']),
                            subvencionNombre: String(row['Subvención'] ?? row['Subvencion'] ?? '').trim() || undefined,
                            subareaNombre: String(row['Cargo'] ?? row['Cargo'] ?? '').trim() || undefined,
                        }))
                        .filter(f => f.nombre_producto);

                    return { nombreHoja, filas: filasHoja };
                }).filter(h => h.filas.length > 0);

                if (nuevasHojas.length === 0) {
                    setErrorArchivo('El archivo no tiene filas con datos en ninguna hoja.');
                }
                setHojas(nuevasHojas);
                // Con una sola hoja no hay nada que elegir; con varias, se pide elegir.
                setHojaSel(nuevasHojas.length === 1 ? nuevasHojas[0].nombreHoja : '');
            } catch (err) {
                console.error(err);
                setErrorArchivo('No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx).');
            } finally {
                setLeyendoArchivo(false);
            }
        };
        reader.onerror = () => {
            setErrorArchivo('No se pudo leer el archivo.');
            setLeyendoArchivo(false);
        };
        reader.readAsBinaryString(file);
    };

    // Al elegir la hoja se diagnostica contra la base (sin escribir nada) y se
    // arma la tabla de revisión editable.
    useEffect(() => {
        if (!solicitud || filas.length === 0) { setRevision([]); return; }
        let cancelado = false;
        (async () => {
            setAnalizando(true);
            setErrorAnalisis('');
            try {
                const res = await api.post('/presupuesto/importar/analizar', {
                    items: filas.map(f => ({
                        categoria_nombre: f.categoria_nombre,
                        nombre_producto: f.nombre_producto,
                        descripcion: f.descripcion,
                        cantidad: f.cantidad,
                        precio: Number.isNaN(f.precio) ? null : f.precio,
                        formato_unidad: f.formato_unidad,
                        codigo_cuenta: f.codigo_cuenta,
                    })),
                });
                if (cancelado) return;
                const analisis: AnalisisFila[] = res.data.filas || [];
                setRevision(filas.map((f, i) => {
                    const a = analisis[i];
                    return {
                        ...f,
                        fila: a?.fila ?? i + 1,
                        incluir: true,
                        nombreOriginal: f.nombre_producto,
                        idRecurso: a?.id_recurso ?? null,
                        recursoExistente: !!a?.recurso_existente,
                        descripcionCatalogo: a?.recurso_descripcion_catalogo ?? null,
                        categoriaCatalogo: a?.recurso_categoria_catalogo ?? null,
                        sugerencias: a?.sugerencias ?? [],
                        idCatRecurso: a?.id_cat_recurso ?? '',
                        codigoValido: !!a?.codigo_cuenta_valido,
                        codigoNombre: a?.codigo_cuenta_nombre ?? null,
                        // Cada fila arranca con lo que trajo el Excel; lo que falte se
                        // completa con la barra "aplicar a todas" o fila por fila.
                        destinoFila: f.destinoGasto || '',
                        idSubvencionFila: (() => {
                            if (!f.subvencionNombre) return '' as number | '';
                            const s = subvenciones.find(
                                x => x.nombre_corto.trim().toLowerCase() === f.subvencionNombre!.trim().toLowerCase()
                            );
                            return s ? s.id_subvencion : ('' as number | '');
                        })(),
                        mesFila: f.fechaEjecucion
                            ? parseInt(f.fechaEjecucion.slice(5, 7), 10)
                            : new Date().getMonth() + 1,
                    };
                }));
            } catch (e: any) {
                if (!cancelado) setErrorAnalisis(e.response?.data?.detail || 'No se pudo analizar la planilla.');
            } finally {
                if (!cancelado) setAnalizando(false);
            }
        })();
        return () => { cancelado = true; };
    }, [solicitud, filas, subvenciones]);

    const actualizarFila = (fila: number, cambios: Partial<FilaRevision>) => {
        setRevision(prev => prev.map(r => r.fila === fila ? { ...r, ...cambios } : r));
    };

    // Buscador de recursos del catálogo dentro de la tabla de revisión.
    const [buscadorFila, setBuscadorFila] = useState<number | null>(null);
    const [buscadorQuery, setBuscadorQuery] = useState('');
    const [buscadorResultados, setBuscadorResultados] = useState<RecursoCatalogo[]>([]);
    const [buscandoRecursos, setBuscandoRecursos] = useState(false);

    useEffect(() => {
        if (buscadorFila === null || buscadorQuery.trim().length < 2) {
            setBuscadorResultados([]);
            return;
        }
        let cancelado = false;
        const t = setTimeout(async () => {
            setBuscandoRecursos(true);
            try {
                const res = await api.get('/presupuesto/recursos/buscar', {
                    params: { q: buscadorQuery.trim(), page: 1, limit: 8 },
                });
                if (!cancelado) setBuscadorResultados(res.data || []);
            } catch {
                if (!cancelado) setBuscadorResultados([]);
            } finally {
                if (!cancelado) setBuscandoRecursos(false);
            }
        }, 300);
        return () => { cancelado = true; clearTimeout(t); };
    }, [buscadorFila, buscadorQuery]);

    /**
     * Vincula la fila a un recurso del catálogo: adopta su nombre y, si la
     * descripción está vacía, guarda ahí el texto original del Excel — así
     * "Agua con gas" se convierte en el recurso "Agua" descrito como "con gas"
     * en vez de duplicar el catálogo.
     */
    const vincularRecurso = (fila: number, rec: RecursoCatalogo) => {
        setRevision(prev => prev.map(r => {
            if (r.fila !== fila) return r;
            return {
                ...r,
                nombre_producto: rec.nombre,
                idRecurso: rec.id_recurso,
                recursoExistente: true,
                descripcionCatalogo: rec.descripcion ?? null,
                categoriaCatalogo: rec.categoria_nombre ?? null,
                descripcion: (r.descripcion || '').trim() || r.nombreOriginal,
                // Si la fila no tenía categoría resuelta, hereda la del recurso.
                idCatRecurso: r.idCatRecurso === '' && rec.id_cat_recurso ? rec.id_cat_recurso : r.idCatRecurso,
                formato_unidad: r.formato_unidad || rec.formato || undefined,
                sugerencias: [],
            };
        }));
        setBuscadorFila(null);
        setBuscadorQuery('');
        setBuscadorResultados([]);
    };

    /**
     * Aplica un valor a TODAS las filas incluidas. Es el reemplazo de los antiguos
     * "por defecto" del paso anterior: aquí se ve el efecto en la tabla al instante
     * y cualquier fila se puede seguir ajustando a mano después.
     */
    const aplicarATodas = (cambios: Partial<FilaRevision>) => {
        setRevision(prev => prev.map(r => r.incluir ? { ...r, ...cambios } : r));
    };

    /** Deshace la vinculación: la fila vuelve a su nombre del Excel y creará un recurso nuevo. */
    const desvincularRecurso = (fila: number) => {
        setRevision(prev => prev.map(r => r.fila === fila ? {
            ...r,
            nombre_producto: r.nombreOriginal,
            idRecurso: null,
            recursoExistente: false,
            descripcionCatalogo: null,
            categoriaCatalogo: null,
        } : r));
    };

    /** Crea la categoría que falta y la asigna a todas las filas que la nombraban igual. */
    const crearCategoria = async () => {
        if (!catModal || catDestinos.length === 0) return;
        setCreandoCat(true);
        setErrorCat('');
        try {
            const res = await api.post('/presupuesto/categoria-recurso', {
                nombre: catModal.nombre.trim(),
                destino_gasto: catDestinos,
            });
            const nueva: CategoriaRecurso = res.data;
            setCategorias(prev => [...prev, nueva]);
            const objetivo = catModal.nombre.trim().toLowerCase();
            setRevision(prev => prev.map(r =>
                r.idCatRecurso === '' && r.categoria_nombre.trim().toLowerCase() === objetivo
                    ? { ...r, idCatRecurso: nueva.id_cat_recurso }
                    : r
            ));
            setCatModal(null);
            setCatDestinos([]);
        } catch (e: any) {
            setErrorCat(e.response?.data?.detail || 'No se pudo crear la categoría.');
        } finally {
            setCreandoCat(false);
        }
    };

    const filasIncluidas = useMemo(() => revision.filter(r => r.incluir), [revision]);

    /** Una fila está lista si tiene nombre, categoría, destino y un precio válido. */
    const filaLista = (r: FilaRevision) =>
        !!r.nombre_producto.trim() && r.idCatRecurso !== '' && r.destinoFila !== ''
        && !Number.isNaN(r.precio) && r.precio > 0;

    const resumenRevision = useMemo(() => {
        const nuevos = filasIncluidas.filter(r => !r.recursoExistente).length;
        const reutilizados = filasIncluidas.filter(r => r.recursoExistente).length;
        const sinCategoria = filasIncluidas.filter(r => r.idCatRecurso === '').length;
        const sinDestino = filasIncluidas.filter(r => r.destinoFila === '').length;
        const sinPrecio = filasIncluidas.filter(r => Number.isNaN(r.precio) || !(r.precio > 0)).length;
        const sinCodigo = filasIncluidas.filter(r => !r.codigoValido).length;
        const monto = filasIncluidas.reduce((acc, r) => acc + (Number.isNaN(r.precio) ? 0 : r.precio * r.cantidad), 0);
        return {
            nuevos, reutilizados, sinCategoria, sinDestino, sinPrecio, sinCodigo, monto,
            pendientes: filasIncluidas.filter(r => !filaLista(r)).length,
        };
    }, [filasIncluidas]);

    const revisionVisible = useMemo(
        () => soloProblemas ? revision.filter(r => !filaLista(r)) : revision,
        [revision, soloProblemas]
    );

    const validacion = useMemo(() => {
        const sinCategoria = filas.filter(f => !categoriasSet.has(f.categoria_nombre.trim().toLowerCase())).length;
        const sinPrecio = filas.filter(f => Number.isNaN(f.precio)).length;
        const conCodigo = filas.filter(f => f.codigo_cuenta).length;
        const fechaIlegible = filas.filter(f => f.fechaIlegible).length;
        const conFechaExacta = filas.filter(f => f.tipoFecha === 'fecha_especifica').length;
        const total = filas.length;
        const montoTotal = filas.reduce((acc, f) => acc + (Number.isNaN(f.precio) ? 0 : f.precio * f.cantidad), 0);
        return { sinCategoria, sinPrecio, conCodigo, fechaIlegible, conFechaExacta, total, montoTotal };
    }, [filas, categoriasSet]);

    /** Filas que el backend sí podrá guardar (el resto se omite y se informa). */
    const filasImportables = useMemo(() => filasIncluidas.filter(filaLista), [filasIncluidas]);

    // Las filas incompletas NO bloquean: se avisa y se omiten. Solo hace falta que
    // al menos una pueda guardarse para que la llamada tenga sentido.
    const listoParaImportar = !!solicitud && filasImportables.length > 0 && !importando;

    const handleImportar = async () => {
        if (!solicitud) return;
        setImportando(true);
        setErrorImportar('');
        setResultado(null);
        try {
            const payload = {
                id_presupuesto: solicitud.id_presupuesto,
                motivo_default: motivoDefault,
                // Se envían las filas ya revisadas: categoría y recurso resueltos por id,
                // y la descripción/motivo tal como quedaron tras editarlos.
                items: filasIncluidas.map(f => ({
                    categoria_nombre: f.categoria_nombre,
                    id_cat_recurso: f.idCatRecurso === '' ? undefined : Number(f.idCatRecurso),
                    id_recurso: f.idRecurso ?? undefined,
                    nombre_producto: f.nombre_producto,
                    descripcion: f.descripcion,
                    // Los campos incompletos viajan como ausentes, no como '' o NaN:
                    // el backend los omite fila a fila en vez de rechazar la petición.
                    cantidad: Number.isNaN(f.cantidad) ? 1 : f.cantidad,
                    precio: Number.isNaN(f.precio) ? null : f.precio,
                    formato_unidad: f.formato_unidad,
                    // Un código que no está en el Manual de Cuentas no se manda:
                    // el ítem entra sin cuenta y se completa después en GO-Compras.
                    codigo_cuenta: f.codigoValido ? f.codigo_cuenta : undefined,
                    motivo: f.motivo,
                    // Fecha: se respeta la exacta que trajo el Excel; si no, el mes
                    // elegido para esa fila en la tabla (día 1, tipo "mensual").
                    fecha_ejecucion: f.tipoFecha === 'fecha_especifica' && f.fechaEjecucion
                        ? f.fechaEjecucion
                        : `${year}-${String(f.mesFila).padStart(2, '0')}-01`,
                    tipo_fecha: f.tipoFecha === 'fecha_especifica' ? 'fecha_especifica' : 'mensual',
                    id_actividad: f.idActividad,
                    destino_gasto: f.destinoFila || undefined,
                    id_subvencion: f.idSubvencionFila === '' ? undefined : Number(f.idSubvencionFila),
                    subarea_nombre: f.subareaNombre,
                })),
            };
            const res = await api.post('/presupuesto/importar/recursos', payload);
            setResultado(res.data);
            // Refrescar el conteo por si se retoma esta u otra solicitud del presupuesto.
            setSolicitud(s => s ? { ...s, recursos: s.recursos + (res.data.filas_importadas || 0) } : s);
            fetchSolicitudesPpto();
        } catch (e: any) {
            setErrorImportar(e.response?.data?.detail || 'Error al importar los recursos.');
        } finally {
            setImportando(false);
        }
    };

    // ── Paso 4: aprobar ──────────────────────────────────────────────────────

    const aprobarSolicitud = async () => {
        if (!solicitud) return;
        setAprobando(true);
        setErrorAprobar('');
        try {
            await api.patch(`/presupuesto/solicitudes/${solicitud.id_presupuesto}/estado?nuevo_estado=Aprobado`);
            setAprobada(true);
        } catch (e: any) {
            setErrorAprobar(e.response?.data?.detail || 'No se pudo aprobar la solicitud.');
        } finally {
            setAprobando(false);
        }
    };

    if (authLoading || !puedeImportar) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-r-transparent" />
            </div>
        );
    }

    return (
        <div className="animate-in fade-in duration-500 space-y-8 max-w-5xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5">
                        <Upload className="text-primary" size={28} /> Importar Presupuesto
                    </h2>
                    <p className="text-gray-500 mt-1.5 font-medium">
                        Crea la solicitud a nombre del área y carga sus recursos desde una planilla.
                    </p>
                </div>
                <button
                    onClick={descargarPlantilla}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all whitespace-nowrap"
                >
                    <Download size={16} /> Descargar plantilla
                </button>
            </div>

            {/* ── Paso 1: Presupuesto anual (año + creador) ─────────────────── */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6 space-y-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                        <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">1</span>
                        Presupuesto anual de destino
                    </div>
                    <button
                        onClick={() => { setFormPpto({ year: new Date().getFullYear(), nombre: '', descripcion: '' }); setErrorPpto(''); setShowCrearPpto(true); }}
                        className="text-xs font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                        <Plus size={14} /> Crear presupuesto
                    </button>
                </div>

                <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                        <Building2 size={12} /> Colegio del presupuesto y de las solicitudes
                    </label>
                    <select
                        value={idColegioSel}
                        onChange={e => cambiarColegio(e.target.value ? Number(e.target.value) : '')}
                        className={`w-full md:max-w-md px-3 py-2.5 border rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary ${idColegioSel === '' ? 'border-red-200 text-red-500' : 'border-gray-200 text-gray-900'}`}
                    >
                        <option value="">Seleccionar colegio...</option>
                        {colegios.map(c => (
                            <option key={c.id_colegio} value={c.id_colegio}>{c.nombre}</option>
                        ))}
                    </select>
                    <p className="text-[11px] text-gray-400 mt-1">
                        Todas las solicitudes generadas quedarán registradas en este colegio.
                    </p>
                </div>

                {!idColegioSel ? (
                    <p className="text-xs text-gray-400">Selecciona un colegio para ver sus presupuestos anuales.</p>
                ) : cargandoPptos ? (
                    <p className="text-xs text-gray-400 flex items-center gap-2"><Loader2 className="animate-spin" size={12} /> Cargando presupuestos anuales...</p>
                ) : presupuestos.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center space-y-2">
                        <Wallet size={26} className="text-gray-300 mx-auto" />
                        <p className="text-sm font-semibold text-gray-500">Este colegio aún no tiene presupuestos anuales.</p>
                        <p className="text-xs text-gray-400">Crea el año al que pertenece la planilla antes de subirla.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Año al que se cargará la planilla</label>
                            <select
                                value={idPptoSel}
                                onChange={e => seleccionarPpto(e.target.value ? Number(e.target.value) : '')}
                                className={`w-full md:max-w-md px-3 py-2.5 border rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary ${idPptoSel === '' ? 'border-red-200 text-red-500' : 'border-gray-200 text-gray-900'}`}
                            >
                                <option value="">Seleccionar presupuesto anual...</option>
                                {presupuestos.map(p => (
                                    <option key={p.id_presupuesto_anual} value={p.id_presupuesto_anual}>
                                        {p.year} — {p.nombre}{p.estado === 'cerrado' ? ' (cerrado)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {pptoSel && (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-5">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><Calendar size={22} /></div>
                                        <div>
                                            <span className="text-3xl font-extrabold text-gray-900 leading-none">{pptoSel.year}</span>
                                            <p className="text-sm font-bold text-gray-700 mt-1">{pptoSel.nombre}</p>
                                        </div>
                                    </div>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${pptoSel.estado === 'activo' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                        {pptoSel.estado === 'activo' ? <CheckCircle2 size={13} /> : <Lock size={13} />}
                                        {pptoSel.estado === 'activo' ? 'Activo' : 'Cerrado'}
                                    </span>
                                </div>

                                {pptoSel.descripcion && (
                                    <p className="text-xs text-gray-500 mt-3">{pptoSel.descripcion}</p>
                                )}

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                                    <div className="p-3 bg-white rounded-xl border border-gray-100">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1"><UserRound size={11} /> Creado por</p>
                                        <p className="text-sm font-bold text-gray-900 mt-1 truncate" title={pptoSel.creado_por_nombre || '—'}>
                                            {pptoSel.creado_por_nombre || '—'}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white rounded-xl border border-gray-100">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Fecha de creación</p>
                                        <p className="text-sm font-bold text-gray-900 mt-1">
                                            {pptoSel.creado_en ? formatFecha(pptoSel.creado_en) : '—'}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white rounded-xl border border-gray-100">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Solicitudes</p>
                                        <p className="text-sm font-bold text-gray-900 mt-1">{pptoSel.solicitudes_count}</p>
                                    </div>
                                    <div className="p-3 bg-white rounded-xl border border-gray-100">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Monto acumulado</p>
                                        <p className="text-sm font-bold text-gray-900 mt-1">{formatCLP(pptoSel.monto_total)}</p>
                                    </div>
                                </div>

                                {pptoSel.colegio_nombre && (
                                    <p className="text-[11px] text-gray-400 mt-3 flex items-center gap-1.5">
                                        <Building2 size={12} /> {pptoSel.colegio_nombre}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Paso 2: Crear la solicitud ────────────────────────────────── */}
            <div className={`bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6 space-y-5 transition-opacity ${pptoSel ? '' : 'opacity-50 pointer-events-none'}`}>
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">2</span>
                    Crear la solicitud
                </div>

                {!pptoSel ? (
                    <p className="text-xs text-gray-400">Selecciona primero el presupuesto anual de destino.</p>
                ) : !solicitud ? (
                    <>
                        {/* Selector de modo: crear una nueva o retomar una ya creada */}
                        <div className="inline-flex p-1 bg-gray-100 rounded-xl gap-1">
                            <button
                                onClick={() => setModoSol('nueva')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${modoSol === 'nueva' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Crear nueva
                            </button>
                            <button
                                onClick={() => setModoSol('existente')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${modoSol === 'existente' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Continuar una existente{solicitudesPpto.length > 0 ? ` (${solicitudesPpto.length})` : ''}
                            </button>
                        </div>

                        {modoSol === 'existente' && (
                            cargandoSols ? (
                                <p className="text-xs text-gray-400 flex items-center gap-2"><Loader2 className="animate-spin" size={12} /> Cargando solicitudes...</p>
                            ) : solicitudesPpto.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center space-y-1">
                                    <ClipboardList size={24} className="text-gray-300 mx-auto" />
                                    <p className="text-sm font-semibold text-gray-500">Este presupuesto aún no tiene solicitudes.</p>
                                    <p className="text-xs text-gray-400">Crea la primera desde la pestaña "Crear nueva".</p>
                                </div>
                            ) : (
                                <div className="border border-gray-100 rounded-2xl divide-y divide-gray-100 max-h-80 overflow-y-auto">
                                    {solicitudesPpto.map(s => {
                                        const nRec = s.detalles?.length || 0;
                                        const aprobadaYa = ['Aprobado', 'Aceptado'].includes(s.estado);
                                        return (
                                            <button
                                                key={s.id_presupuesto}
                                                onClick={() => retomarSolicitud(s.id_presupuesto)}
                                                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between gap-4"
                                            >
                                                <div className="min-w-0">
                                                    <p className="font-mono text-sm font-bold text-gray-900">{s.codigo}</p>
                                                    <p className="text-[11px] text-gray-500 truncate">
                                                        {s.subarea_nombre || '—'} · {s.user_nombre || '—'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-[11px] text-gray-400">{nRec} recurso{nRec !== 1 ? 's' : ''}</span>
                                                    <span className="text-[11px] font-semibold text-gray-600">{formatCLP(s.monto_total)}</span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${aprobadaYa ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-600'}`}>
                                                        {s.estado}
                                                    </span>
                                                    <ArrowRight size={14} className="text-gray-300" />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )
                        )}

                        {modoSol === 'nueva' && (
                            <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5"><Building2 size={12} /> Área</label>
                                <select
                                    value={formSol.idArea}
                                    onChange={e => cambiarArea(e.target.value ? Number(e.target.value) : '')}
                                    className={`w-full px-3 py-2.5 border rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary ${formSol.idArea === '' ? 'border-red-200 text-red-500' : 'border-gray-200 text-gray-900'}`}
                                >
                                    <option value="">Seleccionar área...</option>
                                    {areas.map(a => (
                                        <option key={a.id_area} value={a.id_area}>{a.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5"><Tag size={12} /> Cargo</label>
                                <select
                                    value={formSol.idSubarea}
                                    onChange={e => setFormSol(f => ({ ...f, idSubarea: e.target.value ? Number(e.target.value) : '' }))}
                                    disabled={formSol.idArea === ''}
                                    className={`w-full px-3 py-2.5 border rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-50 disabled:text-gray-400 ${formSol.idSubarea === '' && formSol.idArea !== '' ? 'border-red-200 text-red-500' : 'border-gray-200 text-gray-900'}`}
                                >
                                    <option value="">{formSol.idArea === '' ? 'Elige un área primero' : 'Seleccionar cargo...'}</option>
                                    {subareasDelArea.map(s => (
                                        <option key={s.id_subarea} value={s.id_subarea}>{s.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5"><UserRound size={12} /> Usuario solicitante</label>
                                <select
                                    value={formSol.idUser}
                                    onChange={e => setFormSol(f => ({ ...f, idUser: e.target.value ? Number(e.target.value) : '' }))}
                                    className={`w-full px-3 py-2.5 border rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary ${formSol.idUser === '' ? 'border-red-200 text-red-500' : 'border-gray-200 text-gray-900'}`}
                                >
                                    <option value="">Seleccionar usuario...</option>
                                    {usuarios.map(u => (
                                        <option key={u.id_user} value={u.id_user}>{u.nombre} — {u.rol}</option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-gray-400 mt-1">
                                    La solicitud queda a su nombre, como si él la hubiera creado. Se propone el jefe del área.
                                </p>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">
                                    Comentario <span className="font-normal normal-case text-gray-400">(opcional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={formSol.comentario}
                                    onChange={e => setFormSol(f => ({ ...f, comentario: e.target.value }))}
                                    placeholder={`Presupuesto ${year} del área`}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold bg-white text-gray-900 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                            </div>
                        </div>

                        {errorSol && (
                            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2"><AlertTriangle size={14} /> {errorSol}</div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={crearSolicitud}
                                disabled={formSol.idSubarea === '' || formSol.idUser === '' || creandoSol}
                                className="px-6 py-3 text-sm font-bold text-white bg-primary rounded-xl hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-primary/30 flex items-center gap-2 transition-all"
                            >
                                {creandoSol ? <Loader2 className="animate-spin" size={18} /> : <ClipboardList size={18} />}
                                {creandoSol ? 'Creando...' : 'Crear solicitud'}
                            </button>
                        </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-700"><ClipboardList size={22} /></div>
                                <div>
                                    <p className="text-lg font-extrabold text-gray-900 leading-none font-mono">{solicitud.codigo}</p>
                                    <p className="text-xs text-gray-500 mt-1.5">
                                        {solicitud.subarea_nombre} · a nombre de <span className="font-semibold text-gray-700">{solicitud.solicitante_nombre}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {solicitud.recursos > 0 && (
                                    <span className="text-[11px] font-semibold text-gray-500">
                                        {solicitud.recursos} recurso{solicitud.recursos !== 1 ? 's' : ''} ya cargado{solicitud.recursos !== 1 ? 's' : ''}
                                    </span>
                                )}
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                                    aprobada || ['Aprobado', 'Aceptado'].includes(solicitud.estado)
                                        ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-600'
                                }`}>
                                    {aprobada ? 'Aprobada' : solicitud.estado}
                                </span>
                                <button
                                    onClick={reiniciarSolicitud}
                                    className="text-xs font-semibold text-gray-400 hover:text-red-600 flex items-center gap-1.5 px-2 py-1"
                                    title="Elegir otra solicitud"
                                >
                                    <RefreshCw size={13} /> Otra área
                                </button>
                            </div>
                        </div>

                        {!aprobada && ['Aprobado', 'Aceptado'].includes(solicitud.estado) ? (
                            <p className="text-[11px] text-amber-700 mt-3 flex items-start gap-1.5">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                Esta solicitud ya está aprobada. Los recursos que agregues entrarán como <strong>Pendiente</strong> y no
                                sumarán en GO-Compras hasta que vuelvas a aprobarla en el Paso 5.
                            </p>
                        ) : solicitud.esExistente ? (
                            <p className="text-[11px] text-gray-500 mt-3 flex items-start gap-1.5">
                                <Info size={12} className="shrink-0 mt-0.5 text-emerald-600" />
                                Retomaste una solicitud existente: los recursos de la planilla se <strong>agregarán</strong> a los que ya tiene.
                            </p>
                        ) : (
                            <p className="text-[11px] text-gray-500 mt-3 flex items-start gap-1.5">
                                <Info size={12} className="shrink-0 mt-0.5 text-emerald-600" />
                                La solicitud ya existe y está vacía. Si abandonas ahora, quedará en Presupuesto › Solicitudes y puedes eliminarla desde ahí.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* ── Paso 3: Planilla de recursos ──────────────────────────────── */}
            <div className={`bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6 space-y-5 transition-opacity ${solicitud ? '' : 'opacity-50 pointer-events-none'}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                        <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">3</span>
                        Recursos de la planilla
                        {solicitud && <span className="font-mono text-xs font-normal text-gray-400">→ {solicitud.codigo}</span>}
                    </div>
                    {fileName && (
                        <button onClick={reiniciarArchivo} className="text-xs font-semibold text-gray-400 hover:text-red-600 flex items-center gap-1.5">
                            <Trash2 size={14} /> Quitar archivo
                        </button>
                    )}
                </div>

                {!solicitud && (
                    <p className="text-xs text-gray-400">Crea primero la solicitud del área.</p>
                )}

                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-primary/50 transition-colors cursor-pointer bg-gray-50/50"
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) leerArchivo(f); }}
                    />
                    {leyendoArchivo ? (
                        <span className="flex items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="animate-spin" size={18} /> Leyendo archivo...</span>
                    ) : fileName ? (
                        <span className="flex items-center justify-center gap-2 text-sm font-semibold text-gray-800"><FileSpreadsheet className="text-emerald-600" size={18} /> {fileName} · {hojas.length} hoja(s) con datos</span>
                    ) : (
                        <span className="flex items-center justify-center gap-2 text-sm text-gray-500"><Upload size={18} className="text-gray-400" /> Haz clic o arrastra el Excel aquí</span>
                    )}
                </div>

                {errorArchivo && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2"><AlertTriangle size={14} /> {errorArchivo}</div>
                )}

                {hojas.length > 1 && (
                    <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                            <FileSpreadsheet size={12} /> Hoja a importar
                        </label>
                        <select
                            value={hojaSel}
                            onChange={e => setHojaSel(e.target.value)}
                            className={`w-full md:max-w-md px-3 py-2.5 border rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary ${hojaSel === '' ? 'border-red-200 text-red-500' : 'border-gray-200 text-gray-900'}`}
                        >
                            <option value="">Seleccionar hoja...</option>
                            {hojas.map(h => (
                                <option key={h.nombreHoja} value={h.nombreHoja}>{h.nombreHoja} ({h.filas.length} filas)</option>
                            ))}
                        </select>
                        <p className="text-[11px] text-gray-400 mt-1">
                            El archivo trae varias hojas y esta solicitud es de una sola área: elige cuál corresponde.
                        </p>
                    </div>
                )}

                {filas.length > 0 && (
                    <>
                        <div className="flex items-center gap-3 text-[11px] font-semibold flex-wrap">
                            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600">{validacion.total} filas</span>
                            <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">{formatCLP(validacion.montoTotal)}</span>
                            {validacion.sinCategoria > 0 && (
                                <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1"><AlertTriangle size={11} /> {validacion.sinCategoria} sin categoría válida</span>
                            )}
                            {validacion.sinPrecio > 0 && (
                                <span className="px-2 py-1 rounded-full bg-red-50 text-red-600 flex items-center gap-1"><AlertTriangle size={11} /> {validacion.sinPrecio} sin precio</span>
                            )}
                            <span className="px-2 py-1 rounded-full bg-blue-50 text-primary">{validacion.conCodigo}/{validacion.total} con código contable</span>
                            {validacion.conFechaExacta > 0 && (
                                <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-600">{validacion.conFechaExacta} con fecha exacta</span>
                            )}
                            {validacion.fechaIlegible > 0 && (
                                <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1"><AlertTriangle size={11} /> {validacion.fechaIlegible} con fecha ilegible (usarán el mes por defecto)</span>
                            )}
                        </div>

                        <div className="flex items-start gap-2.5 text-xs text-gray-500 bg-blue-50/50 border border-blue-100 p-3.5 rounded-xl">
                            <Info size={15} className="text-primary shrink-0 mt-0.5" />
                            <span className="leading-relaxed">
                                Nada se escribe todavía. En el <strong>Paso 4</strong> revisas recurso por recurso y ajustas ahí mismo
                                destino, subvención y mes de cada uno. Los ítems entran como <strong>Pendiente</strong> y la solicitud se aprueba al final.
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* ── Paso 4: Revisión recurso por recurso ──────────────────────── */}
            {(analizando || revision.length > 0 || errorAnalisis) && !resultado && (
                <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6 space-y-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                            <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">4</span>
                            Revisar recursos
                        </div>
                        {revision.length > 0 && (
                            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={soloProblemas}
                                    onChange={e => setSoloProblemas(e.target.checked)}
                                    className="w-3.5 h-3.5 text-primary border-gray-300 rounded focus:ring-primary/20"
                                />
                                Ver solo las incompletas
                            </label>
                        )}
                    </div>

                    {analizando ? (
                        <p className="text-xs text-gray-400 flex items-center gap-2">
                            <Loader2 className="animate-spin" size={12} /> Comparando la planilla con el catálogo...
                        </p>
                    ) : errorAnalisis ? (
                        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2"><AlertTriangle size={14} /> {errorAnalisis}</div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 text-[11px] font-semibold flex-wrap">
                                <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600">{filasIncluidas.length} a importar</span>
                                <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">{formatCLP(resumenRevision.monto)}</span>
                                <span className="px-2 py-1 rounded-full bg-blue-50 text-primary">{resumenRevision.nuevos} recursos nuevos</span>
                                <span className="px-2 py-1 rounded-full bg-violet-50 text-violet-600">{resumenRevision.reutilizados} reutilizados</span>
                                {resumenRevision.sinCategoria > 0 && (
                                    <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1"><AlertTriangle size={11} /> {resumenRevision.sinCategoria} sin categoría</span>
                                )}
                                {resumenRevision.sinPrecio > 0 && (
                                    <span className="px-2 py-1 rounded-full bg-red-50 text-red-600 flex items-center gap-1"><AlertTriangle size={11} /> {resumenRevision.sinPrecio} sin precio</span>
                                )}
                                {resumenRevision.sinDestino > 0 && (
                                    <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1"><AlertTriangle size={11} /> {resumenRevision.sinDestino} sin destino</span>
                                )}
                                {resumenRevision.sinCodigo > 0 && (
                                    <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-500">{resumenRevision.sinCodigo} sin código contable</span>
                                )}
                            </div>

                            {/* Aplicar en bloque: rellena la columna correspondiente en todas las filas incluidas */}
                            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">
                                    Aplicar a las {filasIncluidas.length} filas incluidas
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <div>
                                        <label className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1"><Tag size={11} /> Destino del gasto</label>
                                        <select
                                            value={destinoGasto}
                                            onChange={e => { setDestinoGasto(e.target.value); if (e.target.value) aplicarATodas({ destinoFila: e.target.value }); }}
                                            className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold bg-white text-gray-900 focus:ring-1 focus:ring-primary/30 focus:border-primary"
                                        >
                                            <option value="">Elegir para todas...</option>
                                            {Object.entries(DESTINOS_LABELS).map(([valor, label]) => (
                                                <option key={valor} value={valor}>{label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">Subvención</label>
                                        <select
                                            value={idSubvencion}
                                            onChange={e => {
                                                const v = e.target.value ? Number(e.target.value) : '';
                                                setIdSubvencion(v);
                                                aplicarATodas({ idSubvencionFila: v });
                                            }}
                                            className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold bg-white text-gray-900 focus:ring-1 focus:ring-primary/30 focus:border-primary"
                                        >
                                            <option value="">Sin subvención específica</option>
                                            {subvenciones.map(s => (
                                                <option key={s.id_subvencion} value={s.id_subvencion}>{s.nombre_corto}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1"><Calendar size={11} /> Mes de ejecución</label>
                                        <select
                                            value={String(mesDefault).padStart(2, '0')}
                                            onChange={e => {
                                                const m = parseInt(e.target.value, 10);
                                                setMesDefault(m);
                                                aplicarATodas({ mesFila: m });
                                            }}
                                            className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold bg-white text-gray-900 focus:ring-1 focus:ring-primary/30 focus:border-primary"
                                        >
                                            {MESES.map(m => (
                                                <option key={m.value} value={m.value}>{m.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">Motivo para las filas vacías</label>
                                        <input
                                            type="text"
                                            value={motivoDefault}
                                            onChange={e => setMotivoDefault(e.target.value)}
                                            className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold bg-white text-gray-900 focus:ring-1 focus:ring-primary/30 focus:border-primary"
                                        />
                                    </div>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-2">
                                    Sobrescribe la columna en todas las filas incluidas. Después puedes ajustar cualquier fila por separado.
                                </p>
                            </div>

                            <div className="border border-gray-100 rounded-2xl overflow-hidden">
                                <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50 sticky top-0 z-10">
                                            <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                                                <th className="px-3 py-2.5 w-10"></th>
                                                <th className="px-3 py-2.5 min-w-[15rem]">Recurso</th>
                                                <th className="px-3 py-2.5 min-w-[13rem]">Categoría</th>
                                                <th className="px-3 py-2.5 min-w-[14rem]">Descripción</th>
                                                <th className="px-3 py-2.5 min-w-[14rem]">Motivo</th>
                                                <th className="px-3 py-2.5 w-20">Cant.</th>
                                                <th className="px-3 py-2.5 w-28">Precio c/IVA</th>
                                                <th className="px-3 py-2.5 min-w-[12rem]">Destino</th>
                                                <th className="px-3 py-2.5 min-w-[9rem]">Subvención</th>
                                                <th className="px-3 py-2.5 min-w-[8rem]">Ejecución</th>
                                                <th className="px-3 py-2.5 min-w-[9rem]">Cód. contable</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {revisionVisible.map(r => {
                                                const lista = filaLista(r);
                                                return (
                                                    <tr key={r.fila} className={!r.incluir ? 'opacity-40 bg-gray-50/50' : lista ? '' : 'bg-amber-50/30'}>
                                                        <td className="px-3 py-2.5 align-top">
                                                            <input
                                                                type="checkbox"
                                                                checked={r.incluir}
                                                                onChange={e => actualizarFila(r.fila, { incluir: e.target.checked })}
                                                                title={r.incluir ? 'Excluir esta fila' : 'Incluir esta fila'}
                                                                className="w-3.5 h-3.5 mt-1.5 text-primary border-gray-300 rounded focus:ring-primary/20"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2.5 align-top">
                                                            <div className="relative">
                                                                <div className="relative">
                                                                    <input
                                                                        type="text"
                                                                        value={r.nombre_producto}
                                                                        onChange={e => {
                                                                            actualizarFila(r.fila, { nombre_producto: e.target.value });
                                                                            setBuscadorFila(r.fila);
                                                                            setBuscadorQuery(e.target.value);
                                                                        }}
                                                                        onFocus={() => { setBuscadorFila(r.fila); setBuscadorQuery(r.nombre_producto); }}
                                                                        onBlur={() => setTimeout(() => setBuscadorFila(f => f === r.fila ? null : f), 180)}
                                                                        placeholder="Escribe para buscar en el catálogo..."
                                                                        className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg font-semibold text-gray-900 focus:ring-1 focus:ring-primary/30 focus:border-primary"
                                                                    />
                                                                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                                                </div>

                                                                {buscadorFila === r.fila && buscadorQuery.trim().length >= 2 && (
                                                                    <div className="absolute z-30 mt-1 w-full min-w-[18rem] bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                                                        {buscandoRecursos ? (
                                                                            <p className="px-3 py-2 text-[11px] text-gray-400 flex items-center gap-1.5">
                                                                                <Loader2 className="animate-spin" size={11} /> Buscando...
                                                                            </p>
                                                                        ) : buscadorResultados.length === 0 ? (
                                                                            <p className="px-3 py-2 text-[11px] text-gray-400">
                                                                                Sin coincidencias — se creará como recurso nuevo.
                                                                            </p>
                                                                        ) : buscadorResultados.map(rec => (
                                                                            <button
                                                                                key={rec.id_recurso}
                                                                                onMouseDown={e => e.preventDefault()}
                                                                                onClick={() => vincularRecurso(r.fila, rec)}
                                                                                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                                                                            >
                                                                                <p className="font-semibold text-gray-900 text-[11px]">{rec.nombre}</p>
                                                                                <p className="text-[10px] text-gray-400 truncate">
                                                                                    {rec.categoria_nombre || 'Sin categoría'}
                                                                                    {rec.descripcion ? ` · ${rec.descripcion}` : ''}
                                                                                </p>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                                                {r.recursoExistente ? (
                                                                    <>
                                                                        <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-bold text-[10px]">Reutiliza del catálogo</span>
                                                                        {r.nombreOriginal.trim().toLowerCase() !== r.nombre_producto.trim().toLowerCase() && (
                                                                            <button
                                                                                onClick={() => desvincularRecurso(r.fila)}
                                                                                className="text-[10px] font-semibold text-gray-400 hover:text-red-600"
                                                                                title={`Volver a "${r.nombreOriginal}" y crear un recurso nuevo`}
                                                                            >
                                                                                deshacer
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                ) : (
                                                                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-primary font-bold text-[10px]">Se creará nuevo</span>
                                                                )}
                                                                {r.categoriaCatalogo && (
                                                                    <span className="text-[10px] text-gray-400">cat. actual: {r.categoriaCatalogo}</span>
                                                                )}
                                                            </div>

                                                            {/* Parecidos detectados por el análisis: evitan duplicar el catálogo */}
                                                            {!r.recursoExistente && r.sugerencias.length > 0 && (
                                                                <div className="mt-1.5 flex items-start gap-1.5 flex-wrap">
                                                                    <span className="text-[10px] text-amber-600 font-semibold">¿Es alguno de estos?</span>
                                                                    {r.sugerencias.map(s => (
                                                                        <button
                                                                            key={s.id_recurso}
                                                                            onClick={() => vincularRecurso(r.fila, s)}
                                                                            title={s.descripcion || s.nombre}
                                                                            className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold text-[10px] transition-colors"
                                                                        >
                                                                            {s.nombre}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 align-top">
                                                            <select
                                                                value={r.idCatRecurso}
                                                                onChange={e => actualizarFila(r.fila, { idCatRecurso: e.target.value ? Number(e.target.value) : '' })}
                                                                className={`w-full px-2 py-1.5 border rounded-lg font-semibold focus:ring-1 focus:ring-primary/30 focus:border-primary ${r.idCatRecurso === '' ? 'border-red-200 text-red-500' : 'border-gray-200 text-gray-900'}`}
                                                            >
                                                                <option value="">Sin categoría...</option>
                                                                {categorias.map(c => (
                                                                    <option key={c.id_cat_recurso} value={c.id_cat_recurso}>{c.nombre}</option>
                                                                ))}
                                                            </select>
                                                            {r.idCatRecurso === '' && (
                                                                <button
                                                                    onClick={() => { setCatModal({ fila: r.fila, nombre: r.categoria_nombre }); setCatDestinos([]); setErrorCat(''); }}
                                                                    className="mt-1 text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                                                >
                                                                    <Plus size={10} /> Crear "{r.categoria_nombre || 'sin nombre'}"
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 align-top">
                                                            <input
                                                                type="text"
                                                                value={r.descripcion || ''}
                                                                onChange={e => actualizarFila(r.fila, { descripcion: e.target.value })}
                                                                placeholder={r.descripcionCatalogo || 'Sin descripción'}
                                                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-gray-700 focus:ring-1 focus:ring-primary/30 focus:border-primary"
                                                            />
                                                            {r.recursoExistente && r.descripcionCatalogo && (
                                                                <p className="text-[10px] text-gray-400 mt-1 truncate" title={r.descripcionCatalogo}>
                                                                    En catálogo: {r.descripcionCatalogo}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 align-top">
                                                            <input
                                                                type="text"
                                                                value={r.motivo || ''}
                                                                onChange={e => actualizarFila(r.fila, { motivo: e.target.value })}
                                                                placeholder={motivoDefault}
                                                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-gray-700 focus:ring-1 focus:ring-primary/30 focus:border-primary"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2.5 align-top">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="any"
                                                                value={Number.isNaN(r.cantidad) ? '' : r.cantidad}
                                                                onChange={e => actualizarFila(r.fila, { cantidad: parseFloat(e.target.value) })}
                                                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-right font-semibold text-gray-900 focus:ring-1 focus:ring-primary/30 focus:border-primary"
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2.5 align-top">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="any"
                                                                value={Number.isNaN(r.precio) ? '' : r.precio}
                                                                onChange={e => actualizarFila(r.fila, { precio: parseFloat(e.target.value) })}
                                                                className={`w-full px-2 py-1.5 border rounded-lg text-right font-semibold focus:ring-1 focus:ring-primary/30 focus:border-primary ${Number.isNaN(r.precio) || !(r.precio > 0) ? 'border-red-200 text-red-500' : 'border-gray-200 text-gray-900'}`}
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2.5 align-top">
                                                            <select
                                                                value={r.destinoFila}
                                                                onChange={e => actualizarFila(r.fila, { destinoFila: e.target.value })}
                                                                className={`w-full px-2 py-1.5 border rounded-lg font-semibold focus:ring-1 focus:ring-primary/30 focus:border-primary ${r.destinoFila === '' ? 'border-red-200 text-red-500' : 'border-gray-200 text-gray-900'}`}
                                                            >
                                                                <option value="">Sin destino...</option>
                                                                {Object.entries(DESTINOS_LABELS).map(([valor, label]) => (
                                                                    <option key={valor} value={valor}>{label}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td className="px-3 py-2.5 align-top">
                                                            <select
                                                                value={r.idSubvencionFila}
                                                                onChange={e => actualizarFila(r.fila, { idSubvencionFila: e.target.value ? Number(e.target.value) : '' })}
                                                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg font-semibold text-gray-900 focus:ring-1 focus:ring-primary/30 focus:border-primary"
                                                            >
                                                                <option value="">Sin subvención</option>
                                                                {subvenciones.map(s => (
                                                                    <option key={s.id_subvencion} value={s.id_subvencion}>{s.nombre_corto}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td className="px-3 py-2.5 align-top">
                                                            {r.tipoFecha === 'fecha_especifica' && r.fechaEjecucion ? (
                                                                <>
                                                                    <input
                                                                        type="date"
                                                                        value={r.fechaEjecucion}
                                                                        onChange={e => actualizarFila(r.fila, { fechaEjecucion: e.target.value })}
                                                                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg font-semibold text-gray-900 focus:ring-1 focus:ring-primary/30 focus:border-primary"
                                                                    />
                                                                    <button
                                                                        onClick={() => actualizarFila(r.fila, { tipoFecha: 'mensual' })}
                                                                        className="mt-1 text-[10px] font-semibold text-gray-400 hover:text-primary"
                                                                        title="Usar solo el mes en vez de una fecha exacta"
                                                                    >
                                                                        usar mes
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <select
                                                                    value={String(r.mesFila).padStart(2, '0')}
                                                                    onChange={e => actualizarFila(r.fila, { mesFila: parseInt(e.target.value, 10) })}
                                                                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg font-semibold text-gray-900 focus:ring-1 focus:ring-primary/30 focus:border-primary"
                                                                >
                                                                    {MESES.map(m => (
                                                                        <option key={m.value} value={m.value}>{m.label}</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 align-top">
                                                            {r.codigoValido ? (
                                                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px] font-mono" title={r.codigoNombre || ''}>
                                                                    {r.codigo_cuenta}
                                                                </span>
                                                            ) : r.codigo_cuenta ? (
                                                                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold text-[10px]" title="No está en el Manual de Cuentas">
                                                                    {r.codigo_cuenta} · inválido
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] text-gray-400">Se completa en GO-Compras</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {revisionVisible.length === 0 && (
                                                <tr>
                                                    <td colSpan={11} className="px-3 py-8 text-center text-gray-400 text-xs">
                                                        No hay filas incompletas.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex items-start gap-2.5 text-xs text-gray-500 bg-blue-50/50 border border-blue-100 p-3.5 rounded-xl">
                                <Info size={15} className="text-primary shrink-0 mt-0.5" />
                                <span className="leading-relaxed">
                                    Nada se ha escrito todavía. Un recurso que ya existe se <strong>reutiliza</strong> con la descripción y el motivo
                                    que dejes aquí (el catálogo no se modifica); uno nuevo se creará al importar. Los códigos contables que no estén
                                    en el Manual de Cuentas entran vacíos y se completan luego desde GO-Compras.
                                </span>
                            </div>

                            {resumenRevision.pendientes > 0 && (
                                <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-xs flex items-start gap-2">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <span>
                                        {resumenRevision.pendientes} fila(s) están incompletas (falta categoría, destino o precio) y
                                        <strong> se omitirán</strong> al importar; el resto entra igual y las omitidas quedan listadas en el resultado.
                                        Si quieres incluirlas, complétalas arriba.
                                    </span>
                                </div>
                            )}

                            {errorImportar && (
                                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2"><AlertTriangle size={14} /> {errorImportar}</div>
                            )}

                            <div className="flex justify-end">
                                <button
                                    onClick={handleImportar}
                                    disabled={!listoParaImportar}
                                    className="px-6 py-3 text-sm font-bold text-white bg-primary rounded-xl hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-primary/30 flex items-center gap-2 transition-all"
                                >
                                    {importando ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                                    {importando
                                        ? 'Importando...'
                                        : `Importar ${filasImportables.length} recurso${filasImportables.length !== 1 ? 's' : ''}` +
                                          (resumenRevision.pendientes > 0 ? ` (${resumenRevision.pendientes} se omitirán)` : '')}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Paso 5: Resultado y aprobación ────────────────────────────── */}
            {resultado && (
                <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                        <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">5</span>
                        Resultado y aprobación
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="font-bold text-gray-900 flex items-center gap-2">
                                <CheckCircle2 size={18} className="text-emerald-600" />
                                {resultado.subarea_nombre}
                                <span className="text-xs font-mono font-normal text-gray-400">({resultado.codigo})</span>
                            </span>
                            <span className="text-xs font-semibold text-gray-500">
                                {resultado.filas_importadas} importadas · {resultado.recursos_creados} recursos nuevos · {resultado.recursos_reutilizados} reutilizados
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1.5">
                            <UserRound size={12} className="text-gray-400" />
                            Registrada a nombre de <span className="font-semibold">{resultado.solicitante_nombre}</span>
                            {pptoSel?.colegio_nombre && ` · ${pptoSel.colegio_nombre}`}
                        </p>

                        {resultado.filas_omitidas.length > 0 && (
                            <div className="mt-3 max-h-32 overflow-y-auto bg-white/70 rounded-lg border border-gray-100 p-2.5 space-y-1">
                                {resultado.filas_omitidas.map((fo, i) => (
                                    <p key={i} className="text-[11px] text-gray-500 flex items-start gap-1.5">
                                        <PackageSearch size={11} className="shrink-0 mt-0.5 text-gray-400" />
                                        Fila {fo.fila}: {fo.motivo}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>

                    {aprobada ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex items-center justify-between gap-4 flex-wrap">
                            <span className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                                <CheckCircle2 size={18} /> Solicitud aprobada y visible en GO-Compras
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => router.push('/go-compras/historial')}
                                    className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 flex items-center gap-1.5"
                                >
                                    Ver historial <ArrowRight size={15} />
                                </button>
                                <button
                                    onClick={reiniciarSolicitud}
                                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 flex items-center gap-1.5"
                                >
                                    <RefreshCw size={14} /> Cargar otra área
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {errorAprobar && (
                                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2"><AlertTriangle size={14} /> {errorAprobar}</div>
                            )}
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                <p className="text-xs text-gray-500 flex items-start gap-1.5 max-w-xl">
                                    <Info size={13} className="text-primary shrink-0 mt-0.5" />
                                    La solicitud está en <strong>Pendiente</strong> con todos sus ítems sin aprobar. Al aprobarla, sus recursos pasan a Aprobado y aparece en el historial de GO-Compras.
                                </p>
                                <button
                                    onClick={aprobarSolicitud}
                                    disabled={aprobando || resultado.filas_importadas === 0}
                                    className="px-6 py-3 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-md flex items-center gap-2 transition-all"
                                >
                                    {aprobando ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                                    {aprobando ? 'Aprobando...' : 'Aprobar solicitud'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Modal crear categoría faltante */}
            {catModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md p-7 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                                <Tag size={22} className="text-primary" /> Crear categoría
                            </h3>
                            <button onClick={() => setCatModal(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>

                        {errorCat && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm flex items-center gap-2">
                                <AlertTriangle size={16} /> {errorCat}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5">Nombre de la categoría</label>
                                <input
                                    type="text"
                                    value={catModal.nombre}
                                    onChange={e => setCatModal({ ...catModal, nombre: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Viene del Excel. Se asignará a todas las filas que la nombren igual y no tengan categoría.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5">
                                    Destinos en los que aplica <span className="font-normal text-gray-400">(al menos uno)</span>
                                </label>
                                <div className="space-y-1.5">
                                    {['Alumnos', 'Funcionarios', 'Premio / Beneficio', 'Mantención / Servicio'].map(d => (
                                        <label key={d} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={catDestinos.includes(d)}
                                                onChange={e => setCatDestinos(prev => e.target.checked ? [...prev, d] : prev.filter(x => x !== d))}
                                                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary/20"
                                            />
                                            {d}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => setCatModal(null)}
                                className="px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={crearCategoria}
                                disabled={creandoCat || !catModal.nombre.trim() || catDestinos.length === 0}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-primary rounded-xl hover:bg-blue-600 disabled:opacity-40 flex items-center gap-2"
                            >
                                {creandoCat ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                Crear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal crear presupuesto anual */}
            {showCrearPpto && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md p-7 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                                <Wallet size={22} className="text-primary" /> Crear Presupuesto Anual
                            </h3>
                            <button onClick={() => setShowCrearPpto(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>

                        {errorPpto && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm flex items-center gap-2">
                                <AlertTriangle size={16} /> {errorPpto}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5">Año del presupuesto</label>
                                <input
                                    type="number"
                                    value={formPpto.year}
                                    onChange={e => setFormPpto({ ...formPpto, year: parseInt(e.target.value) || new Date().getFullYear() })}
                                    min="2000"
                                    max="2100"
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Para cargar un presupuesto ya ejecutado, usa el año al que corresponde el gasto (no el año en que se planificó).
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5">Nombre <span className="font-normal text-gray-400">(opcional)</span></label>
                                <input
                                    type="text"
                                    value={formPpto.nombre}
                                    onChange={e => setFormPpto({ ...formPpto, nombre: e.target.value })}
                                    placeholder={`Presupuesto ${formPpto.year}`}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5">Descripción <span className="font-normal text-gray-400">(opcional)</span></label>
                                <textarea
                                    value={formPpto.descripcion}
                                    onChange={e => setFormPpto({ ...formPpto, descripcion: e.target.value })}
                                    rows={2}
                                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                                />
                            </div>
                            <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
                                <UserRound size={12} className="shrink-0 mt-0.5" />
                                Quedará registrado a tu nombre: <span className="font-semibold text-gray-500">{user?.nombre}</span>
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => setShowCrearPpto(false)}
                                className="px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={crearPresupuesto}
                                disabled={creandoPpto}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-primary rounded-xl hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                            >
                                {creandoPpto ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                Crear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {cargandoCatalogos && (
                <p className="text-xs text-gray-400 flex items-center gap-2"><Loader2 className="animate-spin" size={12} /> Cargando catálogos de áreas, categorías y subvenciones...</p>
            )}
        </div>
    );
}
