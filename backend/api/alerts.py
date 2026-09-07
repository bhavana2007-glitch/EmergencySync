from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import SessionLocal
from models.alert import SpecialistAlert

router = APIRouter(prefix="/api/alerts", tags=["Specialist Alerts"])

@router.get("/{specialty}")
def get_alerts(specialty: str):
    db: Session = SessionLocal()
    try:
        return {"alerts": [{"id": a.id, "case_id": a.case_id, "category": a.category, "message": a.message, "created_at": a.created_at.isoformat()} for a in db.query(SpecialistAlert).filter(SpecialistAlert.target_specialty == specialty.lower(), SpecialistAlert.acknowledged == False).order_by(SpecialistAlert.created_at.desc()).all()]}
    finally: db.close()

class AcknowledgeRequest(BaseModel):
    specialist_name: str

@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int, data: AcknowledgeRequest):
    db: Session = SessionLocal()
    try:
        alert = db.get(SpecialistAlert, alert_id)
        if not alert: raise HTTPException(status_code=404, detail="Alert not found")
        alert.acknowledged, alert.acknowledged_by = True, data.specialist_name
        db.commit()
        return {"status": "acknowledged", "case_id": alert.case_id}
    finally: db.close()
