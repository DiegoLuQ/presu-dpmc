'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import {
    Search, Plus, Package, Loader2, Edit, Trash2, Copy,
    Check, X, ChevronDown, ChevronUp, BookOpen, Download, Upload, FileSpreadsheet, Eye, Sparkles
} from 'lucide-react';
import { Recurso, CategoriaRecurso } from '@/lib/types';
import Modal from '@/components/ui/Modal';
const PILARES_OFICIALES = [
    { id: 'clases(alumno)', label: 'Estudiantes (Actividades, sala de clases, eventos etc)', icon: '🏫' },
    { id: 'oficinas(administracion)', label: 'Funcionarios (Oficina, actividades de func., etc)', icon: '🏢' },
    { id: 'premio/beneficio', label: 'Actividad (Premio Beneficio)', icon: '🏆' },
    { id: 'mantencion/servicio', label: 'Mantención / Servicio', icon: '🔧' }
];

import * as XLSX from 'xlsx';

interface CodigoContable {
    id_mapeo: number;
    id_recurso: number;
    id_subcat_recurso: number;
    codigo_cuenta: string;
    nombre_subcategoria: string;
    id_subvencion: number | null;
    nombre_subvencion: string | null;
    destino_gasto: string;
    critico_fiscalizacion?: boolean;
}

interface CuentaCatalogo { codigo: string; nombre: string; }

type PendingCodigo = {
    key: string;
    id_subcat_recurso: number;
    id_subvencion?: number;
    codigo_cuenta: string;
    nombre_subcategoria: string;
    nombre_subvencion?: string;
    destino_gasto: string;
};

