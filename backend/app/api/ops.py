"""Órdenes de Pago de Servicio (OPS) · GO-Contralor.

- Entidad emisora = org_colegio; área solicitante = org_area.
- Proveedores propios del módulo (ops_proveedor) con varias cuentas bancarias.
- N° de OPS correlativo POR COLEGIO, nunca se reinicia con el año. El siguiente número
  vive en org_config ('ops.siguiente_numero') y es editable desde el frontend (solo
  hacia adelante: no puede quedar <= a un número ya usado).
- % IVA (factura) y % retención de boleta de honorarios en org_config ('ops.iva_pct',
  'ops.retencion_pct'). El % vigente se copia en la orden al guardarla.
- Estados: BORRADOR (editable) -> EMITIDA (firmada por quien emite) -> ANULADA. No se borran.
- Las validaciones (cuotas vs total, año de pago) no bloquean: vuelven como `alertas`.
- db_central.oc_ordenes es la fuente única de OC + OPS: al EMITIR la OPS se inserta ahí
  (softland = 'OPS') y al ANULAR queda estado 'UN'. El N° considera también las OPS de db_central.
"""
import json
import re
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.auth import get_current_user
from app.api.deps import get_user_permisos
from app.core.config import settings
from app.core.permissions import tiene_permiso
from app.db.session import get_db
from app.models import (
    Area, Colegio, OpsItem, OpsOrdenPago, OpsPago, OpsProveedor, OpsProveedorCuenta,
    OrgConfig, User,
)

router = APIRouter(prefix="/ops", tags=["Órdenes de Pago de Servicio"])

SECCION = "ops"  # permiso de sección: contabilidad.ops
ROLES_MULTICOLEGIO = {"ADM", "SOS", "GERENTE"}
TIPOS_DOCUMENTO = {"FACTURA", "BOLETA"}
TIPOS_ORDEN = {"SERVICIO", "COMPRA"}
FORMAS_PAGO = {"CONTADO", "ANTICIPO"}
MEDIOS_PAGO = {"CHEQUE", "TRANSFERENCIA", "EFECTIVO", "OTRO"}
TOLERANCIA_CUOTAS = 2  # pesos

CFG_IVA = "ops.iva_pct"
CFG_RETENCION = "ops.retencion_pct"
CFG_SIGUIENTE = "ops.siguiente_numero"
CFG_RAZON_SOCIAL = "ops.razon_social"
IVA_DEFECTO = Decimal("19")
RETENCION_DEFECTO = Decimal("15.25")


# ── Permisos y alcance por colegio ──────────────────────────────────────────────

def verificar_ops(accion: str = "ver"):
    """Sección OPS de GO-Contralor: permiso `contabilidad.ops` (todo el módulo) o la
    acción del módulo `contabilidad` (ver/crear/editar/eliminar). ADM y SOS siempre."""
    def _check(current_user: User = Depends(get_current_user)):
        codigo = current_user.rol.codigo if current_user.rol else None
        if codigo in ("ADM", "SOS"):
            return current_user
        permisos = get_user_permisos(current_user.rol)
        if codigo and (tiene_permiso(permisos, "contabilidad", SECCION)
                       or tiene_permiso(permisos, "contabilidad", accion)):
            return current_user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="No tienes acceso a Órdenes de Pago (GO-Contralor).")
    return _check


def _colegios_usuario(user: User) -> Optional[set]:
    """None = todos los colegios."""
    if user.rol and user.rol.codigo in ROLES_MULTICOLEGIO:
        return None
    ids = {c.id_colegio for c in (user.colegios or [])}
    if user.id_colegio:
        ids.add(user.id_colegio)
    return ids


def _validar_colegio(db: Session, user: User, id_colegio: int) -> Colegio:
    permitidos = _colegios_usuario(user)
    if permitidos is not None and id_colegio not in permitidos:
        raise HTTPException(status_code=403, detail="No tienes acceso a ese colegio.")
    colegio = db.get(Colegio, id_colegio)
    if not colegio:
        raise HTTPException(status_code=404, detail="Colegio no encontrado.")
    return colegio


# ── Utilidades ──────────────────────────────────────────────────────────────────

def normalizar_rut(rut: Optional[str]) -> str:
    """'77.287.761-7' / '772877617' -> '77287761-7' (DV en mayúscula)."""
    limpio = re.sub(r"[^0-9kK]", "", rut or "").upper()
    if len(limpio) < 2:
        return ""
    return f"{limpio[:-1].lstrip('0')}-{limpio[-1]}"


def rut_valido(rut: str) -> bool:
    m = re.fullmatch(r"(\d{1,9})-([\dK])", rut or "")
    if not m:
        return False
    suma, factor = 0, 2
    for d in reversed(m.group(1)):
        suma += int(d) * factor
        factor = 2 if factor == 7 else factor + 1
    resto = 11 - (suma % 11)
    dv = "0" if resto == 11 else "K" if resto == 10 else str(resto)
    return dv == m.group(2)


def _rut_o_400(rut: str, campo: str = "RUT") -> str:
    r = normalizar_rut(rut)
    if not rut_valido(r):
        raise HTTPException(status_code=400, detail=f"{campo} inválido: '{rut}'.")
    return r


