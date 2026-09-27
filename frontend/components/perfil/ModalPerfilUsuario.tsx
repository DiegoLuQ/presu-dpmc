'use client';

import React, { useState, useEffect } from 'react';
import { 
    X, KeyRound, User, Mail, Shield, School, Briefcase, Eye, EyeOff, 
    CheckCircle2, AlertCircle, Loader2, Lock, ShieldCheck, Check, Fingerprint, Calendar
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';

export default function ModalPerfilUsuario() {
    const { user, modalPerfilAbierto, cerrarModalPerfil, colegios, colegioActivo } = useAuth();

    // Tab activa: 'seguridad' (default) | 'cuenta'
    const [tabActiva, setTabActiva] = useState<'seguridad' | 'cuenta'>('seguridad');

    // Estados para el formulario de cambio de contraseña
    const [passwordActual, setPasswordActual] = useState('');
    const [passwordNueva, setPasswordNueva] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');

    const [mostrarActual, setMostrarActual] = useState(false);
    const [mostrarNueva, setMostrarNueva] = useState(false);
    const [mostrarConfirm, setMostrarConfirm] = useState(false);

    const [guardando, setGuardando] = useState(false);
    const [mensajeError, setMensajeError] = useState<string | null>(null);
    const [mensajeExito, setMensajeExito] = useState<string | null>(null);

    // Escuchar tecla Escape para cerrar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && modalPerfilAbierto) {
                handleCerrar();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [modalPerfilAbierto]);

    if (!modalPerfilAbierto || !user) return null;

    const colegioActual = colegios.find(c => c.id_colegio === (colegioActivo || user.id_colegio)) || user.colegio;

    const handleCerrar = () => {
        setPasswordActual('');
        setPasswordNueva('');
        setPasswordConfirm('');
        setMensajeError(null);
        setMensajeExito(null);
        setTabActiva('seguridad');
        cerrarModalPerfil();
    };

    // Validaciones en tiempo real
    const tieneLongitud = passwordNueva.length >= 6;
    const coinciden = passwordNueva.length > 0 && passwordNueva === passwordConfirm;
    const esDiferente = passwordActual.length > 0 && passwordNueva.length > 0 && passwordActual !== passwordNueva;
    const puedeEnviar = passwordActual.length > 0 && tieneLongitud && coinciden && esDiferente;

    const handleSubmitPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setMensajeError(null);
        setMensajeExito(null);

        if (!passwordActual) {
            setMensajeError('Por favor ingresa tu contraseña actual.');
            return;
        }

        if (!tieneLongitud) {
            setMensajeError('La nueva contraseña debe tener al menos 6 caracteres.');
            return;
        }

        if (!coinciden) {
            setMensajeError('La confirmación no coincide con la nueva contraseña.');
            return;
        }

        if (!esDiferente) {
            setMensajeError('La nueva contraseña debe ser diferente a la contraseña actual.');
            return;
        }

        try {
            setGuardando(true);
            const res = await api.post('/auth/cambiar-password', {
                password_actual: passwordActual,
                password_nueva: passwordNueva
            });

            setMensajeExito(res.data?.message || '¡Tu contraseña ha sido actualizada con éxito!');
            setPasswordActual('');
            setPasswordNueva('');
            setPasswordConfirm('');
        } catch (error: any) {
            console.error('Error al cambiar contraseña:', error);
            const detalle = error?.response?.data?.detail;
            setMensajeError(detalle || 'Ocurrió un error al cambiar la contraseña. Verifica que tu clave actual sea correcta.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={handleCerrar}
        >
            <div 
                className="bg-white w-full max-w-xl rounded-[28px] shadow-[0_25px_70px_rgba(0,0,0,0.25)] border border-slate-100 overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Ejecutivo High-End */}
                <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-6 sm:p-7 text-white shrink-0 overflow-hidden">
                    {/* Elementos visuales de fondo */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

                    <button
                        onClick={handleCerrar}
                        className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer z-10"
                        title="Cerrar ventana (Esc)"
                    >
                        <X size={18} />
                    </button>

                    <div className="flex items-center gap-4 relative z-0">
                        {/* Avatar Ejecutivo con Monograma y Halo */}
                        <div className="relative shrink-0">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary via-blue-600 to-indigo-500 p-0.5 shadow-lg shadow-primary/20">
                                <div className="w-full h-full bg-slate-900/90 rounded-[14px] flex items-center justify-center text-white text-2xl font-black">
                                    {user.nombre ? user.nombre.charAt(0).toUpperCase() : 'U'}
                                </div>
                            </div>
                            <span 
                                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-slate-900 flex items-center justify-center text-white text-[9px]"
                                title="Usuario Conectado y Activo"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            </span>
                        </div>

                        <div className="overflow-hidden">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/20 text-blue-300 border border-blue-400/25">
                                    <Shield size={11} /> {user.rol?.nombre || 'Usuario'}
                                </span>
                                {colegioActual?.nombre && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-slate-300 truncate max-w-[200px]" title={colegioActual.nombre}>
                                        <School size={11} /> {colegioActual.nombre}
                                    </span>
                                )}
                            </div>
                            <h2 className="text-xl font-black truncate text-white tracking-tight">
                                {user.nombre}
                            </h2>
                            <p className="text-xs text-slate-400 truncate flex items-center gap-1.5 mt-0.5 font-medium">
                                <Mail size={12} className="text-slate-400" /> {user.correo}
                            </p>
                        </div>
                    </div>

                    {/* Selector de Pestañas Elegante */}
                    <div className="flex items-center gap-2 mt-6 pt-2 border-t border-slate-800">
                        <button
                            type="button"
                            onClick={() => setTabActiva('seguridad')}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                tabActiva === 'seguridad'
                                    ? 'bg-white text-slate-900 shadow-md'
                                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                            }`}
                        >
                            <KeyRound size={14} className={tabActiva === 'seguridad' ? 'text-primary' : ''} />
                            <span>Seguridad & Clave</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setTabActiva('cuenta')}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                tabActiva === 'cuenta'
                                    ? 'bg-white text-slate-900 shadow-md'
                                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                            }`}
                        >
                            <User size={14} className={tabActiva === 'cuenta' ? 'text-primary' : ''} />
                            <span>Información de la Cuenta</span>
                        </button>
                    </div>
                </div>

                {/* Contenido según pestaña */}
                <div className="p-6 sm:p-7 space-y-6 overflow-y-auto max-h-[calc(85vh-150px)] custom-scrollbar">
                    {tabActiva === 'seguridad' ? (
                        <div className="space-y-5 animate-in fade-in duration-150">
                            <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
                                <div>
                                    <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                                        <Lock size={16} className="text-primary" /> Actualizar Contraseña de Acceso
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Modifica tu contraseña personal. Esto aplicará inmediatamente para tu próximo inicio de sesión.
                                    </p>
                                </div>
                            </div>

                            {/* Mensaje de Error */}
                            {mensajeError && (
                                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center gap-2.5 animate-in fade-in duration-150 shadow-xs">
                                    <AlertCircle size={17} className="shrink-0 text-rose-500" />
                                    <span>{mensajeError}</span>
                                </div>
                            )}

                            {/* Mensaje de Éxito */}
                            {mensajeExito && (
                                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in duration-150 shadow-xs">
                                    <CheckCircle2 size={20} className="shrink-0 text-emerald-600" />
                                    <div>
                                        <p className="font-bold text-sm text-emerald-900">{mensajeExito}</p>
                                        <p className="text-[11px] text-emerald-700 font-normal mt-0.5">Tu nueva clave fue guardada de forma segura.</p>
                                    </div>
                                </div>
                            )}

                            <form onSubmit={handleSubmitPassword} className="space-y-4">
                                {/* Contraseña Actual */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                        Contraseña Actual <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={mostrarActual ? 'text' : 'password'}
                                            value={passwordActual}
                                            onChange={(e) => setPasswordActual(e.target.value)}
                                            placeholder="Ingresa tu clave actual"
                                            required
                                            className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setMostrarActual(!mostrarActual)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                            title={mostrarActual ? 'Ocultar' : 'Mostrar'}
                                        >
                                            {mostrarActual ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Nueva Contraseña */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                        Nueva Contraseña <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={mostrarNueva ? 'text' : 'password'}
                                            value={passwordNueva}
                                            onChange={(e) => setPasswordNueva(e.target.value)}
                                            placeholder="Nueva clave (mínimo 6 caracteres)"
                                            required
                                            minLength={6}
                                            className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setMostrarNueva(!mostrarNueva)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                            title={mostrarNueva ? 'Ocultar' : 'Mostrar'}
                                        >
                                            {mostrarNueva ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Confirmar Nueva Contraseña */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                        Confirmar Nueva Contraseña <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={mostrarConfirm ? 'text' : 'password'}
                                            value={passwordConfirm}
                                            onChange={(e) => setPasswordConfirm(e.target.value)}
                                            placeholder="Repite exactamente la nueva clave"
                                            required
                                            minLength={6}
                                            className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setMostrarConfirm(!mostrarConfirm)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                            title={mostrarConfirm ? 'Ocultar' : 'Mostrar'}
                                        >
                                            {mostrarConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Checklist de Requisitos de Seguridad */}
                                <div className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-1.5 text-[11px]">
                                    <span className="font-bold text-slate-500 uppercase tracking-wider block text-[10px] mb-1">
                                        Requisitos de seguridad:
                                    </span>
                                    <div className={`flex items-center gap-2 font-medium ${tieneLongitud ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${tieneLongitud ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-slate-200 text-slate-500'}`}>
                                            {tieneLongitud ? '✓' : '•'}
                                        </span>
                                        <span>Longitud de al menos 6 caracteres</span>
                                    </div>
                                    <div className={`flex items-center gap-2 font-medium ${coinciden ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${coinciden ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-slate-200 text-slate-500'}`}>
                                            {coinciden ? '✓' : '•'}
                                        </span>
                                        <span>Ambas contraseñas coinciden exactamente</span>
                                    </div>
                                    <div className={`flex items-center gap-2 font-medium ${esDiferente ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${esDiferente ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-slate-200 text-slate-500'}`}>
                                            {esDiferente ? '✓' : '•'}
                                        </span>
                                        <span>Diferente de la contraseña actual</span>
                                    </div>
                                </div>

                                <div className="pt-2 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={handleCerrar}
                                        className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={guardando || !puedeEnviar}
                                        className="px-6 py-2.5 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/95 hover:to-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-98"
                                    >
                                        {guardando ? (
                                            <>
                                                <Loader2 size={15} className="animate-spin" />
                                                <span>Guardando...</span>
                                            </>
                                        ) : (
                                            <>
                                                <ShieldCheck size={16} />
                                                <span>Guardar Nueva Contraseña</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        /* Pestaña: Información de la Cuenta */
                        <div className="space-y-4 animate-in fade-in duration-150">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                        Identificador / RUT
                                    </span>
                                    <span className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                                        <Fingerprint size={16} className="text-primary" /> {user.rut || 'No registrado'}
                                    </span>
                                </div>

                                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                        Estado de la Cuenta
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Activo en el sistema
                                    </span>
                                </div>

                                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                        Correo Institucional
                                    </span>
                                    <span className="text-xs font-bold text-slate-800 truncate block" title={user.correo}>
                                        {user.correo}
                                    </span>
                                </div>

                                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                        Rol del Usuario
                                    </span>
                                    <span className="text-xs font-bold text-slate-800">
                                        {user.rol?.nombre} ({user.rol?.codigo})
                                    </span>
                                </div>

                                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl sm:col-span-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                        Colegio Asignado
                                    </span>
                                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                        <School size={15} className="text-primary shrink-0" />
                                        <span>{colegioActual?.nombre || 'Colegio'}</span>
                                    </span>
                                </div>

                                {user.cargo && (
                                    <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl sm:col-span-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                            Cargo y Área
                                        </span>
                                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                            <Briefcase size={15} className="text-primary shrink-0" />
                                            <span>{user.cargo.nombre} {user.cargo.area ? `(${user.cargo.area.nombre})` : ''}</span>
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="pt-3 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setTabActiva('seguridad')}
                                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                                >
                                    <KeyRound size={14} />
                                    <span>Ir a Cambiar Contraseña</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
