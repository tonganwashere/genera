from email.mime.text import MIMEText
import json
import smtplib
import ssl
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
            "Content-Type": "application/json"
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
        except Exception:
            print(f"[AUTH DEV] {dev_purpose} OTP for {recipient_email}: {otp_code}", flush=True)
            return True

    elif config.SMTP_USER and config.SMTP_PASSWORD:
        try:
            body = f"Your Genera {dev_purpose} code is: {otp_code}\n\nThis code will expire in 10 minutes."
            msg = MIMEText(body, "plain", "utf-8")
            msg["Subject"] = f"Genera {purpose_title} Code"
            msg["From"] = config.SMTP_FROM
            msg["To"] = recipient_email
            clean_pass = config.SMTP_PASSWORD.replace(" ", "")
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10) as server:
                server.starttls(context=ssl.create_default_context())
                server.login(config.SMTP_USER, clean_pass)
                server.sendmail(config.SMTP_FROM, [recipient_email], msg.as_string())
            return {"status": "sent"}
        except Exception:
            print(f"[AUTH DEV] {dev_purpose} OTP for {recipient_email}: {otp_code}", flush=True)
            return True

    else:
        print(f"[AUTH DEV] {dev_purpose} OTP for {recipient_email}: {otp_code}", flush=True)
        return True

def send_verification_email(recipient_email, otp_code):
    return send_otp_email(recipient_email, otp_code, purpose="Verification")