def _redondear(valor: Decimal) -> int:
    return int(valor.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _limpiar(texto: Optional[str]) -> Optional[str]:
    t = re.sub(r"\s+", " ", texto or "").strip()
    return t or None


# ── Configuración (org_config, por colegio) ─────────────────────────────────────

def _cfg_row(db: Session, id_colegio: int, clave: str, lock: bool = False) -> Optional[OrgConfig]:
    q = db.query(OrgConfig).filter(OrgConfig.id_colegio == id_colegio, OrgConfig.clave == clave)
    if lock:
        q = q.with_for_update()
    return q.first()


def _cfg_valor(db: Session, id_colegio: int, clave: str):
    row = _cfg_row(db, id_colegio, clave)
    if not row or row.valor is None:
        return None
    try:
        return json.loads(row.valor)
    except Exception:
        return None


def _cfg_guardar(db: Session, id_colegio: int, clave: str, valor) -> None:
    row = _cfg_row(db, id_colegio, clave)
    if row:
        row.valor = json.dumps(valor)
    else:
        db.add(OrgConfig(id_colegio=id_colegio, clave=clave, valor=json.dumps(valor)))


# Empresa de db_central.oc_ordenes según id_colegio de mcdp_db (igual que la vista v_oc_area)
EMPRESA_OC = {1: "macaya", 2: "ptonuevo"}


def _max_numero_central(db: Session, id_colegio: int) -> int:
    """Último N° de OPS ya registrado en db_central.oc_ordenes (origen 'OPS', p. ej. las
    cargadas desde Excel). Solo lectura; 0 si la BD no está disponible."""
    empresa = EMPRESA_OC.get(id_colegio)
    schema = settings.OC_DB_NAME
    if not empresa or not schema or not re.fullmatch(r"[A-Za-z0-9_]+", schema):
        return 0
    try:
        return int(db.execute(text(
            f"SELECT COALESCE(MAX(num_oc), 0) FROM `{schema}`.oc_ordenes "
            f"WHERE softland = 'OPS' AND empresa = :e"), {"e": empresa}).scalar() or 0)
    except Exception:
        return 0


# ── Publicación en db_central.oc_ordenes (fuente única de OC + OPS) ────────────────
# Al EMITIR, la OPS se inserta en db_central.oc_ordenes con softland = 'OPS' (misma forma
# que las cargadas desde Excel). Al ANULAR, su estado pasa a 'UN' (sale de v_oc_area).
# Los borradores no se publican. Las filas de Softland (softland = 'softland') nunca se tocan.
# mcdp_db y db_central están en la misma instancia MySQL: todo va en la misma transacción.

def _schema_central() -> str:
    schema = settings.OC_DB_NAME
    if not schema or not re.fullmatch(r"[A-Za-z0-9_]+", schema):
        raise HTTPException(status_code=503, detail="La base central de órdenes (db_central) no está configurada.")
    return schema


def rut_con_puntos(rut: Optional[str]) -> Optional[str]:
    """'77287761-7' -> '77.287.761-7' (formato de db_central.oc_ordenes)."""
    r = normalizar_rut(rut)
    if not r:
        return None
    cuerpo, dv = r.split("-")
    return f"{int(cuerpo):,}".replace(",", ".") + f"-{dv}"


def _publicar_central(db: Session, o: OpsOrdenPago) -> None:
    """Inserta la OPS emitida en db_central.oc_ordenes (no hace commit)."""
    empresa = EMPRESA_OC.get(o.id_colegio)
    if not empresa:
        raise HTTPException(status_code=400, detail="El colegio no tiene empresa asociada en db_central.")
    schema = _schema_central()
    afecto = int(o.monto_base or 0) - int(o.descuento_monto or 0)
    es_factura = o.tipo_documento == "FACTURA"
    iva = int(o.iva_monto or 0) if es_factura else None
    retencion = None if es_factura else int(o.retencion_monto or 0)
    total = afecto + (iva or 0)  # gasto: factura = neto + IVA; boleta = bruto
    # Grupo según el área elegida en la OPS; grupo_manual = 1 para que las reglas del
    # extractor (por texto del solicitante) no lo cambien. Sin grupo: lo asignan las reglas.
    id_grupo = None
    if o.id_area:
        id_grupo = db.execute(text(
            f"SELECT id FROM `{schema}`.oc_grupos WHERE id_area = :a ORDER BY id LIMIT 1"
        ), {"a": o.id_area}).scalar()
    try:
        db.execute(text(
            f"INSERT INTO `{schema}`.oc_ordenes "
            f"(empresa, softland, tipo_documento, num_oc, num_inter_oc, fecha_oc, centro_costo, "
            f" subtotal, total, estado, rut_proveedor, proveedor, iva, retencion, total_pagar, "
            f" solicitante, id_grupo, grupo_manual) "
            f"VALUES (:empresa, 'OPS', :tipo, :num, NULL, :fecha, NULL, :subtotal, :total, 'AP', "
            f" :rut, :proveedor, :iva, :retencion, :pagar, :solicitante, :grupo, :manual)"
        ), {
            "empresa": empresa, "tipo": "Factura" if es_factura else "Boleta", "num": o.numero_ops,
            "fecha": o.fecha_emision, "subtotal": afecto, "total": total,
            "rut": rut_con_puntos(o.proveedor.rut) if o.proveedor else None,
            "proveedor": (o.proveedor.nombre[:150] if o.proveedor else None),
            "iva": iva, "retencion": retencion, "pagar": int(o.total_pagar or 0),
            "solicitante": (o.area.nombre[:500] if o.area else None),
            "grupo": id_grupo, "manual": 1 if id_grupo else 0,
        })
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=(
            f"La OPS N° {o.numero_ops} ya existe en db_central para {empresa}. "
            f"Revisa el siguiente N° en la configuración."))


