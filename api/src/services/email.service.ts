import { google } from "googleapis";
import { env } from "../config/env.js";

function createGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: env.GMAIL_REFRESH_TOKEN,
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

function buildEmailRaw(to: string, subject: string, body: string): string {
  const message = [
    `From: SentinelAuth <${env.GMAIL_SENDER}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    body,
  ].join("\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendOtpEmail(
  to: string,
  otp: string,
  purpose: "email_verification" | "password_reset" | "mfa_challenge"
): Promise<void> {
  const subjects: Record<typeof purpose, string> = {
    email_verification: "Verify your SentinelAuth account",
    password_reset: "Reset your SentinelAuth password",
    mfa_challenge: "Your SentinelAuth login code",
  };

  const bodies: Record<typeof purpose, string> = {
    email_verification: `
      <h2>Welcome to SentinelAuth</h2>
      <p>Your verification code is:</p>
      <h1 style="letter-spacing:8px;font-size:36px">${otp}</h1>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not register for SentinelAuth, ignore this email.</p>
    `,
    password_reset: `
      <h2>Password Reset</h2>
      <p>Your password reset code is:</p>
      <h1 style="letter-spacing:8px;font-size:36px">${otp}</h1>
      <p>This code expires in 10 minutes.</p>
    `,
    mfa_challenge: `
      <h2>Login Verification</h2>
      <p>Your login verification code is:</p>
      <h1 style="letter-spacing:8px;font-size:36px">${otp}</h1>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not attempt to log in, contact your administrator immediately.</p>
    `,
  };

  const gmail = createGmailClient();
  const raw = buildEmailRaw(to, subjects[purpose], bodies[purpose]);

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}
