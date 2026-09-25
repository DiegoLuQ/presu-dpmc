from typing import List
from enum import Enum

class Modulo(str, Enum):
    INVENTARIO = "inventario"
    USUARIOS = "usuarios"
    PME = "pme"
    PRESUPUESTO = "presupuesto"
    REQUERIMIENTO = "requerimiento"
    REPORTES = "reportes"
    AREAS = "areas"
    ROLES = "roles"

class Accion(str, Enum):
    VER = "ver"
    CREAR = "crear"
    EDITAR = "editar"
    ELIMINAR = "eliminar"
    APROBAR = "aprobar"
    TODOS = "*"

PERMISOS_POR_ROL = {
    "ADM": [f"{m.value}.*" for m in Modulo] + ["reportes.*"],
    
    "DIR": [
        "inventario.ver", "inventario.crear",
        "pme.*", "presupuesto.ver", "presupuesto.crear", "presupuesto.editar", "presupuesto.eliminar", "reportes.ver", "requerimiento.*"
    ],
    
    "ASESOR": [
        "pme.ver", "pme.crear", "pme.editar",
        "presupuesto.ver", "presupuesto.crear"
    ],
    
    "GERENTE": [
        "inventario.*", "pme.*", "presupuesto.*", "reportes.*", "requerimiento.*"
    ],
    
    "CRA": [
        "inventario.ver", "inventario.crear", "inventario.editar"
    ],
    
    "CDP": [
        "inventario.ver", "presupuesto.*", "requerimiento.*"
    ],
    
    "DOC": ["inventario.ver"],
    
    "PIE": ["inventario.ver", "presupuesto.ver", "presupuesto.crear"],
    "INS": ["inventario.ver", "presupuesto.ver", "presupuesto.crear"],
    "UTP": ["inventario.ver", "pme.*", "presupuesto.*", "requerimiento.*"],
    "CON": ["inventario.ver", "presupuesto.ver", "presupuesto.crear"],
    "ORI": ["inventario.ver", "presupuesto.ver", "presupuesto.crear"],
    "TEC": ["inventario.ver", "presupuesto.ver", "presupuesto.crear"],
    "FIN": ["inventario.ver", "presupuesto.*", "reportes.ver", "requerimiento.*"],
    "OPE": ["inventario.ver", "inventario.crear", "presupuesto.ver", "presupuesto.crear"],
    "EXT": ["inventario.ver", "presupuesto.ver", "presupuesto.crear"],
    "SOS": ["inventario.ver", "reportes.ver", "presupuesto.*"],
    "GES": ["inventario.ver", "reportes.ver", "presupuesto.ver", "presupuesto.crear", "roles.ver"],
}

# Secciones cuyo acceso puede restringirse a una lista blanca de usuarios
# (configurable en Configuración › Accesos). Para cada una se define el permiso
# de rol que gobierna el acceso cuando la lista blanca está vacía (legado).
SECCIONES_RESTRINGIBLES = {
    "presupuesto.solicitudes": {
        "label": "Presupuesto › Solicitudes (Revisión y Aprobación Global)",
        "modulo": "presupuesto",
        "accion": "aprobar",
    },
    "go_compras.programar_jefe": {
        "label": "GO-Compras › Programar Compras (Acceso Privilegiado Jefe de Compras)",
        "modulo": "presupuesto",
        "accion": "editar",
    },
}

def tiene_permiso(permisos: List[str], modulo: str, accion: str) -> bool:
    permiso_buscar = f"{modulo}.{accion}"
    
    for p in permisos:
        # Global wildcard: access to absolutely everything
        if p == "*.*":
            return True
        # Module wildcard: access to everything inside a specific module
        if p == f"{modulo}.*":
            return True
        # Exact match
        if p == permiso_buscar:
            return True
    
    return False

def get_permisos_rol(codigo_rol: str) -> List[str]:
    # This is for backward compatibility or seeds. 
    # Real logic should pull from the database now.
    return PERMISOS_POR_ROL.get(codigo_rol, [])
