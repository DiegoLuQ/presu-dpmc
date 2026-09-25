from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.db.session import get_db
from app.models import AiProviderConfig, AiUsoTokens, User, CategoriaRecurso, SubcategoriaRecurso, PmeDimensionInfo
from app.api.auth import get_current_user
from app.api.deps import verificar_permisos
from app.services.ai_service import (
    encrypt_api_key, mask_api_key, call_ai,
    build_cuenta_prompt, build_categoria_prompt, build_categoria_lote_prompt,
    build_cuenta_multi_prompt, build_grupo_prompt, build_actividad_pme_prompt,
    build_actividades_pme_lote_prompt,
    MODELOS_POR_PROVEEDOR, DESTINOS_MULTI
)
import json
import time
import re

router = APIRouter(prefix="/ai", tags=["IA"])


def _repair_truncated_json(s: str):
    """Repara un JSON truncado (cortado por max_tokens) salvando los objetos
    completos ya presentes dentro del array. Devuelve dict o None."""
    stack = []
    in_str = False
    escape = False
    safe_cut = None      # índice (inclusive) donde es seguro cortar
    safe_stack = None    # snapshot del stack en ese corte
    for i, ch in enumerate(s):
        if escape:
            escape = False
            continue
        if ch == '\\':
            escape = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch in '{[':
            stack.append(ch)
        elif ch in '}]':
            if not stack:
                continue
            stack.pop()
            # Si tras cerrar quedamos dentro de un array, es un límite seguro de elemento
            if stack and stack[-1] == '[':
                safe_cut = i
                safe_stack = list(stack)
    if safe_cut is None or not safe_stack:
        return None
    closers = {'{': '}', '[': ']'}
    tail = ''.join(closers[b] for b in reversed(safe_stack))
    candidate = s[:safe_cut + 1] + tail
    try:
        return json.loads(candidate)
    except Exception:
        return None


