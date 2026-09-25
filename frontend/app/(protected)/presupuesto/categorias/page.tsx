'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import { Search, Plus, Loader2, Edit, Trash2, Tag, BookOpen, X, Check, Download, Upload, FileSpreadsheet, Eye } from 'lucide-react';
import { CategoriaRecurso } from '@/lib/types';
import Modal from '@/components/ui/Modal';
import * as XLSX from 'xlsx';

type CodigoItem = {
    id?: number;
    codigo_cuenta: string;
    nombre_cuenta: string;
};

const DESTINO_GASTO_OPCIONES: { value: string; label: string; hint: string }[] = [
    { value: 'Alumnos', label: 'Alumnos', hint: 'Uso pedagógico y directo en clases' },
    { value: 'Funcionarios', label: 'Funcionarios', hint: 'Uso de administración u oficinas' },
    { value: 'Premio / Beneficio', label: 'Premio / Beneficio', hint: 'Incentivos, apoyos directos y alimentación' },
    { value: 'Mantención / Servicio', label: 'Mantención / Servicio', hint: 'Reparaciones, arriendos y servicios a terceros' },
];

export default function ConfigGestionPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'categorias' | 'subvenciones' | 'grupos'>('categorias');
    const [searchTerm, setSearchTerm] = useState('');
    const [exportFull, setExportFull] = useState(false);
    
    // Categorías State
    const [categorias, setCategorias] = useState<CategoriaRecurso[]>([]);
    const [loading, setLoading] = useState(true);
    const [cuentas, setCuentas] = useState<any[]>([]);
    const [codigosMap, setCodigosMap] = useState<Record<number, CodigoItem[]>>({});

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isConfirmEditOpen, setIsConfirmEditOpen] = useState(false);
    const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
    const [editingCategoria, setEditingCategoria] = useState<CategoriaRecurso | null>(null);
    const [deletingCategoria, setDeletingCategoria] = useState<CategoriaRecurso | null>(null);

    const [formData, setFormData] = useState<{ nombre: string; descripcion: string; estado: string; destino_gasto: string[] }>({ nombre: '', descripcion: '', estado: 'Activo', destino_gasto: [] });
    const [viewingDescription, setViewingDescription] = useState<{ nombre: string; descripcion: string } | null>(null);
    const [codigosForm, setCodigosForm] = useState<CodigoItem[]>([]);
    const [deletedCodeIds, setDeletedCodeIds] = useState<number[]>([]);

    // Account selector state (Categorías modal)
    const [cuentaSearch, setCuentaSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Bulk selection (Categorías)
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [bulkConfirm, setBulkConfirm] = useState(false);

    // Import Excel (Categorías)
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ creadas: number; errores: string[] } | null>(null);

    // Subvenciones State
    const [subvenciones, setSubvenciones] = useState<{ id_subvencion: number; nombre_corto: string; nombre_completo: string; estado: string }[]>([]);
    const [isSubModalOpen, setIsSubModalOpen] = useState(false);
    const [editingSubvencion, setEditingSubvencion] = useState<{ id_subvencion: number; nombre_corto: string; nombre_completo: string; estado: string } | null>(null);
    const [subForm, setSubForm] = useState({ nombre_corto: '', nombre_completo: '', estado: 'ACTIVO' });

    // Grupos State
    const [grupos, setGrupos] = useState<any[]>([]);
    const [isGrupoModalOpen, setIsGrupoModalOpen] = useState(false);
    const [editingGrupo, setEditingGrupo] = useState<any | null>(null);
    const [deletingGrupo, setDeletingGrupo] = useState<any | null>(null);
    const [grupoForm, setGrupoForm] = useState({ nombre: '', descripcion: '' });
    const [selectedGrupoIds, setSelectedGrupoIds] = useState<Set<number>>(new Set());
    const [bulkGrupoConfirm, setBulkGrupoConfirm] = useState(false);

    const canEdit = user?.rol?.codigo === 'ADM' || user?.rol?.codigo === 'DIR' || user?.rol?.codigo === 'GERENTE';

    const fetchCuentas = useCallback(async () => {
        try {
            const res = await api.get('/catalogos/cuentas');
            setCuentas(res.data);
        } catch (error) {
            console.error('Error fetching cuentas:', error);
        }
    }, []);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [catsRes, subvRes, gruposRes] = await Promise.all([
                api.get('/presupuesto/categoria-recurso'),
                api.get('/presupuesto/subvenciones').catch(() => ({ data: [] })),
                api.get('/presupuesto/grupos-recurso').catch(() => ({ data: [] }))
            ]);
            
            const cats: CategoriaRecurso[] = catsRes.data;
            setCategorias(cats);
            setSubvenciones(subvRes.data || []);
            setGrupos(gruposRes.data || []);

            const entries = await Promise.all(
                cats.map(async (cat) => {
                    try {
                        const r = await api.get(`/presupuesto/categoria-recurso/${cat.id_cat_recurso}/codigos`);
                        return [cat.id_cat_recurso, r.data.map((c: any) => ({
                            id: c.id,
                            codigo_cuenta: c.codigo_cuenta,
                            nombre_cuenta: c.nombre_cuenta || c.codigo_cuenta,
                        }))];
                    } catch {
                        return [cat.id_cat_recurso, []];
                    }
                })
            );
            setCodigosMap(Object.fromEntries(entries));
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        fetchCuentas();
    }, [fetchData, fetchCuentas]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── Categorías Actions ──────────────────────────────────────────────────
    const toggleDestino = (value: string) => {
        setFormData(prev => ({
            ...prev,
            destino_gasto: prev.destino_gasto.includes(value)
                ? prev.destino_gasto.filter(d => d !== value)
                : [...prev.destino_gasto, value],
        }));
    };

    const resetForm = () => {
        setFormData({ nombre: '', descripcion: '', estado: 'Activo', destino_gasto: [] });
        setEditingCategoria(null);
        setDeletingCategoria(null);
        setCodigosForm([]);
        setDeletedCodeIds([]);
        setCuentaSearch('');
        setShowDropdown(false);
    };

    const addCodigo = (cuenta: any) => {
        if (codigosForm.some(c => c.codigo_cuenta === cuenta.codigo)) return;
        setCodigosForm(prev => [...prev, { codigo_cuenta: cuenta.codigo, nombre_cuenta: cuenta.nombre }]);
        setCuentaSearch('');
        setShowDropdown(false);
    };

    const removeCodigo = (index: number) => {
        const item = codigosForm[index];
        if (item.id) setDeletedCodeIds(prev => [...prev, item.id!]);
        setCodigosForm(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!formData.nombre.trim() || formData.destino_gasto.length === 0) {
            alert('Debes completar el Nombre y seleccionar al menos un Destino del Gasto.');
            return;
        }
        setIsConfirmEditOpen(false);
        setIsSaving(true);
        try {
            const payload = { nombre: formData.nombre, descripcion: formData.descripcion, estado: formData.estado, destino_gasto: formData.destino_gasto, codigo_contable: '' };
            let catId: number;

            if (editingCategoria) {
                await api.put(`/presupuesto/categoria-recurso/${editingCategoria.id_cat_recurso}`, payload);
                catId = editingCategoria.id_cat_recurso;
                await Promise.all(deletedCodeIds.map(id =>
                    api.delete(`/presupuesto/categoria-recurso/${catId}/codigos/${id}`)
                ));
                await Promise.all(
                    codigosForm.filter(c => !c.id).map(c =>
                        api.post(`/presupuesto/categoria-recurso/${catId}/codigos`, { codigo_cuenta: c.codigo_cuenta })
                    )
                );
            } else {
                const res = await api.post('/presupuesto/categoria-recurso', payload);
                catId = res.data.id_cat_recurso;
                await Promise.all(
                    codigosForm.map(c =>
                        api.post(`/presupuesto/categoria-recurso/${catId}/codigos`, { codigo_cuenta: c.codigo_cuenta })
                    )
                );
            }

            setIsModalOpen(false);
            resetForm();
            fetchData();
            alert(editingCategoria ? 'Categoría actualizada' : 'Categoría creada');
        } catch (error: any) {
            alert(error.response?.data?.detail || 'Error al guardar');
        } finally {
            setIsSaving(false);
        }
    };

    const handleEdit = async (cat: CategoriaRecurso) => {
        setFormData({ nombre: cat.nombre || '', descripcion: cat.descripcion || '', estado: cat.estado || 'Activo', destino_gasto: Array.isArray(cat.destino_gasto) ? cat.destino_gasto : [] });
        setEditingCategoria(cat);
        setDeletedCodeIds([]);
        setCuentaSearch('');
        setShowDropdown(false);
        try {
            const res = await api.get(`/presupuesto/categoria-recurso/${cat.id_cat_recurso}/codigos`);
            setCodigosForm(res.data.map((c: any) => ({
                id: c.id,
                codigo_cuenta: c.codigo_cuenta,
                nombre_cuenta: c.nombre_cuenta || c.codigo_cuenta,
            })));
        } catch {
            setCodigosForm([]);
        }
        setIsModalOpen(true);
    };

    const handleDelete = async () => {
        if (!deletingCategoria) return;
        setIsSaving(true);
        try {
            await api.delete(`/presupuesto/categoria-recurso/${deletingCategoria.id_cat_recurso}`);
            setDeletingCategoria(null);
            setIsConfirmDeleteOpen(false);
            fetchData();
            alert('Categoría eliminada');
        } catch (error: any) {
            alert(error.response?.data?.detail || 'Error al eliminar la categoría');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleId = (id: number) => setSelectedIds(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
    
    const toggleAll = () => setSelectedIds(
        selectedIds.size === filteredCategorias.length ? new Set() : new Set(filteredCategorias.map(c => c.id_cat_recurso))
    );

    const executeBulk = async () => {
        setIsSaving(true);
        try {
            const res = await api.post('/presupuesto/categoria-recurso/bulk-delete', {
                ids: Array.from(selectedIds)
            });
            alert(`Se eliminaron ${res.data.eliminados} categorías correctamente`);
        } catch (error: any) {
            alert(error.response?.data?.detail || 'Error al eliminar las categorías');
        } finally {
            setSelectedIds(new Set());
            setBulkConfirm(false);
            setIsSaving(false);
            fetchData();
        }
    };

    // ---- Excel: Exportar Categorías ----
    const exportToExcel = () => {
        const data = categorias.map(cat => ({
            'ID Categoría': cat.id_cat_recurso,
            'Nombre': cat.nombre,
            'Descripción': cat.descripcion || '',
            'Destino del Gasto': (cat.destino_gasto || []).join(', '),
            'Estado': cat.estado || 'Activo',
            'Códigos Contables': (codigosMap[cat.id_cat_recurso] || []).map(c => c.codigo_cuenta).join(', ')
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [{ wch: 15 }, { wch: 35 }, { wch: 50 }, { wch: 25 }, { wch: 12 }, { wch: 40 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Categorías');
        XLSX.writeFile(wb, `categorias_recursos_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // ---- Excel: Descargar plantilla Categorías ----
    const downloadTemplate = () => {
        const ejemplo = [
            { 'Nombre': 'Material de Oficina', 'Descripción': 'Insumos de papelería y escritorio', 'Destino del Gasto': 'Alumnos | Funcionarios', 'Estado': 'Activo', 'Códigos Contables': '410600, 410900' },
            { 'Nombre': 'Servicios Básicos', 'Descripción': 'Agua, luz, gas', 'Destino del Gasto': 'Mantención / Servicio', 'Estado': 'Activo', 'Códigos Contables': '411000' },
        ];
        const ws = XLSX.utils.json_to_sheet(ejemplo);
        ws['!cols'] = [{ wch: 30 }, { wch: 45 }, { wch: 22 }, { wch: 12 }, { wch: 40 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
        XLSX.writeFile(wb, 'plantilla_categorias.xlsx');
    };

    const handleImportClick = () => {
        setImportResult(null);
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await processImport(file);
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

            const codigosValidos = new Set(cuentas.map(c => String(c.codigo)));

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const fila = i + 2;
                const nombre = String(row['Nombre'] ?? row['nombre'] ?? '').trim();
                if (!nombre) {
                    errores.push(`Fila ${fila}: el campo "Nombre" está vacío. Se omitió.`);
                    continue;
                }
                const descripcion = String(row['Descripción'] ?? row['Descripcion'] ?? row['descripcion'] ?? '').trim();
                const estadoRaw = String(row['Estado'] ?? row['estado'] ?? 'Activo').trim();
                const estado = estadoRaw.toLowerCase().startsWith('inact') ? 'Inactivo' : 'Activo';

                const destinoRaw = String(row['Destino del Gasto'] ?? row['Destino del gasto'] ?? row['destino_gasto'] ?? row['Destino'] ?? '').trim();
                const destinoPartes = destinoRaw ? destinoRaw.split(/[,|]/).map(s => s.trim()).filter(Boolean) : [];
                const destino_gasto: string[] = [];
                const destinosInvalidos: string[] = [];
                for (const parte of destinoPartes) {
                    const match = DESTINO_GASTO_OPCIONES.find(o => o.value.toLowerCase() === parte.toLowerCase());
                    if (match) {
                        if (!destino_gasto.includes(match.value)) destino_gasto.push(match.value);
                    } else {
                        destinosInvalidos.push(parte);
                    }
                }
                if (destino_gasto.length === 0) {
                    errores.push(`Fila ${fila} ("${nombre}"): "Destino del Gasto" inválido o vacío ("${destinoRaw}"). Valores permitidos: ${DESTINO_GASTO_OPCIONES.map(o => o.value).join(', ')}. Se omitió.`);
                    continue;
                }
                if (destinosInvalidos.length > 0) {
                    errores.push(`Fila ${fila} ("${nombre}"): se ignoraron destinos no válidos: ${destinosInvalidos.join(', ')}.`);
                }

                const codigosRaw = String(row['Códigos Contables'] ?? row['Codigos Contables'] ?? row['codigos'] ?? '').trim();
                const codigos = codigosRaw
                    ? codigosRaw.split(/[,;\s]+/).map(c => c.trim()).filter(Boolean)
                    : [];

                try {
                    const res = await api.post('/presupuesto/categoria-recurso', {
                        nombre, descripcion, estado, destino_gasto, codigo_contable: ''
                    });
                    const catId = res.data.id_cat_recurso;
                    for (const cod of codigos) {
                        if (!codigosValidos.has(cod)) {
                            errores.push(`Fila ${fila} ("${nombre}"): el código "${cod}" no existe en el manual de cuentas. Se omitió.`);
                            continue;
                        }
                        try {
                            await api.post(`/presupuesto/categoria-recurso/${catId}/codigos`, { codigo_cuenta: cod });
                        } catch {
                            errores.push(`Fila ${fila} ("${nombre}"): no se pudo asociar el código "${cod}".`);
                        }
                    }
                    creadas++;
                } catch (err: any) {
                    errores.push(`Fila ${fila} ("${nombre}"): ${err.response?.data?.detail || 'error al crear la categoría'}.`);
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

    const getEstadoStyle = (estado: string) => {
        if (estado === 'Activo') return { bg: 'bg-green-100', tx: 'text-green-700', border: 'border-green-200' };
        return { bg: 'bg-gray-100', tx: 'text-gray-700', border: 'border-gray-200' };
    };

    // ── Subvenciones Actions ────────────────────────────────────────────────
    const resetSubForm = () => {
        setSubForm({ nombre_corto: '', nombre_completo: '', estado: 'ACTIVO' });
        setEditingSubvencion(null);
    };

    const abrirSubModal = (sub?: any) => {
        if (sub) {
            setEditingSubvencion(sub);
            setSubForm({ nombre_corto: sub.nombre_corto, nombre_completo: sub.nombre_completo, estado: sub.estado });
        } else {
            resetSubForm();
        }
        setIsSubModalOpen(true);
    };

    const guardarSubvencion = async () => {
        setIsSaving(true);
        try {
            if (editingSubvencion) {
                await api.put(`/presupuesto/subvenciones/${editingSubvencion.id_subvencion}`, subForm);
            } else {
                await api.post('/presupuesto/subvenciones', subForm);
            }
            setIsSubModalOpen(false);
            fetchData();
            alert(editingSubvencion ? 'Subvención actualizada' : 'Subvención creada');
        } catch (e: any) {
            alert(e.response?.data?.detail || 'Error al guardar la subvención');
        } finally {
            setIsSaving(false);
        }
    };

    // ---- Excel: Exportar Subvenciones ----
    const exportSubvencionesExcel = () => {
        const data = subvenciones.map(sub => ({
            'ID Subvención': sub.id_subvencion,
            'Nombre Corto': sub.nombre_corto,
            'Nombre Completo': sub.nombre_completo,
            'Estado': sub.estado
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [{ wch: 15 }, { wch: 18 }, { wch: 45 }, { wch: 15 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Subvenciones');
        XLSX.writeFile(wb, `subvenciones_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // ── Grupos de Recursos Actions ──────────────────────────────────────────
    const resetGrupoForm = () => {
        setGrupoForm({ nombre: '', descripcion: '' });
        setEditingGrupo(null);
    };

    const abrirGrupoModal = (g?: any) => {
        if (g) {
            setEditingGrupo(g);
            setGrupoForm({ nombre: g.nombre, descripcion: g.descripcion || '' });
        } else {
            resetGrupoForm();
        }
        setIsGrupoModalOpen(true);
    };

    const guardarGrupo = async () => {
        if (!grupoForm.nombre.trim()) {
            alert('Debes completar el Nombre.');
            return;
        }
        setIsSaving(true);
        try {
            const payload = {
                nombre: grupoForm.nombre,
                descripcion: grupoForm.descripcion || null
            };
            if (editingGrupo) {
                await api.put(`/presupuesto/grupos-recurso/${editingGrupo.id_grupo_recurso}`, payload);
            } else {
                await api.post('/presupuesto/grupos-recurso', payload);
            }
            setIsGrupoModalOpen(false);
            fetchData();
            alert(editingGrupo ? 'Grupo actualizado' : 'Grupo creado');
        } catch (e: any) {
            alert(e.response?.data?.detail || 'Error al guardar el grupo');
        } finally {
            setIsSaving(false);
        }
    };

    const eliminarGrupo = async (g: any) => {
        if (!window.confirm(`¿Seguro que deseas eliminar el grupo "${g.nombre}"?`)) return;
        setIsSaving(true);
        try {
            await api.delete(`/presupuesto/grupos-recurso/${g.id_grupo_recurso}`);
            fetchData();
            alert('Grupo eliminado');
        } catch (e: any) {
            alert(e.response?.data?.detail || 'Error al eliminar el grupo');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleGrupoId = (id: number) => setSelectedGrupoIds(prev => {
        const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
    });

    const toggleAllGrupos = () => setSelectedGrupoIds(
        selectedGrupoIds.size === filteredGrupos.length ? new Set() : new Set(filteredGrupos.map(g => g.id_grupo_recurso))
    );

    const executeBulkGrupos = async () => {
        setIsSaving(true);
        try {
            const res = await api.post('/presupuesto/grupos-recurso/bulk-delete', {
                ids: Array.from(selectedGrupoIds)
            });
            alert(`Se eliminaron ${res.data.eliminados} grupos correctamente`);
        } catch (e: any) {
            alert(e.response?.data?.detail || 'Error al eliminar los grupos');
        } finally {
            setSelectedGrupoIds(new Set());
            setBulkGrupoConfirm(false);
            setIsSaving(false);
            fetchData();
        }
    };

    // ---- Excel: Descargar plantilla Grupos ----
    const downloadGrupoTemplate = () => {
        const ejemplo = [
            { 'Nombre del Grupo': 'Cafetería y Reuniones', 'Descripción': 'Insumos de café, té, galletas y catering' },
            { 'Nombre del Grupo': 'Aseo e Higiene', 'Descripción': 'Artículos de limpieza, desinfectantes y papel higiénico' },
        ];
        const ws = XLSX.utils.json_to_sheet(ejemplo);
        ws['!cols'] = [{ wch: 30 }, { wch: 50 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Grupos');
        XLSX.writeFile(wb, 'plantilla_grupos_recursos.xlsx');
    };

    // ---- Excel: Exportar Grupos ----
    const exportGruposExcel = () => {
        const data = grupos.map(g => ({
            'ID Grupo': g.id_grupo_recurso,
            'Nombre del Grupo': g.nombre,
            'Descripción': g.descripcion || ''
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 50 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Grupos');
        XLSX.writeFile(wb, `grupos_recursos_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // ---- Excel: Importar Grupos ----
    const processGrupoImport = async (file: File) => {
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

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const fila = i + 2;
                const nombre = String(row['Nombre del Grupo'] ?? row['Nombre'] ?? row['nombre'] ?? '').trim();
                if (!nombre) {
                    errores.push(`Fila ${fila}: el campo "Nombre del Grupo" está vacío. Se omitió.`);
                    continue;
                }
                const descripcion = String(row['Descripción'] ?? row['Descripcion'] ?? row['descripcion'] ?? '').trim() || null;

                try {
                    await api.post('/presupuesto/grupos-recurso', {
                        nombre,
                        descripcion
                    });
                    creadas++;
                } catch (err: any) {
                    errores.push(`Fila ${fila} ("${nombre}"): ${err.response?.data?.detail || 'error al crear el grupo'}.`);
                }
            }

            setImportResult({ creadas, errores });
            fetchData();
        } catch (err) {
            console.error('Error importando excel de grupos:', err);
            setImportResult({ creadas, errores: ['No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx).'] });
        } finally {
            setImporting(false);
        }
    };

    const handleGrupoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await processGrupoImport(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ── Filters ─────────────────────────────────────────────────────────────
    const filteredCategorias = categorias.filter(cat =>
        cat.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cat.descripcion?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredSubvenciones = subvenciones.filter(sub =>
        sub.nombre_corto.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredGrupos = grupos.filter(g => {
        return (
            g.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (g.descripcion && g.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    });

    const filteredCuentas = cuentas.filter(c =>
        !codigosForm.some(f => f.codigo_cuenta === c.codigo) && (
            c.codigo.includes(cuentaSearch) ||
            c.nombre.toLowerCase().includes(cuentaSearch.toLowerCase())
        )
    ).slice(0, 40);

    return (
        <div className="animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Gestión de Configuración</h2>
                    <p className="text-gray-500 mt-1.5 font-medium">Administra las categorías, grupos de recursos y el catálogo maestro de subvenciones del sistema.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto flex-wrap justify-end">
                    <div className="relative flex-1 md:w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder={activeTab === 'categorias' ? "Buscar categoría..." : activeTab === 'grupos' ? "Buscar grupo..." : "Buscar subvención..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm transition-colors text-gray-900"
                        />
                    </div>

                    {/* Descargar plantilla */}
                    {activeTab === 'categorias' && (
                        <button
                            onClick={downloadTemplate}
                            title="Descargar plantilla de importación"
                            className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-semibold border border-gray-200 flex items-center gap-2 transition-all whitespace-nowrap"
                        >
                            <FileSpreadsheet size={18} className="text-emerald-600" />
                            <span className="hidden lg:inline">Plantilla</span>
                        </button>
                    )}
                    {activeTab === 'grupos' && (
                        <button
                            onClick={downloadGrupoTemplate}
                            title="Descargar plantilla de importación de grupos"
                            className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-semibold border border-gray-200 flex items-center gap-2 transition-all whitespace-nowrap"
                        >
                            <FileSpreadsheet size={18} className="text-emerald-600" />
                            <span className="hidden lg:inline">Plantilla</span>
                        </button>
                    )}

                    {/* Checkbox para exportación completa */}
                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-all select-none whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={exportFull}
                            onChange={(e) => setExportFull(e.target.checked)}
                            className="w-4 h-4 rounded accent-primary cursor-pointer border-gray-300"
                        />
                        <span>Incluir IDs (Completo)</span>
                    </label>

                    {/* Exportar Excel */}
                    <button
                        onClick={
                            activeTab === 'categorias' 
                                ? exportToExcel 
                                : activeTab === 'grupos'
                                    ? exportGruposExcel
                                    : exportSubvencionesExcel
                        }
                        disabled={
                            activeTab === 'categorias' 
                                ? categorias.length === 0 
                                : activeTab === 'grupos'
                                    ? grupos.length === 0
                                    : subvenciones.length === 0
                        }
                        title={
                            activeTab === 'categorias' 
                                ? "Exportar categorías a Excel" 
                                : activeTab === 'grupos'
                                    ? "Exportar grupos a Excel"
                                    : "Exportar subvenciones a Excel"
                        }
                        className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-semibold border border-gray-200 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        <Download size={18} />
                        <span className="hidden lg:inline">Exportar</span>
                    </button>

                    {canEdit && (
                        <>
                            {/* Importar Excel */}
                            {activeTab === 'categorias' && (
                                <>
                                    <button
                                        onClick={handleImportClick}
                                        disabled={importing}
                                        title="Importar categorías desde Excel"
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
                                </>
                            )}
                            {activeTab === 'grupos' && (
                                <>
                                    <button
                                        onClick={handleImportClick}
                                        disabled={importing}
                                        title="Importar grupos desde Excel"
                                        className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-semibold border border-gray-200 flex items-center gap-2 transition-all disabled:opacity-50 whitespace-nowrap"
                                    >
                                        {importing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                                        <span className="hidden lg:inline">Importar</span>
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".xlsx,.xls"
                                        onChange={handleGrupoFileSelected}
                                        className="hidden"
                                    />
                                </>
                            )}

                            {/* Botón de Acción Dinámico */}
                            {activeTab === 'categorias' ? (
                                <button
                                    onClick={() => { resetForm(); setIsModalOpen(true); }}
                                    className="bg-primary hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-primary/30 flex items-center transition-all duration-200 whitespace-nowrap"
                                >
                                    <Plus size={20} className="md:mr-2" />
                                    <span className="hidden md:inline">Nueva Categoría</span>
                                </button>
                            ) : activeTab === 'grupos' ? (
                                <button
                                    onClick={() => abrirGrupoModal()}
                                    className="bg-primary hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-primary/30 flex items-center transition-all duration-200 whitespace-nowrap"
                                >
                                    <Plus size={20} className="md:mr-2" />
                                    <span className="hidden md:inline">Nuevo Grupo</span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => abrirSubModal()}
                                    className="bg-primary hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-primary/30 flex items-center transition-all duration-200 whitespace-nowrap"
                                >
                                    <Plus size={20} className="md:mr-2" />
                                    <span className="hidden md:inline">Nueva Subvención</span>
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 mb-6 gap-6">
                <button onClick={() => { setActiveTab('categorias'); setSearchTerm(''); }}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'categorias' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                    <BookOpen size={16} /> Categorías ({categorias.length})
                </button>
                <button onClick={() => { setActiveTab('grupos'); setSearchTerm(''); }}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'grupos' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                    <Tag size={16} /> Grupos ({grupos.length})
                </button>
                <button onClick={() => { setActiveTab('subvenciones'); setSearchTerm(''); }}
                    className={`pb-3 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'subvenciones' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                    <Tag size={16} /> Subvenciones ({subvenciones.length})
                </button>
            </div>

            {/* TAB: Categorías */}
            {activeTab === 'categorias' && (
                <>
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-3 px-5 py-3 mb-3 bg-red-50 border border-red-200 rounded-2xl">
                            <span className="text-sm font-bold text-red-700">{selectedIds.size} seleccionada{selectedIds.size > 1 ? 's' : ''}</span>
                            <div className="flex gap-2 ml-auto">
                                <button onClick={() => setBulkConfirm(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all">
                                    <Trash2 size={14} /> Eliminar ({selectedIds.size})
                                </button>
                                <button onClick={() => setSelectedIds(new Set())}
                                    className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition-all">
                                    <X size={13} /> Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="pl-5 pr-2 py-4 w-10">
                                            <input type="checkbox"
                                                checked={filteredCategorias.length > 0 && selectedIds.size === filteredCategorias.length}
                                                onChange={toggleAll}
                                                className="w-4 h-4 rounded accent-primary cursor-pointer" />
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nombre</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Descripción</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Destino del Gasto</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Códigos Contables</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Loader2 className="animate-spin" size={24} />
                                                    <span>Cargando categorías...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredCategorias.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-12 text-center text-gray-400">No se encontraron categorías.</td>
                                        </tr>
                                    ) : (
                                        filteredCategorias.map((cat) => {
                                            const estadoStyle = getEstadoStyle(cat.estado);
                                            const isChecked = selectedIds.has(cat.id_cat_recurso);
                                            const codigos = codigosMap[cat.id_cat_recurso] || [];
                                            return (
                                                <tr key={cat.id_cat_recurso} className={`hover:bg-gray-50/50 transition-colors ${isChecked ? 'bg-red-50/40' : ''}`}>
                                                    <td className="pl-5 pr-2 py-4">
                                                        <input type="checkbox" checked={isChecked} onChange={() => toggleId(cat.id_cat_recurso)}
                                                            className="w-4 h-4 rounded accent-primary cursor-pointer" />
                                                    </td>
                                                    <td className="px-6 py-4 max-w-[200px]">
                                                        <span className="text-sm font-semibold text-gray-900 break-words">{cat.nombre}</span>
                                                    </td>
                                                    <td className="px-6 py-4 max-w-[550px]">
                                                        <div className="flex items-start gap-2 justify-between group">
                                                            <span className="text-sm text-gray-500 line-clamp-3 break-words pr-2">
                                                                {cat.descripcion || 'Sin descripción'}
                                                            </span>
                                                            {cat.descripcion && (
                                                                <button 
                                                                    onClick={() => setViewingDescription({ nombre: cat.nombre || '', descripcion: cat.descripcion || '' })}
                                                                    className="text-primary hover:text-blue-700 transition-colors p-1 rounded hover:bg-blue-50 shrink-0 self-start"
                                                                    title="Ver descripción completa"
                                                                >
                                                                    <Eye size={15} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {cat.destino_gasto && cat.destino_gasto.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {cat.destino_gasto.map((d) => (
                                                                    <span key={d} className="px-2.5 py-1 inline-flex text-xs font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
                                                                        {d}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 text-xs italic">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {codigos.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                                {codigos.map((c) => (
                                                                    <span
                                                                        key={c.id ?? c.codigo_cuenta}
                                                                        title={c.nombre_cuenta}
                                                                        className="px-1.5 py-0.5 bg-blue-50/70 text-blue-700 border border-blue-100 text-[10.5px] font-medium rounded whitespace-nowrap"
                                                                    >
                                                                        {c.codigo_cuenta}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 text-xs italic">Sin códigos</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${estadoStyle.bg} ${estadoStyle.tx} border ${estadoStyle.border}`}>
                                                            {cat.estado}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button onClick={() => handleEdit(cat)} className="text-gray-400 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50"><Edit size={18} /></button>
                                                            <button onClick={() => setDeletingCategoria(cat)} className="text-gray-400 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50"><Trash2 size={18} /></button>
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
                </>
            )}

            {/* TAB: Grupos de Recursos */}
            {activeTab === 'grupos' && (
                <>
                    {selectedGrupoIds.size > 0 && (
                        <div className="flex items-center gap-3 px-5 py-3 mb-3 bg-red-50 border border-red-200 rounded-2xl">
                            <span className="text-sm font-bold text-red-700">{selectedGrupoIds.size} seleccionado{selectedGrupoIds.size > 1 ? 's' : ''}</span>
                            <div className="flex gap-2 ml-auto">
                                <button onClick={() => setBulkGrupoConfirm(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all">
                                    <Trash2 size={14} /> Eliminar ({selectedGrupoIds.size})
                                </button>
                                <button onClick={() => setSelectedGrupoIds(new Set())}
                                    className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition-all">
                                    <X size={13} /> Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="pl-5 pr-2 py-4 w-10">
                                            <input type="checkbox"
                                                checked={filteredGrupos.length > 0 && selectedGrupoIds.size === filteredGrupos.length}
                                                onChange={toggleAllGrupos}
                                                className="w-4 h-4 rounded accent-primary cursor-pointer" />
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nombre del Grupo</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Descripción</th>
                                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Loader2 className="animate-spin" size={24} />
                                                    <span>Cargando grupos...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredGrupos.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-gray-400">No se encontraron grupos.</td>
                                        </tr>
                                    ) : (
                                        filteredGrupos.map((g) => {
                                            const isChecked = selectedGrupoIds.has(g.id_grupo_recurso);
                                            return (
                                                <tr key={g.id_grupo_recurso} className={`hover:bg-gray-50/50 transition-colors ${isChecked ? 'bg-red-50/40' : ''}`}>
                                                    <td className="pl-5 pr-2 py-4">
                                                        <input type="checkbox" checked={isChecked} onChange={() => toggleGrupoId(g.id_grupo_recurso)}
                                                            className="w-4 h-4 rounded accent-primary cursor-pointer" />
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="text-sm font-semibold text-gray-900">{g.nombre}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs text-gray-500 max-w-md block truncate" title={g.descripcion || ''}>
                                                            {g.descripcion || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button onClick={() => abrirGrupoModal(g)} className="text-gray-400 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50" title="Editar"><Edit size={18} /></button>
                                                            <button onClick={() => eliminarGrupo(g)} className="text-gray-400 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50" title="Eliminar"><Trash2 size={18} /></button>
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
                </>
            )}

            {/* TAB: Subvenciones */}
            {activeTab === 'subvenciones' && (
                <div className="space-y-3">
                    <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nombre Corto</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nombre Completo</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                                        {canEdit && <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={canEdit ? 4 : 3} className="px-6 py-12 text-center text-gray-400">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Loader2 className="animate-spin" size={24} />
                                                    <span>Cargando subvenciones...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredSubvenciones.length === 0 ? (
                                        <tr>
                                            <td colSpan={canEdit ? 4 : 3} className="px-6 py-12 text-center text-gray-400">No se encontraron subvenciones.</td>
                                        </tr>
                                    ) : (
                                        filteredSubvenciones.map((sub) => (
                                            <tr key={sub.id_subvencion} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-lg text-xs font-extrabold">{sub.nombre_corto}</span>
                                                </td>
                                                <td className="px-6 py-4 text-sm font-semibold text-gray-900">{sub.nombre_completo}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${sub.estado === 'ACTIVO' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                                        {sub.estado}
                                                    </span>
                                                </td>
                                                {canEdit && (
                                                    <td className="px-6 py-4 text-center">
                                                        <button onClick={() => abrirSubModal(sub)} className="text-gray-400 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50">
                                                            <Edit size={18} />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Crear / Editar Categoría */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); resetForm(); }}
                title={editingCategoria ? 'Editar Categoría' : 'Nueva Categoría'}
                maxWidth="max-w-xl"
            >
                <form className="space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={formData.nombre}
                            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
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

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Destino del Gasto <span className="text-red-500">*</span>
                            <span className="ml-1 font-normal text-gray-400">(puedes elegir más de uno)</span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {DESTINO_GASTO_OPCIONES.map(o => {
                                const selected = formData.destino_gasto.includes(o.value);
                                return (
                                    <button
                                        key={o.value}
                                        type="button"
                                        onClick={() => toggleDestino(o.value)}
                                        title={o.hint}
                                        className={`flex items-start gap-2 text-left p-3 rounded-xl border transition-all ${
                                            selected
                                                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                                                : 'border-gray-200 bg-white hover:bg-gray-50'
                                        }`}
                                    >
                                        <span className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center ${
                                            selected ? 'bg-primary border-primary text-white' : 'border-gray-300 bg-white'
                                        }`}>
                                            {selected && <Check size={12} strokeWidth={3} />}
                                        </span>
                                        <span>
                                            <span className={`block text-sm font-semibold ${selected ? 'text-primary' : 'text-gray-700'}`}>{o.label}</span>
                                            <span className="block text-[11px] text-gray-400 leading-tight">{o.hint}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Códigos Contables</label>
                        <div ref={dropdownRef} className="relative">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Buscar cuenta por código o nombre..."
                                    value={cuentaSearch}
                                    onChange={(e) => { setCuentaSearch(e.target.value); setShowDropdown(true); }}
                                    onFocus={() => setShowDropdown(true)}
                                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-gray-900"
                                />
                            </div>

                            {showDropdown && (
                                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                                    {filteredCuentas.length === 0 ? (
                                        <div className="px-4 py-3 text-sm text-gray-400 text-center">Sin resultados</div>
                                    ) : (
                                        filteredCuentas.map((c) => (
                                            <button
                                                key={c.codigo}
                                                type="button"
                                                onClick={() => addCodigo(c)}
                                                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-none flex items-center justify-between gap-3"
                                            >
                                                <div>
                                                    <span className="text-xs font-bold text-primary">{c.codigo}</span>
                                                    <span className="text-xs text-gray-600 ml-2 line-clamp-1">{c.nombre}</span>
                                                </div>
                                                <Plus size={14} className="text-gray-400 shrink-0" />
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        {codigosForm.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {codigosForm.map((c, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold rounded-lg"
                                    >
                                        <span className="font-mono">{c.codigo_cuenta}</span>
                                        <span className="text-blue-500 font-normal max-w-[140px] truncate">{c.nombre_cuenta}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeCodigo(i)}
                                            className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors rounded p-0.5 hover:bg-red-50"
                                        >
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-2 text-xs text-gray-400 italic">Aún no se han agregado códigos contables.</p>
                        )}
                    </div>

                    {editingCategoria && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Estado</label>
                            <select
                                value={formData.estado}
                                onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                            >
                                <option value="Activo">Activo</option>
                                <option value="Inactivo">Inactivo</option>
                            </select>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => { setIsModalOpen(false); resetForm(); }}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => editingCategoria ? setIsConfirmEditOpen(true) : handleSubmit()}
                            disabled={isSaving || !formData.nombre.trim() || formData.destino_gasto.length === 0}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSaving && <Loader2 size={16} className="animate-spin" />}
                            {editingCategoria ? 'Actualizar' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Confirmar edición Categoría */}
            <Modal isOpen={isConfirmEditOpen} onClose={() => setIsConfirmEditOpen(false)} title="Confirmar Cambios" maxWidth="max-w-sm">
                <div className="py-4">
                    <p className="text-gray-600 mb-6">¿Guardar los cambios en <strong className="text-gray-900">{editingCategoria?.nombre}</strong>?</p>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setIsConfirmEditOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button onClick={handleSubmit} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
                            {isSaving && <Loader2 size={16} className="animate-spin" />}
                            Guardar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Confirmar eliminación Categoría */}
            <Modal isOpen={!!deletingCategoria && !isConfirmDeleteOpen} onClose={() => setDeletingCategoria(null)} title="Confirmar Eliminación" maxWidth="max-w-sm">
                <div className="py-4">
                    <p className="text-gray-600 mb-6">
                        ¿Eliminar la categoría <strong className="text-gray-900">{deletingCategoria?.nombre}</strong>? Esta acción no se puede deshacer.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setDeletingCategoria(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button onClick={() => setIsConfirmDeleteOpen(true)} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                            {isSaving && <Loader2 size={16} className="animate-spin" />}
                            Eliminar
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isConfirmDeleteOpen} onClose={() => setIsConfirmDeleteOpen(false)} title="Confirmar Eliminación" maxWidth="max-w-sm">
                <div className="py-4">
                    <p className="text-gray-600 mb-6">¿Seguro que deseas eliminar <strong className="text-gray-900">{deletingCategoria?.nombre}</strong>? Esta acción no se puede deshacer.</p>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setIsConfirmDeleteOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button onClick={handleDelete} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                            {isSaving && <Loader2 size={16} className="animate-spin" />}
                            Eliminar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Eliminación masiva Categorías */}
            <Modal isOpen={bulkConfirm} onClose={() => setBulkConfirm(false)} title="Eliminar Categorías" maxWidth="max-w-sm">
                <div className="py-4 space-y-4">
                    <p className="text-gray-600">¿Eliminar <strong>{selectedIds.size}</strong> categorías seleccionadas? Esta acción no se puede deshacer.</p>
                    <ul className="max-h-32 overflow-y-auto space-y-1">
                        {filteredCategorias.filter(c => selectedIds.has(c.id_cat_recurso)).map(c => (
                            <li key={c.id_cat_recurso} className="text-xs text-gray-500 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />{c.nombre}
                            </li>
                        ))}
                    </ul>
                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setBulkConfirm(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button onClick={executeBulk} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                            {isSaving && <Loader2 size={14} className="animate-spin" />} Eliminar
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Importación */}
            <Modal isOpen={!!importResult} onClose={() => setImportResult(null)} title="Resultado de la Importación" maxWidth="max-w-md">
                {importResult && (
                    <div className="py-4 space-y-4">
                        <div className={`flex items-center gap-3 p-4 rounded-xl ${importResult.creadas > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${importResult.creadas > 0 ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
                                <Check size={20} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900">
                                    {importResult.creadas} {activeTab === 'categorias' ? 'categoría' : 'grupo'}{importResult.creadas !== 1 ? (activeTab === 'categorias' ? 's' : 's') : ''} creado{importResult.creadas !== 1 ? 's' : ''}
                                </p>
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

            {/* Ver descripción completa Categoría */}
            {viewingDescription && (
                <Modal
                    isOpen={!!viewingDescription}
                    onClose={() => setViewingDescription(null)}
                    title={`Descripción: ${viewingDescription.nombre}`}
                    maxWidth="max-w-md"
                >
                    <div className="py-4">
                        <div className="text-sm text-gray-600 whitespace-pre-wrap break-words leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100">
                            {viewingDescription.descripcion || 'Sin descripción'}
                        </div>
                        <div className="flex justify-end mt-4">
                            <button
                                onClick={() => setViewingDescription(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                                type="button"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal de Subvención */}
            <Modal isOpen={isSubModalOpen} onClose={() => setIsSubModalOpen(false)} title={editingSubvencion ? 'Editar Subvención' : 'Nueva Subvención'}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Corto *</label>
                        <input type="text" placeholder="Ej: SEP, PIE, GENERAL" value={subForm.nombre_corto}
                            onChange={e => setSubForm(prev => ({ ...prev, nombre_corto: e.target.value }))}
                            className="block w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-primary focus:border-primary text-sm text-gray-900" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo *</label>
                        <input type="text" placeholder="Ej: Subvención Escolar Preferencial" value={subForm.nombre_completo}
                            onChange={e => setSubForm(prev => ({ ...prev, nombre_completo: e.target.value }))}
                            className="block w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-primary focus:border-primary text-sm text-gray-900" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Estado</label>
                        <select value={subForm.estado}
                            onChange={e => setSubForm(prev => ({ ...prev, estado: e.target.value }))}
                            className="block w-full px-3 py-2 border border-gray-200 bg-white rounded-xl focus:outline-none focus:ring-primary focus:border-primary text-sm text-gray-900">
                            <option value="ACTIVO">ACTIVO</option>
                            <option value="INACTIVO">INACTIVO</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                        <button onClick={() => setIsSubModalOpen(false)} className="px-4 py-2 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-600">Cancelar</button>
                        <button onClick={guardarSubvencion} disabled={isSaving || !subForm.nombre_corto || !subForm.nombre_completo}
                            className="bg-primary hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all">
                            {isSaving ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal Crear / Editar Grupo de Recursos */}
            <Modal isOpen={isGrupoModalOpen} onClose={() => { setIsGrupoModalOpen(false); resetGrupoForm(); }} title={editingGrupo ? 'Editar Grupo de Recursos' : 'Nuevo Grupo de Recursos'} maxWidth="max-w-md">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre del Grupo *</label>
                        <input type="text" placeholder="Ej: Papelería y Escritorio, Cafetería" value={grupoForm.nombre}
                            onChange={e => setGrupoForm({ ...grupoForm, nombre: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900" />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Descripción (opcional)</label>
                        <textarea
                            placeholder="Descripción detallada del grupo de recursos..."
                            value={grupoForm.descripcion}
                            onChange={e => setGrupoForm({ ...grupoForm, descripcion: e.target.value })}
                            rows={3}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900 text-sm"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                        <button onClick={() => { setIsGrupoModalOpen(false); resetGrupoForm(); }} className="px-4 py-2 hover:bg-gray-50 rounded-xl text-sm font-semibold text-gray-600">Cancelar</button>
                        <button onClick={guardarGrupo} disabled={isSaving || !grupoForm.nombre.trim()}
                            className="bg-primary hover:bg-blue-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all">
                            {isSaving ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Eliminación masiva Grupos */}
            <Modal isOpen={bulkGrupoConfirm} onClose={() => setBulkGrupoConfirm(false)} title="Eliminar Grupos de Recursos" maxWidth="max-w-sm">
                <div className="py-4 space-y-4">
                    <p className="text-gray-600 text-sm leading-relaxed">
                        ¿Estás seguro de eliminar <strong>{selectedGrupoIds.size}</strong> grupos seleccionados? Los recursos vinculados se desvincularán sin perder sus datos.
                    </p>
                    <ul className="max-h-32 overflow-y-auto space-y-1">
                        {filteredGrupos.filter(g => selectedGrupoIds.has(g.id_grupo_recurso)).map(g => (
                            <li key={g.id_grupo_recurso} className="text-xs text-gray-500 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />{g.nombre}
                            </li>
                        ))}
                    </ul>
                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setBulkGrupoConfirm(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button onClick={executeBulkGrupos} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                            {isSaving && <Loader2 size={14} className="animate-spin" />} Eliminar
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
