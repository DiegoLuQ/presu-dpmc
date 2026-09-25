import os
import openpyxl
from app.db.session import SessionLocal, engine
from app.models import Base, CuentaDestino, CuentaMatrizReglas

# Mapeo del texto "Destino Principal" del Excel -> clave normalizada
DESTINO_PRINCIPAL_MAP = {
    "sala de clases (alumnos)": "ESTUDIANTE",
    "oficina / administracion (funcionarios)": "FUNCIONARIO",
    "oficina / administración (funcionarios)": "FUNCIONARIO",
    "premio / beneficio": "PREMIO",
    "mantencion / servicio": "MANTENCION",
    "mantención / servicio": "MANTENCION",
}


def _norm_valor(v):
    """Normaliza el valor de cada celda de destino: 'Principal'/'Aplica' o None."""
    if v is None:
        return None
    v = str(v).strip()
    if not v:
        return None
    return v.upper()  # PRINCIPAL / APLICA


def _norm_principal(v):
    if v is None:
        return None
    return DESTINO_PRINCIPAL_MAP.get(str(v).strip().lower())


def seed_cuenta_destino():
    print("Importando matriz de destinos por cuenta contable...")
    Base.metadata.create_all(bind=engine)

    backend_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(backend_dir)
    xlsx_path = os.path.join(root_dir, "Cuentas_Contables_x_Destino.xlsx")

    if not os.path.exists(xlsx_path):
        print(f"Error: no se encontró {xlsx_path}")
        return

    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    data = rows[1:]  # saltar encabezado

    db = SessionLocal()
    try:
        # Códigos válidos existentes en la tabla canónica de cuentas
        codigos_validos = {c[0] for c in db.query(CuentaMatrizReglas.codigo).all()}

        # Limpiar datos previos
        db.query(CuentaDestino).delete()
        db.flush()

        insertados = 0
        sin_match = []
        for r in data:
            codigo = str(r[0]).strip() if r[0] is not None else None
            if not codigo:
                continue
            grupo = str(r[1]).strip() if r[1] is not None else None

            if codigo not in codigos_validos:
                sin_match.append(codigo)
                continue  # el FK exige que el código exista en pre_cuenta_matriz_reglas

            db.add(CuentaDestino(
                codigo=codigo,
                grupo=grupo,
                estudiante=_norm_valor(r[2]),
                funcionario=_norm_valor(r[3]),
                premio=_norm_valor(r[4]),
                mantencion=_norm_valor(r[5]),
                destino_principal=_norm_principal(r[6]),
            ))
            insertados += 1

        db.commit()
        print(f"OK: {insertados} cuentas insertadas en pre_cuenta_destino.")
        if sin_match:
            print(f"AVISO: {len(sin_match)} códigos no existen en pre_cuenta_matriz_reglas: {sin_match}")
    except Exception as e:
        db.rollback()
        print(f"Error durante la importación: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_cuenta_destino()
