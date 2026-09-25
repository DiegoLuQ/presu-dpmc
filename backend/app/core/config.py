from pydantic_settings import BaseSettings
from typing import Optional, List

class Settings(BaseSettings):
    PROJECT_NAME: str = "MCDP School ERP"
    DATABASE_URL: str = "mysql+pymysql://mcdp_user:mcdp_password@localhost:3306/mcdp_db"
    
    JWT_SECRET: str = "your-secret-key-here-super-secure"  # In production, use a strong secret
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    AI_ENCRYPTION_KEY: str = ""

    # CORS origins
    ALLOW_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://ppc.dpmc.cl",
        "http://ppc.dpmc.cl",
    ]

    class Config:
        env_file = ".env"
        extra = "ignore" # Allow extra env variables

settings = Settings()
