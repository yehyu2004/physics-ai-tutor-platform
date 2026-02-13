import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "PhysTutor <onboarding@resend.dev>";

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set. Would have sent "${subject}" to ${Array.isArray(to) ? to.join(", ") : to}`
    );
    return;
  }

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });
    if (result.error) {
      console.error("[email] Resend error:", result.error);
      throw new Error(result.error.message || "Email send failed");
    }
  } catch (error) {
    console.error("[email] Failed to send:", error);
    throw error;
  }
}
