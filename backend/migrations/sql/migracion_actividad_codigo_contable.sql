-- =====================================================
-- MIGRACIÓN: Código contable por actividad (PME)
-- Descripción: Crea la tabla pre_actividad_codigo_contable, que asocia
--              a cada actividad del PME un único código de cuenta y una
--              única subvención (PIE, SEP, PRO_RETENCION, MANTENIMIENTO, etc.)
--              para que Contabilidad rinda todos los recursos de esa compra.
-- Fecha: 2026-06-24
-- =====================================================

CREATE TABLE IF NOT EXISTS pre_actividad_codigo_contable (
    id_actividad_codigo INT AUTO_INCREMENT PRIMARY KEY,
    id_actividad INT NOT NULL,
    codigo_cuenta VARCHAR(6) NOT NULL,
    id_subvencion INT NOT NULL,
    fecha DATETIME NULL,
    comentario TEXT NULL,
    estado VARCHAR(20) DEFAULT 'Pendiente',

    -- Único por actividad: una actividad solo tiene un código/subvención vigente
    CONSTRAINT uq_actividad_codigo UNIQUE (id_actividad),

    CONSTRAINT fk_actcod_actividad FOREIGN KEY (id_actividad)
        REFERENCES pre_actividad(id_actividad) ON DELETE CASCADE,
    CONSTRAINT fk_actcod_cuenta FOREIGN KEY (codigo_cuenta)
        REFERENCES pre_cuenta_matriz_reglas(codigo),
    CONSTRAINT fk_actcod_subvencion FOREIGN KEY (id_subvencion)
        REFERENCES pre_subvencion(id_subvencion)
);

-- Índices para búsquedas frecuentes
CREATE INDEX idx_actcod_actividad ON pre_actividad_codigo_contable(id_actividad);
CREATE INDEX idx_actcod_estado ON pre_actividad_codigo_contable(estado);
