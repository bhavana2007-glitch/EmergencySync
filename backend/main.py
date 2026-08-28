from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.cases_backup import router as cases_router
from api.files import router as files_router
from api.hospitals import router as hospitals_router
from api.auth import router as auth_router
from api import ambulances

from database import engine, Base

from models.case import EmergencyCase
from models.hospital import Hospital
from models.user import User
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="EmergencySync API",
    description="Smart Ambulance-to-Hospital Emergency Coordination Platform",
    version="1.0.0",
)

# Allow the React frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(cases_router)
app.include_router(files_router)
app.include_router(hospitals_router)
app.include_router(auth_router)
app.include_router(ambulances.router)

@app.get("/")
def root():
    return {
        "application": "EmergencySync",
        "message": "EmergencySync Backend is running",
        "status": "online"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "EmergencySync API"
    }