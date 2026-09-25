# Plan de Implementación: Catálogo de Códigos de Gasto (Cuentas)

Este plan detalla la migración de los datos técnicos de `nueva_tabla.md` al sistema MCDP-PPA, permitiendo que el módulo de Presupuesto y PME utilice códigos estandarizados y validados por la normativa.

## User Review Required

> [!IMPORTANT]
> **Validaciones de Negocio:** El plan incluye la implementación de las "Alertas de Validación" (ej. bloqueo de Facturas en códigos específicos). ¿Deseas que estas validaciones sean solo visuales en el frontend o también restrictivas en el backend?
> 
> **Filtro de Asteriscos (*):** Los códigos con asterisco requieren vinculación obligatoria a una acción del PME. ¿Debemos forzar esta vinculación en el momento de crear un gasto?

## Proposed Changes

### 1. Base de Datos (MySQL + SQLAlchemy)
Se crearán nuevas tablas para normalizar el catálogo y permitir búsquedas eficientes.

#### [NEW] Modelos en `backend/app/models.py`
- `GrupoGasto`: Almacena los grupos (410 500, 410 600, etc.).
- `CodigoGasto`: Tabla principal (ID 410 501, etc.).
- `Subvencion`: Catálogo de subvenciones (SEP, PIE, General).
- `DocumentoTipo`: Catálogo de tipos de documentos (BOL, FAC, BHE).
- Tablas intermedias para las relaciones muchos-a-muchos entre Códigos, Subvenciones y Documentos.

### 2. Extracción y Carga de Datos
Dado que `nueva_tabla.md` es extenso, crearemos un script de automatización.

#### [NEW] `backend/scripts/seed_catalogo.py`
- Script de Python para parsear el archivo Markdown.
- Extraerá: ID, Nombre, Características, Público, Subvenciones (detectando asteriscos), Documentos y Ejemplos.
- Poblará la base de datos automáticamente.

### 3. Backend (FastAPI)

#### [MODIFY] `backend/app/api/catalogos.py`
- `GET /catalogos/gastos`: Listar códigos con filtros por grupo o subvención.
- `GET /catalogos/gastos/{id}`: Detalle completo de un código (incluye documentos permitidos y ejemplos).

#### [NEW] `backend/app/schemas/catalogo_gasto.py`
- Definición de esquemas Pydantic para la respuesta de la API.

### 4. Frontend (Next.js)

#### [NEW] `frontend/lib/api/budget_catalog.ts`
- Funciones para consultar el catálogo desde el frontend.

#### [NEW] Componente `SelectorCodigoGasto`
- Un componente de búsqueda inteligente (Combobox/Autocomplete).
- Al seleccionar un código, mostrará automáticamente:
    - Qué documentos puede subir el usuario.
    - Qué ejemplos de compra aplican.
    - Advertencias específicas (ej. "Certifico que no es Reconocimiento Oficial").

## Verification Plan

### Automated Tests
- Script de validación: Verificar que el número de códigos en la DB coincida con los de `nueva_tabla.md`.
- Test de API: `pytest` para asegurar que el filtro por subvención funciona (ej. buscar solo códigos SEP).

### Manual Verification
- Ingresar al nuevo selector en el formulario de gastos.
- Probar un código restrictivo (ej. 410 803) y verificar que el sistema bloquee o advierta sobre el uso de Facturas.
- Verificar que los códigos con `*` desplieguen la solicitud de evidencia PME.
