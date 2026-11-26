// ===================== الثوابت =====================
const APP_VERSION = "__APP_VERSION__"; // يُستبدل عند البناء (build.py)
const OUNCE_TO_GRAM = 31.1035;
const STORAGE_KEY = "gold_model_data", SETTINGS_KEY = "gold_model_settings", LIVE_KEY = "gold_last_live", THEME_KEY = "gold_theme", LANG_KEY = "gold_lang", HISTTRY_KEY = "gold_hist_try", HELP_KEY = "gold_help", HELPSTATE_KEY = "gold_help_state";
const DEFAULT_SIGMA = 0.012, BASE_MU = 0.0002, SAR_PEG = 3.75;
const CORS_PROXIES = [
  (u) => "https://api.cors.lol/?url=" + encodeURIComponent(u),
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u)
];
// تعريف الأسواق: السعودية/ريال، مصر/جنيه، عالمي/دولار
const MARKETS = {
  SA: { cur: "SAR", fx: "sar", prem: "premiumSA", karats: [24, 22, 21, 18] },
  EG: { cur: "EGP", fx: "egp", prem: "premiumEG", karats: [24, 22, 21, 18] },
  GL: { cur: "USD", fx: null, prem: null, karats: [24, 22] }
};
const MARKET_ORDER = ["SA", "EG", "GL"];
const KARATS = [24, 22, 21, 18];
const DEFAULT_SETTINGS = {
  premiumSA: 0, premiumEG: 0, lambda: 0.94, nu: 5, mu: BASE_MU, sigmaMult: 1, nSims: 10000, volModel: "ewma",
  market: "SA", unit: "g", karat: 24, basis: "local", chartRange: 90, refreshMin: 5, autoRow: true, autoHist: true,
  coeffs: { alpha: 5200, beta1: -450, beta2: -12, beta3: 1.5, beta4: 8 },
  fvInputs: { realYield: 1.8, dxy: 99, cbFlows: 80, geoIndex: 120 },
  fvCalibrated: false // المعاملات الافتراضية توضيحية؛ لا تدخل في الإشارة حتى يعايرها المستخدم
};

// ===================== أدوات عامة =====================
const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const fmt = (x, d = 2) => (x === null || x === undefined || !isFinite(x)) ? "—" : Number(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 1) => (x === null || x === undefined || !isFinite(x)) ? "—" : (x * 100).toFixed(d) + "%";
const todayISO = () => new Date().toISOString().slice(0, 10);
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let toastTimer = null;
const toast = (msg, ms = 3200) => { const el = $("toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.remove("show"); setTimeout(() => { if (!el.classList.contains("show")) el.textContent = ""; }, 400); }, ms); };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

// ===================== اللغة =====================
const state = { lang: "ar", settings: null, mc: null, sigmaInfo: null, S0: null, fx: null, backtest: null, charts: {}, fetchLog: [], hist: null, research: null, nextAt: null, lastOk: null, lastFail: null, fetching: false, liveError: null, showAllRows: false };
// ترجمة نص بمفتاح مع متغيرات {name}
const t = (k, p) => { let s = (I18N[state.lang] && I18N[state.lang][k]) ?? I18N.ar[k] ?? k; if (p) for (const [a, b] of Object.entries(p)) s = s.split("{" + a + "}").join(b); return s; };
const applyStaticI18n = () => {
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-tip]").forEach(el => { el.dataset.tip = t(el.dataset.i18nTip); });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  document.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.dataset.i18nTitle); });
  $("liveBadge").title = t("help.badge"); $("verInfo").textContent = t("ver.info", { v: APP_VERSION });
  if (state.newVersion) $("updateMsg").textContent = t("upd.msg", { v: state.newVersion });
  applyHelp();
  document.title = "GoldQuant — " + t("app.short");
  $("btnLang").textContent = state.lang === "ar" ? "EN" : "ع";
  $("methList").innerHTML = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"].map(k => `<li>${t("meth." + k)}</li>`).join("");
};
const isRTL = () => state.lang === "ar";
// الإرشادات: صندوق شرح قابل للطي لكل شاشة/رسم (يُحفظ فتحه وإغلاقه)
state.helpOn = lsGet(HELP_KEY) !== "0";
state.helpState = (() => { try { return JSON.parse(lsGet(HELPSTATE_KEY) || "{}"); } catch (e) { return {}; } })();
const helpHtml = (key) => { const open = state.helpState[key] !== undefined ? state.helpState[key] : key.startsWith("help.tab."); return `<details class="help" data-k="${key}"${open ? " open" : ""}><summary>ⓘ ${t("help.what")}</summary><div class="help-body">${t(key)}</div></details>`; };
const applyHelp = () => {
  document.querySelectorAll("[data-help]").forEach(el => { el.innerHTML = helpHtml(el.dataset.help); });
  document.documentElement.classList.toggle("nohelp", !state.helpOn);
  const b = $("btnHelp"); if (b) b.setAttribute("aria-pressed", String(state.helpOn));
};
// التحقق من وجود إصدار أحدث على الخادم (يعمل عند الاستضافة فقط، ويُتجاهل على file://)
const checkUpdate = async () => {
  if (location.protocol === "file:" || state.newVersion) return;
  try {
    const r = await fetch("version.json?_=" + Date.now(), { cache: "no-store" }); if (!r.ok) return;
    const j = await r.json();
    if (j && j.version && j.version !== APP_VERSION) { state.newVersion = j.version; $("updateMsg").textContent = t("upd.msg", { v: j.version }); $("updateBar").classList.remove("hidden"); }
  } catch (e) { /* بلا اتصال: نتجاهل */ }
};
// رسائل حالة تُعاد ترجمتها عند تبديل اللغة: parts = [[مفتاح, متغيرات], ...]
state.msgs = {};
const setMsg = (id, parts, spin = false) => { state.msgs[id] = { parts, spin }; renderMsg(id); };
const renderMsg = (id) => { const m = state.msgs[id], el = $(id); if (!el) return; if (!m) { el.textContent = ""; return; } const s = m.parts.map(([k, p]) => t(k, p)).join(" — "); if (m.spin) el.innerHTML = '<span class="spin"></span> ' + escHtml(s); else el.textContent = s; };

// ===================== التخزين =====================
const saveData = (rows) => lsSet(STORAGE_KEY, JSON.stringify(rows));
let dataCache = null;
const loadData = () => {
  const raw = lsGet(STORAGE_KEY);
  if (dataCache && dataCache.raw === raw) return dataCache.rows;
  let rows = [];
  try { const d = raw ? JSON.parse(raw) : []; rows = Array.isArray(d) ? d.sort((a, b) => a.date < b.date ? -1 : 1) : []; } catch (e) { rows = []; }
  dataCache = { raw, rows }; return rows;
};
const addRow = (row) => { const data = loadData().slice(); if (data.some(r => r.date === row.date)) { toast(t("toast.dupDate")); return false; } data.push(row); data.sort((a, b) => a.date < b.date ? -1 : 1); saveData(data); return true; };
const loadSettings = () => { try { const s = JSON.parse(lsGet(SETTINGS_KEY) || "{}"); const d = clone(DEFAULT_SETTINGS); const out = { ...d, ...s, coeffs: { ...d.coeffs, ...(s.coeffs || {}) }, fvInputs: { ...d.fvInputs, ...(s.fvInputs || {}) } };
    if (s.market === undefined && Array.isArray(s.markets) && MARKETS[s.markets[0]]) out.market = s.markets[0]; // ترحيل الاختيار القديم المتعدد
    if (!MARKETS[out.market]) out.market = "SA";
    if (out.unit !== "g" && out.unit !== "oz") out.unit = "g";
    out.karat = KARATS.includes(+out.karat) ? +out.karat : 24;
    if (out.basis !== "local" && out.basis !== "usd") out.basis = "local";
    if (s.fvCalibrated === undefined) out.fvCalibrated = JSON.stringify(out.coeffs) !== JSON.stringify(DEFAULT_SETTINGS.coeffs);
    delete out.markets; return out; } catch (e) { return clone(DEFAULT_SETTINGS); } };
const saveSettings = (s) => lsSet(SETTINGS_KEY, JSON.stringify(s));
const loadLive = () => { try { return JSON.parse(lsGet(LIVE_KEY) || "null"); } catch (e) { return null; } };
const saveLive = (l) => lsSet(LIVE_KEY, JSON.stringify(l));
const lastNonNull = (rows, key) => { for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i][key]; if (v !== null && v !== undefined && v !== "" && isFinite(+v)) return +v; } return null; };

