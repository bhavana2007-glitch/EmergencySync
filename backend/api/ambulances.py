from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter(
    prefix="/api/ambulances",
    tags=["Ambulances"],
)


# ============================================================
# ROUTING
# ============================================================

OSRM_URL = "https://router.project-osrm.org/route/v1/driving"


async def calculate_route(
    start_latitude: float,
    start_longitude: float,
    end_latitude: float,
    end_longitude: float,
):
    """
    Calculate a real road route using OSRM.

    Returns:
        distance_km
        duration_minutes
        route_available
    """

    url = (
        f"{OSRM_URL}/"
        f"{start_longitude},{start_latitude};"
        f"{end_longitude},{end_latitude}"
    )

    params = {
        "overview": "false",
        "steps": "false",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                url,
                params=params,
            )

            response.raise_for_status()

            data = response.json()

        routes = data.get("routes", [])

        if not routes:
            return {
                "distance_km": None,
                "duration_minutes": None,
                "route_available": False,
            }

        route = routes[0]

        distance_meters = float(
            route.get("distance", 0)
        )

        duration_seconds = float(
            route.get("duration", 0)
        )

        distance_km = round(
            distance_meters / 1000,
            2,
        )

        duration_minutes = max(
            1,
            round(duration_seconds / 60),
        )

        return {
            "distance_km": distance_km,
            "duration_minutes": duration_minutes,
            "route_available": True,
        }

    except Exception as error:
        print(
            "Route calculation failed:",
            error,
        )

        return {
            "distance_km": None,
            "duration_minutes": None,
            "route_available": False,
        }


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

    # Kept for compatibility with existing frontend.
    # Backend will calculate the ETA.
    eta: Optional[int] = None


class PatientLocationUpdate(BaseModel):
    patient_id: str

    latitude: float
    longitude: float


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

    "distance_km": None,

    "route_available": False,

    "created_at": None,
}


# ============================================================
# INTERNAL ETA CALCULATOR
# ============================================================


async def update_patient_route_eta():
    """
    Recalculate ambulance -> patient route.

    This is called whenever either:
      - patient GPS changes
      - ambulance GPS changes
    """

    ambulance = active_booking.get("ambulance")

    patient_latitude = active_booking.get(
        "patient_latitude"
    )

    patient_longitude = active_booking.get(
        "patient_longitude"
    )

    if ambulance is None:
        return

    ambulance_latitude = ambulance.get(
        "latitude"
    )

    ambulance_longitude = ambulance.get(
        "longitude"
    )

    if (
        ambulance_latitude is None
        or ambulance_longitude is None
        or patient_latitude is None
        or patient_longitude is None
    ):
        return

    route = await calculate_route(
        start_latitude=ambulance_latitude,
        start_longitude=ambulance_longitude,
        end_latitude=patient_latitude,
        end_longitude=patient_longitude,
    )

    active_booking["eta"] = route[
        "duration_minutes"
    ]

    active_booking["distance_km"] = route[
        "distance_km"
    ]

    active_booking["route_available"] = route[
        "route_available"
    ]


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

    active_booking["patient_id"] = (
        booking.patient_id
    )

    active_booking["patient_name"] = (
        booking.patient_name
    )

    active_booking["patient_latitude"] = (
        booking.patient_latitude
    )

    active_booking["patient_longitude"] = (
        booking.patient_longitude
    )

    active_booking["hospital_id"] = (
        booking.hospital_id
    )

    active_booking["hospital_name"] = (
        booking.hospital_name
    )

    active_booking["symptoms"] = booking.symptoms
    active_booking["age"] = booking.age
    active_booking["gender"] = booking.gender

    active_booking["medical_history"] = (
        booking.medical_history
    )

    active_booking["medications"] = (
        booking.medications
    )

    active_booking["allergies"] = (
        booking.allergies
    )

    active_booking["case_id"] = booking.case_id

    active_booking["status"] = (
        "ambulance_requested"
    )

    active_booking["created_at"] = (
        datetime.now().isoformat()
    )

    active_booking["ambulance"] = None

    active_booking["eta"] = None

    active_booking["distance_km"] = None

    active_booking["route_available"] = False

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
        "distance_km": None,
        "route_available": False,
        "hospital": {
            "id": booking.hospital_id,
            "name": booking.hospital_name,
        },
    }


