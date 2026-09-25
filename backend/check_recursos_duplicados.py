import sys
import os

# Ajustar path al proyecto
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db.session import SessionLocal
from app.models import Recurso
import unicodedata

def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = text.lower().strip()
    # Eliminar tildes
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    return text

def main():
    db = SessionLocal()
    try:
        recursos = db.query(Recurso).all()
        print(f"Total de recursos analizados: {len(recursos)}")

        # 1. Recursos exactamente duplicados por nombre normalizado
        nombres_map = {}
        for r in recursos:
            norm = normalize_text(r.nombre)
            if norm not in nombres_map:
                nombres_map[norm] = []
            nombres_map[norm].append(r)

        exact_dups = {k: v for k, v in nombres_map.items() if len(v) > 1}
        print(f"\n--- DUPLICADOS EXACTOS ({len(exact_dups)} grupos) ---")
        for norm, items in list(exact_dups.items())[:15]:
            print(f" * '{items[0].nombre}' (IDs: {[i.id_recurso for i in items]})")

        # 2. Agrupación por palabras clave / raíz
        stop_words = {'de', 'del', 'la', 'los', 'las', 'un', 'una', 'para', 'con', 'sin', 'por', 'en', 'y', 'e', 'o', 'mm', 'cm', '2l', '1l', '500ml'}
        word_map = {}
        for r in recursos:
            words = [w for w in normalize_text(r.nombre).split() if len(w) >= 3 and w not in stop_words]
            for w in set(words):
                if w not in word_map:
                    word_map[w] = []
                word_map[w].append(r)

        # Filtrar palabras que agrupen más de 1 recurso
        similar_groups = {k: v for k, v in word_map.items() if len(v) > 1}
        print(f"\n--- GRUPOS DE RECURSOS SIMILARES POR PALABRA CLAVE ({len(similar_groups)} palabras clave) ---")
        sorted_keywords = sorted(similar_groups.items(), key=lambda x: len(x[1]), reverse=True)
        for word, items in sorted_keywords[:15]:
            print(f"\nPalabra clave: '{word.upper()}' ({len(items)} coincidencia(s)):")
            for item in items[:5]:
                print(f"   - [ID {item.id_recurso}] {item.nombre}")
            if len(items) > 5:
                print(f"     ... y {len(items)-5} más")

    finally:
        db.close()

if __name__ == "__main__":
    main()