// ===================== الدوال الأساسية للنموذج =====================
// تقلب EWMA (RiskMetrics)
function ewmaSigma(returns, lambda = 0.94) {
  if (!returns.length) return DEFAULT_SIGMA;
  const k = Math.min(5, returns.length);
  let variance = returns.slice(0, k).reduce((s, r) => s + r * r, 0) / k;
  for (let i = k; i < returns.length; i++) variance = lambda * variance + (1 - lambda) * returns[i] * returns[i];
  return Math.sqrt(variance);
}
// النسبة المئوية بالاستيفاء الخطي
function percentile(sortedArr, q) {
  const pos = (sortedArr.length - 1) * q, base = Math.floor(pos), rest = pos - base;
  if (sortedArr[base + 1] !== undefined) return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  return sortedArr[base];
}
// متغير طبيعي (Box–Muller) وغاما (Marsaglia–Tsang) وStudent-t
let spareNormal = null;
const randNormal = () => { if (spareNormal !== null) { const s = spareNormal; spareNormal = null; return s; } let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); const r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v; spareNormal = r * Math.sin(th); return r * Math.cos(th); };
const randGamma = (shape) => { if (shape < 1) return randGamma(shape + 1) * Math.pow(Math.random(), 1 / shape); const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = randNormal(); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = Math.random(); if (u < 1 - 0.0331 * x ** 4) return d * v; if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } };
const studentT = (nu) => randNormal() / Math.sqrt((2 * randGamma(nu / 2)) / nu);
// Monte Carlo بتوزيع t ذي ذيول سميكة وتباين موحّد
function monteCarlo(S0, sigma, mu = 0.0002, nu = 5, N = 10000) {
  const nuSafe = Math.max(2.1, nu), scale = Math.sqrt(nuSafe / (nuSafe - 2)), results = new Array(N);
  for (let i = 0; i < N; i++) results[i] = S0 * Math.exp((mu - 0.5 * sigma * sigma) + sigma * studentT(nuSafe) / scale);
  results.sort((a, b) => a - b);
  return { p5: percentile(results, 0.05), p10: percentile(results, 0.10), p50: percentile(results, 0.50), p90: percentile(results, 0.90), p95: percentile(results, 0.95), all: results };
}
const bandAt = (S0, sigma, mu, z) => S0 * Math.exp((mu - 0.5 * sigma * sigma) + sigma * z);
// نموذج القيمة العادلة
function fairValue(realYield, dxy, cbFlows, geoIndex, c) { return c.alpha + c.beta1 * realYield + c.beta2 * dxy + c.beta3 * cbFlows + c.beta4 * geoIndex; }
// تحويل السعر المحلي للجرام
function localPrice(goldUsdPerOz, fxRate, karat, premium) { return (goldUsdPerOz / OUNCE_TO_GRAM) * fxRate * (karat / 24) + premium; }
// ---- عرض الأسعار: عملة السوق المختار × الوحدة (جرام/أونصة) × العيار + المصنعية ----
const unitFactor = (unit) => (unit === "oz" ? 1 : 1 / OUNCE_TO_GRAM); // من دولار/أونصة إلى سعر الوحدة
const premFor = (mk, s = state.settings) => { const p = MARKETS[mk].prem; return p ? (+s[p] || 0) : 0; }; // المصنعية دائماً لكل جرام
const premPerUnit = (mk, unit, s = state.settings) => premFor(mk, s) * (unit === "oz" ? OUNCE_TO_GRAM : 1);
// سعر العرض = سعر الأونصة بالدولار × الصرف × (العيار/24) × عامل الوحدة + المصنعية (بعد تحويلها للوحدة)
const toView = (usdOz, fx, v = state.settings) => usdOz * fx * (v.karat / 24) * unitFactor(v.unit) + premPerUnit(v.market, v.unit, v);
// العكس: من سعر العرض (عملة × وحدة × عيار + مصنعية) إلى دولار/أونصة
const fromView = (v, fx, s = state.settings) => (v - premPerUnit(s.market, s.unit, s)) / (fx * (s.karat / 24) * unitFactor(s.unit));
const viewSig = (v = state.settings) => [v.market, v.unit, v.karat, v.basis, v.premiumSA, v.premiumEG].join("|");
// سلسلة الصرف لكل صف: ملء للأمام ثم للخلف؛ الريال مربوط 3.75 عند غياب القيمة؛ العالمي = 1
const fxSeries = (rows, mk) => {
  if (mk === "GL") return rows.map(() => 1);
  const key = MARKETS[mk].fx, out = new Array(rows.length).fill(null); let last = null;
  for (let i = 0; i < rows.length; i++) { const v = +rows[i][key]; if (v > 0) last = v; out[i] = last; }
  let next = null; for (let i = rows.length - 1; i >= 0; i--) { if (out[i] !== null) next = out[i]; else out[i] = next; }
  return mk === "SA" ? out.map(v => (v > 0 ? v : SAR_PEG)) : out;
};
let viewMemo = { rows: null, sig: null, val: null };
// صفوف العرض: نفس الصفوف لكن gold = سعر العرض (usd = الدولار الأصلي). كل التحليلات المبنية على العوائد تعمل عليها
const viewRows = (rows = loadData(), s = state.settings) => {
  const sig = viewSig(s);
  if (viewMemo.rows === rows && viewMemo.sig === sig) return viewMemo.val;
  let fx = fxSeries(rows, s.market);
  if (s.basis === "usd" && s.market !== "GL") { const cur = fx[fx.length - 1]; fx = fx.map(() => cur); } // دولار ثم تحويل بالصرف الحالي
  const val = [];
  rows.forEach((r, i) => { if (fx[i] > 0 && +r.gold > 0) val.push({ ...r, usd: +r.gold, fx: fx[i], gold: toView(+r.gold, fx[i], s) }); });
  viewMemo = { rows, sig, val }; return val;
};
const unitText = (s = state.settings) => `${MARKETS[s.market].cur}/${t("unit." + s.unit)}`;
const logReturns = (rows) => { const out = []; for (let i = 1; i < rows.length; i++) { const a = +rows[i - 1].gold, b = +rows[i].gold; if (a > 0 && b > 0) out.push(Math.log(b / a)); } return out; };
const classifyFairness = (ratio) => {
  if (!isFinite(ratio)) return { key: "na", label: t("fair.na"), color: "var(--neutral)", icon: "–" };
  if (ratio > 1.15) return { key: "over", label: t("fair.over"), color: "var(--bad)", icon: "▲" };
  if (ratio < 0.85) return { key: "under", label: t("fair.under"), color: "var(--good)", icon: "▼" };
  return { key: "fair", label: t("fair.fair"), color: "var(--neutral)", icon: "●" };
};
// GARCH مخزّن مؤقتاً لكل مجموعة بيانات
let garchMemo = { rows: null, val: null };
const getGarch = (rows) => {
  if (garchMemo.rows === rows) return garchMemo.val;
  const lr = logReturns(rows); let val = null;
  if (lr.length >= 250) { try { val = garchFit(lr.slice(-1500)); } catch (e) { val = null; } }
  garchMemo = { rows, val }; return val;
};
// تقدير sigma: EWMA من آخر 30 عائداً أو GARCH عند توفر بيانات كافية
const estimateSigma = (rows, s, { ewmaOnly = false } = {}) => {
  if (rows.length < 5) return { sigma: DEFAULT_SIGMA * s.sigmaMult, raw: DEFAULT_SIGMA, isDefault: true, n: Math.max(0, rows.length - 1), model: "default" };
  if (!ewmaOnly && s.volModel === "garch") { const g = getGarch(rows); if (g) return { sigma: g.sigmaNext * s.sigmaMult, raw: g.sigmaNext, isDefault: false, n: Math.min(1500, rows.length - 1), model: "garch" }; }
  const rets = logReturns(rows).slice(-30), raw = ewmaSigma(rets, s.lambda);
  return { sigma: raw * s.sigmaMult, raw, isDefault: false, n: rets.length, model: "ewma" };
};

