from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from database import Base


class SpecialistAlert(Base):
    __tablename__ = "specialist_alerts"

    id = Column(Integer, primary_key=True)
    case_id = Column(String, index=True, nullable=False)
    category = Column(String, nullable=False)
    target_specialty = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    acknowledged = Column(Boolean, default=False, nullable=False)
    acknowledged_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
