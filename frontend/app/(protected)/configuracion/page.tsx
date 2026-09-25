'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { UploadCloud, Building2, UserCircle, KeyRound, Sparkles, BarChart2, ShieldAlert, Lock, SlidersHorizontal } from 'lucide-react';
import RolesConfig from './RolesConfig';
import ColegioConfig from './ColegioConfig';
import AreasConfig from './AreasConfig';
import AiConfig from './AiConfig';
import AiUsoTokens from './AiUsoTokens';
import ColumnasConfig from './ColumnasConfig';
import SeccionesAccesoConfig from './SeccionesAccesoConfig';

export default function ConfiguracionPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('Colegio');

    const tabs = [
        { name: 'Perfil', icon: UserCircle },
        { name: 'Colegio', icon: Building2 },
        { name: 'Áreas', icon: UploadCloud },
        { name: 'Roles y Permisos', icon: KeyRound },
        { name: 'Acceso Restringido', icon: Lock },
        { name: 'Columnas y Motivos', icon: SlidersHorizontal },
        { name: 'API Key AI', icon: Sparkles },
        { name: 'Uso de IA', icon: BarChart2 },
    ];

    return (
        <div className="animate-in fade-in duration-500">
            {/* Header */}
            <div className="mb-8">
                <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Configuración del Sistema</h2>
                <p className="text-gray-500 mt-1.5 font-medium">Administra la configuración institucional y tus preferencias personales.</p>
            </div>

            {/* Horizontal Tabs */}
            <div className="border-b border-gray-200 mb-8">
                <nav className="-mb-px flex space-x-8 overflow-x-auto hide-scrollbar">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.name;
                        return (
                            <button
                                key={tab.name}
                                onClick={() => setActiveTab(tab.name)}
                                className={`
                                    whitespace-nowrap pb-4 px-1 border-b-2 font-semibold text-sm flex items-center gap-2 transition-colors
                                    ${isActive
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }
                                `}
                            >
                                <Icon size={18} />
                                {tab.name}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Tab Content: Colegio */}
            {activeTab === 'Colegio' && <ColegioConfig />}

            {/* Tab Content: Roles y Permisos */}
            {activeTab === 'Roles y Permisos' && <RolesConfig />}

            {/* Tab Content: Acceso Restringido (secciones restringidas y whitelist de usuarios) */}
            {activeTab === 'Acceso Restringido' && <SeccionesAccesoConfig />}

            {/* Tab Content: Áreas */}
            {activeTab === 'Áreas' && <AreasConfig />}

            {/* Tab Content: Columnas y Motivos */}
            {activeTab === 'Columnas y Motivos' && <ColumnasConfig />}

            {/* Tab Content: API Key AI */}
            {activeTab === 'API Key AI' && <AiConfig />}

            {/* Tab Content: Uso de IA */}
            {activeTab === 'Uso de IA' && <AiUsoTokens />}

            {activeTab !== 'Colegio' && activeTab !== 'Roles y Permisos' && activeTab !== 'Acceso Restringido' && activeTab !== 'Áreas' && activeTab !== 'Columnas y Motivos' && activeTab !== 'API Key AI' && activeTab !== 'Uso de IA' && (
                <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-16 text-center animate-in fade-in duration-300">
                    <p className="text-gray-500 font-medium">Esta sección ({activeTab}) está en desarrollo.</p>
                </div>
            )}
        </div>
    );
}