// ===================== الحالة المرجعية =====================
const currentRef = () => {
  const s = state.settings, rows = loadData(), live = loadLive(), last = rows[rows.length - 1], rowsV = viewRows(rows, s);
  const liveDate = live && live.updatedAt ? String(live.updatedAt).slice(0, 10) : null;
  const useLive = live && live.price && (!last || (liveDate && liveDate >= last.date));
  const priceUsd = useLive ? live.price : (last ? +last.gold : null);
  const sar = (useLive && live.sar) || lastNonNull(rows, "sar") || SAR_PEG;
  const egp = (useLive && live.egp) || lastNonNull(rows, "egp") || null;
  const fxNow = s.market === "SA" ? sar : s.market === "EG" ? egp : 1;
  const vl = rowsV[rowsV.length - 1], vp = rowsV[rowsV.length - 2];
  let prevUsd = null, prev = null;
  if (useLive && last) { if (liveDate === last.date) { prevUsd = rows.length > 1 ? +rows[rows.length - 2].gold : null; prev = vp ? vp.gold : null; } else { prevUsd = +last.gold; prev = vl ? vl.gold : null; } }
  else if (rows.length > 1) { prevUsd = +rows[rows.length - 2].gold; prev = vp ? vp.gold : null; }
  const price = useLive ? ((priceUsd && fxNow) ? toView(priceUsd, fxNow, s) : null) : (vl ? vl.gold : null);
  return { price, prev, priceUsd, prevUsd, fxNow, sar, egp, source: useLive ? "live" : (last ? "data" : "none"), live, last, rows, rowsV };
};

