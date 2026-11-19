'use client';

import React from 'react';
import axios from 'axios';
import { Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api/client';

/**
 * Órdenes de Pago de Servicio (OPS) · GO-Contralor. Tipos, acceso y utilidades comunes.
 * Backend: backend/app/api/ops.py (prefijo /ops).
 */

export interface Cuenta {
    id_cuenta: number;
    id_proveedor: number;
    banco: string;
    tipo_cuenta: string;
    numero_cuenta: string;
    rut_titular: string;
    nombre_titular: string | null;
    correo: string | null;
    activo: boolean;
}

export interface Proveedor {
    id_proveedor: number;
    rut: string;
    nombre: string;
    telefono: string | null;
    direccion: string | null;
    correo: string | null;
    activo: boolean;
    n_ordenes: number;
    cuentas: Cuenta[];
}

export interface Item { linea?: number; cantidad: number | null; detalle: string; valor_unitario: number; valor_total?: number }
export interface Pago { nro_cuota?: number; monto: number; fecha_pago: string | null; porcentaje?: number | null; medio: string; nro_cheque: string | null }
export interface Alerta { codigo: string; mensaje: string }

export type EstadoOps = 'BORRADOR' | 'EMITIDA' | 'ANULADA';

export interface OrdenResumen {
    id_ops: number;
    id_colegio: number;
    colegio: string | null;
    numero_ops: number;
    fecha_emision: string;
    id_proveedor: number;
    proveedor: string | null;
    rut_proveedor: string | null;
    id_area: number | null;
    area: string | null;
    tipo_orden: 'SERVICIO' | 'COMPRA';
    tipo_documento: 'FACTURA' | 'BOLETA';
    monto_base: number;
    descuento_monto: number;
    iva_pct: number | null;
    iva_monto: number;
    retencion_pct: number | null;
    retencion_monto: number;
    total_pagar: number;
    estado: EstadoOps;
}

export interface OrdenDetalle extends OrdenResumen {
    forma_pago: 'CONTADO' | 'ANTICIPO' | null;
    observacion: string | null;
    id_cuenta: number | null;
    cuenta: { titular: string | null; rut: string | null; banco: string | null; tipo: string | null; numero: string | null; correo: string | null } | null;
    firmante_nombre: string | null;
    firmante_cargo: string | null;
    fecha_emitida: string | null;
    fecha_anulada: string | null;
    motivo_anulacion: string | null;
    items: Item[];
    pagos: Pago[];
    alertas: Alerta[];
}

export interface ConfigOps {
    id_colegio: number;
    iva_pct: number;
    retencion_pct: number;
    siguiente_numero: number;
    ultimo_numero: number;
    razon_social: string;
}

export interface Colegio { id_colegio: number; nombre: string; sigla?: string }
export interface Area { id_area: number; nombre: string }

export const MEDIOS = ['CHEQUE', 'TRANSFERENCIA', 'EFECTIVO', 'OTRO'];
export const TIPOS_CUENTA = ['Corriente', 'Vista', 'Ahorro', 'RUT'];

export const formatCLP = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v || 0)).toLocaleString('es-CL')}`;
export const formatFecha = (iso: string | null) => {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}-${m}-${y}`;
};
export const hoyISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const mensajeError = (e: unknown, defecto: string) =>
    (axios.isAxiosError(e) && typeof e.response?.data?.detail === 'string' && e.response.data.detail) || defecto;

/** Redondeo half-up igual que el backend. */
const redondear = (v: number) => Math.floor(v + 0.5);

export function totalItem(it: Item): number {
    if (!it.cantidad) return it.valor_unitario || 0;
    return redondear(it.cantidad * (it.valor_unitario || 0));
}

/** Misma fórmula que el backend (calcular_totales). */
export function calcularTotales(tipo: 'FACTURA' | 'BOLETA', items: Item[], descuento: number, ivaPct: number, retPct: number) {
    const base = items.filter(i => i.detalle.trim()).reduce((s, i) => s + totalItem(i), 0);
    const afecto = base - (descuento || 0);
    if (tipo === 'FACTURA') {
        const iva = redondear(afecto * ivaPct / 100);
        return { base, iva, retencion: 0, total: afecto + iva };
    }
    const retencion = redondear(afecto * retPct / 100);
    return { base, iva: 0, retencion, total: afecto - retencion };
}

/** Divide el total en n cuotas iguales; el resto por redondeo va a la primera. */
export function dividirCuotas(total: number, n: number): number[] {
    const base = Math.floor(total / n);
    const cuotas = Array(n).fill(base);
    cuotas[0] += total - base * n;
    return cuotas;
}

export function normalizarRut(rut: string): string {
    const limpio = (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
    if (limpio.length < 2) return limpio;
    return `${limpio.slice(0, -1).replace(/^0+/, '')}-${limpio.slice(-1)}`;
}

export function rutValido(rut: string): boolean {
    const m = /^(\d{1,9})-([\dK])$/.exec(normalizarRut(rut));
    if (!m) return false;
    let suma = 0, factor = 2;
    for (const d of m[1].split('').reverse()) {
        suma += Number(d) * factor;
        factor = factor === 7 ? 2 : factor + 1;
    }
    const resto = 11 - (suma % 11);
    const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
    return dv === m[2];
}

/** Abre el PDF en una pestaña (para imprimir) o lo descarga. */
export async function abrirPdf(idOps: number, numero: number, descargar: boolean) {
    const res = await api.get(`/ops/ordenes/${idOps}/pdf`, { responseType: 'blob', params: { descargar } });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    if (descargar) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `OPS_${numero}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } else {
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    }
}

/** Mismo criterio que el backend (verificar_ops): sección `contabilidad.ops` o acción del módulo. */
export function useAccesoOps() {
    const { user, tienePermiso, isLoading } = useAuth();
    const superRol = ['ADM', 'SOS'].includes(user?.rol?.codigo || '');
    const seccion = tienePermiso('contabilidad', 'ops');
    const puede = (accion: string) => superRol || seccion || tienePermiso('contabilidad', accion);
    return {
        isLoading,
        puedeVer: puede('ver'),
        puedeCrear: puede('crear'),
        puedeEditar: puede('editar'),
        puedeAnular: puede('eliminar'),
    };
}

export function SinAccesoOps() {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center text-gray-500">
            <Lock size={28} className="text-gray-300 mb-3" />
            <p className="text-lg font-semibold text-gray-700">No tienes acceso a esta sección</p>
            <p className="text-sm mt-1">Solicita al administrador el permiso de Órdenes de Pago (GO-Contralor) en tu rol.</p>
        </div>
    );
}

export function BadgeEstado({ estado }: { estado: EstadoOps }) {
    const estilos: Record<EstadoOps, string> = {
        BORRADOR: 'bg-gray-100 text-gray-600',
        EMITIDA: 'bg-emerald-50 text-emerald-700',
        ANULADA: 'bg-red-50 text-red-600 line-through',
    };
    const etiqueta: Record<EstadoOps, string> = { BORRADOR: 'Borrador', EMITIDA: 'Emitida', ANULADA: 'Anulada' };
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${estilos[estado]}`}>{etiqueta[estado]}</span>;
}

export const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white';
export const labelCls = 'block text-xs font-semibold text-gray-500 mb-1';
