from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
import json

from sqlalchemy.orm import Session

from database import get_db
from models.case import EmergencyCase
from services.ai_agent import ai_agent
from api.auth import get_current_user


router = APIRouter(
    prefix="/api/cases",
    tags=["Emergency Cases"]
)


# =========================================================
# Patient / Emergency Case Model
# =========================================================

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


# =========================================================
# CREATE NEW EMERGENCY CASE
# =========================================================

@router.post("/")
async def create_case(
    case: PatientCase,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):

    case_id = (
        f"EMS-{datetime.now().strftime('%Y%m%d')}-"
        f"{uuid.uuid4().hex[:6].upper()}"
    )

    db_case = EmergencyCase(
        case_id=case_id,

        patient_name=case.patient_name,
        patient_age=case.age,
        patient_gender=case.gender,

        symptoms=case.symptoms,
        medical_history=case.medical_history,

        heart_rate=case.heart_rate,
        systolic_bp=case.systolic_bp,
        diastolic_bp=case.diastolic_bp,
        spo2=case.spo2,
        respiratory_rate=case.respiratory_rate,
        temperature=case.temperature,

        status="received"
    )

    db.add(db_case)
    db.commit()
    db.refresh(db_case)

    return {
        "case_id": case_id,
        "status": "received",
        "message": "Emergency case saved successfully",
        "case": {
            "case_id": db_case.case_id,
            "patient": case.model_dump(),
            "status": db_case.status,
            "created_at": db_case.created_at.isoformat()
        }
    }


# =========================================================
# GET COMPLETE EMERGENCY CASE
# =========================================================

@router.get("/{case_id}")
async def get_case(
    case_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):

    db_case = (
        db.query(EmergencyCase)
        .filter(EmergencyCase.case_id == case_id)
        .first()
    )

    if not db_case:
        raise HTTPException(
            status_code=404,
            detail="Emergency case not found"
        )

    return {
        "status": "success",
        "case": {
            "case_id": db_case.case_id,

            "patient": {
                "patient_name": db_case.patient_name,
                "age": db_case.patient_age,
                "gender": db_case.patient_gender,
                "symptoms": db_case.symptoms,
                "medical_history": db_case.medical_history,

                "heart_rate": db_case.heart_rate,
                "systolic_bp": db_case.systolic_bp,
                "diastolic_bp": db_case.diastolic_bp,
                "spo2": db_case.spo2,
                "respiratory_rate": db_case.respiratory_rate,
                "temperature": db_case.temperature,
            },

            "status": db_case.status,

            "ai_analysis": (
                json.loads(db_case.ai_assessment)
                if db_case.ai_assessment
                else None
            ),

            "ai_priority": db_case.ai_priority,
            "ai_recommendation": db_case.ai_recommendation,

            "created_at": db_case.created_at.isoformat()
        }
    }


# =========================================================
# ANALYZE PATIENT DATA
# =========================================================

@router.post("/{case_id}/analyze")
async def analyze_case(
    case_id: str,
    case: PatientCase,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):

    db_case = (
        db.query(EmergencyCase)
        .filter(EmergencyCase.case_id == case_id)
        .first()
    )

    if not db_case:
        raise HTTPException(
            status_code=404,
            detail="Emergency case not found"
        )

    try:

        db_case.status = "analyzing"

        db.commit()

        # =============================================
        # REAL BACKEND AI AGENT
        # =============================================

        result = await ai_agent.analyze_case(
            case.model_dump()
        )

        # Store structured AI result
        db_case.ai_assessment = json.dumps(
            result,
            default=str
        )

        # Try to extract priority/recommendation
        if isinstance(result, dict):

            db_case.ai_priority = str(
                result.get("priority")
                or result.get("severity")
                or ""
            )

            db_case.ai_recommendation = str(
                result.get("recommendation")
                or result.get("recommended_action")
                or ""
            )

        db_case.status = "analyzed"

        db.commit()
        db.refresh(db_case)

        return {
            "case_id": case_id,
            "status": "completed",
            "ai_analysis": result
        }

    except Exception as exc:

        db_case.status = "ai_error"

        db.commit()

        return {
            "case_id": case_id,
            "status": "ai_error",
            "error": str(exc)
        }


# =========================================================
# ANALYZE UPLOADED ECG / MEDICAL REPORT
# =========================================================