# ============================================================
# PATIENT LIVE LOCATION
# ============================================================


@router.post("/patient-location")
async def update_patient_location(
    location: PatientLocationUpdate,
):

    if active_booking["booking_id"] is None:
        return {
            "success": False,
            "message": "No active ambulance request.",
        }

    if str(active_booking["patient_id"]) != str(
        location.patient_id
    ):
        return {
            "success": False,
            "message": (
                "Patient does not match active booking."
            ),
        }

    active_booking["patient_latitude"] = (
        location.latitude
    )

    active_booking["patient_longitude"] = (
        location.longitude
    )

    # Recalculate ETA if ambulance is already assigned.
    if active_booking["ambulance"] is not None:
        await update_patient_route_eta()

    return {
        "success": True,
        "booking_id": active_booking["booking_id"],
        "patient": {
            "id": active_booking["patient_id"],
            "latitude": active_booking[
                "patient_latitude"
            ],
            "longitude": active_booking[
                "patient_longitude"
            ],
        },
        "eta": active_booking["eta"],
        "distance_km": active_booking[
            "distance_km"
        ],
        "route_available": active_booking[
            "route_available"
        ],
    }
# ============================================================
# ACCEPT AMBULANCE REQUEST
# ============================================================

@router.post("/accept")
async def accept_ambulance(
    assignment: AmbulanceAssignmentRequest,
):
    return await assign_ambulance(assignment)


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
        "vehicle": (
            assignment.vehicle
            or assignment.ambulance_id
        ),
        "driver": (
            assignment.driver
            or "Driver Assigned"
        ),
        "latitude": assignment.latitude,
        "longitude": assignment.longitude,
        "status": "En Route",
    }

    active_booking["status"] = (
        "ambulance_en_route"
    )

    # Calculate initial ETA immediately.
    await update_patient_route_eta()

    return {
        "success": True,
        "booking_id": active_booking["booking_id"],
        "status": active_booking["status"],
        "ambulance": active_booking["ambulance"],
        "eta": active_booking["eta"],
        "distance_km": active_booking[
            "distance_km"
        ],
        "route_available": active_booking[
            "route_available"
        ],
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
            "message": (
                "No ambulance has been assigned yet."
            ),
        }

    if str(
        ambulance["ambulance_id"]
    ) != str(location.ambulance_id):

        return {
            "success": False,
            "message": (
                "Ambulance ID does not match "
                "active booking."
            ),
        }

    ambulance["latitude"] = (
        location.latitude
    )

    ambulance["longitude"] = (
        location.longitude
    )

    # Do not trust ETA from browser.
    ambulance["status"] = (
        location.status or "En Route"
    )

    active_booking["status"] = (
        "ambulance_en_route"
    )

    # IMPORTANT:
    # Calculate ETA from actual GPS + road route.
    await update_patient_route_eta()

    return {
        "success": True,
        "booking_id": active_booking["booking_id"],
        "status": active_booking["status"],
        "ambulance": ambulance,
        "eta": active_booking["eta"],
        "distance_km": active_booking[
            "distance_km"
        ],
        "route_available": active_booking[
            "route_available"
        ],
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
            "distance_km": None,
            "route_available": False,
        }

    return {
        "active": True,

        "booking_id":
            active_booking["booking_id"],

        "status":
            active_booking["status"],

        "ambulance":
            active_booking["ambulance"],

        "eta":
            active_booking["eta"],

        "distance_km":
            active_booking["distance_km"],

        "route_available":
            active_booking["route_available"],

        "patient": {
            "id":
                active_booking["patient_id"],

            "name":
                active_booking["patient_name"],

            "latitude":
                active_booking["patient_latitude"],

            "longitude":
                active_booking["patient_longitude"],
        },

        "hospital": {
            "id":
                active_booking["hospital_id"],

            "name":
                active_booking["hospital_name"],
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