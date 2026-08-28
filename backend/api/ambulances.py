from datetime import datetime
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter(
    prefix="/api/ambulances",
    tags=["Ambulances"],
)


# ============================================================
# REQUEST MODELS
# ============================================================

class AmbulanceBookingRequest(BaseModel):
    patient_id: str
    patient_name: str

    patient_latitude: float
    patient_longitude: float

    hospital_id: str
    hospital_name: str

    # Optional patient information
    symptoms: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    medical_history: Optional[str] = None
    medications: Optional[str] = None
    allergies: Optional[str] = None
    case_id: Optional[str] = None


class AmbulanceAssignmentRequest(BaseModel):
    ambulance_id: str
    vehicle: Optional[str] = None
    driver: Optional[str] = None
    latitude: float
    longitude: float
    eta: Optional[int] = None


class AmbulanceLocationUpdate(BaseModel):
    ambulance_id: str
    latitude: float
    longitude: float
    status: Optional[str] = "En Route"
    eta: Optional[int] = None


# ============================================================
# TEMPORARY ACTIVE BOOKING
# ============================================================

active_booking = {
    "booking_id": None,

    "patient_id": None,
    "patient_name": None,

    "patient_latitude": None,
    "patient_longitude": None,

    "hospital_id": None,
    "hospital_name": None,

    "symptoms": None,
    "age": None,
    "gender": None,
    "medical_history": None,
    "medications": None,
    "allergies": None,
    "case_id": None,

    "status": "idle",

    "ambulance": None,

    "eta": None,

    "created_at": None,
}


# ============================================================
# BOOK AMBULANCE
# ============================================================

@router.post("/book")
async def book_ambulance(
    booking: AmbulanceBookingRequest,
):

    booking_id = (
        f"AMB-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    )

    active_booking["booking_id"] = booking_id

    active_booking["patient_id"] = booking.patient_id
    active_booking["patient_name"] = booking.patient_name

    active_booking["patient_latitude"] = booking.patient_latitude
    active_booking["patient_longitude"] = booking.patient_longitude

    active_booking["hospital_id"] = booking.hospital_id
    active_booking["hospital_name"] = booking.hospital_name

    active_booking["symptoms"] = booking.symptoms
    active_booking["age"] = booking.age
    active_booking["gender"] = booking.gender
    active_booking["medical_history"] = booking.medical_history
    active_booking["medications"] = booking.medications
    active_booking["allergies"] = booking.allergies
    active_booking["case_id"] = booking.case_id

    active_booking["status"] = "ambulance_requested"

    active_booking["created_at"] = datetime.now().isoformat()

    # No ambulance assigned initially
    active_booking["ambulance"] = None
    active_booking["eta"] = None

    return {
        "success": True,
        "booking_id": booking_id,
        "status": "ambulance_requested",
        "message": (
            "Emergency request received. "
            "Searching for an available ambulance."
        ),
        "ambulance": None,
        "eta": None,
        "hospital": {
            "id": booking.hospital_id,
            "name": booking.hospital_name,
        },
    }


# ============================================================
# ASSIGN AMBULANCE
# ============================================================

@router.post("/assign")
async def assign_ambulance(
    assignment: AmbulanceAssignmentRequest,
):

    if active_booking["booking_id"] is None:
        return {
            "success": False,
            "message": "No active ambulance request.",
        }

    active_booking["ambulance"] = {
        "ambulance_id": assignment.ambulance_id,
        "vehicle": assignment.vehicle or assignment.ambulance_id,
        "driver": assignment.driver or "Driver Assigned",
        "latitude": assignment.latitude,
        "longitude": assignment.longitude,
        "status": "Assigned",
    }

    active_booking["status"] = "ambulance_assigned"
    active_booking["eta"] = assignment.eta

    return {
        "success": True,
        "booking_id": active_booking["booking_id"],
        "status": active_booking["status"],
        "ambulance": active_booking["ambulance"],
        "eta": active_booking["eta"],
    }


# ============================================================
# UPDATE AMBULANCE GPS
# ============================================================

@router.post("/location")
async def update_ambulance_location(
    location: AmbulanceLocationUpdate,
):

    ambulance = active_booking["ambulance"]

    if ambulance is None:
        return {
            "success": False,
            "message": "No ambulance has been assigned yet.",
        }

    if str(ambulance["ambulance_id"]) != str(location.ambulance_id):
        return {
            "success": False,
            "message": "Ambulance ID does not match active booking.",
        }

    ambulance["latitude"] = location.latitude
    ambulance["longitude"] = location.longitude
    ambulance["status"] = location.status

    active_booking["status"] = location.status
    active_booking["eta"] = location.eta

    return {
        "success": True,
        "booking_id": active_booking["booking_id"],
        "ambulance": ambulance,
        "eta": active_booking["eta"],
    }


# ============================================================
# GET ACTIVE AMBULANCE
# ============================================================

@router.get("/active")
async def get_active_ambulance():

    if active_booking["booking_id"] is None:
        return {
            "active": False,
            "status": "idle",
            "ambulance": None,
            "eta": None,
        }

    ambulance = active_booking["ambulance"]

    return {
        "active": True,
        "booking_id": active_booking["booking_id"],
        "status": active_booking["status"],
        "ambulance": ambulance,
        "eta": active_booking["eta"],
        "patient": {
            "id": active_booking["patient_id"],
            "name": active_booking["patient_name"],
            "latitude": active_booking["patient_latitude"],
            "longitude": active_booking["patient_longitude"],
        },
        "hospital": {
            "id": active_booking["hospital_id"],
            "name": active_booking["hospital_name"],
        },
    }


# ============================================================
# CANCEL ACTIVE BOOKING
# ============================================================

@router.post("/cancel")
async def cancel_ambulance():

    if active_booking["booking_id"] is None:
        return {
            "success": False,
            "message": "No active ambulance request.",
        }

    booking_id = active_booking["booking_id"]

    active_booking["status"] = "cancelled"

    return {
        "success": True,
        "booking_id": booking_id,
        "status": "cancelled",
    }