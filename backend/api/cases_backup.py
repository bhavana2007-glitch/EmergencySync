import logging
import re

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
import json

from sqlalchemy.orm import Session

from database import get_db
from models.case import EmergencyCase
from models.alert import SpecialistAlert
from models.hospital import Hospital
from models.user import User
from services.ai_agent import ai_agent
from services.notifications import (
    TwilioDeliveryError,
    normalize_phone_number,
    send_specialist_alert_call,
)
from services.push_notifications import send_push_to_users


router = APIRouter(
    prefix="/api/cases",
    tags=["Emergency Cases"]
)

SPECIALTY_ALIASES = {
    "cardiology": {"cardiology", "cardiologist", "cardiac"},
    "neurology": {"neurology", "neurologist", "neurological"},
    "pulmonology": {"pulmonology", "pulmonary", "respiratory", "respiratory medicine"},
    "emergency": {"emergency", "emergency medicine", "emergency medicine", "emergency doctor"},
    "endocrinology": {"endocrinology", "metabolic", "metabolic medicine"},
    "toxicology": {"toxicology", "poisoning", "poisoning toxicology", "poisoning/toxicology"},
    "critical_care": {"critical care", "critical_care", "criticalcare", "intensive care", "icu"},
    "trauma": {"trauma", "trauma surgery", "trauma medicine"},
}

SPECIALTY_ROUTES = {"cardiac": "cardiology", "neurological": "neurology", "respiratory": "pulmonology", "trauma": "trauma", "metabolic": "endocrinology", "poisoning": "toxicology", "environmental": "critical_care", "other": "emergency", "undetermined": "emergency"}

logger = logging.getLogger(__name__)


def resolve_required_specialty(result: dict) -> str:
    for value in (
        result.get("emergency_category"),
        result.get("category"),
        result.get("recommended_department"),
        result.get("department"),
    ):
        if value is None:
            continue
        normalized = normalize_specialty_name(str(value))
        if normalized in {"other", "undetermined", "unknown", "none"}:
            continue
        if normalized in SPECIALTY_ALIASES:
            return normalized
        if normalized in SPECIALTY_ROUTES:
            return SPECIALTY_ROUTES[normalized]

    for value in (
        result.get("recommended_department"),
        result.get("department"),
        result.get("emergency_category"),
        result.get("category"),
    ):
        if value is None:
            continue
        normalized = normalize_specialty_name(str(value))
        if normalized in SPECIALTY_ALIASES:
            return normalized
        if normalized in SPECIALTY_ROUTES:
            return SPECIALTY_ROUTES[normalized]

    emergency_category = str(result.get("emergency_category") or result.get("category") or "other").lower()
    return SPECIALTY_ROUTES.get(emergency_category, "emergency")


def normalize_specialty_name(value: Optional[str]) -> str:
    if value is None:
        return ""

    cleaned = value.strip().lower().replace("&", " and ")
    cleaned = cleaned.replace("/", " ").replace("_", " ").replace("-", " ")
    cleaned = re.sub(r"[^a-z0-9\s]", " ", cleaned)
    cleaned = " ".join(cleaned.split())

    for canonical, aliases in SPECIALTY_ALIASES.items():
        if cleaned in aliases:
            return canonical

    return cleaned.replace(" ", "_")


def _active_booking_snapshot() -> dict:
    try:
        from api.ambulances import active_booking

        return dict(active_booking)
    except Exception:
        return {}


def attach_destination_hospital(db: Session, db_case: EmergencyCase) -> Optional[int]:
    if db_case.hospital_id:
        return db_case.hospital_id

    booking = _active_booking_snapshot()
    if not booking.get("booking_id"):
        return None

    booking_case_id = booking.get("case_id")
    booking_name = str(booking.get("patient_name") or "").strip().lower()
    case_name = str(db_case.patient_name or "").strip().lower()
    same_case = bool(booking_case_id) and booking_case_id == db_case.case_id
    same_patient = bool(booking_name and case_name and booking_name == case_name)
    if not same_case and not same_patient:
        return None

    hospital_id = booking.get("hospital_id")
    if hospital_id is None or str(hospital_id).strip() == "":
        return None

    try:
        db_case.hospital_id = int(hospital_id)
    except (TypeError, ValueError):
        return None

    if db_case.eta_minutes is None and booking.get("eta") is not None:
        try:
            db_case.eta_minutes = int(booking.get("eta"))
        except (TypeError, ValueError):
            pass

    return db_case.hospital_id


