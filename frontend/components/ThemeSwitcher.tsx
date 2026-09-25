'use client';

import React, { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';

type Theme = 'default' | 'mc' | 'dp';

export default function ThemeSwitcher() {
    const [theme, setTheme] = useState<Theme>('default');
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') as Theme | null;
        if (savedTheme) {
            setTheme(savedTheme);
            document.documentElement.setAttribute('data-theme', savedTheme);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }, []);

    const handleThemeChange = (newTheme: Theme) => {
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        if (newTheme === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', newTheme);
        }
        setIsOpen(false);
    };

    return (
        <div className="fixed bottom-6 right-8 z-40">
            <div className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-3 py-2 bg-white rounded-full shadow-md border border-gray-100 hover:shadow-lg transition-all focus:outline-none"
                    title="Cambiar Tema"
                >
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white">
                        <Palette size={14} />
                    </div>
                </button>

                {isOpen && (
                    <div className="absolute right-0 bottom-full mb-3 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 animate-in fade-in slide-in-from-bottom-2">
                        <div className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Seleccionar Tema
                        </div>
                        <button
                            onClick={() => handleThemeChange('default')}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors ${theme === 'default' ? 'font-bold text-gray-900 bg-gray-50' : 'text-gray-600'}`}
                        >
                            <div className="w-4 h-4 rounded-full bg-[#0d7ff2]" />
                            Por Defecto (Original)
                        </button>
                        <button
                            onClick={() => handleThemeChange('mc')}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors ${theme === 'mc' ? 'font-bold text-gray-900 bg-gray-50' : 'text-gray-600'}`}
                        >
                            <div className="w-4 h-4 rounded-full bg-[#1e6040]" />
                            Tema MC (Verde)
                        </button>
                        <button
                            onClick={() => handleThemeChange('dp')}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors ${theme === 'dp' ? 'font-bold text-gray-900 bg-gray-50' : 'text-gray-600'}`}
                        >
                            <div className="w-4 h-4 rounded-full bg-[#f97316]" />
                            Tema DP (Naranja)
                        </button>
                    </div>
                )}
            </div>
            {isOpen && (
                <div
                    className="fixed inset-0 z-[-1]"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </div>
    );
}
