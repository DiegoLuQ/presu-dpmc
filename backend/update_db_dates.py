import pymysql
import os
from dotenv import load_dotenv

# Load environment variables from the .env file in the current directory (backend)
load_dotenv()

db_url = os.getenv("DATABASE_URL")
# Parse manual URL: mysql+pymysql://mcdp_user:mcdp_password@localhost:3306/mcdp_db
# This is a bit brittle, better to just use parts
user = "mcdp_user"
password = "mcdp_password"
host = "localhost"
port = 3306
db = "mcdp_db"

try:
    connection = pymysql.connect(
        host=host,
        user=user,
        password=password,
        database=db,
        port=port
    )
    with connection.cursor() as cursor:
        sql = "ALTER TABLE pre_detalle ADD COLUMN fecha_termino DATE NULL AFTER fecha_ejecucion;"
        cursor.execute(sql)
    connection.commit()
    print("Column fecha_termino added successfully to pre_detalle table.")
except Exception as e:
    print(f"Error updating database: {e}")
finally:
    if 'connection' in locals():
        connection.close()
