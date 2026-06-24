import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def send_email(to_email: str, subject: str, html_body: str):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_email = os.getenv("SMTP_EMAIL")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from_name = os.getenv("SMTP_FROM_NAME", "Paper Trading Platform")

    if not smtp_host or not smtp_email or not smtp_password:
        raise Exception("SMTP configuration missing in .env")

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{smtp_from_name} <{smtp_email}>"
    message["To"] = to_email

    html_part = MIMEText(html_body, "html")
    message.attach(html_part)

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_email, smtp_password)
        server.sendmail(smtp_email, to_email, message.as_string())


def send_otp_email(to_email: str, otp_code: str):
    subject = "Your Paper Trading OTP"

    html_body = f"""
    <div style="font-family: Arial, sans-serif; background:#f8fafc; padding:30px;">
      <div style="max-width:540px; margin:auto; background:white; border-radius:18px; padding:30px; border:1px solid #e5e7eb;">
        <h2 style="color:#0f172a; margin-top:0;">Paper Trading Platform</h2>

        <p style="color:#475569; font-size:15px; line-height:1.7;">
          Use the OTP below to verify your email address.
        </p>

        <div style="font-size:36px; font-weight:900; letter-spacing:8px; color:#2563eb; background:#eff6ff; padding:20px; border-radius:14px; text-align:center; margin:24px 0;">
          {otp_code}
        </div>

        <p style="color:#64748b; font-size:14px;">
          This OTP is valid for 10 minutes.
        </p>

        <p style="color:#dc2626; font-size:13px; font-weight:700;">
          Do not share this OTP with anyone.
        </p>
      </div>
    </div>
    """

    send_email(to_email, subject, html_body)