'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import { Search, Plus, Loader2, Edit, Trash2, FileSpreadsheet, Download, FormInput, Columns2, FileBadge2, Coins, Check, X, Star, AlertTriangle } from 'lucide-react';
import { PME, Accion, Actividad, ActividadCodigoItem } from '@/lib/types';
import Modal from '@/components/ui/Modal';
import UploadExcel from '@/components/ui/UploadExcel';
import CertificadoActividad from '@/components/pme/CertificadoActividad';
import * as XLSX from 'xlsx';

type ViewMode = 'form' | 'import';

const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '-';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(value);
};

// Cuenta los recursos asociados a una actividad (lista_recursos es texto separado por comas)
const contarRecursos = (lista: string | undefined | null) => {
    if (!lista) return 0;
    return lista.split(',').map(s => s.trim()).filter(Boolean).length;
};

const ACTIVIDAD_COLUMNS = ['id_accion', 'nombre_actividad', 'descripcion', 'dimension', 'subdimension', 'responsable', 'accion_nombre', 'medios_verificacion', 'lista_recursos', 'costo_estimado'];
const ACTIVIDAD_EXAMPLE = {
    id_accion: '1',
    nombre_actividad: 'Taller de matemáticas básico',
    descripcion: 'Reforzamiento de operaciones básicas',
    dimension: 'Pedagógica',
    subdimension: 'Matemáticas',
    responsable: 'Juan Pérez',
    accion_nombre: 'Reforzamiento Matemático 4to Básico',
    medios_verificacion: 'Lista de asistencia, fotos',
    lista_recursos: 'Proyector, papel, marcadores',
    costo_estimado: '150000'
};

type ColumnKey = 'nombre_actividad' | 'codigo_contable' | 'accion' | 'dimension' | 'subdimension' | 'responsable' | 'descripcion' | 'costo' | 'colegio';

const COLUMN_OPTIONS: { key: ColumnKey; label: string }[] = [
    { key: 'nombre_actividad', label: 'Actividad' },
    { key: 'codigo_contable', label: 'Código Contable' },
    { key: 'accion', label: 'Acción' },
    { key: 'colegio', label: 'Colegio' },
    { key: 'dimension', label: 'Dimensión' },
    { key: 'subdimension', label: 'Subdimensión' },
    { key: 'responsable', label: 'Responsable' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'costo', label: 'Costo' },
];

const DEFAULT_COLUMNS: ColumnKey[] = ['nombre_actividad', 'codigo_contable', 'accion', 'colegio', 'dimension', 'subdimension', 'responsable', 'descripcion', 'costo'];

export const getColegioColor = (colegioStr?: string | null): 'portales' | 'macaya' | 'default' => {
    if (!colegioStr) return 'default';
    const s = colegioStr.toLowerCase();
    if (s.includes('diego') || s.includes('portales')) return 'portales';
    if (s.includes('macaya')) return 'macaya';
    return 'default';
};

