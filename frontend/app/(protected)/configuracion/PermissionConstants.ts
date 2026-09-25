// Acciones de permiso (2º segmento del token `modulo.accion`).
// Los módulos y secciones viven ahora en el registro único: `@/lib/permissions/registry`.

export enum Accion {
    VER = 'ver',
    CREAR = 'crear',
    EDITAR = 'editar',
    ELIMINAR = 'eliminar',
    APROBAR = 'aprobar',
    TODOS = '*'
}

export const AccionNames: Record<Accion, string> = {
    [Accion.VER]: 'Visualizar',
    [Accion.CREAR]: 'Crear',
    [Accion.EDITAR]: 'Editar',
    [Accion.ELIMINAR]: 'Eliminar',
    [Accion.APROBAR]: 'Aprobar',
    [Accion.TODOS]: 'Acceso Total'
};