// ===================== الجلب من الشبكة =====================
async function fetchWithProxy(url, { timeout = 7000, as = "json", proxyFirst = false } = {}) {
  const one = async (u) => { const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout); try { const res = await fetch(u, { signal: ctrl.signal, cache: "no-store" }); if (!res.ok) throw new Error("HTTP " + res.status); const text = await res.text(); return as === "json" ? JSON.parse(text) : text; } finally { clearTimeout(timer); } };
  if (!proxyFirst) { try { return await one(url); } catch (e) { /* ننتقل للوسطاء */ } }
  return Promise.any(CORS_PROXIES.map(p => one(p(url))));
}
const extractPrice = (obj) => { const keys = ["price", "spot", "xau", "XAU", "ask", "bid", "value", "last", "close"], seen = new Set(); const walk = (o, d) => { if (!o || typeof o !== "object" || d > 4 || seen.has(o)) return null; seen.add(o); for (const k of keys) { const v = parseFloat(o[k]); if (isFinite(v) && v > 300 && v < 50000) return v; } for (const v of Object.values(o)) { const r = walk(v, d + 1); if (r) return r; } return null; }; return walk(obj, 0); };
const goodPrice = (p) => { if (!(p > 300 && p < 50000)) throw new Error("bad price"); return p; };
const parseFawaz = (d) => { const u = d.usd || {}; return { price: u.xau > 0 ? goodPrice(1 / u.xau) : null, sar: +u.sar || null, egp: +u.egp || null, updatedAt: d.date ? d.date + "T00:00:00Z" : null }; };
const parseFxList = (d) => { const out = {}; const list = Array.isArray(d) ? d : (Array.isArray(d.rates) ? d.rates : null); if (list) list.forEach(r => { if (r.quote) out[r.quote] = parseFloat(r.rate); }); else if (d.rates) Object.assign(out, d.rates); if (!(out.SAR > 0 && out.EGP > 0)) throw new Error("shape"); return { sar: +out.SAR, egp: +out.EGP }; };
const fawazFx = (d) => { const r = parseFawaz(d); if (!(r.sar && r.egp)) throw new Error("shape"); return r; };
const GOLD_SOURCES = [
  { name: "gold-api.com", url: "https://api.gold-api.com/price/XAU", parse: (d) => ({ price: goodPrice(parseFloat(d.price)), updatedAt: d.updatedAt }) },
  { name: "currency-api (jsDelivr)", url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", parse: parseFawaz },
  { name: "currency-api (pages.dev)", url: "https://latest.currency-api.pages.dev/v1/currencies/usd.json", parse: parseFawaz },
  { name: "goldprice.org", url: "https://data-asg.goldprice.org/dbXRates/USD", parse: (d) => ({ price: goodPrice(parseFloat(d.items[0].xauPrice)), updatedAt: d.date }) },
  { name: "xaus.com", url: "https://xaus.com/api/v1/spot", parse: (d) => ({ price: goodPrice(extractPrice(d)), updatedAt: d.updatedAt || d.timestamp }) }
];
const FX_SOURCES = [
  { name: "frankfurter", url: "https://api.frankfurter.dev/v2/rates?base=USD&quotes=SAR,EGP", parse: parseFxList },
  { name: "open.er-api.com", url: "https://open.er-api.com/v6/latest/USD", parse: parseFxList },
  { name: "currency-api (jsDelivr)", url: GOLD_SOURCES[1].url, parse: fawazFx },
  { name: "currency-api (pages.dev)", url: GOLD_SOURCES[2].url, parse: fawazFx }
];
const errMsg = (e) => (e && e.errors) ? "log.allFailed" : ((e && e.message) || "log.failed");
const renderFetchLog = () => {
  const el = $("fetchLog"); if (!el) return;
  el.innerHTML = state.fetchLog.length ? `<table class="tbl"><thead><tr><th>${t("log.src")}</th><th>${t("log.kind")}</th><th>${t("log.val")}</th><th>${t("log.res")}</th><th>${t("log.ms")}</th></tr></thead><tbody>` +
    state.fetchLog.map(l => `<tr><td>${escHtml(l.src)}</td><td>${l.kind === "gold" ? t("log.gold") : t("log.fx")}</td><td><span class="num">${escHtml(l.val || "")}</span></td><td style="color:${l.ok ? (l.used === false ? "var(--warn)" : "var(--good)") : "var(--bad)"}">${l.ok ? (l.used === false ? "● " + t("log.outlier") : "✓ " + t("log.ok")) : "✗ " + escHtml(t(l.note || ""))}</td><td><span class="num">${l.ms}ms</span></td></tr>`).join("") + `</tbody></table>` : `<p class="text-sm faint">${t("log.none")}</p>`;
};
// أولوية المصادر عند التعادل (الأكثر موثوقية أولاً)
const SRC_PRIORITY = ["gold-api.com", "goldprice.org", "xaus.com", "frankfurter", "open.er-api.com", "currency-api (jsDelivr)", "currency-api (pages.dev)"];
const prio = (name) => { const i = SRC_PRIORITY.indexOf(name); return i < 0 ? 99 : i; };
const STALE_MS = 4 * 86400000; // مصدر عمره أكثر من 4 أيام = قديم، يُستبعد
// نجمع ردود كل المصادر (لا أول رد فقط) حتى تكتمل أو تنتهي المهلة
const gatherSources = (list, kind, timeout = 9000) => new Promise((resolve) => {
  const out = []; let done = 0, finished = false;
  const finish = () => { if (!finished) { finished = true; resolve(out); } };
  const timer = setTimeout(finish, timeout);
  list.forEach(async (s) => {
    const t0 = performance.now();
    try {
      const r = { ...s.parse(await fetchWithProxy(s.url)), source: s.name };
      const ts = r.updatedAt ? new Date(r.updatedAt).getTime() : NaN;
      if (isFinite(ts) && Date.now() - ts > STALE_MS) throw new Error("stale " + String(r.updatedAt).slice(0, 10));
      if (kind === "gold" && !(r.price > 0)) throw new Error("shape");
      if (!finished) out.push(r);
      state.fetchLog.push({ src: s.name, kind, ok: true, val: kind === "gold" ? fmt(r.price) : `${fmt(r.sar, 4)} / ${fmt(r.egp, 4)}`, ms: Math.round(performance.now() - t0) });
    } catch (e) { state.fetchLog.push({ src: s.name, kind, ok: false, note: errMsg(e), ms: Math.round(performance.now() - t0) }); }
    renderFetchLog();
    if (++done === list.length) { clearTimeout(timer); finish(); }
  });
});
// الإجماع: أكبر مجموعة مصادر متقاربة (فرق لوغاريتمي ≤ tol)، والتعادل يُحسم بأولوية المصدر، والقيمة = وسيط المجموعة
const consensus = (items, key, tol) => {
  const xs = items.filter(v => v[key] > 0); if (!xs.length) return null;
  let best = null;
  for (const cand of xs) {
    const g = xs.filter(v => Math.abs(Math.log(v[key] / cand[key])) <= tol), gp = Math.min(...g.map(v => prio(v.source)));
    if (!best || g.length > best.g.length || (g.length === best.g.length && gp < best.p)) best = { g, p: gp };
  }
  const vals = best.g.map(v => v[key]).sort((a, b) => a - b), m = vals.length;
  return { value: m % 2 ? vals[(m - 1) / 2] : (vals[m / 2 - 1] + vals[m / 2]) / 2, agree: best.g, others: xs.filter(v => !best.g.includes(v)) };
};
const fetchFredLast = async (id) => {
  const text = await fetchWithProxy("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + id, { as: "text", proxyFirst: true, timeout: 12000 });
  const lines = text.trim().split(/\r?\n/).slice(1).reverse();
  for (const l of lines) { const v = parseFloat(l.split(",")[1]); if (isFinite(v)) return { value: v, date: l.split(",")[0] }; }
  throw new Error("no data");
};

// ===================== مؤشر التحديث الحي والمؤقت =====================
let retryCount = 0;
const intervalMs = () => (state.settings.refreshMin > 0 ? state.settings.refreshMin * 60000 : 0);
const scheduleNext = (ms) => { state.nextAt = ms ? Date.now() + ms : (intervalMs() ? Date.now() + intervalMs() : null); };
const hhmmss = (d) => new Date(d).toTimeString().slice(0, 8);
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
// حالة الاتصال: fetching | ok | stale | off
const liveState = () => {
  if (state.fetching) return "run";
  const iv = intervalMs() || 15 * 60000;
  if (state.lastFail && (!state.lastOk || state.lastFail > state.lastOk)) return "off";
  if (state.lastOk && Date.now() - state.lastOk < iv * 2.2) return "ok";
  return state.lastOk ? "stale" : "stale";
};
const renderLiveBadge = () => {
  const st = liveState(), dot = $("liveDot");
  dot.className = "dot " + ({ run: "live-run", ok: "live-ok", stale: "live-stale", off: "live-off" }[st]);
  const label = t("live." + st);
  const last = state.lastOk ? ` · ${t("live.last")} <span class="num">${hhmmss(state.lastOk)}</span>` : "";
  const nxt = (state.nextAt && st !== "run") ? ` · ${t("live.next")} <span class="num">${mmss(state.nextAt - Date.now())}</span>` : (intervalMs() ? "" : ` · ${t("live.autoOff")}`);
  $("liveText").innerHTML = `<b>${label}</b>${last}${nxt}`;
  const fill = $("refreshFill");
  if (state.nextAt && intervalMs() && st !== "run") { const total = Math.max(1000, Math.min(intervalMs(), state.nextAt - (state.lastScheduled || Date.now()))); fill.style.width = Math.min(100, 100 * (1 - (state.nextAt - Date.now()) / Math.max(total, 1000))) + "%"; } else fill.style.width = st === "run" ? "100%" : "0";
};
const tick = () => {
  renderLiveBadge();
  if (state.nextAt && Date.now() >= state.nextAt && !document.hidden && !state.fetching) fetchLiveNow();
};

// ---- سلامة البيانات ----
// قفزة يومية أكبر من 20% في سعر الذهب لم تحدث تاريخياً؛ إن لم تستمر في اليوم التالي فهي قراءة/إدخال خاطئ
const SPIKE = 0.2;
// anchor = سعر الإجماع الحي من المصادر الآلية؛ أي صف يتفق معه (±5%) لا يُعدّ شاذاً حتى لو كان التاريخ قبله خاطئاً
const suspiciousRows = (rows, anchor = null) => {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const a = +rows[i - 1].gold, b = +rows[i].gold; if (!(a > 0 && b > 0) || Math.abs(Math.log(b / a)) <= SPIKE) continue;
    if (anchor > 0 && Math.abs(Math.log(b / anchor)) < 0.05) continue;
    const c = i + 1 < rows.length ? +rows[i + 1].gold : null;
    if (c === null || !(c > 0) || Math.abs(Math.log(c / a)) < 0.05) out.push(rows[i]);
  }
  return out;
};
// سعر مرجعي متين بالدولار: وسيط آخر 5 أيام قبل اليوم بعد استبعاد القيم الشاذة
const refUsdMedian = (rows) => {
  const bad = new Set(suspiciousRows(rows).map(r => r.date)), d = todayISO();
  const xs = rows.filter(r => r.date < d && !bad.has(r.date) && +r.gold > 0).slice(-5).map(r => +r.gold).sort((a, b) => a - b);
  return xs.length ? xs[Math.floor(xs.length / 2)] : null;
};
const liveSuspect = (live, rows) => { const r = refUsdMedian(rows); return !!(live && live.price > 0 && r && Math.abs(Math.log(live.price / r)) > SPIKE); };

// حفظ سعر اليوم الحي كصف (أيام العمل فقط) ليبقى النموذج محدّثاً
const upsertToday = (live) => {
  const d = todayISO(), dow = new Date().getUTCDay(); if (dow === 0 || dow === 6 || !live || !(live.price > 0)) return;
  if (liveSuspect(live, loadData())) return; // لا نلوّث السجل بقيمة بعيدة جداً عن الأيام السابقة
  const rows = loadData().slice(), i = rows.findIndex(r => r.date === d), prev = rows[rows.length - 1] || {};
  const base = { date: d, gold: +live.price.toFixed(2), sar: live.sar || prev.sar || SAR_PEG, egp: live.egp || prev.egp || null };
  if (i >= 0) { if (rows[i].src === "manual") return; rows[i] = { ...rows[i], gold: base.gold, sar: base.sar, egp: base.egp, src: "live" }; }
  else { rows.push({ ...base, realYield: prev.realYield ?? null, dxy: prev.dxy ?? null, vix: prev.vix ?? null, src: "live" }); rows.sort((a, b) => a.date < b.date ? -1 : 1); }
  saveData(rows);
};
const liveErrText = () => { const e = state.liveErr; if (!e) return ""; return (e.known ? t("live.errKnown", { k: e.known }) : t("live.errNone")) + (e.fx ? " " + t("live.fxOnly") : "") + " " + t("live.useManual") + (e.wait ? " " + t("live.retry", { s: e.wait, n: e.n }) : ""); };
const srcName = (s) => (s === "manual" ? t("man.src") : s);
const applyManualLive = (price, sar, egp) => { saveLive({ price, sar, egp, updatedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), source: "manual", fxSource: "manual" }); state.liveErr = null; retryCount = 0; state.lastOk = Date.now(); state.lastFail = null; scheduleNext(); if (state.settings.autoRow) upsertToday(loadLive()); refreshAll(true); };

