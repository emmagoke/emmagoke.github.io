// Cloudflare Worker: receives the portfolio contact form and sends it via Resend.
// The Resend API key lives ONLY here as a secret, never in the HTML.

const ALLOWED_ORIGINS = [
  "https://emmagoke.github.io",
  "https://portfolio.emma-goke05.workers.dev",
  // "http://localhost:8080", // uncomment for local testing
];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "Forbidden" }, 403, origin);

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, origin);
    }

    // Honeypot: bots fill this hidden field. Pretend success and drop it.
    if (data.website) return json({ ok: true }, 200, origin);

    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();
    const subject = String(data.subject || "").trim();
    const message = String(data.message || "").trim();

    if (!name || !email || !subject || !message) return json({ error: "All fields are required." }, 400, origin);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email address." }, 400, origin);
    if (name.length > 100 || email.length > 200 || subject.length > 150 || message.length > 5000)
      return json({ error: "Message too long." }, 400, origin);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,            // e.g. "Portfolio <onboarding@resend.dev>"
        to: [env.TO_EMAIL],              // your inbox
        reply_to: email,                 // hitting Reply goes to the visitor
        subject: `[Portfolio] ${subject.replace(/[\r\n]+/g, " ")}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px">
            <h2 style="margin:0 0 12px">New portfolio message</h2>
            <p><strong>From:</strong> ${esc(name)} &lt;${esc(email)}&gt;</p>
            <p><strong>Subject:</strong> ${esc(subject)}</p>
            <hr style="border:none;border-top:1px solid #ddd">
            <p style="white-space:pre-wrap">${esc(message)}</p>
          </div>`,
        text: `From: ${name} <${email}>\nSubject: ${subject}\n\n${message}`,
      }),
    });

    if (!res.ok) {
      console.error("Resend error", res.status, await res.text());
      return json({ error: "Could not send message. Please email me directly." }, 502, origin);
    }
    return json({ ok: true }, 200, origin);
  },
};
