from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status
)

from fastapi.security import (
    HTTPBearer,
    HTTPAuthorizationCredentials
)

from pydantic import BaseModel, EmailStr

from sqlalchemy.orm import Session

from database import get_db
from models.user import User

from services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token
)


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)


security = HTTPBearer()


# =========================================================
# ALLOWED ROLES
# =========================================================

ALLOWED_ROLES = {
    "patient",
    "nurse",
    "ambulance",
    "specialist",
    "doctor",
    "hospital"
}


# =========================================================
# REQUEST MODELS
# =========================================================

class RegisterRequest(BaseModel):

    full_name: str

    email: EmailStr

    password: str

    role: str

    phone: Optional[str] = None

    hospital_id: Optional[int] = None

    specialty: Optional[str] = None


class LoginRequest(BaseModel):

    email: EmailStr

    password: str


# =========================================================
# REGISTER
# =========================================================

@router.post("/register")
def register(
    data: RegisterRequest,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # NORMALIZE ROLE
    # -----------------------------------------------------

    role = data.role.lower().strip()


    # -----------------------------------------------------
    # CHECK ROLE
    # -----------------------------------------------------

    if role not in ALLOWED_ROLES:

        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid role",
                "allowed_roles": sorted(
                    list(ALLOWED_ROLES)
                )
            }
        )


    # -----------------------------------------------------
    # CHECK EXISTING USER
    # -----------------------------------------------------

    existing_user = (
        db.query(User)
        .filter(
            User.email == data.email.lower()
        )
        .first()
    )

    if existing_user:

        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists"
        )


    # -----------------------------------------------------
    # PASSWORD VALIDATION
    # -----------------------------------------------------

    if len(data.password) < 8:

        raise HTTPException(
            status_code=400,
            detail="Password must contain at least 8 characters"
        )


    # =====================================================
    # ROLE-SPECIFIC VALIDATION
    # =====================================================

    # -----------------------------------------------------
    # MEDICAL / EMERGENCY STAFF
    # -----------------------------------------------------

    staff_roles = {
        "nurse",
        "ambulance",
        "specialist",
        "doctor"
    }


    if role in staff_roles:

        if not data.hospital_id:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Hospital ID is required "
                    "for this role"
                )
            )


    # -----------------------------------------------------
    # SPECIALIST
    # -----------------------------------------------------

    if role == "specialist":

        if not data.specialty:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Specialty is required "
                    "for specialist accounts"
                )
            )


    # -----------------------------------------------------
    # DOCTOR
    # -----------------------------------------------------

    if role == "doctor":

        if not data.specialty:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Specialty is required "
                    "for doctor accounts"
                )
            )


    # -----------------------------------------------------
    # HOSPITAL
    # -----------------------------------------------------

    # Hospital accounts represent the receiving hospital.
    # Hospital ID is NOT required when creating the
    # hospital account itself.


    # =====================================================
    # CREATE USER
    # =====================================================

    user = User(

        full_name=data.full_name.strip(),

        email=data.email.lower(),

        password_hash=hash_password(
            data.password
        ),

        role=role,

        phone=data.phone,

        hospital_id=data.hospital_id,

        specialty=(
            data.specialty.strip()
            if data.specialty
            else None
        ),

        availability=(
            "available"
            if role in {
                "nurse",
                "ambulance",
                "specialist",
                "doctor",
                "hospital"
            }
            else "offline"
        ),

        is_active=True
    )


    # -----------------------------------------------------
    # SAVE USER
    # -----------------------------------------------------

    db.add(user)

    db.commit()

    db.refresh(user)


    # -----------------------------------------------------
    # RESPONSE
    # -----------------------------------------------------

    return {

        "message": "Account created successfully",

        "user": {

            "id": user.id,

            "full_name": user.full_name,

            "email": user.email,

            "role": user.role,

            "phone": user.phone,

            "hospital_id": user.hospital_id,

            "specialty": user.specialty,

            "availability": user.availability
        }
    }


# =========================================================
# LOGIN
# =========================================================

@router.post("/login")
def login(
    data: LoginRequest,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    user = (
        db.query(User)
        .filter(
            User.email == data.email.lower()
        )
        .first()
    )


    # -----------------------------------------------------
    # USER NOT FOUND
    # -----------------------------------------------------

    if not user:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )


    # -----------------------------------------------------
    # ACCOUNT ACTIVE CHECK
    # -----------------------------------------------------

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive"
        )


    # -----------------------------------------------------
    # PASSWORD CHECK
    # -----------------------------------------------------

    if not verify_password(
        data.password,
        user.password_hash
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )


    # -----------------------------------------------------
    # CREATE JWT
    # -----------------------------------------------------

    token = create_access_token(
        user_id=user.id,
        role=user.role
    )


    # -----------------------------------------------------
    # LOGIN RESPONSE
    # -----------------------------------------------------

    return {

        "message": "Login successful",

        "access_token": token,

        "token_type": "bearer",

        "user": {

            "id": user.id,

            "full_name": user.full_name,

            "email": user.email,

            "role": user.role,

            "phone": user.phone,

            "hospital_id": user.hospital_id,

            "specialty": user.specialty,

            "availability": user.availability
        }
    }


# =========================================================
# AUTHENTICATED USER
# =========================================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
    db: Session = Depends(get_db)
):

    token = credentials.credentials


    # -----------------------------------------------------
    # DECODE TOKEN
    # -----------------------------------------------------

    try:

        payload = decode_access_token(token)

        user_id = payload.get("sub")

        if not user_id:

            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token"
            )

    except Exception:

        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token"
        )


    # -----------------------------------------------------
    # FIND USER
    # -----------------------------------------------------

    try:

        user_id_int = int(user_id)

    except (TypeError, ValueError):

        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token"
        )


    user = (
        db.query(User)
        .filter(
            User.id == user_id_int
        )
        .first()
    )


    # -----------------------------------------------------
    # USER NOT FOUND
    # -----------------------------------------------------

    if not user:

        raise HTTPException(
            status_code=401,
            detail="Authenticated user not found"
        )


    # -----------------------------------------------------
    # ACCOUNT ACTIVE CHECK
    # -----------------------------------------------------

    if not user.is_active:

        raise HTTPException(
            status_code=403,
            detail="User account is inactive"
        )


    return user


# =========================================================
# CURRENT USER DETAILS
# =========================================================

@router.get("/me")
def get_me(
    current_user: User = Depends(
        get_current_user
    )
):

    return {

        "authenticated": True,

        "user": {

            "id": current_user.id,

            "full_name": current_user.full_name,

            "email": current_user.email,

            "role": current_user.role,

            "phone": current_user.phone,

            "hospital_id": current_user.hospital_id,

            "specialty": current_user.specialty,

            "availability": current_user.availability
        }
    }