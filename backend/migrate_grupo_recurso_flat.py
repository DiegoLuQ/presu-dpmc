import sys
sys.path.append('.')
from app.core.config import settings
from sqlalchemy import create_engine, text

DATABASE_URL = settings.DATABASE_URL
print(f"Connecting to database at {DATABASE_URL}...")
engine = create_engine(DATABASE_URL)

with engine.begin() as conn:
    # 1. Check if id_cat_recurso column exists in pre_recurso. If not, add it.
    columns_recurso_res = conn.execute(text("SHOW COLUMNS FROM pre_recurso"))
    columns_recurso = [row[0] for row in columns_recurso_res.fetchall()]
    
    if "id_cat_recurso" not in columns_recurso:
        print("Adding id_cat_recurso column to pre_recurso...")
        conn.execute(text("ALTER TABLE pre_recurso ADD COLUMN id_cat_recurso INT NULL"))
        conn.execute(text("ALTER TABLE pre_recurso ADD CONSTRAINT fk_recurso_categoria FOREIGN KEY (id_cat_recurso) REFERENCES pre_categoria_recurso(id_cat_recurso)"))
        
        # Populate id_cat_recurso in pre_recurso based on the category of the resource's current group
        print("Populating id_cat_recurso in pre_recurso from pre_grupo_recurso...")
        conn.execute(text("""
            UPDATE pre_recurso r
            JOIN pre_grupo_recurso g ON g.id_grupo_recurso = r.id_grupo_recurso
            SET r.id_cat_recurso = g.id_cat_recurso
            WHERE r.id_grupo_recurso IS NOT NULL
        """))
    else:
        print("id_cat_recurso already exists in pre_recurso.")

    # 2. Collapse duplicate groups in pre_grupo_recurso by name
    print("Deduplicating groups in pre_grupo_recurso...")
    groups = conn.execute(text("SELECT id_grupo_recurso, nombre FROM pre_grupo_recurso")).fetchall()
    
    unique_groups = {}  # name.lower() -> keep_id
    duplicates = []     # (duplicate_id, keep_id)
    
    for g_id, g_nombre in groups:
        key = g_nombre.strip().lower()
        if key not in unique_groups:
            unique_groups[key] = g_id
        else:
            duplicates.append((g_id, unique_groups[key]))
            
    print(f"Found {len(duplicates)} duplicate groups to collapse.")
    for dup_id, keep_id in duplicates:
        # Update resources pointing to the duplicate group to point to the kept group
        conn.execute(text("UPDATE pre_recurso SET id_grupo_recurso = :keep_id WHERE id_grupo_recurso = :dup_id"), {"keep_id": keep_id, "dup_id": dup_id})
        # Delete the duplicate group
        conn.execute(text("DELETE FROM pre_grupo_recurso WHERE id_grupo_recurso = :dup_id"), {"dup_id": dup_id})

    # 3. Drop id_cat_recurso from pre_grupo_recurso
    columns_grupo_res = conn.execute(text("SHOW COLUMNS FROM pre_grupo_recurso"))
    columns_grupo = [row[0] for row in columns_grupo_res.fetchall()]
    
    if "id_cat_recurso" in columns_grupo:
        print("Dropping foreign key fk_grupo_categoria if exists...")
        try:
            # Let's drop foreign key constraint first
            conn.execute(text("ALTER TABLE pre_grupo_recurso DROP FOREIGN KEY fk_grupo_categoria"))
        except Exception as ex:
            # Maybe it has a different name, let's try dropping constraint dynamically or catch error
            try:
                conn.execute(text("ALTER TABLE pre_grupo_recurso DROP FOREIGN KEY pre_grupo_recurso_ibfk_1"))
            except Exception:
                pass
        
        print("Dropping id_cat_recurso from pre_grupo_recurso...")
        conn.execute(text("ALTER TABLE pre_grupo_recurso DROP COLUMN id_cat_recurso"))
        print("Successfully dropped id_cat_recurso column.")

print("Migration completed successfully.")
