'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import {
    Search, Plus, TrendingDown, DollarSign, Wallet, Loader2, Eye, EyeOff, Edit, Trash2,
    BookOpen, AlertCircle, Info, ListFilter, Tag, Check, X, FileText, Layers,
    FileSpreadsheet, Download, Upload, Sparkles, ChevronDown, ChevronUp
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import * as XLSX from 'xlsx';

const GRUPOS_GASTO = [
    { codigo: '410200', nombre: 'Personal y Bonos (410200)' },
    { codigo: '410300', nombre: 'Otros Gastos en Personal (410300)' },
    { codigo: '410400', nombre: 'Seguros y Previsión (410400)' },
    { codigo: '410500', nombre: 'Asesorías y Actividades ATE (410500)' },
    { codigo: '410600', nombre: 'Recursos de Aprendizaje (410600)' },
    { codigo: '410700', nombre: 'Equipamiento de Apoyo (410700)' },
    { codigo: '410800', nombre: 'Gastos en Alumnos (410800)' },
    { codigo: '410900', nombre: 'Gastos de Operación (410900)' },
    { codigo: '411000', nombre: 'Servicios Básicos (411000)' },
    { codigo: '411100', nombre: 'Servicios Generales (411100)' },
    { codigo: '411200', nombre: 'Multas e Intereses (411200)' },
    { codigo: '411400', nombre: 'Arriendos de Inmuebles (411400)' },
    { codigo: '411500', nombre: 'Arriendos de Bienes Muebles (411500)' },
    { codigo: '411600', nombre: 'Construcción y Mantención (411600)' },
];

const SUBVENCIONES = [
    { codigo: 'SUBV_GENERAL', nombre: 'Subvención General' },
    { codigo: 'ADM_CENTRAL_SUBV_GRAL', nombre: 'Adm. Central Subv. General' },
    { codigo: 'SEP', nombre: 'SEP (Escolar Preferencial)' },
    { codigo: 'ADM_CENTRAL_SEP', font: 'font-semibold', nombre: 'Adm. Central SEP' },
    { codigo: 'PIE', nombre: 'PIE (Integración Escolar)' },
    { codigo: 'MANTENIMIENTO', nombre: 'Mantenimiento' },
    { codigo: 'PRO_RETENCION', nombre: 'Pro Retención' },
    { codigo: 'INTERNADO', nombre: 'Internado' },
    { codigo: 'REFUERZO_EDUCATIVO', nombre: 'Refuerzo Educativo' },
];

