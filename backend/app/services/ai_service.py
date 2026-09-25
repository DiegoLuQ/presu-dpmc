from cryptography.fernet import Fernet
from app.core.config import settings
import openai
import json
import time

PROVIDERS = {
    "groq":       "https://api.groq.com/openai/v1",
    "nvidia":     "https://integrate.api.nvidia.com/v1",
    "deepseek":   "https://api.deepseek.com/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "gemini":     "https://generativelanguage.googleapis.com/v1beta/openai/",
}

MODELOS_POR_PROVEEDOR = {
    "groq": [
        {"id": "qwen/qwen3.8-27b",                 "label": "Qwen 3.8 27B"},
        {"id": "openai/gpt-oss-120b",              "label": "GPT OSS 120B"},
        {"id": "openai/gpt-oss-20b",               "label": "GPT OSS 20B"},
        {"id": "llama-3.3-70b-versatile",         "label": "Llama 3.3 70B (Versatile)"},
        {"id": "llama-3.1-8b-instant",             "label": "Llama 3.1 8B (Rápido)"},
    ],
    "nvidia": [
        {"id": "meta/llama-3.3-70b-instruct",                   "label": "Llama 3.3 70B Instruct"},
        {"id": "nvidia/llama-3.1-nemotron-70b-instruct-hf",     "label": "Nemotron 70B Instruct"},
    ],
    "deepseek": [
        {"id": "deepseek-chat",     "label": "DeepSeek V3 (Chat)"},
        {"id": "deepseek-reasoner", "label": "DeepSeek R1 (Razonamiento)"},
    ],
    "openrouter": [
        {"id": "deepseek/deepseek-chat-v3-0324:free",   "label": "DeepSeek V3 (Gratis)"},
        {"id": "meta-llama/llama-4-maverick",            "label": "Llama 4 Maverick"},
        {"id": "google/gemini-2.0-flash-001",            "label": "Gemini 2.0 Flash"},
        {"id": "anthropic/claude-3-haiku",               "label": "Claude 3 Haiku"},
    ],
    "gemini": [
        {"id": "gemini-3.1-flash-lite",          "label": "Gemini 3.1 Flash Lite (Ultra Rápido)"},
        {"id": "gemini-2.5-flash",               "label": "Gemini 2.5 Flash (Rápido y Estable)"},
        {"id": "gemini-2.0-flash",               "label": "Gemini 2.0 Flash"},
        {"id": "gemini-1.5-flash",               "label": "Gemini 1.5 Flash"},
        {"id": "gemini-2.5-pro-preview-06-05",   "label": "Gemini 2.5 Pro (Potente)"},
    ],
}


