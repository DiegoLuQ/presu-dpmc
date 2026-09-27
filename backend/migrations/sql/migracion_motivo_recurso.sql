-- Migración: Tabla de motivos de recursos predeterminados y campo id_grupo_recurso en pre_detalle
-- MCDP-PPA

-- 1. Asegurar grupo 'Salud / Enfermería' en pre_grupo_recurso
INSERT INTO pre_grupo_recurso (nombre, descripcion)
SELECT 'Salud / Enfermería', 'Insumos médicos, botiquín y primeros auxilios'
WHERE NOT EXISTS (
    SELECT 1 FROM pre_grupo_recurso WHERE LOWER(nombre) LIKE '%salud%' OR LOWER(nombre) LIKE '%enfermer%'
);

-- 2. Crear tabla pre_motivo_recurso
CREATE TABLE IF NOT EXISTS pre_motivo_recurso (
    id_motivo INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT NULL,
    id_grupo_recurso INT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    orden INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_motivo_grupo FOREIGN KEY (id_grupo_recurso) REFERENCES pre_grupo_recurso(id_grupo_recurso) ON DELETE SET NULL
);

-- 3. Agregar columna id_grupo_recurso a pre_detalle si no existe
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'pre_detalle' 
      AND COLUMN_NAME = 'id_grupo_recurso'
);

SET @stmt = IF(@col_exists = 0,
    'ALTER TABLE pre_detalle ADD COLUMN id_grupo_recurso INT NULL, ADD CONSTRAINT fk_detalle_grupo FOREIGN KEY (id_grupo_recurso) REFERENCES pre_grupo_recurso(id_grupo_recurso) ON DELETE SET NULL;',
    'SELECT 1;'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
