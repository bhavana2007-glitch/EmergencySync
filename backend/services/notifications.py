import base64
import json
import logging
import os
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv


logger = logging.getLogger(__name__)

backend_dir = Path(__file__).resolve().parent.parent
for env_candidate in (
    backend_dir / ".env",
    backend_dir.parent / ".env",
    Path.cwd() / ".env",
):
    if env_candidate.exists():
        load_dotenv(env_candidate, override=False)


def twilio_config_status() -> tuple[bool, bool, bool]:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_PHONE_NUMBER")
    logger.info(
        "Twilio config status: account_sid=%s auth_token=%s from_number=%s",
        bool(account_sid),
        bool(auth_token),
        bool(from_number),
    )
    return bool(account_sid), bool(auth_token), bool(from_number)


class TwilioDeliveryError(RuntimeError):
    """Raised when a configured Twilio SMS or voice alert cannot be delivered."""


def mask_phone_number(phone_number: str) -> str:
    if not phone_number:
        return "unknown"

    digits = re.sub(r"\D", "", phone_number)
    if len(digits) <= 4:
        return "***"
    if len(digits) <= 10:
        return f"{digits[:2]}******{digits[-2:]}"
    return f"{digits[:3]}******{digits[-2:]}"


def normalize_phone_number(phone_number: str) -> str:
    if not phone_number:
        return ""

    cleaned = re.sub(r"\s+", "", phone_number.strip())
    if not cleaned:
        return ""

    if cleaned.startswith("+"):
        digits = re.sub(r"\D", "", cleaned)
        return f"+{digits}" if digits else ""

    digits = re.sub(r"\D", "", cleaned)
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    if digits:
        return f"+{digits}"
    return ""


def send_sms(to: str, body: str) -> None:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_PHONE_NUMBER")

    if not account_sid or not auth_token or not from_number:
        raise TwilioDeliveryError(
            "Twilio SMS is not configured. Set TWILIO_ACCOUNT_SID, "
            "TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER."
        )

    normalized_to = normalize_phone_number(to)
    if not normalized_to:
        raise TwilioDeliveryError("Recipient phone number is missing or invalid.")

    logger.info(
        "Sending Twilio SMS to %s via %s",
        mask_phone_number(normalized_to),
        from_number,
    )

    payload = urlencode(
        {
            "To": normalized_to,
            "From": from_number,
            "Body": body,
        }
    ).encode("utf-8")
    credentials = base64.b64encode(
        f"{account_sid}:{auth_token}".encode("utf-8")
    ).decode("ascii")
    request = Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
        data=payload,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=10) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            if response.status < 200 or response.status >= 300:
                raise TwilioDeliveryError(
                    f"Twilio returned HTTP {response.status}. Body: {response_body}"
                )

            payload_json = json.loads(response_body) if response_body else {}
            sid = payload_json.get("sid")
            status = payload_json.get("status")
            logger.info(
                "Twilio SMS success: sid=%s status=%s to=%s",
                sid,
                status,
                mask_phone_number(normalized_to),
            )
            return
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace") if hasattr(exc, "read") else ""
        logger.exception(
            "Twilio SMS failed for %s. HTTP %s. Body: %s",
            mask_phone_number(normalized_to),
            exc.code,
            error_body,
        )
        raise TwilioDeliveryError(
            f"Twilio returned HTTP {exc.code}. Body: {error_body}"
        ) from exc
    except URLError as exc:
        logger.exception(
            "Twilio SMS could not be reached for %s. Error: %s",
            mask_phone_number(normalized_to),
            exc,
        )
        raise TwilioDeliveryError(
            "Twilio could not be reached."
        ) from exc
    except json.JSONDecodeError:
        logger.exception(
            "Twilio SMS response was not valid JSON for %s.",
            mask_phone_number(normalized_to),
        )
        raise TwilioDeliveryError(
            "Twilio SMS returned a malformed response."
        )


def send_specialist_alert_sms(
    *,
    phone: str,
    case_id: str,
    specialty: str,
    severity: str,
) -> None:
    logger.info(
        "Dispatching SMS for case %s to specialist %s (%s) with severity %s",
        case_id,
        mask_phone_number(phone),
        specialty,
        severity,
    )
    message = (
        "EmergencySync alert. "
        f"A {severity.lower()} emergency case requires your immediate specialist review. "
        "Please log into EmergencySync to review and acknowledge the case."
    )
    send_sms(phone, message)


def send_specialist_alert_call(
    *,
    phone_number: str,
    specialty: str,
    severity: str,
    case_id: str,
) -> None:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_PHONE_NUMBER")

    if not account_sid or not auth_token or not from_number:
        raise TwilioDeliveryError(
            "Twilio voice is not configured. Set TWILIO_ACCOUNT_SID, "
            "TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER."
        )

    to_number = normalize_phone_number(phone_number)
    if not to_number:
        raise TwilioDeliveryError("Specialist phone number is missing or invalid.")

    logger.info(
        "Dispatching voice call for case %s to specialist %s (%s) with severity %s",
        case_id,
        mask_phone_number(to_number),
        specialty,
        severity,
    )

    twiml = (
        "<Response>"
        "<Say voice='alice'>"
        "EmergencySync alert. A "
        f"{severity.lower()} emergency case requires your immediate specialist review. "
        "Please log into EmergencySync to review and acknowledge the case."
        "</Say>"
        "</Response>"
    )
    payload = urlencode(
        {
            "To": to_number,
            "From": from_number,
            "Twiml": twiml,
        }
    ).encode("utf-8")
    credentials = base64.b64encode(
        f"{account_sid}:{auth_token}".encode("utf-8")
    ).decode("ascii")
    request = Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Calls.json",
        data=payload,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=10) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            if response.status < 200 or response.status >= 300:
                raise TwilioDeliveryError(
                    f"Twilio returned HTTP {response.status}. Body: {response_body}"
                )
            payload_json = json.loads(response_body) if response_body else {}
            sid = payload_json.get("sid")
            status = payload_json.get("status")
            logger.info(
                "Twilio voice success: sid=%s status=%s to=%s",
                sid,
                status,
                mask_phone_number(to_number),
            )
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace") if hasattr(exc, "read") else ""
        logger.exception(
            "Twilio voice failed for %s. HTTP %s. Body: %s",
            mask_phone_number(to_number),
            exc.code,
            error_body,
        )
        raise TwilioDeliveryError(
            f"Twilio returned HTTP {exc.code}. Body: {error_body}"
        ) from exc
    except URLError as exc:
        logger.exception(
            "Twilio voice could not be reached for %s. Error: %s",
            mask_phone_number(to_number),
            exc,
        )
        raise TwilioDeliveryError(
            "Twilio could not be reached."
        ) from exc
    except json.JSONDecodeError:
        logger.exception(
            "Twilio voice response was not valid JSON for %s.",
            mask_phone_number(to_number),
        )
        raise TwilioDeliveryError(
            "Twilio voice returned a malformed response."
        )
