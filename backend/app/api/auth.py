from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.attributes import set_committed_value
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.db.session import get_db
from app.models import User, Cargo, Subarea
from app.schemas.auth import LoginRequest, Token, UserResponse, TokenData
from app.core.config import settings
from app.core import security

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Roles que pueden fijar como "colegio activo" cualquier colegio (no solo los suyos).
ROLES_TODOS_COLEGIOS = ["ADM", "SOS", "OPE"]


def _aplicar_colegio_activo(user: User, request: Request):
    """Si el request trae el header X-Colegio-Activo y el colegio es válido para el
    usuario, sobreescribe el colegio "en memoria" (sin persistirlo en BD) para que
    todos los usos de current_user.id_colegio operen sobre el colegio elegido."""
    header_val = request.headers.get("X-Colegio-Activo")
    if not header_val:
        return
    try:
        cid = int(header_val)
    except (TypeError, ValueError):
        return
    if cid == user.id_colegio:
        return
    rol_codigo = user.rol.codigo if user.rol else None
    permitidos = {c.id_colegio for c in (user.colegios or [])}
    permitidos.add(user.id_colegio)
    if cid in permitidos or rol_codigo in ROLES_TODOS_COLEGIOS:
        # set_committed_value cambia el valor leído SIN marcar el objeto como "sucio",
        # evitando que un db.commit() posterior persista el cambio en auth_usuario.
        set_committed_value(user, "id_colegio", cid)


async def get_current_user(request: Request, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id_str = payload.get("sub")
        codigo_rol: str = payload.get("rol")
        if user_id_str is None:
            raise credentials_exception
        user_id = int(user_id_str)
        token_data = TokenData(user_id=user_id, codigo_rol=codigo_rol)
    except JWTError:
        raise credentials_exception

    user = db.query(User).options(
        selectinload(User.rol),
        selectinload(User.colegio),
        selectinload(User.colegios),
        selectinload(User.cargo).selectinload(Cargo.area),
        selectinload(User.cargos).selectinload(Cargo.area)
    ).filter(User.id_user == token_data.user_id).first()

    if user is None:
        raise credentials_exception

    _aplicar_colegio_activo(user, request)
    return user

@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    from sqlalchemy import or_
    print(f"DEBUG: Intento de login para: {login_data.identifier}")
    user = db.query(User).filter(
        or_(
            User.rut == login_data.identifier,
            User.correo == login_data.identifier
        )
    ).first()
    if not user or not security.verify_password(login_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo electrónico o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_with_rol = db.query(User).options(
        selectinload(User.rol),
        selectinload(User.colegio),
        selectinload(User.colegios)
    ).filter(User.id_user == user.id_user).first()
    
    codigo_rol = user_with_rol.rol.codigo if user_with_rol.rol else "DOC"
    
    access_token = security.create_access_token_with_role(
        user.id_user, 
        codigo_rol
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": user_with_rol
    }

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.get("/permisos")
async def get_permisos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Fallback to empty list if no permissions array exists (e.g., legacy row)
    permisos = current_user.rol.permisos if current_user.rol and getattr(current_user.rol, 'permisos', None) else []

    from app.core.secciones import secciones_permitidas
    return {
        "codigo_rol": current_user.rol.codigo if current_user.rol else None,
        "nombre_rol": current_user.rol.nombre if current_user.rol else None,
        "permisos": permisos,
        # Secciones restringidas a las que este usuario tiene acceso.
        "secciones": secciones_permitidas(db, current_user),
    }
