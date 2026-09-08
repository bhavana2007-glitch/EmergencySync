from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth import get_current_user
from database import get_db
from models.push_subscription import PushSubscription
from models.user import User
from services.push_notifications import vapid_public_key_urlsafe


router = APIRouter(prefix="/api/push", tags=["Browser Push"])


class PushSubscriptionRequest(BaseModel):
    endpoint: str
    keys: dict[str, str]


@router.get("/vapid-public-key")
def get_vapid_public_key():
    public_key = vapid_public_key_urlsafe()
    if not public_key:
        raise HTTPException(
            status_code=503,
            detail="Browser push is not configured.",
        )
    return {"public_key": public_key}


router = APIRouter(prefix="/api/push", tags=["Browser Push"])


class PushSubscriptionRequest(BaseModel):
    endpoint: str
    keys: dict[str, str]


@router.post("/subscribe")
def subscribe(
    data: PushSubscriptionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"ambulance", "specialist"}:
        raise HTTPException(
            status_code=403,
            detail="Push notifications are not available for this role.",
        )
    p256dh = data.keys.get("p256dh")
    auth = data.keys.get("auth")
    if not data.endpoint or not p256dh or not auth:
        raise HTTPException(status_code=400, detail="Invalid push subscription.")

    subscription = (
        db.query(PushSubscription)
        .filter(PushSubscription.endpoint == data.endpoint)
        .first()
    )
    if subscription is None:
        subscription = PushSubscription(
            endpoint=data.endpoint,
            user_id=current_user.id,
            p256dh=p256dh,
            auth=auth,
        )
        db.add(subscription)
    else:
        subscription.user_id = current_user.id
        subscription.p256dh = p256dh
        subscription.auth = auth

    db.commit()
    return {"success": True}


@router.delete("/subscribe")
def unsubscribe(
    data: PushSubscriptionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"ambulance", "specialist"}:
        return {"success": False, "message": "Push notifications are not available for this role."}
    db.query(PushSubscription).filter(
        PushSubscription.endpoint == data.endpoint,
        PushSubscription.user_id == current_user.id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True}
