# Skill: Integración y Uso de Google Gemini (Instrucciones Generales)

Esta guía explica paso a paso cómo integrar y consumir los modelos de Google Gemini en cualquier tipo de proyecto, centrándose en la arquitectura del flujo de datos, la configuración de parámetros y las buenas prácticas, sin depender de código específico de programación.

---

## 1. Configuración de Credenciales
Para poder interactuar con las APIs de Gemini, el primer paso es obtener una API Key válida y hacerla accesible de forma segura.
* **Obtención:** Se debe generar una clave de API desde el panel oficial de Google AI Studio.
* **Seguridad:** Almacena la clave exclusivamente en variables de entorno locales (por ejemplo, bajo la clave `GEMINI_API_KEY`) o en administradores de secretos seguros de la nube. Nunca expongas esta clave directamente en el frontend del cliente.

---

## 2. Inicialización del Cliente de IA
Cualquier interacción con el servicio requiere configurar una conexión al SDK oficial de Google.
* **Instanciación:** Se crea un cliente maestro pasándole la API Key que almacenamos en las variables de entorno.
* **Selección del Modelo:** Con el cliente inicializado, se selecciona el modelo específico de Gemini a utilizar (por ejemplo, `gemini-2.5-flash` para velocidad y tareas generales, o `gemini-2.5-pro` para tareas más complejas).

---

## 3. Configuración del Contexto y Rol (System Instructions)
Para definir la personalidad, reglas o comportamiento del modelo, se utiliza una instrucción de sistema.
* **Definición de Instrucción:** Se configura un texto plano que actúa como la directiva maestra (por ejemplo: *"Actúa como un experto en finanzas y formatea la salida siempre en formato estructurado"*).
* **Momento de Inyección:** Esta directiva se le pasa al modelo en el momento de crear la sesión o instanciar el modelo generativo, garantizando que afecte a todas las consultas subsiguientes.

---

## 4. Control de Parámetros de Generación
Se pueden ajustar los siguientes parámetros opcionales para afinar el tipo de respuesta que entrega Gemini:
* **Temperatura:** Define la creatividad o determinismo de la respuesta. 
  * Valores cercanos a **0** devuelven respuestas precisas, coherentes y deterministas (ideal para análisis de datos o JSONs).
  * Valores cercanos a **1** devuelven respuestas creativas y variadas (ideal para escritura creativa o lluvia de ideas).
* **Límite de Tokens (Max Output Tokens):** Controla el largo máximo del texto de salida permitido para evitar respuestas excesivamente largas o consumos de cuota imprevistos.

---

## 5. Envío de Prompts y Obtención de la Respuesta
Una vez configurado el modelo con sus reglas y parámetros, se realiza la solicitud de contenido.
* **Formateo de la Entrada:** Se envía un objeto estructurado donde se indica el rol (en este caso, `"user"`) y el contenido del mensaje (el prompt del usuario).
* **Procesamiento:** El SDK envía la consulta en segundo plano de forma asíncrona a los servidores de Google AI.
* **Extracción de la Respuesta:** El resultado de la llamada devuelve una respuesta estructurada de la cual se extrae el contenido de texto generado para mostrarlo al usuario final.

---

## 6. Manejo de Errores y Excepciones
Toda llamada de red con IA puede fallar por problemas de conexión, cuotas excedidas o bloqueo de seguridad de contenido.
* **Captura:** Es indispensable envolver cada interacción en un bloque de control de excepciones (try/catch).
* **Filtrado de Seguridad:** Si una respuesta resulta vacía, valida si fue bloqueada por los filtros de seguridad nativos de Gemini (como contenido inapropiado o violento).
