from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models.hospital import Hospital
from models.case import EmergencyCase

import httpx
import asyncio


router = APIRouter(
    prefix="/api/hospitals",
    tags=["Hospitals"]
)


# =========================================================
# NOMINATIM / OPENSTREETMAP
# =========================================================

NOMINATIM_URL = (
    "https://nominatim.openstreetmap.org/search"
)

# Chennai bounding box
#
# west, south, east, north
#
CHENNAI_VIEWBOX = (
    "79.90,13.30,80.40,12.75"
)


# =========================================================
# SEARCH NOMINATIM
# =========================================================

async def nominatim_search(
    query: str,
    limit: int = 40
):

    params = {
    "q": query,
    "format": "jsonv2",
    "addressdetails": 1,
    "limit": limit,
    "countrycodes": "in",
}
    headers = {
        "User-Agent":
            "EmergencySync/1.0 "
            "(hospital emergency coordination project)"
    }

    try:

        async with httpx.AsyncClient(
            timeout=30.0,
            headers=headers
        ) as client:

            response = await client.get(
                NOMINATIM_URL,
                params=params
            )

            response.raise_for_status()

            return response.json()

    except Exception as error:

        print(
            "Nominatim search failed:",
            error
        )

        return []


# =========================================================
# CONVERT NOMINATIM RESULT
# =========================================================

def convert_nominatim_result(
    result
):

    name = (
        result.get("name")
        or result.get("display_name", "").split(",")[0]
    )

    if not name:
        return None

    try:

        latitude = float(
            result["lat"]
        )

        longitude = float(
            result["lon"]
        )

    except (
        KeyError,
        TypeError,
        ValueError
    ):

        return None

    address = result.get(
        "display_name",
        "Chennai"
    )

    address_data = result.get(
        "address",
        {}
    )

    # Make sure it belongs to Chennai region
    address_text = (
        address + " " +
        str(
            address_data.get(
                "city",
                ""
            )
        ) + " " +
        str(
            address_data.get(
                "state",
                ""
            )
        )
    ).lower()

    # Chennai / Tamil Nadu validation
    if (
        "chennai" not in address_text
        and "tamil nadu" not in address_text
    ):
        return None

    # OSM information
    osm_type = result.get(
        "osm_type",
        ""
    )

    osm_id = result.get(
        "osm_id",
        ""
    )

    hospital_id = (
        f"osm-{osm_type}-{osm_id}"
    )

    return {

        "id":
            hospital_id,

        "name":
            name.strip(),

        "address":
            address,

        "latitude":
            latitude,

        "longitude":
            longitude,

        "emergency_available":
            True,

        "specialties":
            "",

        "phone":
            "",

        "website":
            "",

        "hospital_type":
            result.get(
                "type",
                "hospital"
            )
    }


# =========================================================
# GET CHENNAI HOSPITALS
# =========================================================

