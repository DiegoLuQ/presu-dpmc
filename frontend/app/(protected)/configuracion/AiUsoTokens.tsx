'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import api from '@/lib/api/client';

interface UsoToken {
    id: number;
    proveedor: string;
    modelo: string;
    endpoint: string;
    tokens_entrada: number;
    tokens_salida: number;
    tokens_total: number;
    creado_en: string;
    usuario_nombre?: string;
}

const ENDPOINT_LABELS: Record<string, string> = {
    'asesorar-categoria':    'Asesoría de Categoría',
    'asesorar-cuenta':       'Asesoría de Cuenta Contable',
    'sugerir-cuenta':        'Sugerencia de Cuenta',
    'asesorar-actividad-pme': 'Asesoría Actividad PME',
    'test-conexion':         'Prueba de Conexión',
};

const PROVIDER_COLORS: Record<string, string> = {
    groq:       'bg-red-100 text-red-700',
    nvidia:     'bg-green-100 text-green-700',
    deepseek:   'bg-blue-100 text-blue-700',
    openrouter: 'bg-purple-100 text-purple-700',
    gemini:     'bg-sky-100 text-sky-700',
};

export default function AiUsoTokens() {
    const [registros, setRegistros] = useState<UsoToken[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const res = await api.get('/ai/uso-tokens');
            setRegistros(res.data);
        } catch {
            /* sin permisos o sin datos */
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const totalEntrada = registros.reduce((s, r) => s + r.tokens_entrada, 0);
    const totalSalida  = registros.reduce((s, r) => s + r.tokens_salida, 0);
    const totalTotal   = registros.reduce((s, r) => s + r.tokens_total, 0);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-6 flex items-center justify-between">
                <div>
                    <h3 className="text-base font-bold text-gray-900">Uso de Tokens IA</h3>
                    <p className="text-[12px] text-gray-400 mt-0.5 font-medium">Historial de consumo por llamada y usuario. Últimos 200 registros.</p>
                </div>
                <button onClick={load} className="p-2.5 rounded-xl hover:bg-gray-100 transition-all text-gray-400 hover:text-gray-700">
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Tokens de Entrada', value: totalEntrada, color: 'text-blue-600' },
                    { label: 'Tokens de Salida',  value: totalSalida,  color: 'text-violet-600' },
                    { label: 'Total de Tokens',   value: totalTotal,   color: 'text-gray-900' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                        <p className={`text-2xl font-black ${color}`}>{value.toLocaleString('es-CL')}</p>
                        <p className="text-[11px] text-gray-400 font-semibold mt-1">{label}</p>
                    </div>
                ))}
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-sm font-medium">Cargando registros...</span>
                    </div>
                ) : registros.length === 0 ? (
                    <div className="py-16 text-center text-gray-400 text-sm font-medium">
                        Sin registros aún. Usa alguna función de IA para ver el consumo aquí.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="text-left px-5 py-3 font-bold text-gray-500">Fecha</th>
                                    <th className="text-left px-4 py-3 font-bold text-gray-500">Usuario</th>
                                    <th className="text-left px-4 py-3 font-bold text-gray-500">Proveedor</th>
                                    <th className="text-left px-4 py-3 font-bold text-gray-500">Modelo</th>
                                    <th className="text-left px-4 py-3 font-bold text-gray-500">Uso</th>
                                    <th className="text-right px-4 py-3 font-bold text-gray-500">Entrada</th>
                                    <th className="text-right px-4 py-3 font-bold text-gray-500">Salida</th>
                                    <th className="text-right px-5 py-3 font-bold text-gray-500">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {registros.map((r) => (
                                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                                            {new Date(r.creado_en).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-gray-800">
                                            {r.usuario_nombre || 'Desconocido'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PROVIDER_COLORS[r.proveedor] ?? 'bg-gray-100 text-gray-600'}`}>
                                                {r.proveedor}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 font-medium max-w-[160px] truncate">
                                            {r.modelo.split('/').pop()?.split(':')[0]}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 font-semibold">
                                            {ENDPOINT_LABELS[r.endpoint] ?? r.endpoint}
                                        </td>
                                        <td className="px-4 py-3 text-right text-blue-600 font-bold">{r.tokens_entrada.toLocaleString('es-CL')}</td>
                                        <td className="px-4 py-3 text-right text-violet-600 font-bold">{r.tokens_salida.toLocaleString('es-CL')}</td>
                                        <td className="px-5 py-3 text-right font-extrabold text-gray-800">{r.tokens_total.toLocaleString('es-CL')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