// تنفيذ الجلب الحي: مصادر متعددة + إعادة محاولة + الرجوع لآخر سعر معروف
const fetchLiveNow = async () => {
  if (state.fetching) return; state.fetching = true; renderLiveBadge();
  const msg = (...parts) => setMsg("fetchMsg", parts, parts[0] && parts[0][0] === "live.fetching");
  msg(["live.fetching"]); state.fetchLog = []; renderFetchLog();
  const prevLive = loadLive() || {};
  const [goldRes, fxRes] = await Promise.all([gatherSources(GOLD_SOURCES, "gold"), gatherSources(FX_SOURCES, "fx")]);
  const gc = consensus(goldRes, "price", 0.015), sc = consensus(fxRes, "sar", 0.01), ec = consensus(fxRes, "egp", 0.02);
  // علّم في السجل المصادر الشاذة عن الإجماع
  if (gc) state.fetchLog.forEach(l => { if (l.kind === "gold" && l.ok && gc.others.some(o => o.source === l.src)) l.used = false; });
  renderFetchLog();
  const gold = gc ? { price: gc.value, updatedAt: gc.agree.map(v => v.updatedAt).filter(Boolean).sort().pop() || null, source: gc.agree.map(v => v.source).join(" + "), agree: gc.agree.length, others: gc.others.map(v => ({ s: v.source, p: v.price })) } : null;
  const fxSar = sc ? sc.value : null, fxEgp = ec ? ec.value : null, fxOk = !!(fxSar && fxEgp);
  const fxSrc = [...new Set([...(sc ? sc.agree : []), ...(ec ? ec.agree : [])].map(v => v.source))].join(" + ");
  const now = new Date().toISOString();
  if (gold) {
    const live = { price: gold.price, updatedAt: gold.updatedAt || now, source: gold.source, agree: gold.agree, others: gold.others, sar: fxSar || prevLive.sar, egp: fxEgp || prevLive.egp, fxSource: fxOk ? fxSrc : (prevLive.fxSource || null), fetchedAt: now };
    saveLive(live);
    $("fDate").value = todayISO(); $("fGold").value = gold.price.toFixed(2); if (live.sar) $("fSar").value = (+live.sar).toFixed(4); if (live.egp) $("fEgp").value = (+live.egp).toFixed(4);
    if (state.settings.autoRow) upsertToday(live);
    fxOk ? msg(["live.done", { p: fmt(gold.price), s: gold.source }]) : msg(["live.done", { p: fmt(gold.price), s: gold.source }], ["live.noFx"]);
    state.liveErr = null;
    retryCount = 0; state.lastOk = Date.now(); state.lastFail = null; scheduleNext();
  } else {
    if ((fxSar || fxEgp) && prevLive.price) saveLive({ ...prevLive, sar: fxSar || prevLive.sar, egp: fxEgp || prevLive.egp, fxSource: fxSrc || prevLive.fxSource, fetchedAt: now });
    const rows = loadData(), last = rows[rows.length - 1];
    const known = prevLive.price ? `${fmt(prevLive.price)} $ · ${String(prevLive.updatedAt || "").slice(0, 10)}` : (last ? `${fmt(+last.gold)} $ · ${last.date}` : null);
    state.lastFail = Date.now(); retryCount++;
    const wait = retryCount <= 3 ? 20000 * retryCount : 0;
    state.liveErr = { known, fx: fxOk, wait: wait / 1000, n: retryCount };
    if (wait) scheduleNext(wait); else scheduleNext();
    msg(["live.failed"]);
  }
  state.fetching = false; refreshAll(true);
};

