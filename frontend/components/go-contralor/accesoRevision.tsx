'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

/** Acceso a GO-Contralor › Revisión de Presupuestos (mismo criterio que el backend). */
export function useAccesoRevisionContralor() {
    const { user, tienePermiso, isLoading } = useAuth();
    const esSuperRol = ['ADM', 'SOS'].includes(user?.rol?.codigo || '');
    const permisoSeccion = tienePermiso('contabilidad', 'revision-presupuestos');
    return {
        isLoading,
        puedeVer: esSuperRol || permisoSeccion || tienePermiso('contabilidad', 'ver'),
        puedeEditar: esSuperRol || permisoSeccion || tienePermiso('contabilidad', 'editar'),
    };
}

export function SinAccesoContralor() {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center text-gray-500">
            <Lock size={28} className="text-gray-300 mb-3" />
            <p className="text-lg font-semibold text-gray-700">No tienes acceso a esta sección</p>
            <p className="text-sm mt-1">Solicita al administrador el permiso de Revisión de Presupuestos (GO-Contralor) en tu rol.</p>
        </div>
    );
}
