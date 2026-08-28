from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pathlib import Path
import uuid

from sqlalchemy.orm import Session

from database import get_db
from models.case import EmergencyCase


router = APIRouter(
    prefix="/api/cases",
    tags=["Emergency Files"]
)


UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "application/pdf",
    "text/csv",
}


@router.post("/{case_id}/files")
async def upload_file(
    case_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):

    # =====================================================
    # Check that emergency case exists in SQLite
    # =====================================================

    emergency_case = (
        db.query(EmergencyCase)
        .filter(EmergencyCase.case_id == case_id)
        .first()
    )

    if not emergency_case:
        raise HTTPException(
            status_code=404,
            detail="Emergency case not found"
        )

    # =====================================================
    # Check file type
    # =====================================================

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: JPG, PNG, PDF, CSV"
        )

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No file selected"
        )

    # =====================================================
    # Generate unique file ID
    # =====================================================

    file_id = uuid.uuid4().hex[:10]

    extension = Path(file.filename).suffix.lower()

    stored_filename = f"{file_id}{extension}"

    file_path = UPLOAD_DIR / stored_filename

    # =====================================================
    # Save physical file
    # =====================================================

    contents = await file.read()

    with open(file_path, "wb") as buffer:
        buffer.write(contents)

    # =====================================================
    # Store file information
    # =====================================================

    # For now, store the latest uploaded file path.
    # The full file-history table will be added later.

    emergency_case.ecg_file = str(file_path)

    db.commit()
    db.refresh(emergency_case)

    file_info = {
        "file_id": file_id,
        "original_filename": file.filename,
        "stored_filename": stored_filename,
        "file_path": str(file_path),
        "file_type": file.content_type,
    }

    return {
        "status": "uploaded",
        "case_id": case_id,
        "file": file_info,
        "message": "File uploaded and attached to emergency case"
    }