def _extract_json(raw: str) -> dict:
    """Extrae el primer objeto JSON válido del texto de respuesta de la IA.
    Tolera: fences de markdown, texto antes/después del JSON, comas finales
    y respuestas truncadas por límite de tokens."""
    raw = (raw or "").strip()

    # 1. Quitar fences de markdown (```json ... ``` o ``` ... ```)
    if raw.startswith("```"):
        raw = re.sub(r'^```[a-zA-Z0-9]*\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw).strip()
    raw = raw.replace("```json", "").replace("```", "").strip()

    # Candidatos: texto completo y desde la primera llave
    candidates = [raw]
    start = raw.find('{')
    if start > 0:
        candidates.append(raw[start:])

    decoder = json.JSONDecoder()
    for cand in candidates:
        cand = cand.strip()
        # a) parse directo
        try:
            return json.loads(cand)
        except Exception:
            pass
        # b) raw_decode: toma el primer valor JSON e ignora lo que sobre
        try:
            obj, _ = decoder.raw_decode(cand)
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass
        # c) quitar comas finales antes de } o ] y reintentar
        cleaned = re.sub(r',(\s*[}\]])', r'\1', cand)
        try:
            return json.loads(cleaned)
        except Exception:
            pass
        try:
            obj, _ = decoder.raw_decode(cleaned)
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass

    # 2. Reparar JSON truncado (salva objetos completos del array)
    if start != -1:
        repaired = _repair_truncated_json(raw[start:])
        if repaired is not None:
            return repaired

    raise json.JSONDecodeError("No se encontró JSON válido en la respuesta", raw, 0)


def _log_uso(db: Session, current_user: User, config: AiProviderConfig, endpoint: str, usage: dict):
    try:
        db.add(AiUsoTokens(
            id_colegio=current_user.id_colegio,
            id_usuario=current_user.id_user,
            proveedor=config.proveedor,
            modelo=config.modelo,
            endpoint=endpoint,
            tokens_entrada=usage.get("tokens_entrada", 0),
            tokens_salida=usage.get("tokens_salida", 0),
            tokens_total=usage.get("tokens_total", 0),
        ))
        db.commit()
    except Exception:
        pass  # El log nunca debe romper el flujo principal

# Administran las API keys (guardar, borrar, probar conexión, ver consumo).
ROLES_ADMIN_AI = {"ADM", "DIR", "GERENTE"}

# Pueden elegir con qué proveedor/modelo se ejecuta una asesoría. Más estrecho a
# propósito: para todos los demás roles el proveedor lo fija el predeterminado
# que se marcó en Configuración → API Key AI.
ROLES_ELIGEN_PROVEEDOR_AI = {"ADM"}


def _puede_elegir_proveedor_ia(user: User) -> bool:
    return bool(user.rol) and user.rol.codigo in ROLES_ELIGEN_PROVEEDOR_AI


# ── Schemas ──────────────────────────────────────────────────────────────────

class AiProviderUpsert(BaseModel):
    proveedor: str
    api_key: str
    modelo: str
    es_default: bool = False


class AiProviderResponse(BaseModel):
    id: int
    proveedor: str
    api_key_masked: str
    modelo: str
    es_default: bool
    activo: bool


class AiSugerirCuentaRequest(BaseModel):
    recurso_nombre: str
    recurso_descripcion: Optional[str] = None
    id_cat_recurso: Optional[int] = None
    destino_uso: str = "ESTUDIANTE"
    tipo_transaccion: str = "COMPRA"
    subvencion: str = "GENERAL"
    proveedor_override: Optional[str] = None


# ── Endpoints de configuración (solo ADM/DIR/GERENTE) ────────────────────────

@router.get("/modelos")
def get_modelos_disponibles():
    return MODELOS_POR_PROVEEDOR


@router.get("/proveedores", response_model=List[AiProviderResponse])
def list_proveedores(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    configs = db.query(AiProviderConfig).filter(
        AiProviderConfig.id_colegio == current_user.id_colegio,
        AiProviderConfig.activo == True
    ).all()
    return [
        AiProviderResponse(
            id=c.id,
            proveedor=c.proveedor,
            api_key_masked=mask_api_key(c.api_key_encrypted),
            modelo=c.modelo,
            es_default=c.es_default,
            activo=c.activo,
        ) for c in configs
    ]


@router.get("/proveedores-disponibles")
def list_proveedores_disponibles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Proveedores que este usuario puede elegir en el botón flotante Tema/IA.

    Sin API keys (ni enmascaradas): solo proveedor y modelo. Aplica el mismo
    respaldo entre colegios que `_resolver_config_ia`, para que la lista coincida
    con lo que realmente se usará en las asesorías. `compartido=True` indica que
    la key pertenece a otro colegio.
    """
    configs = db.query(AiProviderConfig).filter(
        AiProviderConfig.id_colegio == current_user.id_colegio,
        AiProviderConfig.activo == True
    ).all()
    compartido = False
    if not configs:
        configs = db.query(AiProviderConfig).filter(AiProviderConfig.activo == True).all()
        compartido = True
    return [
        {
            "proveedor": c.proveedor,
            "modelo": c.modelo,
            "es_default": c.es_default,
            "compartido": compartido,
        } for c in configs
    ]


@router.put("/proveedores/{proveedor}")
def upsert_proveedor(
    proveedor: str,
    body: AiProviderUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.rol and current_user.rol.codigo not in ROLES_ADMIN_AI:
        raise HTTPException(status_code=403, detail="Sin permisos")

    existing = db.query(AiProviderConfig).filter(
        AiProviderConfig.id_colegio == current_user.id_colegio,
        AiProviderConfig.proveedor == proveedor
    ).first()

    # Si se establece como default, quitar default de los demás
    if body.es_default:
        db.query(AiProviderConfig).filter(
            AiProviderConfig.id_colegio == current_user.id_colegio
        ).update({"es_default": False})

    # Si la key viene como "••••" no cifrar (el usuario no la cambió)
    if existing and body.api_key.startswith("•"):
        nueva_key_enc = existing.api_key_encrypted
    else:
        nueva_key_enc = encrypt_api_key(body.api_key)

    if existing:
        existing.api_key_encrypted = nueva_key_enc
        existing.modelo = body.modelo
        existing.es_default = body.es_default
        existing.activo = True
    else:
        db.add(AiProviderConfig(
            id_colegio=current_user.id_colegio,
            proveedor=proveedor,
            api_key_encrypted=nueva_key_enc,
            modelo=body.modelo,
            es_default=body.es_default,
            activo=True,
        ))

    db.commit()
    return {"ok": True}


@router.delete("/proveedores/{proveedor}")
def delete_proveedor(
    proveedor: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.rol and current_user.rol.codigo not in ROLES_ADMIN_AI:
        raise HTTPException(status_code=403, detail="Sin permisos")
    db.query(AiProviderConfig).filter(
        AiProviderConfig.id_colegio == current_user.id_colegio,
        AiProviderConfig.proveedor == proveedor
    ).delete()
    db.commit()
    return {"ok": True}


@router.get("/proveedor-activo")
def get_proveedor_activo(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Misma resolución (con respaldo entre colegios) que usan las asesorías, para
    # que el botón flotante muestre el proveedor que realmente se va a llamar.
    try:
        config = _resolver_config_ia(db, current_user, None)
    except HTTPException:
        return {"proveedor": None, "modelo": None}
    return {
        "proveedor": config.proveedor,
        "modelo": config.modelo,
        "compartido": config.id_colegio != current_user.id_colegio,
    }


# ── Endpoint de sugerencia de cuenta ─────────────────────────────────────────

class TestConexionRequest(BaseModel):
    proveedor: str
    modelo: str
    api_key: str  # puede venir enmascarada ("••••") — en ese caso usamos la guardada en BD


@router.post("/test-conexion")
def test_conexion(
    req: TestConexionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.rol and current_user.rol.codigo not in ROLES_ADMIN_AI:
        raise HTTPException(status_code=403, detail="Sin permisos")

    # Resolver key: si viene enmascarada usamos la guardada en BD
    if req.api_key.startswith("•"):
        config = db.query(AiProviderConfig).filter(
            AiProviderConfig.id_colegio == current_user.id_colegio,
            AiProviderConfig.proveedor == req.proveedor
        ).first()
        if not config:
            raise HTTPException(status_code=400, detail="No hay API key guardada para este proveedor.")
        key_encrypted = config.api_key_encrypted
    else:
        key_encrypted = encrypt_api_key(req.api_key)

    start = time.time()
    try:
        respuesta, _usage = call_ai(
            proveedor=req.proveedor,
            api_key_encrypted=key_encrypted,
            modelo=req.modelo,
            system_prompt="Eres un asistente de prueba. Responde siempre con exactamente: ok",
            user_prompt="Confirma la conexión respondiendo solo con 'ok'.",
        )
        latencia_ms = round((time.time() - start) * 1000)
        return {
            "ok": True,
            "proveedor": req.proveedor,
            "modelo": req.modelo,
            "respuesta": respuesta,
            "latencia_ms": latencia_ms,
        }
    except Exception as e:
        latencia_ms = round((time.time() - start) * 1000)
        raise HTTPException(status_code=502, detail=str(e))


class AsesorarCategoriaRequest(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    motivo: Optional[str] = None
    destino_gasto: Optional[str] = None
    proveedor_override: Optional[str] = None


@router.post("/asesorar-categoria")
def asesorar_categoria(
    req: AsesorarCategoriaRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = _resolver_config_ia(db, current_user, req.proveedor_override)

    # Obtener todas las categorías con descripción
    categorias = db.query(CategoriaRecurso).all()
    cats_json = [
        {"id_cat_recurso": c.id_cat_recurso, "nombre": c.nombre, "descripcion": c.descripcion or ""}
        for c in categorias
    ]

    # Obtener grupos de recursos
    from app.models import GrupoRecurso
    grupos = db.query(GrupoRecurso).all()
    grupos_json = [{"id_grupo_recurso": g.id_grupo_recurso, "nombre": g.nombre} for g in grupos]
    ids_grupo_validos = {g.id_grupo_recurso for g in grupos}

    system_prompt, user_prompt = build_categoria_prompt(
        nombre=req.nombre,
        descripcion=req.descripcion,
        motivo=req.motivo,
        destino=req.destino_gasto,
        categorias=cats_json,
        grupos=grupos_json,
    )

    try:
        raw, usage, config_usada = call_ai_con_fallback(
            db, current_user, system_prompt, user_prompt,
            max_tokens=4096, operacion="asesorar-categoria",
            proveedor_override=req.proveedor_override,
        )
        result = _extract_json(raw)

        # Validar el grupo sugerido contra los ids reales
        grupo = result.get("grupo") or {}
        id_grupo = grupo.get("id_grupo_recurso")
        if id_grupo not in ids_grupo_validos:
            nombre_g = (grupo.get("nombre") or "").strip().lower()
            match = next((g for g in grupos if g.nombre.strip().lower() == nombre_g), None)
            id_grupo = match.id_grupo_recurso if match else None
        grupo_final = None
        if id_grupo is not None:
            nombre_g = next((g.nombre for g in grupos if g.id_grupo_recurso == id_grupo), None)
            grupo_final = {"id_grupo_recurso": id_grupo, "nombre": nombre_g, "razon": grupo.get("razon", "")}

        return {
            "recomendaciones": result.get("recomendaciones", []),
            "grupo": grupo_final,
            "proveedor": config_usada.proveedor,
            "modelo": config_usada.modelo,
        }
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"La IA no devolvió JSON válido. Respuesta recibida: {repr(raw[:300])}")
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al llamar a la IA: {str(e)}")


class AsesorarGrupoRequest(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    proveedor_override: Optional[str] = None


class InsumoAClasificar(BaseModel):
    """`ref` lo asigna el cliente y viaja de ida y vuelta, para poder devolver las
    clasificaciones asociadas a sus filas sin depender del orden de la respuesta."""
    ref: int
    nombre: str
    descripcion: Optional[str] = None
    motivo: Optional[str] = None
    destino: Optional[str] = None


class ClasificarInsumosLoteRequest(BaseModel):
    insumos: List[InsumoAClasificar]
    proveedor_override: Optional[str] = None


# Tope de insumos por llamada. El catálogo de categorías y grupos se paga una vez
# por llamada, así que conviene que los lotes sean grandes; el límite lo pone la
# salida (~45 tokens por clasificación contra max_tokens=8192).
LOTE_CLASIFICACION_MAX = 40


@router.post("/clasificar-insumos-lote")
def clasificar_insumos_lote(
    req: ClasificarInsumosLoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Clasifica varios insumos (categoría + grupo) en una sola llamada a la IA.

    Equivalente a llamar `/ai/asesorar-categoria` una vez por insumo, pero enviando
    el catálogo de categorías y grupos —que es la mayor parte del prompt— una sola
    vez para todo el lote. Se usa antes de crear en bloque los insumos que no existen
    en el catálogo oficial.
    """
    if not req.insumos:
        return {"clasificaciones": [], "proveedor": None, "modelo": None}
    if len(req.insumos) > LOTE_CLASIFICACION_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {LOTE_CLASIFICACION_MAX} insumos por llamada; llegaron {len(req.insumos)}."
        )

    config = _resolver_config_ia(db, current_user, req.proveedor_override)

    categorias = db.query(CategoriaRecurso).all()
    cats_json = [
        {"id_cat_recurso": c.id_cat_recurso, "nombre": c.nombre, "descripcion": c.descripcion or ""}
        for c in categorias
    ]
    ids_cat_validos = {c.id_cat_recurso for c in categorias}

    from app.models import GrupoRecurso
    grupos = db.query(GrupoRecurso).all()
    grupos_json = [{"id_grupo_recurso": g.id_grupo_recurso, "nombre": g.nombre} for g in grupos]
    ids_grupo_validos = {g.id_grupo_recurso for g in grupos}

    system_prompt, user_prompt = build_categoria_lote_prompt(
        insumos=[i.dict() for i in req.insumos],
        categorias=cats_json,
        grupos=grupos_json,
    )

    raw = ""
    try:
        raw, usage, config_usada = call_ai_con_fallback(
            db, current_user, system_prompt, user_prompt,
            max_tokens=8192, operacion="clasificar-insumos-lote",
            proveedor_override=req.proveedor_override,
        )
        result = _extract_json(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail=f"La IA no devolvió JSON válido. Respuesta recibida: {repr(raw[:300])}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al llamar a la IA: {e}")

    # Validación: se descartan ids inventados en vez de propagarlos a la BD. Un ref
    # sin clasificación válida vuelve con los campos en null para que el usuario
    # decida a mano, en vez de crear el recurso en una categoría equivocada.
    por_ref = {}
    for c in (result.get("clasificaciones") or []):
        try:
            ref = int(c.get("ref"))
        except (TypeError, ValueError):
            continue
        id_cat = c.get("id_cat_recurso") if c.get("id_cat_recurso") in ids_cat_validos else None
        id_grupo = c.get("id_grupo_recurso") if c.get("id_grupo_recurso") in ids_grupo_validos else None
        por_ref[ref] = {
            "ref": ref,
            "id_cat_recurso": id_cat,
            "categoria_nombre": next((c2.nombre for c2 in categorias if c2.id_cat_recurso == id_cat), None),
            "id_grupo_recurso": id_grupo,
            "grupo_nombre": next((g.nombre for g in grupos if g.id_grupo_recurso == id_grupo), None),
            "confianza": c.get("confianza"),
            "razon": (c.get("razon") or "")[:160],
        }

    return {
        "clasificaciones": [
            por_ref.get(i.ref, {
                "ref": i.ref, "id_cat_recurso": None, "categoria_nombre": None,
                "id_grupo_recurso": None, "grupo_nombre": None,
                "confianza": None, "razon": "La IA no devolvió clasificación para este insumo.",
            })
            for i in req.insumos
        ],
        "proveedor": config_usada.proveedor,
        "modelo": config_usada.modelo,
    }


def _resolver_config_ia(db: Session, current_user: User, proveedor_override: Optional[str] = None):
    """Resuelve qué configuración de IA usar para este usuario.

    Prioridad: proveedor elegido a mano por el usuario (botón flotante Tema/IA,
    `localStorage.ai_provider_override`) → default de su colegio → cualquiera
    activo de su colegio.

    El override solo se respeta para los roles de `ROLES_ELIGEN_PROVEEDOR_AI`.
    Para el resto de los usuarios el proveedor y el modelo los fija el
    predeterminado que se marcó en Configuración → API Key AI, y cualquier
    `proveedor_override` que llegue en el request se ignora.

    Si el colegio del usuario todavía no tiene API keys propias, se cae a las de
    otro colegio que sí las tenga, para que las asesorías estén disponibles para
    todos los usuarios y no solo para el colegio que configuró las keys. El
    consumo de tokens se sigue registrando con el colegio real del usuario
    (ver `_log_uso`), no con el dueño de la key.
    """
    activos = db.query(AiProviderConfig).filter(AiProviderConfig.activo == True)
    cid = current_user.id_colegio
    if not _puede_elegir_proveedor_ia(current_user):
        proveedor_override = None

    candidatos = []
    if proveedor_override:
        candidatos.append(activos.filter(
            AiProviderConfig.id_colegio == cid,
            AiProviderConfig.proveedor == proveedor_override
        ))
    candidatos.append(activos.filter(
        AiProviderConfig.id_colegio == cid,
        AiProviderConfig.es_default == True
    ))
    candidatos.append(activos.filter(AiProviderConfig.id_colegio == cid))
    # Respaldo compartido entre colegios.
    if proveedor_override:
        candidatos.append(activos.filter(AiProviderConfig.proveedor == proveedor_override))
    candidatos.append(activos.filter(AiProviderConfig.es_default == True))
    candidatos.append(activos)

    for query in candidatos:
        config = query.first()
        if config:
            return config

    raise HTTPException(
        status_code=400,
        detail="No hay ningún proveedor de IA configurado en el sistema. Un administrador debe registrarlo en Configuración → API Key AI."
    )


@router.post("/asesorar-grupo")
def asesorar_grupo(
    req: AsesorarGrupoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    config = _resolver_config_ia(db, current_user, req.proveedor_override)

    from app.models import GrupoRecurso
    grupos = db.query(GrupoRecurso).all()
    if not grupos:
        raise HTTPException(status_code=400, detail="No hay grupos de recursos registrados.")
    grupos_json = [{"id_grupo_recurso": g.id_grupo_recurso, "nombre": g.nombre} for g in grupos]
    ids_validos = {g.id_grupo_recurso for g in grupos}

    system_prompt, user_prompt = build_grupo_prompt(
        nombre=req.nombre,
        descripcion=req.descripcion,
        grupos=grupos_json,
    )

    try:
        raw, usage, config_usada = call_ai_con_fallback(
            db, current_user, system_prompt, user_prompt,
            max_tokens=2048, operacion="asesorar-grupo",
            proveedor_override=req.proveedor_override,
        )
        result = _extract_json(raw)
        id_sugerido = result.get("id_grupo_recurso")
        # Validar que el id exista; si no, intentar match por nombre
        if id_sugerido not in ids_validos:
            nombre_sug = (result.get("nombre") or "").strip().lower()
            match = next((g for g in grupos if g.nombre.strip().lower() == nombre_sug), None)
            id_sugerido = match.id_grupo_recurso if match else None
        nombre_final = next((g.nombre for g in grupos if g.id_grupo_recurso == id_sugerido), None)
        return {
            "id_grupo_recurso": id_sugerido,
            "nombre": nombre_final,
            "razon": result.get("razon", ""),
            "proveedor": config_usada.proveedor,
            "modelo": config_usada.modelo,
        }
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"La IA no devolvió JSON válido. Respuesta: {repr(raw[:300])}")
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al llamar a la IA: {str(e)}")


class AsesorarCuentaRequest(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    id_cat_recurso: Optional[int] = None
    destino_uso: Optional[str] = None
    proveedor_override: Optional[str] = None


@router.post("/asesorar-cuenta")
def asesorar_cuenta(
    req: AsesorarCuentaRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Resolver proveedor
    config = None
    if req.proveedor_override:
        config = db.query(AiProviderConfig).filter(
            AiProviderConfig.id_colegio == current_user.id_colegio,
            AiProviderConfig.proveedor == req.proveedor_override,
            AiProviderConfig.activo == True
        ).first()
    if not config:
        config = db.query(AiProviderConfig).filter(
            AiProviderConfig.id_colegio == current_user.id_colegio,
            AiProviderConfig.es_default == True,
            AiProviderConfig.activo == True
        ).first()
    if not config:
        config = db.query(AiProviderConfig).filter(
            AiProviderConfig.id_colegio == current_user.id_colegio,
            AiProviderConfig.activo == True
        ).first()
    if not config:
        raise HTTPException(status_code=400, detail="No hay proveedor de IA configurado.")

    # Catálogo = matriz oficial de destinos por cuenta (pre_cuenta_destino),
    # unida a la matriz de reglas para obtener el nombre de cada cuenta.
    from app.models import CuentaDestino, CuentaMatrizReglas
    filas = (
        db.query(CuentaDestino, CuentaMatrizReglas.nombre)
        .join(CuentaMatrizReglas, CuentaDestino.codigo == CuentaMatrizReglas.codigo)
        .all()
    )

    cuentas_json = [
        {
            "codigo": cd.codigo,
            "nombre": nombre,
            "grupo": cd.grupo or "",
            "destinos": {
                "ESTUDIANTE": cd.estudiante,
                "FUNCIONARIO": cd.funcionario,
                "PREMIO": cd.premio,
                "MANTENCION": cd.mantencion,
            },
            "destino_principal": cd.destino_principal,
        }
        for cd, nombre in filas
    ]

    system_prompt, user_prompt = build_cuenta_multi_prompt(
        nombre=req.nombre,
        descripcion=req.descripcion,
        cuentas=cuentas_json,
        destino_uso=req.destino_uso,
    )

    try:
        raw, usage, config_usada = call_ai_con_fallback(
            db, current_user, system_prompt, user_prompt,
            max_tokens=8192,
            operacion="asesorar-cuenta",
            proveedor_override=req.proveedor_override,
        )
        result = _extract_json(raw)
        sugerencias_raw = result.get("sugerencias", [])
        # Deduplicar por destino (quedarse con la primera aparición de cada uno)
        vistos = set()
        sugerencias = []
        label_map = {d["key"]: d["label"] for d in DESTINOS_MULTI}
        for s in sugerencias_raw:
            destino = s.get("destino", "")
            if destino not in vistos:
                vistos.add(destino)
                s["destino_label"] = label_map.get(destino, destino)
                sugerencias.append(s)

        # Enriquecer cada sugerencia con las subvenciones HABILITADAS de su cuenta
        # (leídas de pre_cuenta_matriz_reglas.subvenciones_reglas). No consume tokens:
        # se resuelve determinísticamente desde la BD tras la respuesta de la IA.
        # Las claves del manual se mapean a los valores del selector "Subvención
        # Financiadora"; INTERNADO y REFUERZO_EDUCATIVO se omiten (inactivas).
        SUBV_MANUAL_A_BOTON = {
            "SUBV_GENERAL": "GENERAL",
            "ADM_CENTRAL_SUBV_GRAL": "GENERAL",
            "SEP": "SEP",
            "ADM_CENTRAL_SEP": "SEP",
            "PIE": "PIE",
            "MANTENIMIENTO": "MANTENIMIENTO",
            "PRO_RETENCION": "PRO_RETENCION",
        }
        codigos_sug = [s.get("codigo_cuenta") for s in sugerencias if s.get("codigo_cuenta")]
        reglas_map = {}
        if codigos_sug:
            filas_reglas = (
                db.query(CuentaMatrizReglas.codigo, CuentaMatrizReglas.subvenciones_reglas)
                .filter(CuentaMatrizReglas.codigo.in_(codigos_sug))
                .all()
            )
            reglas_map = {c: (r or {}) for c, r in filas_reglas}
        for s in sugerencias:
            reglas = reglas_map.get(s.get("codigo_cuenta"), {})
            agrupadas = {}  # valor_boton -> critico (OR entre claves que colapsan al mismo botón)
            for manual_key, regla in reglas.items():
                if not (regla or {}).get("habilitado"):
                    continue
                boton = SUBV_MANUAL_A_BOTON.get(manual_key)
                if not boton:
                    continue
                critico = bool(regla.get("critico_fiscalizacion"))
                agrupadas[boton] = agrupadas.get(boton, False) or critico
            s["subvenciones_habilitadas"] = [
                {"codigo": k, "critico": v} for k, v in agrupadas.items()
            ]

        return {"sugerencias": sugerencias, "proveedor": config_usada.proveedor, "modelo": config_usada.modelo}
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"La IA no devolvió JSON válido. Respuesta: {repr(raw[:300])}")
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al asesorar cuenta: {str(e)}")


def _get_active_config(db: Session, current_user: User, proveedor_override: Optional[str] = None):
    # Alias histórico: la resolución (incluido el respaldo entre colegios) vive
    # en un solo lugar.
    return _resolver_config_ia(db, current_user, proveedor_override)


def call_ai_con_fallback(
    db: Session,
    current_user: User,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 2048,
    operacion: str = "ia",
    proveedor_override: Optional[str] = None,
):
    """Llama a la IA con fallback automático entre modelos y proveedores.

    1. Intenta con el proveedor primario (resuelto por _resolver_config_ia).
    2. Si falla con error transitorio (503/429/502/504) o 404 de modelo no encontrado:
       - Si el proveedor es Gemini: intenta primero con modelos alternativos
         (gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-flash) usando la misma key.
       - Luego intenta con los demás proveedores activos del colegio (o compartidos).
    3. Registra el uso de tokens con el proveedor/modelo que finalmente respondió.

    Devuelve: (contenido: str, usage: dict, config_usada: AiProviderConfig)
    """
    from app.services.ai_service import _es_transitorio

    config_primaria = _resolver_config_ia(db, current_user, proveedor_override)

    # Armamos la cola de candidatos: (proveedor, api_key_encrypted, modelo, config_obj, desc)
    candidatos = [
        (config_primaria.proveedor, config_primaria.api_key_encrypted, config_primaria.modelo, config_primaria, f"{config_primaria.proveedor}/{config_primaria.modelo} (primario)")
    ]

    # Modelos de respaldo inmediato si Gemini sufre alta demanda (503)
    if config_primaria.proveedor == "gemini":
        gemini_fallbacks = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
        for m in gemini_fallbacks:
            if m != config_primaria.modelo:
                candidatos.append((config_primaria.proveedor, config_primaria.api_key_encrypted, m, config_primaria, f"gemini/{m} (respaldo)"))

    # Proveedores alternativos activos en el sistema (primero del mismo colegio, luego globales)
    cid = current_user.id_colegio
    otros = (
        db.query(AiProviderConfig)
        .filter(AiProviderConfig.activo == True, AiProviderConfig.id != config_primaria.id)
        .all()
    )
    otros.sort(key=lambda c: (0 if c.id_colegio == cid else 1))
    for alt in otros:
        candidatos.append((alt.proveedor, alt.api_key_encrypted, alt.modelo, alt, f"{alt.proveedor}/{alt.modelo} (alternativo)"))

    ultimo_error = None
    for prov, key_enc, mod, cfg, desc in candidatos:
        try:
            raw, usage = call_ai(
                prov,
                key_enc,
                mod,
                system_prompt,
                user_prompt,
                max_tokens=max_tokens,
            )
            _log_uso(db, current_user, cfg, operacion, usage)
            return raw, usage, cfg
        except Exception as err:
            ultimo_error = err
            # Determinamos si vale la pena saltar al siguiente candidato
            es_recuperable = _es_transitorio(err)
            err_str = str(err)
            codigo = getattr(err, "status_code", None) or getattr(err, "code", None)
            if codigo == 404 or "model_not_found" in err_str or "does not exist" in err_str or "NoneType" in err_str:
                es_recuperable = True

            if not es_recuperable:
                print(f"[IA Fallback] Error no recuperable con {desc}: {err}")
                raise

            print(f"[IA Fallback] {desc} falló con error ({err}). Intentando siguiente opción...")
            continue

    if ultimo_error:
        raise ultimo_error
    raise HTTPException(status_code=500, detail="No se pudo obtener respuesta de ningún proveedor de IA.")


@router.post("/sugerir-cuenta")
def sugerir_cuenta_ia(
    req: AiSugerirCuentaRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Resolver configuración de IA a usar
    config = _get_active_config(db, current_user, req.proveedor_override)

    # Construir contexto: categorías filtradas
    categorias_query = db.query(CategoriaRecurso)
    if req.id_cat_recurso:
        # Incluir la categoría elegida + sus vecinas (misma tabla)
        cat_elegida = categorias_query.filter(CategoriaRecurso.id_cat_recurso == req.id_cat_recurso).first()
        todas = categorias_query.all()
        # Heurística: si la cat elegida existe, llevarla + las que tengan destino solapado
        categorias = todas  # enviamos todas pero filtramos debajo a las top relevantes
    else:
        categorias = categorias_query.all()

    # Construir JSON de contexto (top 10 por relevancia — todas si hay pocas)
    cats_json = []
    nombre_lower = req.recurso_nombre.lower()
    for cat in categorias:
        # Calcular score básico de relevancia
        score = 0
        if req.id_cat_recurso and cat.id_cat_recurso == req.id_cat_recurso:
            score += 100
        desc = (cat.descripcion or "").lower()
        if any(w in desc or w in cat.nombre.lower() for w in nombre_lower.split()):
            score += 10

        subcats = db.query(SubcategoriaRecurso).filter(
            SubcategoriaRecurso.id_cat_recurso == cat.id_cat_recurso
        ).all()

        cats_json.append({
            "score": score,
            "id": cat.id_cat_recurso,
            "nombre": cat.nombre,
            "descripcion": cat.descripcion or "",
            "codigo_contable": cat.codigo_contable or "",
            "subcategorias": [
                {"codigo": s.codigo_cuenta, "nombre": s.nombre, "destino": s.destino_gasto}
                for s in subcats
            ]
        })

    # Ordenar por score y tomar top 8
    cats_json.sort(key=lambda x: x["score"], reverse=True)
    top_cats = [{k: v for k, v in c.items() if k != "score"} for c in cats_json[:8]]

    system_prompt, user_prompt = build_cuenta_prompt(
        recurso_nombre=req.recurso_nombre,
        recurso_descripcion=req.recurso_descripcion,
        destino_uso=req.destino_uso,
        tipo_transaccion=req.tipo_transaccion,
        subvencion=req.subvencion,
        categorias_json=top_cats,
    )

    try:
        raw, usage, config_usada = call_ai_con_fallback(
            db, current_user, system_prompt, user_prompt,
            operacion="sugerir-cuenta",
            proveedor_override=req.proveedor_override,
        )
        result = _extract_json(raw)
        return {
            "codigo_cuenta": result.get("codigo_cuenta"),
            "justificacion": result.get("justificacion"),
            "proveedor": config_usada.proveedor,
            "modelo": config_usada.modelo,
        }
    except json.JSONDecodeError:
        match = re.search(r'\b4\d{5}\b', raw)
        if match:
            return {"codigo_cuenta": match.group(), "justificacion": raw, "proveedor": config_usada.proveedor, "modelo": config_usada.modelo}
        raise HTTPException(status_code=502, detail=f"La IA no devolvió JSON válido. Respuesta: {repr(raw[:300])}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al llamar a la IA: {str(e)}")


class ActividadCandidataInput(BaseModel):
    id: int
    nombre_actividad: str
    descripcion: Optional[str] = None
    subdimension: Optional[str] = None
    responsable: Optional[str] = None


class ActividadPmeAsesoriaRequest(BaseModel):
    colegio_id: str
    nombre_recurso: str
    descripcion: Optional[str] = None
    area_solicitante: Optional[str] = None
    destino: Optional[str] = None
    motivo_compra: Optional[str] = None
    dimension_seleccionada: str
    subdimension_opcional: Optional[str] = None
    proveedor_override: Optional[str] = None
    actividades_candidatas: List[ActividadCandidataInput]


@router.post("/asesorar-actividad-pme")
def asesorar_actividad_pme(
    req: ActividadPmeAsesoriaRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not req.actividades_candidatas:
        return {
            "sugerencias": [],
            "no_asociado_pme": True,
            "motivo": "No se recibieron actividades candidatas para analizar."
        }

    system_prompt, user_prompt = build_actividad_pme_prompt(
        colegio_id=req.colegio_id,
        nombre_recurso=req.nombre_recurso,
        descripcion=req.descripcion or "",
        area_solicitante=req.area_solicitante or "",
        destino=req.destino or "",
        motivo_compra=req.motivo_compra or "",
        dimension_seleccionada=req.dimension_seleccionada,
        subdimension_opcional=req.subdimension_opcional,
        actividades_candidatas=[a.dict() for a in req.actividades_candidatas]
    )

    try:
        raw, usage, config_usada = call_ai_con_fallback(
            db, current_user, system_prompt, user_prompt,
            max_tokens=2048,
            operacion="asesorar-actividad-pme",
            proveedor_override=req.proveedor_override,
        )
        result = _extract_json(raw)
        return {
            "sugerencias": result.get("sugerencias", []),
            "no_asociado_pme": result.get("no_asociado_pme", False),
            "proveedor": config_usada.proveedor,
            "modelo": config_usada.modelo,
        }
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"La IA no devolvió un JSON válido. Respuesta recibida: {repr(raw[:300])}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al llamar a la IA para asesoría PME: {e}")
        raise HTTPException(status_code=502, detail=f"Error al llamar a la IA: {str(e)}")


# ── Uso de tokens ─────────────────────────────────────────────────────────────

class InsumoAVincular(BaseModel):
    """`ref` lo asigna el cliente y vuelve en la respuesta, para no depender del orden."""
    ref: int
    nombre: str
    descripcion: Optional[str] = None
    motivo: Optional[str] = None
    destino: Optional[str] = None


class VincularPmeLoteRequest(BaseModel):
    insumos: List[InsumoAVincular]
    proveedor_override: Optional[str] = None
    # Dimensión PME declarada para TODAS las filas de esta llamada (viene de la
    # columna "Dimensión PME" del Excel). Si llega, se le ofrecen a la IA solo las
    # actividades de esa dimensión: acierta mucho más y el prompt se reduce a una
    # cuarta parte. El cliente agrupa los insumos por dimensión antes de llamar.
    dimension: Optional[str] = None


# Tope por llamada. El catálogo de actividades se paga una vez por llamada, así que
# conviene el lote grande; el límite lo pone la salida (~70 tokens por vinculación
# contra max_tokens=8192).
LOTE_PME_MAX = 30


@router.post("/asesorar-actividades-pme-lote")
def asesorar_actividades_pme_lote(
    req: VincularPmeLoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Vincula varios insumos a actividades PME en una sola llamada a la IA.

    A diferencia de /asesorar-actividad-pme (que recibe la dimensión ya elegida por
    el usuario y solo las actividades de esa dimensión), aquí la IA elige entre
    TODAS las actividades del PME vigente e informa la dimensión de la que eligió.
    El catálogo, que domina el prompt, se envía una vez por llamada en vez de una
    vez por insumo.
    """
    if not req.insumos:
        return {"vinculaciones": [], "proveedor": None, "modelo": None}
    if len(req.insumos) > LOTE_PME_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {LOTE_PME_MAX} insumos por llamada; llegaron {len(req.insumos)}."
        )

    # Catálogo de actividades del PME vigente del colegio. Se reutiliza el resolutor
    # de budget.py para que el lote y la tarjeta de sugerencias vean lo mismo.
    from app.api.budget import _ids_actividades_pme_vigente
    from app.models import Actividad

    ids_vigentes, _pme_ids = _ids_actividades_pme_vigente(db, current_user.id_colegio)
    if not ids_vigentes:
        raise HTTPException(
            status_code=400,
            detail="El colegio no tiene un Plan PME vigente con actividades cargadas."
        )

    actividades = db.query(Actividad).filter(Actividad.id_actividad.in_(list(ids_vigentes))).all()

    # Si el cliente declara la dimensión, se restringe el catálogo a esa dimensión.
    # Comparación tolerante a tildes y mayúsculas porque el valor puede venir de una
    # celda de Excel escrita a mano.
    from app.api.budget import _normalizar_texto
    dimension_aplicada = None
    if req.dimension:
        objetivo = _normalizar_texto(req.dimension)
        filtradas = [a for a in actividades if _normalizar_texto(a.dimension or "") == objetivo]
        if filtradas:
            actividades = filtradas
            dimension_aplicada = req.dimension
        # Si la dimensión declarada no calza con ninguna actividad se ignora y se
        # ofrece el catálogo completo, en vez de dejar a la IA sin candidatas.

    acts_json = [
        {
            "id_actividad": a.id_actividad,
            "nombre_actividad": a.nombre_actividad,
            "dimension": a.dimension,
            "subdimension": a.subdimension,
        }
        for a in actividades
    ]
    # Validar solo contra lo que efectivamente se le ofreció a la IA.
    por_id = {a.id_actividad: a for a in actividades}
    ids_ofrecidos = set(por_id)

    config = _get_active_config(db, current_user, req.proveedor_override)
    system_prompt, user_prompt = build_actividades_pme_lote_prompt(
        colegio=current_user.colegio.nombre if current_user.colegio else "Colegio",
        insumos=[i.dict() for i in req.insumos],
        actividades=acts_json,
        dimension_declarada=dimension_aplicada,
    )

    raw = ""
    try:
        raw, usage, config_usada = call_ai_con_fallback(
            db, current_user, system_prompt, user_prompt,
            max_tokens=8192, operacion="asesorar-actividades-pme-lote",
            proveedor_override=req.proveedor_override,
        )
        result = _extract_json(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail=f"La IA no devolvió JSON válido. Respuesta recibida: {repr(raw[:300])}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al llamar a la IA: {e}")

    # Un id que no esté en el PME vigente se descarta: es preferible devolver el
    # insumo sin vincular a dejar el detalle apuntando a una actividad inválida.
    por_ref = {}
    for v in (result.get("vinculaciones") or []):
        try:
            ref = int(v.get("ref"))
        except (TypeError, ValueError):
            continue
        id_act = v.get("id_actividad")
        act = por_id.get(id_act) if id_act in ids_ofrecidos else None
        # Los modelos a veces devuelven `no_asociado_pme: true` Y un id_actividad a la
        # vez (arrastran el id de la plantilla del prompt). En ese caso manda la
        # marca: si dice que no corresponde, no se propone actividad, porque dejar
        # ambas cosas hacía que la UI mostrara "no asociado" con una actividad al lado.
        if bool(v.get("no_asociado_pme")):
            act = None
        por_ref[ref] = {
            "ref": ref,
            "id_actividad": act.id_actividad if act else None,
            "nombre_actividad": act.nombre_actividad if act else None,
            "dimension": act.dimension if act else None,
            "subdimension": act.subdimension if act else None,
            "match_score": v.get("match_score"),
            "no_asociado_pme": act is None,
            "justificacion": (v.get("justificacion") or "")[:200],
        }

    return {
        "vinculaciones": [
            por_ref.get(i.ref, {
                "ref": i.ref, "id_actividad": None, "nombre_actividad": None,
                "dimension": None, "subdimension": None, "match_score": None,
                "no_asociado_pme": True,
                "justificacion": "La IA no devolvió vinculación para este insumo.",
            })
            for i in req.insumos
        ],
        "actividades_evaluadas": len(acts_json),
        # None = se ofreció el catálogo completo (la fila no declaraba dimensión, o la
        # declarada no calzaba con ninguna actividad del PME).
        "dimension_aplicada": dimension_aplicada,
        "proveedor": config_usada.proveedor,
        "modelo": config_usada.modelo,
    }


@router.get("/uso-tokens")
def get_uso_tokens(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.rol and current_user.rol.codigo not in ROLES_ADMIN_AI:
        raise HTTPException(status_code=403, detail="Sin permisos")
    registros = (
        db.query(AiUsoTokens)
        .filter(AiUsoTokens.id_colegio == current_user.id_colegio)
        .order_by(AiUsoTokens.creado_en.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": r.id,
            "proveedor": r.proveedor,
            "modelo": r.modelo,
            "endpoint": r.endpoint,
            "tokens_entrada": r.tokens_entrada,
            "tokens_salida": r.tokens_salida,
            "tokens_total": r.tokens_total,
            "creado_en": r.creado_en.isoformat() if r.creado_en else None,
            "usuario_nombre": r.usuario.nombre if r.usuario else ("Sistema" if not r.id_usuario else f"Usuario #{r.id_usuario}")
        }
        for r in registros
    ]


# ── Dimensiones PME Información Normativa ───────────────────────────────────

DATOS_SEMILLA_PME_DIMENSIONES = [
    {
        "nombre": "Gestión Pedagógica",
        "icono": "📚",
        "descripcion": "Aborda el núcleo del proceso educativo. Agrupa todas las acciones, insumos y herramientas destinados al diseño curricular, la preparación e impartición de la enseñanza en el aula, la evaluación de aprendizajes, el apoyo psicopedagógico (PIE) y el desarrollo profesional docente.",
        "enfoque_principal": "Estudiantes y cuerpo docente.",
        "ejemplos_insumos": "Resmas de hojas para evaluaciones, impresoras UTP, tintas y tóners pedagógicos, licencias de software educativo, proyectores de aula, textos escolares y libros de lectura, cuadernos y guías impresas, material didáctico para párvulos y PIE, sets de laboratorio de ciencias, instrumentos musicales pedagógicos, calculadoras científicas, plastilina y témperas para clases, plataformas de ensayo SIMCE/PAES, visitas pedagógicas a museos."
    },
    {
        "nombre": "Convivencia Escolar",
        "icono": "🤝",
        "descripcion": "Comprende el conjunto de iniciativas orientadas a cultivar un clima escolar seguro, inclusivo, colaborativo y respetuoso. Incluye el bienestar socioemocional, la formación en valores, la participación ciudadana, la prevención de la violencia y la vinculación con las familias y apoderados.",
        "enfoque_principal": "Comunidad escolar (estudiantes, padres, apoderados y asistentes de la educación).",
        "ejemplos_insumos": "Globos y cotillón para bienvenida, medallas y diplomas de reconocimiento, trofeos para torneos deportivos, premios para actividades comunitarias, colaciones y cofres de cumpleaños, materiales para afiches y pancartas, amplificación para actos escolares, servicio de shows educativos o teatro, talleres socioemocionales externos, insumos para jornadas de apoderados, juegos de mesa interactivos, banderas e insignias institucionales."
    },
    {
        "nombre": "Liderazgo",
        "icono": "🎯",
        "descripcion": "Contempla la conducción estratégica y la dirección del establecimiento. Se centra en la planificación institucional (PEI/PME), el monitoreo y control de gestión, el acompañamiento directivo, la toma de decisiones basada en evidencia y la articulación de los equipos técnicos del colegio.",
        "enfoque_principal": "Equipo directivo, sostenedor, jefaturas de área y UTP.",
        "ejemplos_insumos": "Capacitaciones para equipo directivo y UTP, asesorías técnicas pedagógicas externas (ATE), licencias de software de gestión directiva, impresiones de PEI y PME, jornadas de planificación estratégica fuera del colegio, cuadernos de campo directivo, credenciales e identificadores institucionales, servicios de auditoría educativa."
    },
    {
        "nombre": "Gestión de Recursos",
        "icono": "🏢",
        "descripcion": "Aborda la obtención, mantención y administración de los medios operativos, humanos y financieros necesarios para el funcionamiento sostenible de la escuela. Incluye la gestión del personal, el mantenimiento de la infraestructura, los equipamientos tecnológicos generales y los suministros de soporte administrativo.",
        "enfoque_principal": "Establecimiento general, funcionarios administrativos y personal operativo.",
        "ejemplos_insumos": "Computadores para administración y funcionarios, dispensadores y botellones de agua, artículos de aseo y desinfección, tintas para oficinas administrativas, licencias de antivirus general, mobiliario escolar (sillas y mesas), repuestos e insumos de mantención, cámaras e insumos de seguridad, servicio de internet y fibra óptica, uniformes para personal operativo, herramientas e insumos eléctricos."
    }
]


@router.get("/pme/dimensiones-info")
def get_pme_dimensiones_info(
    db: Session = Depends(get_db)
):
    """Devuelve la información detallada de cada dimensión PME. Sincroniza y actualiza con los textos exactos."""
    existentes = db.query(PmeDimensionInfo).all()
    mapa_existentes = {d.nombre: d for d in existentes}
    
    for seed in DATOS_SEMILLA_PME_DIMENSIONES:
        if seed["nombre"] in mapa_existentes:
            dim_bd = mapa_existentes[seed["nombre"]]
            dim_bd.descripcion = seed["descripcion"]
            dim_bd.enfoque_principal = seed["enfoque_principal"]
            dim_bd.ejemplos_insumos = seed["ejemplos_insumos"]
            dim_bd.icono = seed["icono"]
        else:
            db.add(PmeDimensionInfo(**seed))
    db.commit()
    existentes = db.query(PmeDimensionInfo).all()
    
    return [
        {
            "id": d.id,
            "nombre": d.nombre,
            "icono": d.icono,
            "descripcion": d.descripcion,
            "enfoque_principal": d.enfoque_principal,
            "ejemplos_insumos": d.ejemplos_insumos,
        }
        for d in existentes
    ]


# ── Asesoría de Cuentas en Lote (Recursos Sugeridos Masivos) ────────────────
class RecursoSugeridoPendienteLote(BaseModel):
    id_recurso: int
    nombre: str
    descripcion: Optional[str] = None
    solicitante_nombre: Optional[str] = None
    id_cat_recurso: Optional[int] = None
    categoria_nombre: Optional[str] = None
    destino_gasto: Optional[str] = None
    subvencion_codigo: Optional[str] = None


class AsesorarRecursosLoteRequest(BaseModel):
    recursos: List[RecursoSugeridoPendienteLote]
    proveedor_override: Optional[str] = None


@router.post("/asesorar-recursos-lote")
def asesorar_recursos_lote(
    req: AsesorarRecursosLoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Asesora en un solo llamado de IA a múltiples recursos sugeridos pendientes.
    
    Usa la misma matriz CuentaDestino (candidatos oficiales por destino) que
    la asesoría individual, devolviendo 4 sugerencias (ESTUDIANTE, FUNCIONARIO,
    PREMIO, MANTENCIÓN) por cada recurso del lote.
    """
    if not req.recursos:
        return {"asesorias": []}

    config = _resolver_config_ia(db, current_user, req.proveedor_override)

    # ── Cargar Matriz CuentaDestino (misma fuente que /asesorar-cuenta) ──
    from app.models import CuentaDestino, CuentaMatrizReglas
    filas = (
        db.query(CuentaDestino, CuentaMatrizReglas.nombre)
        .join(CuentaMatrizReglas, CuentaDestino.codigo == CuentaMatrizReglas.codigo)
        .all()
    )

    # Candidatos por destino (formato compacto codigo|nombre|estado)
    DEST_KEYS = ["ESTUDIANTE", "FUNCIONARIO", "PREMIO", "MANTENCION"]
    candidatos = {k: [] for k in DEST_KEYS}
    dest_col_map = {"ESTUDIANTE": "estudiante", "FUNCIONARIO": "funcionario", "PREMIO": "premio", "MANTENCION": "mantencion"}
    for cd, nombre in filas:
        for dest_key in DEST_KEYS:
            estado = getattr(cd, dest_col_map[dest_key], None)
            if estado:  # PRINCIPAL o APLICA
                candidatos[dest_key].append(f"{cd.codigo}|{nombre[:60]}|{estado}")

    bloques_candidatos = []
    for k in DEST_KEYS:
        lista = candidatos[k]
        if lista:
            bloques_candidatos.append(f"{k} (candidatos oficiales):\n  " + "\n  ".join(lista))
        else:
            bloques_candidatos.append(f"{k} (candidatos oficiales): (ninguno → usa null)")
    candidatos_txt = "\n".join(bloques_candidatos)

    # ── Cargar categorías y grupos ──
    categorias = db.query(CategoriaRecurso).all()
    cats_json = [{"id": c.id_cat_recurso, "nombre": c.nombre} for c in categorias]

    from app.models import GrupoRecurso
    grupos = db.query(GrupoRecurso).all()
    grupos_json = [{"id": g.id_grupo_recurso, "nombre": g.nombre} for g in grupos]

    # ── Construir prompts ──
    system_prompt = (
        "Eres un contador escolar chileno experto en el plan de cuentas de la Superintendencia de Educación.\n"
        "Tu tarea: construir el MAPA CONTABLE de CADA recurso del lote, eligiendo la cuenta que le\n"
        "corresponde en CADA uno de los 4 destinos de gasto, de forma INDEPENDIENTE del uso puntual.\n\n"
        "CONTRATO DE SALIDA (obligatorio):\n"
        "- Responde ÚNICAMENTE con el JSON. Sin texto previo, sin explicaciones, sin markdown, sin ```.\n"
        "- Empieza con { y termina con }. JSON válido: comillas dobles, sin comas finales.\n\n"
        "GUÍA OFICIAL:\n"
        "Para cada destino recibes una LISTA DE CANDIDATOS OFICIALES: solo esas cuentas están\n"
        "autorizadas para ese destino. Cada candidato viene marcado como [PRINCIPAL] o [APLICA].\n"
        "DEBES elegir el código de un destino ÚNICAMENTE de su lista de candidatos.\n\n"
        "REGLAS:\n"
        "1. Para CADA recurso del lote, devuelve un objeto con id_recurso, id_cat_recurso, id_grupo_recurso y \"sugerencias\" (array de 4 destinos).\n"
        "2. Para cada destino, elige el candidato que mejor calce con la NATURALEZA del recurso.\n"
        "3. Si hay un candidato [PRINCIPAL] que calza, prefiérelo sobre los [APLICA].\n"
        "4. \"codigo_cuenta\" y \"nombre_cuenta\" deben copiarse EXACTO desde el candidato elegido.\n"
        "5. Devuelve \"codigo_cuenta\": null SOLO si la lista de candidatos de ese destino está vacía o ninguno calza.\n"
        "6. \"razon\": máx 40 caracteres.\n"
        "7. Devuelve SIEMPRE los 4 destinos en este orden: ESTUDIANTE, FUNCIONARIO, PREMIO, MANTENCION.\n"
        "8. CADA recurso debe tener códigos contables DIFERENTES según su naturaleza. Galletas ≠ Lápices ≠ Gorras.\n\n"
        "FORMATO EXACTO DE RESPUESTA:\n"
        '{"respuestas": [{"id_recurso": 123, "id_cat_recurso": 1, "id_grupo_recurso": 5, '
        '"sugerencias": [{"destino": "ESTUDIANTE", "codigo_cuenta": "410801", "nombre_cuenta": "Nombre exacto", "razon": "Motivo"}, '
        '{"destino": "FUNCIONARIO", "codigo_cuenta": "410901", "nombre_cuenta": "Nombre exacto", "razon": "Motivo"}, '
        '{"destino": "PREMIO", "codigo_cuenta": null, "nombre_cuenta": null, "razon": "Sin cuenta"}, '
        '{"destino": "MANTENCION", "codigo_cuenta": null, "nombre_cuenta": null, "razon": "Sin cuenta"}]}]}'
    )

    recursos_txt = "\n".join([
        f"- id:{r.id_recurso} | {r.nombre[:60]} | detalle:{(r.descripcion or '')[:50]} | destino_actual:{r.destino_gasto or 'no especificado'}"
        for r in req.recursos
    ])

    user_prompt = (
        f"CATEGORÍAS DISPONIBLES:\n{json.dumps(cats_json, ensure_ascii=False)}\n\n"
        f"GRUPOS DISPONIBLES:\n{json.dumps(grupos_json, ensure_ascii=False)}\n\n"
        f"CANDIDATOS OFICIALES POR DESTINO (elige el código SOLO de la lista de cada destino):\n{candidatos_txt}\n\n"
        f"RECURSOS A CLASIFICAR (uno a uno):\n{recursos_txt}\n\n"
        f"Para CADA recurso devuelve id_recurso, id_cat_recurso, id_grupo_recurso y las 4 sugerencias por destino. Responde SOLO con el JSON."
    )

    try:
        raw, usage, config_usada = call_ai_con_fallback(
            db, current_user, system_prompt, user_prompt,
            max_tokens=16384, operacion="asesorar-recursos-lote",
            proveedor_override=req.proveedor_override,
        )
        result = _extract_json(raw)
        respuestas = result.get("respuestas", [])

        # ── Enriquecer con subvenciones habilitadas (determinístico, sin IA) ──
        SUBV_MANUAL_A_BOTON = {
            "SUBV_GENERAL": "GENERAL", "ADM_CENTRAL_SUBV_GRAL": "GENERAL",
            "SEP": "SEP", "ADM_CENTRAL_SEP": "SEP",
            "PIE": "PIE", "MANTENIMIENTO": "MANTENIMIENTO", "PRO_RETENCION": "PRO_RETENCION",
        }
        # Recopilar todos los códigos de cuenta sugeridos
        todos_codigos = set()
        for resp in respuestas:
            for sug in resp.get("sugerencias", []):
                cod = sug.get("codigo_cuenta")
                if cod:
                    todos_codigos.add(cod)

        reglas_map = {}
        if todos_codigos:
            filas_reglas = (
                db.query(CuentaMatrizReglas.codigo, CuentaMatrizReglas.subvenciones_reglas)
                .filter(CuentaMatrizReglas.codigo.in_(list(todos_codigos)))
                .all()
            )
            reglas_map = {c: (r or {}) for c, r in filas_reglas}

        # Enriquecer cada sugerencia
        DEST_LABELS = {"ESTUDIANTE": "Alumnos / Sala", "FUNCIONARIO": "Oficina / Admin", "PREMIO": "Premio / Beneficio", "MANTENCION": "Mantención"}
        for resp in respuestas:
            for sug in resp.get("sugerencias", []):
                sug["destino_label"] = DEST_LABELS.get(sug.get("destino", ""), sug.get("destino", ""))
                reglas = reglas_map.get(sug.get("codigo_cuenta"), {})
                agrupadas = {}
                for manual_key, regla in reglas.items():
                    if not (regla or {}).get("habilitado"):
                        continue
                    boton = SUBV_MANUAL_A_BOTON.get(manual_key)
                    if not boton:
                        continue
                    critico = bool(regla.get("critico_fiscalizacion"))
                    agrupadas[boton] = agrupadas.get(boton, False) or critico
                sug["subvenciones_habilitadas"] = [
                    {"codigo": k, "critico": v} for k, v in agrupadas.items()
                ]

        return {"asesorias": respuestas, "proveedor": config_usada.proveedor, "modelo": config_usada.modelo}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error en asesoría en lote con IA: {str(e)}")