def dispatch_specialist_notification_for_case(
    db: Session,
    db_case: EmergencyCase,
) -> None:
    if not db_case or not db_case.hospital_id or not db_case.ai_assessment:
        return

    try:
        result = json.loads(db_case.ai_assessment)
    except (json.JSONDecodeError, TypeError):
        return

    if not isinstance(result, dict):
        return

    try:
        needs_specialist, specialty, severity, alert_created = queue_specialist_alert(
            db,
            db_case.case_id,
            result,
            db_case.hospital_id,
        )
        db.commit()
        if needs_specialist and alert_created:
            notify_matching_specialists(
                db,
                db_case.case_id,
                specialty,
                severity,
                db_case.hospital_id,
            )
    except Exception:
        logger.exception(
            "Specialist notification dispatch failed for case %s.",
            db_case.case_id,
        )


def _privacy_safe_push_body(
    *,
    db_case: Optional[EmergencyCase],
    category: str,
    required_specialty: str,
    severity: str,
    hospital_name: str,
    case_id: str,
) -> str:
    patient_label = "Patient"
    if db_case and db_case.patient_age is not None:
        patient_label = f"{db_case.patient_age}-year-old"
        if db_case.patient_gender:
            patient_label += f" {db_case.patient_gender}"

    vital_lines = []
    if db_case and db_case.systolic_bp is not None and db_case.diastolic_bp is not None:
        vital_lines.append(f"BP: {db_case.systolic_bp:g}/{db_case.diastolic_bp:g}")
    if db_case and db_case.heart_rate is not None:
        vital_lines.append(f"HR: {db_case.heart_rate:g}")
    if db_case and db_case.spo2 is not None:
        vital_lines.append(f"SpO2: {db_case.spo2:g}%")

    observations = (db_case.nurse_observations or "") if db_case else ""
    current_state = None
    if re.search(r"conscious\s+and\s+breathing", observations, re.IGNORECASE):
        current_state = "Current state: Conscious and breathing"

    treatments = []
    if re.search(r"\baspirin\b", observations, re.IGNORECASE):
        treatments.append("Aspirin")
    if re.search(r"\boxygen\b", observations, re.IGNORECASE):
        treatments.append("Oxygen")

    recommendation = ""
    if db_case and db_case.ai_recommendation:
        recommendation = str(db_case.ai_recommendation).strip()
    if len(recommendation) > 180:
        recommendation = recommendation[:177] + "..."

    eta = db_case.eta_minutes if db_case else None
    specialty_label = required_specialty.replace("_", " ").title()
    category_label = category.replace("_", " ").title() if category else "Emergency"

    lines = [
        "INCOMING EMERGENCY — PREPARE NOW",
        f"Suspected {category_label} emergency",
        patient_label,
    ]
    if eta is not None:
        lines.append(f"ETA: {eta} minutes")
    if current_state:
        lines.append(current_state)
    lines.extend(vital_lines)
    if treatments:
        lines.append("Treatment already given: " + ", ".join(treatments))
    lines.extend(
        [
            f"{specialty_label} specialist required",
            f"Severity: {severity or 'undetermined'}",
            hospital_name,
            f"Case: {case_id}",
        ]
    )
    if recommendation:
        lines.append(f"AI preparation recommendation: {recommendation}")
    lines.append("Open EmergencySync to acknowledge and view the full case.")
    return "\n".join(lines)


