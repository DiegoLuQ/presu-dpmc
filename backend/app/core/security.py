import hashlib
from datetime import datetime, timedelta
from typing import Any, Union
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt", "sha256_crypt", "md5_crypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    # 1. Comprobación directa si estaba en texto plano
    if plain_password == hashed_password:
        return True
    # 2. Comprobación con passlib (bcrypt, $2y$, etc.)
    try:
        if pwd_context.verify(plain_password, hashed_password):
            return True
    except Exception:
        pass
    # 3. Comprobación MD5 estándar (común en sistemas PHP antiguos)
    try:
        if hashlib.md5(plain_password.encode('utf-8')).hexdigest().lower() == hashed_password.lower():
            return True
    except Exception:
        pass
    # 4. Comprobación SHA256 estándar
    try:
        if hashlib.sha256(plain_password.encode('utf-8')).hexdigest().lower() == hashed_password.lower():
            return True
    except Exception:
        pass
    return False

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Union[timedelta, None] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def create_access_token_with_role(user_id: int, codigo_rol: str) -> str:
    data = {
        "sub": str(user_id),
        "rol": codigo_rol
    }
    return create_access_token(data)
