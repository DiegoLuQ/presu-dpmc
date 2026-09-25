-- =====================================================
-- MIGRACIÓN: Ampliar destino en pre_pedido_externo
-- Descripción: El campo destino ahora guarda los códigos de pilar oficiales
--              (clases(alumno), oficinas(administracion), premio/beneficio,
--              mantencion/servicio). El valor 'oficinas(administracion)' (24
--              caracteres) excedía VARCHAR(20). Se amplía a VARCHAR(50) para
--              alinearlo con destino_gasto del resto del sistema.
-- Fecha: 2026-06-24
-- =====================================================

ALTER TABLE pre_pedido_externo MODIFY COLUMN destino VARCHAR(50) NULL;
