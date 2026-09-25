/**
 * Motor de Clasificación Presupuestaria Automática
 * 
 * Determina la subvención financiera (SEP, PIE, GENERAL, MANTENIMIENTO, PRO_RETENCION)
 * basándose estrictamente en la jerarquía de reglas de negocio:
 * 1. PIE (Prioridad Máxima si el Área es PIE)
 * 2. MANTENIMIENTO (Si Área es Operaciones/Mantención y Destino es Mantención/Servicio)
 * 3. GENERAL (Si Destino es Funcionarios)
 * 4. SEP (Si Destino es Estudiantes)
 * 5. SEP (Si Destino es Actividad y corresponde a Premios / Beneficios / Eventos Alumnos)
 * 6. PRO_RETENCION (Si existe condición/justificación explícita de retención)
 * 7. PENDIENTE / REVISIÓN (Fallback cuando faltan datos o no se puede determinar)
 */

export interface ResultadoSubvencion {
    subvencion_codigo: 'GENERAL' | 'SEP' | 'PIE' | 'PRO_RETENCION' | 'MANTENIMIENTO';
    nombre_corto: string;
    nombre_completo: string;
    estado: 'exito' | 'pendiente' | 'revision';
    motivo: string;
    badgeStyle: {
        bg: string;
        text: string;
        border: string;
        icon: string;
    };
}