def _anular_central(db: Session, o: OpsOrdenPago) -> None:
    """Marca la OPS como nula (estado 'UN') en db_central.oc_ordenes (no hace commit)."""
    empresa = EMPRESA_OC.get(o.id_colegio)
    if not empresa:
        return
    schema = _schema_central()
    db.execute(text(
        f"UPDATE `{schema}`.oc_ordenes SET estado = 'UN' "
        f"WHERE empresa = :e AND softland = 'OPS' AND num_oc = :n"
    ), {"e": empresa, "n": o.numero_ops})


def _max_numero(db: Session, id_colegio: int) -> int:
    """Último N° de OPS usado: el mayor entre las OPS de MCDP y las de db_central."""
    local = db.query(func.coalesce(func.max(OpsOrdenPago.numero_ops), 0)).filter(
        OpsOrdenPago.id_colegio == id_colegio).scalar() or 0
    return max(int(local), _max_numero_central(db, id_colegio))


def _leer_config(db: Session, colegio: Colegio) -> dict:
    iva = _cfg_valor(db, colegio.id_colegio, CFG_IVA)
    ret = _cfg_valor(db, colegio.id_colegio, CFG_RETENCION)
    sig = _cfg_valor(db, colegio.id_colegio, CFG_SIGUIENTE)
    ultimo = _max_numero(db, colegio.id_colegio)
    return {
        "id_colegio": colegio.id_colegio,
        "iva_pct": float(iva) if iva is not None else float(IVA_DEFECTO),
        "retencion_pct": float(ret) if ret is not None else float(RETENCION_DEFECTO),
        "siguiente_numero": max(int(sig or 1), ultimo + 1),
        "ultimo_numero": ultimo,
        "razon_social": _cfg_valor(db, colegio.id_colegio, CFG_RAZON_SOCIAL) or colegio.nombre,
    }


def _tomar_numero(db: Session, id_colegio: int) -> int:
    """Reserva el siguiente N° de OPS del colegio bloqueando su fila de configuración
    (SELECT ... FOR UPDATE) hasta el commit, para que dos usuarios no tomen el mismo."""
    if not _cfg_row(db, id_colegio, CFG_SIGUIENTE):
        try:
            db.add(OrgConfig(id_colegio=id_colegio, clave=CFG_SIGUIENTE, valor=json.dumps(1)))
            db.commit()
        except IntegrityError:
            db.rollback()  # otro proceso la creó al mismo tiempo
    row = _cfg_row(db, id_colegio, CFG_SIGUIENTE, lock=True)
    try:
        sig = int(json.loads(row.valor or "1"))
    except Exception:
        sig = 1
    numero = max(sig, _max_numero(db, id_colegio) + 1)
    row.valor = json.dumps(numero + 1)
    return numero


class ConfigPayload(BaseModel):
    iva_pct: float = Field(ge=0, le=100)
    retencion_pct: float = Field(ge=0, le=100)
    siguiente_numero: int = Field(ge=1)
    razon_social: Optional[str] = None


@router.get("/config")
def obtener_config(id_colegio: int, db: Session = Depends(get_db),
                   user: User = Depends(verificar_ops("ver"))):
    return _leer_config(db, _validar_colegio(db, user, id_colegio))


@router.put("/config")
def guardar_config(id_colegio: int, payload: ConfigPayload, db: Session = Depends(get_db),
                   user: User = Depends(verificar_ops("editar"))):
    colegio = _validar_colegio(db, user, id_colegio)
    ultimo = _max_numero(db, id_colegio)
    if payload.siguiente_numero <= ultimo:
        raise HTTPException(status_code=400, detail=(
            f"El siguiente N° debe ser mayor que {ultimo} (último N° de OPS usado en este colegio)."))
    _cfg_guardar(db, id_colegio, CFG_IVA, payload.iva_pct)
    _cfg_guardar(db, id_colegio, CFG_RETENCION, payload.retencion_pct)
    _cfg_guardar(db, id_colegio, CFG_SIGUIENTE, payload.siguiente_numero)
    _cfg_guardar(db, id_colegio, CFG_RAZON_SOCIAL, _limpiar(payload.razon_social) or colegio.nombre)
    db.commit()
    return _leer_config(db, colegio)


# ── Proveedores y cuentas bancarias ─────────────────────────────────────────────

