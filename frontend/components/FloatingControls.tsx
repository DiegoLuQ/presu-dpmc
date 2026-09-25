'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Palette, Sparkles, Check, ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';

export const AI_PROVIDER_KEY = 'ai_provider_override';

// ── Tema ─────────────────────────────────────────────────────────────────────

type Theme = 'default' | 'mc' | 'dp';

const THEMES: { value: Theme; label: string; color: string }[] = [
    { value: 'default', label: 'Original',      color: '#0d7ff2' },
    { value: 'mc',      label: 'Macaya (Verde)', color: '#14532d' },
    { value: 'dp',      label: 'Diego Portales (Azul)', color: '#1e3a8a' },
];

// ── Proveedores IA ────────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { label: string; color: string }> = {
    groq:       { label: 'Groq',       color: '#f55036' },
    nvidia:     { label: 'Nvidia',     color: '#76b900' },
    deepseek:   { label: 'DeepSeek',   color: '#4d6bfe' },
    openrouter: { label: 'OpenRouter', color: '#6d28d9' },
    gemini:     { label: 'Gemini',     color: '#1a73e8' },
};

// Solo el administrador elige proveedor/modelo de IA. Para todos los demás
// (incluidos Director y Gerente, que sí administran las API keys) el proveedor
// lo fija el predeterminado de Configuración → API Key AI. Debe coincidir con
// ROLES_ELIGEN_PROVEEDOR_AI del backend (ai_config.py), que es quien realmente
// lo hace cumplir.
const ROLES_ELIGEN_PROVEEDOR_IA = ['ADM'];

// ── Componente ────────────────────────────────────────────────────────────────

