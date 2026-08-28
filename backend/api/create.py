from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional


router = APIRouter(prefix="/api/cases", tags=["Emergency Cases"])


class PatientCase(BaseModel):
    patient_name: str
    age: Optional[int] = None
    gender: Optional[str] = None

    symptoms: str
    medical_history: Optional[str] = None
    medications: Optional[str] = None
    allergies: Optional[str] = None

    heart_rate: Optional[float] = None
    systolic_bp: Optional[float] = None
    diastolic_bp: Optional[float] = None
    spo2: Optional[float] = None
    respiratory_rate: Optional[float] = None
    temperature: Optional[float] = None


@router.post("/")
def create_case(case: PatientCase):
    return {
        "status": "received",
        "message": "Emergency case received successfully",
        "patient": case.model_dump(),
    }