class CuentaPayload(BaseModel):
    banco: str
    tipo_cuenta: str
    numero_cuenta: str
    rut_titular: str
    nombre_titular: Optional[str] = None
    correo: Optional[str] = None
    activo: bool = True


class ProveedorPayload(BaseModel):
    rut: str
    nombre: str
    telefono: Optional[str] = None
    direccion: Optional[str] = None
    correo: Optional[str] = None
    activo: bool = True


def _cuenta_dict(c: OpsProveedorCuenta) -> dict:
    return {
        "id_cuenta": c.id_cuenta, "id_proveedor": c.id_proveedor, "banco": c.banco,
        "tipo_cuenta": c.tipo_cuenta, "numero_cuenta": c.numero_cuenta,
        "rut_titular": c.rut_titular, "nombre_titular": c.nombre_titular,
        "correo": c.correo, "activo": bool(c.activo),
    }


def _proveedor_dict(p: OpsProveedor, n_ordenes: int = 0) -> dict:
    return {
        "id_proveedor": p.id_proveedor, "rut": p.rut, "nombre": p.nombre,
        "telefono": p.telefono, "direccion": p.direccion, "correo": p.correo,
        "activo": bool(p.activo), "n_ordenes": n_ordenes,
        "cuentas": [_cuenta_dict(c) for c in p.cuentas],
    }


def _datos_proveedor(payload: ProveedorPayload) -> dict:
    nombre = _limpiar(payload.nombre)
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre del proveedor es obligatorio.")
    return {
        "rut": _rut_o_400(payload.rut, "RUT del proveedor"), "nombre": nombre,
        "telefono": _limpiar(payload.telefono), "direccion": _limpiar(payload.direccion),
        "correo": _limpiar(payload.correo), "activo": payload.activo,
    }


def _datos_cuenta(payload: CuentaPayload) -> dict:
    datos = {
        "banco": _limpiar(payload.banco), "tipo_cuenta": _limpiar(payload.tipo_cuenta),
        "numero_cuenta": _limpiar(payload.numero_cuenta),
    }
    faltan = [k for k, v in datos.items() if not v]
    if faltan:
        raise HTTPException(status_code=400, detail="Banco, tipo y N° de cuenta son obligatorios.")
    datos.update({
        "rut_titular": _rut_o_400(payload.rut_titular, "RUT del titular"),
        "nombre_titular": _limpiar(payload.nombre_titular), "correo": _limpiar(payload.correo),
        "activo": payload.activo,
    })
    return datos


@router.get("/proveedores")
def listar_proveedores(q: Optional[str] = None, incluir_inactivos: bool = False,
                       db: Session = Depends(get_db), user: User = Depends(verificar_ops("ver"))):
    consulta = db.query(OpsProveedor).options(selectinload(OpsProveedor.cuentas))
    if not incluir_inactivos:
        consulta = consulta.filter(OpsProveedor.activo.is_(True))
    if q and q.strip():
        filtros = [OpsProveedor.nombre.ilike(f"%{q.strip()}%")]
        rut_parcial = re.sub(r"[^0-9kK-]", "", q)  # '77.287' -> '77287'
        if re.search(r"\d", rut_parcial):
            filtros.append(OpsProveedor.rut.ilike(f"%{rut_parcial}%"))
        consulta = consulta.filter(or_(*filtros))
    proveedores = consulta.order_by(OpsProveedor.nombre).all()
    conteo = dict(db.query(OpsOrdenPago.id_proveedor, func.count()).group_by(OpsOrdenPago.id_proveedor).all())
    return [_proveedor_dict(p, conteo.get(p.id_proveedor, 0)) for p in proveedores]


@router.post("/proveedores", status_code=201)
def crear_proveedor(payload: ProveedorPayload, db: Session = Depends(get_db),
                    user: User = Depends(verificar_ops("crear"))):
    datos = _datos_proveedor(payload)
    if db.query(OpsProveedor).filter(OpsProveedor.rut == datos["rut"]).first():
        raise HTTPException(status_code=409, detail=f"Ya existe un proveedor con RUT {datos['rut']}.")
    p = OpsProveedor(**datos)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _proveedor_dict(p)


def _proveedor_o_404(db: Session, id_proveedor: int) -> OpsProveedor:
    p = db.get(OpsProveedor, id_proveedor)
    if not p:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    return p


@router.put("/proveedores/{id_proveedor}")
def editar_proveedor(id_proveedor: int, payload: ProveedorPayload, db: Session = Depends(get_db),
                     user: User = Depends(verificar_ops("editar"))):
    p = _proveedor_o_404(db, id_proveedor)
    datos = _datos_proveedor(payload)
    otro = db.query(OpsProveedor).filter(OpsProveedor.rut == datos["rut"],
                                         OpsProveedor.id_proveedor != id_proveedor).first()
    if otro:
        raise HTTPException(status_code=409, detail=f"El RUT {datos['rut']} ya pertenece a {otro.nombre}.")
    for k, v in datos.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _proveedor_dict(p)