export function calcularSubvencion(
    areaNombre: string | null | undefined,
    subareaNombre: string | null | undefined,
    destinoGasto: string | null | undefined,
    conceptoText?: string | null | undefined,
    subvencionOriginalBD?: { id_subvencion: number; nombre_corto: string } | null,
    aplicarSubvencionPIE: boolean = true
): ResultadoSubvencion {
    const areaUpper = (areaNombre || '').toUpperCase();
    const subareaUpper = (subareaNombre || '').toUpperCase();
    const destinoUpper = (destinoGasto || '').toUpperCase();
    const conceptoUpper = (conceptoText || '').toUpperCase();

    const esAreaPIE = (areaUpper.includes('PIE') || subareaUpper.includes('PIE')) && aplicarSubvencionPIE;
    const esAreaOperaciones = areaUpper.includes('OPE') || areaUpper.includes('OPERACION') || subareaUpper.includes('MANTEN') || subareaUpper.includes('OPE');
    
    // Normalizar Destino
    const esFuncionarios = destinoUpper.includes('FUNCIONARIO') || destinoUpper.includes('OFICINA');
    const esEstudiantes = destinoUpper.includes('ESTUDIANTE') || destinoUpper.includes('ALUMNO') || destinoUpper.includes('SALA');
    const esMantencion = destinoUpper.includes('MANTEN') || destinoUpper.includes('SERVICIO');
    const esActividad = destinoUpper.includes('ACTIVIDAD') || destinoUpper.includes('PREMIO') || destinoUpper.includes('BENEFICIO');

    // Si aún no se selecciona destino
    if (!destinoGasto) {
        return {
            subvencion_codigo: 'GENERAL',
            nombre_corto: 'Pendiente',
            nombre_completo: 'Pendiente de clasificación',
            estado: 'pendiente',
            motivo: 'Seleccione el destino del gasto para clasificar automáticamente',
            badgeStyle: {
                bg: 'bg-gray-100',
                text: 'text-gray-600',
                border: 'border-gray-200',
                icon: '○'
            }
        };
    }

    // REGLA 1 (JERARQUÍA 1): Área PIE tiene prioridad absoluta sobre cualquier destino
    if (esAreaPIE) {
        return {
            subvencion_codigo: 'PIE',
            nombre_corto: 'PIE',
            nombre_completo: 'Programa de Integración Escolar',
            estado: 'exito',
            motivo: 'Área PIE predomina con financiamiento PIE sobre cualquier destino',
            badgeStyle: {
                bg: 'bg-purple-100',
                text: 'text-purple-800',
                border: 'border-purple-300',
                icon: '🟣'
            }
        };
    }

    // REGLA 2 (JERARQUÍA 2): Mantenimiento en área Operaciones/Mantención
    if (esMantencion && (esAreaOperaciones || destinoUpper.includes('MANTENIMIENTO'))) {
        return {
            subvencion_codigo: 'MANTENIMIENTO',
            nombre_corto: 'MANTENIMIENTO',
            nombre_completo: 'Fondo de Mantenimiento e Infraestructura',
            estado: 'exito',
            motivo: 'Gasto específico de conservación e infraestructura del establecimiento',
            badgeStyle: {
                bg: 'bg-orange-100',
                text: 'text-orange-800',
                border: 'border-orange-300',
                icon: '🟠'
            }
        };
    }

    // REGLA 3 (JERARQUÍA 3): Destino Funcionarios es GENERAL (incluso si el área es Operaciones)
    if (esFuncionarios) {
        return {
            subvencion_codigo: 'GENERAL',
            nombre_corto: 'GENERAL',
            nombre_completo: 'Subvención General / Operativa',
            estado: 'exito',
            motivo: 'Destinado al personal, docentes o administración interna',
            badgeStyle: {
                bg: 'bg-blue-100',
                text: 'text-blue-800',
                border: 'border-blue-300',
                icon: '🔵'
            }
        };
    }

    // REGLA 4 (JERARQUÍA 4): Destino Estudiantes es SEP
    if (esEstudiantes) {
        return {
            subvencion_codigo: 'SEP',
            nombre_corto: 'SEP',
            nombre_completo: 'Subvención Escolar Preferencial',
            estado: 'exito',
            motivo: 'Destinado directamente al aprendizaje y actividades de estudiantes',
            badgeStyle: {
                bg: 'bg-emerald-100',
                text: 'text-emerald-800',
                border: 'border-emerald-300',
                icon: '🟢'
            }
        };
    }

    // REGLA 5 (JERARQUÍA 5): Actividad / Premio / Beneficio para Estudiantes es SEP
    if (esActividad) {
        const esParaAlumnos = conceptoUpper.includes('ALUMNO') || conceptoUpper.includes('ESTUDIANTE') || conceptoUpper.includes('PREMIO') || conceptoUpper.includes('BENEFICIO') || conceptoUpper.includes('INCENTIVO') || conceptoUpper.includes('EVENTO') || conceptoUpper.includes('RECONOCIMIENTO');
        if (esParaAlumnos || true) { // Por defecto Actividad / Premio es SEP para estudiantes
            return {
                subvencion_codigo: 'SEP',
                nombre_corto: 'SEP',
                nombre_completo: 'Subvención Escolar Preferencial (Premios / Beneficios)',
                estado: 'exito',
                motivo: 'Reconocimientos, incentivos y actividades dirigidas a estudiantes',
                badgeStyle: {
                    bg: 'bg-emerald-100',
                    text: 'text-emerald-800',
                    border: 'border-emerald-300',
                    icon: '🟢'
                }
            };
        }
    }

    // REGLA 6 (JERARQUÍA 6): Pro Retención con justificación explícita
    if (conceptoUpper.includes('RETENCION') || conceptoUpper.includes('PRO_RETENCION')) {
        return {
            subvencion_codigo: 'PRO_RETENCION',
            nombre_corto: 'PRO_RETENCION',
            nombre_completo: 'Programa Pro Retención Escolar',
            estado: 'exito',
            motivo: 'Justificación explícita de retención de alumnos vulnerables',
            badgeStyle: {
                bg: 'bg-amber-100',
                text: 'text-amber-800',
                border: 'border-amber-300',
                icon: '🟡'
            }
        };
    }

    // Fallback: Si se conoce la subvención guardada en BD, usar esa
    if (subvencionOriginalBD?.nombre_corto) {
        const codigo = subvencionOriginalBD.nombre_corto.toUpperCase() as any;
        return {
            subvencion_codigo: codigo,
            nombre_corto: subvencionOriginalBD.nombre_corto,
            nombre_completo: `Subvención ${subvencionOriginalBD.nombre_corto}`,
            estado: 'exito',
            motivo: 'Clasificación contable asignada por catálogo',
            badgeStyle: {
                bg: 'bg-emerald-100',
                text: 'text-emerald-800',
                border: 'border-emerald-300',
                icon: '🟢'
            }
        };
    }

    // REGLA 7: Por determinar
    return {
        subvencion_codigo: 'GENERAL',
        nombre_corto: 'Requiere revisión',
        nombre_completo: 'Por determinar',
        estado: 'revision',
        motivo: 'No se pudo clasificar automáticamente. Requiere revisión presupuestaria',
        badgeStyle: {
            bg: 'bg-amber-50',
            text: 'text-amber-700',
            border: 'border-amber-200',
            icon: '⚠️'
        }
    };
}
