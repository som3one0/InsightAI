from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import router
import os
from core.database import init_db

app = FastAPI(title="InsightAI API")

# Initialize database on startup
init_db()

# Configure CORS for Next.js frontend (restrict to specific origins in production)
origins = [
    "http://localhost:3000",  # Development
    "http://127.0.0.1:3000",
    # Add production domains here
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")

if __name__ == "__main__":
    import uvicorn

    # Start the server on port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