@router.delete("/proveedores/{id_proveedor}")
def eliminar_proveedor(id_proveedor: int, db: Session = Depends(get_db),
                       user: User = Depends(verificar_ops("eliminar"))):
    """Si tiene órdenes solo se desactiva (las OPS lo siguen referenciando)."""
    p = _proveedor_o_404(db, id_proveedor)
    usado = db.query(OpsOrdenPago.id_ops).filter(OpsOrdenPago.id_proveedor == id_proveedor).first()
    if usado:
        p.activo = False
        db.commit()
        return {"ok": True, "desactivado": True}
    db.delete(p)
    db.commit()
    return {"ok": True, "desactivado": False}


@router.post("/proveedores/{id_proveedor}/cuentas", status_code=201)
def crear_cuenta(id_proveedor: int, payload: CuentaPayload, db: Session = Depends(get_db),
                 user: User = Depends(verificar_ops("editar"))):
    _proveedor_o_404(db, id_proveedor)
    c = OpsProveedorCuenta(id_proveedor=id_proveedor, **_datos_cuenta(payload))
    db.add(c)
    db.commit()
    db.refresh(c)
    return _cuenta_dict(c)


def _cuenta_o_404(db: Session, id_proveedor: int, id_cuenta: int) -> OpsProveedorCuenta:
    c = db.get(OpsProveedorCuenta, id_cuenta)
    if not c or c.id_proveedor != id_proveedor:
        raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada.")
    return c


@router.put("/proveedores/{id_proveedor}/cuentas/{id_cuenta}")
def editar_cuenta(id_proveedor: int, id_cuenta: int, payload: CuentaPayload,
                  db: Session = Depends(get_db), user: User = Depends(verificar_ops("editar"))):
    c = _cuenta_o_404(db, id_proveedor, id_cuenta)
    for k, v in _datos_cuenta(payload).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return _cuenta_dict(c)


@router.delete("/proveedores/{id_proveedor}/cuentas/{id_cuenta}")
def eliminar_cuenta(id_proveedor: int, id_cuenta: int, db: Session = Depends(get_db),
                    user: User = Depends(verificar_ops("editar"))):
    """Las OPS guardan copia de los datos bancarios, así que borrar la cuenta no las altera."""
    db.delete(_cuenta_o_404(db, id_proveedor, id_cuenta))
    db.commit()
    return {"ok": True}


# ── Órdenes de pago ─────────────────────────────────────────────────────────────

class ItemPayload(BaseModel):
    cantidad: Optional[float] = Field(default=None, ge=0)
    detalle: str
    valor_unitario: int = Field(ge=0)


class PagoPayload(BaseModel):
    monto: int = Field(ge=0)
    fecha_pago: Optional[date] = None
    medio: str = "CHEQUE"
    nro_cheque: Optional[str] = None


class OrdenPayload(BaseModel):
    id_colegio: int
    fecha_emision: date
    id_proveedor: int
    id_area: Optional[int] = None
    tipo_orden: str = "SERVICIO"
    tipo_documento: str
    descuento_monto: int = Field(default=0, ge=0)
    forma_pago: Optional[str] = None
    observacion: Optional[str] = None
    id_cuenta: Optional[int] = None
    items: List[ItemPayload]
    pagos: List[PagoPayload] = []


class AnularPayload(BaseModel):
    motivo: str


def calcular_totales(tipo_documento: str, base: int, descuento: int,
                     iva_pct: Decimal, retencion_pct: Decimal) -> dict:
    """Factura: (neto − descuento) + IVA. Boleta de honorarios: (bruto − descuento) − retención."""
    afecto = base - descuento
    if tipo_documento == "FACTURA":
        iva = _redondear(Decimal(afecto) * iva_pct / 100)
        return {"iva_monto": iva, "retencion_monto": 0, "total_pagar": afecto + iva}
    ret = _redondear(Decimal(afecto) * retencion_pct / 100)
    return {"iva_monto": 0, "retencion_monto": ret, "total_pagar": afecto - ret}


def _total_item(it: ItemPayload) -> int:
    if it.cantidad is None or it.cantidad == 0:
        return it.valor_unitario  # en el formato la cantidad suele venir vacía
    return _redondear(Decimal(str(it.cantidad)) * it.valor_unitario)