def _fernet() -> Fernet:
    key = settings.AI_ENCRYPTION_KEY
    if not key:
        raise ValueError("AI_ENCRYPTION_KEY no configurada en .env")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_api_key(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    return _fernet().decrypt(encrypted.encode()).decode()


def mask_api_key(encrypted: str) -> str:
    try:
        plain = decrypt_api_key(encrypted)
        return "•" * max(0, len(plain) - 4) + plain[-4:]
    except Exception:
        return "••••••••"


# Errores de proveedor que son transitorios: conviene reintentar en vez de fallar.
# 503 = modelo sobrecargado, 429 = límite de tasa, 500/502/504 = fallo del lado del
# proveedor. Todo lo demás (401 key inválida, 400 prompt mal armado) no se reintenta
# porque reintentar no lo va a arreglar.
_HTTP_TRANSITORIOS = {429, 500, 502, 503, 504}
_REINTENTOS = 3
_ESPERA_BASE_S = 2.0


def _es_transitorio(err: Exception) -> bool:
    codigo = getattr(err, "status_code", None) or getattr(err, "code", None)
    if isinstance(codigo, int) and codigo in _HTTP_TRANSITORIOS:
        return True
    texto = str(err)
    return any(f" {c}" in texto or f"code: {c}" in texto for c in _HTTP_TRANSITORIOS)


def call_ai(proveedor: str, api_key_encrypted: str, modelo: str, system_prompt: str, user_prompt: str, max_tokens: int = 512) -> tuple[str, dict]:
    base_url = PROVIDERS.get(proveedor)
    if not base_url:
        raise ValueError(f"Proveedor desconocido: {proveedor}")

    api_key = decrypt_api_key(api_key_encrypted)

    extra_headers = {}
    if proveedor == "openrouter":
        extra_headers = {
            "HTTP-Referer": "https://mcdp-ppa.cl",
            "X-Title": "MCDP School ERP",
        }

    client = openai.OpenAI(api_key=api_key, base_url=base_url, default_headers=extra_headers)

    # Reintento con espera creciente: los 503 de "high demand" suelen resolverse en
    # segundos, y en un flujo por lotes perder una llamada significa perder el trabajo
    # de todo el trozo.
    response = None
    for intento in range(_REINTENTOS):
        try:
            response = client.chat.completions.create(
                model=modelo,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=max_tokens,
            )
            break
        except Exception as err:
            ultimo = intento == _REINTENTOS - 1
            if ultimo or not _es_transitorio(err):
                raise
            time.sleep(_ESPERA_BASE_S * (2 ** intento))

    if not response or not getattr(response, "choices", None):
        raise ValueError(f"El modelo ({modelo}) no devolvió una respuesta válida.")

    content = response.choices[0].message.content
    if not content:
        finish = getattr(response.choices[0], "finish_reason", "unknown")
        raise ValueError(f"El modelo devolvió respuesta vacía (finish_reason={finish}). Prueba con otro modelo.")
    usage = {}
    if response.usage:
        usage = {
            "tokens_entrada": response.usage.prompt_tokens or 0,
            "tokens_salida": response.usage.completion_tokens or 0,
            "tokens_total": response.usage.total_tokens or 0,
        }
    return content.strip(), usage


def build_categoria_prompt(nombre: str, descripcion: str, motivo: str, destino: str, categorias: list, grupos: list = None) -> tuple[str, str]:
    grupos = grupos or []
    system = (
        "Eres un clasificador de recursos presupuestarios escolares chilenos. "
        "Tu tarea: recomendar la CATEGORÍA y el GRUPO DE RECURSOS de un insumo, usando SOLO los listados entregados. "
        "REGLA ABSOLUTA: responde SOLO con el objeto JSON, sin texto adicional, sin markdown, sin explicaciones. "
        "La respuesta debe empezar con '{' y terminar con '}'."
    )

    plantilla = json.dumps({
        "recomendaciones": [
            {"id_cat_recurso": 12, "nombre": "Categoría A", "razon": "Justificación breve."},
            {"id_cat_recurso": 7,  "nombre": "Categoría B", "razon": "Justificación breve."}
        ],
        "grupo": {"id_grupo_recurso": 3, "nombre": "Nombre exacto del grupo", "razon": "Justificación breve."}
    }, ensure_ascii=False, separators=(',', ':'))

    cats_compacto = [
        {"id": c["id_cat_recurso"], "nombre": c["nombre"], "desc": (c.get("descripcion") or "")[:80]}
        for c in categorias
    ]
    grupos_compacto = [
        {"id": g["id_grupo_recurso"], "nombre": g["nombre"]}
        for g in grupos
    ]

    user = (
        f"Recurso: {nombre}. Detalle: {(descripcion or 'sin detalle')[:100]}. "
        f"Motivo: {(motivo or 'sin motivo')[:100]}. Destino: {destino or 'no especificado'}.\n\n"
        f"Catálogo de categorías: {json.dumps(cats_compacto, ensure_ascii=False, separators=(',', ':'))}\n\n"
        f"Grupos de recursos disponibles: {json.dumps(grupos_compacto, ensure_ascii=False, separators=(',', ':'))}\n\n"
        f"Devuelve exactamente 2 categorías más apropiadas y el grupo MÁS apropiado (usa un id de la lista de grupos). "
        f"Si ningún grupo encaja claramente, elige el más cercano. Estructura exacta:\n{plantilla}"
    )

    return system, user


def build_categoria_lote_prompt(insumos: list, categorias: list, grupos: list = None) -> tuple[str, str]:
    """Clasifica VARIOS insumos en una sola llamada.

    Misma tarea que build_categoria_prompt, pero el catálogo de categorías y grupos
    —que es lo que domina el prompt— se envía una vez para todo el lote en vez de
    repetirse por insumo. Devuelve una categoría y un grupo por insumo (no dos
    categorías como la versión 1x1: en lote interesa la decisión, no el ranking).
    """
    grupos = grupos or []
    system = (
        "Eres un clasificador de recursos presupuestarios escolares chilenos.\n"
        "Tu tarea: para CADA insumo de la lista, recomendar su CATEGORÍA y su GRUPO DE "
        "RECURSOS usando SOLO los ids de los catálogos entregados.\n\n"
        "REGLAS ESTRICTAS:\n"
        "1. Devuelve un elemento por cada insumo recibido, en el mismo orden, "
        "identificado por su campo \"ref\".\n"
        "2. `id_cat_recurso` e `id_grupo_recurso` deben existir en los catálogos. "
        "Prohibido inventar ids.\n"
        "3. Si un insumo no encaja claramente, elige el más cercano y baja la confianza.\n"
        "4. `razon` de máximo 12 palabras.\n"
        "5. Responde SOLO con el objeto JSON, sin markdown ni texto adicional. "
        "Empieza con '{' y termina con '}'."
    )

    plantilla = json.dumps({
        "clasificaciones": [
            {"ref": 0, "id_cat_recurso": 12, "id_grupo_recurso": 3, "confianza": 90,
             "razon": "Justificación breve."}
        ]
    }, ensure_ascii=False, separators=(',', ':'))

    cats_compacto = [
        {"id": c["id_cat_recurso"], "nombre": c["nombre"], "desc": (c.get("descripcion") or "")[:80]}
        for c in categorias
    ]
    grupos_compacto = [
        {"id": g["id_grupo_recurso"], "nombre": g["nombre"]}
        for g in grupos
    ]
    insumos_compacto = [
        {
            "ref": i["ref"],
            "nombre": i["nombre"],
            "detalle": (i.get("descripcion") or "")[:100],
            "motivo": (i.get("motivo") or "")[:100],
            "destino": i.get("destino") or "no especificado",
        }
        for i in insumos
    ]

    user = (
        f"Catálogo de categorías: {json.dumps(cats_compacto, ensure_ascii=False, separators=(',', ':'))}\n\n"
        f"Grupos de recursos disponibles: {json.dumps(grupos_compacto, ensure_ascii=False, separators=(',', ':'))}\n\n"
        f"INSUMOS A CLASIFICAR ({len(insumos_compacto)}):\n"
        f"{json.dumps(insumos_compacto, ensure_ascii=False, separators=(',', ':'))}\n\n"
        f"Devuelve una clasificación por insumo con esta estructura exacta:\n{plantilla}"
    )

    return system, user


def build_grupo_prompt(nombre: str, descripcion: str, grupos: list) -> tuple[str, str]:
    system = (
        "Eres un clasificador de recursos escolares chilenos. "
        "Tu tarea: elegir a qué GRUPO DE RECURSOS pertenece un recurso, usando SOLO los grupos del listado. "
        "REGLA ABSOLUTA: responde SOLO con el objeto JSON, sin texto adicional, sin markdown, sin explicaciones. "
        "La respuesta debe empezar con '{' y terminar con '}'."
    )

    plantilla = json.dumps({
        "id_grupo_recurso": 3,
        "nombre": "Nombre exacto del grupo",
        "razon": "Justificación breve (máx 12 palabras)."
    }, ensure_ascii=False, separators=(',', ':'))

    grupos_compacto = [
        {"id": g["id_grupo_recurso"], "nombre": g["nombre"]}
        for g in grupos
    ]

    user = (
        f"Recurso: {nombre}. Descripción: {(descripcion or 'sin descripción')[:150]}.\n\n"
        f"Grupos disponibles: {json.dumps(grupos_compacto, ensure_ascii=False, separators=(',', ':'))}\n\n"
        f"Elige el grupo MÁS apropiado. Usa exactamente un id de la lista. "
        f"Si ninguno encaja claramente, igual elige el más cercano. "
        f"Devuelve esta estructura:\n{plantilla}"
    )

    return system, user


DESTINOS_MULTI = [
    {"key": "ESTUDIANTE",  "label": "Sala de clases / Alumnos"},
    {"key": "FUNCIONARIO", "label": "Oficina / Administrativo"},
    {"key": "PREMIO",      "label": "Premio / Beneficio"},
    {"key": "MANTENCION",  "label": "Mantención / Servicio"},
]


def build_cuenta_multi_prompt(nombre: str, descripcion: str, cuentas: list, destino_uso: str = None) -> tuple[str, str]:
    system = (
        "Eres un contador escolar chileno experto en el plan de cuentas de la Superintendencia de Educación.\n"
        "Tu tarea: construir el MAPA CONTABLE de un recurso reutilizable, eligiendo la cuenta que le\n"
        "corresponde en CADA uno de los 4 destinos de gasto, de forma INDEPENDIENTE del uso puntual actual.\n\n"
        "CONTRATO DE SALIDA (obligatorio):\n"
        "- Responde ÚNICAMENTE con el JSON. Sin texto previo, sin explicaciones, sin markdown, sin ```.\n"
        "- Empieza con { y termina con }. JSON válido: comillas dobles, sin comas finales, sin comentarios.\n\n"
        "GUÍA OFICIAL (lo más importante):\n"
        "Para cada destino recibes una LISTA DE CANDIDATOS OFICIALES: solo esas cuentas están\n"
        "autorizadas para ese destino. Cada candidato viene marcado como [PRINCIPAL] o [APLICA].\n"
        "DEBES elegir el código de un destino ÚNICAMENTE de su lista de candidatos. Prohibido usar\n"
        "un código que no esté en la lista de ese destino, aunque parezca lógico.\n\n"
        "REGLAS DE ASIGNACIÓN:\n"
        "1. Para cada destino, elige el o los candidatos (máximo 2 si hay alternativas válidas) que mejor calquen con la NATURALEZA del recurso.\n"
        "2. Si hay un candidato [PRINCIPAL] que calza, prefiérelo sobre los [APLICA].\n"
        "3. \"codigo_cuenta\" y \"nombre_cuenta\" deben copiarse EXACTO desde el candidato elegido.\n"
        "4. Si existen 2 alternativas viables para un mismo destino (ej: Equipos e Insumos), puedes incluir \"cuentas_alternativas\": [{\"codigo_cuenta\": \"...\", \"nombre_cuenta\": \"...\", \"razon\": \"...\"}].\n"
        "5. Significado de cada destino:\n"
        "   - ESTUDIANTE  → uso pedagógico / sala de clases.\n"
        "   - FUNCIONARIO → uso administrativo / de funcionarios.\n"
        "   - PREMIO      → entrega como premio, incentivo o beneficio.\n"
        "   - MANTENCION  → cuenta a usar si el recurso se REPARA o mantiene (aunque hoy sea una compra).\n"
        "6. Devuelve \"codigo_cuenta\": null SOLO si la lista de candidatos de ese destino está vacía,\n"
        "   o si NINGÚN candidato corresponde a la naturaleza del recurso. En ese caso\n"
        "   \"nombre_cuenta\": null, \"razon\":\"Sin cuenta aplicable\", \"revisar\": true.\n"
        "7. \"aplica_actual\": true en el destino que coincide con el destino_uso de la solicitud actual; false en el resto.\n"
        "8. \"razon\": máx 60 caracteres, sin comillas dobles ni saltos de línea.\n"
        "9. \"revisar\": true cuando la asignación sea dudosa o sea null; false cuando sea clara.\n"
        "10. Devuelve SIEMPRE los 4 destinos en este orden: ESTUDIANTE, FUNCIONARIO, PREMIO, MANTENCION."
    )

    # Candidatos por destino, según la matriz oficial (solo PRINCIPAL/APLICA).
    DEST_KEYS = ["ESTUDIANTE", "FUNCIONARIO", "PREMIO", "MANTENCION"]
    candidatos = {k: [] for k in DEST_KEYS}
    for c in cuentas:
        destinos = c.get("destinos", {}) or {}
        for k in DEST_KEYS:
            estado = destinos.get(k)
            if estado:  # PRINCIPAL o APLICA
                candidatos[k].append(f"{c.get('codigo','')}|{c.get('nombre','')[:60]}|{estado}")

    plantilla = '{"sugerencias":[{"destino":"ESTUDIANTE","codigo_cuenta":"431001","nombre_cuenta":"Nombre exacto","razon":"Motivo breve","aplica_actual":true,"revisar":false},{"destino":"FUNCIONARIO","codigo_cuenta":"431002","nombre_cuenta":"Nombre exacto","razon":"Motivo breve","aplica_actual":false,"revisar":false},{"destino":"PREMIO","codigo_cuenta":"431003","nombre_cuenta":"Nombre exacto","razon":"Motivo breve","aplica_actual":false,"revisar":false},{"destino":"MANTENCION","codigo_cuenta":"432001","nombre_cuenta":"Nombre exacto","razon":"Motivo breve","aplica_actual":false,"revisar":false}]}'

    # Listado de candidatos por destino (formato codigo|nombre|estado)
    bloques = []
    for k in DEST_KEYS:
        lista = candidatos[k]
        if lista:
            bloques.append(f"{k} (candidatos oficiales):\n  " + "\n  ".join(lista))
        else:
            bloques.append(f"{k} (candidatos oficiales): (ninguno → usa null)")
    candidatos_txt = "\n".join(bloques)

    user = (
        f"Recurso: {nombre[:80]}. Detalle: {(descripcion or '')[:80]}.\n"
        f"destino_uso de la solicitud actual: {destino_uso or 'no especificado'}.\n\n"
        f"CANDIDATOS OFICIALES POR DESTINO (elige el código SOLO de la lista de cada destino):\n{candidatos_txt}\n\n"
        f"Elige una cuenta por destino siguiendo las reglas. Responde SOLO con el JSON de los 4 destinos, así:\n{plantilla}"
    )

    return system, user


def build_cuenta_prompt(recurso_nombre: str, recurso_descripcion: str, destino_uso: str,
                         tipo_transaccion: str, subvencion: str, categorias_json: list) -> tuple[str, str]:
    system = (
        "Eres un experto en contabilidad escolar chilena. "
        "Tu tarea es analizar un recurso educativo y determinar el código contable más apropiado. "
        "Responde SOLO con un objeto JSON válido con las claves: "
        "\"codigo_cuenta\" (string, el código de 6 dígitos) y \"justificacion\" (string, 1-2 oraciones). "
        "No incluyas texto adicional fuera del JSON."
    )

    user = f"""Recurso a clasificar:
- Nombre: {recurso_nombre}
- Descripción: {recurso_descripcion or 'Sin descripción'}
- Destino de uso: {destino_uso}
- Tipo de transacción: {tipo_transaccion}
- Subvención: {subvencion}

Categorías y códigos contables disponibles:
{json.dumps(categorias_json, ensure_ascii=False, indent=2)}

Elige el código contable más apropiado para este recurso considerando su destino y tipo de transacción.
Responde solo con el JSON solicitado."""

    return system, user


def build_actividades_pme_lote_prompt(
    colegio: str,
    insumos: list,
    actividades: list,
    dimension_declarada: str | None = None,
) -> tuple[str, str]:
    """Vincula VARIOS insumos a actividades PME en una sola llamada.

    Diferencias con build_actividad_pme_prompt (1x1):
      · el catálogo de actividades —que es ~88% del prompt— se envía una vez para
        todo el lote en vez de repetirse por insumo;
      · no se filtra por dimensión: la IA elige entre TODAS las actividades del PME
        vigente e informa a qué dimensión pertenece la que eligió, porque en el
        flujo por lote el usuario no va insumo por insumo declarando la dimensión;
      · una sugerencia por insumo (no hasta 3) y justificación de 12 palabras, para
        que la salida quepa en una sola respuesta.
    """
    system = (
        "Actúa como un Experto en Gestión Educacional y Normativa PME (Plan de Mejoramiento "
        "Educativo) en Chile.\n"
        "Tarea: para CADA insumo de la lista, elegir la actividad PME del catálogo con la que "
        "mejor se justifica su compra.\n\n"
        "REGLAS ESTRICTAS:\n"
        "1. Devuelve un elemento por cada insumo recibido, identificado por su campo \"ref\".\n"
        "2. `id_actividad` DEBE ser un id del catálogo entregado. Prohibido inventar ids.\n"
        "3. Evalúa nombre, detalle, motivo y destino del insumo contra el nombre, la dimensión "
        "y la subdimensión de las actividades.\n"
        "4. `match_score` de 0 a 100 según la afinidad pedagógica o de gestión.\n"
        "5. `justificacion` de máximo 12 palabras.\n"
        "6. Responde SOLO con el objeto JSON, sin markdown ni texto adicional. "
        "Empieza con '{' y termina con '}'.\n\n"
        "ALCANCE DEL PME (no lo restrinjas a lo pedagógico):\n"
        "El PME tiene cuatro dimensiones y solo una es Gestión Pedagógica. Un gasto SIN "
        "impacto pedagógico directo puede ser perfectamente PME:\n"
        "· Gestión de Recursos / Gestión del personal: bienestar, clima laboral, "
        "incentivos, capacitación y condiciones de trabajo de funcionarios y docentes. "
        "Insumos de cafetería, colaciones, agua, café o artículos para reuniones de "
        "equipo SON válidos aquí cuando hay una actividad de clima laboral, gestión del "
        "personal o condiciones de trabajo.\n"
        "· Gestión de Recursos / recursos educativos y financieros: infraestructura, "
        "equipamiento, insumos administrativos y mantención.\n"
        "· Convivencia Escolar: bienestar socioemocional, eventos, celebraciones, "
        "premios y vinculación con la comunidad.\n"
        "· Liderazgo: planificación, monitoreo institucional y gestión directiva.\n\n"
        "CUÁNDO USAR `no_asociado_pme: true`:\n"
        "SOLO si de verdad NINGUNA actividad del catálogo admite ese gasto. NO lo uses "
        "con el argumento de que el insumo 'no tiene impacto pedagógico directo': eso no "
        "es motivo para descartarlo si existe una actividad de las dimensiones no "
        "pedagógicas que lo contenga. Antes de descartar, revisa el catálogo completo "
        "buscando actividades de gestión del personal, clima laboral, condiciones de "
        "trabajo, infraestructura o convivencia."
    )

    if dimension_declarada:
        system += (
            f"\n\nDIMENSIÓN YA DEFINIDA: el establecimiento declaró que estos insumos "
            f"pertenecen a \"{dimension_declarada}\", y el catálogo que recibes contiene "
            f"solo las actividades de esa dimensión. Es una decisión ya tomada por quien "
            f"conoce el gasto: elige la actividad que mejor calce DENTRO de ese catálogo "
            f"y no descartes el insumo por no ser pedagógico."
        )

    plantilla = json.dumps({
        "vinculaciones": [
            {"ref": 0, "id_actividad": 123, "match_score": 85,
             "no_asociado_pme": False, "justificacion": "Justificación breve."}
        ]
    }, ensure_ascii=False, separators=(',', ':'))

    # Sin `descripcion` a propósito: sumaría mucho al prompt y el nombre junto con la
    # dimensión y la subdimensión ya identifican la actividad.
    acts_compacto = [
        {
            "id": a["id_actividad"],
            "nombre": a["nombre_actividad"],
            "dim": a.get("dimension") or "",
            "subdim": (a.get("subdimension") or "")[:60],
        }
        for a in actividades
    ]
    insumos_compacto = [
        {
            "ref": i["ref"],
            "nombre": i["nombre"],
            "detalle": (i.get("descripcion") or "")[:80],
            "motivo": (i.get("motivo") or "")[:80],
            "destino": i.get("destino") or "no especificado",
        }
        for i in insumos
    ]

    user = (
        f"Establecimiento: {colegio}\n\n"
        f"CATÁLOGO DE ACTIVIDADES DEL PME VIGENTE ({len(acts_compacto)}):\n"
        f"{json.dumps(acts_compacto, ensure_ascii=False, separators=(',', ':'))}\n\n"
        f"INSUMOS A VINCULAR ({len(insumos_compacto)}):\n"
        f"{json.dumps(insumos_compacto, ensure_ascii=False, separators=(',', ':'))}\n\n"
        f"Devuelve una vinculación por insumo con esta estructura exacta:\n{plantilla}"
    )

    return system, user


def build_actividad_pme_prompt(
    colegio_id: str,
    nombre_recurso: str,
    descripcion: str,
    area_solicitante: str,
    destino: str,
    motivo_compra: str,
    dimension_seleccionada: str,
    subdimension_opcional: str | None,
    actividades_candidatas: list
) -> tuple[str, str]:
    system = (
        "Actúa como un Experto en Gestión Educacional y Normativa PME (Plan de Mejoramiento Educativo) en Chile.\n"
        "Tu objetivo es analizar un recurso/insumo ingresado en un formulario web de presupuesto escolar y recomendar la actividad PME más adecuada dentro de un subconjunto previamente filtrado por dimensión.\n\n"
        "REGLAS ESTRUCTURALES Y FORMATO DE SALIDA ESTRICTO JSON:\n"
        "1. Evalúa el nombre_recurso, motivo_compra, area_solicitante y destino.\n"
        "2. Compara el propósito operativo del insumo contra las descripciones y nombres de las actividades_candidatas.\n"
        "3. Selecciona hasta 3 actividades que presenten la mayor coincidencia pedagógica o de gestión institucional.\n"
        "4. Calcula un porcentaje de afinidad (match_score de 0 a 100%) para cada recomendación.\n"
        "5. Genera una justificación breve (máximo 2 oraciones) orientada a la normativa PME de por qué este recurso se justifica en esa actividad.\n"
        "6. Devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura exacta:\n"
        "{\n"
        "  \"sugerencias\": [\n"
        "    {\n"
        "      \"id_actividad\": 123,\n"
        "      \"nombre_actividad\": \"Nombre exacto de la actividad\",\n"
        "      \"subdimension\": \"Nombre de la subdimensión\",\n"
        "      \"match_score\": 95,\n"
        "      \"justificacion\": \"El recurso... se justifica en esta actividad por...\"\n"
        "    }\n"
        "  ],\n"
        "  \"no_asociado_pme\": false\n"
        "}\n"
        "7. Si el motivo o el recurso claramente NO corresponde a ninguna actividad del PME de esa dimensión, marca \"no_asociado_pme\": true y devuelve el arreglo \"sugerencias\": []."
    )

    user = f"""Establecimiento: {colegio_id}
Recurso: {nombre_recurso}
Descripción / Detalle: {descripcion or 'Sin descripción'}
Área Solicitante: {area_solicitante or 'No especificada'}
Destino del Gasto: {destino or 'No especificado'}
Motivo de Compra: {motivo_compra or 'No especificado'}
Dimensión Seleccionada: {dimension_seleccionada}
Subdimensión Opcional: {subdimension_opcional or 'Todas'}

ACTIVIDADES CANDIDATAS FILTRADAS POR DIMENSIÓN ({len(actividades_candidatas)} disponibles):
{json.dumps(actividades_candidatas, ensure_ascii=False, indent=2)}

Analiza las actividades candidatas y responde ÚNICAMENTE con el objeto JSON solicitado."""

    return system, user