def queue_specialist_alert(
    db: Session,
    case_id: str,
    result: dict,
    hospital_id: Optional[int] = None,
) -> tuple[bool, str, str, bool]:
    category = str(
        result.get("emergency_category")
        or result.get("category")
        or "other"
    ).lower()
    specialty = resolve_required_specialty(result)
    severity = str(
        result.get("severity")
        or result.get("priority")
        or ""
    ).lower()
    needs_specialist = (
        bool(result.get("requires_immediate_attention"))
        or severity in {"critical", "high"}
    )

    alert_created = False
    if needs_specialist and hospital_id is None:
        logger.warning(
            "Skipping specialist alert for case %s until a destination hospital is assigned.",
            case_id,
        )
    elif needs_specialist:
        normalized_specialty = normalize_specialty_name(specialty)
        existing_alert = (
            db.query(SpecialistAlert)
            .filter(
                SpecialistAlert.case_id == case_id,
                SpecialistAlert.hospital_id == hospital_id,
                SpecialistAlert.acknowledged == False,
            )
            .all()
        )
        if not any(
            normalize_specialty_name(alert.target_specialty) == normalized_specialty
            for alert in existing_alert
        ):
            db.add(
                SpecialistAlert(
                    case_id=case_id,
                    category=category,
                    target_specialty=normalized_specialty,
                    hospital_id=hospital_id,
                    message=(
                        f"Important {category} emergency case. "
                        "Specialist review required."
                    ),
                )
            )
            alert_created = True

    return needs_specialist, specialty, severity, alert_created


def notify_matching_specialists(
    db: Session,
    case_id: str,
    required_specialty: str,
    severity: str,
    hospital_id: Optional[int] = None,
) -> None:
    if hospital_id is None:
        logger.warning(
            "Not notifying specialists for case %s because destination hospital is missing.",
            case_id,
        )
        return

    normalized_required = normalize_specialty_name(required_specialty)
    pending_alert = None
    for candidate in (
        db.query(SpecialistAlert)
        .filter(
            SpecialistAlert.case_id == case_id,
            SpecialistAlert.hospital_id == hospital_id,
            SpecialistAlert.acknowledged == False,
        )
        .all()
    ):
        if normalize_specialty_name(candidate.target_specialty) == normalized_required:
            pending_alert = candidate
            break
    if pending_alert is None:
        return

    hospital = db.get(Hospital, hospital_id)
    if hospital is None:
        logger.warning(
            "Not notifying specialists for case %s because hospital %s was not found.",
            case_id,
            hospital_id,
        )
        return
    hospital_name = hospital.name
    specialists = (
        db.query(User)
        .filter(
            User.role == "specialist",
            User.is_active == True,
            User.hospital_id == hospital_id,
        )
        .order_by(User.id)
        .all()
    )

    matched_specialists = [
        specialist
        for specialist in specialists
        if specialist.specialty
        and normalize_specialty_name(specialist.specialty) == normalized_required
    ]

    if not matched_specialists:
        logger.warning(
            "No active registered specialist was found for hospital %s specialty %s (case %s).",
            hospital_id,
            required_specialty,
            case_id,
        )
        return

    specialty_label = normalized_required.replace("_", " ").title()
    push_payload = {
        "title": "Emergency specialist required",
        "body": (
            f"{specialty_label} specialist required at {hospital_name} "
            "— incoming emergency patient. Open EmergencySync to review and acknowledge."
        ),
        "tag": f"specialist-alert-{case_id}-{normalized_required}",
        "url": "/",
    }

    for specialist in matched_specialists:
        try:
            send_push_to_users(db, [specialist.id], push_payload)
        except Exception:
            logger.exception(
                "Browser push failed for specialist %s on case %s; continuing emergency workflow.",
                specialist.full_name,
                case_id,
            )

        phone_number = normalize_phone_number(specialist.phone or "")
        if not phone_number:
            logger.warning(
                "Skipping specialist phone alert for %s because their phone number is missing/invalid for case %s.",
                specialist.full_name,
                case_id,
            )
            continue

        try:
            send_specialist_alert_call(
                phone_number=phone_number,
                specialty=required_specialty,
                severity=severity or "high",
                case_id=case_id,
            )
        except TwilioDeliveryError:
            logger.exception(
                "Voice alert failed for specialist %s on case %s.",
                specialist.full_name,
                case_id,
            )
        except Exception:
            logger.exception(
                "Unexpected voice alert failure for specialist %s on case %s.",
                specialist.full_name,
                case_id,
            )



# =========================================================
# Patient / Emergency Case Model
# =========================================================