def _aplicar_payload(db: Session, o: OpsOrdenPago, payload: OrdenPayload) -> None:
    tipo_doc = payload.tipo_documento.upper()
    if tipo_doc not in TIPOS_DOCUMENTO:
        raise HTTPException(status_code=400, detail="Tipo de documento debe ser FACTURA o BOLETA.")
    tipo_orden = payload.tipo_orden.upper()
    if tipo_orden not in TIPOS_ORDEN:
        raise HTTPException(status_code=400, detail="Tipo de orden debe ser SERVICIO o COMPRA.")
    forma = (payload.forma_pago or "").upper() or None
    if forma and forma not in FORMAS_PAGO:
        raise HTTPException(status_code=400, detail="Forma de pago debe ser CONTADO o ANTICIPO.")
    items = [i for i in payload.items if _limpiar(i.detalle)]
    if not items:
        raise HTTPException(status_code=400, detail="Agrega al menos una línea de detalle.")
    proveedor = db.get(OpsProveedor, payload.id_proveedor)
    if not proveedor:
        raise HTTPException(status_code=400, detail="Proveedor no encontrado.")
    if payload.id_area and not db.get(Area, payload.id_area):
        raise HTTPException(status_code=400, detail="Área no encontrada.")

    cuenta = None
    if payload.id_cuenta:
        cuenta = db.get(OpsProveedorCuenta, payload.id_cuenta)
        if not cuenta or cuenta.id_proveedor != proveedor.id_proveedor:
            raise HTTPException(status_code=400, detail="La cuenta bancaria no pertenece al proveedor.")

    colegio = db.get(Colegio, o.id_colegio)
    cfg = _leer_config(db, colegio)
    iva_pct = Decimal(str(cfg["iva_pct"])) if tipo_doc == "FACTURA" else None
    ret_pct = Decimal(str(cfg["retencion_pct"])) if tipo_doc == "BOLETA" else None

    o.fecha_emision = payload.fecha_emision
    o.id_proveedor = proveedor.id_proveedor
    o.id_area = payload.id_area
    o.tipo_orden = tipo_orden
    o.tipo_documento = tipo_doc
    o.forma_pago = forma
    o.observacion = _limpiar(payload.observacion)

    o.items.clear()
    base = 0
    for n, it in enumerate(items, start=1):
        total = _total_item(it)
        base += total
        o.items.append(OpsItem(
            linea=n, cantidad=it.cantidad if it.cantidad else None,
            detalle=it.detalle.strip(), valor_unitario=it.valor_unitario, valor_total=total,
        ))
    if payload.descuento_monto > base:
        raise HTTPException(status_code=400, detail="El descuento no puede superar el total del detalle.")

    o.monto_base = base
    o.descuento_monto = payload.descuento_monto
    o.iva_pct = iva_pct
    o.retencion_pct = ret_pct
    for k, v in calcular_totales(tipo_doc, base, payload.descuento_monto,
                                 iva_pct or Decimal(0), ret_pct or Decimal(0)).items():
        setattr(o, k, v)

    o.pagos.clear()
    pagos = [p for p in payload.pagos if p.monto > 0] or [PagoPayload(monto=o.total_pagar, medio="CHEQUE")]
    for n, p in enumerate(pagos, start=1):
        medio = (p.medio or "CHEQUE").upper()
        if medio not in MEDIOS_PAGO:
            raise HTTPException(status_code=400, detail=f"Medio de pago inválido: {p.medio}.")
        pct = (Decimal(p.monto) * 100 / o.total_pagar).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) \
            if o.total_pagar else None
        o.pagos.append(OpsPago(nro_cuota=n, monto=p.monto, fecha_pago=p.fecha_pago, porcentaje=pct,
                               medio=medio, nro_cheque=_limpiar(p.nro_cheque)))

    o.id_cuenta = cuenta.id_cuenta if cuenta else None
    o.cta_titular = (cuenta.nombre_titular or proveedor.nombre) if cuenta else None
    o.cta_rut = cuenta.rut_titular if cuenta else None
    o.cta_banco = cuenta.banco if cuenta else None
    o.cta_tipo = cuenta.tipo_cuenta if cuenta else None
    o.cta_numero = cuenta.numero_cuenta if cuenta else None
    o.cta_correo = (cuenta.correo or proveedor.correo) if cuenta else None


def alertas_orden(o: OpsOrdenPago) -> List[dict]:
    alertas = []
    suma = sum(p.monto for p in o.pagos)
    if abs(suma - o.total_pagar) > TOLERANCIA_CUOTAS:
        alertas.append({"codigo": "CUOTAS_NO_CUADRAN",
                        "mensaje": f"Las cuotas suman ${suma:,} y el total a pagar es ${o.total_pagar:,}.".replace(",", ".")})
    elif suma != o.total_pagar:
        alertas.append({"codigo": "CUOTAS_REDONDEO",
                        "mensaje": f"Diferencia de ${abs(suma - o.total_pagar)} por redondeo entre cuotas y total."})
    if o.fecha_emision:
        otros = sorted({p.fecha_pago.year for p in o.pagos if p.fecha_pago and p.fecha_pago.year != o.fecha_emision.year})
        if otros:
            alertas.append({"codigo": "FECHA_PAGO_OTRO_ANIO",
                            "mensaje": f"Hay fechas de pago en {', '.join(map(str, otros))} y la emisión es de {o.fecha_emision.year}."})
        if any(p.fecha_pago and p.fecha_pago < o.fecha_emision for p in o.pagos):
            alertas.append({"codigo": "FECHA_PAGO_ANTERIOR",
                            "mensaje": "Hay fechas de pago anteriores a la fecha de emisión."})
    if any(p.medio == "TRANSFERENCIA" for p in o.pagos) and not o.cta_numero:
        alertas.append({"codigo": "SIN_CUENTA", "mensaje": "Hay pagos por transferencia sin cuenta bancaria seleccionada."})
    return alertas


