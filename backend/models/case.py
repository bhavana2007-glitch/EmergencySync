from sqlalchemy import Column, String, Integer, Float, Text, DateTime
from datetime import datetime

from database import Base


class EmergencyCase(Base):
    __tablename__ = "emergency_cases"

    id = Column(Integer, primary_key=True, index=True)

    case_id = Column(String, unique=True, index=True, nullable=False)

    patient_name = Column(String, nullable=False)
    patient_age = Column(Integer, nullable=True)
    patient_gender = Column(String, nullable=True)

    symptoms = Column(Text, nullable=True)
    medical_history = Column(Text, nullable=True)

    heart_rate = Column(Float, nullable=True)
    systolic_bp = Column(Float, nullable=True)
    diastolic_bp = Column(Float, nullable=True)
    spo2 = Column(Float, nullable=True)
    respiratory_rate = Column(Float, nullable=True)
    temperature = Column(Float, nullable=True)

    ecg_file = Column(String, nullable=True)

    ai_assessment = Column(Text, nullable=True)
    ai_priority = Column(String, nullable=True)
    ai_recommendation = Column(Text, nullable=True)

    status = Column(
        String,
        default="CREATED",
        nullable=False
    )
    hospital_id = Column(Integer, nullable=True)
    ambulance_latitude = Column(Float, nullable=True)
    ambulance_longitude = Column(Float, nullable=True)
    eta_minutes = Column(Integer, nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )