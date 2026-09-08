import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import SessionLocal, get_db
from models.alert import SpecialistAlert
from models.case import EmergencyCase
from models.hospital import Hospital
from models.push_subscription import PushSubscription
from models.user import User
from api.auth import get_current_user
from services.push_notifications import send_push_to_users
import json

router = APIRouter(prefix="/api/alerts", tags=["Specialist Alerts"])

SPECIALTY_ALIASES = {
    "cardiology": {"cardiology", "cardiologist", "cardiac"},
    "neurology": {"neurology", "neurologist", "neurological"},
    "pulmonology": {"pulmonology", "pulmonary", "respiratory", "respiratory medicine"},
    "emergency": {"emergency", "emergency medicine", "emergency doctor"},
    "endocrinology": {"endocrinology", "metabolic", "metabolic medicine"},
    "toxicology": {"toxicology", "poisoning", "poisoning toxicology", "poisoning/toxicology"},
    "critical_care": {"critical care", "critical_care", "criticalcare", "intensive care", "icu"},
    "trauma": {"trauma", "trauma surgery", "trauma medicine"},
}


def _same_hospital(left, right) -> bool:
    if left is None or right is None:
        return False
    try:
        return int(left) == int(right)
    except (TypeError, ValueError):
        return left == right


def normalize_specialty_name(value: str) -> str:
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


@router.get("/{specialty}")
def get_alerts(
    specialty: str,
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "specialist":
        raise HTTPException(status_code=403, detail="Specialist alerts are restricted to specialists")
    db: Session = SessionLocal()
    try:
        normalized_specialty = normalize_specialty_name(current_user.specialty or specialty)
        if not current_user.hospital_id or not normalized_specialty:
            return {"alerts": []}
        alerts = []
        for alert in db.query(SpecialistAlert).filter(SpecialistAlert.acknowledged == False).order_by(SpecialistAlert.created_at.desc()).all():
            if (
                normalize_specialty_name(alert.target_specialty) == normalized_specialty
                and _same_hospital(alert.hospital_id, current_user.hospital_id)
            ):
                db_case = (
                    db.query(EmergencyCase)
                    .filter(EmergencyCase.case_id == alert.case_id)
                    .first()
                )
                hospital = db.get(Hospital, alert.hospital_id) if alert.hospital_id else None
                ai_payload = {}
                if db_case and db_case.ai_assessment:
                    try:
                        parsed = json.loads(db_case.ai_assessment)
                        if isinstance(parsed, dict):
                            ai_payload = parsed
                    except (json.JSONDecodeError, TypeError):
                        ai_payload = {}
                alerts.append({
                    "id": alert.id,
                    "case_id": alert.case_id,
                    "category": alert.category,
                    "message": alert.message,
                    "target_specialty": alert.target_specialty,
                    "severity": (
                        str(ai_payload.get("severity") or ai_payload.get("priority") or "")
                        or (db_case.ai_priority if db_case else None)
                    ),
                    "hospital_name": hospital.name if hospital else None,
                    "eta_minutes": db_case.eta_minutes if db_case else None,
                    "patient_age": db_case.patient_age if db_case else None,
                    "patient_gender": db_case.patient_gender if db_case else None,
                    "created_at": alert.created_at.isoformat(),
                })
        return {"alerts": alerts}
    finally:
        db.close()

class AcknowledgeRequest(BaseModel):
    specialist_name: str

@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: int,
    data: AcknowledgeRequest,
    current_user: User = Depends(get_current_user),
):
    db: Session = SessionLocal()
    try:
        alert = db.get(SpecialistAlert, alert_id)
        if not alert: raise HTTPException(status_code=404, detail="Alert not found")
        if (
            current_user.role != "specialist"
            or not _same_hospital(alert.hospital_id, current_user.hospital_id)
            or normalize_specialty_name(alert.target_specialty)
            != normalize_specialty_name(current_user.specialty)
        ):
            raise HTTPException(status_code=403, detail="Alert is not assigned to this specialist")
        alert.acknowledged, alert.acknowledged_by = True, data.specialist_name
        db.commit()
        return {"status": "acknowledged", "case_id": alert.case_id}
    finally: db.close()


@router.post("/test-push")
def test_specialist_push(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "specialist":
        raise HTTPException(status_code=403, detail="Specialist test alarm is restricted to specialists")
    subscription_count = db.query(PushSubscription).filter(
        PushSubscription.user_id == current_user.id
    ).count()
    if subscription_count == 0:
        raise HTTPException(
            status_code=409,
            detail="This specialist has no registered browser push subscription.",
        )
    hospital = db.get(Hospital, current_user.hospital_id) if current_user.hospital_id else None
    specialty_label = normalize_specialty_name(current_user.specialty or "specialist").replace("_", " ").title()
    hospital_name = hospital.name if hospital else "your hospital"
    send_push_to_users(
        db,
        [current_user.id],
        {
            "title": "Emergency specialist required",
            "body": (
                f"{specialty_label} specialist required at {hospital_name} "
                "— incoming emergency patient. Open EmergencySync to review and acknowledge."
            ),
            "tag": "specialist-push-test",
            "url": "/",
        },
    )
    return {"status": "sent", "subscription_count": subscription_count}
