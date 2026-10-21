export const config = { maxDuration: 20 };

const json = (res, status, body) => res.status(status).json(body);
const PUBLIC_KEY = () => process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_URL = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const allowedOrigins = () => (process.env.INTELLIGENCE_ALLOWED_ORIGINS || "https://audit.valeyastudio.it").split(",").map(x => x.trim()).filter(Boolean);

function headersFor(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (origin && isAllowedOrigin(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  else if (origin) return false;
  return true;
}
function getToken(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}
async function supabase(path, { method = "GET", body, token, admin = false, prefer } = {}) {
  const base = SUPABASE_URL(), key = admin ? SERVICE_KEY() : PUBLIC_KEY();
  if (!base || !key) throw new Error("Supabase non configurato sul server. Configura SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SERVICE_ROLE_KEY.");
  const headers = { apikey: key, Authorization: "Bearer " + (admin ? key : (token || key)), Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const message = data?.message || data?.msg || data?.error_description || data?.error || "Errore Supabase (" + response.status + ").";
    const error = new Error(String(message)); error.status = response.status; throw error;
  }
  return data;
}
async function requireUser(req) {
  const token = getToken(req);
  if (!token) { const e = new Error("Accedi al workspace per continuare."); e.status = 401; throw e; }
  const base = SUPABASE_URL(), key = PUBLIC_KEY();
  if (!base || !key || !SERVICE_KEY()) { const e = new Error("Backend non configurato: mancano le variabili Supabase sul deployment."); e.status = 503; throw e; }
  const response = await fetch(base + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) { const e = new Error("Sessione non valida o scaduta. Accedi di nuovo."); e.status = 401; throw e; }
  const user = await response.json();
  if (!user?.id) { const e = new Error("Sessione utente non valida."); e.status = 401; throw e; }
  return { user, token };
}
async function ensureWorkspace(user) {
  const existing = await supabase("/rest/v1/workspace_members?user_id=eq." + encodeURIComponent(user.id) + "&select=workspace_id&limit=1", { admin: true });
  if (existing?.[0]?.workspace_id) return existing[0].workspace_id;
  const workspaces = await supabase("/rest/v1/workspaces", { method: "POST", admin: true, body: { name: user.email ? "Workspace " + user.email.split("@")[0] : "My workspace", owner_id: user.id }, prefer: "return=representation" });
  const workspaceId = workspaces?.[0]?.id;
  if (!workspaceId) throw new Error("Impossibile creare il workspace.");
  await supabase("/rest/v1/workspace_members", { method: "POST", admin: true, body: { workspace_id: workspaceId, user_id: user.id, role: "owner" }, prefer: "return=minimal" });
  return workspaceId;
}
async function requireMembership(userId, workspaceId) {
  const rows = await supabase("/rest/v1/workspace_members?user_id=eq." + encodeURIComponent(userId) + "&workspace_id=eq." + encodeURIComponent(workspaceId) + "&select=workspace_id&limit=1", { admin: true });
  if (!rows?.length) { const e = new Error("Workspace non autorizzato."); e.status = 403; throw e; }
}
async function insertIssue(user, workspaceId, issue) {
  const scanId = issue.source_scan_id || issue.scanId || null;
  const findingKey = issue.source_finding_key || issue.findingKey || issue.id || null;
  let findingId = null;
  if (scanId) {
    const scans = await supabase("/rest/v1/audit_scans?id=eq." + encodeURIComponent(scanId) + "&workspace_id=eq." + encodeURIComponent(workspaceId) + "&select=id&limit=1", { admin: true });
    if (!scans?.length) { const e = new Error("La scansione non appartiene al workspace corrente."); e.status = 403; throw e; }
    if (findingKey) {
      const findingRows = await supabase("/rest/v1/audit_findings?scan_id=eq." + encodeURIComponent(scanId) + "&workspace_id=eq." + encodeURIComponent(workspaceId) + "&finding_key=eq." + encodeURIComponent(findingKey) + "&select=id&limit=1", { admin: true });
      findingId = findingRows?.[0]?.id || null;
      const existing = await supabase("/rest/v1/revenue_leak_issues?workspace_id=eq." + encodeURIComponent(workspaceId) + "&source_scan_id=eq." + encodeURIComponent(scanId) + "&source_finding_key=eq." + encodeURIComponent(findingKey) + "&select=*&limit=1", { admin: true });
      if (existing?.[0]) return existing[0];
    }
  }
  const row = {
    workspace_id: workspaceId, created_by: user.id, source_scan_id: scanId, source_finding_id: findingId, source_finding_key: findingKey,
    title: String(issue.title || "Problema senza titolo").slice(0, 500),
    description: String(issue.description || "").slice(0, 12000),
    url: String(issue.url || issue.affected_url || "").slice(0, 2048) || null,
    category: String(issue.category || "other").slice(0, 80),
    severity: ["high","medium","low"].includes(issue.severity || issue.priority) ? (issue.severity || issue.priority) : "medium",
    evidence: issue.evidence && typeof issue.evidence === "object" ? issue.evidence : {},
    source: scanId ? "audit" : "manual",
    decision: issue.decision && typeof issue.decision === "object" ? issue.decision : {},
    intervention: issue.intervention && typeof issue.intervention === "object" ? issue.intervention : {},
    kpi_key: issue.kpi_key || issue.kpi || null,
    kpi_unit: issue.kpi_unit || issue.kpiUnit || null,
    kpi_direction: ["increase","decrease","range"].includes(issue.kpi_direction || issue.kpiDirection) ? (issue.kpi_direction || issue.kpiDirection) : null,
    baseline: issue.baseline !== null && issue.baseline !== undefined && issue.baseline !== "" && Number.isFinite(Number(issue.baseline)) ? Number(issue.baseline) : null,
    target: issue.target !== null && issue.target !== undefined && issue.target !== "" && Number.isFinite(Number(issue.target)) ? Number(issue.target) : null,
    review_date: issue.review_date || issue.reviewDate || null,
    state: ["open","planned","in_progress","completed","awaiting_measurement","verified","archived"].includes(issue.state) ? issue.state : "open"
  };
  const inserted = await supabase("/rest/v1/revenue_leak_issues", { method: "POST", admin: true, body: row, prefer: "return=representation" });
  if (!inserted?.[0]) throw new Error("Il problema non è stato salvato.");
  return inserted[0];
}
async function dashboard(workspaceId) {
  const [issues, scans, measurements] = await Promise.all([
    supabase("/rest/v1/revenue_leak_issues?workspace_id=eq." + encodeURIComponent(workspaceId) + "&select=id,title,url,severity,state,review_date,updated_at,intervention&order=updated_at.desc", { admin: true }),
    supabase("/rest/v1/audit_scans?workspace_id=eq." + encodeURIComponent(workspaceId) + "&select=id,created_at,url&order=created_at.desc&limit=10", { admin: true }),
    supabase("/rest/v1/revenue_leak_measurements?workspace_id=eq." + encodeURIComponent(workspaceId) + "&select=id,issue_id,measured_at&order=measured_at.desc&limit=100", { admin: true })
  ]);
  const now = new Date().toISOString().slice(0,10);
  const latestMeasurement = new Map();
  for (const measurement of measurements || []) {
    const previous = latestMeasurement.get(measurement.issue_id);
    if (!previous || new Date(measurement.measured_at) > new Date(previous.measured_at)) latestMeasurement.set(measurement.issue_id, measurement);
  }
  const criticalOpen = (issues || []).filter(i => i.severity === "high" && i.state === "open" && !String(i.intervention?.owner || "").trim());
  const due = (issues || []).filter(i => i.review_date && i.review_date <= now && !["verified","archived"].includes(i.state));
  const awaiting = (issues || []).filter(i => {
    if (!["completed","awaiting_measurement"].includes(i.state)) return false;
    const measured = latestMeasurement.get(i.id), implemented = i.intervention?.implementedDate;
    return !measured || !implemented || measured.measured_at.slice(0,10) < implemented;
  });
  return { counts: { criticalOpen: criticalOpen.length, dueReviews: due.length, awaitingMeasurement: awaiting.length, totalIssues: (issues || []).length, totalScans: (scans || []).length }, criticalOpen, dueReviews: due, awaitingMeasurement: awaiting, recentScans: scans || [] };
}

export default async function handler(req, res) {
  if (!headersFor(req, res)) return json(res, 403, { error: "Origine non autorizzata." });
  if (req.method === "OPTIONS") return res.status(204).end();
  let body = req.body;
  if (req.method === "POST" && typeof body === "string") {
    try { body = JSON.parse(body); } catch { return json(res,400,{error:"Corpo JSON non valido."}); }
  }
  const action = req.method === "GET" ? String(req.query?.action || "config") : String(body?.action || "");
  if (req.method === "GET" && action === "config") {
    const base = SUPABASE_URL(), key = PUBLIC_KEY();
    if (!base || !key) return json(res, 503, { error: "Configurazione Supabase assente." });
    return json(res, 200, { url: base, publishableKey: key });
  }
  if (req.method !== "POST" && req.method !== "GET") { res.setHeader("Allow","GET, POST, OPTIONS"); return json(res,405,{error:"Metodo non supportato."}); }
  try {
    const { user } = await requireUser(req);
    const workspaceId = await ensureWorkspace(user);
    if (req.method === "POST" && action === "saveScan") {
      const report = body?.report;
      if (!report || !Array.isArray(report.issues) || !report.url || !["mobile","desktop"].includes(report.strategy)) return json(res,400,{error:"Report Audit non valido."});
      if (Buffer.byteLength(JSON.stringify(report), "utf8") > 4_000_000) return json(res,413,{error:"Report troppo grande per essere salvato."});
      const scanPayload = { workspace_id: workspaceId, created_by: user.id, url: report.url, final_url: report.finalUrl || report.url, strategy: report.strategy, scores: report.scores || [], raw_report: report, lighthouse_version: report.lighthouseVersion || null, generated_at: report.generatedAt || new Date().toISOString() };
      const findings = report.issues.map(i => ({...i, url: report.finalUrl || report.url, recommendation: { steps: i.verificationSteps || [], rationale: i.priorityRationale || "" }}));
      const saved = await supabase("/rest/v1/rpc/save_audit_scan", { method:"POST", admin:true, body:{p_scan:scanPayload,p_findings:findings} });
      return json(res,201,{scanId:saved,workspaceId});
    }
    if (req.method === "POST" && action === "createIssue") {
      const issue = body?.issue;
      if (!issue || typeof issue !== "object") return json(res,400,{error:"Problema non valido."});
      const result = await insertIssue(user,workspaceId,issue);
      return json(res,201,{issue:result,workspaceId});
    }
    if (req.method === "POST" && action === "updateIssue") {
      const id = String(body?.issueId || "");
      const updates = body?.updates;
      if (!id || !updates || typeof updates !== "object") return json(res,400,{error:"Aggiornamento non valido."});
      const existing = await supabase("/rest/v1/revenue_leak_issues?id=eq." + encodeURIComponent(id) + "&workspace_id=eq." + encodeURIComponent(workspaceId) + "&select=id&limit=1",{admin:true});
      if (!existing?.length) return json(res,404,{error:"Scheda non trovata nel workspace."});
      const allowed = ["title","description","url","category","severity","evidence","state","decision","intervention","kpi_key","kpi_unit","kpi_direction","baseline","target","review_date"];
      const patch = Object.fromEntries(Object.entries(updates).filter(([k])=>allowed.includes(k)));
      patch.updated_at = new Date().toISOString();
      const result = await supabase("/rest/v1/revenue_leak_issues?id=eq." + encodeURIComponent(id) + "&workspace_id=eq." + encodeURIComponent(workspaceId),{method:"PATCH",admin:true,body:patch,prefer:"return=representation"});
      return json(res,200,{issue:result?.[0] || null});
    }
    if (req.method === "POST" && action === "addMeasurement") {
      const issueId = String(body?.issueId || ""), m = body?.measurement || {};
      const parent = await supabase("/rest/v1/revenue_leak_issues?id=eq." + encodeURIComponent(issueId) + "&workspace_id=eq." + encodeURIComponent(workspaceId) + "&select=id,kpi_key&limit=1",{admin:true});
      if (!parent?.length) return json(res,404,{error:"Scheda non trovata nel workspace."});
      if (m.value === "" || !Number.isFinite(Number(m.value))) return json(res,400,{error:"Inserisci un valore numerico osservato."});
      const row = {workspace_id:workspaceId,issue_id:issueId,created_by:user.id,kpi_key:m.kpi_key || parent[0].kpi_key,observed_value:Number(m.value),unit:m.unit || null,period_label:String(m.period_label || "").slice(0,300) || null,measured_at:m.measured_at || new Date().toISOString(),period_start:m.period_start || null,period_end:m.period_end || null,notes:String(m.notes || "").slice(0,4000)};
      const result = await supabase("/rest/v1/revenue_leak_measurements",{method:"POST",admin:true,body:row,prefer:"return=representation"});
      return json(res,201,{measurement:result?.[0]});
    }
    if (req.method === "GET" && action === "dashboard") return json(res,200,await dashboard(workspaceId));
    if (req.method === "GET" && action === "listIssues") {
      const rows = await supabase("/rest/v1/revenue_leak_issues?workspace_id=eq." + encodeURIComponent(workspaceId) + "&state=neq.archived&select=*&order=updated_at.desc&limit=250",{admin:true});
      return json(res,200,{issues:rows || [],workspaceId});
    }
    if (req.method === "GET" && action === "listScans") {
      const rows = await supabase("/rest/v1/audit_scans?workspace_id=eq." + encodeURIComponent(workspaceId) + "&select=id,url,final_url,strategy,scores,generated_at,created_at&order=created_at.desc&limit=100",{admin:true});
      return json(res,200,{scans:rows || [],workspaceId});
    }
    if (req.method === "GET" && action === "getScan") {
      const id = String(req.query?.id || "");
      const rows = await supabase("/rest/v1/audit_scans?id=eq." + encodeURIComponent(id) + "&workspace_id=eq." + encodeURIComponent(workspaceId) + "&select=id,raw_report,created_at&limit=1", { admin: true });
      if (!rows?.[0]) return json(res,404,{error:"Scansione non trovata nel workspace."});
      return json(res,200,{scanId:rows[0].id,report:rows[0].raw_report,createdAt:rows[0].created_at,workspaceId});
    }
    if (req.method === "GET" && action === "getIssue") {
      const id = String(req.query?.id || "");
      const rows = await supabase("/rest/v1/revenue_leak_issues?id=eq." + encodeURIComponent(id) + "&workspace_id=eq." + encodeURIComponent(workspaceId) + "&select=*&limit=1",{admin:true});
      if (!rows?.[0]) return json(res,404,{error:"Scheda non trovata."});
      const measurements = await supabase("/rest/v1/revenue_leak_measurements?issue_id=eq." + encodeURIComponent(id) + "&workspace_id=eq." + encodeURIComponent(workspaceId) + "&select=*&order=measured_at.desc",{admin:true});
      return json(res,200,{issue:rows[0],measurements:measurements || [],workspaceId});
    }
    return json(res,400,{error:"Azione non riconosciuta."});
  } catch (error) {
    const status = error.status || 500;
    return json(res,status,{error:error.message || "Errore interno del servizio."});
  }
}