async def fetch_chennai_hospitals(
    search: str = ""
):

    hospitals = {}

    # -----------------------------------------------------
    # SEARCH QUERIES
    # -----------------------------------------------------
    #
    # If user types something:
    #
    # "apollo"
    #
    # we search:
    #
    # "apollo hospital Chennai"
    #
    # If nothing is typed, we make several broad searches.
    #
    # Nominatim is a search service, not a complete
    # hospital registry, so multiple queries improve coverage.
    # -----------------------------------------------------

    if search.strip():

        search_text = (
            search.strip()
        )

        queries = [
            f"{search_text} hospital Chennai",
            f"{search_text} hospital",
            f"{search_text} Chennai hospital"
        ]

    else:

        queries = [

            "hospital Chennai",

            "hospitals Chennai",

            "medical hospital Chennai",

            "multispeciality hospital Chennai",

            "government hospital Chennai",

            "private hospital Chennai",

            "emergency hospital Chennai",

            "medical centre Chennai",

            "medical center Chennai"
        ]

    # -----------------------------------------------------
    # QUERY NOMINATIM
    # -----------------------------------------------------

    for query in queries:

        print(
            f"Searching Nominatim: {query}"
        )

        results = await nominatim_search(
            query,
            limit=40
        )

        # -------------------------------------------------
        # PROCESS RESULTS
        # -------------------------------------------------

        for result in results:

            hospital = (
                convert_nominatim_result(
                    result
                )
            )

            if hospital is None:
                continue

            # -------------------------------------------------
            # FILTER NON-HOSPITAL RESULTS
            # -------------------------------------------------

            result_text = (
                (
                    hospital["name"]
                    + " "
                    + hospital["address"]
                )
                .lower()
            )

            hospital_keywords = [
                "hospital",
                "medical",
                "health",
                "clinic",
                "care",
                "nursing"
            ]

            is_hospital = any(
                keyword in result_text
                for keyword in hospital_keywords
            )

            if not is_hospital:
                continue

            # -------------------------------------------------
            # DEDUPLICATE
            # -------------------------------------------------

            key = (
                hospital["name"]
                .strip()
                .lower()
                + "_"
                + str(
                    round(
                        hospital["latitude"],
                        5
                    )
                )
                + "_"
                + str(
                    round(
                        hospital["longitude"],
                        5
                    )
                )
            )

            hospitals[key] = hospital

        # -------------------------------------------------
        # Respect public Nominatim service
        # -------------------------------------------------
        #
        # Don't hammer the service with rapid requests.
        #
        await asyncio.sleep(1)

    # =====================================================
    # SORT
    # =====================================================

    hospital_list = list(
        hospitals.values()
    )

    hospital_list.sort(
        key=lambda hospital:
            hospital["name"].lower()
    )

    print(
        f"Total Chennai hospital "
        f"results found: "
        f"{len(hospital_list)}"
    )

    return hospital_list


# =========================================================
# GET HOSPITALS
# =========================================================

@router.get("/")
async def get_hospitals(

    district: str = Query(
        default="Chennai"
    ),

    search: str = Query(
        default=""
    ),

    db: Session = Depends(get_db)
):

    # =====================================================
    # CHENNAI
    # =====================================================

    if district.strip().lower() == "chennai":

        hospitals = (
            await fetch_chennai_hospitals(
                search
            )
        )

        # -------------------------------------------------
        # DO NOT FALL BACK TO THE 3 DATABASE HOSPITALS
        # -------------------------------------------------

        if not hospitals:

            return {

                "status":
                    "success",

                "district":
                    "Chennai",

                "count":
                    0,

                "hospitals":
                    [],

                "message":
                    (
                        "No Chennai hospitals "
                        "were found for this search."
                    )
            }

    else:

        # =================================================
        # OTHER DISTRICTS
        # =================================================

        hospitals_db = (
            db.query(Hospital)
            .all()
        )

        hospitals = [

            {

                "id":
                    hospital.id,

                "name":
                    hospital.name,

                "address":
                    hospital.address,

                "latitude":
                    hospital.latitude,

                "longitude":
                    hospital.longitude,

                "emergency_available":
                    hospital.emergency_available,

                "specialties":
                    hospital.specialties,

                "phone":
                    "",

                "website":
                    "",

                "hospital_type":
                    "hospital"
            }

            for hospital in hospitals_db
        ]

    # =====================================================
    # FINAL SEARCH FILTER
    # =====================================================

    if search.strip():

        search_text = (
            search.strip().lower()
        )

        hospitals = [

            hospital

            for hospital in hospitals

            if (
                search_text
                in hospital[
                    "name"
                ].lower()
            )

            or (
                search_text
                in hospital.get(
                    "address",
                    ""
                ).lower()
            )
        ]

    # =====================================================
    # RESPONSE
    # =====================================================

    return {

        "status":
            "success",

        "district":
            district,

        "count":
            len(hospitals),

        "hospitals":
            hospitals
    }


# =========================================================
# GET INCOMING EMERGENCY CASES
# =========================================================

