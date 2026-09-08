import json
import logging
import os
import re
import base64
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from py_vapid import Vapid
from sqlalchemy.orm import Session

from models.push_subscription import PushSubscription


logger = logging.getLogger(__name__)

backend_dir = Path(__file__).resolve().parent.parent
for env_candidate in (
    backend_dir / ".env",
    backend_dir.parent / ".env",
    Path.cwd() / ".env",
):
    if env_candidate.exists():
        load_dotenv(env_candidate, override=False)


def vapid_public_key_urlsafe() -> str | None:
    configured = os.getenv("VAPID_PUBLIC_KEY", "").strip()
    if configured and "BEGIN" not in configured:
        return configured

    pem_path = backend_dir / "public_key.pem"
    if not pem_path.exists():
        return None

    try:
        from cryptography.hazmat.primitives.serialization import load_pem_public_key

        public_key = load_pem_public_key(pem_path.read_bytes())
        numbers = public_key.public_numbers()
        raw = b"\x04" + numbers.x.to_bytes(32, "big") + numbers.y.to_bytes(32, "big")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    except Exception:
        logger.exception("Unable to derive VAPID public key from public_key.pem")
        return None


def _vapid_configured() -> bool:
    return all(
        os.getenv(name)
        for name in (
            "VAPID_PRIVATE_KEY",
            "VAPID_CLAIM_EMAIL",
        )
    )


def _vapid_private_key_for_webpush() -> str | None:
    value = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    if not value:
        return None

    if "-----BEGIN" in value and "-----END" not in value:
        env_path = backend_dir / ".env"
        if env_path.exists():
            env_text = env_path.read_text(encoding="utf-8")
            match = re.search(
                r"VAPID_PRIVATE_KEY=(.*?-----END [^-]+-----)",
                env_text,
                flags=re.DOTALL,
            )
            if match:
                value = match.group(1).strip()

    if "-----BEGIN" in value:
        vapid = Vapid.from_pem(value.encode("utf-8"))
        private_number = vapid.private_key.private_numbers().private_value
        private_bytes = private_number.to_bytes(32, "big")
        return base64.urlsafe_b64encode(private_bytes).decode("ascii").rstrip("=")

    Vapid.from_string(value)
    return value


def send_push(subscription: PushSubscription, payload: dict[str, Any]) -> bool:
    sent, _ = _send_push(subscription, payload)
    return sent


def _send_push(
    subscription: PushSubscription,
    payload: dict[str, Any],
) -> tuple[bool, bool]:
    if not _vapid_configured():
        logger.warning(
            "Web Push is not configured; set VAPID_PRIVATE_KEY and VAPID_CLAIM_EMAIL."
        )
        return False, False

    try:
        from pywebpush import WebPushException, webpush
        private_key = _vapid_private_key_for_webpush()
        if not private_key:
            return False, False

        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                },
            },
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims={"sub": os.environ["VAPID_CLAIM_EMAIL"]},
        )
        logger.info(
            "Web Push notification sent to user_id=%s",
            subscription.user_id,
        )
        return True, False
    except ImportError:
        logger.error(
            "Web Push dependency is unavailable; install backend requirements."
        )
        return False, False
    except WebPushException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        logger.warning(
            "Web Push delivery failed for user_id=%s: %s",
            subscription.user_id,
            exc,
        )
        return False, status_code in {404, 410}


def send_push_to_users(
    db: Session,
    user_ids: list[int],
    payload: dict[str, Any],
) -> None:
    if not user_ids:
        return

    subscriptions = (
        db.query(PushSubscription)
        .filter(PushSubscription.user_id.in_(user_ids))
        .all()
    )
    if not subscriptions:
        logger.warning(
            "No browser push subscriptions found for user_ids=%s",
            user_ids,
        )
        return
    stale_ids: list[int] = []
    for subscription in subscriptions:
        try:
            _, stale = _send_push(subscription, payload)
        except Exception as exc:
            logger.warning(
                "Web Push delivery failed for user_id=%s (%s); continuing booking flow.",
                subscription.user_id,
                type(exc).__name__,
            )
            continue
        if stale:
            stale_ids.append(subscription.id)
    if stale_ids:
        db.query(PushSubscription).filter(
            PushSubscription.id.in_(stale_ids)
        ).delete(synchronize_session=False)
        db.commit()
