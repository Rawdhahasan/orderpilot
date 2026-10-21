import "server-only";

import { serverEnv } from "@/server/env";

export type Mail = { to: string; subject: string; text: string; html: string };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Local email only (Phase 2C): messages go to the local Mailpit inbox and are
 * never delivered. A real provider is a separate purchase decision (D-25).
 */
export async function sendMail(mail: Mail): Promise<void> {
  const env = serverEnv();
  const url = new URL("/api/v1/send", env.MAILPIT_URL);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error("Refusing to send email: only the local Mailpit inbox is allowed.");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      From: { Email: "no-reply@orderpilot.local", Name: "OrderPilot" },
      To: [{ Email: mail.to }],
      Subject: mail.subject,
      Text: mail.text,
      HTML: mail.html,
    }),
  });
  if (!response.ok) throw new Error(`Local mail delivery failed with status ${response.status}`);
}
