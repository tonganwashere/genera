from email.mime.text import MIMEText
import smtplib
import ssl
from server import config

def send_otp_email(recipient_email, otp_code):
    if config.SMTP_USER and config.SMTP_PASSWORD:
        try:
            body = f"Your Genera password reset code is: {otp_code}\n\nThis code will expire in 10 minutes."
            msg = MIMEText(body, "plain", "utf-8")
            msg["Subject"] = "Genera Password Reset Code"
            msg["From"] = config.SMTP_FROM
            msg["To"] = recipient_email
            clean_pass = config.SMTP_PASSWORD.replace(" ", "")
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10) as server:
                server.starttls(context=ssl.create_default_context())
                server.login(config.SMTP_USER, clean_pass)
                server.sendmail(config.SMTP_FROM, [recipient_email], msg.as_string())
        except Exception as err:
            print(f"[SMTP ERROR] Failed to send OTP to {recipient_email}: {err}", flush=True)
    else:
        print(f"[AUTH DEV] OTP for {recipient_email}: {otp_code}", flush=True)

def send_verification_email(recipient_email, otp_code):
    if config.SMTP_USER and config.SMTP_PASSWORD:
        try:
            body = f"Your Genera email verification code is: {otp_code}\n\nThis code will expire in 10 minutes."
            msg = MIMEText(body, "plain", "utf-8")
            msg["Subject"] = "Genera Email Verification Code"
            msg["From"] = config.SMTP_FROM
            msg["To"] = recipient_email
            clean_pass = config.SMTP_PASSWORD.replace(" ", "")
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10) as server:
                server.starttls(context=ssl.create_default_context())
                server.login(config.SMTP_USER, clean_pass)
                server.sendmail(config.SMTP_FROM, [recipient_email], msg.as_string())
        except Exception as err:
            print(f"[SMTP ERROR] Failed to send verification to {recipient_email}: {err}", flush=True)
    else:
        print(f"[AUTH DEV] Verification OTP for {recipient_email}: {otp_code}", flush=True)