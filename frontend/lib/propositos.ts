export const PROPOSITOS_CODIGOS = [
    {
        id: 'SALA_CLASES' as const,
        icon: '🏫',
        label: 'Estudiantes (Actividades, sala de clases, eventos etc)',
        // Destino del gasto canónico asociado a este propósito
        destino_gasto: 'Alumnos',
        descripcion: 'Materiales e insumos para aprendizaje, actividades pedagógicas y eventos con estudiantes.',
        destino_uso: 'ESTUDIANTE',
        tipo_transaccion: 'COMPRA',
        color: 'blue',
        subvencion_default: 'SEP',
    },
    {
        id: 'ADMINISTRACION' as const,
        icon: '🏢',
        label: 'Funcionarios (Oficina, actividades de func., etc)',
        destino_gasto: 'Funcionarios',
        descripcion: 'Recursos para el funcionamiento interno: materiales de oficina, equipos y actividades de funcionarios.',
        destino_uso: 'ADMINISTRATIVO',
        tipo_transaccion: 'COMPRA',
        color: 'violet',
        subvencion_default: 'GENERAL',
    },
    {
        id: 'PREMIO_BENEFICIO' as const,
        icon: '🏆',
        label: 'Actividad (Premio Beneficio)',
        destino_gasto: 'Premio / Beneficio',
        descripcion: 'Insumos para reconocimientos, incentivos o beneficios entregados a la comunidad escolar.',
        destino_uso: 'COMUNIDAD',
        tipo_transaccion: 'COMPRA',
        color: 'amber',
        subvencion_default: 'GENERAL',
    },
    {
        id: 'MANTENCION' as const,
        icon: '🔧',
        label: 'Mantención / Servicio',
        destino_gasto: 'Mantención / Servicio',
        descripcion: 'Servicios externos de mantención, reparación o instalación de bienes del establecimiento.',
        destino_uso: 'ADMINISTRATIVO',
        tipo_transaccion: 'MANTENCION',
        color: 'orange',
        subvencion_default: 'GENERAL',
    },
] as const;

export type PropositoId = typeof PROPOSITOS_CODIGOS[number]['id'];

// Etiqueta para mostrar: propósito + destino del gasto entre paréntesis (sin duplicar cuando coinciden)
export const propositoLabel = (p: { label: string; destino_gasto: string }) =>
    p.label === p.destino_gasto ? p.label : `${p.label} (${p.destino_gasto})`;
