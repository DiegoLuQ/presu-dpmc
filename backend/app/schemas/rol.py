from pydantic import BaseModel, field_validator
from typing import Optional, List, Union
import json

class RolBase(BaseModel):
    nombre: str
    codigo: str
    prefijo: Optional[str] = None
    permisos: Optional[List[str]] = []

class RolCreate(RolBase):
    pass

class RolUpdate(RolBase):
    pass

class RolResponse(RolBase):
    id_rol: int

    @field_validator('permisos', mode='before')
    @classmethod
    def parse_permisos(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        if isinstance(v, list):
            return v
        return []

    class Config:
        from_attributes = True
