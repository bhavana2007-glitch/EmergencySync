import base64
import logging
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv


logger = logging.getLogger(__name__)
load_dotenv()


class TwilioDeliveryError(RuntimeError):
    """Raised when a configured Twilio SMS cannot be delivered."""


def send_sms(to: str, body: str) -> None:
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_PHONE_NUMBER")

    if not account_sid or not auth_token or not from_number:
        raise TwilioDeliveryError(
            "Twilio SMS is not configured. Set TWILIO_ACCOUNT_SID, "
            "TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER."
        )

    payload = urlencode(
        {
            "To": to,
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
            if response.status < 200 or response.status >= 300:
                raise TwilioDeliveryError(
                    f"Twilio returned HTTP {response.status}."
                )
    except HTTPError as exc:
        raise TwilioDeliveryError(
            f"Twilio returned HTTP {exc.code}."
        ) from exc
    except URLError as exc:
        raise TwilioDeliveryError(
            "Twilio could not be reached."
        ) from exc


def send_specialist_alert_sms(
    *,
    phone: str,
    case_id: str,
    specialty: str,
    severity: str,
) -> None:
    message = (
        "EmergencySync alert: "
        f"{severity.upper()} emergency case {case_id} "
        f"requires {specialty.replace('_', ' ')} specialist review. "
        "Sign in to EmergencySync for clinical details."
    )
    send_sms(phone, message)