def _orden_dict(o: OpsOrdenPago, detalle: bool = False) -> dict:
    d = {
        "id_ops": o.id_ops, "id_colegio": o.id_colegio,
        "colegio": o.colegio.nombre if o.colegio else None,
        "numero_ops": o.numero_ops, "fecha_emision": o.fecha_emision.isoformat() if o.fecha_emision else None,
        "id_proveedor": o.id_proveedor,
        "proveedor": o.proveedor.nombre if o.proveedor else None,
        "rut_proveedor": o.proveedor.rut if o.proveedor else None,
        "id_area": o.id_area, "area": o.area.nombre if o.area else None,
        "tipo_orden": o.tipo_orden, "tipo_documento": o.tipo_documento,
        "monto_base": o.monto_base, "descuento_monto": o.descuento_monto,
        "iva_pct": float(o.iva_pct) if o.iva_pct is not None else None, "iva_monto": o.iva_monto,
        "retencion_pct": float(o.retencion_pct) if o.retencion_pct is not None else None,
        "retencion_monto": o.retencion_monto, "total_pagar": o.total_pagar,
        "estado": o.estado, "creado_en": o.creado_en.isoformat() if o.creado_en else None,
    }
    if detalle:
        d.update({
            "forma_pago": o.forma_pago, "observacion": o.observacion, "id_cuenta": o.id_cuenta,
            "cuenta": {"titular": o.cta_titular, "rut": o.cta_rut, "banco": o.cta_banco, "tipo": o.cta_tipo,
                       "numero": o.cta_numero, "correo": o.cta_correo} if o.cta_numero else None,
            "firmante_nombre": o.firmante_nombre, "firmante_cargo": o.firmante_cargo,
            "fecha_emitida": o.fecha_emitida.isoformat() if o.fecha_emitida else None,
            "fecha_anulada": o.fecha_anulada.isoformat() if o.fecha_anulada else None,
            "motivo_anulacion": o.motivo_anulacion,
            "items": [{"linea": i.linea, "cantidad": float(i.cantidad) if i.cantidad is not None else None,
                       "detalle": i.detalle, "valor_unitario": i.valor_unitario, "valor_total": i.valor_total}
                      for i in o.items],
            "pagos": [{"nro_cuota": p.nro_cuota, "monto": p.monto,
                       "fecha_pago": p.fecha_pago.isoformat() if p.fecha_pago else None,
                       "porcentaje": float(p.porcentaje) if p.porcentaje is not None else None,
                       "medio": p.medio, "nro_cheque": p.nro_cheque} for p in o.pagos],
            "alertas": alertas_orden(o),
        })
    return d


def _cargar_orden(db: Session, user: User, id_ops: int) -> OpsOrdenPago:
    o = db.query(OpsOrdenPago).options(
        selectinload(OpsOrdenPago.items), selectinload(OpsOrdenPago.pagos),
        selectinload(OpsOrdenPago.proveedor), selectinload(OpsOrdenPago.area),
        selectinload(OpsOrdenPago.colegio),
    ).filter(OpsOrdenPago.id_ops == id_ops).first()
    if not o:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada.")
    permitidos = _colegios_usuario(user)
    if permitidos is not None and o.id_colegio not in permitidos:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta orden.")
    return o


@router.get("/ordenes")
def listar_ordenes(
    id_colegio: Optional[int] = None, estado: Optional[str] = None,
    tipo_documento: Optional[str] = None, id_proveedor: Optional[int] = None,
    id_area: Optional[int] = None, desde: Optional[date] = None, hasta: Optional[date] = None,
    q: Optional[str] = None, limite: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db), user: User = Depends(verificar_ops("ver")),
):
    consulta = db.query(OpsOrdenPago).options(
        selectinload(OpsOrdenPago.proveedor), selectinload(OpsOrdenPago.area),
        selectinload(OpsOrdenPago.colegio))
    permitidos = _colegios_usuario(user)
    if id_colegio:
        _validar_colegio(db, user, id_colegio)
        consulta = consulta.filter(OpsOrdenPago.id_colegio == id_colegio)
    elif permitidos is not None:
        consulta = consulta.filter(OpsOrdenPago.id_colegio.in_(permitidos or {-1}))
    if estado:
        consulta = consulta.filter(OpsOrdenPago.estado == estado.upper())
    if tipo_documento:
        consulta = consulta.filter(OpsOrdenPago.tipo_documento == tipo_documento.upper())
    if id_proveedor:
        consulta = consulta.filter(OpsOrdenPago.id_proveedor == id_proveedor)
    if id_area:
        consulta = consulta.filter(OpsOrdenPago.id_area == id_area)
    if desde:
        consulta = consulta.filter(OpsOrdenPago.fecha_emision >= desde)
    if hasta:
        consulta = consulta.filter(OpsOrdenPago.fecha_emision <= hasta)
    if q and q.strip():
        t = q.strip()
        filtros = [OpsProveedor.nombre.ilike(f"%{t}%"), OpsProveedor.rut.ilike(f"%{t}%"),
                   OpsOrdenPago.observacion.ilike(f"%{t}%"),
                   OpsOrdenPago.id_ops.in_(db.query(OpsItem.id_ops).filter(OpsItem.detalle.ilike(f"%{t}%")))]
        if t.isdigit():
            filtros.append(OpsOrdenPago.numero_ops == int(t))
        consulta = consulta.join(OpsProveedor, OpsProveedor.id_proveedor == OpsOrdenPago.id_proveedor).filter(or_(*filtros))
    ordenes = consulta.order_by(OpsOrdenPago.numero_ops.desc()).limit(limite).all()
    return [_orden_dict(o) for o in ordenes]


