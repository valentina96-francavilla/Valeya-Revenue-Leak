
export const config = { maxDuration: 60 };

const ALLOWED_ORIGIN = "https://audit.valeyastudio.it";

export default async function handler(req, res) {
  const origin = req.headers.origin;

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (origin === ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  } else if (origin) {
    return res.status(403).json({
      error: { message: "Origine non autorizzata." }
    });
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: { message: "Metodo non supportato." }
    });
  }

  const apiKey = process.env.PAGESPEED_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: { message: "Chiave PageSpeed non configurata sul server." }
    });
  }

  let body;
  try {
    body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;
  } catch {
    return res.status(400).json({
      error: { message: "Richiesta non valida." }
    });
  }

  let target;
  try {
    target = new URL(body?.url);
  } catch {
    return res.status(400).json({
      error: { message: "URL non valido." }
    });
  }

  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

  if (
    !["https:", "http:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    isIPv4 ||
    hostname.includes(":")
  ) {
    return res.status(400).json({
      error: { message: "Inserisci l'indirizzo pubblico di un sito." }
    });
  }

  const strategy = body?.strategy;

  if (!["mobile", "desktop"].includes(strategy)) {
    return res.status(400).json({
      error: { message: "Dispositivo non valido." }
    });
  }

  const endpoint = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
  );

  endpoint.searchParams.set("url", target.href);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("locale", "it");

  [
    "PERFORMANCE",
    "ACCESSIBILITY",
    "BEST_PRACTICES",
    "SEO"
  ].forEach(category => {
    endpoint.searchParams.append("category", category);
  });

  endpoint.searchParams.set("key", apiKey);

  try {
    const googleResponse = await fetch(endpoint, {
      signal: AbortSignal.timeout(55000)
    });

    const data = await googleResponse.json();

    if (!googleResponse.ok) {
      return res.status(googleResponse.status).json({
        error: {
          message:
            data?.error?.message ||
            "Google PageSpeed non ha completato l'analisi."
        }
      });
    }

    if (!data?.lighthouseResult?.categories) {
      return res.status(502).json({
        error: { message: "Risposta Google incompleta." }
      });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);
  } catch {
    return res.status(502).json({
      error: {
        message: "Servizio PageSpeed non raggiungibile o scaduto il tempo."
      }
    });
  }
}
