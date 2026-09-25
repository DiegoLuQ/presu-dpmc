from sqlalchemy import create_engine, text

engine = create_engine('mysql+pymysql://mcdp_user:mcdp_password@localhost:3306/mcdp_db')

with engine.connect() as conn:
    version = conn.execute(text('SELECT version_num FROM alembic_version')).fetchone()
    print(f"Alembic version: {version[0] if version else None}")