@router.get("/ordenes/{id_ops}")
def obtener_orden(id_ops: int, db: Session = Depends(get_db), user: User = Depends(verificar_ops("ver"))):
    return _orden_dict(_cargar_orden(db, user, id_ops), detalle=True)


@router.post("/ordenes", status_code=201)
def crear_orden(payload: OrdenPayload, db: Session = Depends(get_db),
                user: User = Depends(verificar_ops("crear"))):
    _validar_colegio(db, user, payload.id_colegio)
    o = OpsOrdenPago(id_colegio=payload.id_colegio, estado="BORRADOR", id_user_crea=user.id_user)
    _aplicar_payload(db, o, payload)
    o.numero_ops = _tomar_numero(db, payload.id_colegio)
    db.add(o)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="No se pudo asignar el N° de OPS (choque con otra orden). Intenta de nuevo.")
    return _orden_dict(_cargar_orden(db, user, o.id_ops), detalle=True)


@router.put("/ordenes/{id_ops}")
def editar_orden(id_ops: int, payload: OrdenPayload, db: Session = Depends(get_db),
                 user: User = Depends(verificar_ops("editar"))):
    o = _cargar_orden(db, user, id_ops)
    if o.estado != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo se pueden editar órdenes en borrador.")
    if payload.id_colegio != o.id_colegio:
        raise HTTPException(status_code=400, detail="No se puede cambiar el colegio de una orden (su N° es del colegio).")
    _aplicar_payload(db, o, payload)
    db.commit()
    return _orden_dict(_cargar_orden(db, user, id_ops), detalle=True)


@router.post("/ordenes/{id_ops}/emitir")
def emitir_orden(id_ops: int, db: Session = Depends(get_db), user: User = Depends(verificar_ops("editar"))):
    o = _cargar_orden(db, user, id_ops)
    if o.estado != "BORRADOR":
        raise HTTPException(status_code=400, detail="Solo se pueden emitir órdenes en borrador.")
    if o.total_pagar <= 0:
        raise HTTPException(status_code=400, detail="El total a pagar debe ser mayor que cero.")
    o.estado = "EMITIDA"
    o.id_user_emite = user.id_user
    o.fecha_emitida = datetime.utcnow()
    o.firmante_nombre = user.nombre
    cargo = user.cargo.nombre if user.cargo else (user.cargos[0].nombre if user.cargos else None)
    o.firmante_cargo = cargo
    _publicar_central(db, o)
    db.commit()
    return _orden_dict(_cargar_orden(db, user, id_ops), detalle=True)


@router.post("/ordenes/{id_ops}/anular")
def anular_orden(id_ops: int, payload: AnularPayload, db: Session = Depends(get_db),
                 user: User = Depends(verificar_ops("eliminar"))):
    o = _cargar_orden(db, user, id_ops)
    if o.estado == "ANULADA":
        raise HTTPException(status_code=400, detail="La orden ya está anulada.")
    motivo = _limpiar(payload.motivo)
    if not motivo:
        raise HTTPException(status_code=400, detail="Indica el motivo de la anulación.")
    if o.estado == "EMITIDA":
        _anular_central(db, o)
    o.estado = "ANULADA"
    o.motivo_anulacion = motivo[:300]
    o.fecha_anulada = datetime.utcnow()
    db.commit()
    return _orden_dict(_cargar_orden(db, user, id_ops), detalle=True)


@router.get("/ordenes/{id_ops}/pdf")
def pdf_orden(id_ops: int, descargar: bool = False, db: Session = Depends(get_db),
              user: User = Depends(verificar_ops("ver"))):
    """PDF de la OPS. `descargar=true` lo baja como archivo; si no, se abre en el navegador (imprimir)."""
    from app.services.ops_pdf import generar_pdf_ops

    o = _cargar_orden(db, user, id_ops)
    datos = _orden_dict(o, detalle=True)
    datos["razon_social"] = _leer_config(db, o.colegio)["razon_social"]
    datos["colegio_rut"] = o.colegio.rut if o.colegio else None
    datos["colegio_direccion"] = o.colegio.direccion if o.colegio else None
    datos["proveedor_direccion"] = o.proveedor.direccion if o.proveedor else None
    datos["proveedor_telefono"] = o.proveedor.telefono if o.proveedor else None
    datos["proveedor_correo"] = o.proveedor.correo if o.proveedor else None
    pdf = generar_pdf_ops(datos)
    nombre = f"OPS_{o.numero_ops}_{(o.colegio.sigla or o.id_colegio) if o.colegio else ''}.pdf"
    disposicion = "attachment" if descargar else "inline"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'{disposicion}; filename="{nombre}"'})
