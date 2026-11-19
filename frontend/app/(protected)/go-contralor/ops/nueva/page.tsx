'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import OrdenForm from '@/components/go-contralor/ops/OrdenForm';
import { SinAccesoOps, useAccesoOps } from '@/components/go-contralor/ops/comun';

export default function NuevaOpsPage() {
    const { isLoading, puedeCrear } = useAccesoOps();
    if (isLoading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" /></div>;
    if (!puedeCrear) return <SinAccesoOps />;
    return <OrdenForm orden={null} />;
}
