import random
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    NVIDIA_API_KEY: str
    NVIDIA_SAFETY_API_KEY: str

    # Deepseek API keys for rotation
    DEEPSEEK_API_KEYS: str = ""  # Comma-separated list of keys

    # Storage settings
    STORAGE_DIR: str = ".storage"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def deepseek_keys(self) -> list[str]:
        """Get list of Deepseek API keys for rotation."""
        if not self.DEEPSEEK_API_KEYS:
            return []
        return [key.strip() for key in self.DEEPSEEK_API_KEYS.split(",") if key.strip()]

    def get_random_deepseek_key(self) -> str:
        """Get a random Deepseek API key for rotation."""
        keys = self.deepseek_keys
        if not keys:
            # Fallback to main NVIDIA key if no Deepseek keys configured
            return self.NVIDIA_API_KEY
        return random.choice(keys)


settings = Settings()