@router.get(
    "/{hospital_id}/emergency-cases"
)
async def get_hospital_emergency_cases(

    hospital_id: int,

    db: Session = Depends(get_db)
):

    cases = (

        db.query(
            EmergencyCase
        )

        .filter(
            EmergencyCase.hospital_id
            == hospital_id
        )

        .all()
    )

    return {

        "status":
            "success",

        "hospital_id":
            hospital_id,

        "cases": [

            {

                "case_id":
                    case.case_id,

                "patient_name":
                    case.patient_name,

                "age":
                    case.patient_age,

                "gender":
                    case.patient_gender,

                "symptoms":
                    case.symptoms,

                "heart_rate":
                    case.heart_rate,

                "systolic_bp":
                    case.systolic_bp,

                "diastolic_bp":
                    case.diastolic_bp,

                "spo2":
                    case.spo2,

                "respiratory_rate":
                    case.respiratory_rate,

                "temperature":
                    case.temperature,

                "ai_priority":
                    case.ai_priority,

                "ai_recommendation":
                    case.ai_recommendation,

                "status":
                    case.status,

                "created_at":
                    case.created_at.isoformat()
            }

            for case in cases
        ]
    }


# =========================================================
# AMBULANCE / CASE TRACKING
# =========================================================

@router.get(
    "/{hospital_id}/emergency-cases/{case_id}/tracking"
)
async def get_ambulance_tracking(

    hospital_id: int,

    case_id: str,

    db: Session = Depends(get_db)
):

    emergency_case = (

        db.query(
            EmergencyCase
        )

        .filter(

            EmergencyCase.case_id
            == case_id,

            EmergencyCase.hospital_id
            == hospital_id

        )

        .first()
    )

    if not emergency_case:

        raise HTTPException(
            status_code=404,
            detail=(
                "Emergency case not found "
                "for this hospital"
            )
        )

    return {

        "case_id":
            case_id,

        "hospital_id":
            hospital_id,

        "ambulance_location": {

            "latitude":
                emergency_case.ambulance_latitude,

            "longitude":
                emergency_case.ambulance_longitude
        },

        "eta_minutes":
            emergency_case.eta_minutes,

        "case_status":
            emergency_case.status
    }


# =========================================================
# CRITICAL ALERTS
# =========================================================

@router.get(
    "/{hospital_id}/critical-alerts"
)
async def get_critical_alerts(

    hospital_id: int,

    db: Session = Depends(get_db)
):

    cases = (

        db.query(
            EmergencyCase
        )

        .filter(

            EmergencyCase.hospital_id
            == hospital_id,

            EmergencyCase.ai_priority
            == "CRITICAL"

        )

        .order_by(
            EmergencyCase.created_at.desc()
        )

        .all()
    )

    critical_cases = []

    for case in cases:

        critical_cases.append({

            "case_id":
                case.case_id,

            "patient_name":
                getattr(
                    case,
                    "patient_name",
                    None
                ),

            "age":
                getattr(
                    case,
                    "age",
                    None
                ),

            "gender":
                getattr(
                    case,
                    "gender",
                    None
                ),

            "ai_priority":
                getattr(
                    case,
                    "ai_priority",
                    None
                ),

            "ai_recommendation":
                getattr(
                    case,
                    "ai_recommendation",
                    None
                ),

            "heart_rate":
                getattr(
                    case,
                    "heart_rate",
                    None
                ),

            "spo2":
                getattr(
                    case,
                    "spo2",
                    None
                ),

            "systolic_bp":
                getattr(
                    case,
                    "systolic_bp",
                    None
                ),

            "diastolic_bp":
                getattr(
                    case,
                    "diastolic_bp",
                    None
                ),

            "ambulance_latitude":
                getattr(
                    case,
                    "ambulance_latitude",
                    None
                ),

            "ambulance_longitude":
                getattr(
                    case,
                    "ambulance_longitude",
                    None
                ),

            "eta_minutes":
                getattr(
                    case,
                    "eta_minutes",
                    None
                ),

            "status":
                getattr(
                    case,
                    "status",
                    None
                ),

            "created_at":
                getattr(
                    case,
                    "created_at",
                    None
                )
        })

    return {

        "status":
            "success",

        "hospital_id":
            hospital_id,

        "critical_cases":
            critical_cases
    }


