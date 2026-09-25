/**
 * Vocabulario del destino del gasto.
 *
 * El valor canónico es el que guarda `pre_detalle.destino_gasto` y con el que están
 * escritos los mapeos contables de `pre_mapeo_recurso_subcategoria` (2.235 filas).
 * Las etiquetas son solo presentación: nunca deben viajar al backend, porque el
 * mapeo se resuelve comparando `detalle.destino_gasto` contra el del mapeo y una
 * etiqueta no calza con nada (fallback de código contable muerto).
 *
 * Ojo: `pre_categoria_recurso.destino_gasto` es otra cosa — usa etiquetas y admite
 * varias separadas por coma ("en qué destinos aplica esta categoría"). No se mezcla
 * con esto.
 */

export interface DestinoGasto {
    valor: string;
    label: string;
}

export const DESTINOS: DestinoGasto[] = [
    { valor: 'clases(alumno)', label: 'Estudiantes (Actividades, sala de clases, eventos etc)' },
    { valor: 'oficinas(administracion)', label: 'Funcionarios (Oficina, actividades de func., etc)' },
    { valor: 'premio/beneficio', label: 'Actividad (Premio Beneficio)' },
    { valor: 'mantencion/servicio', label: 'Mantención / Servicio' },
];

/** Mapa valor canónico → etiqueta, para los `<select>` y las tablas. */
export const DESTINOS_LABELS: Record<string, string> = Object.fromEntries(
    DESTINOS.map(d => [d.valor, d.label])
);

// Etiquetas que quedaron guardadas antes de unificar el vocabulario, y variantes
// que llegan desde planillas Excel escritas a mano.
const ALIAS: Record<string, string> = {
    'alumnos': 'clases(alumno)',
    'alumno': 'clases(alumno)',
    'estudiantes': 'clases(alumno)',
    'estudiante': 'clases(alumno)',
    'sala de clases': 'clases(alumno)',
    'funcionarios': 'oficinas(administracion)',
    'funcionario': 'oficinas(administracion)',
    'oficina': 'oficinas(administracion)',
    'administracion': 'oficinas(administracion)',
    'premio': 'premio/beneficio',
    'beneficio': 'premio/beneficio',
    'premio / beneficio': 'premio/beneficio',
    'actividad': 'premio/beneficio',
    'mantencion': 'mantencion/servicio',
    'servicio': 'mantencion/servicio',
    'mantencion / servicio': 'mantencion/servicio',
};

function normalizar(valor: string): string {
    return valor
        .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sin tildes
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Lleva cualquier variante (canónica, etiqueta antigua o texto de Excel) al valor
 * canónico. Devuelve '' si no se reconoce, para no inventar un destino.
 */
export function destinoCanonico(valor: string | null | undefined): string {
    if (!valor) return '';
    const limpio = normalizar(valor);
    const exacto = DESTINOS.find(d => normalizar(d.valor) === limpio);
    if (exacto) return exacto.valor;
    if (ALIAS[limpio]) return ALIAS[limpio];
    // Coincidencia por contenido, para textos libres tipo "Funcionarios (Oficina...)".
    for (const [alias, canonico] of Object.entries(ALIAS)) {
        if (limpio.includes(alias)) return canonico;
    }
    return '';
}

/** Etiqueta legible de un destino, tolerando valores antiguos ya guardados. */
export function etiquetaDestino(valor: string | null | undefined): string {
    if (!valor) return '';
    return DESTINOS_LABELS[valor] ?? DESTINOS_LABELS[destinoCanonico(valor)] ?? valor;
}