// ===================== البيانات التاريخية (حتى 5–10 سنوات) =====================
const yahooPts = async (sym, range) => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d&includePrePost=false`;
  const d = await fetchWithProxy(url, { timeout: 15000 });
  const r = d.chart && d.chart.result && d.chart.result[0]; if (!r || !r.timestamp) throw new Error("shape");
  const c = r.indicators.quote[0].close, byDate = new Map();
  r.timestamp.forEach((ts, i) => { const v = c[i]; if (v > 0 && isFinite(v)) byDate.set(new Date(ts * 1000).toISOString().slice(0, 10), v); });
  return [...byDate.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
};
const rangeYears = (r) => parseInt(r, 10) || 5;
const stooqPts = async (sym, range) => {
  const d2 = new Date(), d1 = new Date(); d1.setFullYear(d1.getFullYear() - rangeYears(range));
  const f = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const text = await fetchWithProxy(`https://stooq.com/q/d/l/?s=${sym}&i=d&d1=${f(d1)}&d2=${f(d2)}`, { as: "text", proxyFirst: true, timeout: 15000 });
  const pts = text.trim().split(/\r?\n/).slice(1).map(l => l.split(",")).map(c => [c[0], parseFloat(c[4])]).filter(([dt, v]) => /^\d{4}-\d\d-\d\d$/.test(dt) && v > 0);
  if (pts.length < 20) throw new Error("shape"); return pts;
};
const fredPts = async (id, range) => {
  const d1 = new Date(); d1.setFullYear(d1.getFullYear() - rangeYears(range));
  const text = await fetchWithProxy(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${d1.toISOString().slice(0, 10)}`, { as: "text", proxyFirst: true, timeout: 15000 });
  const pts = text.trim().split(/\r?\n/).slice(1).map(l => l.split(",")).map(c => [c[0], parseFloat(c[1])]).filter(([dt, v]) => /^\d{4}-\d\d-\d\d$/.test(dt) && isFinite(v));
  if (pts.length < 20) throw new Error("shape"); return pts;
};
const firstOk = async (fns, min = 20) => { let last; for (const f of fns) { try { const p = await f(); if (p.length >= min) return p; } catch (e) { last = e; } } throw last || new Error("no source"); };
// إزالة القفزات الشاذة المعكوسة (قراءات خاطئة)
const despike = (pts) => pts.filter((p, i) => { if (i === 0 || i === pts.length - 1) return true; const a = pts[i - 1][1], b = p[1], c = pts[i + 1][1]; return !(Math.abs(Math.log(b / a)) > 0.08 && Math.abs(Math.log(c / a)) < 0.03); });
// دمج السلاسل على تواريخ الذهب مع ملء الأمام للقيم المفقودة
const mergeHistory = (goldPts, series) => {
  const ptr = {}, last = {}; Object.keys(series).forEach(k => { ptr[k] = 0; last[k] = null; });
  return goldPts.map(([date, gold]) => {
    const row = { date, gold: +gold.toFixed(2), src: "hist" };
    for (const k of Object.keys(series)) { const s = series[k]; while (ptr[k] < s.length && s[ptr[k]][0] <= date) { last[k] = s[ptr[k]][1]; ptr[k]++; } row[k] = last[k] === null ? (k === "sar" ? SAR_PEG : null) : +(+last[k]).toFixed(4); }
    return row;
  });
};
const HIST_STEPS = ["gold", "sar", "egp", "dxy", "vix", "ry"];
const renderHistSteps = () => {
  const el = $("histSteps"); if (!el) return; const st = state.hist;
  el.innerHTML = st ? HIST_STEPS.map(k => { const s = st[k] || { s: "wait" }; const ic = { wait: "○", run: '<span class="spin"></span>', ok: "✓", fail: "✗" }[s.s]; const col = { ok: "var(--good)", fail: "var(--bad)" }[s.s] || "var(--ink-2)"; return `<li style="color:${col}">${ic} ${t("hist.s." + k)}${s.note ? ` <span class="faint">(${escHtml(t(s.note))})</span>` : ""}</li>`; }).join("") : "";
};
let histBusy = false;
async function downloadHistory(range, { silent = false } = {}) {
  if (histBusy) return; histBusy = true; lsSet(HISTTRY_KEY, String(Date.now()));
  const st = {}; HIST_STEPS.forEach(k => { st[k] = { s: "wait" }; }); state.hist = st; renderHistSteps(); $("btnHist").disabled = true; setMsg("histMsg", [["hist.running"]], true);
  const set = (k, s, note) => { st[k] = { s, note }; renderHistSteps(); };
  const run = async (k, fn) => { set(k, "run"); try { const p = await fn(); set(k, "ok", p.note || (p.length + "")); return p; } catch (e) { set(k, "fail", errMsg(e)); return null; } };
  // نجلب كل مرشحي الذهب ونختار السلسلة التي آخر إغلاق فيها أقرب للسعر الحي (لا أول مصدر يرد)
  const gold = await run("gold", async () => {
    const lv = loadLive(), ref = (lv && lv.price > 0 && lv.source !== "manual") ? lv.price : null;
    const cands = [["Yahoo XAUUSD=X", () => yahooPts("XAUUSD=X", range)], ["Yahoo GC=F", () => yahooPts("GC=F", range)], ["Stooq XAUUSD", () => stooqPts("xauusd", range)]];
    const res = await Promise.allSettled(cands.map(([, f]) => f())); let best = null;
    res.forEach((r, i) => { if (r.status !== "fulfilled") return; const pts = despike(r.value); if (pts.length < 20) return; const last = pts[pts.length - 1][1], dev = ref ? Math.abs(Math.log(last / ref)) : i; if (!best || dev < best.dev) best = { pts, name: cands[i][0], last, dev }; });
    if (!best) throw new Error("no source");
    best.pts.note = `${best.pts.length} · ${best.name} · ${fmt(best.last)}$` + (ref && best.dev > 0.1 ? ` ⚠ ≠ ${fmt(ref)}$` : "");
    return best.pts;
  });
  if (!gold) { setMsg("histMsg", [["hist.failed"]]); if (!silent) toast(t("hist.failed")); histBusy = false; $("btnHist").disabled = false; return; }
  const series = {};
  series.sar = await run("sar", () => firstOk([() => yahooPts("SAR=X", range), () => stooqPts("usdsar", range)], 5));
  series.egp = await run("egp", () => firstOk([() => yahooPts("EGP=X", range), () => stooqPts("usdegp", range)], 5));
  series.dxy = await run("dxy", () => firstOk([() => yahooPts("DX-Y.NYB", range), () => stooqPts("dx.f", range)], 5));
  series.vix = await run("vix", () => firstOk([() => yahooPts("^VIX", range)], 5));
  series.realYield = await run("ry", () => firstOk([() => fredPts("DFII10", range)], 5));
  Object.keys(series).forEach(k => { if (!series[k]) delete series[k]; });
  const rows = mergeHistory(gold, series), map = new Map(rows.map(r => [r.date, r]));
  // الدمج: صفوفك اليدوية (manual/csv) تبقى كما هي؛ أما الصفوف الآلية القديمة فتُستبدل بالمصدر المتسق الجديد
  const nn = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  loadData().forEach(r => { const d = map.get(r.date); if (!d) { map.set(r.date, r); return; } map.set(r.date, (r.src === "manual" || r.src === "csv") ? { ...d, ...nn(r) } : { ...r, ...nn(d) }); });
  const out = [...map.values()].sort((a, b) => a.date < b.date ? -1 : 1);
  saveData(out); dataCache = null;
  const hp = { n: gold.length, a: gold[0][0], b: gold[gold.length - 1][0] };
  setMsg("histMsg", [["hist.done", hp]]); if (!silent) toast(t("hist.done", hp), 5000);
  histBusy = false; $("btnHist").disabled = false; refreshAll(true);
}