# =========================================================
# ACKNOWLEDGE EMERGENCY
# =========================================================

@router.patch(
    "/{hospital_id}/emergency-cases/{case_id}/acknowledge"
)
async def acknowledge_emergency(

    hospital_id: int,

    case_id: str,

    db: Session = Depends(get_db)
):

    emergency_case = (

        db.query(
            EmergencyCase
        )

        .filter(

            EmergencyCase.case_id
            == case_id,

            EmergencyCase.hospital_id
            == hospital_id

        )

        .first()
    )

    if not emergency_case:

        raise HTTPException(
            status_code=404,
            detail=(
                "Emergency case not found "
                "for this hospital"
            )
        )

    emergency_case.status = (
        "hospital_acknowledged"
    )

    db.commit()

    db.refresh(
        emergency_case
    )

    return {

        "status":
            "success",

        "case_id":
            case_id,

        "hospital_id":
            hospital_id,

        "case_status":
            emergency_case.status,

        "message":
            "Emergency case acknowledged by hospital"
    }


# =========================================================
# PREPARE HOSPITAL
# =========================================================

@router.post(
    "/{hospital_id}/emergency-cases/{case_id}/prepare"
)
async def prepare_emergency(

    hospital_id: int,

    case_id: str,

    db: Session = Depends(get_db)
):

    emergency_case = (

        db.query(
            EmergencyCase
        )

        .filter(

            EmergencyCase.case_id
            == case_id,

            EmergencyCase.hospital_id
            == hospital_id

        )

        .first()
    )

    if not emergency_case:

        raise HTTPException(
            status_code=404,
            detail=(
                "Emergency case not found "
                "for this hospital"
            )
        )

    emergency_case.status = (
        "hospital_preparing"
    )

    db.commit()

    db.refresh(
        emergency_case
    )

    return {

        "status":
            "success",

        "case_id":
            case_id,

        "hospital_id":
            hospital_id,

        "case_status":
            emergency_case.status,

        "notification": {

            "emergency_team":
                "notified",

            "specialist_team":
                "notified",

            "emergency_room":
                "preparing",

            "equipment":
                "being_prepared"
        },

        "message":
            (
                "Hospital emergency team notified "
                "and preparation started"
            )
    }


# =========================================================
# EMERGENCY NOTIFICATION
# =========================================================

@router.get(
    "/{hospital_id}/emergency-cases/{case_id}/notification"
)
async def get_emergency_notification(

    hospital_id: int,

    case_id: str,

    db: Session = Depends(get_db)
):

    emergency_case = (

        db.query(
            EmergencyCase
        )

        .filter(

            EmergencyCase.case_id
            == case_id,

            EmergencyCase.hospital_id
            == hospital_id

        )

        .first()
    )

    if not emergency_case:

        raise HTTPException(
            status_code=404,
            detail=(
                "Emergency case not found "
                "for this hospital"
            )
        )

    priority = (
        emergency_case.ai_priority
        or "UNKNOWN"
    )

    if priority == "CRITICAL":

        alert_level = "CRITICAL"

        message = (
            "Critical emergency patient incoming. "
            "Prepare emergency team immediately."
        )

    elif priority == "HIGH":

        alert_level = "HIGH"

        message = (
            "High-priority emergency patient incoming. "
            "Prepare medical team."
        )

    else:

        alert_level = "NORMAL"

        message = (
            "Emergency case received. "
            "Review patient information."
        )

    return {

        "status":
            "success",

        "hospital_id":
            hospital_id,

        "case_id":
            case_id,

        "alert": {

            "level":
                alert_level,

            "message":
                message,

            "priority":
                priority,

            "patient_name":
                getattr(
                    emergency_case,
                    "patient_name",
                    None
                ),

            "eta_minutes":
                getattr(
                    emergency_case,
                    "eta_minutes",
                    None
                )
        }
    }