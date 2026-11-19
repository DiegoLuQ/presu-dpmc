'use client';

import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

/**
 * Muestra la fecha de la última sincronización de OC con Softland (la hace otro servicio:
 * OrdenesDeCompra-Softland) y permite volver a leer la BD `ordenes_compra`. No sincroniza.
 */
export default function BotonRecargarOC({ ultimaSync, onRecargar, cargando = false }: {
    ultimaSync: string | null | undefined;
    onRecargar: () => void;
    cargando?: boolean;
}) {
    const fecha = ultimaSync
        ? new Date(ultimaSync).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
        : 'sin datos';

    return (
        <button type="button" onClick={onRecargar} disabled={cargando}
            title="Volver a leer las órdenes de compra (las sincroniza con Softland otro servicio)"
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-xl px-3 py-2 border border-gray-200 bg-white text-gray-600 hover:border-primary hover:text-primary disabled:cursor-wait">
            {cargando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            OC actualizadas al {fecha}
        </button>
    );
}