@router.post("/{case_id}/analyze-file")
async def analyze_case_with_file(
    case_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):

    # Find case in SQLite
    db_case = (
        db.query(EmergencyCase)
        .filter(EmergencyCase.case_id == case_id)
        .first()
    )

    if not db_case:
        raise HTTPException(
            status_code=404,
            detail="Emergency case not found"
        )

    # Check uploaded ECG/report
    if not db_case.ecg_file:
        raise HTTPException(
            status_code=400,
            detail="No ECG or medical file uploaded for this case"
        )

    try:

        db_case.status = "analyzing_file"
        db.commit()

        # Patient data for AI agent
        patient_data = {
            "patient_name": db_case.patient_name,
            "age": db_case.patient_age,
            "gender": db_case.patient_gender,
            "symptoms": db_case.symptoms,
            "medical_history": db_case.medical_history,
            "heart_rate": db_case.heart_rate,
            "systolic_bp": db_case.systolic_bp,
            "diastolic_bp": db_case.diastolic_bp,
            "spo2": db_case.spo2,
            "respiratory_rate": db_case.respiratory_rate,
            "temperature": db_case.temperature,
        }

        # =============================================
        # REAL MULTIMODAL BACKEND AI AGENT
        # =============================================

        result = await ai_agent.analyze_case_with_file(
            patient_data=patient_data,
            file_path=db_case.ecg_file,
            mime_type="image/jpeg"
        )

        # =============================================
        # SAVE AI RESULT TO SQLITE
        # =============================================

        db_case.ai_assessment = json.dumps(
            result,
            default=str
        )

        if isinstance(result, dict):

            db_case.ai_priority = str(
                result.get("priority")
                or result.get("severity")
                or ""
            )

            db_case.ai_recommendation = str(
                result.get("recommendation")
                or result.get("recommended_action")
                or ""
            )

        db_case.status = "analyzed"

        db.commit()
        db.refresh(db_case)

        return {
            "case_id": case_id,
            "status": "analyzed",
            "ai_analysis": result
        }

    except Exception as exc:

        db_case.status = "ai_error"

        db.commit()

        raise HTTPException(
            status_code=500,
            detail=f"AI analysis failed: {str(exc)}"
        )

    # =========================================================
# UPDATE EMERGENCY CASE STATUS
# =========================================================

@router.patch("/{case_id}/status")
async def update_case_status(
    case_id: str,
    status: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):

    db_case = (
        db.query(EmergencyCase)
        .filter(EmergencyCase.case_id == case_id)
        .first()
    )

    if not db_case:
        raise HTTPException(
            status_code=404,
            detail="Emergency case not found"
        )

    allowed_statuses = {
        "received",
        "analyzing",
        "analyzed",
        "hospital_selected",
        "ambulance_en_route",
        "hospital_received",
        "completed",
    }

    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid case status",
                "allowed_statuses": list(allowed_statuses)
            }
        )

    db_case.status = status

    db.commit()
    db.refresh(db_case)

    return {
        "case_id": case_id,
        "status": db_case.status,
        "message": "Emergency case status updated successfully"
    }
# =========================================================
# SELECT HOSPITAL FOR EMERGENCY CASE
# =========================================================

@router.post("/{case_id}/hospital")
async def select_hospital(
    case_id: str,
    hospital_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):

    db_case = (
        db.query(EmergencyCase)
        .filter(EmergencyCase.case_id == case_id)
        .first()
    )

    if not db_case:
        raise HTTPException(
            status_code=404,
            detail="Emergency case not found"
        )

    db_case.hospital_id = hospital_id
    db_case.status = "hospital_selected"

    db.commit()
    db.refresh(db_case)

    return {
        "case_id": case_id,
        "hospital_id": hospital_id,
        "status": db_case.status,
        "message": "Hospital selected successfully"
    }
# =========================================================
# SEND EMERGENCY CASE TO HOSPITAL
# =========================================================

@router.post("/{case_id}/send-to-hospital")
async def send_case_to_hospital(
    case_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):

    db_case = (
        db.query(EmergencyCase)
        .filter(EmergencyCase.case_id == case_id)
        .first()
    )

    if not db_case:
        raise HTTPException(
            status_code=404,
            detail="Emergency case not found"
        )

    if not db_case.hospital_id:
        raise HTTPException(
            status_code=400,
            detail="Please select a hospital before sending the case"
        )

    db_case.status = "hospital_notified"

    db.commit()
    db.refresh(db_case)

    return {
        "case_id": case_id,
        "hospital_id": db_case.hospital_id,
        "status": db_case.status,
        "message": "Emergency case successfully transmitted to hospital"
    }

    # =========================================================
# UPDATE AMBULANCE LOCATION / ETA
# =========================================================