export default function FloatingControls() {
    const { user, codigoRol } = useAuth();
    const containerRef = useRef<HTMLDivElement>(null);

    // Tema
    const [theme, setTheme] = useState<Theme>('default');
    const [themeOpen, setThemeOpen] = useState(false);

    // IA — el selector solo lo ve el administrador; el resto usa el proveedor
    // predeterminado del colegio sin poder cambiarlo.
    const canSeeAI = !!user && ROLES_ELIGEN_PROVEEDOR_IA.includes((codigoRol || '').trim().toUpperCase());
    const [aiOpen, setAiOpen] = useState(false);
    const [activeProvider, setActiveProvider] = useState<string | null>(null);
    const [activeModelo, setActiveModelo] = useState<string | null>(null);
    const [availableProviders, setAvailableProviders] = useState<{ proveedor: string; modelo: string }[]>([]);
    // Las API keys pertenecen a otro colegio (respaldo compartido del backend).
    const [providersCompartidos, setProvidersCompartidos] = useState(false);

    // Cargar tema guardado
    useEffect(() => {
        const saved = localStorage.getItem('theme') as Theme | null;
        if (saved) {
            setTheme(saved);
            document.documentElement.setAttribute('data-theme', saved);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }, []);

    // Si el usuario no puede elegir proveedor, borra un override que haya quedado
    // guardado (p. ej. de una sesión anterior de administrador en este navegador).
    // El backend ya lo ignora; esto evita además que reaparezca en la UI.
    useEffect(() => {
        if (user && !canSeeAI) localStorage.removeItem(AI_PROVIDER_KEY);
    }, [user, canSeeAI]);

    const fetchProviders = () => {
        if (!canSeeAI) return;
        const stored = localStorage.getItem(AI_PROVIDER_KEY);
        api.get('/ai/proveedor-activo').then(res => {
            if (stored) {
                setActiveProvider(stored);
            } else if (res.data.proveedor) {
                setActiveProvider(res.data.proveedor);
                setActiveModelo(res.data.modelo);
            }
        }).catch(() => {});
        api.get('/ai/proveedores-disponibles').then(res => {
            setAvailableProviders(res.data.map((p: any) => ({ proveedor: p.proveedor, modelo: p.modelo })));
            setProvidersCompartidos(res.data.some((p: any) => p.compartido));
        }).catch(() => {});
    };

    // Cargar proveedor IA al montar o cambiar permisos
    useEffect(() => {
        if (canSeeAI) {
            fetchProviders();
        }
    }, [canSeeAI]);

    useEffect(() => {
        const prov = availableProviders.find(p => p.proveedor === activeProvider);
        if (prov) setActiveModelo(prov.modelo);
    }, [activeProvider, availableProviders]);

    // Cerrar al click fuera
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setThemeOpen(false);
                setAiOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleTheme = (t: Theme) => {
        setTheme(t);
        localStorage.setItem('theme', t);
        if (t === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', t);
        }
        setThemeOpen(false);
    };

    const handleAISelect = (proveedor: string) => {
        setActiveProvider(proveedor);
        localStorage.setItem(AI_PROVIDER_KEY, proveedor);
        setAiOpen(false);
    };

    const currentTheme = THEMES.find(t => t.value === theme) ?? THEMES[0];
    const aiMeta = activeProvider ? PROVIDER_META[activeProvider] : null;

    return (
        <div ref={containerRef} className="fixed bottom-5 right-5 z-50" suppressHydrationWarning>
            {/* ── Botón circular flotante compacto ── */}
            <button
                onClick={() => setThemeOpen(o => !o)}
                className="w-10 h-10 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-full shadow-md flex items-center justify-center transition-all active:scale-95"
                title="Ajustes de sistema (Tema / IA)"
            >
                <Palette size={18} className="text-gray-600" />
            </button>

            {/* ── Popover desplegable ── */}
            {themeOpen && (
                <div className="absolute right-0 bottom-full mb-3 w-60 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 z-50 space-y-3">
                    {/* Sección Tema */}
                    <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-1">
                            Tema visual
                        </div>
                        <div className="space-y-0.5">
                            {THEMES.map(t => (
                                <button key={t.value} onClick={() => handleTheme(t.value)}
                                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-50 transition-colors text-left ${theme === t.value ? 'bg-gray-50' : ''}`}
                                >
                                    <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                                    <span className={`text-xs flex-1 ${theme === t.value ? 'font-bold text-gray-900' : 'font-medium text-gray-600'}`}>
                                        {t.label}
                                    </span>
                                    {theme === t.value && <Check size={12} className="text-primary shrink-0" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sección IA */}
                    {canSeeAI && (
                        <div className="pt-2 border-t border-gray-100">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-1 flex items-center gap-1">
                                <Sparkles size={10} className="text-purple-500" /> Proveedor de IA
                            </div>
                            <div className="space-y-0.5">
                                {availableProviders.length === 0 ? (
                                    <div className="px-2 py-1 text-[11px] text-gray-400 leading-relaxed">
                                        Ningún proveedor configurado en el sistema. Un administrador debe registrarlo en
                                        <span className="font-semibold text-gray-500"> Configuración → API Key AI</span>.
                                    </div>
                                ) : (
                                    availableProviders.map(({ proveedor, modelo }) => {
                                        const m = PROVIDER_META[proveedor];
                                        const isActive = activeProvider === proveedor;
                                        return (
                                            <button key={proveedor} onClick={() => handleAISelect(proveedor)}
                                                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-50 transition-colors text-left ${isActive ? 'bg-gray-50' : ''}`}
                                            >
                                                <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white shrink-0"
                                                    style={{ backgroundColor: m?.color ?? '#888' }}>
                                                    <Sparkles size={8} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-xs truncate ${isActive ? 'font-bold text-gray-900' : 'font-medium text-gray-600'}`}>
                                                        {m?.label ?? proveedor}
                                                    </div>
                                                    <div className="text-[9px] text-gray-400 truncate">{modelo}</div>
                                                </div>
                                                {isActive && <Check size={12} className="text-primary shrink-0" />}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                            {providersCompartidos && (
                                <div className="px-2 pt-1.5 text-[9px] text-gray-400 leading-relaxed">
                                    Tu colegio aún no tiene API keys propias: se usan las del colegio que ya las configuró.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
