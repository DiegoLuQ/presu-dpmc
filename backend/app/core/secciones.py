"""Lógica de acceso a secciones restringidas (lista blanca por usuario).

Vive en un módulo neutral (solo depende de models + permissions) para que tanto
`app.api.auth` como `app.api.deps` puedan usarlo sin imports circulares.
"""
import json
from typing import List

from sqlalchemy.orm import Session

from app.models import User, SeccionAcceso
from app.core.permissions import tiene_permiso, SECCIONES_RESTRINGIBLES


def _rol_permisos(user: User) -> List[str]:
    rol = user.rol if user else None
    if not rol or not getattr(rol, "permisos", None):
        return []
    p = rol.permisos
    if isinstance(p, str):
        try:
            p = json.loads(p)
        except Exception:
            p = []
    return p or []


def usuario_puede_seccion(db: Session, user: User, seccion_key: str) -> bool:
    """¿El usuario puede acceder a la sección restringida `seccion_key`?

    - Si la sección no es restringible → True (sin restricción especial).
    - ADM siempre puede (evita que se bloquee la propia configuración).
    - Si la lista blanca está vacía → se respeta el permiso del rol (legado).
    - Si tiene usuarios → solo esos usuarios acceden.
    """
    meta = SECCIONES_RESTRINGIBLES.get(seccion_key)
    if meta is None:
        return True
    if user and user.rol and user.rol.codigo == "ADM":
        return True
    ids = [r.id_user for r in db.query(SeccionAcceso.id_user).filter(
        SeccionAcceso.seccion == seccion_key
    ).all()]
    if not ids:
        return tiene_permiso(_rol_permisos(user), meta["modulo"], meta["accion"])
    return bool(user) and user.id_user in ids


def secciones_permitidas(db: Session, user: User) -> List[str]:
    """Claves de secciones restringidas a las que el usuario tiene acceso."""
    return [k for k in SECCIONES_RESTRINGIBLES if usuario_puede_seccion(db, user, k)]
