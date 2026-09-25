-- =====================================================
-- MIGRACIÓN: Categoría directa en pre_detalle
-- Descripción: Agrega id_cat_recurso a pre_detalle para detalles que no están
--              enlazados a un recurso del catálogo (p.ej. importados de
--              convocatoria, donde la IA sugiere la categoría). Permite mostrar
--              la categoría aunque id_recurso sea NULL.
-- Fecha: 2026-06-24
-- =====================================================

ALTER TABLE pre_detalle
ADD COLUMN id_cat_recurso INT NULL AFTER id_subarea,
ADD CONSTRAINT fk_detalle_cat_recurso FOREIGN KEY (id_cat_recurso)
    REFERENCES pre_categoria_recurso(id_cat_recurso);
