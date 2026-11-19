'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api/client';
import OrdenForm from '@/components/go-contralor/ops/OrdenForm';
import { OrdenDetalle, SinAccesoOps, mensajeError, useAccesoOps } from '@/components/go-contralor/ops/comun';

export default function OpsDetallePage() {
    const { id } = useParams<{ id: string }>();
    const { isLoading, puedeVer } = useAccesoOps();
    const [orden, setOrden] = useState<OrdenDetalle | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isLoading || !puedeVer) return;
        api.get(`/ops/ordenes/${id}`)
            .then(r => setOrden(r.data))
            .catch(e => setError(mensajeError(e, 'No se pudo cargar la orden.')));
    }, [id, isLoading, puedeVer]);

    if (isLoading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" /></div>;
    if (!puedeVer) return <SinAccesoOps />;
    if (error) return <p className="py-24 text-center text-red-600">{error}</p>;
    if (!orden) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" /></div>;
    return <OrdenForm key={orden.id_ops} orden={orden} />;
}