export default function ActividadesPage() {
    const { user } = useAuth();
    const [pmes, setPmes] = useState<PME[]>([]);
    const [acciones, setAcciones] = useState<Accion[]>([]);
    const [actividades, setActividades] = useState<Actividad[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPme, setSelectedPme] = useState<number | ''>('');
    const [selectedAccion, setSelectedAccion] = useState<number | ''>('');
    const [allAcciones, setAllAcciones] = useState<Accion[]>([]);
    const [modalPmeFilter, setModalPmeFilter] = useState<number | ''>('');
    
    const [viewMode, setViewMode] = useState<ViewMode>('form');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingActividad, setEditingActividad] = useState<Actividad | null>(null);
    const [deletingActividad, setDeletingActividad] = useState<Actividad | null>(null);
    const [certificadoActividad, setCertificadoActividad] = useState<Actividad | null>(null);
    const [formData, setFormData] = useState({
        nombre_actividad: '',
        descripcion: '',
        dimension: '',
        subdimension: '',
        responsable: '',
        id_accion: '',
        medios_verificacion: '',
        lista_recursos: '',
        costo_estimado: ''
    });
    const [recursos, setRecursos] = useState<any[]>([]);
    const [searchRecurso, setSearchRecurso] = useState('');

    // Códigos contables en el formulario (1 principal + N secundarios)
    const [formCodigos, setFormCodigos] = useState<{
        codigo_cuenta: string;
        nombre_cuenta?: string;
        es_principal: boolean;
        id_subvencion?: number;
    }[]>([]);
    const [searchCuentaForm, setSearchCuentaForm] = useState('');
    const [showCuentaDropdown, setShowCuentaDropdown] = useState(false);

    // Código contable por actividad (modal rápido)
    const [codigoActividad, setCodigoActividad] = useState<Actividad | null>(null);
    const [cuentasActivas, setCuentasActivas] = useState<any[]>([]);
    const [subvencionesActivas, setSubvencionesActivas] = useState<{ id_subvencion: number; nombre_corto: string; nombre_completo: string }[]>([]);
    const [loadingCodigo, setLoadingCodigo] = useState(false);
    const [savingCodigo, setSavingCodigo] = useState(false);
    const [codigoExistente, setCodigoExistente] = useState(false);
    const [cuentaSearch, setCuentaSearch] = useState('');
    const [codigoForm, setCodigoForm] = useState({
        codigo_cuenta: '',
        id_subvencion: '',
        comentario: '',
        estado: 'Pendiente'
    });

    const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('actividades_columns');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (!parsed.includes('codigo_contable')) {
                        parsed.splice(1, 0, 'codigo_contable');
                        localStorage.setItem('actividades_columns', JSON.stringify(parsed));
                    }
                    return parsed;
                } catch {
                    return DEFAULT_COLUMNS;
                }
            }
        }
        return DEFAULT_COLUMNS;
    });
    const [showColumnMenu, setShowColumnMenu] = useState(false);

    const toggleColumn = (column: ColumnKey) => {
        const newColumns = visibleColumns.includes(column)
            ? visibleColumns.filter(c => c !== column)
            : [...visibleColumns, column];
        setVisibleColumns(newColumns);
        localStorage.setItem('actividades_columns', JSON.stringify(newColumns));
    };

    const loadCuentas = useCallback(async () => {
        try {
            const res = await api.get('/catalogos/cuentas');
            setCuentasActivas((res.data || []).filter((c: any) => !c.oculta));
        } catch (error) {
            console.error('Error cargando cuentas:', error);
        }
    }, []);

    useEffect(() => {
        loadCuentas();
    }, [loadCuentas]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.column-menu')) {
                setShowColumnMenu(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const canEdit = user?.rol?.codigo === 'ADM' || user?.rol?.codigo === 'DIR' || user?.rol?.codigo === 'GERENTE';

    const fetchAllAcciones = useCallback(async () => {
        try {
            const res = await api.get('/pme/acciones');
            setAllAcciones(res.data || []);
        } catch (error) {
            console.error('Error fetching all acciones:', error);
        }
    }, []);

    const fetchPmes = useCallback(async () => {
        try {
            const res = await api.get('/pme');
            setPmes(res.data);
        } catch (error) {
            console.error('Error fetching pmes:', error);
        }
    }, []);

    const fetchAcciones = useCallback(async () => {
        if (!selectedPme) {
            setAcciones([]);
            return;
        }
        try {
            const res = await api.get(`/pme/${selectedPme}/acciones`);
            setAcciones(res.data);
        } catch (error) {
            console.error('Error fetching acciones:', error);
        }
    }, [selectedPme]);

    const fetchActividades = useCallback(async () => {
        setLoading(true);
        try {
            let url = '/pme/actividades';
            const params: string[] = [];
            if (selectedPme) params.push(`id_pme=${selectedPme}`);
            if (selectedAccion) params.push(`id_accion=${selectedAccion}`);
            if (params.length > 0) url += '?' + params.join('&');
            
            const res = await api.get(url);
            setActividades(res.data);
        } catch (error) {
            console.error('Error fetching actividades:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedPme, selectedAccion]);

    useEffect(() => {
        fetchPmes();
        fetchAllAcciones();
    }, [fetchPmes, fetchAllAcciones]);

    useEffect(() => {
        fetchAcciones();
        setSelectedAccion('');
    }, [fetchAcciones]);

    useEffect(() => {
        fetchActividades();
    }, [fetchActividades]);

    const handleAddCodigoToForm = (cuenta: any) => {
        if (formCodigos.some(c => c.codigo_cuenta === cuenta.codigo)) {
            return;
        }
        const isFirst = formCodigos.length === 0;
        setFormCodigos(prev => [
            ...prev,
            {
                codigo_cuenta: cuenta.codigo,
                nombre_cuenta: cuenta.nombre,
                es_principal: isFirst
            }
        ]);
        setSearchCuentaForm('');
        setShowCuentaDropdown(false);
    };

    const handleSetPrincipal = (codigo_cuenta: string) => {
        setFormCodigos(prev =>
            prev.map(c => ({
                ...c,
                es_principal: c.codigo_cuenta === codigo_cuenta
            }))
        );
    };

    const handleRemoveCodigo = (codigo_cuenta: string) => {
        setFormCodigos(prev => {
            const next = prev.filter(c => c.codigo_cuenta !== codigo_cuenta);
            if (next.length > 0 && !next.some(c => c.es_principal)) {
                next[0].es_principal = true;
            }
            return next;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const payload = {
                nombre_actividad: formData.nombre_actividad,
                descripcion: formData.descripcion || null,
                dimension: formData.dimension || null,
                subdimension: formData.subdimension || null,
                responsable: formData.responsable || null,
                medios_verificacion: formData.medios_verificacion || null,
                lista_recursos: formData.lista_recursos || null,
                costo_estimado: formData.costo_estimado ? parseFloat(formData.costo_estimado) : null,
                id_accion: formData.id_accion ? parseInt(formData.id_accion) : undefined,
                codigos_contables: formCodigos
            };

            if (editingActividad) {
                await api.put(`/pme/actividades/${editingActividad.id_actividad}`, payload);
            } else {
                await api.post(`/pme/acciones/${formData.id_accion}/actividades`, payload);
            }
            setIsModalOpen(false);
            resetForm();
            fetchActividades();
        } catch (error) {
            console.error(editingActividad ? 'Error updating actividad:' : 'Error creating actividad:', error);
            alert('Error al guardar la actividad');
        } finally {
            setIsSaving(false);
        }
    };

    const handleImport = async (data: any[]) => {
        setIsSaving(true);
        try {
            const mappedData = data.map(row => ({
                id_accion: parseInt(row.id_accion),
                nombre_actividad: row.nombre_actividad,
                descripcion: row.descripcion || null,
                dimension: row.dimension || null,
                subdimension: row.subdimension || null,
                responsable: row.responsable || null,
                medios_verificacion: row.medios_verificacion || null,
                lista_recursos: row.lista_recursos || null,
                costo_estimado: row.costo_estimado ? parseFloat(row.costo_estimado) : null
            }));
            
            const response = await api.post('/pme/actividades/importar', mappedData);
            alert(`Importación completada: ${response.data.creados} creados, ${response.data.errores.length} errores`);
            setIsImportModalOpen(false);
            fetchActividades();
        } catch (error) {
            console.error('Error importing:', error);
            alert('Error al importar actividades');
        } finally {
            setIsSaving(false);
        }
    };

    const handleExport = () => {
        if (actividades.length === 0) {
            alert('No hay actividades para exportar');
            return;
        }
        
        const exportData = actividades.map(act => ({
            id_accion: act.id_accion,
            nombre_actividad: act.nombre_actividad,
            codigo_principal: act.codigo_principal || '',
            codigos_secundarios: (act.codigos_contables || []).filter(c => !c.es_principal).map(c => c.codigo_cuenta).join(', '),
            descripcion: act.descripcion || '',
            dimension: act.dimension || '',
            subdimension: act.subdimension || '',
            responsable: act.responsable || '',
            accion_nombre: act.accion_nombre || '',
            medios_verificacion: act.medios_verificacion || '',
            lista_recursos: act.lista_recursos || '',
            costo_estimado: act.costo_estimado || ''
        }));
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Actividades');
        XLSX.writeFile(wb, 'actividades_pme.xlsx');
    };

    const resetForm = () => {
        setFormData({
            nombre_actividad: '',
            descripcion: '',
            dimension: '',
            subdimension: '',
            responsable: '',
            id_accion: '',
            medios_verificacion: '',
            lista_recursos: '',
            costo_estimado: ''
        });
        setModalPmeFilter(selectedPme || '');
        setFormCodigos([]);
        setSearchCuentaForm('');
        setShowCuentaDropdown(false);
        setEditingActividad(null);
        setDeletingActividad(null);
    };

    const handleEdit = async (act: Actividad) => {
        loadCuentas();
        let currentAcciones = allAcciones;
        try {
            const [resAcc, resRec] = await Promise.all([
                api.get('/pme/acciones'),
                api.get('/presupuesto/recursos')
            ]);
            currentAcciones = resAcc.data || [];
            setAllAcciones(currentAcciones);
            setRecursos(resRec.data || []);
        } catch (error) {
            console.error('Error fetching data for edit:', error);
        }

        // Determinar el PME de la actividad
        const matchedAcc = currentAcciones.find(a => a.id_accion === act.id_accion);
        const actPmeId = act.id_pme 
            || matchedAcc?.id_pme 
            || (act.pme_year ? pmes.find(p => p.year === act.pme_year)?.id_pme : '') 
            || selectedPme 
            || '';
        setModalPmeFilter(actPmeId);

        setFormData({
            nombre_actividad: act.nombre_actividad || '',
            descripcion: act.descripcion || '',
            dimension: act.dimension || '',
            subdimension: act.subdimension || '',
            responsable: act.responsable || '',
            id_accion: act.id_accion.toString(),
            medios_verificacion: act.medios_verificacion || '',
            lista_recursos: act.lista_recursos || '',
            costo_estimado: act.costo_estimado?.toString() || ''
        });

        // Configurar códigos contables en el formulario
        const codigosList = (act.codigos_contables || []).map(c => ({
            codigo_cuenta: c.codigo_cuenta,
            nombre_cuenta: c.nombre_cuenta,
            es_principal: Boolean(c.es_principal),
            id_subvencion: c.id_subvencion
        }));
        if (codigosList.length === 0 && act.codigo_principal) {
            codigosList.push({
                codigo_cuenta: act.codigo_principal,
                nombre_cuenta: act.nombre_codigo_principal,
                es_principal: true,
                id_subvencion: undefined
            });
        }
        setFormCodigos(codigosList);
        setSearchCuentaForm('');
        setShowCuentaDropdown(false);

        setEditingActividad(act);
        setIsModalOpen(true);
    };

    const handleDelete = async () => {
        if (!deletingActividad) return;
        setIsSaving(true);
        try {
            await api.delete(`/pme/actividades/${deletingActividad.id_actividad}`);
            setDeletingActividad(null);
            fetchActividades();
        } catch (error) {
            console.error('Error deleting actividad:', error);
            alert('Error al eliminar la actividad');
        } finally {
            setIsSaving(false);
        }
    };

    // Modal rápido de códigos contables (Coins)
    const [modalCodigos, setModalCodigos] = useState<{
        codigo_cuenta: string;
        nombre_cuenta?: string;
        es_principal: boolean;
        id_subvencion?: number;
    }[]>([]);
    const [searchCuentaModal, setSearchCuentaModal] = useState('');
    const [showCuentaModalDropdown, setShowCuentaModalDropdown] = useState(false);

    const openCodigoModal = async (act: Actividad) => {
        setCodigoActividad(act);
        setLoadingCodigo(true);
        setSearchCuentaModal('');
        setShowCuentaModalDropdown(false);
        try {
            const [cuentasRes, actualRes] = await Promise.all([
                api.get('/catalogos/cuentas'),
                api.get(`/presupuesto/actividades/${act.id_actividad}/codigos-contables`)
            ]);
            setCuentasActivas((cuentasRes.data || []).filter((c: any) => !c.oculta));
            
            const loadedCodigos: { codigo_cuenta: string; nombre_cuenta?: string; es_principal: boolean }[] = [];
            if (Array.isArray(actualRes.data) && actualRes.data.length > 0) {
                actualRes.data.forEach((r: any) => {
                    loadedCodigos.push({
                        codigo_cuenta: r.codigo_cuenta,
                        nombre_cuenta: r.nombre_cuenta,
                        es_principal: Boolean(r.es_principal)
                    });
                });
            } else if (act.codigo_principal) {
                loadedCodigos.push({
                    codigo_cuenta: act.codigo_principal,
                    nombre_cuenta: act.nombre_codigo_principal,
                    es_principal: true
                });
            }
            setModalCodigos(loadedCodigos);
        } catch (error) {
            console.error('Error cargando datos del código contable:', error);
            alert('Error al cargar las cuentas contables');
        } finally {
            setLoadingCodigo(false);
        }
    };

    const handleAddCodigoToModal = (cuenta: any) => {
        if (modalCodigos.some(c => c.codigo_cuenta === cuenta.codigo)) {
            return;
        }
        const isFirst = modalCodigos.length === 0;
        setModalCodigos(prev => [
            ...prev,
            {
                codigo_cuenta: cuenta.codigo,
                nombre_cuenta: cuenta.nombre,
                es_principal: isFirst
            }
        ]);
        setSearchCuentaModal('');
        setShowCuentaModalDropdown(false);
    };

    const handleSetPrincipalModal = (codigo_cuenta: string) => {
        setModalCodigos(prev =>
            prev.map(c => ({
                ...c,
                es_principal: c.codigo_cuenta === codigo_cuenta
            }))
        );
    };

    const handleRemoveCodigoModal = (codigo_cuenta: string) => {
        setModalCodigos(prev => {
            const next = prev.filter(c => c.codigo_cuenta !== codigo_cuenta);
            if (next.length > 0 && !next.some(c => c.es_principal)) {
                next[0].es_principal = true;
            }
            return next;
        });
    };

    const handleSaveCodigo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!codigoActividad) return;
        setSavingCodigo(true);
        try {
            await api.put(`/presupuesto/actividades/${codigoActividad.id_actividad}/codigos-contables`, {
                codigos: modalCodigos.map(c => ({
                    codigo_cuenta: c.codigo_cuenta,
                    es_principal: c.es_principal
                }))
            });
            setCodigoActividad(null);
            fetchActividades();
        } catch (error: any) {
            const msg = error.response?.data?.detail || 'Error al guardar los códigos contables';
            alert(msg);
        } finally {
            setSavingCodigo(false);
        }
    };

    const handleDeleteCodigo = async () => {
        if (!codigoActividad) return;
        if (!confirm('¿Eliminar todos los códigos contables asignados a esta actividad?')) return;
        setSavingCodigo(true);
        try {
            await api.delete(`/presupuesto/actividades/${codigoActividad.id_actividad}/codigo-contable`);
            setCodigoActividad(null);
            fetchActividades();
        } catch (error: any) {
            const msg = error.response?.data?.detail || 'Error al eliminar el código contable';
            alert(msg);
        } finally {
            setSavingCodigo(false);
        }
    };

    const filtered = actividades.filter(act => {
        const term = searchTerm.toLowerCase();
        return (
            act.nombre_actividad.toLowerCase().includes(term) ||
            act.dimension?.toLowerCase().includes(term) ||
            act.subdimension?.toLowerCase().includes(term) ||
            act.responsable?.toLowerCase().includes(term) ||
            (act.codigo_principal && act.codigo_principal.toLowerCase().includes(term)) ||
            (act.nombre_codigo_principal && act.nombre_codigo_principal.toLowerCase().includes(term)) ||
            (act.codigos_contables && act.codigos_contables.some(c => c.codigo_cuenta.toLowerCase().includes(term) || (c.nombre_cuenta && c.nombre_cuenta.toLowerCase().includes(term))))
        );
    });

    // Dimensiones reales presentes en pre_actividad (para poblar el select).
    const dimensionesDisponibles = Array.from(
        new Set(actividades.map(a => a.dimension).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b));

    const getDimensionStyle = (dimension: string | undefined) => {
        if (!dimension) return { bg: 'bg-gray-100', tx: 'text-gray-700' };
        switch (dimension.toLowerCase()) {
            case 'pedagógica':
            case 'gestión pedagógica':
                return { bg: 'bg-purple-100', tx: 'text-purple-700' };
            case 'convivencia':
                return { bg: 'bg-green-100', tx: 'text-green-700' };
            case 'recursos':
                return { bg: 'bg-amber-100', tx: 'text-amber-700' };
            case 'liderazgo':
                return { bg: 'bg-blue-100', tx: 'text-blue-700' };
            default:
                return { bg: 'bg-gray-100', tx: 'text-gray-700' };
        }
    };

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Actividades PME</h2>
                    <p className="text-gray-500 mt-1.5 font-medium">Gestiona las actividades de las acciones del PME.</p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto flex-wrap">
                    <div className="relative">
                        <select
                            value={selectedPme}
                            onChange={(e) => {
                                setSelectedPme(e.target.value ? parseInt(e.target.value) : '');
                                setSelectedAccion('');
                            }}
                            className="w-full sm:w-auto appearance-none bg-white border border-gray-200 text-gray-800 py-2.5 pl-4 pr-10 rounded-xl leading-tight focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary font-semibold text-xs shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                        >
                            <option value="">Todos los PMEs</option>
                            {pmes.map(pme => (
                                <option key={pme.id_pme} value={pme.id_pme}>
                                    {pme.year} - {pme.colegio_nombre || `Colegio ID: ${pme.id_colegio}`}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>

                    <div className="relative">
                        <select
                            value={selectedAccion}
                            onChange={(e) => setSelectedAccion(e.target.value ? parseInt(e.target.value) : '')}
                            className="w-full sm:w-auto appearance-none bg-white border border-gray-200 text-gray-800 py-2.5 pl-4 pr-10 rounded-xl leading-tight focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary font-semibold text-xs shadow-sm hover:border-gray-300 transition-all cursor-pointer min-w-[180px] disabled:opacity-50"
                            disabled={!selectedPme}
                        >
                            <option value="">Todas las Acciones</option>
                            {acciones.map(acc => (
                                <option key={acc.id_accion} value={acc.id_accion}>{acc.nombre_accion}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>

                    <div className="relative min-w-[240px] md:w-72">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                        <input
                            type="text"
                            placeholder="Buscar por actividad, dimensión o responsable..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-lg hover:bg-gray-100 transition-all" title="Limpiar">
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    <div className="relative column-menu">
                        <button
                            onClick={() => setShowColumnMenu(!showColumnMenu)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                        >
                            <Columns2 size={18} />
                            Columnas
                        </button>
                        {showColumnMenu && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                                {COLUMN_OPTIONS.map(col => (
                                    <label key={col.key} className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={visibleColumns.includes(col.key)}
                                            onChange={() => toggleColumn(col.key)}
                                            className="rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <span className="text-sm text-gray-700">{col.label}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {canEdit && (
                <div className="mb-6 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex flex-wrap items-center gap-4">
                        <span className="text-sm font-medium text-gray-600">Crear actividad:</span>
                        <div className="flex gap-2">
                            <button
                                onClick={async () => {
                                    try {
                                        const [resAcc, resRec] = await Promise.all([
                                            api.get('/pme/acciones'),
                                            api.get('/presupuesto/recursos')
                                        ]);
                                        setAllAcciones(resAcc.data || []);
                                        setRecursos(resRec.data || []);
                                    } catch (error) {
                                        console.error('Error fetching initial data:', error);
                                    }
                                    setViewMode('form');
                                    setEditingActividad(null);
                                    resetForm();
                                    setModalPmeFilter(selectedPme || '');
                                    setIsModalOpen(true);
                                }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    viewMode === 'form' 
                                    ? 'bg-primary text-white' 
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                <FormInput size={18} />
                                Formulario
                            </button>
                            <button
                                onClick={() => { setViewMode('import'); setIsImportModalOpen(true); }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    viewMode === 'import' 
                                    ? 'bg-green-600 text-white' 
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                <FileSpreadsheet size={18} />
                                Importar Excel
                            </button>
                        </div>
                        <div className="ml-auto flex gap-2">
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            >
                                <Download size={18} />
                                Exportar
                            </button>
                            <button
                                onClick={() => {
                                    const ws = XLSX.utils.json_to_sheet([ACTIVIDAD_EXAMPLE]);
                                    const wb = XLSX.utils.book_new();
                                    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
                                    XLSX.writeFile(wb, 'plantilla_actividades.xlsx');
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            >
                                <Download size={18} />
                                Descargar Plantilla
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                {visibleColumns.includes('nombre_actividad') && (
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Actividad</th>
                                )}
                                {visibleColumns.includes('codigo_contable') && (
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Código Contable</th>
                                )}
                                {visibleColumns.includes('accion') && (
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Acción</th>
                                )}
                                {visibleColumns.includes('colegio') && (
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Colegio</th>
                                )}
                                {visibleColumns.includes('dimension') && (
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Dimensión</th>
                                )}
                                {visibleColumns.includes('subdimension') && (
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Subdimensión</th>
                                )}
                                {visibleColumns.includes('responsable') && (
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Responsable</th>
                                )}
                                {visibleColumns.includes('descripcion') && (
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Descripción</th>
                                )}
                                {visibleColumns.includes('costo') && (
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Costo</th>
                                )}
                                {canEdit && (
                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={visibleColumns.length + (canEdit ? 1 : 0)} className="px-6 py-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="animate-spin" size={24} />
                                            <span>Cargando actividades...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleColumns.length + (canEdit ? 1 : 0)} className="px-6 py-12 text-center text-gray-400">
                                        No se encontraron actividades.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((act) => {
                                    const dimStyle = getDimensionStyle(act.dimension);
                                    const codigosSecundarios = (act.codigos_contables || []).filter(c => !c.es_principal);
                                    const isAccionDesactivada = act.accion_activa === false;

                                    return (
                                        <tr
                                            key={act.id_actividad}
                                            className={`transition-colors ${
                                                isAccionDesactivada
                                                    ? 'bg-rose-50/40 hover:bg-rose-50/70 border-y-2 border-l-4 border-rose-500 shadow-xs'
                                                    : 'hover:bg-gray-50/50'
                                            }`}
                                        >
                                            {visibleColumns.includes('nombre_actividad') && (
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                             className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                                                                 isAccionDesactivada
                                                                     ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-400'
                                                                     : 'bg-purple-100 text-purple-700'
                                                             }`}
                                                            title={`${contarRecursos(act.lista_recursos)} recurso(s) asociado(s)`}
                                                        >
                                                            {contarRecursos(act.lista_recursos)}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-semibold text-gray-900">{act.nombre_actividad}</p>
                                                            {isAccionDesactivada && (
                                                                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                                                    <AlertTriangle size={11} /> Acción Desactivada
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            )}
                                            {visibleColumns.includes('codigo_contable') && (
                                                <td className="px-6 py-4">
                                                    {act.codigo_principal || (act.codigos_contables && act.codigos_contables.length > 0) ? (
                                                        <div className="flex flex-col gap-1.5 items-start">
                                                            {act.codigo_principal && (
                                                                <div 
                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200/90 font-bold text-xs shadow-xs"
                                                                    title={act.nombre_codigo_principal || `Cuenta ${act.codigo_principal}`}
                                                                >
                                                                    <Star size={12} className="fill-amber-400 text-amber-500 shrink-0" />
                                                                    <span>{act.codigo_principal}</span>
                                                                    {act.nombre_codigo_principal && (
                                                                        <span className="font-normal text-[10px] text-amber-700 truncate max-w-[130px]">
                                                                            · {act.nombre_codigo_principal}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {codigosSecundarios.length > 0 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {codigosSecundarios.map(c => (
                                                                        <span
                                                                            key={c.codigo_cuenta}
                                                                            className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-semibold text-[10px] border border-gray-200 truncate max-w-[140px]"
                                                                            title={`${c.codigo_cuenta} - ${c.nombre_cuenta || ''}`}
                                                                        >
                                                                            {c.codigo_cuenta}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-400 italic">Sin asignar</span>
                                                    )}
                                                </td>
                                            )}
                                            {visibleColumns.includes('accion') && (
                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className={isAccionDesactivada ? "text-gray-400 line-through" : ""}>
                                                            {act.accion_nombre || act.id_accion}
                                                        </span>
                                                        {isAccionDesactivada && (
                                                            <span className="text-[10px] font-bold text-rose-600">
                                                                (Acción inactiva)
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                            {visibleColumns.includes('colegio') && (
                                                <td className="px-6 py-4 text-xs font-medium text-gray-500">
                                                    {act.colegio_nombre ? (
                                                        <span className="px-2 py-1 bg-gray-100 rounded-md">{act.colegio_nombre}</span>
                                                    ) : '-'}
                                                </td>
                                            )}
                                            {visibleColumns.includes('dimension') && (
                                                <td className="px-6 py-4">
                                                    {act.dimension && (
                                                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${dimStyle.bg} ${dimStyle.tx}`}>
                                                            {act.dimension}
                                                        </span>
                                                    )}
                                                </td>
                                            )}
                                            {visibleColumns.includes('subdimension') && (
                                                <td className="px-6 py-4 text-sm text-gray-500">{act.subdimension || '-'}</td>
                                            )}
                                            {visibleColumns.includes('responsable') && (
                                                <td className="px-6 py-4 text-sm text-gray-500">{act.responsable || '-'}</td>
                                            )}
                                            {visibleColumns.includes('descripcion') && (
                                                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{act.descripcion || '-'}</td>
                                            )}
                                            {visibleColumns.includes('costo') && (
                                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatCurrency(act.costo_estimado)}</td>
                                            )}
                                            {canEdit && (
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => openCodigoModal(act)}
                                                            className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                                                            title="Asignar código contable y subvención"
                                                        >
                                                            <Coins size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => setCertificadoActividad(act)}
                                                            className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg"
                                                            title="Generar Certificado"
                                                        >
                                                            <FileBadge2 size={18} />
                                                        </button>
                                                        <button onClick={() => handleEdit(act)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Editar">
                                                            <Edit size={18} />
                                                        </button>
                                                        <button onClick={() => setDeletingActividad(act)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                                                            <Trash2 size={18} />
                                                        </button>
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
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); resetForm(); }}
                title={editingActividad ? "Editar Actividad" : "Nueva Actividad"}
                maxWidth="max-w-xl"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Selector de PME y Acción */}
                    <div className="space-y-3">
                        {/* Selector de PME: BLOQUEADO / INHABILITADO según requerimiento */}
                        <div className="flex items-center justify-between gap-2">
                            <label className="block text-sm font-semibold text-gray-700">
                                PME / Colegio <span className="text-xs font-normal text-gray-400">(Fijo)</span>
                            </label>
                            <select
                                value={modalPmeFilter}
                                disabled={true}
                                className="text-xs py-1.5 px-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-600 font-medium cursor-not-allowed opacity-80"
                            >
                                <option value="">Sin PME específico</option>
                                {pmes.map(p => (
                                    <option key={p.id_pme} value={p.id_pme}>
                                        {p.year} - {p.colegio_nombre || `Colegio ID: ${p.id_colegio}`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            {(() => {
                                // Lista de acciones a mostrar (filtrada por modalPmeFilter si está activo)
                                const sourceList = allAcciones.length > 0 ? allAcciones : acciones;
                                const filteredAcciones = modalPmeFilter 
                                    ? sourceList.filter(a => a.id_pme === modalPmeFilter)
                                    : sourceList;

                                // Identificar el colegio para aplicar el color
                                const selectedAccObj = sourceList.find(a => a.id_accion.toString() === formData.id_accion);
                                const currentPmeObj = modalPmeFilter ? pmes.find(p => p.id_pme === modalPmeFilter) : null;
                                
                                const colegioDetected = selectedAccObj?.colegio_nombre 
                                    || currentPmeObj?.colegio_nombre 
                                    || editingActividad?.colegio_nombre 
                                    || (selectedPme ? pmes.find(p => p.id_pme === selectedPme)?.colegio_nombre : '')
                                    || user?.colegio?.nombre
                                    || '';

                                const colegioType = getColegioColor(colegioDetected);

                                // Estilos dinámicos según el colegio solicitado
                                // Diego Portales: azul
                                // Macaya: verde claro
                                const selectStyle = colegioType === 'portales'
                                    ? 'border-blue-500 bg-blue-50/70 text-blue-950 font-semibold focus:ring-blue-300 focus:border-blue-600'
                                    : colegioType === 'macaya'
                                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold focus:ring-emerald-300 focus:border-emerald-600'
                                    : 'border-gray-200 bg-white text-gray-900 focus:ring-primary/20 focus:border-primary';

                                const badgeColor = colegioType === 'portales'
                                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                                    : colegioType === 'macaya'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : 'bg-gray-100 text-gray-600 border-gray-200';

                                return (
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="block text-sm font-semibold text-gray-700">Acción</label>
                                            {colegioDetected && (
                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                                                    {colegioDetected}
                                                </span>
                                            )}
                                        </div>
                                        <select
                                            value={formData.id_accion}
                                            onChange={(e) => {
                                                const newId = e.target.value;
                                                setFormData(prev => ({ ...prev, id_accion: newId }));
                                                // Si seleccionó una acción y tiene PME, actualizar el selector de PME si no estaba puesto
                                                if (newId) {
                                                    const found = sourceList.find(a => a.id_accion.toString() === newId);
                                                    if (found && found.id_pme && !modalPmeFilter) {
                                                        setModalPmeFilter(found.id_pme);
                                                    }
                                                }
                                            }}
                                            required
                                            className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 transition-all cursor-pointer ${selectStyle}`}
                                        >
                                            <option value="">Seleccionar Acción...</option>
                                            {filteredAcciones.map(acc => (
                                                <option key={acc.id_accion} value={acc.id_accion}>
                                                    {acc.nombre_accion} {acc.colegio_nombre ? `(${acc.colegio_nombre})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre de la Actividad</label>
                        <input
                            type="text"
                            value={formData.nombre_actividad}
                            onChange={(e) => setFormData({ ...formData, nombre_actividad: e.target.value })}
                            required
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Descripción</label>
                        <textarea
                            value={formData.descripcion}
                            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                            rows={2}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Dimensión</label>
                            <select
                                value={formData.dimension}
                                onChange={(e) => setFormData({ ...formData, dimension: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                            >
                                <option value="">Seleccionar...</option>
                                {/* Si el valor guardado no está en la lista, lo agregamos para que se muestre */}
                                {formData.dimension && !dimensionesDisponibles.includes(formData.dimension) && (
                                    <option value={formData.dimension}>{formData.dimension}</option>
                                )}
                                {dimensionesDisponibles.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Subdimensión</label>
                            <input
                                type="text"
                                value={formData.subdimension}
                                onChange={(e) => setFormData({ ...formData, subdimension: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Responsable</label>
                        <input
                            type="text"
                            value={formData.responsable}
                            onChange={(e) => setFormData({ ...formData, responsable: e.target.value })}
                            placeholder="Persona o cargo responsable"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Medios de Verificación</label>
                        <textarea
                            value={formData.medios_verificacion}
                            onChange={(e) => setFormData({ ...formData, medios_verificacion: e.target.value })}
                            rows={2}
                            placeholder="Documentos o pruebas de que se realizó"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Lista de Recursos</label>
                        <div className="border border-gray-200 rounded-xl max-h-48 overflow-y-auto bg-gray-50 p-2 space-y-2">
                            <input
                                type="text"
                                placeholder="Buscar recurso..."
                                value={searchRecurso}
                                onChange={(e) => setSearchRecurso(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {recursos.filter(r => r.nombre.toLowerCase().includes(searchRecurso.toLowerCase())).slice(0, 10).map(r => (
                                    <label key={r.id_recurso} className="flex items-center gap-2 px-2 py-1 hover:bg-white rounded-lg cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.lista_recursos?.includes(r.nombre)}
                                            onChange={(e) => {
                                                const current = formData.lista_recursos ? formData.lista_recursos.split(',').map(s => s.trim()).filter(s => s) : [];
                                                if (e.target.checked) {
                                                    current.push(r.nombre);
                                                } else {
                                                    const idx = current.indexOf(r.nombre);
                                                    if (idx > -1) current.splice(idx, 1);
                                                }
                                                setFormData({ ...formData, lista_recursos: current.join(', ') });
                                            }}
                                            className="rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <span className="text-xs text-gray-700">{r.nombre}</span>
                                        <span className="text-xs text-gray-400">- {r.categoria_nombre}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        {formData.lista_recursos && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {formData.lista_recursos.split(',').map((r, i) => (
                                    <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                                        {r.trim()}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const current = formData.lista_recursos!.split(',').map(s => s.trim()).filter(s => s && s !== r.trim());
                                                setFormData({ ...formData, lista_recursos: current.join(', ') });
                                            }}
                                            className="hover:text-red-500"
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Costo Estimado ($)</label>
                        <input
                            type="number"
                            value={formData.costo_estimado}
                            onChange={(e) => setFormData({ ...formData, costo_estimado: e.target.value })}
                            min="0"
                            step="0.01"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                        />
                    </div>

                    {/* SECCIÓN CÓDIGOS CONTABLES (1 PRINCIPAL + N SECUNDARIOS) */}
                    <div className="pt-3 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                                <Coins size={16} className="text-amber-500" />
                                Códigos Contables
                            </label>
                            <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                {formCodigos.length} asignada(s)
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">
                            Selecciona cuentas del catálogo de Contralor de Operaciones. Puedes definir <strong>1 principal</strong> y múltiples secundarias.
                        </p>

                        {/* Buscador / Selector de Cuenta */}
                        <div className="relative mb-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input
                                    type="text"
                                    placeholder="Buscar cuenta por código o nombre para agregar..."
                                    value={searchCuentaForm}
                                    onChange={(e) => {
                                        setSearchCuentaForm(e.target.value);
                                        setShowCuentaDropdown(true);
                                    }}
                                    onFocus={() => setShowCuentaDropdown(true)}
                                    className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                                {searchCuentaForm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchCuentaForm('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Dropdown de opciones */}
                            {showCuentaDropdown && (
                                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 p-1 divide-y divide-gray-50">
                                    {cuentasActivas
                                        .filter((c: any) =>
                                            c.codigo.toLowerCase().includes(searchCuentaForm.toLowerCase()) ||
                                            c.nombre.toLowerCase().includes(searchCuentaForm.toLowerCase())
                                        )
                                        .slice(0, 20)
                                        .map((c: any) => {
                                            const isAdded = formCodigos.some(fc => fc.codigo_cuenta === c.codigo);
                                            return (
                                                <button
                                                    key={c.codigo}
                                                    type="button"
                                                    onClick={() => handleAddCodigoToForm(c)}
                                                    disabled={isAdded}
                                                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs transition-colors ${
                                                        isAdded 
                                                        ? 'bg-gray-50 text-gray-400 cursor-not-allowed opacity-60' 
                                                        : 'hover:bg-amber-50/70 hover:text-amber-950 text-gray-800'
                                                    }`}
                                                >
                                                    <div className="flex flex-col pr-2">
                                                        <span className="font-bold text-gray-900">{c.codigo}</span>
                                                        <span className="text-[11px] text-gray-500 truncate max-w-sm">{c.nombre}</span>
                                                    </div>
                                                    {isAdded ? (
                                                        <span className="text-[10px] font-semibold text-gray-400">Agregada</span>
                                                    ) : (
                                                        <span className="text-[11px] font-semibold text-primary flex items-center gap-1 shrink-0">
                                                            <Plus size={13} /> Agregar
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    {cuentasActivas.filter((c: any) =>
                                        c.codigo.toLowerCase().includes(searchCuentaForm.toLowerCase()) ||
                                        c.nombre.toLowerCase().includes(searchCuentaForm.toLowerCase())
                                    ).length === 0 && (
                                        <div className="px-3 py-4 text-center text-xs text-gray-400">
                                            No se encontraron cuentas con ese término.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Lista de Cuentas Agregadas */}
                        {formCodigos.length > 0 ? (
                            <div className="space-y-2 max-h-48 overflow-y-auto p-1 bg-gray-50 rounded-xl border border-gray-100">
                                {formCodigos.map((item) => (
                                    <div
                                        key={item.codigo_cuenta}
                                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                                            item.es_principal
                                                ? 'bg-amber-50/90 border-amber-200 text-amber-950 shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-800 hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <button
                                                type="button"
                                                onClick={() => handleSetPrincipal(item.codigo_cuenta)}
                                                className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                                                    item.es_principal
                                                        ? 'text-amber-600 bg-amber-200/80 shadow-xs'
                                                        : 'text-gray-300 hover:text-amber-500 hover:bg-gray-100'
                                                }`}
                                                title={item.es_principal ? 'Cuenta Principal' : 'Hacer Principal'}
                                            >
                                                <Star size={16} className={item.es_principal ? 'fill-amber-500 text-amber-600' : ''} />
                                            </button>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-extrabold text-xs">{item.codigo_cuenta}</span>
                                                    {item.es_principal ? (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-200 text-amber-900 uppercase tracking-wide">
                                                            ★ Principal
                                                        </span>
                                                    ) : (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
                                                            Secundario
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[11px] text-gray-600 truncate max-w-[280px]">
                                                    {item.nombre_cuenta || cuentasActivas.find((c: any) => c.codigo === item.codigo_cuenta)?.nombre || ''}
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleRemoveCodigo(item.codigo_cuenta)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-2 shrink-0"
                                            title="Quitar cuenta"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-3 text-center border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 bg-gray-50/50">
                                Ninguna cuenta contable asignada. Busca arriba y agrégala.
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => { setIsModalOpen(false); resetForm(); }}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSaving && <Loader2 size={16} className="animate-spin" />}
                            {editingActividad ? 'Actualizar' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </Modal>

            {isImportModalOpen && (
                <UploadExcel
                    onUpload={handleImport}
                    onClose={() => setIsImportModalOpen(false)}
                    templateColumns={ACTIVIDAD_COLUMNS}
                    templateExample={ACTIVIDAD_EXAMPLE}
                />
            )}

            <Modal
                isOpen={!!deletingActividad}
                onClose={() => setDeletingActividad(null)}
                title="Confirmar Eliminación"
                maxWidth="max-w-sm"
            >
                <div className="py-4">
                    <p className="text-gray-600 mb-6">
                        ¿Estás seguro de que deseas eliminar la actividad <strong className="text-gray-900">{deletingActividad?.nombre_actividad}</strong>? Esta acción no se puede deshacer.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setDeletingActividad(null)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={isSaving}
                            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSaving && <Loader2 size={16} className="animate-spin" />}
                            Eliminar
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={!!codigoActividad}
                onClose={() => setCodigoActividad(null)}
                title="Códigos Contables de la Actividad"
                maxWidth="max-w-lg"
            >
                {loadingCodigo ? (
                    <div className="py-12 flex flex-col items-center gap-2 text-gray-400">
                        <Loader2 className="animate-spin" size={24} />
                        <span>Cargando cuentas contables...</span>
                    </div>
                ) : (
                    <form onSubmit={handleSaveCodigo} className="space-y-4">
                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-2.5">
                            <Coins className="text-amber-500 mt-0.5 shrink-0" size={18} />
                            <div>
                                <p className="text-xs font-bold text-amber-950">
                                    {codigoActividad?.nombre_actividad}
                                </p>
                                <p className="text-[11px] text-amber-900/80 mt-0.5 leading-relaxed">
                                    Define la cuenta principal con la estrella <Star size={10} className="inline fill-amber-500 text-amber-600" /> y agrega las cuentas secundarias que correspondan.
                                </p>
                            </div>
                        </div>

                        {/* Buscador / Selector */}
                        <div className="relative">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input
                                    type="text"
                                    placeholder="Buscar cuenta por código o nombre..."
                                    value={searchCuentaModal}
                                    onChange={(e) => {
                                        setSearchCuentaModal(e.target.value);
                                        setShowCuentaModalDropdown(true);
                                    }}
                                    onFocus={() => setShowCuentaModalDropdown(true)}
                                    className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                                {searchCuentaModal && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchCuentaModal('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Dropdown de opciones */}
                            {showCuentaModalDropdown && (
                                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 p-1 divide-y divide-gray-50">
                                    {cuentasActivas
                                        .filter((c: any) =>
                                            c.codigo.toLowerCase().includes(searchCuentaModal.toLowerCase()) ||
                                            c.nombre.toLowerCase().includes(searchCuentaModal.toLowerCase())
                                        )
                                        .slice(0, 20)
                                        .map((c: any) => {
                                            const isAdded = modalCodigos.some(fc => fc.codigo_cuenta === c.codigo);
                                            return (
                                                <button
                                                    key={c.codigo}
                                                    type="button"
                                                    onClick={() => handleAddCodigoToModal(c)}
                                                    disabled={isAdded}
                                                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-xs transition-colors ${
                                                        isAdded 
                                                        ? 'bg-gray-50 text-gray-400 cursor-not-allowed opacity-60' 
                                                        : 'hover:bg-amber-50/70 hover:text-amber-950 text-gray-800'
                                                    }`}
                                                >
                                                    <div className="flex flex-col pr-2">
                                                        <span className="font-bold text-gray-900">{c.codigo}</span>
                                                        <span className="text-[11px] text-gray-500 truncate max-w-sm">{c.nombre}</span>
                                                    </div>
                                                    {isAdded ? (
                                                        <span className="text-[10px] font-semibold text-gray-400">Agregada</span>
                                                    ) : (
                                                        <span className="text-[11px] font-semibold text-primary flex items-center gap-1 shrink-0">
                                                            <Plus size={13} /> Agregar
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    {cuentasActivas.filter((c: any) =>
                                        c.codigo.toLowerCase().includes(searchCuentaModal.toLowerCase()) ||
                                        c.nombre.toLowerCase().includes(searchCuentaModal.toLowerCase())
                                    ).length === 0 && (
                                        <div className="px-3 py-4 text-center text-xs text-gray-400">
                                            No se encontraron cuentas con ese término.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Lista de cuentas seleccionadas */}
                        {modalCodigos.length > 0 ? (
                            <div className="space-y-2 max-h-56 overflow-y-auto p-1 bg-gray-50 rounded-xl border border-gray-100">
                                {modalCodigos.map((item) => (
                                    <div
                                        key={item.codigo_cuenta}
                                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                                            item.es_principal
                                                ? 'bg-amber-50/90 border-amber-200 text-amber-950 shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-800 hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <button
                                                type="button"
                                                onClick={() => handleSetPrincipalModal(item.codigo_cuenta)}
                                                className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                                                    item.es_principal
                                                        ? 'text-amber-600 bg-amber-200/80 shadow-xs'
                                                        : 'text-gray-300 hover:text-amber-500 hover:bg-gray-100'
                                                }`}
                                                title={item.es_principal ? 'Cuenta Principal' : 'Hacer Principal'}
                                            >
                                                <Star size={16} className={item.es_principal ? 'fill-amber-500 text-amber-600' : ''} />
                                            </button>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-extrabold text-xs">{item.codigo_cuenta}</span>
                                                    {item.es_principal ? (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-200 text-amber-900 uppercase tracking-wide">
                                                            ★ Principal
                                                        </span>
                                                    ) : (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
                                                            Secundario
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[11px] text-gray-600 truncate max-w-[280px]">
                                                    {item.nombre_cuenta || cuentasActivas.find((c: any) => c.codigo === item.codigo_cuenta)?.nombre || ''}
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleRemoveCodigoModal(item.codigo_cuenta)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-2 shrink-0"
                                            title="Quitar cuenta"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-4 text-center border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 bg-gray-50/50">
                                Ninguna cuenta contable asignada a esta actividad.
                            </div>
                        )}

                        <div className="flex justify-between items-center pt-4">
                            <div>
                                {modalCodigos.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleDeleteCodigo}
                                        disabled={savingCodigo}
                                        className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Trash2 size={16} />
                                        Limpiar Todo
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setCodigoActividad(null)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingCodigo}
                                    className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {savingCodigo && <Loader2 size={16} className="animate-spin" />}
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </Modal>

            <CertificadoActividad
                actividad={certificadoActividad}
                isOpen={!!certificadoActividad}
                onClose={() => setCertificadoActividad(null)}
            />
        </div>
    );
}