export default function RecursosPage() {
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategoria, setFilterCategoria] = useState<string>('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;
    const [resources, setResources] = useState<Recurso[]>([]);
    const [categorias, setCategorias] = useState<CategoriaRecurso[]>([]);
    const [grupos, setGrupos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Resource modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingRecurso, setEditingRecurso] = useState<Recurso | null>(null);
    const [deletingRecurso, setDeletingRecurso] = useState<Recurso | null>(null);
    const [formData, setFormData] = useState({ nombre: '', descripcion: '', formato: '', id_cat_recurso: '', id_grupo_recurso: '' });

    // Asesoría IA
    const [asesorandoRecurso, setAsesorandoRecurso] = useState(false);
    const [asesoriaRecurso, setAsesoriaRecurso] = useState<any | null>(null);
    const [mostrarAsesoriaRecurso, setMostrarAsesoriaRecurso] = useState(false);

    // Codes management
    const [cuentasCatalogo, setCuentasCatalogo] = useState<CuentaCatalogo[]>([]);
    const [subvencionesActivas, setSubvencionesActivas] = useState<{ id_subvencion: number; nombre_corto: string; nombre_completo: string }[]>([]);
    const [codigosExistentes, setCodigosExistentes] = useState<CodigoContable[]>([]); // for edit mode
    const [pendingCodigos, setPendingCodigos] = useState<PendingCodigo[]>([]); // for new resource
    const [expandedPropositos, setExpandedPropositos] = useState<Record<string, boolean>>({});
    const [formCodigo, setFormCodigo] = useState<{ propositoId: string; codigo_cuenta: string; subvencion: string; search: string } | null>(null);
    const [viewingCodigoDetalle, setViewingCodigoDetalle] = useState<any | null>(null);
    const [subcategorias, setSubcategorias] = useState<any[]>([]);

    useEffect(() => {
        if (formData.id_cat_recurso) {
            api.get(`/presupuesto/subcategorias?id_cat_recurso=${formData.id_cat_recurso}`)
                .then(res => setSubcategorias(res.data))
                .catch(() => setSubcategorias([]));
        } else {
            setSubcategorias([]);
        }
    }, [formData.id_cat_recurso]);

    // Bulk selection — recursos
    const [selectedRec, setSelectedRec] = useState<Set<number>>(new Set());
    const [bulkConfirmRec, setBulkConfirmRec] = useState<'copy' | 'delete' | null>(null);

    // Import Excel
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ creadas: number; errores: string[] } | null>(null);

    // Delete all
    const [showDeleteAll, setShowDeleteAll] = useState(false);
    const [deletingAll, setDeletingAll] = useState(false);

    // Detector de duplicados y nombres similares
    const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<{ token: string; count: number; items: Recurso[] }[]>([]);
    const [selectedKeepers, setSelectedKeepers] = useState<Record<string, number>>({});
    const [renamedTitles, setRenamedTitles] = useState<Record<string, string>>({});
    const [consolidatingToken, setConsolidatingToken] = useState<string | null>(null);
    const [activeTagToken, setActiveTagToken] = useState<string | null>(null);
    const [tagSearchTerm, setTagSearchTerm] = useState('');

    const canEdit = ['ADM', 'DIR', 'GERENTE', 'FIN'].includes(user?.rol?.codigo || '');

    // ---- Excel: Exportar ----
    const exportToExcel = async () => {
        setIsSaving(true);
        try {
            // 1. Obtener todos los mapeos en una única petición masiva y ultrarrápida
            let todosMapeos: Record<number, any[]> = {};
            try {
                const res = await api.get('/presupuesto/recursos/todos-mapeos');
                todosMapeos = res.data || {};
            } catch {
                todosMapeos = {};
            }

            const rows: any[] = [];

            for (const r of resources) {
                const mapeos = todosMapeos[r.id_recurso] || [];
                const grupoObj = grupos.find(g => g.id_grupo_recurso === (r as any).id_grupo_recurso);
                const grupoNombre = (r as any).grupo_recurso_nombre || grupoObj?.nombre || 'General';

                const mapSala = mapeos.find(m => m.destino_gasto === 'clases(alumno)');
                const mapAdmin = mapeos.find(m => m.destino_gasto === 'oficinas(administracion)');
                const mapPremio = mapeos.find(m => m.destino_gasto === 'premio/beneficio');
                const mapMant = mapeos.find(m => m.destino_gasto === 'mantencion/servicio');

                // Subvenciones asociadas
                const subvs = Array.from(new Set(mapeos.map(m => m.nombre_subvencion).filter(Boolean)));
                const subvLabel = subvs.length > 0 ? subvs.join(', ') : 'GENERAL';

                rows.push({
                    'ID': r.id_recurso,
                    'Nombre': r.nombre,
                    'Categoría': r.categoria_nombre || 'Sin categoría',
                    'Grupo': grupoNombre,
                    'Descripción': r.descripcion || '',
                    'Formato': r.formato || 'Unidad',
                    'Código Contable (Sala Clases)': mapSala?.codigo_cuenta || '',
                    'Código Contable (Administración)': mapAdmin?.codigo_cuenta || '',
                    'Código Contable (Premios)': mapPremio?.codigo_cuenta || '',
                    'Código Contable (Mantención)': mapMant?.codigo_cuenta || '',
                    'Subvención Aplicable': subvLabel
                });
            }

            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [
                { wch: 10 }, // ID
                { wch: 32 }, // Nombre
                { wch: 30 }, // Categoría
                { wch: 20 }, // Grupo
                { wch: 45 }, // Descripción
                { wch: 14 }, // Formato
                { wch: 30 }, // Código Contable (Sala Clases)
                { wch: 30 }, // Código Contable (Administración)
                { wch: 28 }, // Código Contable (Premios)
                { wch: 28 }, // Código Contable (Mantención)
                { wch: 22 }  // Subvención Aplicable
            ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Catálogo de Recursos');
            XLSX.writeFile(wb, `catalogo_recursos_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (e) {
            console.error(e);
            alert('Error al exportar a Excel');
        } finally {
            setIsSaving(false);
        }
    };

    // ---- Excel: Descargar plantilla ----
    const downloadTemplate = async () => {
        let cuentas = cuentasCatalogo;
        if (cuentas.length === 0) {
            try {
                const res = await api.get('/catalogos/cuentas');
                cuentas = res.data;
                setCuentasCatalogo(res.data);
            } catch (err) {
                console.error("Error cargando cuentas para la plantilla:", err);
            }
        }

        const ejemplo = [
            {
                'Nombre': 'Notebook Docente i5 16GB',
                'Categoría': 'Equipamiento de Apoyo Pedagógico',
                'Grupo': 'General',
                'Descripción': 'Computador portátil para apoyo docente en sala de clases y oficina',
                'Formato': 'Unidad',
                'Código Contable (Sala Clases)': '410601',
                'Código Contable (Administración)': '410602',
                'Código Contable (Premios)': '',
                'Código Contable (Mantención)': '',
                'Subvención Aplicable': 'SEP'
            },
            {
                'Nombre': 'Pintura y Hermoseamiento Muros',
                'Categoría': 'Gastos de Operación',
                'Grupo': 'Infraestructura',
                'Descripción': 'Servicio de mantenimiento y reparación de pintura en pabellones',
                'Formato': 'Servicio',
                'Código Contable (Sala Clases)': '',
                'Código Contable (Administración)': '',
                'Código Contable (Premios)': '',
                'Código Contable (Mantención)': '411601',
                'Subvención Aplicable': 'MANTENIMIENTO'
            },
            {
                'Nombre': 'Medallas de Honor y Reconocimiento',
                'Categoría': 'Gastos de Premiación',
                'Grupo': 'Eventos',
                'Descripción': 'Reconocimiento para estudiantes destacados en ceremonia académica',
                'Formato': 'Unidad',
                'Código Contable (Sala Clases)': '',
                'Código Contable (Administración)': '',
                'Código Contable (Premios)': '410605',
                'Código Contable (Mantención)': '',
                'Subvención Aplicable': 'GENERAL'
            },
            {
                'Nombre': 'Resmas de Papel Carta 75g',
                'Categoría': 'Material Didáctico e Insumos',
                'Grupo': 'Insumos',
                'Descripción': 'Cajas de resmas para guías de estudio e impresión de pruebas',
                'Formato': 'Caja',
                'Código Contable (Sala Clases)': '410603',
                'Código Contable (Administración)': '410604',
                'Código Contable (Premios)': '',
                'Código Contable (Mantención)': '',
                'Subvención Aplicable': 'SEP'
            }
        ];

        const wb = XLSX.utils.book_new();

        // 1. Hoja de Plantilla Principal
        const wsPlantilla = XLSX.utils.json_to_sheet(ejemplo);
        wsPlantilla['!cols'] = [
            { wch: 32 }, // Nombre
            { wch: 32 }, // Categoría
            { wch: 22 }, // Grupo
            { wch: 45 }, // Descripción
            { wch: 14 }, // Formato
            { wch: 30 }, // Código Contable (Sala Clases)
            { wch: 30 }, // Código Contable (Administración)
            { wch: 28 }, // Código Contable (Premios)
            { wch: 28 }, // Código Contable (Mantención)
            { wch: 22 }  // Subvención Aplicable
        ];
        XLSX.utils.book_append_sheet(wb, wsPlantilla, 'Plantilla');

        // 2. Hoja de Instrucciones y Formatos Aceptados
        const instruccionesData = [
            { 'Columna': 'Nombre', 'Obligatoria': 'Sí', 'Descripción': 'Nombre del recurso o producto (ej. Notebook Docente i5).' },
            { 'Columna': 'Categoría', 'Obligatoria': 'Sí', 'Descripción': 'Debe coincidir exacto con una categoría válida del sistema (ver hoja "Categorías Disponibles").' },
            { 'Columna': 'Grupo', 'Obligatoria': 'No (por defecto General)', 'Descripción': 'Grupo o familia del recurso (ej. Infraestructura, Insumos, General).' },
            { 'Columna': 'Descripción', 'Obligatoria': 'No', 'Descripción': 'Detalle técnico o aclaración del recurso.' },
            { 'Columna': 'Formato', 'Obligatoria': 'No (por defecto Unidad)', 'Descripción': 'Unidad de medida (ej. Unidad, Caja, Servicio, Licencia, Global, Metros).' },
            { 'Columna': 'Código Contable (Sala Clases)', 'Obligatoria': 'Opcional', 'Descripción': 'Código de cuenta para el destino Sala de Clases (Alumnos).' },
            { 'Columna': 'Código Contable (Administración)', 'Obligatoria': 'Opcional', 'Descripción': 'Código de cuenta para el destino Oficina / Administración (Funcionarios).' },
            { 'Columna': 'Código Contable (Premios)', 'Obligatoria': 'Opcional', 'Descripción': 'Código de cuenta para el destino Premio / Beneficio.' },
            { 'Columna': 'Código Contable (Mantención)', 'Obligatoria': 'Opcional', 'Descripción': 'Código de cuenta para el destino Mantención / Servicio.' },
            { 'Columna': 'Subvención Aplicable', 'Obligatoria': 'Opcional', 'Descripción': 'Nombre corto de la subvención (ej. GENERAL, SEP, PIE, MANTENIMIENTO, PRO_RETENCION).' }
        ];
        const wsInstrucciones = XLSX.utils.json_to_sheet(instruccionesData);
        wsInstrucciones['!cols'] = [{ wch: 32 }, { wch: 22 }, { wch: 70 }];
        XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');

        // 3. Hoja de Categorías Disponibles
        const catsData = categorias.map(c => ({
            'Nombre de la Categoría': c.nombre,
            'Descripción': c.descripcion || ''
        }));
        const wsCats = XLSX.utils.json_to_sheet(catsData);
        wsCats['!cols'] = [{ wch: 35 }, { wch: 55 }];
        XLSX.utils.book_append_sheet(wb, wsCats, 'Categorías Disponibles');

        // 4. Hoja de Cuentas Contables (Manual de Cuentas)
        const cuentasData = cuentas.map(c => ({
            'Código Cuenta': c.codigo,
            'Nombre Cuenta': c.nombre
        }));
        const wsCuentas = XLSX.utils.json_to_sheet(cuentasData);
        wsCuentas['!cols'] = [{ wch: 18 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, wsCuentas, 'Códigos Contables Válidos');

        XLSX.writeFile(wb, 'plantilla_recursos_catalogo.xlsx');
    };

    // ---- Excel: Importar ----
    const handleImportClick = () => {
        setImportResult(null);
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (cuentasCatalogo.length === 0) {
                try {
                    const res = await api.get('/catalogos/cuentas');
                    setCuentasCatalogo(res.data);
                } catch { /* ignore */ }
            }
            await processImport(file);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const processImport = async (file: File) => {
        setImporting(true);
        setImportResult(null);
        const errores: string[] = [];
        let creadas = 0;
        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

            if (rows.length === 0) {
                errores.push('El archivo no contiene filas de datos.');
            }

            // Cargar todas las subcategorías y subvenciones para resolver los mapeos
            const subcatsRes = await api.get('/presupuesto/subcategorias');
            const todasSubcats = subcatsRes.data || [];

            let subvenciones = subvencionesActivas;
            if (subvenciones.length === 0) {
                try {
                    const sRes = await api.get('/presupuesto/subvenciones/activas');
                    subvenciones = sRes.data || [];
                    setSubvencionesActivas(subvenciones);
                } catch { /* ignore */ }
            }

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const fila = i + 2;
                const nombre = String(row['Nombre'] ?? row['nombre'] ?? '').trim();
                if (!nombre) {
                    errores.push(`Fila ${fila}: el campo "Nombre" está vacío. Se omitió.`);
                    continue;
                }

                const descripcion = String(row['Descripción'] ?? row['Descripcion'] ?? row['descripcion'] ?? '').trim();
                const formato = String(row['Formato'] ?? row['formato'] ?? 'Unidad').trim();
                const categoriaNombre = String(row['Categoría'] ?? row['Categoria'] ?? row['categoria'] ?? '').trim();

                const catMatch = categorias.find(c => c.nombre.toLowerCase() === categoriaNombre.toLowerCase());
                if (!catMatch) {
                    errores.push(`Fila ${fila} ("${nombre}"): la categoría "${categoriaNombre}" no existe en el sistema. Se omitió.`);
                    continue;
                }

                const grupoNombre = String(row['Grupo'] ?? row['grupo'] ?? row['Grupo de Recursos'] ?? 'General').trim();
                let grupoId = null;

                // Buscar grupo localmente (modelo plano)
                let grupoMatch = grupos.find(g => g.nombre.toLowerCase() === grupoNombre.toLowerCase());

                if (!grupoMatch) {
                    try {
                        const gRes = await api.post('/presupuesto/grupos-recurso', {
                            nombre: grupoNombre
                        });
                        grupoMatch = gRes.data;
                        setGrupos(prev => [...prev, gRes.data]);
                    } catch (gErr: any) {
                        errores.push(`Fila ${fila} ("${nombre}"): no se pudo resolver o crear el grupo de recursos "${grupoNombre}".`);
                        continue;
                    }
                }
                grupoId = grupoMatch.id_grupo_recurso;

                // Resolver subvención
                let subveNombre = String(row['Subvención Aplicable'] ?? row['Subvencion Aplicable'] ?? row['subvencion'] ?? '').trim().toUpperCase();
                if (subveNombre === 'MANTENCION') {
                    subveNombre = 'MANTENIMIENTO';
                }
                let matchedSubvencionId = null;
                if (subveNombre) {
                    const matchSubv = subvenciones.find(s => s.nombre_corto.toUpperCase() === subveNombre);
                    if (matchSubv) {
                        matchedSubvencionId = matchSubv.id_subvencion;
                    } else {
                        errores.push(`Fila ${fila} ("${nombre}"): la subvención "${subveNombre}" no se encuentra activa.`);
                    }
                }

                try {
                    // 1. Crear el recurso base
                    const res = await api.post('/presupuesto/recursos', {
                        nombre,
                        descripcion: descripcion || null,
                        formato: formato || null,
                        id_grupo_recurso: grupoId,
                        id_cat_recurso: catMatch.id_cat_recurso
                    });
                    const recursoId = res.data.id_recurso;

                    // 2. Mapear propósitos (Destinos de gasto) a partir de las nuevas columnas
                    const pilaresMapeo = [
                        { col: 'Código Contable (Sala Clases)', dest: 'clases(alumno)' },
                        { col: 'Código Contable (Administración)', dest: 'oficinas(administracion)' },
                        { col: 'Código Contable (Premios)', dest: 'premio/beneficio' },
                        { col: 'Código Contable (Mantención)', dest: 'mantencion/servicio' }
                    ];

                    for (const pilar of pilaresMapeo) {
                        const codRaw = String(row[pilar.col] ?? '').trim();
                        if (codRaw) {
                            // Validar regla contable legal para MANTENIMIENTO
                            if (pilar.dest === 'mantencion/servicio' && subveNombre === 'MANTENIMIENTO') {
                                const isValidGroup = codRaw.startsWith('4116') || codRaw.startsWith('4117');
                                if (!isValidGroup) {
                                    errores.push(`Fila ${fila} ("${nombre}"): El código "${codRaw}" en "${pilar.col}" no es válido. Con subvención MANTENIMIENTO sólo se permiten cuentas del grupo 411600 (Infraestructura) o 411700 (Bienes Muebles).`);
                                    continue;
                                }
                            }

                            // Buscar subcategoría que coincida con el código de cuenta y la categoría del recurso
                            const subcatMatch = todasSubcats.find(
                                (s: any) => s.codigo_cuenta === codRaw && s.id_cat_recurso === catMatch.id_cat_recurso
                            ) || todasSubcats.find((s: any) => s.codigo_cuenta === codRaw); // fallback a coincidencia general de código

                            if (!subcatMatch) {
                                errores.push(`Fila ${fila} ("${nombre}"): el código contable "${codRaw}" para el pilar "${pilar.col}" no es válido o no está registrado en el manual de cuentas.`);
                                continue;
                            }

                            try {
                                await api.post(`/presupuesto/recursos/${recursoId}/mapeos`, {
                                    id_subcat_recurso: subcatMatch.id_subcat_recurso,
                                    id_subvencion: matchedSubvencionId,
                                    destino_gasto: pilar.dest
                                });
                            } catch (err: any) {
                                errores.push(`Fila ${fila} ("${nombre}"): no se pudo mapear la cuenta "${codRaw}" para "${pilar.col}". (${err.response?.data?.detail || 'Error en servidor'})`);
                            }
                        }
                    }
                    creadas++;
                } catch (err: any) {
                    errores.push(`Fila ${fila} ("${nombre}"): ${err.response?.data?.detail || 'error al crear el recurso base'}.`);
                }
            }

            setImportResult({ creadas, errores });
            fetchData();
        } catch (err) {
            console.error('Error importando excel:', err);
            setImportResult({ creadas, errores: ['No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx).'] });
        } finally {
            setImporting(false);
        }
    };

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [rRes, cRes, subvRes, gRes] = await Promise.all([
                api.get('/presupuesto/recursos'),
                api.get('/presupuesto/categoria-recurso'),
                api.get('/presupuesto/subvenciones/activas').catch(() => ({ data: [] })),
                api.get('/presupuesto/grupos-recurso').catch(() => ({ data: [] }))
            ]);
            setResources(rRes.data);
            setCategorias(cRes.data);
            setSubvencionesActivas(subvRes.data || []);
            setGrupos(gRes.data || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const cargarCuentasCatalogo = useCallback(async () => {
        if (cuentasCatalogo.length > 0) return;
        try {
            const res = await api.get('/catalogos/cuentas');
            setCuentasCatalogo(res.data);
        } catch { /* ignore */ }
    }, [cuentasCatalogo.length]);

    // ── Resource CRUD ─────────────────────────────────────────────────────────
    const resetForm = () => {
        setFormData({ nombre: '', descripcion: '', formato: '', id_cat_recurso: '', id_grupo_recurso: '' });
        setEditingRecurso(null);
        setDeletingRecurso(null);
        setPendingCodigos([]);
        setCodigosExistentes([]);
        setFormCodigo(null);
        setExpandedPropositos({});
        setAsesoriaRecurso(null);
        setMostrarAsesoriaRecurso(false);
    };

    const handleEdit = async (rec: Recurso) => {
        setFormData({
            nombre: rec.nombre || '',
            descripcion: rec.descripcion || '',
            formato: rec.formato || '',
            id_cat_recurso: rec.id_cat_recurso ? rec.id_cat_recurso.toString() : '',
            id_grupo_recurso: rec.id_grupo_recurso ? rec.id_grupo_recurso.toString() : ''
        });
        setEditingRecurso(rec);
        setIsModalOpen(true);
        cargarCuentasCatalogo();
        try {
            const res = await api.get(`/presupuesto/recursos/${rec.id_recurso}/mapeos`);
            setCodigosExistentes(res.data || []);
        } catch { setCodigosExistentes([]); }
    };

    const handleCopy = (rec: Recurso) => {
        setFormData({
            nombre: rec.nombre + ' (copia)',
            descripcion: rec.descripcion || '',
            formato: rec.formato || '',
            id_cat_recurso: rec.id_cat_recurso ? rec.id_cat_recurso.toString() : '',
            id_grupo_recurso: rec.id_grupo_recurso ? rec.id_grupo_recurso.toString() : ''
        });
        setEditingRecurso(null);
        setIsModalOpen(true);
        cargarCuentasCatalogo();
    };

    const handleSubmit = async () => {
        setIsSaving(true);
        try {
            const payload = {
                nombre: formData.nombre,
                descripcion: formData.descripcion || null,
                formato: formData.formato || null,
                id_grupo_recurso: parseInt(formData.id_grupo_recurso),
                id_cat_recurso: parseInt(formData.id_cat_recurso)
            };
            let recursoId: number;
            if (editingRecurso) {
                await api.put(`/presupuesto/recursos/${editingRecurso.id_recurso}`, payload);
                recursoId = editingRecurso.id_recurso;
            } else {
                const res = await api.post('/presupuesto/recursos', payload);
                recursoId = res.data.id_recurso;
                for (const pc of pendingCodigos) {
                    await api.post(`/presupuesto/recursos/${recursoId}/mapeos`, {
                        id_subcat_recurso: pc.id_subcat_recurso,
                        id_subvencion: pc.id_subvencion || null,
                        destino_gasto: pc.destino_gasto
                    });
                }
            }
            setIsModalOpen(false);
            resetForm();
            fetchData();
        } catch (error: any) {
            alert(error.response?.data?.detail || 'Error al guardar');
        } finally { setIsSaving(false); }
    };

    const handleDelete = async () => {
        if (!deletingRecurso) return;
        setIsSaving(true);
        try {
            await api.delete(`/presupuesto/recursos/${deletingRecurso.id_recurso}`);
            setDeletingRecurso(null);
            fetchData();
        } catch (error: any) {
            alert(error.response?.data?.detail || 'Error al eliminar el recurso');
        } finally { setIsSaving(false); }
    };

    // ── Bulk actions — recursos ───────────────────────────────────────────────
    const toggleRec = (id: number) => setSelectedRec(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
    const toggleAllRec = () => setSelectedRec(
        selectedRec.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id_recurso))
    );
    const executeBulkRec = async () => {
        setIsSaving(true);
        try {
            if (bulkConfirmRec === 'delete') {
                for (const id of selectedRec)
                    try { await api.delete(`/presupuesto/recursos/${id}`); } catch {}
            } else if (bulkConfirmRec === 'copy') {
                for (const id of selectedRec) {
                    const rec = resources.find(r => r.id_recurso === id);
                    if (rec) try {
                        await api.post('/presupuesto/recursos', {
                            nombre: rec.nombre + ' (copia)',
                            descripcion: rec.descripcion || null,
                            formato: rec.formato || null,
                            id_grupo_recurso: rec.id_grupo_recurso,
                            id_cat_recurso: rec.id_cat_recurso
                        });
                    } catch {}
                }
            }
        } finally {
            setSelectedRec(new Set()); setBulkConfirmRec(null); setIsSaving(false); fetchData();
        }
    };

    // ── Codes for resource (edit mode – live API) ─────────────────────────────
    // ── Codes for resource (edit mode – live API) ─────────────────────────────
    const agregarCodigoExistente = async (idSubcat: number, idSubvencion: number | undefined) => {
        if (!editingRecurso || !formCodigo?.propositoId) return;
        try {
            await api.post(`/presupuesto/recursos/${editingRecurso.id_recurso}/mapeos`, {
                id_subcat_recurso: idSubcat,
                id_subvencion: idSubvencion || null,
                destino_gasto: formCodigo.propositoId
            });
            const res = await api.get(`/presupuesto/recursos/${editingRecurso.id_recurso}/mapeos`);
            setCodigosExistentes(res.data || []);
        } catch (e: any) { alert(e.response?.data?.detail || 'Error'); }
        setFormCodigo(null);
    };

    const eliminarCodigoExistente = async (idMapeo: number) => {
        if (!editingRecurso) return;
        try {
            await api.delete(`/presupuesto/recursos/${editingRecurso.id_recurso}/mapeos/${idMapeo}`);
            setCodigosExistentes(prev => prev.filter(c => c.id_mapeo !== idMapeo));
        } catch (e: any) { alert(e.response?.data?.detail || 'Error'); }
    };

    // ── Codes for resource (new mode – pending state) ─────────────────────────
    const agregarCodigoPendiente = (idSubcat: number, idSubvencion: number | undefined) => {
        if (!formCodigo?.propositoId) return;
        const sub = subcategorias.find(s => s.id_subcat_recurso === idSubcat);
        const subvObj = subvencionesActivas.find(sv => sv.id_subvencion === idSubvencion);
        setPendingCodigos(prev => [...prev, {
            key: `${formCodigo.propositoId}-${idSubcat}-${Date.now()}`,
            id_subcat_recurso: idSubcat,
            id_subvencion: idSubvencion,
            codigo_cuenta: sub?.codigo_cuenta || '',
            nombre_subcategoria: sub?.nombre || '',
            nombre_subvencion: subvObj?.nombre_corto || 'GENERAL',
            destino_gasto: formCodigo.propositoId
        }]);
        setFormCodigo(null);
    };

    const eliminarCodigoPendiente = (key: string) => setPendingCodigos(prev => prev.filter(p => p.key !== key));

    const countSinCategoria = resources.filter(r => !r.id_cat_recurso || !r.categoria_nombre || r.categoria_nombre.trim().toLowerCase() === 'sin categoría').length;

    const filtered = resources.filter(r => {
        const matchSearch = r.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.descripcion || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        let matchCat = true;
        if (filterCategoria === 'WITHOUT_CATEGORY') {
            matchCat = !r.id_cat_recurso || !r.categoria_nombre || r.categoria_nombre.trim().toLowerCase() === 'sin categoría';
        } else if (filterCategoria !== 'ALL') {
            matchCat = r.id_cat_recurso?.toString() === filterCategoria || r.categoria_nombre === filterCategoria;
        }

        return matchSearch && matchCat;
    });

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);


    // ── Shared: Inline form for adding a code ─────────────────────────────────
    const InlineCodigoForm = ({
        onSave, onCancel,
    }: { onSave: (idSubcat: number, idSubvencion: number | undefined) => void; onCancel: () => void; }) => {
        const [search, setSearch] = useState('');
        const [selectedSubcatId, setSelectedSubcatId] = useState<number | null>(null);
        const [selectedSubvencionId, setSelectedSubvencionId] = useState<number | undefined>(
            subvencionesActivas.find(s => s.nombre_corto === 'GENERAL')?.id_subvencion || subvencionesActivas[0]?.id_subvencion
        );
        const resultados = subcategorias.filter(s =>
            s.codigo_cuenta.includes(search) || s.nombre.toLowerCase().includes(search.toLowerCase())
        ).slice(0, 6);

        return (
            <div className="mt-2 border-2 border-primary/20 bg-primary/5 rounded-xl p-3 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                    {subvencionesActivas.map(sv => (
                        <button key={sv.id_subvencion} type="button" onClick={() => setSelectedSubvencionId(sv.id_subvencion)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border transition-all ${selectedSubvencionId === sv.id_subvencion ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-primary/40'}`}>
                            {sv.nombre_corto === 'PRO_RETENCION' ? 'Pro Ret.' : sv.nombre_corto}
                        </button>
                    ))}
                </div>
                <div className="space-y-1">
                    <input type="text" placeholder="Buscar subcategoría/código..." value={search}
                        onChange={e => { setSearch(e.target.value); setSelectedSubcatId(null); }}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                    {search.length >= 2 && (
                        <div className="border border-gray-100 rounded-xl overflow-y-auto max-h-32 bg-white shadow-md">
                            {resultados.map(s => (
                                <button key={s.id_subcat_recurso} type="button"
                                    onClick={() => { setSelectedSubcatId(s.id_subcat_recurso); setSearch(`${s.codigo_cuenta} — ${s.nombre}`); }}
                                    className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-none text-[11px] transition-colors ${selectedSubcatId === s.id_subcat_recurso ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-gray-50 text-gray-700'}`}>
                                    <span className="font-extrabold">{s.codigo_cuenta}</span>
                                    <span className="text-gray-500 ml-2">{s.nombre}</span>
                                </button>
                            ))}
                            {resultados.length === 0 && <p className="px-3 py-2 text-[11px] text-gray-400 italic">Sin resultados</p>}
                        </div>
                    )}
                    {selectedSubcatId && <p className="text-[10px] font-bold text-primary px-1">✓ Seleccionado</p>}
                </div>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="px-3 py-1.5 text-[10px] font-bold text-gray-500 hover:text-gray-800">Cancelar</button>
                    <button type="button" disabled={!selectedSubcatId} onClick={() => onSave(selectedSubcatId!, selectedSubvencionId)}
                        className="px-4 py-1.5 bg-primary text-white rounded-lg text-[10px] font-bold disabled:opacity-40">
                        Agregar
                    </button>
                </div>
            </div>
        );
    };

    // ── Shared: per-propósito codes section ───────────────────────────────────
    const SeccionCodigos = ({
        codigos, onAdd, onDelete, activeForm, setActiveForm, isNew,
    }: {
        codigos: (CodigoContable | PendingCodigo)[];
        onAdd: (idSubcat: number, idSubvencion: number | undefined) => void;
        onDelete: (id: number | string) => void;
        activeForm: string | null;
        setActiveForm: (v: string | null) => void;
        isNew: boolean;
    }) => (
        <div className="space-y-3">
            {PILARES_OFICIALES.map(p => {
                const misCodigos = codigos.filter(c => c.destino_gasto === p.id);
                const isOpen = expandedPropositos[p.id] !== false;
                return (
                    <div key={p.id} className="border border-gray-100 rounded-xl overflow-hidden">
                        <button type="button"
                            onClick={() => setExpandedPropositos(prev => ({ ...prev, [p.id]: !isOpen }))}
                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                            <div className="flex items-center gap-2">
                                <span className="text-base">{p.icon}</span>
                                <span className="text-[12px] font-bold text-gray-700">{p.label}</span>
                                {misCodigos.length > 0 && (
                                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-extrabold">{new Set(misCodigos.map(c => c.codigo_cuenta)).size}</span>
                                )}
                            </div>
                            {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                        </button>
                        {isOpen && (
                            <div className="p-4 space-y-3 bg-white border-t border-gray-100">
                                {misCodigos.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                        {Object.values(misCodigos.reduce((acc, c) => {
                                            const k = c.codigo_cuenta;
                                            if (!acc[k]) acc[k] = { codigo_cuenta: c.codigo_cuenta, nombre_subcategoria: (c as any).nombre_subcategoria, items: [] as typeof misCodigos };
                                            acc[k].items.push(c);
                                            return acc;
                                        }, {} as Record<string, { codigo_cuenta: string; nombre_subcategoria: string; items: typeof misCodigos }>)).map(g => (
                                            <div key={g.codigo_cuenta} className="flex items-start gap-2 pl-2.5 pr-1.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-mono text-xs font-bold text-blue-800">{g.codigo_cuenta}</span>
                                                        {g.nombre_subcategoria && <span className="text-[11px] text-blue-600 truncate">{g.nombre_subcategoria}</span>}
                                                    </div>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {g.items.map(c => {
                                                            const id = 'id_mapeo' in c ? c.id_mapeo : (c as any).key;
                                                            const subvName = (c as any).nombre_subvencion;
                                                            const critico = (c as any).critico_fiscalizacion;
                                                            return (
                                                                <span key={id} title={critico ? 'Fiscalización crítica: revisar antes de usar esta subvención' : 'Subvención habilitada'}
                                                                    className={`inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-bold border ${critico ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-blue-700 border-blue-200'}`}>
                                                                    {critico && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
                                                                    {subvName || 'GENERAL'}
                                                                    <button type="button" onClick={() => onDelete(id!)}
                                                                        className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors rounded"
                                                                        title="Quitar esta subvención">
                                                                        <X size={10} />
                                                                    </button>
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <button type="button" onClick={() => setViewingCodigoDetalle(g.items[0])}
                                                    className="text-blue-400 hover:text-blue-600 transition-colors rounded p-0.5 hover:bg-blue-100 shrink-0" title="Ver detalles">
                                                    <Eye size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">No se han asignado códigos contables para este propósito.</p>
                                )}
                                {activeForm === p.id ? (
                                    <InlineCodigoForm onSave={(idSubcat, idSubvencion) => onAdd(idSubcat, idSubvencion)} onCancel={() => setActiveForm(null)} />
                                ) : (
                                    <button type="button" onClick={() => setActiveForm(p.id)}
                                        className="flex items-center gap-1.5 text-xs text-primary font-bold hover:text-blue-700 transition-colors mt-2">
                                        <Plus size={14} /> Asignar código contable
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Maestro de Recursos</h2>
                    <p className="text-gray-500 mt-1.5 font-medium">Gestiona el catálogo de recursos disponibles para solicitudes de compra y sus propósitos de uso.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto flex-wrap justify-end">
                    <div className="relative w-full md:w-80 min-w-[240px]">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400 transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar recurso..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-10 pr-20 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm hover:border-gray-300 transition-all text-gray-900"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                                className="absolute right-12 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                                title="Limpiar búsqueda"
                            >
                                <X size={14} />
                            </button>
                        )}
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-extrabold px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                            {filtered.length}
                        </span>
                    </div>


                    <button
                        onClick={() => {
                            // Algoritmo de detección de duplicados por palabras clave (tokens comunes >= 3 letras)
                            const stopWords = new Set(['de', 'del', 'la', 'los', 'las', 'un', 'una', 'para', 'con', 'sin', 'por', 'en', 'y', 'e', 'o']);
                            const groupsMap: Record<string, Recurso[]> = {};

                            resources.forEach(r => {
                                const tokens = r.nombre
                                    .toLowerCase()
                                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                                    .split(/[\s,.-]+/)
                                    .filter(t => t.length >= 3 && !stopWords.has(t));

                                // Indexar recurso por cada token significativo
                                const seenTokens = new Set<string>();
                                tokens.forEach(t => {
                                    if (!seenTokens.has(t)) {
                                        seenTokens.add(t);
                                        if (!groupsMap[t]) groupsMap[t] = [];
                                        groupsMap[t].push(r);
                                    }
                                });
                            });

                            // Filtrar palabras que tengan 2 o más recursos coincidentes
                            const result = Object.entries(groupsMap)
                                .filter(([_, items]) => items.length > 1)
                                .map(([token, items]) => ({ token, count: items.length, items }))
                                .sort((a, b) => b.count - a.count);

                            const initialKeepers: Record<string, number> = {};
                            const initialTitles: Record<string, string> = {};
                            result.forEach(g => {
                                if (g.items.length > 0) {
                                    initialKeepers[g.token] = g.items[0].id_recurso;
                                    initialTitles[g.token] = g.items[0].nombre;
                                }
                            });

                            setSelectedKeepers(initialKeepers);
                            setRenamedTitles(initialTitles);
                            setDuplicateGroups(result);
                            setActiveTagToken(result[0]?.token || null);
                            setTagSearchTerm('');
                            setShowDuplicatesModal(true);
                        }}
                        title="Detectar posibles recursos duplicados o similares"
                        className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-sm whitespace-nowrap"
                    >
                        <Search size={18} />
                        <span className="hidden lg:inline">Detectar Similares ({resources.length})</span>
                    </button>

                    <button
                        onClick={downloadTemplate}
                        className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-semibold border border-gray-200 flex items-center gap-2 transition-all whitespace-nowrap"
                    >
                        <FileSpreadsheet size={18} />
                        <span className="hidden lg:inline">Plantilla</span>
                    </button>

                    <button
                        onClick={exportToExcel}
                        disabled={resources.length === 0}
                        title="Exportar catálogo de recursos"
                        className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-semibold border border-gray-200 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        <Download size={18} />
                        <span className="hidden lg:inline">Exportar</span>
                    </button>

                    {canEdit && (
                        <>
                            <button
                                onClick={handleImportClick}
                                disabled={importing}
                                title="Importar recursos desde Excel"
                                className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-semibold border border-gray-200 flex items-center gap-2 transition-all disabled:opacity-50 whitespace-nowrap"
                            >
                                {importing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                                <span className="hidden lg:inline">Importar</span>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileSelected}
                                className="hidden"
                            />

                            <button
                                onClick={() => { resetForm(); setIsModalOpen(true); }}
                                className="bg-primary hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-primary/30 flex items-center transition-all duration-200 whitespace-nowrap"
                            >
                                <Plus size={20} className="md:mr-2" />
                                <span className="hidden md:inline">Nuevo Recurso</span>
                            </button>

                            {resources.length > 0 && (
                                <button
                                    onClick={() => setShowDeleteAll(true)}
                                    title="Eliminar todos los recursos del catálogo"
                                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all whitespace-nowrap"
                                >
                                    <Trash2 size={18} />
                                    <span className="hidden lg:inline">Eliminar Todos</span>
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Selected items bulk actions */}
            {selectedRec.size > 0 && (
                <div className="flex items-center gap-3 px-5 py-3 mb-3 bg-red-50 border border-red-200 rounded-2xl">
                    <span className="text-sm font-bold text-red-700">{selectedRec.size} seleccionado{selectedRec.size > 1 ? 's' : ''}</span>
                    <div className="flex gap-2 ml-auto">
                        <button onClick={() => setBulkConfirmRec('copy')}
                            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-all">
                            <Copy size={14} /> Duplicar ({selectedRec.size})
                        </button>
                        <button onClick={() => setBulkConfirmRec('delete')}
                            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all">
                            <Trash2 size={14} /> Eliminar ({selectedRec.size})
                        </button>
                        <button onClick={() => setSelectedRec(new Set())}
                            className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition-all">
                            <X size={13} /> Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Barra de Filtros por Categoría */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-white p-3.5 rounded-2xl border border-gray-100 shadow-xs">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-500 mr-1">Filtrar:</span>
                    <button
                        type="button"
                        onClick={() => { setFilterCategoria('ALL'); setCurrentPage(1); }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            filterCategoria === 'ALL'
                                ? 'bg-primary text-white shadow-xs'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                        }`}
                    >
                        Todos ({resources.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => { setFilterCategoria('WITHOUT_CATEGORY'); setCurrentPage(1); }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            filterCategoria === 'WITHOUT_CATEGORY'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : countSinCategoria > 0
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
                        }`}
                        title="Ver únicamente recursos sin categoría asignada"
                    >
                        <span>⚠️ Sin Categoría ({countSinCategoria})</span>
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500">Categoría:</label>
                    <select
                        value={filterCategoria}
                        onChange={(e) => { setFilterCategoria(e.target.value); setCurrentPage(1); }}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer max-w-[260px]"
                    >
                        <option value="ALL">Todas las categorías ({resources.length})</option>
                        <option value="WITHOUT_CATEGORY">⚠️ Sin categoría ({countSinCategoria})</option>
                        {categorias.map(c => {
                            const count = resources.filter(r => r.id_cat_recurso === c.id_cat_recurso || r.categoria_nombre === c.nombre).length;
                            return (
                                <option key={c.id_cat_recurso} value={c.id_cat_recurso.toString()}>
                                    {c.nombre} ({count})
                                </option>
                            );
                        })}
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="pl-5 pr-2 py-4 w-10">
                                    <input type="checkbox"
                                        checked={filtered.length > 0 && selectedRec.size === filtered.length}
                                        onChange={toggleAllRec}
                                        className="w-4 h-4 rounded accent-primary cursor-pointer" />
                                </th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nombre</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Categoría</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Descripción</th>
                                {canEdit && <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={canEdit ? 5 : 4} className="px-6 py-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="animate-spin" size={24} />
                                            <span>Cargando recursos...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={canEdit ? 5 : 4} className="px-6 py-12 text-center text-gray-400">No se encontraron recursos.</td>
                                </tr>
                            ) : (
                                paginated.map((r) => {
                                    const isChecked = selectedRec.has(r.id_recurso);
                                    return (
                                        <tr key={r.id_recurso} className={`hover:bg-gray-50/50 transition-colors ${isChecked ? 'bg-red-50/40' : ''}`}>
                                            <td className="pl-5 pr-2 py-4">
                                                <input type="checkbox" checked={isChecked} onChange={() => toggleRec(r.id_recurso)}
                                                    className="w-4 h-4 rounded accent-primary cursor-pointer" />
                                            </td>
                                            <td className="px-6 py-4 max-w-[220px]">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-sm font-semibold text-gray-900 break-words">{r.nombre}</span>
                                                    {r.codigos_contables && r.codigos_contables.length > 0 && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {r.codigos_contables.map((code) => (
                                                                <span key={code} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                                                    {code}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    {(!r.id_cat_recurso || !r.categoria_nombre || r.categoria_nombre.trim().toLowerCase() === 'sin categoría') ? (
                                                        <span className="text-xs font-bold bg-amber-100 border border-amber-300 text-amber-900 px-2.5 py-1 rounded-full uppercase tracking-tighter self-start inline-flex items-center gap-1">
                                                            <span>⚠️ Sin categoría</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs font-bold bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full uppercase tracking-tighter self-start">
                                                            {r.categoria_nombre}
                                                        </span>
                                                    )}
                                                    {r.grupo_nombre && (
                                                        <span className="text-[11px] font-medium text-gray-500 pl-1">
                                                            📁 {r.grupo_nombre}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm text-gray-500 line-clamp-2">{r.descripcion || '—'}</p>
                                                {r.formato && <span className="text-[10px] text-gray-400 font-mono">Formato: {r.formato}</span>}
                                            </td>
                                            {canEdit && (
                                                <td className="px-6 py-4 text-center whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button onClick={() => handleEdit(r)} className="text-gray-400 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50" title="Editar recurso y códigos"><Edit size={16} /></button>
                                                        <button onClick={() => handleCopy(r)} className="text-gray-400 hover:text-green-600 transition-colors p-2 rounded-lg hover:bg-green-50" title="Duplicar recurso"><Copy size={16} /></button>
                                                        <button onClick={() => setDeletingRecurso(r)} className="text-gray-400 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50" title="Eliminar recurso"><Trash2 size={16} /></button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Controles de paginación */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500">
                            Mostrando {Math.min(filtered.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(filtered.length, currentPage * itemsPerPage)} de {filtered.length} recursos
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Anterior
                            </button>
                            <span className="text-xs font-bold text-gray-700 px-2">
                                {currentPage} de {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}
            </div>


            {/* Modal Nuevo/Editar Recurso */}
            <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); resetForm(); }}
                title={editingRecurso ? 'Editar Recurso' : 'Nuevo Recurso'} maxWidth="max-w-2xl">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre del Recurso *</label>
                            <input type="text" value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Categoría *</label>
                            <select value={formData.id_cat_recurso} onChange={e => setFormData({ ...formData, id_cat_recurso: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900">
                                <option value="">Seleccionar...</option>
                                {categorias.map(cat => <option key={cat.id_cat_recurso} value={cat.id_cat_recurso}>{cat.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Grupo de Recursos *</label>
                            <select value={formData.id_grupo_recurso} onChange={e => setFormData({ ...formData, id_grupo_recurso: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900">
                                <option value="">Seleccionar...</option>
                                {grupos.map(g => (
                                    <option key={g.id_grupo_recurso} value={g.id_grupo_recurso}>{g.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Formato</label>
                            <input type="text" value={formData.formato} onChange={e => setFormData({ ...formData, formato: e.target.value })}
                                placeholder="Ej: unidad, servicio, caja"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900" />
                        </div>
                        <div className="col-span-2">
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-semibold text-gray-700">Descripción</label>
                                <div className="flex items-center gap-2">
                                    {asesoriaRecurso && !mostrarAsesoriaRecurso && (
                                        <button type="button"
                                            onClick={() => setMostrarAsesoriaRecurso(true)}
                                            className="px-2.5 py-1 rounded-lg font-bold text-violet-700 bg-white border border-violet-200 hover:bg-violet-50 transition-all text-xs flex items-center gap-1"
                                        >
                                            <Sparkles size={12} />
                                            Ver asesoría
                                        </button>
                                    )}
                                    <button type="button"
                                        disabled={asesorandoRecurso || !formData.nombre.trim()}
                                        onClick={async () => {
                                            setAsesorandoRecurso(true);
                                            setAsesoriaRecurso(null);
                                            try {
                                                const proveedorOverride = localStorage.getItem('ai_provider_override');
                                                const res = await api.post('/ai/asesorar-cuenta', {
                                                    nombre: formData.nombre,
                                                    descripcion: formData.descripcion,
                                                    id_cat_recurso: formData.id_cat_recurso ? parseInt(formData.id_cat_recurso) : null,
                                                    destino_uso: 'clases(alumno)',
                                                    proveedor_override: proveedorOverride,
                                                });
                                                setAsesoriaRecurso(res.data);
                                                setMostrarAsesoriaRecurso(true);
                                            } catch (err: any) {
                                                alert(err.response?.data?.detail || 'Error al consultar la IA');
                                            } finally {
                                                setAsesorandoRecurso(false);
                                            }
                                        }}
                                        className="px-3 py-1 rounded-lg font-bold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-all text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {asesorandoRecurso ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                        {asesoriaRecurso ? 'Volver a asesorar' : 'Asesorar código contable'}
                                    </button>
                                </div>
                            </div>
                            <textarea value={formData.descripcion} onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                                rows={2} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900" />
                        </div>
                    </div>

                    {/* Bloque Asesoría IA */}
                    {asesoriaRecurso && mostrarAsesoriaRecurso && (
                        <div className="p-4 bg-violet-50/70 border border-violet-200 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-800">
                                    <Sparkles size={14} /> Asesoría de IA para Código Contable por Propósito
                                </span>
                                <button type="button" onClick={() => setMostrarAsesoriaRecurso(false)} className="text-gray-400 hover:text-gray-600">
                                    <X size={14} />
                                </button>
                            </div>

                            {(() => {
                                const sugerencias = asesoriaRecurso.sugerencias || [asesoriaRecurso];
                                return (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                        {sugerencias.map((sug: any, idx: number) => {
                                            const codigo = sug.codigo_cuenta || sug.codigo_sugerido;
                                            const nombreCuenta = sug.nombre_cuenta || sug.nombre_subcategoria;
                                            const razon = sug.razon || sug.justificacion;
                                            const destLabel = sug.destino_label || sug.destino || 'Propósito';

                                            // Renderizar cuenta principal y posibles cuentas alternativas sugeridas
                                            const listaCuentas = [
                                                { codigo, nombreCuenta, razon },
                                                ...(Array.isArray(sug.cuentas_alternativas) ? sug.cuentas_alternativas.map((alt: any) => ({
                                                    codigo: alt.codigo_cuenta,
                                                    nombreCuenta: alt.nombre_cuenta,
                                                    razon: alt.razon
                                                })) : [])
                                            ].filter(c => c.codigo);

                                            return (
                                                <div key={idx} className="p-3 bg-white/90 border border-violet-100 rounded-xl space-y-2 shadow-sm">
                                                    <div className="flex items-center justify-between border-b border-violet-50 pb-1">
                                                        <span className="text-[10px] font-extrabold uppercase text-violet-700 bg-violet-100 px-2 py-0.5 rounded">
                                                            {destLabel}
                                                        </span>
                                                        <span className="text-[9px] text-gray-400 font-medium">
                                                            {listaCuentas.length} sugerencia{listaCuentas.length > 1 ? 's' : ''}
                                                        </span>
                                                    </div>

                                                    {listaCuentas.map((item, cIdx) => (
                                                        <div key={cIdx} className="space-y-1 pt-0.5">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-baseline gap-1.5 min-w-0 pr-2">
                                                                    <span className="text-xs font-extrabold text-violet-950 font-mono">{item.codigo}</span>
                                                                    {item.nombreCuenta && (
                                                                        <span className="text-[10px] font-semibold text-gray-700 truncate">{item.nombreCuenta}</span>
                                                                    )}
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        const targetDestino = sug.destino === 'ESTUDIANTE' ? 'clases(alumno)' :
                                                                            sug.destino === 'FUNCIONARIO' ? 'oficinas(administracion)' :
                                                                            sug.destino === 'PREMIO' ? 'premio/beneficio' : 'mantencion/servicio';

                                                                        // Buscar subcategoría correspondiente en subcategorias
                                                                        let subMatch = subcategorias.find(sc => sc.codigo_cuenta === item.codigo);
                                                                        if (!subMatch) {
                                                                            try {
                                                                                const subRes = await api.get('/presupuesto/subcategorias');
                                                                                const subList = subRes.data || [];
                                                                                subMatch = subList.find((s: any) => s.codigo_cuenta === item.codigo);
                                                                            } catch { /* ignore */ }
                                                                        }

                                                                        const subcatId = subMatch ? subMatch.id_subcat_recurso : null;
                                                                        const defaultSubvId = subvencionesActivas.find(sv => sv.nombre_corto === 'GENERAL')?.id_subvencion || subvencionesActivas[0]?.id_subvencion;

                                                                        if (editingRecurso) {
                                                                            // En modo edición -> agregar a la API en vivo
                                                                            try {
                                                                                await api.post(`/presupuesto/recursos/${editingRecurso.id_recurso}/mapeos`, {
                                                                                    id_subcat_recurso: subcatId || 1,
                                                                                    codigo_cuenta: item.codigo,
                                                                                    id_subvencion: defaultSubvId || null,
                                                                                    destino_gasto: targetDestino
                                                                                });
                                                                                const res = await api.get(`/presupuesto/recursos/${editingRecurso.id_recurso}/mapeos`);
                                                                                setCodigosExistentes(res.data || []);
                                                                                setExpandedPropositos(prev => ({ ...prev, [targetDestino]: true }));
                                                                            } catch (err: any) {
                                                                                alert(err.response?.data?.detail || 'Error al agregar código contable');
                                                                            }
                                                                        } else {
                                                                            // En modo nuevo recurso -> agregar a pendingCodigos
                                                                            setPendingCodigos(prev => [...prev, {
                                                                                key: `${targetDestino}-${subcatId}-${Date.now()}`,
                                                                                id_subcat_recurso: subcatId,
                                                                                id_subvencion: defaultSubvId,
                                                                                codigo_cuenta: item.codigo,
                                                                                nombre_subcategoria: item.nombreCuenta || '',
                                                                                nombre_subvencion: 'GENERAL',
                                                                                destino_gasto: targetDestino
                                                                            }]);
                                                                            setExpandedPropositos(prev => ({ ...prev, [targetDestino]: true }));
                                                                        }
                                                                    }}
                                                                    className="px-2 py-0.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-[10px] rounded-lg transition-all flex items-center gap-1 shrink-0"
                                                                >
                                                                    <Plus size={10} /> Usar {item.codigo}
                                                                </button>
                                                            </div>
                                                            {item.razon && (
                                                                <p className="text-[10px] text-gray-500 leading-tight line-clamp-1">{item.razon}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    <div className="border-t border-gray-100 pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-gray-700">Códigos Contables por Propósito de Uso</h4>
                            <span className="text-[10px] text-gray-400 font-medium">
                                {editingRecurso ? `${codigosExistentes.length} código(s) registrado(s)` : `${pendingCodigos.length} código(s) pendiente(s)`}
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-400">Asigna uno o más códigos contables según cómo se usará este recurso. El sistema sugerirá el correcto según el rol del solicitante.</p>

                        {editingRecurso ? (
                            <SeccionCodigos
                                codigos={codigosExistentes}
                                onAdd={agregarCodigoExistente}
                                onDelete={id => eliminarCodigoExistente(id as number)}
                                activeForm={formCodigo?.propositoId || null}
                                setActiveForm={v => setFormCodigo(v ? { propositoId: v, codigo_cuenta: '', subvencion: 'GENERAL', search: '' } : null)}
                                isNew={false}
                            />
                        ) : (
                            <SeccionCodigos
                                codigos={pendingCodigos}
                                onAdd={agregarCodigoPendiente}
                                onDelete={id => eliminarCodigoPendiente(id as string)}
                                activeForm={formCodigo?.propositoId || null}
                                setActiveForm={v => setFormCodigo(v ? { propositoId: v, codigo_cuenta: '', subvencion: 'GENERAL', search: '' } : null)}
                                isNew={true}
                            />
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-2 border-t border-gray-50">
                        <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button type="button" onClick={handleSubmit} disabled={isSaving}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
                            {isSaving && <Loader2 size={16} className="animate-spin" />}
                            {editingRecurso ? 'Actualizar' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Bulk confirm — recursos */}
            <Modal isOpen={!!bulkConfirmRec} onClose={() => setBulkConfirmRec(null)}
                title={bulkConfirmRec === 'copy' ? 'Confirmar Copia Masiva' : 'Confirmar Eliminación Masiva'} maxWidth="max-w-sm">
                <div className="py-4 space-y-4">
                    <p className="text-gray-600">
                        {bulkConfirmRec === 'copy'
                            ? `¿Crear una copia de los ${selectedRec.size} recursos seleccionados?`
                            : `¿Eliminar los ${selectedRec.size} recursos seleccionados? Esta acción no se puede deshacer.`}
                    </p>
                    <ul className="max-h-32 overflow-y-auto space-y-1">
                        {filtered.filter(r => selectedRec.has(r.id_recurso)).map(r => (
                            <li key={r.id_recurso} className="text-xs text-gray-500 flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${bulkConfirmRec === 'delete' ? 'bg-red-400' : 'bg-green-400'}`} />
                                {r.nombre}
                            </li>
                        ))}
                    </ul>
                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setBulkConfirmRec(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button onClick={executeBulkRec} disabled={isSaving}
                            className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 flex items-center gap-2 ${bulkConfirmRec === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                            {isSaving && <Loader2 size={14} className="animate-spin" />}
                            {bulkConfirmRec === 'copy' ? 'Copiar' : 'Eliminar'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation */}
            <Modal isOpen={!!deletingRecurso} onClose={() => setDeletingRecurso(null)} title="Confirmar Eliminación" maxWidth="max-w-sm">
                <div className="py-4">
                    <p className="text-gray-600 mb-6">¿Eliminar el recurso <strong>{deletingRecurso?.nombre}</strong>? Esta acción no se puede deshacer.</p>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setDeletingRecurso(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button onClick={handleDelete} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                            {isSaving && <Loader2 size={16} className="animate-spin" />} Eliminar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Resultado de importación */}
            <Modal isOpen={!!importResult} onClose={() => setImportResult(null)} title="Resultado de la Importación" maxWidth="max-w-md">
                {importResult && (
                    <div className="py-4 space-y-4">
                        <div className={`flex items-center gap-3 p-4 rounded-xl ${importResult.creadas > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${importResult.creadas > 0 ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
                                <Check size={20} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900">{importResult.creadas} recurso{importResult.creadas !== 1 ? 's' : ''} creado{importResult.creadas !== 1 ? 's' : ''}</p>
                                <p className="text-xs text-gray-500">Importación finalizada</p>
                            </div>
                        </div>

                        {importResult.errores.length > 0 && (
                            <div>
                                <p className="text-sm font-bold text-amber-700 mb-2">{importResult.errores.length} advertencia{importResult.errores.length !== 1 ? 's' : ''}:</p>
                                <ul className="max-h-48 overflow-y-auto space-y-1.5 bg-amber-50/50 border border-amber-100 rounded-xl p-3">
                                    {importResult.errores.map((err, i) => (
                                        <li key={i} className="text-xs text-amber-800 flex items-start gap-1.5 leading-relaxed">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />{err}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <button onClick={() => setImportResult(null)} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600">
                                Entendido
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Modal para ver detalles del código contable */}
            <Modal isOpen={!!viewingCodigoDetalle} onClose={() => setViewingCodigoDetalle(null)} title="Detalle del Código Contable" maxWidth="max-w-md">
                {viewingCodigoDetalle && (() => {
                    const propositoId = viewingCodigoDetalle.destino_gasto || (viewingCodigoDetalle as any).destino;
                    const propositoObj = PILARES_OFICIALES.find(p => p.id === propositoId);
                    const labelProp = propositoObj ? propositoObj.label : 'No especificado';
                    
                    return (
                        <div className="py-4 space-y-4">
                            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
                                <div>
                                    <span className="text-[10px] uppercase font-bold text-gray-400">Código Contable</span>
                                    <p className="text-lg font-mono font-bold text-blue-900">{viewingCodigoDetalle.codigo_cuenta}</p>
                                </div>
                                <div>
                                    <span className="text-[10px] uppercase font-bold text-gray-400">Subcategoría</span>
                                    <p className="text-sm font-semibold text-gray-800">{viewingCodigoDetalle.nombre_subcategoria || 'Sin descripción'}</p>
                                </div>
                                <div>
                                    <span className="text-[10px] uppercase font-bold text-gray-400">Propósito de Uso</span>
                                    <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5 mt-0.5">
                                        <span className="text-base">{propositoObj?.icon}</span>
                                        {labelProp}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-[10px] uppercase font-bold text-gray-400">Subvención Asociada</span>
                                    <p className="mt-1">
                                        <span className="px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-extrabold">
                                            {viewingCodigoDetalle.nombre_subvencion || 'GENERAL'}
                                        </span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button onClick={() => setViewingCodigoDetalle(null)} className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-blue-600 transition-colors shadow-md shadow-primary/20">
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* Modal Eliminar Todos */}
            <Modal isOpen={showDeleteAll} onClose={() => setShowDeleteAll(false)} title="⚠️ Eliminar Todos los Recursos" maxWidth="max-w-sm">
                <div className="py-4 space-y-4">
                    <p className="text-gray-600">
                        ¿Estás seguro de que deseas eliminar <strong>todos los recursos</strong> del catálogo?
                    </p>
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                        Los recursos que estén asociados a solicitudes de presupuesto no se eliminarán.
                    </p>
                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setShowDeleteAll(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button
                            onClick={async () => {
                                setDeletingAll(true);
                                try {
                                    const res = await api.delete('/presupuesto/recursos/eliminar-todos');
                                    alert(`${res.data.eliminados} recursos eliminados.`);
                                    setShowDeleteAll(false);
                                    fetchData();
                                } catch (err: any) {
                                    alert(err.response?.data?.detail || 'Error al eliminar recursos');
                                } finally {
                                    setDeletingAll(false);
                                }
                            }}
                            disabled={deletingAll}
                            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {deletingAll && <Loader2 size={14} className="animate-spin" />}
                            Eliminar Todos
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal de Recursos Similares y Duplicados */}
            <Modal isOpen={showDuplicatesModal} onClose={() => setShowDuplicatesModal(false)} title="🔍 Detector & Consolidador de Recursos Similares" maxWidth="max-w-5xl">
                <div className="space-y-4">
                    {/* Barra de búsqueda de etiquetas y descripción */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200">
                        <p className="text-xs text-gray-500 font-medium">
                            Selecciona una <strong>etiqueta</strong> para agrupar y consolidar sus recursos similares.
                        </p>
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                            <input
                                type="text"
                                placeholder="Buscar etiqueta o grupo..."
                                value={tagSearchTerm}
                                onChange={(e) => setTagSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 text-gray-900"
                            />
                        </div>
                    </div>

                    {/* Lista de Etiquetas (Tag Chips) */}
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-gray-100/50 border border-gray-200 rounded-2xl">
                        {duplicateGroups.length === 0 ? (
                            <p className="text-xs text-gray-400 p-2">No hay grupos similares detectados.</p>
                        ) : duplicateGroups
                            .filter(g => g.token.toLowerCase().includes(tagSearchTerm.toLowerCase()))
                            .map(g => {
                                const isActive = activeTagToken === g.token;
                                return (
                                    <button
                                        key={g.token}
                                        onClick={() => setActiveTagToken(g.token)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center gap-1.5 ${isActive ? 'bg-amber-500 text-white shadow-md scale-105' : 'bg-white text-gray-700 hover:bg-amber-50 hover:text-amber-700 border border-gray-200'}`}
                                    >
                                        <span>"{g.token.toUpperCase()}"</span>
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-amber-700 text-amber-100' : 'bg-gray-100 text-gray-500'}`}>
                                            {g.count}
                                        </span>
                                    </button>
                                );
                            })}
                    </div>

                    {/* Detalle del Grupo Activo seleccionado */}
                    {(() => {
                        const activeGroup = duplicateGroups.find(g => g.token === activeTagToken) || duplicateGroups[0];
                        if (!activeGroup) {
                            return (
                                <div className="p-8 text-center text-xs text-gray-400 bg-gray-50 rounded-2xl border border-gray-200">
                                    No hay etiquetas disponibles con ese filtro.
                                </div>
                            );
                        }

                        const keeperId = selectedKeepers[activeGroup.token] || activeGroup.items[0]?.id_recurso;
                        const isConsolidating = consolidatingToken === activeGroup.token;

                        return (
                            <div className="p-4 bg-gray-50/80 border border-gray-200 rounded-3xl space-y-4 shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-extrabold uppercase tracking-wide bg-amber-100 text-amber-800 px-3 py-1 rounded-xl border border-amber-200">
                                            Recursos del Grupo: "{activeGroup.token.toUpperCase()}" ({activeGroup.count} coincidencias)
                                        </span>
                                        <button
                                            onClick={() => {
                                                setSearchTerm(activeGroup.token);
                                                setShowDuplicatesModal(false);
                                            }}
                                            className="text-xs font-bold text-primary hover:text-blue-700 underline ml-2"
                                        >
                                            Filtrar en tabla principal
                                        </button>
                                    </div>

                                    <button
                                        disabled={isConsolidating}
                                        onClick={async () => {
                                            if (!keeperId) return;
                                            const keeper = activeGroup.items.find(i => i.id_recurso === keeperId);
                                            if (!keeper) return;

                                            const toDelete = activeGroup.items.filter(i => i.id_recurso !== keeperId);
                                            const newTitle = renamedTitles[activeGroup.token] || keeper.nombre;

                                            if (!confirm(`¿Deseas conservar "${newTitle}" y eliminar las otras ${toDelete.length} variante(s)?`)) return;

                                            setConsolidatingToken(activeGroup.token);
                                            try {
                                                if (newTitle !== keeper.nombre) {
                                                    await api.put(`/presupuesto/recursos/${keeper.id_recurso}`, {
                                                        nombre: newTitle,
                                                        descripcion: keeper.descripcion,
                                                        formato: keeper.formato,
                                                        id_cat_recurso: keeper.id_cat_recurso,
                                                        id_grupo_recurso: keeper.id_grupo_recurso
                                                    });
                                                }

                                                for (const delItem of toDelete) {
                                                    try {
                                                        await api.delete(`/presupuesto/recursos/${delItem.id_recurso}`);
                                                    } catch {}
                                                }

                                                const nextGroups = duplicateGroups.filter(x => x.token !== activeGroup.token);
                                                setDuplicateGroups(nextGroups);
                                                setActiveTagToken(nextGroups[0]?.token || null);
                                                fetchData();
                                            } catch (e: any) {
                                                alert(e.response?.data?.detail || 'Error consolidando grupo');
                                            } finally {
                                                setConsolidatingToken(null);
                                            }
                                        }}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        {isConsolidating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                        Consolidar & Dejar Solo Uno
                                    </button>
                                </div>

                                {/* Nombre sugerido */}
                                <div className="flex items-center gap-2 bg-white p-2.5 rounded-2xl border border-gray-200">
                                    <span className="text-xs font-bold text-gray-500 whitespace-nowrap">Nombre definitivo para este recurso:</span>
                                    <input
                                        type="text"
                                        value={renamedTitles[activeGroup.token] ?? ''}
                                        onChange={(e) => setRenamedTitles(prev => ({ ...prev, [activeGroup.token]: e.target.value }))}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>

                                {/* Listado de recursos del grupo */}
                                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                                    {activeGroup.items.map(item => {
                                        const isSelected = keeperId === item.id_recurso;
                                        const catObj = categorias.find(c => c.id_cat_recurso === item.id_cat_recurso);
                                        const catNombre = (item as any).categoria_nombre || catObj?.nombre || 'Sin Categoría';
                                        const grupoObj = grupos.find(gr => gr.id_grupo_recurso === item.id_grupo_recurso);
                                        const grupoNombre = (item as any).grupo_recurso_nombre || grupoObj?.nombre || 'General';

                                        return (
                                            <div
                                                key={item.id_recurso}
                                                onClick={() => {
                                                    setSelectedKeepers(prev => ({ ...prev, [activeGroup.token]: item.id_recurso }));
                                                    setRenamedTitles(prev => ({ ...prev, [activeGroup.token]: item.nombre }));
                                                }}
                                                className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 ${isSelected ? 'bg-emerald-50/70 border-emerald-300 shadow-sm' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <input
                                                        type="radio"
                                                        name={`keeper-${activeGroup.token}`}
                                                        checked={isSelected}
                                                        onChange={() => {
                                                            setSelectedKeepers(prev => ({ ...prev, [activeGroup.token]: item.id_recurso }));
                                                            setRenamedTitles(prev => ({ ...prev, [activeGroup.token]: item.nombre }));
                                                        }}
                                                        className="mt-1 w-4 h-4 text-emerald-600 accent-emerald-600 cursor-pointer"
                                                    />
                                                    <div className="space-y-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-bold text-gray-900 text-xs">{item.nombre}</span>
                                                            {isSelected && (
                                                                <span className="text-[10px] font-extrabold px-2 py-0.5 bg-emerald-600 text-white rounded-md">
                                                                    CONSERVAR
                                                                </span>
                                                            )}
                                                        </div>
                                                        {item.descripcion && (
                                                            <p className="text-[11px] text-gray-500">{item.descripcion}</p>
                                                        )}
                                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                                            <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md border border-gray-200">
                                                                📁 Categoría: {catNombre}
                                                            </span>
                                                            <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-100">
                                                                🏷️ Grupo: {grupoNombre}
                                                            </span>
                                                            {item.formato && (
                                                                <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md border border-purple-100">
                                                                    📦 Formato: {item.formato}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setShowDuplicatesModal(false);
                                                            handleEdit(item);
                                                        }}
                                                        className="p-1.5 text-gray-400 hover:text-primary bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                                        title="Editar detalles completos"
                                                    >
                                                        <Edit size={14} />
                                                    </button>
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (!confirm(`¿Eliminar solo "${item.nombre}"?`)) return;
                                                            try {
                                                                await api.delete(`/presupuesto/recursos/${item.id_recurso}`);
                                                                setDuplicateGroups(prev => prev.map(grp => grp.token === activeGroup.token ? {
                                                                    ...grp,
                                                                    count: grp.count - 1,
                                                                    items: grp.items.filter(i => i.id_recurso !== item.id_recurso)
                                                                } : grp).filter(grp => grp.items.length > 1));
                                                                fetchData();
                                                            } catch (err: any) {
                                                                alert(err.response?.data?.detail || 'Error al eliminar');
                                                            }
                                                        }}
                                                        className="p-1.5 text-gray-400 hover:text-red-600 bg-gray-100 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Eliminar este recurso individualmente"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    <div className="flex justify-end pt-2">
                        <button onClick={() => setShowDuplicatesModal(false)} className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-blue-600 transition-colors">
                            Cerrar
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
