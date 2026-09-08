import os
from dotenv import load_dotenv
from twilio.rest import Client

load_dotenv()


def send_specialist_sms(phone_number: str, case_id: str, category: str):
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_FROM_NUMBER")

    if not account_sid or not auth_token or not from_number:
        raise RuntimeError("Twilio environment variables are not configured")

    if not phone_number:
        raise ValueError("Specialist phone number is missing")

    client = Client(account_sid, auth_token)

    message = client.messages.create(
        body=(
            f"EmergencySync: Critical {category} case requires your review.\n"
            f"Please open EmergencySync and acknowledge Case {case_id}."
        ),
        from_=from_number,
        to=phone_number
    )

    return message.sidokk