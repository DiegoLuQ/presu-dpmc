---
name: asesoramiento-codigo-contable-ia
description: Instrucciones y patrón de integración del botón 'Asesorar código contable con IA' para sugerir automáticamente la cuenta contable y justificación utilizando el endpoint /ai/asesorar-cuenta.
---

# Asesoramiento de Código Contable con IA

Esta habilidad (skill) describe cómo replicar la funcionalidad del botón **"Asesorar código contable"** en formularios de recursos o ítems de presupuesto utilizando el motor multi-proveedor de IA del backend.

---

## 1. Funcionamiento del Backend

El backend expone el endpoint `POST /ai/asesorar-cuenta` (definido en `backend/app/api/ai.py`), el cual interactúa con los modelos de IA (Gemini, Claude, OpenAI) para analizar:
- `nombre`: Nombre del producto o recurso (ej: *"Computador notebook 16GB RAM"*).
- `descripcion`: Descripción u observaciones técnicas.
- `id_cat_recurso`: ID de la categoría (opcional).
- `destino_uso`: Propósito o pilar de uso (`clases(alumno)`, `oficinas(administracion)`, etc.).
- `proveedor_override`: Proveedor de IA seleccionado si existe en `localStorage.getItem('ai_provider_override')`.

### Estructura de Respuesta del Endpoint
```json
{
  "codigo_sugerido": "410905",
  "nombre_subcategoria": "INSUMOS COMPUTACIONALES",
  "justificacion": "Corresponde a equipos tecnológicos destinados al uso administrativo o docente...",
  "confianza": "alta"
}
```

---

## 2. Implementación Frontend (Patrón Estándar React / Next.js)

### Importaciones requeridas
```tsx
import { Sparkles, Loader2, X } from 'lucide-react';
import api from '@/lib/api/client';
```

### Estados Necesarios
```tsx
const [asesorando, setAsesorando] = useState(false);
const [asesoriaData, setAsesoriaData] = useState<any | null>(null);
const [mostrarAsesoria, setMostrarAsesoria] = useState(false);
```

### Botón de Asesoría con IA
```tsx
<div className="flex items-center gap-2">
    {asesoriaData && !mostrarAsesoria && (
        <button
            type="button"
            onClick={() => setMostrarAsesoria(true)}
            className="px-2.5 py-1 rounded-lg font-bold text-violet-700 bg-white border border-violet-200 hover:bg-violet-50 transition-all text-xs flex items-center gap-1"
        >
            <Sparkles size={12} />
            Ver asesoría
        </button>
    )}

    <button
        type="button"
        disabled={asesorando || !nombreRecurso.trim()}
        onClick={async () => {
            setAsesorando(true);
            setAsesoriaData(null);
            try {
                const proveedorOverride = localStorage.getItem('ai_provider_override');
                const res = await api.post('/ai/asesorar-cuenta', {
                    nombre: nombreRecurso,
                    descripcion: descripcionRecurso,
                    id_cat_recurso: idCategoria ? parseInt(idCategoria) : null,
                    destino_uso: 'clases(alumno)',
                    proveedor_override: proveedorOverride,
                });
                setAsesoriaData(res.data);
                setMostrarAsesoria(true);
            } catch (err: any) {
                alert(err.response?.data?.detail || 'Error al consultar la IA');
            } finally {
                setAsesorando(false);
            }
        }}
        className="px-3 py-1 rounded-lg font-bold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-all text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
    >
        {asesorando ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {asesoriaData ? 'Volver a asesorar' : 'Asesorar código contable'}
    </button>
</div>
```

### Card / Banner de Respuesta con la Sugerencia
```tsx
{asesoriaData && mostrarAsesoria && (
    <div className="p-4 bg-violet-50/70 border border-violet-200 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2">
        <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-800">
                <Sparkles size={14} /> Asesoría de IA para Código Contable
            </span>
            <button type="button" onClick={() => setMostrarAsesoria(false)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
            </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
                <span className="text-base font-extrabold text-violet-950 font-mono">
                    {asesoriaData.codigo_sugerido || asesoriaData.codigo_cuenta}
                </span>
                {asesoriaData.nombre_subcategoria && (
                    <span className="text-xs font-semibold text-violet-800">
                        — {asesoriaData.nombre_subcategoria}
                    </span>
                )}
            </div>
            <button
                type="button"
                onClick={() => {
                    const code = asesoriaData.codigo_sugerido || asesoriaData.codigo_cuenta;
                    if (code) {
                        setFormCodigo({ propositoId: 'clases(alumno)', codigo_cuenta: code, subvencion: 'GENERAL', search: code });
                    }
                }}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1"
            >
                <Plus size={13} />
                Agregar código sugerido
            </button>
        </div>
        {asesoriaData.justificacion && (
            <p className="text-xs text-violet-900 leading-relaxed bg-white/60 p-2.5 rounded-xl border border-violet-100">
                {asesoriaData.justificacion}
            </p>
        )}
    </div>
)}
```
