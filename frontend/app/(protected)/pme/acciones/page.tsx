'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';
import { Search, Plus, Target, Loader2, Edit, Trash2, Eye, FileSpreadsheet, Download, FormInput, X, Calendar, DollarSign, Layers, BookOpen, CheckCircle2 } from 'lucide-react';
import { PME, Accion } from '@/lib/types';
import Modal from '@/components/ui/Modal';
import UploadExcel from '@/components/ui/UploadExcel';
import * as XLSX from 'xlsx';

type ViewMode = 'form' | 'import';

const ACCION_COLUMNS = [
    'id_pme', 'nombre_accion', 'descripcion', 'verificacion', 'responsable', 'estado', 'pme_year',
    'dimension', 'subdimensiones', 'objetivo_estrategico', 'estrategia', 'planes_asociados',
    'medios_verificacion', 'recursos_necesarios', 'monto_sep', 'monto_total',
    'nivel_ejecucion', 'justificacion_nivel', 'fecha_inicio', 'fecha_termino', 'programa_asociado',
    'ate', 'tic', 'monto_general'
];

const ACCION_EXAMPLE = {
    id_pme: '1',
    nombre_accion: 'INCENTIVO A RESULTADOS, PRÁCTICAS PEDAGÓGICAS INNOVADORAS Y PROYECTOS ABP',
    descripcion: 'Esta acción está destinada a favorecer la innovación y creatividad docente...',
    verificacion: 'Encuesta de satisfacción',
    responsable: 'Jefe técnico',
    estado: 'En Curso',
    pme_year: '2026',
    dimension: 'Gestión Pedagógica',
    subdimensiones: 'Gestión Curricular',
    objetivo_estrategico: 'Mejorar los resultados de aprendizaje',
    estrategia: 'Análisis de datos, capacitación a docentes y funcionarios...',
    planes_asociados: 'Plan de Gestión de la Convivencia Escolar, Plan de Desarrollo Profesional Docente',
    medios_verificacion: 'Temarios y planificación de Capacitación docente, Informes...',
    recursos_necesarios: 'Formato postulación proyectos, avances resultados académicos',
    monto_sep: '500000',
    monto_total: '800000',
    nivel_ejecucion: 'Aún no se encuentra evaluado',
    justificacion_nivel: 'Aún no se encuentra evaluado',
    fecha_inicio: '04/03/2026',
    fecha_termino: '30/11/2026',
    programa_asociado: 'SEP',
    ate: 'No',
    tic: 'Sala de clases',
    monto_general: '0'
};

const getColegioColor = (colegioStr?: string | null): 'portales' | 'macaya' | 'default' => {
    if (!colegioStr) return 'default';
    const s = colegioStr.toLowerCase();
    if (s.includes('diego') || s.includes('portales')) return 'portales';
    if (s.includes('macaya')) return 'macaya';
    return 'default';
};

