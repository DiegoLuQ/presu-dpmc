from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import User
from app.api.auth import get_current_user
from app.core.permissions import tiene_permiso
from app.core.secciones import usuario_puede_seccion
import json

def get_user_permisos(rol):
    if not rol or not rol.permisos:
        return []
    permisos = rol.permisos
    if isinstance(permisos, str):
        try:
            permisos = json.loads(permisos)
        except:
            permisos = []
    return permisos

def verificar_permisos(modulo: str, accion: str = "ver"):
    def _check(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        codigo_rol = current_user.rol.codigo if current_user.rol else None
        user_permisos = get_user_permisos(current_user.rol)

        # Bypass explícito para Administrador y Sostenedor
        if codigo_rol in ["ADM", "SOS"]:
            return current_user

        # Permiso especial para cargo Jefe de Compras en aprobación/gestión de presupuestos
        if modulo == "presupuesto" and accion in ["aprobar", "editar"]:
            cargo_nombres = []
            if current_user.cargo and current_user.cargo.nombre:
                cargo_nombres.append(current_user.cargo.nombre.lower())
            if current_user.subarea and current_user.subarea.nombre:
                cargo_nombres.append(current_user.subarea.nombre.lower())
            if getattr(current_user, 'cargos', None):
                for c in current_user.cargos:
                    if c.nombre:
                        cargo_nombres.append(c.nombre.lower())
            if any("jefe de compras" in cn or "jefe compras" in cn for cn in cargo_nombres):
                return current_user

        # Verificación por Acceso Restringido (lista blanca) si aplica a presupuesto
        if modulo == "presupuesto" and accion == "aprobar":
            if usuario_puede_seccion(db, current_user, "presupuesto.solicitudes"):
                return current_user
        
        if not codigo_rol or not tiene_permiso(user_permisos, modulo, accion):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No tienes permisos para {accion} {modulo}"
            )
        return current_user
    return _check


def verificar_seccion(seccion_key: str):
    """Exige que el usuario esté en la lista blanca de una sección restringida
    (o que aplique el respaldo por rol / bypass ADM)."""
    def _check(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if not usuario_puede_seccion(db, current_user, seccion_key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes acceso a esta sección."
            )
        return current_user
    return _check
