import json
import logging
import urllib.error
import urllib.request
from server import config

def send_otp_email(recipient_email, otp_code, purpose="Verification"):
    purpose_lower = purpose.lower()
    if purpose_lower in ("verification", "email verification"):
        dev_purpose = "Verification"
    elif purpose_lower in ("password reset", "reset"):
        dev_purpose = "Password Reset"
    else:
        dev_purpose = purpose

    purpose_title = dev_purpose.title()

    if config.RESEND_API_KEY:
        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {config.RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "Genera/1.0"
        }
        payload = {
            "from": config.EMAIL_FROM,
            "to": [recipient_email],
            "subject": f"Genera {purpose_title} Code",
            "text": f"Your Genera {dev_purpose} code is: {otp_code}\n\nThis code will expire in 10 minutes."
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                res = json.loads(response.read().decode("utf-8"))
                return res if res else True
        except Exception as err:
            logging.warning("Resend email delivery failed: %s", err)
            print(f"[AUTH DEV] {dev_purpose} OTP for {recipient_email}: {otp_code}", flush=True)
            return True

    print(f"[AUTH DEV] {dev_purpose} OTP for {recipient_email}: {otp_code}", flush=True)
    return True