export default function AccionesPage() {
    const { user } = useAuth();
    const [pmes, setPmes] = useState<PME[]>([]);
    const [acciones, setAcciones] = useState<Accion[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPme, setSelectedPme] = useState<number | ''>('');
    
    const [viewMode, setViewMode] = useState<ViewMode>('form');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [modalTab, setModalTab] = useState<'general' | 'estrategico' | 'seguimiento' | 'presupuesto'>('general');
    const [editingAccion, setEditingAccion] = useState<Accion | null>(null);
    const [deletingAccion, setDeletingAccion] = useState<Accion | null>(null);
    const [verAccion, setVerAccion] = useState<Accion | null>(null);
    const [verActividad, setVerActividad] = useState<any | null>(null);
    const [formData, setFormData] = useState({
        nombre_accion: '',
        descripcion: '',
        verificacion: '',
        responsable: '',
        estado: 'Pendiente',
        activo: true,
        id_pme: '',
        dimension: '',
        subdimensiones: '',
        objetivo_estrategico: '',
        estrategia: '',
        planes_asociados: '',
        medios_verificacion: '',
        recursos_necesarios: '',
        monto_sep: '',
        monto_total: '',
        nivel_ejecucion: 'Aún no se encuentra evaluado',
        justificacion_nivel: 'Aún no se encuentra evaluado',
        fecha_inicio: '',
        fecha_termino: '',
        programa_asociado: 'SEP',
        ate: 'No',
        tic: '',
        monto_general: '0'
    });

    const canEdit = true;

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const pmeRes = await api.get('/pme');
            setPmes(pmeRes.data);
            
            const url = selectedPme ? `/pme/${selectedPme}/acciones` : '/pme/acciones';
            const accionesRes = await api.get(url);
            setAcciones(accionesRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedPme]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleToggleActivo = async (acc: Accion) => {
        try {
            await api.patch(`/pme/acciones/${acc.id_accion}/toggle-activo`);
            setAcciones(prev => prev.map(a => a.id_accion === acc.id_accion ? { ...a, activo: a.activo === false ? true : false } : a));
        } catch (error) {
            console.error('Error toggling activo:', error);
            alert('Error al cambiar el estado de la acción');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const payload = {
                nombre_accion: formData.nombre_accion,
                descripcion: formData.descripcion,
                verificacion: formData.verificacion,
                responsable: formData.responsable,
                estado: formData.estado,
                activo: formData.activo,
                dimension: formData.dimension || null,
                subdimensiones: formData.subdimensiones || null,
                objetivo_estrategico: formData.objetivo_estrategico || null,
                estrategia: formData.estrategia || null,
                planes_asociados: formData.planes_asociados || null,
                medios_verificacion: formData.medios_verificacion || null,
                recursos_necesarios: formData.recursos_necesarios || null,
                monto_sep: formData.monto_sep ? parseFloat(formData.monto_sep) : null,
                monto_total: formData.monto_total ? parseFloat(formData.monto_total) : null,
                nivel_ejecucion: formData.nivel_ejecucion || null,
                justificacion_nivel: formData.justificacion_nivel || null,
                fecha_inicio: formData.fecha_inicio || null,
                fecha_termino: formData.fecha_termino || null,
                programa_asociado: formData.programa_asociado || null,
                ate: formData.ate || null,
                tic: formData.tic || null,
                monto_general: formData.monto_general ? parseFloat(formData.monto_general) : null
            };

            if (editingAccion) {
                await api.put(`/pme/acciones/${editingAccion.id_accion}`, payload);
            } else {
                await api.post(`/pme/${formData.id_pme}/acciones`, payload);
            }
            setIsModalOpen(false);
            resetForm();
            fetchData();
        } catch (error) {
            console.error(editingAccion ? 'Error updating action:' : 'Error creating action:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleImport = async (data: any[]) => {
        setIsSaving(true);
        try {
            const mappedData = data.map(row => ({
                id_pme: parseInt(row.id_pme),
                nombre_accion: row.nombre_accion,
                descripcion: row.descripcion || null,
                verificacion: row.verificacion || null,
                responsable: row.responsable || null,
                estado: row.estado || 'Pendiente',
                pme_year: parseInt(row.pme_year) || new Date().getFullYear(),
                dimension: row.dimension || null,
                subdimensiones: row.subdimensiones || null,
                objetivo_estrategico: row.objetivo_estrategico || null,
                estrategia: row.estrategia || null,
                planes_asociados: row.planes_asociados || null,
                medios_verificacion: row.medios_verificacion || null,
                recursos_necesarios: row.recursos_necesarios || row.recursos_necesarios_ejecucion || null,
                monto_sep: row.monto_sep ? parseFloat(row.monto_sep) : null,
                monto_total: row.monto_total ? parseFloat(row.monto_total) : null,
                nivel_ejecucion: row.nivel_ejecucion || null,
                justificacion_nivel: row.justificacion_nivel || null,
                fecha_inicio: row.fecha_inicio || null,
                fecha_termino: row.fecha_termino || null,
                programa_asociado: row.programa_asociado || null,
                ate: row.ate || null,
                tic: row.tic || null,
                monto_general: row.monto_general ? parseFloat(row.monto_general) : null
            }));
            
            const response = await api.post('/pme/acciones/importar', mappedData);
            alert(`Importación completada: ${response.data.creados} creados, ${response.data.errores.length} errores`);
            setIsImportModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Error importing:', error);
            alert('Error al importar acciones');
        } finally {
            setIsSaving(false);
        }
    };

    const handleExport = () => {
        if (acciones.length === 0) {
            alert('No hay acciones para exportar');
            return;
        }
        
        const exportData = acciones.map(acc => ({
            id_accion: acc.id_accion,
            id_pme: acc.id_pme,
            nombre_accion: acc.nombre_accion,
            descripcion: acc.descripcion || '',
            verificacion: acc.verificacion || '',
            responsable: acc.responsable || '',
            estado: acc.estado,
            pme_year: acc.pme_year || '',
            dimension: acc.dimension || '',
            subdimensiones: acc.subdimensiones || '',
            objetivo_estrategico: acc.objetivo_estrategico || '',
            estrategia: acc.estrategia || '',
            planes_asociados: acc.planes_asociados || '',
            medios_verificacion: acc.medios_verificacion || '',
            recursos_necesarios: acc.recursos_necesarios || '',
            monto_sep: acc.monto_sep || '',
            monto_total: acc.monto_total || '',
            nivel_ejecucion: acc.nivel_ejecucion || '',
            justificacion_nivel: acc.justificacion_nivel || '',
            fecha_inicio: acc.fecha_inicio || '',
            fecha_termino: acc.fecha_termino || '',
            programa_asociado: acc.programa_asociado || '',
            ate: acc.ate || '',
            tic: acc.tic || '',
            monto_general: acc.monto_general || ''
        }));
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Acciones');
        XLSX.writeFile(wb, 'acciones_pme.xlsx');
    };

    const resetForm = () => {
        setFormData({
            nombre_accion: '',
            descripcion: '',
            verificacion: '',
            responsable: '',
            estado: 'Pendiente',
            activo: true,
            id_pme: '',
            dimension: '',
            subdimensiones: '',
            objetivo_estrategico: '',
            estrategia: '',
            planes_asociados: '',
            medios_verificacion: '',
            recursos_necesarios: '',
            monto_sep: '',
            monto_total: '',
            nivel_ejecucion: 'Aún no se encuentra evaluado',
            justificacion_nivel: 'Aún no se encuentra evaluado',
            fecha_inicio: '',
            fecha_termino: '',
            programa_asociado: 'SEP',
            ate: 'No',
            tic: '',
            monto_general: '0'
        });
        setModalTab('general');
        setEditingAccion(null);
        setDeletingAccion(null);
    };

    const handleEdit = (acc: Accion) => {
        setFormData({
            nombre_accion: acc.nombre_accion || '',
            descripcion: acc.descripcion || '',
            verificacion: acc.verificacion || '',
            responsable: acc.responsable || '',
            estado: acc.estado || 'Pendiente',
            activo: acc.activo !== false,
            id_pme: acc.id_pme?.toString() || '',
            dimension: acc.dimension || '',
            subdimensiones: acc.subdimensiones || '',
            objetivo_estrategico: acc.objetivo_estrategico || '',
            estrategia: acc.estrategia || '',
            planes_asociados: acc.planes_asociados || '',
            medios_verificacion: acc.medios_verificacion || '',
            recursos_necesarios: acc.recursos_necesarios || '',
            monto_sep: acc.monto_sep?.toString() || '',
            monto_total: acc.monto_total?.toString() || '',
            nivel_ejecucion: acc.nivel_ejecucion || 'Aún no se encuentra evaluado',
            justificacion_nivel: acc.justificacion_nivel || 'Aún no se encuentra evaluado',
            fecha_inicio: acc.fecha_inicio || '',
            fecha_termino: acc.fecha_termino || '',
            programa_asociado: acc.programa_asociado || 'SEP',
            ate: acc.ate || 'No',
            tic: acc.tic || '',
            monto_general: acc.monto_general?.toString() || '0'
        });
        setModalTab('general');
        setEditingAccion(acc);
        setIsModalOpen(true);
    };

    const handleDelete = async () => {
        if (!deletingAccion) return;
        setIsSaving(true);
        try {
            await api.delete(`/pme/acciones/${deletingAccion.id_accion}`);
            setDeletingAccion(null);
            fetchData();
        } catch (error) {
            console.error('Error deleting action:', error);
            alert('Error al eliminar la acción');
        } finally {
            setIsSaving(false);
        }
    };

    const term = searchTerm.toLowerCase().trim();
    const filtered = acciones.filter(acc =>
        (acc.nombre_accion || '').toLowerCase().includes(term) ||
        (acc.descripcion || '').toLowerCase().includes(term) ||
        (acc.objetivo_estrategico || '').toLowerCase().includes(term) ||
        (acc.estrategia || '').toLowerCase().includes(term) ||
        (acc.responsable || '').toLowerCase().includes(term) ||
        (acc.estado || '').toLowerCase().includes(term)
    );

    const getEstadoStyle = (estado: string) => {
        switch (estado) {
            case 'Finalizada':
                return { bg: 'bg-green-100', tx: 'text-green-700' };
            case 'En Curso':
                return { bg: 'bg-blue-100', tx: 'text-blue-700' };
            case 'Pendiente':
                return { bg: 'bg-amber-100', tx: 'text-amber-700' };
            default:
                return { bg: 'bg-gray-100', tx: 'text-gray-700' };
        }
    };

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Acciones PME</h2>
                    <p className="text-gray-500 mt-1.5 font-medium">Gestiona las acciones del Plan de Mejoramiento Educativo.</p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                    <div className="relative">
                        <select
                            value={selectedPme}
                            onChange={(e) => setSelectedPme(e.target.value ? parseInt(e.target.value) : '')}
                            className="w-full sm:w-auto appearance-none bg-white border border-gray-200 text-gray-800 py-2.5 pl-4 pr-10 rounded-xl leading-tight focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary font-semibold text-xs shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                        >
                            <option value="">Todos los PMEs</option>
                            {pmes.map(pme => (
                                <option key={pme.id_pme} value={pme.id_pme}>PME {pme.year} {pme.colegio_nombre ? `(${pme.colegio_nombre})` : ''}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>

                    <div className="relative min-w-[260px] md:w-80">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, descripción, objetivo o estrategia..."
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
                </div>
            </div>

            {canEdit && (
                <div className="mb-6 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex flex-wrap items-center gap-4">
                        <span className="text-sm font-medium text-gray-600">Crear acción:</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setViewMode('form'); setIsModalOpen(true); resetForm(); setEditingAccion(null); }}
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
                                    const ws = XLSX.utils.json_to_sheet([ACCION_EXAMPLE]);
                                    const wb = XLSX.utils.book_new();
                                    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
                                    XLSX.writeFile(wb, 'plantilla_acciones.xlsx');
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
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Acción</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Responsable</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Actividades</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Verificación</th>
                                {canEdit && (
                                    <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={canEdit ? 6 : 5} className="px-6 py-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="animate-spin" size={24} />
                                            <span>Cargando acciones...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={canEdit ? 6 : 5} className="px-6 py-12 text-center text-gray-400">
                                        No se encontraron acciones.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((acc) => {
                                    const style = getEstadoStyle(acc.estado);
                                    return (
                                        <tr key={acc.id_accion} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                                        <Target size={20} />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-900">{acc.nombre_accion}</p>
                                                        {acc.descripcion && (
                                                            <p className="text-xs text-gray-500 line-clamp-1">{acc.descripcion}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{acc.responsable || '-'}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1.5 items-start">
                                                    <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-bold rounded-full ${style.bg} ${style.tx}`}>
                                                        {acc.estado}
                                                    </span>
                                                    {canEdit ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleActivo(acc)}
                                                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                                                                acc.activo !== false
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                                            }`}
                                                            title={acc.activo !== false ? "Clic para desactivar acción" : "Clic para activar acción"}
                                                        >
                                                            <span className={`w-2 h-2 rounded-full shrink-0 ${acc.activo !== false ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                            <span>{acc.activo !== false ? 'Activa' : 'Desactivada'}</span>
                                                        </button>
                                                    ) : (
                                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                                            acc.activo !== false
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : 'bg-rose-50 text-rose-700 border-rose-200'
                                                        }`}>
                                                            <span className={`w-2 h-2 rounded-full shrink-0 ${acc.activo !== false ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                            <span>{acc.activo !== false ? 'Activa' : 'Desactivada'}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm">
                                                <span className="font-medium text-gray-900">{acc.actividades?.length || 0}</span>
                                                <span className="text-gray-400"> actividades</span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">{acc.verificacion || '-'}</td>
                                            {canEdit && (
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => setVerAccion(acc)}
                                                            className="p-1.5 text-gray-500 hover:text-primary hover:bg-gray-50 rounded-lg"
                                                            title="Ver actividades"
                                                        >
                                                            <Eye size={18} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleEdit(acc)}
                                                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" 
                                                            title="Editar"
                                                        >
                                                            <Edit size={18} />
                                                        </button>
                                                        <button 
                                                            onClick={() => setDeletingAccion(acc)}
                                                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg" 
                                                            title="Eliminar"
                                                        >
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
                title={editingAccion ? "Editar Acción PME" : "Nueva Acción PME"}
                maxWidth="max-w-2xl"
            >
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Header Pestañas de Navegación */}
                    <div className="flex items-center gap-1.5 p-1 bg-gray-100/90 rounded-2xl border border-gray-200/80">
                        <button
                            type="button"
                            onClick={() => setModalTab('general')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                                modalTab === 'general'
                                    ? 'bg-white text-primary shadow-xs'
                                    : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            <Target size={14} />
                            <span>1. General</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setModalTab('estrategico')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                                modalTab === 'estrategico'
                                    ? 'bg-white text-primary shadow-xs'
                                    : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            <Layers size={14} />
                            <span>2. Estrategia</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setModalTab('seguimiento')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                                modalTab === 'seguimiento'
                                    ? 'bg-white text-primary shadow-xs'
                                    : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            <Calendar size={14} />
                            <span>3. Seguimiento</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setModalTab('presupuesto')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                                modalTab === 'presupuesto'
                                    ? 'bg-white text-primary shadow-xs'
                                    : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            <DollarSign size={14} />
                            <span>4. Presupuesto</span>
                        </button>
                    </div>

                    {/* TAB 1: GENERAL */}
                    {modalTab === 'general' && (
                        <div className="space-y-4 animate-in fade-in duration-150">
                            {(() => {
                                const selectedPmeObj = pmes.find(p => p.id_pme.toString() === formData.id_pme?.toString());
                                const colegioDetected = selectedPmeObj?.colegio_nombre 
                                    || editingAccion?.colegio_nombre 
                                    || (selectedPme ? pmes.find(p => p.id_pme === selectedPme)?.colegio_nombre : '')
                                    || user?.colegio?.nombre
                                    || '';

                                const colType = getColegioColor(colegioDetected);

                                const selectStyle = colType === 'portales'
                                    ? 'border-blue-500 bg-blue-50/70 text-blue-950 font-semibold focus:ring-blue-300 focus:border-blue-600'
                                    : colType === 'macaya'
                                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold focus:ring-emerald-300 focus:border-emerald-600'
                                    : 'border-gray-200 bg-white text-gray-900 focus:ring-primary/20 focus:border-primary';

                                const badgeColor = colType === 'portales'
                                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                                    : colType === 'macaya'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : 'bg-gray-100 text-gray-600 border-gray-200';

                                return (
                                    <>
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                                                    PME Asociado <span className="text-red-500">*</span>
                                                </label>
                                                {colegioDetected && (
                                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                                                        {colegioDetected}
                                                    </span>
                                                )}
                                            </div>
                                            <select
                                                value={formData.id_pme}
                                                onChange={(e) => setFormData({ ...formData, id_pme: e.target.value })}
                                                required
                                                disabled={!!editingAccion}
                                                className={`w-full px-3.5 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-700 ${selectStyle}`}
                                            >
                                                <option value="">Seleccionar PME...</option>
                                                {pmes.map(pme => (
                                                    <option key={pme.id_pme} value={pme.id_pme}>
                                                        PME {pme.year} {pme.colegio_nombre ? `(${pme.colegio_nombre})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Nombre de la Acción <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.nombre_accion}
                                                onChange={(e) => setFormData({ ...formData, nombre_accion: e.target.value })}
                                                required
                                                placeholder="Ej: Taller de Convivencia Escolar..."
                                                className={`w-full px-3.5 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 transition-all font-semibold ${selectStyle}`}
                                            />
                                        </div>
                                    </>
                                );
                            })()}

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Descripción Detallada
                                </label>
                                <textarea
                                    value={formData.descripcion}
                                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                                    rows={3}
                                    placeholder="Detalla el propósito y alcance general de esta acción..."
                                    className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Responsable</label>
                                    <input
                                        type="text"
                                        value={formData.responsable}
                                        onChange={(e) => setFormData({ ...formData, responsable: e.target.value })}
                                        placeholder="Ej: Jefe Técnico / Inspector General"
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Estado</label>
                                    <select
                                        value={formData.estado}
                                        onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900 font-medium"
                                    >
                                        <option value="Pendiente">Pendiente</option>
                                        <option value="En Curso">En Curso</option>
                                        <option value="Finalizada">Finalizada</option>
                                    </select>
                                </div>
                            </div>

                            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200/80 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-bold text-gray-800 uppercase tracking-wider">Disponibilidad de la Acción</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Si está desactivada, sus actividades se mostrarán con borde rojo de advertencia.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.activo}
                                        onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                    <span className={`ml-3 text-xs font-bold ${formData.activo ? 'text-emerald-700' : 'text-rose-600'}`}>
                                        {formData.activo ? 'Activa' : 'Desactivada'}
                                    </span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Verificación General</label>
                                <input
                                    type="text"
                                    value={formData.verificacion}
                                    onChange={(e) => setFormData({ ...formData, verificacion: e.target.value })}
                                    placeholder="Ej: Encuesta de satisfacción docente / Actas firmadas"
                                    className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                />
                            </div>
                        </div>
                    )}

                    {/* TAB 2: ESTRATÉGICO */}
                    {modalTab === 'estrategico' && (
                        <div className="space-y-4 animate-in fade-in duration-150">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Dimensión PME</label>
                                    <select
                                        value={formData.dimension}
                                        onChange={(e) => setFormData({ ...formData, dimension: e.target.value })}
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900 font-medium"
                                    >
                                        <option value="">Seleccionar dimensión...</option>
                                        <option value="Gestión Pedagógica">Gestión Pedagógica</option>
                                        <option value="Liderazgo">Liderazgo</option>
                                        <option value="Convivencia Escolar">Convivencia Escolar</option>
                                        <option value="Gestión de Recursos">Gestión de Recursos</option>
                                        <option value="Recursos">Recursos</option>
                                        <option value="Docencia">Docencia</option>
                                        <option value="Bienestar">Bienestar</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Subdimensiones</label>
                                    <input
                                        type="text"
                                        value={formData.subdimensiones}
                                        onChange={(e) => setFormData({ ...formData, subdimensiones: e.target.value })}
                                        placeholder="Ej: Gestión Curricular, Apoyo al Aprendizaje"
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Objetivo Estratégico</label>
                                <textarea
                                    value={formData.objetivo_estrategico}
                                    onChange={(e) => setFormData({ ...formData, objetivo_estrategico: e.target.value })}
                                    rows={2}
                                    placeholder="Define el objetivo estratégico del PME al cual tributa esta acción..."
                                    className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Estrategia</label>
                                <textarea
                                    value={formData.estrategia}
                                    onChange={(e) => setFormData({ ...formData, estrategia: e.target.value })}
                                    rows={2}
                                    placeholder="Describe la estrategia o metodología de implementación..."
                                    className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Plan(es) Asociados</label>
                                <input
                                    type="text"
                                    value={formData.planes_asociados}
                                    onChange={(e) => setFormData({ ...formData, planes_asociados: e.target.value })}
                                    placeholder="Ej: Plan de Gestión de la Convivencia Escolar, Plan PIE"
                                    className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                />
                            </div>
                        </div>
                    )}

                    {/* TAB 3: SEGUIMIENTO & EJECUCIÓN */}
                    {modalTab === 'seguimiento' && (
                        <div className="space-y-4 animate-in fade-in duration-150">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Fecha Inicio</label>
                                    <input
                                        type="text"
                                        value={formData.fecha_inicio}
                                        onChange={(e) => setFormData({ ...formData, fecha_inicio: e.target.value })}
                                        placeholder="DD/MM/AAAA (Ej: 04/03/2026)"
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Fecha Término</label>
                                    <input
                                        type="text"
                                        value={formData.fecha_termino}
                                        onChange={(e) => setFormData({ ...formData, fecha_termino: e.target.value })}
                                        placeholder="DD/MM/AAAA (Ej: 30/11/2026)"
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Programa Asociado</label>
                                    <input
                                        type="text"
                                        value={formData.programa_asociado}
                                        onChange={(e) => setFormData({ ...formData, programa_asociado: e.target.value })}
                                        placeholder="Ej: SEP, GENERAL"
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">ATE (Asistencia Técnica)</label>
                                    <select
                                        value={formData.ate}
                                        onChange={(e) => setFormData({ ...formData, ate: e.target.value })}
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900 font-medium"
                                    >
                                        <option value="No">No</option>
                                        <option value="Sí">Sí</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">TIC / Lugar</label>
                                    <input
                                        type="text"
                                        value={formData.tic}
                                        onChange={(e) => setFormData({ ...formData, tic: e.target.value })}
                                        placeholder="Ej: Sala de clases"
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Nivel de Ejecución</label>
                                    <input
                                        type="text"
                                        value={formData.nivel_ejecucion}
                                        onChange={(e) => setFormData({ ...formData, nivel_ejecucion: e.target.value })}
                                        placeholder="Ej: Aún no se encuentra evaluado / En desarrollo"
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Justificación de Nivel</label>
                                    <input
                                        type="text"
                                        value={formData.justificacion_nivel}
                                        onChange={(e) => setFormData({ ...formData, justificacion_nivel: e.target.value })}
                                        placeholder="Justificación del estado actual..."
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Medios de Verificación</label>
                                <textarea
                                    value={formData.medios_verificacion}
                                    onChange={(e) => setFormData({ ...formData, medios_verificacion: e.target.value })}
                                    rows={2}
                                    placeholder="Temarios, encuestas, informes de impacto, fotos..."
                                    className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Recursos Necesarios para Ejecución</label>
                                <textarea
                                    value={formData.recursos_necesarios}
                                    onChange={(e) => setFormData({ ...formData, recursos_necesarios: e.target.value })}
                                    rows={2}
                                    placeholder="Formatos de proyectos, avances académicos, capacitaciones..."
                                    className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                />
                            </div>
                        </div>
                    )}

                    {/* TAB 4: PRESUPUESTO */}
                    {modalTab === 'presupuesto' && (
                        <div className="space-y-5 animate-in fade-in duration-150">
                            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                                <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider mb-3">Distribución Financiera</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-2xs">
                                        <label className="block text-[11px] font-bold text-primary uppercase mb-1">Monto SEP ($)</label>
                                        <input
                                            type="number"
                                            value={formData.monto_sep}
                                            onChange={(e) => setFormData({ ...formData, monto_sep: e.target.value })}
                                            min="0"
                                            step="1"
                                            placeholder="0"
                                            className="w-full px-2.5 py-1.5 text-sm font-bold border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900"
                                        />
                                    </div>

                                    <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-2xs">
                                        <label className="block text-[11px] font-bold text-violet-700 uppercase mb-1">Monto General ($)</label>
                                        <input
                                            type="number"
                                            value={formData.monto_general}
                                            onChange={(e) => setFormData({ ...formData, monto_general: e.target.value })}
                                            min="0"
                                            step="1"
                                            placeholder="0"
                                            className="w-full px-2.5 py-1.5 text-sm font-bold border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-600 text-gray-900"
                                        />
                                    </div>

                                    <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-2xs">
                                        <label className="block text-[11px] font-bold text-emerald-700 uppercase mb-1">Monto Total ($)</label>
                                        <input
                                            type="number"
                                            value={formData.monto_total}
                                            onChange={(e) => setFormData({ ...formData, monto_total: e.target.value })}
                                            min="0"
                                            step="1"
                                            placeholder="0"
                                            className="w-full px-2.5 py-1.5 text-sm font-bold border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-emerald-700"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer con Navegación y Botones */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-1.5">
                            {modalTab !== 'general' && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (modalTab === 'presupuesto') setModalTab('seguimiento');
                                        else if (modalTab === 'seguimiento') setModalTab('estrategico');
                                        else if (modalTab === 'estrategico') setModalTab('general');
                                    }}
                                    className="px-3.5 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                                >
                                    ← Anterior
                                </button>
                            )}
                            {modalTab !== 'presupuesto' && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (modalTab === 'general') setModalTab('estrategico');
                                        else if (modalTab === 'estrategico') setModalTab('seguimiento');
                                        else if (modalTab === 'seguimiento') setModalTab('presupuesto');
                                    }}
                                    className="px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/10 rounded-xl transition-colors"
                                >
                                    Siguiente →
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2.5">
                            <button
                                type="button"
                                onClick={() => { setIsModalOpen(false); resetForm(); }}
                                className="px-4 py-2.5 text-xs font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="px-5 py-2.5 text-xs font-bold text-white bg-primary hover:bg-blue-600 rounded-xl shadow-md shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSaving && <Loader2 size={15} className="animate-spin" />}
                                {editingAccion ? 'Actualizar Acción' : 'Guardar Acción'}
                            </button>
                        </div>
                    </div>
                </form>
            </Modal>

            {isImportModalOpen && (
                <UploadExcel
                    onUpload={handleImport}
                    onClose={() => setIsImportModalOpen(false)}
                    templateColumns={ACCION_COLUMNS}
                    templateExample={ACCION_EXAMPLE}
                />
            )}

            <Modal
                isOpen={!!deletingAccion}
                onClose={() => setDeletingAccion(null)}
                title="Confirmar Eliminación"
                maxWidth="max-w-sm"
            >
                <div className="py-4">
                    <p className="text-gray-600 mb-6">
                        ¿Estás seguro de que deseas eliminar la acción <strong className="text-gray-900">{deletingAccion?.nombre_accion}</strong>? Esta acción no se puede deshacer.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setDeletingAccion(null)}
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

            {/* Modal: Actividades de la Acción */}
            <Modal
                isOpen={!!verAccion}
                onClose={() => setVerAccion(null)}
                title={`Actividades — ${verAccion?.nombre_accion || ''}`}
                maxWidth="max-w-3xl"
            >
                <div className="space-y-4">
                    <p className="text-xs text-gray-400 font-medium">
                        {verAccion?.actividades?.length || 0} actividad(es) asociadas a esta acción.
                    </p>
                    {(!verAccion?.actividades || verAccion.actividades.length === 0) ? (
                        <div className="py-10 text-center text-gray-400 text-sm font-medium">
                            Esta acción no tiene actividades registradas.
                        </div>
                    ) : (
                        <div className="border border-gray-100 rounded-2xl overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actividad</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Descripción</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Dimensión</th>
                                        <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {(verAccion.actividades as any[]).map((act) => (
                                        <tr key={act.id_actividad} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">{act.nombre_actividad}</td>
                                            <td className="px-4 py-3 text-xs text-gray-500 max-w-[260px]">
                                                <span className="line-clamp-2">{act.descripcion || '-'}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {act.dimension ? (
                                                    <span className="px-2.5 py-1 inline-flex text-[10px] font-bold rounded-full bg-primary/10 text-primary">{act.dimension}</span>
                                                ) : <span className="text-gray-400 text-xs">-</span>}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => setVerActividad(act)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary hover:text-white transition-all"
                                                >
                                                    <Eye size={13} /> Ver completo
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Modal: Detalle completo de una Actividad */}
            <Modal
                isOpen={!!verActividad}
                onClose={() => setVerActividad(null)}
                title={verActividad?.nombre_actividad || 'Detalle de Actividad'}
                maxWidth="max-w-lg"
            >
                {verActividad && (
                    <div className="space-y-4">
                        {[
                            { label: 'Nombre de la Actividad', value: verActividad.nombre_actividad },
                            { label: 'Descripción', value: verActividad.descripcion },
                            { label: 'Dimensión', value: verActividad.dimension },
                            { label: 'Subdimensión', value: verActividad.subdimension },
                            { label: 'Responsable', value: verActividad.responsable },
                            { label: 'Medios de Verificación', value: verActividad.medios_verificacion },
                            { label: 'Recursos / Lista', value: verActividad.lista_recursos },
                            { label: 'Costo Estimado', value: verActividad.costo_estimado != null ? `$${Number(verActividad.costo_estimado).toLocaleString('es-CL')}` : null },
                        ].map(({ label, value }) => (
                            <div key={label}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
                                <p className="text-sm text-gray-800 font-medium mt-0.5 whitespace-pre-wrap">{value || '—'}</p>
                            </div>
                        ))}
                        <div className="flex justify-end pt-2">
                            <button
                                onClick={() => setVerActividad(null)}
                                className="px-5 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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