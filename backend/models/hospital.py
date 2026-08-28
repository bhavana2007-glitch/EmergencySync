from sqlalchemy import Column, Integer, String, Float

from database import Base


class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)
    address = Column(String, nullable=False)

    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    emergency_available = Column(
        String,
        default="yes",
        nullable=False
    )

    specialties = Column(String, nullable=True)