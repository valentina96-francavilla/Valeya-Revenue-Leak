import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const config = { maxDuration: 60 };

const ALLOWED_ORIGIN = "https://audit.valeyastudio.it";
const isAllowedOrigin = origin => origin === ALLOWED_ORIGIN || /^https:\/\/valeya-audit-revenue-dashboard-[a-z0-9-]+\.vercel\.app$/i.test(origin || "");
const MAX_BODY_BYTES = 4096;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
const MAX_CONCURRENT_AUDITS = 2;

// Best-effort per-instance guard. Vercel Functions are distributed, so this is
// a secondary layer; enforce a durable/global limit at the edge before launch.
const rateBuckets = new Map();
let activeAudits = 0;
let lastBucketCleanup = 0;

function getClientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "";
  return ip || req.socket?.remoteAddress || "unknown";
}

function isPrivateOrReservedIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a,b,c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99) || (b === 0 && c === 0))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    (a === 255);
}

function isPublicAddress(address) {
  const version = isIP(address);
  if (version === 4) return !isPrivateOrReservedIPv4(address);
  if (version !== 6) return false;
  const ip = address.toLowerCase().split("%")[0];
  // Only allow global-unicast IPv6 (2000::/3), excluding documentation and
  // IPv4-mapped addresses, which are handled as non-public here.
  if (!/^[23][0-9a-f]{0,3}:/i.test(ip)) return false;
  if (ip.startsWith("2001:db8:")) return false;
  if (ip.startsWith("::ffff:")) return false;
  return true;
}

function rateLimitExceeded(clientKey, now = Date.now()) {
  if (now - lastBucketCleanup > RATE_WINDOW_MS) {
    for (const [key, bucket] of rateBuckets) {
      if (now - bucket.start >= RATE_WINDOW_MS) rateBuckets.delete(key);
    }
    lastBucketCleanup = now;
  }
  let bucket = rateBuckets.get(clientKey);
  if (!bucket || now - bucket.start >= RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(clientKey, bucket);
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

function error(res, status, message, extraHeaders = {}) {
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  return res.status(status).json({ error: { message } });
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  } else if (origin) {
    return error(res, 403, "Origine non autorizzata.");
  }

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return error(res, 405, "Metodo non supportato.");
  }

  const clientKey = getClientKey(req);
  if (rateLimitExceeded(clientKey)) {
    return error(res, 429, "Hai raggiunto il limite temporaneo di analisi. Riprova tra qualche minuto.", {
      "Retry-After": "600"
    });
  }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return error(res, 413, "Richiesta troppo grande.");
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return error(res, 400, "Richiesta non valida.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return error(res, 400, "Corpo della richiesta non valido.");
  }
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) {
    return error(res, 413, "Richiesta troppo grande.");
  }

  let target;
  try {
    if (typeof body.url !== "string" || body.url.length > 2048) throw new Error("invalid URL");
    target = new URL(body.url);
  } catch {
    return error(res, 400, "URL non valido.");
  }

  const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const forbiddenSuffixes = [".localhost", ".local", ".internal", ".test", ".invalid", ".example", ".home.arpa"];
  const ipVersion = isIP(hostname);
  if (
    !["https:", "http:"].includes(target.protocol) ||
    target.username || target.password ||
    !hostname.includes(".") ||
    hostname === "localhost" ||
    forbiddenSuffixes.some(suffix => hostname === suffix.slice(1) || hostname.endsWith(suffix)) ||
    ipVersion !== 0 ||
    hostname.includes(":") ||
    (target.port && !["80", "443"].includes(target.port))
  ) {
    return error(res, 400, "Inserisci l'indirizzo pubblico di un sito, senza porte personalizzate.");
  }

  if (!["mobile", "desktop"].includes(body.strategy)) {
    return error(res, 400, "Dispositivo non valido.");
  }

  // Resolve the hostname before passing it to Google's remote scanner. Reject
  // private, loopback, link-local, reserved and non-global DNS answers.
  try {
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DNS timeout")), 3000))
    ]);
    if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) {
      return error(res, 400, "Il dominio non risolve esclusivamente a indirizzi IP pubblici.");
    }
  } catch {
    return error(res, 400, "Impossibile verificare il dominio. Controlla l'indirizzo e riprova.");
  }

  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) return error(res, 500, "Chiave PageSpeed non configurata sul server.");

  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", target.href);
  endpoint.searchParams.set("strategy", body.strategy);
  endpoint.searchParams.set("locale", "it");
  ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"].forEach(category => {
    endpoint.searchParams.append("category", category);
  });
  endpoint.searchParams.set("key", apiKey);

  if (activeAudits >= MAX_CONCURRENT_AUDITS) {
    return error(res, 429, "Il servizio è momentaneamente occupato. Riprova tra poco.", { "Retry-After": "30" });
  }

  activeAudits += 1;
  try {
    const googleResponse = await fetch(endpoint, { signal: AbortSignal.timeout(55000) });
    const data = await googleResponse.json();
    if (!googleResponse.ok) {
      const status = [400, 403, 429].includes(googleResponse.status) ? googleResponse.status : 502;
      return error(res, status, data?.error?.message || "Google PageSpeed non ha completato l'analisi.");
    }
    if (!data?.lighthouseResult?.categories) {
      return error(res, 502, "Risposta Google incompleta.");
    }
    return res.status(200).json(data);
  } catch {
    return error(res, 502, "Servizio PageSpeed non raggiungibile o scaduto il tempo.");
  } finally {
    activeAudits = Math.max(0, activeAudits - 1);
  }
}
