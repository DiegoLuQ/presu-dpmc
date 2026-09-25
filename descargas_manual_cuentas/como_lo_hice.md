# Prompt 1: Capa A - Matriz de Reglas (Estructura Rígida)
Este prompt está optimizado para procesar la Matriz de Homologación (las tablas resumen al final del PDF) y cruzarla con los documentos y libros de rendición de cada ficha técnica. Su objetivo es generar un JSON válido de reglas de negocio para tu base de datos.

REQUERIMIENTO: Extracción de reglas de validación y matriz de cuentas (Capa A)

Actúa como un validador de datos contables y analista de sistemas experto en la normativa de la Superintendencia de Educación de Chile. Tu objetivo es construir un archivo JSON limpio, estructurado y sin texto descriptivo redundante, que sirva directamente como base de datos de reglas de validación para un software de rendición de cuentas del año 2026.

Entradas que procesarás:
1. El texto descriptivo de las cuentas (Fichas técnicas).
2. Las imágenes/OCR de la Matriz de Cuentas (Páginas de resumen final 48 a 50 del PDF).

INSTRUCCIONES DE PROCESAMIENTO:
1. Identifica cada código de cuenta de 6 dígitos.
2. Identifica el "Libro de Rendición" y la lista exacta de "Documentos Habilitados" indicados en su respectiva ficha técnica.
3. Cruza cada código con la matriz resumen de las páginas finales del manual para determinar qué subvenciones están habilitadas.
4. REGLA CRÍTICA DE FISCALIZACIÓN (PUNTO ROJO / ASTERISCO): 
   En la matriz del PDF, algunas celdas contienen un check con un punto rojo (ej. "✓ •"). En tu mapeo, si una subvención tiene este punto rojo, debes marcar el campo "critico_fiscalizacion" como "true". Si solo tiene el "✓", márcalo como "false". Si la celda está vacía, "habilitado" debe ser "false".

Formato de salida requerido (JSON Estricto):
Devuelve únicamente el objeto JSON con la siguiente estructura para cada código procesado. No agregues introducciones, explicaciones de Markdown ni texto fuera del bloque JSON.

[
  {
    "codigo": "String (6 dígitos)",
    "nombre": "String (Nombre oficial de la cuenta)",
    "grupo": "String (Código de grupo de 6 dígitos, ej: 410500)",
    "libro_rendicion": "String (Compras y Otros Gastos / Honorarios / No aplica)",
    "documentos_habilitados": ["Array de Strings (Códigos de documentos válidos, ej: FAC, BOL, BHE)"],
    "subvenciones_reglas": {
      "SUBV_GENERAL": { "habilitado": Boolean, "critico_fiscalizacion": Boolean },
      "ADM_CENTRAL_SUBV_GRAL": { "habilitado": Boolean, "critico_fiscalizacion": Boolean },
      "SEP": { "habilitado": Boolean, "critico_fiscalizacion": Boolean },
      "ADM_CENTRAL_SEP": { "habilitado": Boolean, "critico_fiscalizacion": Boolean },
      "PIE": { "habilitado": Boolean, "critico_fiscalizacion": Boolean },
      "MANTENIMIENTO": { "habilitado": Boolean, "critico_fiscalizacion": Boolean },
      "PRO_RETENCION": { "habilitado": Boolean, "critico_fiscalizacion": Boolean },
      "INTERNADO": { "habilitado": Boolean, "critico_fiscalizacion": Boolean },
      "REFUERZO_EDUCATIVO": { "habilitado": Boolean, "critico_fiscalizacion": Boolean }
    }
  }
]

PROCESA EL SIGUIENTE TEXTO E IMÁGENES/OCR:
[INSERTAR AQUÍ EL TEXTO DEL MANUAL Y EL OCR/TABLAS DE LAS PÁGINAS 48 A 50]


# Prompt 2: Capa B - Ficha Descriptiva (Texto Semiestructurado)
Este prompt está diseñado para extraer el contenido informativo que se mostrará en la interfaz de usuario del colegio (como tooltips, ayuda visual, ejemplos prácticos de compra y advertencias normativas que evitan rechazos).

REQUERIMIENTO: Extracción de información descriptiva de cuentas para UI (Capa B)

Actúa como un redactor técnico y especialista en experiencia de usuario (UX) para software de gestión escolar. Tu tarea es extraer la información explicativa de cada código de cuenta contenida en el manual de la Superintendencia de Educación 2026. 

Esta información se utilizará para alimentar el centro de ayuda, tooltips informativos y buscadores internos que utilizan los sostenedores de los colegios al momento de comprar o rendir.

INSTRUCCIONES DE PROCESAMIENTO:
Por cada código de cuenta de 6 dígitos identificado, extrae de manera estructurada los siguientes campos:
1. "caracteristica": Resumen de la definición y las condiciones de aplicabilidad técnica de la cuenta.
2. "diferenciacion_publico": A quién debe ir dirigido obligatoriamente el gasto (ej. alumnos prioritarios, docentes contratados, padres y apoderados, etc.).
3. "ejemplos_compra": Lista de bienes o servicios reales que el manual menciona explícitamente como permitidos.
4. "advertencias_sistema": Alertas de integridad contable o restricciones legales explícitas mencionadas en el texto (ej. "No se permite financiar animales de vigilancia", "No corresponde pagar servicios básicos con Fondo Fijo"). Si no hay alertas específicas, deja el array vacío.

Formato de salida requerido (JSON Estricto):
Devuelve únicamente el objeto JSON con la siguiente estructura. No agregues explicaciones ni textos complementarios fuera del JSON.

[
  {
    "codigo": "String (6 dígitos)",
    "nombre": "String (Nombre de la cuenta)",
    "caracteristicas": "String (Explicación conceptual clara)",
    "diferenciacion_publico": "String (Público objetivo del gasto)",
    "ejemplos_compra": [
      "String (Ejemplo 1)",
      "String (Ejemplo 2)"
    ],
    "advertencias_sistema": [
      "String (Alerta normativa 1, si existe)"
    ]
  }
]

PROCESA EL SIGUIENTE TEXTO DEL MANUAL:
[INSERTAR AQUÍ EL TEXTO DE LAS FICHAS TÉCNICAS DEL MANUAL]