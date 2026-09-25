'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function PresupuestoRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.push('/presupuesto/mis-solicitudes');
    }, [router]);

    return (
        <div className="flex h-[60vh] items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="animate-spin text-primary" size={40} />
                <p className="text-gray-500 font-medium font-inter">Cargando módulo de presupuesto...</p>
            </div>
        </div>
    );
}