export default function ContabilidadPage() {
    const { user, codigoRol } = useAuth();
    const canEditAccounts = ['OPE', 'SOS', 'ADM', 'DIR', 'FIN', 'CDP', 'GES'].includes(codigoRol || '');
    const [activeTab, setActiveTab] = useState<'manual' | 'pending'>('manual');
    
    // States for Pending Resource Suggestions
    const [pendingResources, setPendingResources] = useState<any[]>([]);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [selectedPendingResource, setSelectedPendingResource] = useState<any>(null);
    const [deletingPendingResource, setDeletingPendingResource] = useState<any>(null);
    const [isDeletingPending, setIsDeletingPending] = useState(false);
    const [accountSearchInModal, setAccountSearchInModal] = useState('');
    const [catSearchReview, setCatSearchReview] = useState('');
    const [catReviewOpen, setCatReviewOpen] = useState(false);
    const [approveForm, setApproveForm] = useState({
        codigo_cuenta: '',
        destino_uso: 'ESTUDIANTE',
        tipo_transaccion: 'COMPRA',
        subvencion: 'GENERAL'
    });
    const [reviewForm, setReviewForm] = useState({
        nombre: '',
        descripcion: '',
        motivo: '',
        id_actividad: null as number | null,
        tipo: 'BIEN',
        formato: 'unidad',
        id_cat_recurso: null as number | null,
        id_grupo_recurso: null as number | null,
        codigo_cuenta: '',
        destino_uso: 'ESTUDIANTE',
        tipo_transaccion: 'COMPRA',
        subvenciones: ['GENERAL'] as string[]
    });
    const [categorias, setCategorias] = useState<{id_cat_recurso: number; nombre: string}[]>([]);
    const [grupos, setGrupos] = useState<{id_grupo_recurso: number; nombre: string}[]>([]);
    const [aiSuggesting, setAiSuggesting] = useState(false);
    const [aiSuggestedCode, setAiSuggestedCode] = useState<string | null>(null);
    const [aiSuggestMeta, setAiSuggestMeta] = useState<{ proveedor: string; modelo: string; justificacion: string } | null>(null);
    const [expandedAccountCodigo, setExpandedAccountCodigo] = useState<string | null>(null);
    const [jsonCopiado, setJsonCopiado] = useState(false);
    const [asesorandoReview, setAsesorandoReview] = useState(false);
    const [asesorandoGrupo, setAsesorandoGrupo] = useState(false);
    const [grupoSugerido, setGrupoSugerido] = useState<{ id_grupo_recurso: number; razon: string } | null>(null);
    const [asesoriaReview, setAsesoriaReview] = useState<{sugerencias: {destino: string; destino_label: string; codigo_cuenta: string; nombre_cuenta: string; razon: string; subvenciones_habilitadas?: {codigo: string; critico: boolean}[]}[]; proveedor: string; modelo: string} | null>(null);
    const [mostrarAsesoria, setMostrarAsesoria] = useState(false);
    const [codigosSeleccionados, setCodigosSeleccionados] = useState<{destino: string; destino_label: string; codigo_cuenta: string; nombre_cuenta: string; subvencion: string}[]>([]);
    
    // States for PME and Activity Selection in Review Modal
    const [pmeActividades, setPmeActividades] = useState<any[]>([]);
    const [loadingActividades, setLoadingActividades] = useState(false);
    const [pmeSearchOpen, setPmeSearchOpen] = useState(false);
    const [pmeSearchTerm, setPmeSearchTerm] = useState('');
    const [dimensionFiltro, setDimensionFiltro] = useState<string>('TODAS');
    const [actividadDetalleModal, setActividadDetalleModal] = useState<any | null>(null);
    // States for Asesoría Masiva IA
    const [isMasivaModalOpen, setIsMasivaModalOpen] = useState(false);
    const [masivaLoading, setMasivaLoading] = useState(false);
    const [masivaAprobando, setMasivaAprobando] = useState(false);
    const [masivaBatchSize, setMasivaBatchSize] = useState<number>(25);
    const [masivaProgreso, setMasivaProgreso] = useState<{ actual: number; total: number; loteActual: number; totalLotes: number } | null>(null);
    // Cada item tiene: id_recurso, nombre, descripcion, id_cat_recurso, id_grupo_recurso, sugerencias[{destino, destino_label, codigo_cuenta, nombre_cuenta, razon, subvenciones_habilitadas}]
    const [masivaItems, setMasivaItems] = useState<any[]>([]);
    // Selección granular: key = "id_recurso:destino", value = boolean
    const [masivaDestSeleccionados, setMasivaDestSeleccionados] = useState<Record<string, boolean>>({});
    
    // States for Accounts Manual
    const [accounts, setAccounts] = useState<any[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [accountsSearch, setAccountsSearch] = useState('');
    const [selectedSubvencion, setSelectedSubvencion] = useState('');
    const [selectedGrupo, setSelectedGrupo] = useState('');
    const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
    // Edición de la Ficha Técnica y Matriz de Reglas
    const [isEditingAccount, setIsEditingAccount] = useState(false);
    const [editAccount, setEditAccount] = useState<any | null>(null);
    const [savingAccount, setSavingAccount] = useState(false);
    const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(new Set());
    const [showHidden, setShowHidden] = useState(false);

    // Import Excel for Accounts Manual
    const fileInputAccountsRef = useRef<HTMLInputElement>(null);
    const [importingAccounts, setImportingAccounts] = useState(false);
    const [importAccountsResult, setImportAccountsResult] = useState<{ creadas: number; errores: string[] } | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const canEdit = user?.rol?.codigo === 'ADM' || user?.rol?.codigo === 'DIR' || user?.rol?.codigo === 'GERENTE';

    const fetchAccounts = useCallback(async () => {
        try {
            setAccountsLoading(true);
            const response = await api.get('/catalogos/cuentas');
            setAccounts(response.data);
            setHiddenAccounts(new Set(response.data.filter((a: any) => a.oculta).map((a: any) => a.codigo)));
        } catch (error) {
            console.error('Error fetching accounting matrix:', error);
        } finally {
            setAccountsLoading(false);
        }
    }, []);

    const fetchPendingResources = useCallback(async () => {
        try {
            setPendingLoading(true);
            const response = await api.get('/presupuesto/recursos/pendientes');
            setPendingResources(response.data);
        } catch (error) {
            console.error('Error fetching pending resources:', error);
        } finally {
            setPendingLoading(false);
        }
    }, []);

    const handleDeletePendingResource = async () => {
        if (!deletingPendingResource) return;
        setIsDeletingPending(true);
        try {
            await api.delete(`/presupuesto/recursos/${deletingPendingResource.id_recurso}/sugerido`);
            setDeletingPendingResource(null);
            fetchPendingResources();
        } catch (error: any) {
            const message = error.response?.data?.detail || 'Error al eliminar el recurso sugerido';
            alert(message);
        } finally {
            setIsDeletingPending(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
        fetchPendingResources();
        Promise.all([
            api.get('/presupuesto/categoria-recurso'),
            api.get('/presupuesto/grupos-recurso')
        ]).then(([catRes, grpRes]) => {
            setCategorias(catRes.data || []);
            setGrupos(grpRes.data || []);
        }).catch(() => {});
    }, [fetchAccounts, fetchPendingResources]);

    const formatCLP = (value: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(value);
    };



    // Accounts manual filtering
    const filteredAccounts = accounts.filter(acc => {
        if (!showHidden && hiddenAccounts.has(acc.codigo)) return false;

        const matchesSearch =
            acc.codigo.toLowerCase().includes(accountsSearch.toLowerCase()) ||
            acc.nombre.toLowerCase().includes(accountsSearch.toLowerCase());

        const matchesGrupo = selectedGrupo ? acc.grupo === selectedGrupo : true;

        const matchesSubvencion = selectedSubvencion
            ? acc.subvenciones_reglas?.[selectedSubvencion]?.habilitado === true
            : true;

        return matchesSearch && matchesGrupo && matchesSubvencion;
    });

    // ---- Excel: Exportar Cuentas ----
    const exportAccountsToExcel = async () => {
        setIsSaving(true);
        try {
            const data = accounts.map(a => {
                const subvs = SUBVENCIONES.filter(s => a.subvenciones_reglas?.[s.codigo]?.habilitado).map(s => s.codigo).join(', ');
                const criticas = SUBVENCIONES.filter(s => a.subvenciones_reglas?.[s.codigo]?.critico_fiscalizacion).map(s => s.codigo).join(', ');
                const glosas = SUBVENCIONES
                    .filter(s => a.subvenciones_reglas?.[s.codigo]?.glosa_advertencia)
                    .map(s => `${s.codigo}=${a.subvenciones_reglas[s.codigo].glosa_advertencia}`)
                    .join(' | ');
                const docs = (a.documentos_habilitados || []).join(', ');
                const ejemplos = Array.isArray(a.ejemplos_compra) ? a.ejemplos_compra.join('; ') : '';
                const advertencias = Array.isArray(a.advertencias_sistema) ? a.advertencias_sistema.join('; ') : '';
                const destinos = a.destinos
                    ? ['ESTUDIANTE', 'FUNCIONARIO', 'PREMIO', 'MANTENCION']
                        .filter(k => a.destinos[k])
                        .map(k => `${k}:${a.destinos[k]}`)
                        .join('; ')
                    : '';
                return {
                    'Código': a.codigo,
                    'Nombre': a.nombre,
                    'Grupo': a.grupo,
                    'Libro Rendición': a.libro_rendicion,
                    'Documentos Habilitados': docs,
                    'Subvenciones Habilitadas': subvs,
                    'Subvenciones Críticas': criticas,
                    'Glosas Advertencia': glosas,
                    'Características y Aplicabilidad': a.caracteristicas || '',
                    'Diferenciación Público': a.diferenciacion_publico || '',
                    'Ejemplos de Compra Permitidos': ejemplos,
                    'Advertencias Sistema': advertencias,
                    'Destinos': destinos,
                    'Destino Principal': a.destino_principal || '',
                    'Oculta': a.oculta ? 'Sí' : 'No'
                };
            });
            const ws = XLSX.utils.json_to_sheet(data);
            ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 40 }, { wch: 50 }, { wch: 40 }, { wch: 50 }, { wch: 40 }, { wch: 35 }, { wch: 15 }, { wch: 10 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Manual de Cuentas');
            XLSX.writeFile(wb, `manual_cuentas_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (e) {
            console.error(e);
            alert('Error al exportar cuentas');
        } finally {
            setIsSaving(false);
        }
    };

    // ---- Excel: Descargar Plantilla Cuentas ----
    const downloadAccountsTemplate = () => {
        const ejemplo = [
            {
                'Código': '410601',
                'Nombre': 'Insumos Pedagógicos y Escolares',
                'Grupo': '410600',
                'Libro Rendición': 'REGISTRO DE GASTOS',
                'Documentos Habilitados': 'Factura, Boleta de Venta',
                'Subvenciones Habilitadas': 'SEP, PIE, SUBV_GENERAL',
                'Subvenciones Críticas': 'SEP',
                'Glosas Advertencia': 'SEP=Requiere respaldo de listado de alumnos',
                'Características y Aplicabilidad': 'Adquisición de cuadernos, lápices y material didáctico para alumnos.',
                'Diferenciación Público': 'Estudiantes prioritarios y preferentes.',
                'Ejemplos de Compra Permitidos': 'Lápices; Cuadernos; Reglas; Papel lustre',
                'Advertencias Sistema': 'No usar para insumos de oficina',
                'Destinos': 'ESTUDIANTE:PRINCIPAL; FUNCIONARIO:APLICA',
                'Destino Principal': 'ESTUDIANTE'
            },
            {
                'Código': '410901',
                'Nombre': 'Mantención de Infraestructura',
                'Grupo': '410900',
                'Libro Rendición': 'REGISTRO DE GASTOS',
                'Documentos Habilitados': 'Factura, Boleta de Honorarios',
                'Subvenciones Habilitadas': 'MANTENIMIENTO, SUBV_GENERAL',
                'Subvenciones Críticas': '',
                'Glosas Advertencia': '',
                'Características y Aplicabilidad': 'Servicios de reparación menor, hermoseamiento y limpieza profunda de dependencias.',
                'Diferenciación Público': 'Comunidad escolar general.',
                'Ejemplos de Compra Permitidos': 'Pintura; Servicios de gasfitería; Clavos; Reparación de techumbre',
                'Advertencias Sistema': '',
                'Destinos': 'MANTENCION:PRINCIPAL',
                'Destino Principal': 'MANTENCION'
            }
        ];
        const ws = XLSX.utils.json_to_sheet(ejemplo);
        ws['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 12 }, { wch: 25 }, { wch: 30 }, { wch: 30 }, { wch: 25 }, { wch: 40 }, { wch: 50 }, { wch: 40 }, { wch: 50 }, { wch: 40 }, { wch: 35 }, { wch: 15 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Cuentas');
        XLSX.writeFile(wb, 'plantilla_manual_cuentas.xlsx');
    };

    // ---- Excel: Importar Cuentas ----
    const handleImportAccountsClick = () => {
        setImportAccountsResult(null);
        fileInputAccountsRef.current?.click();
    };

    const handleAccountsFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await processImportAccounts(file);
        }
        if (fileInputAccountsRef.current) fileInputAccountsRef.current.value = '';
    };

    const processImportAccounts = async (file: File) => {
        setImportingAccounts(true);
        setImportAccountsResult(null);
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

            const payload: any[] = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const fila = i + 2;
                const codigo = String(row['Código'] ?? row['codigo'] ?? '').trim();
                const nombre = String(row['Nombre'] ?? row['nombre'] ?? '').trim();

                if (!codigo) {
                    errores.push(`Fila ${fila}: El campo "Código" está vacío. Se omitió.`);
                    continue;
                }
                if (codigo.length !== 6) {
                    errores.push(`Fila ${fila} ("${codigo}"): El código debe tener exactamente 6 dígitos. Se omitió.`);
                    continue;
                }
                if (!nombre) {
                    errores.push(`Fila ${fila} ("${codigo}"): El campo "Nombre" está vacío. Se omitió.`);
                    continue;
                }

                const grupo = String(row['Grupo'] ?? row['grupo'] ?? codigo.substring(0, 4) + '00').trim();
                const libro_rendicion = String(row['Libro Rendición'] ?? row['libro_rendicion'] ?? 'REGISTRO DE GASTOS').trim();
                
                const docsRaw = String(row['Documentos Habilitados'] ?? row['documentos_habilitados'] ?? '').trim();
                const documentos_habilitados = docsRaw ? docsRaw.split(/[,;]+/).map(d => d.trim()).filter(Boolean) : [];

                const subvsRaw = String(row['Subvenciones Habilitadas'] ?? row['subvenciones_habilitadas'] ?? '').trim();
                const subvenciones_habilitadas = subvsRaw ? subvsRaw.split(/[,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean) : [];

                const subvsCritRaw = String(row['Subvenciones Críticas'] ?? row['subvenciones_criticas'] ?? '').trim();
                const subvenciones_criticas = subvsCritRaw ? subvsCritRaw.split(/[,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean) : [];

                // Glosas: "CODE=texto | CODE2=texto2"
                const glosasRaw = String(row['Glosas Advertencia'] ?? row['glosas_advertencia'] ?? '').trim();
                const subvenciones_glosas: Record<string, string> = {};
                if (glosasRaw) {
                    glosasRaw.split('|').forEach(part => {
                        const idx = part.indexOf('=');
                        if (idx > 0) {
                            const key = part.substring(0, idx).trim().toUpperCase();
                            const val = part.substring(idx + 1).trim();
                            if (key) subvenciones_glosas[key] = val;
                        }
                    });
                }

                const descripcion_breve = String(row['Descripción Breve'] ?? row['descripcion_breve'] ?? '').trim();
                const caracteristicas = String(row['Características y Aplicabilidad'] ?? row['caracteristicas_y_aplicabilidad'] ?? '').trim();
                const diferenciacion_publico = String(row['Diferenciación Público'] ?? row['diferenciacion_publico'] ?? '').trim();
                const ejemplosRaw = String(row['Ejemplos de Compra Permitidos'] ?? row['ejemplos_de_compra_permitidos'] ?? '').trim();
                const ejemplos_compra = ejemplosRaw ? ejemplosRaw.split(/[;]+/).map(ex => ex.trim()).filter(Boolean) : [];
                const advertenciasRaw = String(row['Advertencias Sistema'] ?? row['advertencias_sistema'] ?? '').trim();
                const advertencias_sistema = advertenciasRaw ? advertenciasRaw.split(/[;]+/).map(a => a.trim()).filter(Boolean) : [];

                // Destinos: "ESTUDIANTE:PRINCIPAL; FUNCIONARIO:APLICA"
                const destinosRaw = String(row['Destinos'] ?? row['destinos'] ?? '').trim();
                let destinos: Record<string, string | null> | undefined;
                if (destinosRaw) {
                    destinos = { ESTUDIANTE: null, FUNCIONARIO: null, PREMIO: null, MANTENCION: null };
                    destinosRaw.split(/[;]+/).forEach(part => {
                        const [k, v] = part.split(':');
                        const key = (k || '').trim().toUpperCase();
                        const val = (v || '').trim().toUpperCase();
                        if (key in destinos! && (val === 'PRINCIPAL' || val === 'APLICA')) {
                            destinos![key] = val;
                        }
                    });
                }
                const destino_principal = String(row['Destino Principal'] ?? row['destino_principal'] ?? '').trim().toUpperCase() || undefined;

                const item: any = {
                    codigo,
                    nombre,
                    grupo,
                    libro_rendicion,
                    documentos_habilitados,
                    subvenciones_habilitadas,
                    subvenciones_criticas,
                    subvenciones_glosas,
                    descripcion_breve,
                    caracteristicas,
                    diferenciacion_publico,
                    ejemplos_compra,
                    advertencias_sistema
                };
                if (destinos) item.destinos = destinos;
                if (destino_principal) item.destino_principal = destino_principal;
                payload.push(item);
                creadas++;
            }

            if (payload.length > 0) {
                await api.post('/catalogos/cuentas/importar', payload);
            }

            setImportAccountsResult({ creadas, errores });
            fetchAccounts();
        } catch (err: any) {
            console.error('Error importando cuentas:', err);
            errores.push(`Error de conexión o lectura: ${err.message || 'error desconocido'}`);
            setImportAccountsResult({ creadas: 0, errores });
        } finally {
            setImportingAccounts(false);
        }
    };

    const handleAccountClick = (acc: any) => {
        setSelectedAccount(acc);
        setIsEditingAccount(false);
        setEditAccount(null);
        setIsAccountModalOpen(true);
    };

    // ---- Edición de Ficha Técnica y Matriz de Reglas ----
    const startEditAccount = () => {
        if (!selectedAccount) return;
        const clone = JSON.parse(JSON.stringify(selectedAccount));
        // Garantizar estructuras editables
        if (!clone.destinos) {
            clone.destinos = { ESTUDIANTE: null, FUNCIONARIO: null, PREMIO: null, MANTENCION: null };
        }
        if (!clone.subvenciones_reglas) clone.subvenciones_reglas = {};
        SUBVENCIONES.forEach(s => {
            if (!clone.subvenciones_reglas[s.codigo]) {
                clone.subvenciones_reglas[s.codigo] = { habilitado: false, critico_fiscalizacion: false, glosa_advertencia: '' };
            }
        });
        if (!Array.isArray(clone.documentos_habilitados)) clone.documentos_habilitados = [];
        if (!Array.isArray(clone.ejemplos_compra)) clone.ejemplos_compra = [];
        if (!Array.isArray(clone.advertencias_sistema)) clone.advertencias_sistema = [];
        setEditAccount(clone);
        setIsEditingAccount(true);
    };

    const cancelEditAccount = () => {
        setIsEditingAccount(false);
        setEditAccount(null);
    };

    const saveAccount = async () => {
        if (!editAccount) return;
        setSavingAccount(true);
        try {
            await api.put(`/catalogos/cuentas/${editAccount.codigo}`, {
                libro_rendicion: editAccount.libro_rendicion || '',
                documentos_habilitados: editAccount.documentos_habilitados || [],
                subvenciones_reglas: editAccount.subvenciones_reglas || {},
                caracteristicas: editAccount.caracteristicas || '',
                diferenciacion_publico: editAccount.diferenciacion_publico || '',
                ejemplos_compra: editAccount.ejemplos_compra || [],
                advertencias_sistema: editAccount.advertencias_sistema || [],
                destinos: editAccount.destinos || null,
                destino_principal: editAccount.destino_principal || null,
            });
            // Reflejar en el modal y refrescar la lista
            setSelectedAccount(editAccount);
            setIsEditingAccount(false);
            setEditAccount(null);
            await fetchAccounts();
            alert('Ficha actualizada correctamente.');
        } catch (e: any) {
            alert(e.response?.data?.detail || 'Error al guardar la ficha.');
        } finally {
            setSavingAccount(false);
        }
    };

    // Helpers de edición de listas (documentos, ejemplos, advertencias)
    const updateEditField = (field: string, value: any) => {
        setEditAccount((prev: any) => ({ ...prev, [field]: value }));
    };
    const updateListItem = (field: string, idx: number, value: string) => {
        setEditAccount((prev: any) => {
            const arr = [...(prev[field] || [])];
            arr[idx] = value;
            return { ...prev, [field]: arr };
        });
    };
    const addListItem = (field: string) => {
        setEditAccount((prev: any) => ({ ...prev, [field]: [...(prev[field] || []), ''] }));
    };
    const removeListItem = (field: string, idx: number) => {
        setEditAccount((prev: any) => ({ ...prev, [field]: (prev[field] || []).filter((_: any, i: number) => i !== idx) }));
    };
    const updateSubvRegla = (codigo: string, key: string, value: any) => {
        setEditAccount((prev: any) => {
            const reglas = { ...(prev.subvenciones_reglas || {}) };
            reglas[codigo] = { ...(reglas[codigo] || { habilitado: false, critico_fiscalizacion: false, glosa_advertencia: '' }), [key]: value };
            return { ...prev, subvenciones_reglas: reglas };
        });
    };
    const updateDestino = (key: string, value: string | null) => {
        setEditAccount((prev: any) => {
            const dest = { ...(prev.destinos || { ESTUDIANTE: null, FUNCIONARIO: null, PREMIO: null, MANTENCION: null }) };
            dest[key] = value;
            return { ...prev, destinos: dest };
        });
    };

    return (
        <div className="animate-in fade-in duration-500">
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Contralor Operaciones</h2>
                <p className="text-gray-500 mt-1.5 font-medium">Control de reglas del manual de cuentas 2026.</p>
            </div>

            {/* Premium Tab Selector */}
            <div className="flex border-b border-gray-100 mb-8 gap-6">
                <button 
                    onClick={() => setActiveTab('manual')}
                    className={`pb-4 text-base font-bold transition-all duration-200 border-b-2 flex items-center gap-2 ${
                        activeTab === 'manual' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                >
                    <BookOpen size={18} />
                    Manual de Cuentas y Reglas
                </button>
                <button 
                    onClick={() => setActiveTab('pending')}
                    className={`pb-4 text-base font-bold transition-all duration-200 border-b-2 flex items-center gap-2 relative ${
                        activeTab === 'pending' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                >
                    <Layers size={18} />
                    Recursos Sugeridos
                    {pendingResources.length > 0 && (
                        <span className="absolute -top-1 -right-4 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center animate-pulse">
                            {pendingResources.length}
                        </span>
                    )}
                </button>
            </div>

            {/* TAB 2: MANUAL DE CUENTAS Y REGLAS */}
            {activeTab === 'manual' && (
                <div className="space-y-6">
                    {/* Helper Banner */}
                    <div className="bg-blue-50/50 rounded-2xl p-5 border border-blue-100 flex items-start gap-3.5">
                        <Info className="text-primary mt-0.5 shrink-0" size={20} />
                        <div>
                            <h4 className="text-sm font-bold text-gray-900">Validaciones del Manual de Rendición 2026</h4>
                            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                Este buscador contiene la matriz oficial de cuentas de la Superintendencia de Educación. Úsalo para validar previamente qué subvenciones permiten financiar cada ítem, qué documentos de respaldo (Factura, Boleta de Honorario, etc.) se aceptan obligatoriamente, y evitar rechazos contables mediante las advertencias y reglas de integridad.
                            </p>
                        </div>
                    </div>

                    {/* Toolbar for Manual de Cuentas Excel actions */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-2">
                            <BookOpen className="text-gray-500" size={18} />
                            <span className="text-sm font-bold text-gray-700">Acciones del Manual</span>
                        </div>
                        <div className="flex items-center gap-3">
                            {canEdit && (
                                <button
                                    onClick={downloadAccountsTemplate}
                                    className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl font-semibold border border-gray-200 flex items-center gap-2 transition-all text-xs whitespace-nowrap"
                                >
                                    <FileSpreadsheet size={16} />
                                    Plantilla
                                </button>
                            )}

                            <button
                                onClick={exportAccountsToExcel}
                                disabled={accounts.length === 0}
                                title="Exportar manual de cuentas"
                                className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl font-semibold border border-gray-200 flex items-center gap-2 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                                <Download size={16} />
                                Exportar
                            </button>

                            {canEdit && (
                                <>
                                    <button
                                        onClick={handleImportAccountsClick}
                                        disabled={importingAccounts}
                                        title="Importar cuentas desde Excel"
                                        className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl font-semibold border border-gray-200 flex items-center gap-2 transition-all text-xs disabled:opacity-50 whitespace-nowrap"
                                    >
                                        {importingAccounts ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                        Importar
                                    </button>
                                    <input
                                        ref={fileInputAccountsRef}
                                        type="file"
                                        accept=".xlsx,.xls"
                                        onChange={handleAccountsFileSelected}
                                        className="hidden"
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    {/* Import Accounts feedback */}
                    {importAccountsResult && (
                        <div className={`p-4 rounded-2xl border ${importAccountsResult.errores.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-green-50 border-green-200 text-green-900'}`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="text-sm font-bold">Importación de Cuentas finalizada</h4>
                                    <p className="text-xs mt-1">Se cargaron/actualizaron exitosamente <strong>{importAccountsResult.creadas}</strong> cuentas.</p>
                                    {importAccountsResult.errores.length > 0 && (
                                        <details className="mt-2 text-xs">
                                            <summary className="cursor-pointer font-semibold underline text-amber-700">Ver advertencias u omisiones ({importAccountsResult.errores.length})</summary>
                                            <ul className="list-disc list-inside mt-1.5 space-y-1 text-amber-800 bg-white/50 p-2.5 rounded-lg border border-amber-100 max-h-40 overflow-y-auto">
                                                {importAccountsResult.errores.map((err, idx) => (
                                                    <li key={idx}>{err}</li>
                                                ))}
                                            </ul>
                                        </details>
                                    )}
                                </div>
                                <button onClick={() => setImportAccountsResult(null)} className="p-1 hover:bg-black/5 rounded-lg">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Filter and Search Bar */}
                    <div className="flex flex-col lg:flex-row gap-4">
                        {/* Search Input */}
                        <div className="relative flex-1">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar por código o nombre de cuenta..."
                                value={accountsSearch}
                                onChange={(e) => setAccountsSearch(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl bg-white placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                            />
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                                <ListFilter size={16} className="text-gray-400" />
                                <span className="text-xs font-semibold text-gray-500">Filtrar por:</span>
                            </div>

                            {/* Dropdown Grupo */}
                            <select
                                value={selectedGrupo}
                                onChange={(e) => setSelectedGrupo(e.target.value)}
                                className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            >
                                <option value="">Todos los grupos de gasto</option>
                                {GRUPOS_GASTO.map(g => (
                                    <option key={g.codigo} value={g.codigo}>{g.nombre}</option>
                                ))}
                            </select>

                            {/* Dropdown Subvención */}
                            <select
                                value={selectedSubvencion}
                                onChange={(e) => setSelectedSubvencion(e.target.value)}
                                className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            >
                                <option value="">Cualquier Subvención</option>
                                {SUBVENCIONES.map(s => (
                                    <option key={s.codigo} value={s.codigo}>{s.nombre}</option>
                                ))}
                            </select>

                            {/* Mostrar ocultas */}
                            {hiddenAccounts.size > 0 && (
                                <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                                    <input
                                        type="checkbox"
                                        checked={showHidden}
                                        onChange={(e) => setShowHidden(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
                                    />
                                    <span className="text-xs font-bold text-amber-700 whitespace-nowrap flex items-center gap-1">
                                        <EyeOff size={12} />
                                        Mostrar ocultas ({hiddenAccounts.size})
                                    </span>
                                </label>
                            )}
                        </div>
                    </div>

                    {/* Accounts Table List */}
                    <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Código / Cuenta</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Libro Rendición</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Docs Habilitados</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Subvenciones Principales</th>
                                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Detalles</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {accountsLoading ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Loader2 className="animate-spin" size={24} />
                                                    <span>Cargando manual de cuentas contables...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredAccounts.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-gray-400">No se encontraron cuentas contables que cumplan con los filtros de búsqueda.</td>
                                        </tr>
                                    ) : (
                                        filteredAccounts.map((acc) => {
                                            const enabledSubvs = SUBVENCIONES.filter(
                                                s => acc.subvenciones_reglas?.[s.codigo]?.habilitado
                                            ).slice(0, 3);
                                            const isHidden = hiddenAccounts.has(acc.codigo);

                                            return (
                                                <tr key={acc.codigo} className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${isHidden ? 'opacity-40' : ''}`} onClick={() => handleAccountClick(acc)}>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                                        <div className="flex flex-col">
                                                            <span className="text-primary font-bold tracking-wider">{acc.codigo}</span>
                                                            <span className="text-gray-700 text-xs font-medium uppercase truncate max-w-md">{acc.nombre}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-semibold uppercase">{acc.libro_rendicion}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-wrap gap-1">
                                                            {acc.documentos_habilitados && acc.documentos_habilitados.length > 0 ? (
                                                                acc.documentos_habilitados.map((doc: string) => (
                                                                    <span key={doc} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold">{doc}</span>
                                                                ))
                                                            ) : (
                                                                <span className="text-gray-400 text-xs italic">Ninguno</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {enabledSubvs.map(s => {
                                                                const isCritical = acc.subvenciones_reglas?.[s.codigo]?.critico_fiscalizacion;
                                                                return (
                                                                    <span
                                                                        key={s.codigo}
                                                                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                                                                            isCritical ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'
                                                                        }`}
                                                                    >
                                                                        {isCritical && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                                                                        {s.codigo === 'SUBV_GENERAL' ? 'GRAL' : s.codigo}
                                                                    </span>
                                                                );
                                                            })}
                                                            {SUBVENCIONES.filter(s => acc.subvenciones_reglas?.[s.codigo]?.habilitado).length > 3 && (
                                                                <span className="text-gray-400 text-[10px] font-bold">+{SUBVENCIONES.filter(s => acc.subvenciones_reglas?.[s.codigo]?.habilitado).length - 3}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center whitespace-nowrap text-sm" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={() => handleAccountClick(acc)}
                                                                className="text-primary hover:text-blue-700 font-bold text-xs hover:underline"
                                                            >
                                                                Ver Reglas
                                                            </button>
                                                            <span className="text-gray-200">|</span>
                                                            {isHidden ? (
                                                                <button
                                                                    onClick={async () => {
                                                                        await api.delete(`/catalogos/cuentas/${acc.codigo}/ocultar`);
                                                                        setHiddenAccounts(prev => { const n = new Set(prev); n.delete(acc.codigo); return n; });
                                                                    }}
                                                                    className="text-green-600 hover:text-green-700 font-bold text-xs flex items-center gap-1 hover:underline"
                                                                >
                                                                    <Eye size={14} />
                                                                    Mostrar
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={async () => {
                                                                        await api.post(`/catalogos/cuentas/${acc.codigo}/ocultar`);
                                                                        setHiddenAccounts(prev => new Set([...prev, acc.codigo]));
                                                                    }}
                                                                    className="text-gray-400 hover:text-red-500 font-bold text-xs"
                                                                    title="Ocultar"
                                                                >
                                                                    <EyeOff size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: RECURSOS SUGERIDOS */}
            {activeTab === 'pending' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    {/* Helper Banner & Acciones Masivas */}
                    <div className="bg-blue-50/50 rounded-2xl p-5 border border-blue-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                            <Info className="text-primary mt-0.5 shrink-0" size={20} />
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">Aprobación y Clasificación de Sugerencias</h4>
                                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                    Los jefes de área pueden solicitar insumos que no existen en el catálogo. Aquí puedes revisar estas propuestas, asignarles el código contable correspondiente del manual de rendición y aprobarlos.
                                </p>
                            </div>
                        </div>
                        {pendingResources.length > 0 && (
                            <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
                                <div className="flex items-center bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
                                    <span className="text-[11px] font-bold text-gray-500 mr-2">Lote:</span>
                                    <select
                                        value={masivaBatchSize}
                                        onChange={(e) => setMasivaBatchSize(Number(e.target.value))}
                                        className="text-xs font-black text-violet-700 bg-transparent focus:outline-none cursor-pointer"
                                    >
                                        <option value={25}>Primeros 25</option>
                                        <option value={50}>Primeros 50</option>
                                        <option value={100}>Primeros 100</option>
                                        <option value={pendingResources.length}>Todos ({pendingResources.length})</option>
                                    </select>
                                </div>

                                <button
                                    type="button"
                                    onClick={async () => {
                                        setIsMasivaModalOpen(true);
                                        setMasivaLoading(true);
                                        setMasivaItems([]);
                                        setMasivaDestSeleccionados({});

                                        // Limitar a la cantidad seleccionada
                                        const recursosSeleccionados = pendingResources.slice(0, masivaBatchSize);
                                        const totalAProcesar = recursosSeleccionados.length;
                                        
                                        // Dividir en mini-lotes de 10 para garantizar respuesta óptima sin que la IA se corte
                                        const CHUNK_SIZE = 10;
                                        const chunks: any[][] = [];
                                        for (let i = 0; i < totalAProcesar; i += CHUNK_SIZE) {
                                            chunks.push(recursosSeleccionados.slice(i, i + CHUNK_SIZE));
                                        }

                                        setMasivaProgreso({
                                            actual: 0,
                                            total: totalAProcesar,
                                            loteActual: 1,
                                            totalLotes: chunks.length
                                        });

                                        const todasRespuestas: any[] = [];
                                        const proveedorOverride = localStorage.getItem('ai_provider_override');

                                        try {
                                            for (let idx = 0; idx < chunks.length; idx++) {
                                                const chunk = chunks[idx];
                                                setMasivaProgreso({
                                                    actual: idx * CHUNK_SIZE,
                                                    total: totalAProcesar,
                                                    loteActual: idx + 1,
                                                    totalLotes: chunks.length
                                                });

                                                try {
                                                    const aiRes = await api.post('/ai/asesorar-recursos-lote', {
                                                        recursos: chunk.map(r => ({
                                                            id_recurso: r.id_recurso,
                                                            nombre: r.nombre,
                                                            descripcion: r.descripcion_solicitud || r.nombre,
                                                            solicitante_nombre: r.solicitante_nombre,
                                                            id_cat_recurso: r.id_cat_recurso,
                                                            categoria_nombre: r.categoria_nombre,
                                                            destino_gasto: r.destino_gasto,
                                                            subvencion_codigo: r.subvencion_codigo
                                                        })),
                                                        proveedor_override: proveedorOverride
                                                    });
                                                    const respuestasChunk = aiRes.data?.asesorias || [];
                                                    todasRespuestas.push(...respuestasChunk);
                                                } catch (chunkErr) {
                                                    console.warn(`Fallo el chunk ${idx + 1} de asesoría masiva:`, chunkErr);
                                                }
                                            }

                                            // Construir masivaItems con sugerencias multi-destino para todos los recursos procesados
                                            const items = recursosSeleccionados.map(r => {
                                                const match = todasRespuestas.find(ans => ans.id_recurso === r.id_recurso);
                                                return {
                                                    id_recurso: r.id_recurso,
                                                    nombre: r.nombre,
                                                    descripcion: r.descripcion_solicitud || r.nombre,
                                                    id_cat_recurso: match?.id_cat_recurso || r.id_cat_recurso || 1,
                                                    id_grupo_recurso: match?.id_grupo_recurso || r.id_grupo_recurso || undefined,
                                                    sugerencias: match?.sugerencias || [],
                                                };
                                            });
                                            setMasivaItems(items);

                                            // Pre-seleccionar sugerencias con codigo_cuenta válido
                                            const initSel: Record<string, boolean> = {};
                                            for (const item of items) {
                                                for (const sug of (item.sugerencias || [])) {
                                                    if (sug.codigo_cuenta) {
                                                        initSel[`${item.id_recurso}:${sug.destino}`] = true;
                                                    }
                                                }
                                            }
                                            setMasivaDestSeleccionados(initSel);
                                        } catch (aiErr) {
                                            console.warn("Fallo general en asesoría masiva:", aiErr);
                                            const items = recursosSeleccionados.map(r => ({
                                                id_recurso: r.id_recurso,
                                                nombre: r.nombre,
                                                descripcion: r.descripcion_solicitud || r.nombre,
                                                id_cat_recurso: r.id_cat_recurso || 1,
                                                id_grupo_recurso: r.id_grupo_recurso || undefined,
                                                sugerencias: [],
                                            }));
                                            setMasivaItems(items);
                                        } finally {
                                            setMasivaLoading(false);
                                            setMasivaProgreso(null);
                                        }
                                    }}
                                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-indigo-500/20 flex items-center gap-2 transition-all active:scale-95 shrink-0"
                                >
                                    <Sparkles size={16} />
                                    Asesorar {Math.min(masivaBatchSize, pendingResources.length)} con IA
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Pending Resources Table */}
                    <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Recurso</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Justificación de Uso</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Solicitado Por</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Categoría Sugerida</th>
                                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {pendingLoading ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Loader2 className="animate-spin" size={24} />
                                                    <span>Cargando recursos pendientes...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : pendingResources.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-20 text-center text-gray-400">
                                                <div className="flex flex-col items-center gap-4 opacity-55">
                                                    <Check size={48} className="text-green-500 bg-green-50 p-2.5 rounded-full" />
                                                    <p className="font-bold text-gray-800">No hay recursos pendientes</p>
                                                    <p className="text-xs text-gray-500">Todos los insumos solicitados ya han sido clasificados y aprobados.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        pendingResources.map((r) => (
                                            <tr key={r.id_recurso} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 font-bold text-xs">
                                                            {r.tipo === 'SERVICIO' ? 'SRV' : 'BIEN'}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-gray-900">{r.nombre}</span>
                                                            <span className="text-[10px] text-gray-400 font-mono">ID SUG: {r.id_recurso}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-xs text-gray-600 font-medium max-w-sm whitespace-normal leading-relaxed">
                                                        {r.descripcion_solicitud || 'Sin justificación provista'}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700">
                                                    {r.solicitante_nombre}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">
                                                        {r.categoria_nombre || 'Sin categoría'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                                  <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedPendingResource(r);
                                                            const nombreLower = (r.nombre || '').toLowerCase();
                                                            let defaultTrans = 'COMPRA';
                                                            if (nombreLower.includes('arriendo') || nombreLower.includes('leasing')) defaultTrans = 'ARRIENDO';
                                                            else if (nombreLower.includes('mantencion') || nombreLower.includes('reparacion') || nombreLower.includes('servicio de mant')) defaultTrans = 'MANTENCION';
                                                            // Mapear el destino que eligió el solicitante (en el detalle) al destino_uso del modal.
                                                            const destinoMap: Record<string, string> = {
                                                                'clases(alumno)': 'ESTUDIANTE',
                                                                'oficinas(administracion)': 'FUNCIONARIO',
                                                                'premio/beneficio': 'PREMIO',
                                                                'mantencion/servicio': 'MANTENCION',
                                                            };
                                                            const destinoUso = destinoMap[r.destino_gasto as string] || 'ESTUDIANTE';
                                                            
                                                            let defaultSubv = 'GENERAL';
                                                            if (r.subvencion_codigo) {
                                                                const code = r.subvencion_codigo.toUpperCase();
                                                                if (code.includes('SEP')) defaultSubv = 'SEP';
                                                                else if (code.includes('PIE')) defaultSubv = 'PIE';
                                                                else if (code.includes('PRO_RETENCION') || code.includes('RETENCION')) defaultSubv = 'PRO_RETENCION';
                                                                else if (code.includes('MANTENIMIENTO') || code.includes('MANTENCION')) defaultSubv = 'MANTENIMIENTO';
                                                            }

                                                            setReviewForm({
                                                                nombre: r.nombre || '',
                                                                descripcion: r.descripcion || '',
                                                                motivo: r.motivo || r.descripcion_solicitud || '',
                                                                id_actividad: r.id_actividad ?? null,
                                                                tipo: r.tipo || 'BIEN',
                                                                formato: r.formato || 'unidad',
                                                                id_cat_recurso: r.id_cat_recurso ?? null,
                                                                id_grupo_recurso: r.id_grupo_recurso ?? null,
                                                                codigo_cuenta: '',
                                                                destino_uso: destinoUso,
                                                                tipo_transaccion: defaultTrans,
                                                                subvenciones: [defaultSubv]
                                                            });
                                                            setCatSearchReview(r.categoria_nombre || '');
                                                            setAccountSearchInModal('');
                                                            setCodigosSeleccionados([]);
                                                            setAsesoriaReview(null);
                                                            setMostrarAsesoria(false);
                                                            setGrupoSugerido(null);
                                                            setDimensionFiltro(r.dimension || 'TODAS');
                                                            setPmeSearchTerm('');
                                                            setIsReviewModalOpen(true);
                                                            
                                                            // Cargar actividades PME para el colegio
                                                            setLoadingActividades(true);
                                                            api.get('/presupuesto/actividades/buscar?q=')
                                                                .then(res => setPmeActividades(res.data || []))
                                                                .catch(err => console.error('Error cargando actividades PME:', err))
                                                                .finally(() => setLoadingActividades(false));
                                                        }}
                                                        className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-primary/20 flex items-center gap-1.5 transition-all duration-200"
                                                    >
                                                        <Eye size={14} />
                                                        Revisar
                                                    </button>
                                                    <button
                                                        onClick={() => setDeletingPendingResource(r)}
                                                        title="Eliminar recurso sugerido"
                                                        className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl text-xs font-bold border border-red-100 flex items-center gap-1.5 transition-all duration-200"
                                                    >
                                                        <Trash2 size={14} />
                                                        Eliminar
                                                    </button>
                                                  </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* CONFIRMAR ELIMINACIÓN DE RECURSO SUGERIDO */}
            <Modal isOpen={!!deletingPendingResource} onClose={() => setDeletingPendingResource(null)} title="Descartar Recurso Sugerido" maxWidth="max-w-sm">
                <div className="py-4">
                    <p className="text-gray-600 mb-2">¿Descartar el recurso sugerido <strong className="text-gray-900">{deletingPendingResource?.nombre}</strong> de esta bandeja?</p>
                    <p className="text-xs text-gray-500 mb-6">Solo se quitará de "Recursos Sugeridos". El registro seguirá en el presupuesto donde fue solicitado.</p>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setDeletingPendingResource(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button onClick={handleDeletePendingResource} disabled={isDeletingPending} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                            {isDeletingPending && <Loader2 size={16} className="animate-spin" />}
                            Eliminar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* TAB 2 MODAL: DETALLE DE CUENTA Y VALIDACIONES DEL MANUAL */}
            <Modal isOpen={isAccountModalOpen} onClose={() => { setIsAccountModalOpen(false); setSelectedAccount(null); cancelEditAccount(); }} title="Ficha Técnica y Matriz de Reglas" maxWidth="max-w-4xl">
                {selectedAccount && (() => {
                    const acc = isEditingAccount ? editAccount : selectedAccount;
                    if (!acc) return null;
                    return (
                    <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
                        {/* Header Details */}
                        <div className="border-b border-gray-100 pb-4">
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1 bg-primary/10 text-primary text-sm font-extrabold rounded-lg tracking-widest">{acc.codigo}</span>
                                <h3 className="text-lg font-bold text-gray-900 uppercase">{acc.nombre}</h3>
                                {isEditingAccount && (
                                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold uppercase">Editando</span>
                                )}
                            </div>
                        </div>

                        {/* Content Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Validation & Matriz Rules */}
                            <div className="space-y-5 bg-gray-50/50 border border-gray-100 p-5 rounded-2xl">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <Tag size={14} />
                                    Reglas de Fiscalización
                                </h4>

                                <div className="space-y-3.5">
                                    <div>
                                        <span className="block text-[11px] font-bold text-gray-400 uppercase">Libro de Rendición</span>
                                        {isEditingAccount ? (
                                            <input
                                                type="text"
                                                value={acc.libro_rendicion || ''}
                                                onChange={e => updateEditField('libro_rendicion', e.target.value)}
                                                className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                                            />
                                        ) : (
                                            <p className="text-sm font-semibold text-gray-800 uppercase mt-0.5">{acc.libro_rendicion}</p>
                                        )}
                                    </div>

                                    <div>
                                        <span className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">Documentos Habilitados</span>
                                        {isEditingAccount ? (
                                            <div className="space-y-1.5">
                                                {(acc.documentos_habilitados || []).map((doc: string, idx: number) => (
                                                    <div key={idx} className="flex items-center gap-1.5">
                                                        <input
                                                            type="text"
                                                            value={doc}
                                                            onChange={e => updateListItem('documentos_habilitados', idx, e.target.value)}
                                                            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                                                        />
                                                        <button type="button" onClick={() => removeListItem('documentos_habilitados', idx)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button type="button" onClick={() => addListItem('documentos_habilitados')} className="text-[11px] font-bold text-primary flex items-center gap-1 hover:underline">
                                                    <Plus size={12} /> Agregar documento
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {acc.documentos_habilitados && acc.documentos_habilitados.length > 0 ? (
                                                    acc.documentos_habilitados.map((doc: string) => (
                                                        <span key={doc} className="px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700 text-xs font-bold shadow-sm">{doc}</span>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-gray-400 italic">No requiere o no aplica documentos</span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <span className="block text-[11px] font-bold text-gray-400 uppercase mb-2">Matriz de Subvenciones Habilitadas</span>
                                        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                                            <table className="min-w-full divide-y divide-gray-100">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-500 uppercase">Subvención</th>
                                                        <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-500 uppercase">Habilitado</th>
                                                        <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-500 uppercase">Fiscalización Crítica</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 text-xs">
                                                    {SUBVENCIONES.map(s => {
                                                        const rule = acc.subvenciones_reglas?.[s.codigo];
                                                        const isHabilitado = rule?.habilitado;
                                                        const isCritico = rule?.critico_fiscalizacion;

                                                        return (
                                                            <tr key={s.codigo} className={isHabilitado ? 'bg-green-50/10' : 'bg-gray-50/30'}>
                                                                <td className="px-3 py-2 font-medium text-gray-700">{s.nombre}</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    {isEditingAccount ? (
                                                                        <input type="checkbox" checked={!!isHabilitado} onChange={e => updateSubvRegla(s.codigo, 'habilitado', e.target.checked)} className="h-4 w-4 accent-green-600" />
                                                                    ) : isHabilitado ? (
                                                                        <Check size={16} className="text-green-600 mx-auto font-bold" />
                                                                    ) : (
                                                                        <X size={16} className="text-gray-300 mx-auto" />
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                    {isEditingAccount ? (
                                                                        <input type="checkbox" checked={!!isCritico} onChange={e => updateSubvRegla(s.codigo, 'critico_fiscalizacion', e.target.checked)} className="h-4 w-4 accent-red-600" />
                                                                    ) : isCritico ? (
                                                                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-bold inline-flex items-center gap-1">
                                                                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                                                            Sí (Punto Rojo)
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-gray-400">-</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        {isEditingAccount && (
                                            <div className="mt-2 space-y-1.5">
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase">Glosas de Advertencia (por subvención)</span>
                                                {SUBVENCIONES.filter(s => acc.subvenciones_reglas?.[s.codigo]?.habilitado).map(s => (
                                                    <div key={s.codigo} className="flex items-center gap-1.5">
                                                        <span className="w-40 shrink-0 text-[10px] font-semibold text-gray-600 truncate">{s.nombre}</span>
                                                        <input
                                                            type="text"
                                                            value={acc.subvenciones_reglas?.[s.codigo]?.glosa_advertencia || ''}
                                                            onChange={e => updateSubvRegla(s.codigo, 'glosa_advertencia', e.target.value)}
                                                            placeholder="Glosa opcional…"
                                                            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Matriz de Destinos (pre_cuenta_destino) */}
                                    <div>
                                        <span className="block text-[11px] font-bold text-gray-400 uppercase mb-2">Destinos de Gasto Autorizados</span>
                                        {isEditingAccount ? (
                                            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                                                <table className="min-w-full divide-y divide-gray-100">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-500 uppercase">Destino</th>
                                                            <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-500 uppercase">Aplica</th>
                                                            <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-500 uppercase">Principal</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100 text-xs">
                                                        {[
                                                            { key: 'ESTUDIANTE', label: 'Estudiantes (Actividades, sala de clases, eventos etc)' },
                                                            { key: 'FUNCIONARIO', label: 'Funcionarios (Oficina, actividades de func., etc)' },
                                                            { key: 'PREMIO', label: 'Actividad (Premio Beneficio)' },
                                                            { key: 'MANTENCION', label: 'Mantención / Servicio' },
                                                        ].map(({ key, label }) => (
                                                            <tr key={key}>
                                                                <td className="px-3 py-2 font-medium text-gray-700">{label}</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <select
                                                                        value={acc.destinos?.[key] || ''}
                                                                        onChange={e => updateDestino(key, e.target.value || null)}
                                                                        className="px-2 py-1 text-xs border border-gray-200 rounded-lg outline-none"
                                                                    >
                                                                        <option value="">—</option>
                                                                        <option value="APLICA">APLICA</option>
                                                                        <option value="PRINCIPAL">PRINCIPAL</option>
                                                                    </select>
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <input
                                                                        type="radio"
                                                                        name="destino_principal_edit"
                                                                        checked={acc.destino_principal === key}
                                                                        onChange={() => updateEditField('destino_principal', key)}
                                                                        className="h-4 w-4 accent-primary"
                                                                    />
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                <button type="button" onClick={() => updateEditField('destino_principal', null)} className="w-full text-center text-[10px] text-gray-400 py-1 hover:text-gray-600">
                                                    Quitar destino principal
                                                </button>
                                            </div>
                                        ) : acc.destinos ? (
                                            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                                                <table className="min-w-full divide-y divide-gray-100">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left text-[9px] font-bold text-gray-500 uppercase">Destino</th>
                                                            <th className="px-3 py-2 text-center text-[9px] font-bold text-gray-500 uppercase">Aplica</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100 text-xs">
                                                        {[
                                                            { key: 'ESTUDIANTE', label: 'Estudiantes (Actividades, sala de clases, eventos etc)' },
                                                            { key: 'FUNCIONARIO', label: 'Funcionarios (Oficina, actividades de func., etc)' },
                                                            { key: 'PREMIO', label: 'Actividad (Premio Beneficio)' },
                                                            { key: 'MANTENCION', label: 'Mantención / Servicio' },
                                                        ].map(({ key, label }) => {
                                                            const estado = acc.destinos?.[key];
                                                            const esPrincipal = acc.destino_principal === key;
                                                            return (
                                                                <tr key={key} className={estado ? 'bg-green-50/10' : 'bg-gray-50/30'}>
                                                                    <td className="px-3 py-2 font-medium text-gray-700 flex items-center gap-1.5">
                                                                        {label}
                                                                        {esPrincipal && (
                                                                            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-bold uppercase">Principal</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-center">
                                                                        {estado === 'PRINCIPAL' ? (
                                                                            <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-[9px] font-bold">PRINCIPAL</span>
                                                                        ) : estado === 'APLICA' ? (
                                                                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-bold">APLICA</span>
                                                                        ) : (
                                                                            <X size={14} className="text-gray-300 mx-auto" />
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 italic">Esta cuenta no tiene matriz de destinos cargada.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Descriptive & UI Content */}
                            <div className="space-y-6">
                                {/* Características */}
                                <div className="space-y-1.5">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <BookOpen size={14} />
                                        Características y Aplicabilidad
                                    </h4>
                                    {isEditingAccount ? (
                                        <textarea
                                            value={acc.caracteristicas || ''}
                                            onChange={e => updateEditField('caracteristicas', e.target.value)}
                                            rows={4}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                                        />
                                    ) : (
                                        <p className="text-sm text-gray-700 leading-relaxed font-medium">
                                            {acc.caracteristicas || "Sin características descriptivas disponibles."}
                                        </p>
                                    )}
                                </div>

                                {/* Público Objetivo */}
                                <div className="space-y-1.5">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <Info size={14} />
                                        Diferenciación de Público Objetivo
                                    </h4>
                                    {isEditingAccount ? (
                                        <textarea
                                            value={acc.diferenciacion_publico || ''}
                                            onChange={e => updateEditField('diferenciacion_publico', e.target.value)}
                                            rows={3}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                                        />
                                    ) : (
                                        <div className="p-3 bg-blue-50/30 border border-blue-100/50 rounded-xl">
                                            <p className="text-xs text-gray-700 leading-relaxed font-medium">
                                                {acc.diferenciacion_publico || "Comunidad escolar general."}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Ejemplos de Compra */}
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <FileText size={14} />
                                        Ejemplos de Compra Permitidos
                                    </h4>
                                    {isEditingAccount ? (
                                        <div className="space-y-1.5">
                                            {(acc.ejemplos_compra || []).map((ex: string, idx: number) => (
                                                <div key={idx} className="flex items-center gap-1.5">
                                                    <input
                                                        type="text"
                                                        value={ex}
                                                        onChange={e => updateListItem('ejemplos_compra', idx, e.target.value)}
                                                        className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                                                    />
                                                    <button type="button" onClick={() => removeListItem('ejemplos_compra', idx)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            <button type="button" onClick={() => addListItem('ejemplos_compra')} className="text-[11px] font-bold text-primary flex items-center gap-1 hover:underline">
                                                <Plus size={12} /> Agregar ejemplo
                                            </button>
                                        </div>
                                    ) : (
                                        <ul className="grid grid-cols-1 gap-1.5">
                                            {acc.ejemplos_compra && acc.ejemplos_compra.length > 0 ? (
                                                acc.ejemplos_compra.map((ex: string, idx: number) => (
                                                    <li key={idx} className="text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 flex items-center gap-2">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                                        {ex}
                                                    </li>
                                                ))
                                            ) : (
                                                <span className="text-xs text-gray-400 italic">No hay ejemplos registrados para esta cuenta.</span>
                                            )}
                                        </ul>
                                    )}
                                </div>

                                {/* Advertencias */}
                                {isEditingAccount ? (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-red-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <AlertCircle size={14} />
                                            Alertas e Integridad Normativa
                                        </h4>
                                        <div className="space-y-1.5">
                                            {(acc.advertencias_sistema || []).map((warn: string, idx: number) => (
                                                <div key={idx} className="flex items-center gap-1.5">
                                                    <input
                                                        type="text"
                                                        value={warn}
                                                        onChange={e => updateListItem('advertencias_sistema', idx, e.target.value)}
                                                        className="flex-1 px-2 py-1 text-xs border border-red-200 rounded-lg focus:ring-2 focus:ring-red-300 focus:border-red-400 outline-none"
                                                    />
                                                    <button type="button" onClick={() => removeListItem('advertencias_sistema', idx)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            <button type="button" onClick={() => addListItem('advertencias_sistema')} className="text-[11px] font-bold text-red-600 flex items-center gap-1 hover:underline">
                                                <Plus size={12} /> Agregar advertencia
                                            </button>
                                        </div>
                                    </div>
                                ) : acc.advertencias_sistema && acc.advertencias_sistema.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-red-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <AlertCircle size={14} />
                                            Alertas e Integridad Normativa
                                        </h4>
                                        <ul className="space-y-1.5">
                                            {acc.advertencias_sistema.map((warn: string, idx: number) => (
                                                <li key={idx} className="text-xs text-red-700 bg-red-50/50 px-3 py-2 rounded-lg border border-red-100/50 flex items-start gap-2 leading-relaxed">
                                                    <AlertCircle className="shrink-0 text-red-500 mt-0.5" size={14} />
                                                    <span>{warn}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Action footer */}
                        <div className="border-t border-gray-100 pt-4 flex justify-end gap-2">
                            {isEditingAccount ? (
                                <>
                                    <button
                                        onClick={cancelEditAccount}
                                        disabled={savingAccount}
                                        className="px-5 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={saveAccount}
                                        disabled={savingAccount}
                                        className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {savingAccount ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                        Guardar
                                    </button>
                                </>
                            ) : (
                                <>
                                    {canEditAccounts && (
                                        <button
                                            onClick={startEditAccount}
                                            className="px-5 py-2 text-sm font-semibold text-primary bg-primary/10 rounded-xl hover:bg-primary/20 transition-colors flex items-center gap-2"
                                        >
                                            <Edit size={16} /> Editar
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { setIsAccountModalOpen(false); setSelectedAccount(null); }}
                                        className="px-5 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                                    >
                                        Entendido
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    );
                })()}
            </Modal>

            {/* MODAL: REVISAR RECURSO SUGERIDO (flujo completo: editar + clasificar + aprobar) */}
            <Modal
                isOpen={isReviewModalOpen}
                onClose={() => { setIsReviewModalOpen(false); setSelectedPendingResource(null); setAsesoriaReview(null); setMostrarAsesoria(false); setGrupoSugerido(null); }}
                title="Revisar Recurso Sugerido"
                maxWidth="max-w-5xl"
            >
                {selectedPendingResource && (
                    <div className="space-y-5">
                        {/* Banner origen del solicitante (Limpio y claro) */}
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                            <div>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Solicitante</span>
                                <span className="font-bold text-gray-900">{selectedPendingResource.solicitante_nombre}</span>
                            </div>
                            {selectedPendingResource.solicitante_area && (
                                <div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Área</span>
                                    <span className="font-semibold text-gray-700">{selectedPendingResource.solicitante_area}</span>
                                </div>
                            )}
                            {selectedPendingResource.solicitante_subarea && (
                                <div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Cargo</span>
                                    <span className="font-semibold text-gray-700">{selectedPendingResource.solicitante_subarea}</span>
                                </div>
                            )}
                            {selectedPendingResource.solicitante_cargo && (
                                <div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Rol / Función</span>
                                    <span className="font-semibold text-gray-700">{selectedPendingResource.solicitante_cargo}</span>
                                </div>
                            )}
                        </div>

                        {/* SECCIÓN APARTE: Vinculación Plan PME y Justificación/Motivo de Compra (EDITABLE) */}
                        <div className="bg-amber-50/50 border border-amber-200/80 rounded-2xl p-4.5 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-2.5">
                                <div>
                                    <h5 className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                                        <Sparkles size={14} className="text-amber-600" />
                                        1. Vinculación Plan PME & Justificación de la Compra
                                    </h5>
                                    <p className="text-[11px] text-amber-700/80 mt-0.5">
                                        Filtra por dimensión para asociar la actividad correspondiente y ajusta la justificación.
                                    </p>
                                </div>
                                {/* Filtro por Dimensión PME */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] font-bold text-amber-700 uppercase">Dimensión:</span>
                                    {['TODAS', 'Liderazgo', 'Gestión Pedagógica', 'Convivencia Escolar', 'Gestión de Recursos'].map(dim => (
                                        <button
                                            key={dim}
                                            type="button"
                                            onClick={() => setDimensionFiltro(dim)}
                                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                                dimensionFiltro === dim
                                                    ? 'bg-amber-600 text-white shadow-sm'
                                                    : 'bg-white/80 text-amber-900 border border-amber-200 hover:bg-white'
                                            }`}
                                        >
                                            {dim === 'TODAS' ? 'Todas' : dim}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                {/* Selector de Actividad PME con Buscador */}
                                <div className="md:col-span-7 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">
                                            Actividad PME Vinculada *
                                        </label>
                                        {reviewForm.id_actividad && (() => {
                                            const actActual = pmeActividades.find(a => a.id === reviewForm.id_actividad) || {
                                                id: reviewForm.id_actividad,
                                                nombre: selectedPendingResource.actividad_nombre,
                                                dimension: selectedPendingResource.dimension,
                                                descripcion: selectedPendingResource.actividad_descripcion,
                                                lista_recursos: selectedPendingResource.actividad_recursos,
                                                nombre_accion: selectedPendingResource.nombre_accion
                                            };
                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() => setActividadDetalleModal(actActual)}
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 hover:underline"
                                                >
                                                    <Info size={13} />
                                                    Ver Detalle Actividad
                                                </button>
                                            );
                                        })()}
                                    </div>

                                    <div className="relative">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={pmeSearchOpen ? pmeSearchTerm : (pmeActividades.find(a => a.id === reviewForm.id_actividad)?.nombre || selectedPendingResource.actividad_nombre || pmeSearchTerm)}
                                                onChange={e => { setPmeSearchTerm(e.target.value); setPmeSearchOpen(true); }}
                                                onFocus={() => { setPmeSearchOpen(true); setPmeSearchTerm(''); }}
                                                placeholder={loadingActividades ? "Cargando actividades..." : "Buscar actividad PME por nombre o acción..."}
                                                className="w-full pl-9 pr-8 py-2.5 bg-white border border-amber-200 rounded-xl text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-sm"
                                            />
                                            <Search className="absolute left-3 top-3 text-amber-500/70" size={14} />
                                            {(reviewForm.id_actividad || pmeSearchTerm) && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setReviewForm(p => ({ ...p, id_actividad: null })); setPmeSearchTerm(''); }}
                                                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 p-0.5"
                                                    title="Limpiar selección"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>

                                        {pmeSearchOpen && (
                                            <>
                                                <div className="fixed inset-0 z-30" onClick={() => setPmeSearchOpen(false)} />
                                                <div className="absolute z-40 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-amber-200 rounded-2xl shadow-xl divide-y divide-gray-50">
                                                    {pmeActividades
                                                        .filter(a => {
                                                            const matchDim = dimensionFiltro === 'TODAS' || a.dimension?.toLowerCase() === dimensionFiltro.toLowerCase();
                                                            const term = pmeSearchTerm.toLowerCase();
                                                            const matchTerm = !term || a.nombre?.toLowerCase().includes(term) || a.nombre_accion?.toLowerCase().includes(term);
                                                            return matchDim && matchTerm;
                                                        })
                                                        .map(act => {
                                                            const isSelected = reviewForm.id_actividad === act.id;
                                                            return (
                                                                <div
                                                                    key={act.id}
                                                                    className={`p-3 text-xs transition-colors hover:bg-amber-50/60 cursor-pointer flex items-start justify-between gap-2 ${
                                                                        isSelected ? 'bg-amber-100/50' : ''
                                                                    }`}
                                                                    onClick={() => {
                                                                        setReviewForm(p => ({ ...p, id_actividad: act.id }));
                                                                        setPmeSearchTerm('');
                                                                        setPmeSearchOpen(false);
                                                                    }}
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-1.5 mb-1">
                                                                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-extrabold uppercase">
                                                                                {act.dimension || 'Sin Dimensión'}
                                                                            </span>
                                                                            {act.nombre_accion && (
                                                                                <span className="text-[10px] text-gray-500 font-medium truncate">
                                                                                    Acción: {act.nombre_accion}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <p className="font-bold text-gray-900 text-xs leading-snug">
                                                                            {act.nombre}
                                                                        </p>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setActividadDetalleModal(act);
                                                                        }}
                                                                        className="p-1 rounded-lg text-amber-700 hover:bg-amber-200/50"
                                                                        title="Ver detalle"
                                                                    >
                                                                        <Eye size={14} />
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    {pmeActividades.filter(a => {
                                                        const matchDim = dimensionFiltro === 'TODAS' || a.dimension?.toLowerCase() === dimensionFiltro.toLowerCase();
                                                        const term = pmeSearchTerm.toLowerCase();
                                                        return matchDim && (!term || a.nombre?.toLowerCase().includes(term) || a.nombre_accion?.toLowerCase().includes(term));
                                                    }).length === 0 && (
                                                        <div className="p-4 text-center text-xs text-gray-400">
                                                            No se encontraron actividades PME con el filtro aplicado.
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    {reviewForm.id_actividad && (
                                        <p className="text-[11px] text-amber-800 font-semibold flex items-center gap-1 mt-1">
                                            <Check size={13} className="text-green-600" />
                                            Actividad seleccionada: <span className="underline">{pmeActividades.find(a => a.id === reviewForm.id_actividad)?.nombre || selectedPendingResource.actividad_nombre}</span>
                                        </p>
                                    )}
                                </div>

                                {/* Justificación / Motivo de Compra (Solo lectura / Label) */}
                                <div className="md:col-span-5 space-y-1.5">
                                    <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                                        Justificación / Motivo de Compra
                                    </span>
                                    <div className="w-full px-3.5 py-2.5 bg-white/90 border border-amber-200/90 rounded-xl text-xs font-semibold text-gray-800 shadow-2xs min-h-[72px] flex items-center italic">
                                        "{selectedPendingResource.motivo || selectedPendingResource.descripcion_solicitud || 'Sin justificación registrada'}"
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* COLUMNA IZQ: Datos del recurso (editables) */}
                            <div className="space-y-4">
                                <h5 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-100 pb-2">2. Verificar y Editar Datos del Catálogo</h5>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nombre del Recurso *</label>
                                    <input
                                        type="text"
                                        value={reviewForm.nombre}
                                        onChange={e => setReviewForm(p => ({ ...p, nombre: e.target.value }))}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Descripción</label>
                                    <textarea
                                        rows={3}
                                        value={reviewForm.descripcion}
                                        onChange={e => setReviewForm(p => ({ ...p, descripcion: e.target.value }))}
                                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tipo</label>
                                        <div className="flex gap-2">
                                            {['BIEN', 'SERVICIO'].map(t => (
                                                <button key={t} type="button"
                                                    onClick={() => setReviewForm(p => ({ ...p, tipo: t }))}
                                                    className={`flex-1 py-2 rounded-xl border text-[10px] font-bold transition-all ${reviewForm.tipo === t ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                                >{t}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Formato / Unidad</label>
                                        <input
                                            type="text"
                                            value={reviewForm.formato}
                                            onChange={e => setReviewForm(p => ({ ...p, formato: e.target.value }))}
                                            placeholder="ej: Unidad, Caja..."
                                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Categoría *</label>
                                    <div className="relative">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={catSearchReview}
                                                onChange={e => { setCatSearchReview(e.target.value); setCatReviewOpen(true); }}
                                                onFocus={() => setCatReviewOpen(true)}
                                                onBlur={() => setTimeout(() => setCatReviewOpen(false), 150)}
                                                placeholder="Buscar categoría..."
                                                className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                            />
                                            <Search className="absolute left-3 top-3 text-gray-400" size={14} />
                                        </div>
                                        {catReviewOpen && (
                                            <div className="absolute z-40 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl">
                                                {categorias.filter(c => c.nombre.toLowerCase().includes(catSearchReview.toLowerCase())).map(c => (
                                                    <button key={c.id_cat_recurso} type="button"
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => { setReviewForm(p => ({ ...p, id_cat_recurso: c.id_cat_recurso })); setCatSearchReview(c.nombre); setCatReviewOpen(false); }}
                                                        className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors hover:bg-primary/5 ${reviewForm.id_cat_recurso === c.id_cat_recurso ? 'bg-primary/10 text-primary' : 'text-gray-700'}`}
                                                    >{c.nombre}</button>
                                                ))}
                                                {categorias.filter(c => c.nombre.toLowerCase().includes(catSearchReview.toLowerCase())).length === 0 && (
                                                    <div className="px-3 py-2.5 text-xs text-gray-400">Sin resultados</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Grupo de Recursos <span className="normal-case text-gray-300">(opcional)</span></label>
                                        <button
                                            type="button"
                                            disabled={asesorandoGrupo || !reviewForm.nombre.trim()}
                                            onClick={async () => {
                                                setAsesorandoGrupo(true);
                                                setGrupoSugerido(null);
                                                try {
                                                    const proveedorOverride = localStorage.getItem('ai_provider_override');
                                                    const res = await api.post('/ai/asesorar-grupo', {
                                                        nombre: reviewForm.nombre,
                                                        descripcion: reviewForm.descripcion,
                                                        proveedor_override: proveedorOverride,
                                                    });
                                                    if (res.data.id_grupo_recurso) {
                                                        setReviewForm(p => ({ ...p, id_grupo_recurso: res.data.id_grupo_recurso }));
                                                        setGrupoSugerido({ id_grupo_recurso: res.data.id_grupo_recurso, razon: res.data.razon || '' });
                                                    } else {
                                                        alert('La IA no encontró un grupo apropiado.');
                                                    }
                                                } catch (err: any) {
                                                    alert(err.response?.data?.detail || 'Error al consultar la IA');
                                                } finally {
                                                    setAsesorandoGrupo(false);
                                                }
                                            }}
                                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 disabled:opacity-40 transition-all"
                                        >
                                            {asesorandoGrupo ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                            ¿Sugerir grupo?
                                        </button>
                                    </div>
                                    <select
                                        value={reviewForm.id_grupo_recurso ?? ''}
                                        onChange={e => { setReviewForm(p => ({ ...p, id_grupo_recurso: e.target.value ? parseInt(e.target.value) : null })); setGrupoSugerido(null); }}
                                        className={`w-full px-3 py-2.5 border rounded-xl text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 transition-colors ${
                                            grupoSugerido && grupoSugerido.id_grupo_recurso === reviewForm.id_grupo_recurso
                                                ? 'bg-green-50 border-green-400 ring-green-200 focus:ring-green-200 focus:border-green-400'
                                                : 'bg-white border-gray-200 focus:ring-primary/20 focus:border-primary'
                                        }`}
                                    >
                                        <option value="">— Sin grupo asignado —</option>
                                        {grupos.map(g => (
                                            <option key={g.id_grupo_recurso} value={g.id_grupo_recurso}>{g.nombre}</option>
                                        ))}
                                    </select>
                                    {grupoSugerido && grupoSugerido.id_grupo_recurso === reviewForm.id_grupo_recurso && (
                                        <p className="text-[10px] text-green-700 font-medium flex items-center gap-1 mt-0.5">
                                            <Sparkles size={10} />
                                            Sugerido por IA{grupoSugerido.razon ? `: ${grupoSugerido.razon}` : ''}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* COLUMNA DER: Clasificación contable */}
                            <div className="space-y-4">
                                <h5 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-100 pb-2">2. Clasificación Contable</h5>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Destino de Uso</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[{value:'ESTUDIANTE',label:'Sala de Clases (Alumnos)'},{value:'FUNCIONARIO',label:'Oficina / Admin. (Funcionarios)'},{value:'PREMIO',label:'Premio / Beneficio'},{value:'MANTENCION',label:'Mantención / Servicio'}].map(d => (
                                            <button key={d.value} type="button"
                                                onClick={() => setReviewForm(p => ({ ...p, destino_uso: d.value }))}
                                                className={`py-2 px-2 rounded-xl border text-[10px] font-extrabold transition-all text-center ${reviewForm.destino_uso === d.value ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-gray-200 text-gray-500 hover:bg-gray-50 bg-white'}`}
                                            >{d.label}</button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Tipo de Transacción</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[{value:'COMPRA',label:'Compra'},{value:'ARRIENDO',label:'Arriendo'},{value:'MANTENCION',label:'Mantención'}].map(t => (
                                            <button key={t.value} type="button"
                                                onClick={() => setReviewForm(p => ({ ...p, tipo_transaccion: t.value }))}
                                                className={`py-2 rounded-xl border text-[10px] font-extrabold transition-all text-center ${reviewForm.tipo_transaccion === t.value ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-gray-200 text-gray-500 hover:bg-gray-50 bg-white'}`}
                                            >{t.label}</button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                                        <span>Subvención Financiadora <span className="normal-case text-gray-300">(hasta 5)</span></span>
                                        <span className="normal-case text-gray-300">{reviewForm.subvenciones.length}/5</span>
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[{value:'GENERAL',label:'Subv. General'},{value:'SEP',label:'SEP'},{value:'PIE',label:'PIE'},{value:'PRO_RETENCION',label:'Pro Retención'},{value:'MANTENIMIENTO',label:'Mantención'}].map(s => {
                                            const activa = reviewForm.subvenciones.includes(s.value);
                                            return (
                                            <button key={s.value} type="button"
                                                onClick={() => setReviewForm(p => {
                                                    if (p.subvenciones.includes(s.value)) return { ...p, subvenciones: p.subvenciones.filter(v => v !== s.value) };
                                                    if (p.subvenciones.length >= 5) return p;
                                                    return { ...p, subvenciones: [...p.subvenciones, s.value] };
                                                })}
                                                className={`py-2 rounded-xl border text-[10px] font-extrabold transition-all text-center ${activa ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-gray-200 text-gray-500 hover:bg-gray-50 bg-white'}`}
                                            >{s.label}</button>
                                        );})}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cuenta Contable *</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Search className="h-3.5 w-3.5 text-gray-400" />
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Buscar por código, nombre, característica..."
                                            value={accountSearchInModal}
                                            onChange={e => { setAccountSearchInModal(e.target.value); setExpandedAccountCodigo(null); }}
                                            className="block w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary text-gray-900 font-medium"
                                        />
                                    </div>
                                    <div className="border border-gray-100 rounded-xl overflow-y-auto max-h-[180px] bg-white">
                                        {accounts.filter(a => {
                                            const q = accountSearchInModal.toLowerCase();
                                            if (!q) return true;
                                            const ejemplos = Array.isArray(a.ejemplos_compra) ? a.ejemplos_compra.join(' ') : '';
                                            return (
                                                a.codigo.toLowerCase().includes(q) ||
                                                a.nombre.toLowerCase().includes(q) ||
                                                (a.grupo || '').toLowerCase().includes(q) ||
                                                (a.caracteristicas || '').toLowerCase().includes(q) ||
                                                ejemplos.toLowerCase().includes(q)
                                            );
                                        }).map(acc => {
                                            const isSelected = reviewForm.codigo_cuenta === acc.codigo;
                                            const isExpanded = expandedAccountCodigo === acc.codigo;
                                            const isAISuggested = aiSuggestedCode === acc.codigo;
                                            return (
                                                <div key={acc.codigo} className={`border-b border-gray-50 last:border-none ${isSelected ? 'bg-blue-50' : ''}`}>
                                                    <div className="flex items-center pr-1">
                                                        <button type="button"
                                                            onClick={() => { setReviewForm(p => ({ ...p, codigo_cuenta: acc.codigo })); }}
                                                            className={`flex-1 text-left px-3 py-2 flex items-center gap-2 transition-colors ${isSelected ? 'text-blue-900' : 'hover:bg-gray-50 text-gray-700'}`}
                                                        >
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[11px] font-bold font-mono">{acc.codigo}</span>
                                                                    {isAISuggested && <span className="text-[9px] bg-violet-100 text-violet-600 px-1 rounded font-bold">IA</span>}
                                                                </div>
                                                                <span className="text-[10px] truncate max-w-[160px]">{acc.nombre}</span>
                                                            </div>
                                                            {isSelected && <Check size={13} className="text-blue-600 shrink-0 ml-auto mr-1" />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedAccountCodigo(isExpanded ? null : acc.codigo)}
                                                            title="Ver descripción"
                                                            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                                                        >
                                                            {isExpanded ? <ChevronUp size={13} /> : <Info size={13} />}
                                                        </button>
                                                    </div>
                                                    {isExpanded && (
                                                        <div className="mx-2 mb-2 px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl space-y-2 text-[10px] text-gray-600">
                                                            {acc.caracteristicas && (
                                                                <div>
                                                                    <p className="font-bold text-gray-500 uppercase text-[9px] tracking-wider mb-0.5">Características</p>
                                                                    <p className="leading-relaxed">{acc.caracteristicas}</p>
                                                                </div>
                                                            )}
                                                            {acc.diferenciacion_publico && (
                                                                <div>
                                                                    <p className="font-bold text-gray-500 uppercase text-[9px] tracking-wider mb-0.5">Diferenciación</p>
                                                                    <p className="leading-relaxed">{acc.diferenciacion_publico}</p>
                                                                </div>
                                                            )}
                                                            {Array.isArray(acc.ejemplos_compra) && acc.ejemplos_compra.length > 0 && (
                                                                <div>
                                                                    <p className="font-bold text-gray-500 uppercase text-[9px] tracking-wider mb-0.5">Ejemplos</p>
                                                                    <ul className="space-y-0.5">
                                                                        {acc.ejemplos_compra.map((ej: string, i: number) => (
                                                                            <li key={i} className="flex gap-1"><span className="text-primary font-bold">·</span>{ej}</li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            )}
                                                            {acc.advertencias_sistema && acc.advertencias_sistema.length > 0 && (
                                                                <div className="flex gap-1.5 items-start pt-1 border-t border-amber-100 bg-amber-50/60 -mx-3 -mb-2.5 px-3 pb-2.5 rounded-b-xl">
                                                                    <AlertCircle size={11} className="text-amber-500 shrink-0 mt-0.5" />
                                                                    <p className="text-amber-700 font-semibold">{Array.isArray(acc.advertencias_sistema) ? acc.advertencias_sistema.join(' · ') : acc.advertencias_sistema}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {reviewForm.codigo_cuenta && (
                                        <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
                                            <p className="text-[9px] font-bold text-blue-400 uppercase">Cuenta seleccionada</p>
                                            <p className="text-[11px] font-extrabold text-blue-900">{reviewForm.codigo_cuenta} – {accounts.find(a => a.codigo === reviewForm.codigo_cuenta)?.nombre}</p>
                                        </div>
                                    )}
                                    {/* Tabla de códigos agregados desde IA */}
                                    {codigosSeleccionados.length > 0 && (
                                        <div className="mt-3 space-y-1.5">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cuentas agregadas por destino</p>
                                            <div className="rounded-xl border border-gray-100 overflow-hidden">
                                                <table className="w-full text-[11px]">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th className="text-left px-3 py-2 font-bold text-gray-500">Destino</th>
                                                            <th className="text-left px-3 py-2 font-bold text-gray-500">Código</th>
                                                            <th className="text-left px-3 py-2 font-bold text-gray-500">Cuenta</th>
                                                            <th className="px-2 py-2"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {codigosSeleccionados.map((c, i) => (
                                                            <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                                                                <td className="px-3 py-2 font-semibold text-violet-700">{c.destino_label}</td>
                                                                <td className="px-3 py-2 font-extrabold text-primary">{c.codigo_cuenta}</td>
                                                                <td className="px-3 py-2 text-gray-700 truncate max-w-[140px]">{c.nombre_cuenta}</td>
                                                                <td className="px-2 py-2">
                                                                    <button type="button" onClick={() => setCodigosSeleccionados(prev => prev.filter((_, j) => j !== i))}
                                                                        className="text-red-400 hover:text-red-600 transition-colors">
                                                                        <X size={13} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal asesoría cuenta contable */}
                        {mostrarAsesoria && asesoriaReview && asesoriaReview.sugerencias.length > 0 && (
                            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-6 animate-in fade-in duration-150">
                                <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col animate-in zoom-in-95 duration-150">
                                    <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 text-base">✨</div>
                                            <div>
                                                <p className="text-[13px] font-bold text-gray-900">Asesoría de Cuenta Contable</p>
                                                <p className="text-[10px] text-violet-500 font-semibold">{asesoriaReview.proveedor} · {asesoriaReview.modelo.split('/').pop()?.split(':')[0]}</p>
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => setMostrarAsesoria(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-gray-700">
                                            <X size={15} />
                                        </button>
                                    </div>
                                    <div className="px-6 py-5 space-y-3">
                                        <p className="text-[11px] text-gray-500 font-medium">
                                            La IA sugiere la cuenta contable más adecuada según el destino del gasto. Haz clic en <b>Usar</b> para aplicar la cuenta y el destino al formulario.
                                        </p>
                                        <ul className="space-y-2">
                                            {asesoriaReview.sugerencias.map((sug) => (
                                                <li key={sug.destino} className="flex items-start gap-3 bg-violet-50/50 rounded-2xl px-4 py-3 border border-violet-100">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="text-[10px] font-black text-violet-700 uppercase tracking-wider">{sug.destino_label}</span>
                                                        </div>
                                                        <p className="text-[13px] font-bold text-gray-800">
                                                            <span className="text-primary mr-1.5">{sug.codigo_cuenta}</span>{sug.nombre_cuenta}
                                                        </p>
                                                        <p className="text-[10px] text-gray-500 font-medium leading-relaxed mt-0.5">{sug.razon}</p>
                                                        {sug.subvenciones_habilitadas && sug.subvenciones_habilitadas.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                                {sug.subvenciones_habilitadas.map(sv => (
                                                                    <span key={sv.codigo} title={sv.critico ? 'Fiscalización crítica (punto rojo)' : 'Subvención habilitada'}
                                                                        className={`px-1.5 py-0.5 rounded text-[8px] font-bold inline-flex items-center gap-1 ${sv.critico ? 'bg-red-100 text-red-700' : 'bg-violet-100 text-violet-700'}`}>
                                                                        {sv.critico && <span className="h-1 w-1 rounded-full bg-red-500 animate-pulse" />}
                                                                        {sv.codigo}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const yaExiste = codigosSeleccionados.some(c => c.destino === sug.destino && c.codigo_cuenta === sug.codigo_cuenta);
                                                            if (!yaExiste) {
                                                                setCodigosSeleccionados(prev => [...prev, {
                                                                    destino: sug.destino,
                                                                    destino_label: sug.destino_label,
                                                                    codigo_cuenta: sug.codigo_cuenta,
                                                                    nombre_cuenta: sug.nombre_cuenta,
                                                                    subvencion: sug.subvenciones_habilitadas?.[0]?.codigo || reviewForm.subvenciones[0] || 'GENERAL',
                                                                }]);
                                                            }
                                                            // Alojar las subvenciones habilitadas de la sugerencia en "Subvención Financiadora" (máx 5)
                                                            const nuevas = (sug.subvenciones_habilitadas || []).map(sv => sv.codigo);
                                                            if (nuevas.length > 0) {
                                                                setReviewForm(p => {
                                                                    const merged = [...p.subvenciones];
                                                                    for (const v of nuevas) {
                                                                        if (!merged.includes(v) && merged.length < 5) merged.push(v);
                                                                    }
                                                                    return { ...p, subvenciones: merged };
                                                                });
                                                            }
                                                        }}
                                                        className="shrink-0 w-8 h-8 rounded-xl bg-violet-600 text-white text-base font-black hover:bg-violet-700 transition-all active:scale-95 self-center flex items-center justify-center"
                                                        title="Agregar a la selección"
                                                    >+</button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="px-6 pb-5 flex justify-end">
                                        <button type="button" onClick={() => setMostrarAsesoria(false)}
                                            className="px-6 py-2.5 rounded-xl bg-violet-600 text-white text-[13px] font-bold hover:bg-violet-700 transition-all active:scale-95">
                                            Entendido
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="border-t border-gray-100 pt-4 flex justify-end gap-3 bg-gray-50/20 -mx-6 -mb-6 p-6">
                            <button type="button"
                                onClick={() => { setIsReviewModalOpen(false); setSelectedPendingResource(null); }}
                                className="px-6 py-3 font-bold text-gray-400 hover:text-gray-900 transition-colors text-xs"
                            >Cancelar</button>
                            {/* TEST: Ver JSON */}
                            <button type="button"
                                onClick={async () => {
                                    const snapshot = { reviewForm, selectedPendingResource };
                                    const texto = JSON.stringify(snapshot, null, 2);
                                    console.log('[DEBUG REVIEW]', texto);
                                    try {
                                        await navigator.clipboard.writeText(texto);
                                        setJsonCopiado(true);
                                        setTimeout(() => setJsonCopiado(false), 1500);
                                    } catch {
                                        alert('No se pudo copiar al portapapeles.');
                                    }
                                }}
                                className="px-4 py-3 rounded-xl font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-all text-xs flex items-center gap-1.5"
                            >{jsonCopiado ? '✅ Copiado' : '📋 Copiar JSON'}</button>
                            {/* Asesorar con IA (Cuenta Contable + Grupo de Recursos si no está definido) */}
                            <button type="button"
                                disabled={asesorandoReview || !reviewForm.nombre.trim()}
                                onClick={async () => {
                                    setAsesorandoReview(true);
                                    setAsesoriaReview(null);
                                    try {
                                        const proveedorOverride = localStorage.getItem('ai_provider_override');
                                        const necesitaGrupo = !reviewForm.id_grupo_recurso;
                                        if (necesitaGrupo) {
                                            setGrupoSugerido(null);
                                        }

                                        const promesaGrupo = necesitaGrupo
                                            ? api.post('/ai/asesorar-grupo', {
                                                nombre: reviewForm.nombre,
                                                descripcion: reviewForm.descripcion,
                                                proveedor_override: proveedorOverride,
                                            }).catch(err => {
                                                console.warn('Error al asesorar grupo:', err);
                                                return null;
                                            })
                                            : Promise.resolve(null);

                                        const [resCuenta, resGrupo] = await Promise.all([
                                            api.post('/ai/asesorar-cuenta', {
                                                nombre: reviewForm.nombre,
                                                descripcion: reviewForm.descripcion,
                                                id_cat_recurso: reviewForm.id_cat_recurso,
                                                destino_uso: reviewForm.destino_uso,
                                                proveedor_override: proveedorOverride,
                                            }),
                                            promesaGrupo
                                        ]);

                                        if (resCuenta?.data) {
                                            setAsesoriaReview(resCuenta.data);
                                            setMostrarAsesoria(true);
                                        }
                                        if (resGrupo?.data?.id_grupo_recurso) {
                                            setReviewForm(p => ({ ...p, id_grupo_recurso: resGrupo.data.id_grupo_recurso }));
                                            setGrupoSugerido({ id_grupo_recurso: resGrupo.data.id_grupo_recurso, razon: resGrupo.data.razon || '' });
                                        }
                                    } catch (err: any) {
                                        alert(err.response?.data?.detail || 'Error al consultar la IA');
                                    } finally {
                                        setAsesorandoReview(false);
                                    }
                                }}
                                className="px-4 py-3 rounded-xl font-bold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-all text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {asesorandoReview ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {asesoriaReview ? 'Volver a asesorar' : 'Asesorar'}
                            </button>
                            {/* Mostrar la asesoría ya generada sin gastar tokens */}
                            {asesoriaReview && !mostrarAsesoria && (
                                <button type="button"
                                    onClick={() => setMostrarAsesoria(true)}
                                    className="px-4 py-3 rounded-xl font-bold text-violet-700 bg-white border border-violet-200 hover:bg-violet-50 transition-all text-xs flex items-center gap-1.5"
                                >
                                    <Sparkles size={14} />
                                    Ver asesoría
                                </button>
                            )}
                            <button type="button"
                                disabled={isSaving || !reviewForm.nombre.trim() || !reviewForm.id_cat_recurso || (!reviewForm.codigo_cuenta && codigosSeleccionados.length === 0)}
                                onClick={async () => {
                                    setIsSaving(true);
                                    try {
                                        // 1. Actualizar datos del recurso y del detalle de presupuesto (motivo, actividad PME)
                                        await api.put(`/presupuesto/recursos/${selectedPendingResource.id_recurso}`, {
                                            nombre: reviewForm.nombre,
                                            descripcion: reviewForm.descripcion,
                                            formato: reviewForm.formato,
                                            id_cat_recurso: reviewForm.id_cat_recurso,
                                            id_grupo_recurso: reviewForm.id_grupo_recurso,
                                            motivo: reviewForm.motivo,
                                            id_actividad: reviewForm.id_actividad
                                        });
                                        // 2. Aprobar y clasificar: se registra una fila por cada
                                        // (código × subvención). Opción B: el set completo de
                                        // "Subvención Financiadora" se aplica a cada código.
                                        const subs = reviewForm.subvenciones.length > 0 ? reviewForm.subvenciones : ['GENERAL'];

                                        // Pares (código, destino) a registrar: principal + los de la IA
                                        const pares: { codigo_cuenta: string; destino_uso: string }[] = [];
                                        if (reviewForm.codigo_cuenta) {
                                            pares.push({ codigo_cuenta: reviewForm.codigo_cuenta, destino_uso: reviewForm.destino_uso });
                                        }
                                        for (const c of codigosSeleccionados) {
                                            if (!pares.some(p => p.codigo_cuenta === c.codigo_cuenta && p.destino_uso === c.destino)) {
                                                pares.push({ codigo_cuenta: c.codigo_cuenta, destino_uso: c.destino });
                                            }
                                        }

                                        let res: any = { data: { detalles_actualizados: 0 } };
                                        let primera = true;
                                        for (const par of pares) {
                                            for (const sub of subs) {
                                                const payload = {
                                                    codigo_cuenta: par.codigo_cuenta,
                                                    destino_uso: par.destino_uso,
                                                    tipo_transaccion: reviewForm.tipo_transaccion,
                                                    subvencion: sub,
                                                };
                                                if (primera) {
                                                    res = await api.post(`/presupuesto/recursos/aprobar-clasificar/${selectedPendingResource.id_recurso}`, payload);
                                                    primera = false;
                                                } else {
                                                    await api.post(`/presupuesto/recursos/aprobar-clasificar/${selectedPendingResource.id_recurso}`, payload).catch(() => {});
                                                }
                                            }
                                        }
                                        setIsReviewModalOpen(false);
                                        setSelectedPendingResource(null);
                                        fetchPendingResources();
                                        alert(`Recurso aprobado y registrado en el catálogo. Se actualizaron ${res.data.detalles_actualizados ?? 0} detalles de presupuesto asociados.`);
                                    } catch (err: any) {
                                        alert(err.response?.data?.detail || 'Error al aprobar el recurso');
                                    } finally {
                                        setIsSaving(false);
                                    }
                                }}
                                className="px-8 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-95 transition-all text-xs flex items-center gap-1.5"
                            >
                                {isSaving && <Loader2 size={14} className="animate-spin" />}
                                <Check size={14} strokeWidth={3} />
                                Aprobar y Registrar en Catálogo
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* MODAL: APROBAR Y CLASIFICAR RECURSO */}
            <Modal
                isOpen={isApproveModalOpen}
                onClose={() => { setIsApproveModalOpen(false); setSelectedPendingResource(null); }}
                title="Clasificación Contable de Sugerencia"
                maxWidth="max-w-3xl"
            >
                {selectedPendingResource && (
                    <div className="space-y-6">
                        {/* Ficha del Recurso Solicitado */}
                        <div className="bg-gray-50/70 border border-gray-100 p-5 rounded-2xl">
                            <div className="flex justify-between items-start gap-4">
                                <div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Recurso Propuesto</span>
                                    <h4 className="text-lg font-black text-gray-900 leading-tight mt-0.5">{selectedPendingResource.nombre}</h4>
                                </div>
                                <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold border border-amber-100 uppercase">
                                    {selectedPendingResource.tipo}
                                </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200/50 text-xs">
                                <div>
                                    <span className="font-bold text-gray-400 block uppercase text-[10px]">Justificación de Necesidad:</span>
                                    <p className="text-gray-700 mt-1 font-medium leading-relaxed italic">"{selectedPendingResource.descripcion_solicitud}"</p>
                                </div>
                                <div>
                                    <span className="font-bold text-gray-400 block uppercase text-[10px]">Detalles de Origen:</span>
                                    <p className="text-gray-700 mt-1 font-semibold">Solicitante: <span className="text-primary font-bold">{selectedPendingResource.solicitante_nombre}</span></p>
                                    <p className="text-gray-700 mt-0.5 font-semibold">Categoría original: {selectedPendingResource.categoria_nombre}</p>
                                </div>
                            </div>
                        </div>

                        {/* Formulario de Clasificación */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Reglas de Contexto */}
                            <div className="space-y-4">
                                <h5 className="text-xs font-bold text-gray-500 uppercase tracking-widest">1. Parámetros de Contexto</h5>
                                
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Destino de Uso Principal</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { value: 'ESTUDIANTE', label: 'Sala de Clases (Alumnos)' },
                                            { value: 'FUNCIONARIO', label: 'Oficina / Admin. (Funcionarios)' },
                                            { value: 'PREMIO', label: 'Premio / Beneficio' },
                                            { value: 'MANTENCION', label: 'Mantención / Servicio' }
                                        ].map(d => (
                                            <button
                                                key={d.value}
                                                type="button"
                                                onClick={() => setApproveForm(prev => ({ ...prev, destino_uso: d.value }))}
                                                className={`py-2 px-2 rounded-xl border text-[11px] font-extrabold transition-all text-center ${
                                                    approveForm.destino_uso === d.value 
                                                    ? 'border-primary bg-primary/10 text-primary shadow-sm' 
                                                    : 'border-gray-200 text-gray-500 hover:bg-gray-100 bg-white'
                                                }`}
                                            >
                                                {d.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Tipo de Transacción</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { value: 'COMPRA', label: 'Compra' },
                                            { value: 'ARRIENDO', label: 'Arriendo' },
                                            { value: 'MANTENCION', label: 'Mantención' }
                                        ].map(t => (
                                            <button
                                                key={t.value}
                                                type="button"
                                                onClick={() => setApproveForm(prev => ({ ...prev, tipo_transaccion: t.value }))}
                                                className={`py-2 px-1 rounded-xl border text-[10px] font-extrabold transition-all text-center ${
                                                    approveForm.tipo_transaccion === t.value 
                                                    ? 'border-primary bg-primary/10 text-primary shadow-sm' 
                                                    : 'border-gray-200 text-gray-500 hover:bg-gray-100 bg-white'
                                                }`}
                                            >
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Subvención Financiadora</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { value: 'GENERAL', label: 'Subvención General' },
                                            { value: 'SEP', label: 'Subvención SEP' },
                                            { value: 'PIE', label: 'Subvención PIE' },
                                            { value: 'PRO_RETENCION', label: 'Pro Retención' }
                                        ].map(s => (
                                            <button
                                                key={s.value}
                                                type="button"
                                                onClick={() => setApproveForm(prev => ({ ...prev, subvencion: s.value }))}
                                                className={`py-2 px-2 rounded-xl border text-[10px] font-extrabold transition-all text-center ${
                                                    approveForm.subvencion === s.value 
                                                    ? 'border-primary bg-primary/10 text-primary shadow-sm' 
                                                    : 'border-gray-200 text-gray-500 hover:bg-gray-100 bg-white'
                                                }`}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Buscador y Selección de Cuentas */}
                            <div className="space-y-4 flex flex-col h-full min-h-[300px]">
                                <h5 className="text-xs font-bold text-gray-500 uppercase tracking-widest">2. Imputación Presupuestaria</h5>
                                
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search className="h-3.5 w-3.5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Buscar por código o nombre..."
                                        value={accountSearchInModal}
                                        onChange={(e) => setAccountSearchInModal(e.target.value)}
                                        className="block w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary text-gray-900 font-medium"
                                    />
                                </div>

                                <div className="border border-gray-100 rounded-xl overflow-y-auto max-h-[180px] custom-scrollbar flex-1 bg-white">
                                    {accounts
                                        .filter(acc => 
                                            acc.codigo.includes(accountSearchInModal) || 
                                            acc.nombre.toLowerCase().includes(accountSearchInModal.toLowerCase())
                                        )
                                        .map(acc => (
                                            <button
                                                key={acc.codigo}
                                                type="button"
                                                onClick={() => setApproveForm(prev => ({ ...prev, codigo_cuenta: acc.codigo }))}
                                                className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-none flex justify-between items-center transition-colors ${
                                                    approveForm.codigo_cuenta === acc.codigo 
                                                    ? 'bg-blue-50 text-blue-900' 
                                                    : 'hover:bg-gray-50 text-gray-700'
                                                }`}
                                            >
                                                <div className="flex flex-col pr-2">
                                                    <span className="text-[11px] font-bold">{acc.codigo}</span>
                                                    <span className="text-[10px] truncate max-w-[200px]">{acc.nombre}</span>
                                                </div>
                                                {approveForm.codigo_cuenta === acc.codigo && (
                                                    <Check size={14} className="text-blue-600 font-extrabold shrink-0" />
                                                )}
                                            </button>
                                        ))
                                    }
                                </div>

                                {approveForm.codigo_cuenta && (
                                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                        <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Cuenta Seleccionada</p>
                                        <p className="text-[11px] font-extrabold text-blue-900 leading-snug">
                                            {approveForm.codigo_cuenta} – {accounts.find(a => a.codigo === approveForm.codigo_cuenta)?.nombre}
                                        </p>
                                        {accounts.find(a => a.codigo === approveForm.codigo_cuenta)?.advertencias_sistema?.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-blue-200/50 space-y-1">
                                                {accounts.find(a => a.codigo === approveForm.codigo_cuenta).advertencias_sistema.map((adv: string, idx: number) => (
                                                    <p key={idx} className="text-[9px] text-amber-700 font-semibold flex items-start gap-1">
                                                        ⚠️ <span className="flex-1 leading-normal">{adv}</span>
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer del Modal */}
                        <div className="border-t border-gray-100 pt-4 flex justify-end gap-3 bg-gray-50/20 -mx-6 -mb-6 p-6">
                            <button 
                                type="button"
                                onClick={() => { setIsApproveModalOpen(false); setSelectedPendingResource(null); }} 
                                className="px-6 py-3 font-bold text-gray-400 hover:text-gray-900 transition-colors text-xs"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="button"
                                disabled={isSaving || !approveForm.codigo_cuenta}
                                onClick={async () => {
                                    setIsSaving(true);
                                    try {
                                        const res = await api.post(`/presupuesto/recursos/aprobar-clasificar/${selectedPendingResource.id_recurso}`, approveForm);
                                        setIsApproveModalOpen(false);
                                        setSelectedPendingResource(null);
                                        fetchPendingResources();
                                        alert(`Recurso aprobado y clasificado correctamente. Se actualizaron ${res.data.detalles_actualizados} detalles de presupuestos asociados de forma silenciosa.`);
                                    } catch (err: any) {
                                        console.error(err);
                                        alert(err.response?.data?.detail || "Error al clasificar y aprobar el recurso");
                                    } finally {
                                        setIsSaving(false);
                                    }
                                }}
                                className="px-10 py-3 bg-primary text-white rounded-xl font-bold shadow-xl shadow-primary/20 disabled:opacity-50 active:scale-95 transition-all text-xs flex items-center gap-1.5"
                            >
                                {isSaving && <Loader2 size={14} className="animate-spin" />}
                                Aprobar y Registrar Regla
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* MODAL: ASESORÍA Y APROBACIÓN MASIVA POR IA */}
            {isMasivaModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[250] p-4 sm:p-6 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/70 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-500/20">
                                    <Sparkles size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-gray-900">Asesoría y Clasificación Masiva con IA</h3>
                                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                                        Para cada insumo se muestran las cuentas contables sugeridas por destino. Marca los destinos que deseas agregar al catálogo.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsMasivaModalOpen(false)}
                                className="p-2 hover:bg-gray-200/60 rounded-xl transition-all text-gray-400 hover:text-gray-700"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            {masivaLoading ? (
                                <div className="py-20 flex flex-col items-center justify-center gap-3 text-gray-400 max-w-md mx-auto">
                                    <Loader2 className="animate-spin text-violet-600" size={36} />
                                    <p className="text-sm font-bold text-gray-800">
                                        Analizando y clasificando recursos con IA…
                                    </p>
                                    {masivaProgreso ? (
                                        <div className="w-full space-y-2 mt-2">
                                            <div className="flex justify-between text-xs font-semibold text-gray-600">
                                                <span>Lote {masivaProgreso.loteActual} de {masivaProgreso.totalLotes}</span>
                                                <span className="text-violet-700 font-bold">{Math.round((masivaProgreso.actual / masivaProgreso.total) * 100)}%</span>
                                            </div>
                                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                                                <div
                                                    className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full transition-all duration-300"
                                                    style={{ width: `${Math.max(5, Math.min(100, (masivaProgreso.actual / masivaProgreso.total) * 100))}%` }}
                                                />
                                            </div>
                                            <p className="text-[11px] text-center text-gray-500 font-medium">
                                                Procesando {masivaProgreso.actual} de {masivaProgreso.total} recursos sugeridos...
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-gray-400">Consultando catálogo oficial y manual de rendición SIE 2026.</p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {masivaItems.map((item: any, index: number) => {
                                        const sugs = item.sugerencias || [];
                                        const selCount = sugs.filter((s: any) => s.codigo_cuenta && masivaDestSeleccionados[`${item.id_recurso}:${s.destino}`]).length;
                                        return (
                                            <div key={item.id_recurso} className="rounded-2xl border border-gray-100 overflow-hidden shadow-2xs">
                                                {/* Cabecera del recurso */}
                                                <div className="bg-slate-50/80 px-5 py-3 flex items-center justify-between gap-4">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-7 h-7 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center text-[11px] font-black shrink-0">{index + 1}</div>
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold text-gray-900 truncate">{item.nombre}</p>
                                                            <p className="text-[10px] text-gray-500 italic truncate">{item.descripcion}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <select
                                                            value={item.id_cat_recurso}
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value);
                                                                setMasivaItems(prev => prev.map((it: any, idx: number) => idx === index ? { ...it, id_cat_recurso: val } : it));
                                                            }}
                                                            className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500 max-w-[140px]"
                                                        >
                                                            {categorias.map((c: any) => (
                                                                <option key={c.id_cat_recurso} value={c.id_cat_recurso}>{c.nombre}</option>
                                                            ))}
                                                        </select>
                                                        <select
                                                            value={item.id_grupo_recurso || ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value ? parseInt(e.target.value) : undefined;
                                                                setMasivaItems(prev => prev.map((it: any, idx: number) => idx === index ? { ...it, id_grupo_recurso: val } : it));
                                                            }}
                                                            className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500 max-w-[130px]"
                                                        >
                                                            <option value="">— Sin Grupo —</option>
                                                            {grupos.map((g: any) => (
                                                                <option key={g.id_grupo_recurso} value={g.id_grupo_recurso}>{g.nombre}</option>
                                                            ))}
                                                        </select>
                                                        <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-lg">{selCount} destino(s)</span>
                                                    </div>
                                                </div>

                                                {/* Sub-filas de sugerencias por destino */}
                                                <div className="divide-y divide-gray-50">
                                                    {sugs.length === 0 ? (
                                                        <div className="px-5 py-3 text-[11px] text-gray-400 italic">Sin sugerencias de la IA para este recurso.</div>
                                                    ) : (
                                                        sugs.map((sug: any) => {
                                                            const key = `${item.id_recurso}:${sug.destino}`;
                                                            const checked = !!masivaDestSeleccionados[key];
                                                            const isNull = !sug.codigo_cuenta;
                                                            const destColorMap: Record<string, string> = {
                                                                'ESTUDIANTE': 'bg-blue-50 text-blue-700 border-blue-200',
                                                                'FUNCIONARIO': 'bg-amber-50 text-amber-700 border-amber-200',
                                                                'PREMIO': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                                                'MANTENCION': 'bg-rose-50 text-rose-700 border-rose-200',
                                                            };
                                                            const destStyle = destColorMap[sug.destino] || 'bg-gray-50 text-gray-700 border-gray-200';

                                                            return (
                                                                <div key={key} className={`px-5 py-2.5 flex items-center gap-3 transition-colors ${checked ? 'bg-violet-50/30' : ''} ${isNull ? 'opacity-40' : 'hover:bg-slate-50/60'}`}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        disabled={isNull}
                                                                        onChange={(e) => {
                                                                            setMasivaDestSeleccionados(prev => ({ ...prev, [key]: e.target.checked }));
                                                                        }}
                                                                        className="w-3.5 h-3.5 accent-violet-600 rounded cursor-pointer disabled:cursor-not-allowed shrink-0"
                                                                    />
                                                                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border shrink-0 w-[90px] text-center ${destStyle}`}>
                                                                        {sug.destino_label || sug.destino}
                                                                    </span>
                                                                    {isNull ? (
                                                                        <span className="text-[11px] text-gray-400 italic">Sin cuenta aplicable</span>
                                                                    ) : (
                                                                        <>
                                                                            <span className="text-[12px] font-bold text-violet-800 shrink-0">{sug.codigo_cuenta}</span>
                                                                            <span className="text-[11px] text-gray-700 font-medium truncate flex-1">{sug.nombre_cuenta}</span>
                                                                            <span className="text-[9px] text-gray-400 font-medium shrink-0 max-w-[150px] truncate">{sug.razon}</span>
                                                                        </>
                                                                    )}
                                                                    {sug.subvenciones_habilitadas && sug.subvenciones_habilitadas.length > 0 && (
                                                                        <div className="flex gap-0.5 shrink-0">
                                                                            {sug.subvenciones_habilitadas.map((sv: any) => (
                                                                                <span key={sv.codigo} title={sv.critico ? 'Fiscalización crítica' : 'Subvención habilitada'}
                                                                                    className={`px-1 py-0.5 rounded text-[7px] font-bold ${sv.critico ? 'bg-red-100 text-red-700' : 'bg-violet-100 text-violet-700'}`}>
                                                                                    {sv.codigo}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer Acciones */}
                        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-slate-50/70 shrink-0">
                            <span className="text-xs font-semibold text-gray-500">
                                {Object.values(masivaDestSeleccionados).filter(Boolean).length} destino(s) seleccionado(s) en {masivaItems.filter((i: any) => (i.sugerencias || []).some((s: any) => s.codigo_cuenta && masivaDestSeleccionados[`${i.id_recurso}:${s.destino}`])).length} recurso(s)
                            </span>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsMasivaModalOpen(false)}
                                    className="px-5 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={masivaAprobando || Object.values(masivaDestSeleccionados).filter(Boolean).length === 0}
                                    onClick={async () => {
                                        setMasivaAprobando(true);
                                        // Construir payload: por cada recurso que tenga al menos 1 destino seleccionado
                                        const itemsPayload = masivaItems
                                            .map((item: any) => {
                                                const codigos_destino = (item.sugerencias || [])
                                                    .filter((sug: any) => sug.codigo_cuenta && masivaDestSeleccionados[`${item.id_recurso}:${sug.destino}`])
                                                    .map((sug: any) => ({
                                                        destino: sug.destino,
                                                        codigo_cuenta: sug.codigo_cuenta,
                                                        nombre_cuenta: sug.nombre_cuenta,
                                                        subvencion: sug.subvenciones_habilitadas?.[0]?.codigo || 'GENERAL',
                                                    }));
                                                if (codigos_destino.length === 0) return null;
                                                return {
                                                    id_recurso: item.id_recurso,
                                                    nombre: item.nombre,
                                                    descripcion: item.descripcion,
                                                    id_cat_recurso: item.id_cat_recurso,
                                                    id_grupo_recurso: item.id_grupo_recurso,
                                                    codigos_destino,
                                                };
                                            })
                                            .filter(Boolean);

                                        try {
                                            const res = await api.post('/presupuesto/recursos/aprobar-clasificar-lote', { items: itemsPayload });
                                            setIsMasivaModalOpen(false);
                                            fetchPendingResources();
                                            alert(`¡Aprobación Masiva Completada!\n\n` +
                                                `✅ Recursos Aprobados: ${res.data?.aprobados || 0}\n` +
                                                `📋 Mapeos Contables Creados: ${res.data?.mapeos_creados || 0}\n` +
                                                `🔄 Detalles Actualizados: ${res.data?.detalles_actualizados || 0}`);
                                        } catch (err: any) {
                                            alert(err.response?.data?.detail || 'Error al aprobar recursos en lote');
                                        } finally {
                                            setMasivaAprobando(false);
                                        }
                                    }}
                                    className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-indigo-500/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {masivaAprobando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                                    Aprobar y Registrar {masivaItems.filter((i: any) => (i.sugerencias || []).some((s: any) => s.codigo_cuenta && masivaDestSeleccionados[`${i.id_recurso}:${s.destino}`])).length} Recurso(s)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: DETALLE DE ACTIVIDAD PME */}
            <Modal
                isOpen={!!actividadDetalleModal}
                onClose={() => setActividadDetalleModal(null)}
                title="Detalle de Actividad PME"
                maxWidth="max-w-lg"
            >
                {actividadDetalleModal && (
                    <div className="space-y-4 text-xs">
                        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 font-extrabold text-[10px] uppercase">
                                    {actividadDetalleModal.dimension || 'Sin Dimensión'}
                                </span>
                                {actividadDetalleModal.ano_pme && (
                                    <span className="text-[10px] text-amber-800 font-semibold">
                                        PME {actividadDetalleModal.ano_pme}
                                    </span>
                                )}
                            </div>
                            <h4 className="text-sm font-black text-gray-900 leading-snug">
                                {actividadDetalleModal.nombre || actividadDetalleModal.nombre_actividad}
                            </h4>
                            {actividadDetalleModal.nombre_accion && (
                                <p className="text-gray-600 font-medium">
                                    <strong className="text-gray-800">Acción:</strong> {actividadDetalleModal.nombre_accion}
                                </p>
                            )}
                        </div>

                        {actividadDetalleModal.descripcion && (
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                    Descripción de la Actividad
                                </span>
                                <p className="text-gray-700 bg-gray-50 p-3 rounded-xl leading-relaxed">
                                    {actividadDetalleModal.descripcion}
                                </p>
                            </div>
                        )}

                        {actividadDetalleModal.lista_recursos && (
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                    Recursos Asociados en el PME
                                </span>
                                <p className="text-gray-700 bg-gray-50 p-3 rounded-xl leading-relaxed">
                                    {actividadDetalleModal.lista_recursos}
                                </p>
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setActividadDetalleModal(null)}
                                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}