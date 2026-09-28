'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, Lock, Mail, Loader2, KeyRound, Wallet, ShoppingCart, ClipboardList } from 'lucide-react';

const FUNCIONES = [
    { icon: Wallet, texto: 'Planificación del presupuesto anual por área' },
    { icon: ClipboardList, texto: 'Solicitudes de recursos y convocatorias' },
    { icon: ShoppingCart, texto: 'Seguimiento de compras y entregas' },
];

export default function LoginPage() {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [verPassword, setVerPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showForgot, setShowForgot] = useState(false);
    const { login } = useAuth();

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!EMAIL_REGEX.test(identifier.trim())) {
            setError('Ingrese un correo electrónico válido.');
            return;
        }
        setLoading(true);
        try {
            await login(identifier.trim(), password);
        } catch (err: any) {
            const detalle = err.response?.data?.detail;
            setError(detalle || 'Correo electrónico o contraseña incorrectos.');
        } finally {
            setLoading(false);
        }
    };

    // text-base en móvil (16px) evita el zoom automático de iOS al enfocar el campo
    const inputClass = "block w-full pl-10 pr-3 py-3 sm:py-2.5 border border-gray-300 rounded-xl text-base sm:text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors";

    return (
        <div className="min-h-[100dvh] flex flex-col lg:flex-row bg-gray-50">
            {/* Panel de marca: franja compacta en móvil, columna completa en escritorio */}
            <aside className="relative overflow-hidden bg-gradient-to-br from-primary to-secondary text-white px-6 py-8 sm:px-10 lg:w-[44%] lg:py-12 lg:flex lg:flex-col lg:justify-between">
                <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
                <div className="absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-white/5 hidden lg:block" aria-hidden="true" />

                <div className="relative flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center">
                        <Lock size={20} />
                    </div>
                    <div>
                        <div className="text-lg font-bold leading-tight">MCDP ERP</div>
                        <div className="text-xs text-white/75">Colegios Macaya y Diego Portales</div>
                    </div>
                </div>

                <div className="relative hidden lg:block max-w-md">
                    <h1 className="text-3xl xl:text-4xl font-bold leading-tight text-balance">
                        Presupuesto, solicitudes y compras en un solo lugar
                    </h1>
                    <ul className="mt-8 space-y-4">
                        {FUNCIONES.map(({ icon: Icon, texto }) => (
                            <li key={texto} className="flex items-center gap-3 text-sm text-white/90">
                                <span className="h-9 w-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                                    <Icon size={17} />
                                </span>
                                {texto}
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative hidden lg:block text-xs text-white/60">Sistema creado por Tics e Innovación</p>
            </aside>

            {/* Formulario */}
            <main className="flex-1 flex items-start sm:items-center justify-center px-5 py-8 sm:px-8 sm:py-12">
                <div className="w-full max-w-sm sm:max-w-md sm:bg-white sm:rounded-2xl sm:shadow-xl sm:shadow-gray-200/60 sm:border sm:border-gray-100 sm:p-8 lg:shadow-none lg:border-0 lg:bg-transparent">
                    <div className="mb-7">
                        <h2 className="text-2xl font-bold text-gray-900">Iniciar sesión</h2>
                        <p className="mt-1 text-sm text-gray-500">Ingrese sus credenciales para acceder</p>
                    </div>

                    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                        <div>
                            <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1.5">
                                Correo electrónico
                            </label>
                            <div className="relative">
                                <Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                <input
                                    id="identifier"
                                    type="email"
                                    inputMode="email"
                                    autoComplete="email"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    enterKeyHint="next"
                                    required
                                    className={inputClass}
                                    placeholder="ejemplo@correo.cl"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                    Contraseña
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowForgot(true)}
                                    className="text-xs font-semibold text-primary hover:underline py-1"
                                >
                                    ¿Olvidó su contraseña?
                                </button>
                            </div>
                            <div className="relative">
                                <KeyRound size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                <input
                                    id="password"
                                    type={verPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    enterKeyHint="go"
                                    required
                                    className={`${inputClass} pr-11`}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setVerPassword(v => !v)}
                                    aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600"
                                >
                                    {verPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div role="alert" className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl py-2.5 px-3">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 py-3 px-4 text-base sm:text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-primary to-secondary hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-primary/25 transition-opacity"
                        >
                            {loading ? <><Loader2 size={18} className="animate-spin" /> Entrando...</> : 'Ingresar'}
                        </button>
                    </form>

                    <p className="mt-8 text-center text-xs text-gray-400 lg:hidden">
                        Sistema creado por Tics e Innovación
                    </p>
                </div>
            </main>

            {/* Modal: Olvidó su contraseña (hoja inferior en móvil, centrado en escritorio) */}
            {showForgot && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4 animate-in fade-in duration-150" onClick={() => setShowForgot(false)}>
                    <div
                        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                <KeyRound size={18} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-base font-bold text-gray-900">Recuperar contraseña</h3>
                                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                                    Por seguridad, el restablecimiento de contraseña lo realiza el administrador del sistema.
                                    Escríbenos a{' '}
                                    <a href="mailto:informatica@colegiomacaya.cl" className="text-primary font-semibold hover:underline break-all">
                                        informatica@colegiomacaya.cl
                                    </a>{' '}
                                    indicando tu correo registrado y te ayudaremos a recuperar el acceso.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowForgot(false)}
                            className="mt-5 w-full sm:w-auto sm:ml-auto sm:flex px-5 py-3 sm:py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:opacity-90 transition-opacity"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
