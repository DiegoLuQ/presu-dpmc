'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Sparkles, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';

export const AI_PROVIDER_KEY = 'ai_provider_override';

const PROVIDER_META: Record<string, { label: string; color: string }> = {
    groq:       { label: 'Groq',       color: '#f55036' },
    nvidia:     { label: 'Nvidia',     color: '#76b900' },
    deepseek:   { label: 'DeepSeek',   color: '#4d6bfe' },
    openrouter: { label: 'OpenRouter', color: '#6d28d9' },
};

const ALLOWED_ROLES = ['ADM', 'DIR', 'GERENTE'];

export default function AiProviderSelector() {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [activeProvider, setActiveProvider] = useState<string | null>(null);
    const [activeModelo, setActiveModelo] = useState<string | null>(null);
    const [availableProviders, setAvailableProviders] = useState<{ proveedor: string; modelo: string }[]>([]);
    const ref = useRef<HTMLDivElement>(null);

    const canSee = !!user;

    useEffect(() => {
        if (!canSee) return;
        const stored = localStorage.getItem(AI_PROVIDER_KEY);

        api.get('/ai/proveedor-activo').then(res => {
            const defaultProv = res.data.proveedor;
            const defaultMod  = res.data.modelo;
            if (stored) {
                setActiveProvider(stored);
            } else if (defaultProv) {
                setActiveProvider(defaultProv);
                setActiveModelo(defaultMod);
            }
        }).catch(() => {});

        api.get('/ai/proveedores').then(res => {
            setAvailableProviders(res.data.map((p: any) => ({ proveedor: p.proveedor, modelo: p.modelo })));
        }).catch(() => {});
    }, [canSee]);

    useEffect(() => {
        const prov = availableProviders.find(p => p.proveedor === activeProvider);
        if (prov) setActiveModelo(prov.modelo);
    }, [activeProvider, availableProviders]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    if (!canSee) return null;

    const meta = activeProvider ? PROVIDER_META[activeProvider] : null;

    const handleSelect = (proveedor: string) => {
        setActiveProvider(proveedor);
        localStorage.setItem(AI_PROVIDER_KEY, proveedor);
        setIsOpen(false);
    };

    return (
        <div ref={ref} className="fixed bottom-6 right-[4.5rem] z-50">
            <div className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-3 py-2 bg-white rounded-full shadow-md border border-gray-100 hover:shadow-lg transition-all focus:outline-none"
                    title="Proveedor de IA"
                >
                    <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: meta?.color ?? '#6d28d9' }}
                    >
                        <Sparkles size={13} />
                    </div>
                    {activeProvider && (
                        <span className="text-xs font-bold text-gray-700 hidden sm:block">
                            {meta?.label ?? activeProvider}
                        </span>
                    )}
                    <ChevronDown size={13} className="text-gray-400" />
                </button>

                {isOpen && (
                    <div className="absolute right-0 bottom-full mb-3 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-2 animate-in fade-in slide-in-from-bottom-2">
                        <div className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Proveedor de IA
                        </div>

                        {availableProviders.length === 0 ? (
                            <div className="px-4 py-3 text-xs text-gray-500">
                                Sin proveedores configurados.
                                <br />
                                <span className="text-primary font-semibold">Configuración → API Key AI</span>
                            </div>
                        ) : (
                            availableProviders.map(({ proveedor, modelo }) => {
                                const m = PROVIDER_META[proveedor];
                                const isActive = activeProvider === proveedor;
                                return (
                                    <button
                                        key={proveedor}
                                        onClick={() => handleSelect(proveedor)}
                                        className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors ${isActive ? 'bg-gray-50' : ''}`}
                                    >
                                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0"
                                            style={{ backgroundColor: m?.color ?? '#888' }}>
                                            <Sparkles size={10} />
                                        </div>
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <span className={`text-sm font-semibold ${isActive ? 'text-gray-900' : 'text-gray-600'}`}>
                                                {m?.label ?? proveedor}
                                            </span>
                                            <span className="text-[10px] text-gray-400 truncate">{modelo}</span>
                                        </div>
                                        {isActive && <Check size={13} className="text-primary shrink-0" />}
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