class PatientCase(BaseModel):
    patient_name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None

    symptoms: Optional[str] = None
    medical_history: Optional[str] = None
    medications: Optional[str] = None
    allergies: Optional[str] = None
    nurse_observations: Optional[str] = None

    heart_rate: Optional[float] = None
    systolic_bp: Optional[float] = None
    diastolic_bp: Optional[float] = None
    spo2: Optional[float] = None
    respiratory_rate: Optional[float] = None
    temperature: Optional[float] = None


class ClinicalVoiceRequest(BaseModel):
    transcript: str


@router.post("/voice-structure")
async def structure_voice_handover(request: ClinicalVoiceRequest):
    if not request.transcript.strip():
        raise HTTPException(
            status_code=400,
            detail="Clinical handover transcript is required",
        )
    # Nurse field population uses the existing deterministic extractor only.
    # Do not wait on Ollama/Gemini to fill the form.
    return ai_agent._extract_handover_values(request.transcript)


# =========================================================
# CREATE NEW EMERGENCY CASE
# =========================================================

@router.post("/")
async def create_case(
    case: PatientCase,
    db: Session = Depends(get_db)
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
        blood_group=case.blood_group,

        symptoms=case.symptoms,
        medical_history=case.medical_history,
        medications=case.medications,
        allergies=case.allergies,
        nurse_observations=case.nurse_observations,

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
    db: Session = Depends(get_db)
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

    hospital = db.get(Hospital, db_case.hospital_id) if db_case.hospital_id else None
    attachments = {"medical_report": False, "physical_ecg": False}
    if db_case.ecg_file:
        try:
            stored = json.loads(db_case.ecg_file)
            if isinstance(stored, dict):
                attachments["medical_report"] = bool(stored.get("medical_report"))
                attachments["physical_ecg"] = bool(stored.get("physical_ecg"))
            elif stored:
                attachments["medical_report"] = True
        except (json.JSONDecodeError, TypeError):
            attachments["medical_report"] = True

    booking = _active_booking_snapshot()
    patient_location = None
    booking_name = str(booking.get("patient_name") or "").strip().lower()
    case_name = str(db_case.patient_name or "").strip().lower()
    if booking.get("booking_id") and (
        booking.get("case_id") == db_case.case_id
        or (booking_name and case_name and booking_name == case_name)
    ):
        if booking.get("patient_latitude") is not None and booking.get("patient_longitude") is not None:
            patient_location = {
                "latitude": booking.get("patient_latitude"),
                "longitude": booking.get("patient_longitude"),
            }

    return {
        "status": "success",
        "case": {
            "case_id": db_case.case_id,

            "patient": {
                "patient_name": db_case.patient_name,
                "age": db_case.patient_age,
                "gender": db_case.patient_gender,
                "blood_group": db_case.blood_group,
                "symptoms": db_case.symptoms,
                "medical_history": db_case.medical_history,
                "medications": db_case.medications,
                "allergies": db_case.allergies,
                "nurse_observations": db_case.nurse_observations,

                "heart_rate": db_case.heart_rate,
                "systolic_bp": db_case.systolic_bp,
                "diastolic_bp": db_case.diastolic_bp,
                "spo2": db_case.spo2,
                "respiratory_rate": db_case.respiratory_rate,
                "temperature": db_case.temperature,
            },

            "status": db_case.status,
            "hospital_id": db_case.hospital_id,
            "hospital_name": hospital.name if hospital else None,
            "eta_minutes": db_case.eta_minutes,
            "ambulance_location": {
                "latitude": db_case.ambulance_latitude,
                "longitude": db_case.ambulance_longitude,
            },
            "patient_location": patient_location,
            "attachments": attachments,

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
    db: Session = Depends(get_db)
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
        clinical_data = case.model_dump()
        db_case.patient_name = clinical_data.get("patient_name") or db_case.patient_name
        db_case.patient_age = clinical_data.get("age")
        db_case.patient_gender = clinical_data.get("gender")
        db_case.blood_group = clinical_data.get("blood_group")
        db_case.symptoms = clinical_data.get("symptoms")
        db_case.medical_history = clinical_data.get("medical_history")
        db_case.medications = clinical_data.get("medications")
        db_case.allergies = clinical_data.get("allergies")
        db_case.nurse_observations = clinical_data.get("nurse_observations")
        db_case.heart_rate = clinical_data.get("heart_rate")
        db_case.systolic_bp = clinical_data.get("systolic_bp")
        db_case.diastolic_bp = clinical_data.get("diastolic_bp")
        db_case.spo2 = clinical_data.get("spo2")
        db_case.respiratory_rate = clinical_data.get("respiratory_rate")
        db_case.temperature = clinical_data.get("temperature")

        db.commit()
        attach_destination_hospital(db, db_case)

        # =============================================
        # REAL BACKEND AI AGENT
        # =============================================

        result = await ai_agent.analyze_case(
            clinical_data
        )

        # Store structured AI result
        db_case.ai_assessment = json.dumps(
            result,
            default=str
        )

        # Try to extract priority/recommendation
        needs_specialist = False
        specialty = "emergency"
        severity = ""
        alert_created = False
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
            needs_specialist, specialty, severity, alert_created = queue_specialist_alert(
                db,
                case_id,
                result,
                db_case.hospital_id,
            )

        db_case.status = "analyzed"

        db.commit()
        db.refresh(db_case)

        if needs_specialist and alert_created:
            try:
                notify_matching_specialists(
                    db,
                    case_id,
                    specialty,
                    severity,
                    db_case.hospital_id,
                )
            except Exception:
                logger.exception(
                    "Specialist notification failed after analysis for case %s; analysis was saved.",
                    case_id,
                )

        return {
            "case_id": case_id,
            "status": "completed",
            "ai_analysis": result
        }

    except Exception as exc:

        db_case.status = "ai_error"

        db.commit()

        return JSONResponse(
            status_code=502,
            content={
                "case_id": case_id,
                "status": "ai_error",
                "error": str(exc),
            },
        )


# =========================================================
# ANALYZE UPLOADED ECG / MEDICAL REPORT
# =========================================================

@router.post("/{case_id}/analyze-file")
async def analyze_case_with_file(
    case_id: str,
    document_type: str = "medical_report",
    db: Session = Depends(get_db)
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
        attach_destination_hospital(db, db_case)

        # Patient data for AI agent
        patient_data = {
            "patient_name": db_case.patient_name,
            "age": db_case.patient_age,
            "gender": db_case.patient_gender,
            "blood_group": db_case.blood_group,
            "symptoms": db_case.symptoms,
            "medical_history": db_case.medical_history,
            "medications": db_case.medications,
            "allergies": db_case.allergies,
            "nurse_observations": db_case.nurse_observations,
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

        try:
            attachment = json.loads(db_case.ecg_file).get(document_type)
        except (json.JSONDecodeError, AttributeError):
            attachment = {"path": db_case.ecg_file, "mime_type": "image/jpeg"}
        if not attachment:
            raise HTTPException(status_code=400, detail="That document has not been uploaded")

        result = await ai_agent.analyze_case_with_file(
            patient_data=patient_data,
            file_path=attachment["path"],
            mime_type=attachment.get("mime_type", "image/jpeg")
        )

        # =============================================
        # SAVE AI RESULT TO SQLITE
        # =============================================

        db_case.ai_assessment = json.dumps(
            result,
            default=str
        )

        needs_specialist = False
        specialty = "emergency"
        severity = ""
        alert_created = False
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
            needs_specialist, specialty, severity, alert_created = queue_specialist_alert(
                db,
                case_id,
                result,
                db_case.hospital_id,
            )

        db_case.status = "analyzed"

        db.commit()
        db.refresh(db_case)

        if needs_specialist and alert_created:
            try:
                notify_matching_specialists(
                    db,
                    case_id,
                    specialty,
                    severity,
                    db_case.hospital_id,
                )
            except Exception:
                logger.exception(
                    "Specialist notification failed after file analysis for case %s; analysis was saved.",
                    case_id,
                )

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
    db: Session = Depends(get_db)
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
    db: Session = Depends(get_db)
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
    dispatch_specialist_notification_for_case(db, db_case)

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
    db: Session = Depends(get_db)
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
    db: Session = Depends(get_db)
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
    db: Session = Depends(get_db)
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
    db: Session = Depends(get_db)
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
    db: Session = Depends(get_db)
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
