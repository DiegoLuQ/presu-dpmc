from sqlalchemy import text
from app.db.session import engine

def drop_inventory_tables():
    with engine.begin() as conn:
        conn.execute(text('SET FOREIGN_KEY_CHECKS = 0;'))
        conn.execute(text('DROP TABLE IF EXISTS inv_movimiento;'))
        conn.execute(text('DROP TABLE IF EXISTS inv_stock;'))
        conn.execute(text('DROP TABLE IF EXISTS inv_catalogo_papel;'))
        conn.execute(text('DROP TABLE IF EXISTS inv_proveedor;'))
        conn.execute(text('SET FOREIGN_KEY_CHECKS = 1;'))
    print('Tablas de inventario eliminadas con éxito.')

if __name__ == "__main__":
    drop_inventory_tables()