@router.patch("/{case_id}/location")
async def update_ambulance_location(
    case_id: str,
    latitude: float,
    longitude: float,
    eta_minutes: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):

    db_case = (
        db.query(EmergencyCase)
        .filter(EmergencyCase.case_id == case_id)
        .first()
    )

    if not db_case:
        raise HTTPException(
            status_code=404,
            detail="Emergency case not found"
        )

    db_case.ambulance_latitude = latitude
    db_case.ambulance_longitude = longitude
    db_case.eta_minutes = eta_minutes

    db.commit()
    db.refresh(db_case)

    return {
        "case_id": case_id,
        "ambulance_location": {
            "latitude": latitude,
            "longitude": longitude
        },
        "eta_minutes": eta_minutes,
        "message": "Ambulance location updated successfully"
    }

# =========================================================
# SET EMERGENCY PRIORITY
# =========================================================

@router.patch("/{case_id}/priority")
async def set_case_priority(
    case_id: str,
    priority: str,
    recommendation: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):

    db_case = (
        db.query(EmergencyCase)
        .filter(EmergencyCase.case_id == case_id)
        .first()
    )

    if not db_case:
        raise HTTPException(
            status_code=404,
            detail="Emergency case not found"
        )

    allowed_priorities = {
        "LOW",
        "MEDIUM",
        "HIGH",
        "CRITICAL"
    }

    priority = priority.upper()

    if priority not in allowed_priorities:
        raise HTTPException(
            status_code=400,
            detail="Invalid priority"
        )

    db_case.ai_priority = priority
    db_case.ai_recommendation = recommendation

    db.commit()
    db.refresh(db_case)

    return {
        "case_id": case_id,
        "priority": db_case.ai_priority,
        "recommendation": db_case.ai_recommendation,
        "message": "Emergency priority updated successfully"
    }


# =========================================================
# SYNC CASE UPDATE
# =========================================================

class CaseSyncRequest(BaseModel):
    status: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    eta_minutes: Optional[int] = None


@router.patch("/{case_id}/sync")
async def sync_case(
    case_id: str,
    update: CaseSyncRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):

    db_case = (
        db.query(EmergencyCase)
        .filter(EmergencyCase.case_id == case_id)
        .first()
    )

    if not db_case:
        raise HTTPException(
            status_code=404,
            detail="Emergency case not found"
        )

    if update.status is not None:
        db_case.status = update.status

    if update.latitude is not None:
        db_case.ambulance_latitude = update.latitude

    if update.longitude is not None:
        db_case.ambulance_longitude = update.longitude

    if update.eta_minutes is not None:
        db_case.eta_minutes = update.eta_minutes

    db.commit()
    db.refresh(db_case)

    return {
        "status": "synced",
        "case_id": case_id,
        "case_status": db_case.status,
        "ambulance_location": {
            "latitude": db_case.ambulance_latitude,
            "longitude": db_case.ambulance_longitude
        },
        "eta_minutes": db_case.eta_minutes,
        "message": "Pending emergency updates synchronized successfully"
    }

    # =========================================================
# VOICE ASSISTANCE
# =========================================================

class VoiceInput(BaseModel):
    case_id: str
    transcript: str


@router.post("/voice-assist")
async def voice_assist(
    data: VoiceInput,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):

    db_case = (
        db.query(EmergencyCase)
        .filter(EmergencyCase.case_id == data.case_id)
        .first()
    )

    if not db_case:
        raise HTTPException(
            status_code=404,
            detail="Emergency case not found"
        )

    if not data.transcript.strip():
        raise HTTPException(
            status_code=400,
            detail="Voice transcript cannot be empty"
        )

    try:

        # Send voice transcript through the real backend AI agent
        result = await ai_agent.analyze_case({
            "patient_name": db_case.patient_name,
            "age": db_case.patient_age,
            "gender": db_case.patient_gender,
            "symptoms": data.transcript,
            "medical_history": db_case.medical_history,
            "heart_rate": db_case.heart_rate,
            "systolic_bp": db_case.systolic_bp,
            "diastolic_bp": db_case.diastolic_bp,
            "spo2": db_case.spo2,
            "respiratory_rate": db_case.respiratory_rate,
            "temperature": db_case.temperature,
        })

        # Store AI result
        db_case.ai_assessment = json.dumps(
            result,
            default=str
        )

        if isinstance(result, dict):

            db_case.ai_priority = str(
                result.get("priority")
                or result.get("severity")
                or ""
            )

            db_case.ai_recommendation = str(
                result.get("recommendation")
                or result.get("recommended_action")
                or ""
            )

        db_case.status = "analyzed"

        db.commit()
        db.refresh(db_case)

        return {
            "status": "success",
            "case_id": data.case_id,
            "transcript": data.transcript,
            "ai_analysis": result,
            "message": "Voice information processed successfully"
        }

    except Exception as exc:

        db_case.status = "ai_error"
        db.commit()

        raise HTTPException(
            status_code=500,
            detail=f"Voice AI processing failed: {str(exc)}"
        )