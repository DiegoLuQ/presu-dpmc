'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Search, Plus, Target, CheckCircle2, PlayCircle, BarChart3, ChevronDown } from 'lucide-react';

export default function PMEPage() {
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');

    // Mock data for UI demonstration until API is fully wired
    const mockPme = [
        { id: '1', accion: 'Taller de Convivencia Escolar', dimension: 'Convivencia', responsable: 'M. González', avance: 75, estado: 'En Curso', color: 'bg-blue-500', bg: 'bg-blue-100', tx: 'text-blue-700' },
        { id: '2', accion: 'Reforzamiento Matemático 4to Básico', dimension: 'Gestión Pedagógica', responsable: 'J. Pérez', avance: 40, estado: 'En Curso', color: 'bg-blue-500', bg: 'bg-blue-100', tx: 'text-blue-700' },
        { id: '3', accion: 'Mejora de Laboratorio Ciencias', dimension: 'Recursos', responsable: 'C. Silva', avance: 100, estado: 'Finalizada', color: 'bg-green-500', bg: 'bg-green-100', tx: 'text-green-700' },
        { id: '4', accion: 'Capacitación Evaluación Docente', dimension: 'Gestión Pedagógica', responsable: 'A. Martínez', avance: 15, estado: 'En Curso', color: 'bg-blue-500', bg: 'bg-blue-100', tx: 'text-blue-700' },
    ];

    const filtered = mockPme.filter(req =>
        req.accion.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.dimension.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Plan de Mejoramiento Educativo (PME)</h2>
                    <p className="text-gray-500 mt-1.5 font-medium">Seguimiento de acciones y metas institucionales.</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative">
                        <select className="appearance-none bg-white border border-gray-200 text-gray-700 py-2.5 pl-4 pr-10 rounded-xl leading-tight focus:outline-none focus:ring-primary focus:border-primary font-semibold text-sm shadow-sm">
                            <option>Año 2026</option>
                            <option>Año 2025</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                            <ChevronDown size={16} />
                        </div>
                    </div>

                    <div className="relative flex-1 md:w-56">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar acción..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm transition-colors text-gray-900"
                        />
                    </div>
                    <button className="bg-primary hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-primary/30 flex items-center transition-all duration-200 whitespace-nowrap">
                        <Plus size={20} className="md:mr-2" />
                        <span className="hidden md:inline">Nueva Acción</span>
                    </button>
                </div>
            </div>

            {/* Progress Card Section */}
            <div className="mb-8 bg-white rounded-[24px] p-8 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col md:flex-row items-center gap-8 md:gap-16">

                {/* Visual Progress relative size */}
                <div className="relative flex shrink-0 items-center justify-center h-48 w-48 bg-gradient-to-tr from-blue-50 to-primary/10 rounded-[28px] border-4 border-white shadow-inner">
                    <div className="absolute inset-2 bg-gradient-to-tr from-primary to-secondary rounded-[22px] opacity-10"></div>
                    <svg className="w-40 h-40 transform -rotate-90">
                        <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-100" />
                        <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray="440" strokeDashoffset="154" className="text-primary" />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-4xl font-extrabold text-gray-900 tracking-tighter">65<span className="text-xl">%</span></span>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Avance</span>
                    </div>
                </div>

                {/* Progress Stats */}
                <div className="flex-1 w-full relative">
                    <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                        <BarChart3 className="text-primary mr-2" size={24} /> Resumen General PME 2026
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100/80">
                            <div className="flex items-center gap-2 mb-2 text-gray-500">
                                <Target size={18} />
                                <span className="text-sm font-semibold">Totales</span>
                            </div>
                            <span className="text-3xl font-bold text-gray-900">12</span>
                        </div>

                        <div className="bg-blue-50/30 p-5 rounded-2xl border border-blue-100/50">
                            <div className="flex items-center gap-2 mb-2 text-blue-600">
                                <PlayCircle size={18} />
                                <span className="text-sm font-semibold">En Curso</span>
                            </div>
                            <span className="text-3xl font-bold text-gray-900">8</span>
                        </div>

                        <div className="bg-green-50/30 p-5 rounded-2xl border border-green-100/50">
                            <div className="flex items-center gap-2 mb-2 text-green-600">
                                <CheckCircle2 size={18} />
                                <span className="text-sm font-semibold">Finalizadas</span>
                            </div>
                            <span className="text-3xl font-bold text-gray-900">4</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Acción
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Dimensión
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Responsable
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-48">
                                    Avance (%)
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Estado
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filtered.map((req, i) => (
                                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-gray-900 border-l-2 border-transparent hover:border-primary">
                                        {req.accion}
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-500">
                                        {req.dimension}
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700 font-medium">
                                        <div className="flex items-center">
                                            <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold mr-2">
                                                {req.responsable[0]}
                                            </div>
                                            {req.responsable}
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        <div className="flex items-center w-full">
                                            <span className="text-xs font-bold text-gray-700 w-8">{req.avance}%</span>
                                            <div className="flex-1 ml-2 bg-gray-100 rounded-full h-2 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${req.color}`} style={{ width: `${req.avance}%` }}></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 whitespace-nowrap">
                                        <span className={`px-3 py-1 inline-flex items-center text-xs leading-5 font-bold rounded-full ${req.bg} ${req.tx}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 self-center ${req.color}`}></span>
                                            {req.estado}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
