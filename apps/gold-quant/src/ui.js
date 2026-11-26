// ===================== الحسابات المركبة =====================
const runSimulation = () => {
  const ref = currentRef(), s = state.settings;
  state.sigmaInfo = estimateSigma(ref.rowsV, s);
  state.S0 = ref.price; state.S0usd = ref.priceUsd; state.fx = { sar: ref.sar, egp: ref.egp, now: ref.fxNow };
  if (!ref.price) { state.mc = null; return; }
  const t0 = performance.now();
  state.mc = monteCarlo(ref.price, state.sigmaInfo.sigma, s.mu, s.nu, Math.round(s.nSims));
  state.mcMs = performance.now() - t0;
};
// القيمة العادلة بالدولار/أونصة (نموذج عالمي)، ونسبة العدالة بالدولار، ومعادلها بعملة العرض
const currentFair = () => {
  const s = state.settings, v = s.fvInputs, fv = fairValue(+v.realYield, +v.dxy, +v.cbFlows, +v.geoIndex, s.coeffs);
  const ratio = (state.S0usd && fv > 0) ? state.S0usd / fv : NaN, fx = currentRef().fxNow;
  return { fv, ratio, cls: classifyFairness(ratio), fvView: (fv > 0 && fx) ? toView(fv, fx, s) : null };
};
const fmtV = (x) => fmt(x, state.settings.unit === "g" ? 2 : 1);
// إشارة التداول: العدالة + موقع السعر من نطاق الأمس + الانحياز اليدوي
const tradingSignal = () => {
  const reasons = []; let score = 0; const fair = currentFair(), r = isFinite(fair.ratio) ? fair.ratio.toFixed(3) : "";
  if (isFinite(fair.ratio)) {
    if (fair.ratio < 0.85) { score += 1; reasons.push(t("sg.under", { r })); }
    else if (fair.ratio > 1.15) { score -= 1; reasons.push(t("sg.over", { r })); }
    else if (fair.ratio < 0.95) { score += 0.5; reasons.push(t("sg.fairCheap", { r })); }
    else if (fair.ratio > 1.05) { score -= 0.5; reasons.push(t("sg.fairRich", { r })); }
    else reasons.push(t("sg.fair", { r }));
  } else reasons.push(t("sg.noFair"));
  const ref = currentRef(), s = state.settings;
  if (ref.price && ref.prev) {
    const sameDay = ref.source === "live" && ref.last && String(ref.live.updatedAt).slice(0, 10) === ref.last.date;
    const rowsPrev = (ref.source === "live" && ref.last && !sameDay) ? ref.rowsV : ref.rowsV.slice(0, -1);
    const sg = estimateSigma(rowsPrev, s, { ewmaOnly: true }).sigma, q = tStdQuantiles(s.nu);
    const b = { p5: bandAt(ref.prev, sg, BASE_MU, q[0.05]), p10: bandAt(ref.prev, sg, BASE_MU, q[0.1]), p90: bandAt(ref.prev, sg, BASE_MU, q[0.9]), p95: bandAt(ref.prev, sg, BASE_MU, q[0.95]) };
    if (ref.price > b.p95) { score -= 1; reasons.push(t("sg.aboveP95", { v: fmt(b.p95) })); }
    else if (ref.price > b.p90) { score -= 0.5; reasons.push(t("sg.aboveP90", { v: fmt(b.p90) })); }
    else if (ref.price < b.p5) { score += 1; reasons.push(t("sg.belowP5", { v: fmt(b.p5) })); }
    else if (ref.price < b.p10) { score += 0.5; reasons.push(t("sg.belowP10", { v: fmt(b.p10) })); }
    else reasons.push(t("sg.inside", { a: fmt(b.p10), b: fmt(b.p90) }));
  } else reasons.push(t("sg.noPrev"));
  if (Math.abs(s.mu) >= 0.001) { const m = s.mu > 0 ? 0.5 : -0.5; score += m; reasons.push(t(s.mu > 0 ? "sg.muUp" : "sg.muDown")); }
  const sig = score >= 1 ? { label: t("sg.buy"), en: "BUY", color: "var(--good)", icon: "▲" } : score <= -1 ? { label: t("sg.sell"), en: "SELL", color: "var(--bad)", icon: "▼" } : { label: t("sg.hold"), en: "HOLD", color: "var(--neutral)", icon: "●" };
  return { ...sig, score, reasons };
};
// الاختبار الرجعي (EWMA): نطاق P10–P90 لكل يوم من بيانات اليوم السابق فقط
const runBacktest = (mult = state.settings.sigmaMult) => {
  const rows = viewRows(), s = state.settings, r = logReturns(rows), q = tStdQuantiles(s.nu), pts = [];
  for (let i = 6; i < rows.length; i++) {
    const hist = r.slice(Math.max(0, i - 1 - 30), i - 1); if (hist.length < 5) continue;
    const sg = ewmaSigma(hist, s.lambda) * mult, S0 = +rows[i - 1].gold, St = +rows[i].gold;
    const lo = bandAt(S0, sg, BASE_MU, q[0.1]), hi = bandAt(S0, sg, BASE_MU, q[0.9]);
    pts.push({ date: rows[i].date, price: St, lo, hi, hit: St < lo || St > hi ? 1 : 0, below: St < lo, above: St > hi });
  }
  return pts;
};

// ===================== الرسوم =====================
const chartDefaults = () => { if (!window.Chart) return; Chart.defaults.font.family = isRTL() ? "'IBM Plex Sans Arabic', system-ui, sans-serif" : "system-ui, -apple-system, 'Segoe UI', sans-serif"; Chart.defaults.color = cssVar("--ink-2"); Chart.defaults.borderColor = cssVar("--grid"); };
const destroyChart = (k) => { if (state.charts[k]) { state.charts[k].destroy(); delete state.charts[k]; } };
const baseTooltip = () => ({ backgroundColor: cssVar("--ink"), titleColor: cssVar("--surface"), bodyColor: cssVar("--surface"), rtl: isRTL(), textDirection: isRTL() ? "rtl" : "ltr", padding: 10 });
const yPos = () => (isRTL() ? "right" : "left");
const renderHistoryChart = () => {
  destroyChart("history");
  const all = viewRows(), rng = state.settings.chartRange, rows = rng ? all.slice(-rng) : all, ut = unitText();
  $("historyEmpty").classList.toggle("hidden", rows.length > 0);
  document.querySelectorAll("#rangeBtns button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.r === rng)));
  if (!window.Chart || !rows.length) return;
  const gold = cssVar("--gold"), big = rows.length > 200, tdp = state.settings.unit === "g" ? 1 : 0;
  state.charts.history = new Chart($("chartHistory"), {
    type: "line",
    data: { labels: rows.map(r => r.date), datasets: [{ label: t("ch.series", { s: ut }), data: rows.map(r => r.gold), borderColor: gold, backgroundColor: gold, borderWidth: big ? 1.6 : 2, pointRadius: 0, pointHoverRadius: 5, tension: 0.15 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { ...baseTooltip(), callbacks: { label: (c) => ` ${fmt(c.parsed.y)} ${ut}` } } },
      scales: { x: { reverse: isRTL(), grid: { display: false }, ticks: { maxTicksLimit: 7, callback: function (v) { const l = this.getLabelForValue(v); return rows.length > 150 ? l.slice(0, 7) : l.slice(5); } } }, y: { position: yPos(), title: { display: true, text: ut }, ticks: { callback: (v) => fmt(v, tdp) } } } }
  });
};
const renderBoxChart = () => {
  destroyChart("box"); destroyChart("hist");
  const mc = state.mc; if (!window.Chart || !mc) return;
  const span = mc.p95 - mc.p5, eps = span * 0.004, lab = unitText(), tdp = state.settings.unit === "g" ? 1 : 0;
  state.charts.box = new Chart($("chartBox"), {
    type: "bar",
    data: { labels: [lab], datasets: [
      { order: 4, label: t("bx.90"), data: [[mc.p5, mc.p95]], backgroundColor: cssVar("--gold-band-90"), borderRadius: 4, barPercentage: 0.9, categoryPercentage: 0.9, borderSkipped: false },
      { order: 3, label: t("bx.80"), data: [[mc.p10, mc.p90]], backgroundColor: cssVar("--gold-band-80"), borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.9, borderSkipped: false },
      { order: 2, label: t("bx.p50"), data: [[mc.p50 - eps, mc.p50 + eps]], backgroundColor: cssVar("--gold-mid"), barPercentage: 0.9, categoryPercentage: 0.9, borderSkipped: false },
      { order: 1, type: "scatter", label: t("bx.cur"), data: [{ x: state.S0, y: lab }], pointStyle: "rectRot", pointRadius: 7, pointHoverRadius: 9, backgroundColor: cssVar("--ink"), borderColor: cssVar("--surface"), borderWidth: 2 }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, datasets: { bar: { grouped: false } },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { ...baseTooltip(), callbacks: { label: (c) => { const v = c.raw; if (Array.isArray(v)) return c.dataset.label === t("bx.p50") ? ` P50: ${fmt(mc.p50)}` : ` ${c.dataset.label}: ${fmt(v[0])} – ${fmt(v[1])}`; return ` ${t("bx.cur")}: ${fmt(state.S0)}`; } } } },
      scales: { x: { min: mc.p5 - span * 0.15, max: mc.p95 + span * 0.15, reverse: isRTL(), title: { display: true, text: lab }, ticks: { callback: (v) => fmt(v, tdp) } }, y: { grid: { display: false } } } }
  });
  const bins = 40, lo = percentile(mc.all, 0.005), hi = percentile(mc.all, 0.995), w = (hi - lo) / bins, counts = new Array(bins).fill(0);
  mc.all.forEach(x => { const i = Math.floor((x - lo) / w); if (i >= 0 && i < bins) counts[i]++; });
  const centers = counts.map((_, i) => lo + (i + 0.5) * w);
  state.charts.hist = new Chart($("chartHist"), {
    type: "bar",
    data: { labels: centers.map(c => fmt(c, tdp)), datasets: [{ label: t("bx.count"), data: counts, backgroundColor: centers.map(c => (c >= mc.p10 && c <= mc.p90) ? cssVar("--gold-band-80") : cssVar("--gold-band-90")), borderRadius: 2, barPercentage: 1, categoryPercentage: 0.92 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...baseTooltip(), callbacks: { title: (it) => `≈ ${it[0].label} ${lab}`, label: (c) => ` ${c.parsed.y} (${pct(c.parsed.y / mc.all.length)})` } } }, scales: { x: { reverse: isRTL(), grid: { display: false }, ticks: { maxTicksLimit: 6 } }, y: { display: false } } }
  });
};
const renderBacktestChart = (pts) => {
  destroyChart("bt"); if (!window.Chart || !pts.length) return; $("btChartWrap").classList.remove("hidden");
  const view = pts.slice(-400), band = cssVar("--gold-band-90");
  state.charts.bt = new Chart($("chartBacktest"), {
    type: "line",
    data: { labels: view.map(p => p.date), datasets: [
      { order: 3, label: "P90", data: view.map(p => p.hi), borderColor: band, backgroundColor: band, borderWidth: 1, pointRadius: 0, fill: "+1" },
      { order: 2, label: "P10", data: view.map(p => p.lo), borderColor: band, backgroundColor: band, borderWidth: 1, pointRadius: 0, fill: false },
      { order: 1, label: t("bt.actual"), data: view.map(p => p.price), borderColor: cssVar("--gold"), borderWidth: 2, tension: 0.1, pointRadius: view.map(p => p.hit ? 4 : 0), pointBackgroundColor: view.map(p => p.hit ? cssVar("--bad") : cssVar("--gold")), pointBorderColor: cssVar("--surface"), pointBorderWidth: 1.5 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } }, tooltip: { ...baseTooltip(), callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed.y)}`, afterBody: (it) => view[it[0].dataIndex].hit ? t("bt.breach") : "" } } },
      scales: { x: { reverse: isRTL(), grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { position: yPos(), title: { display: true, text: unitText() }, ticks: { callback: (v) => fmt(v, state.settings.unit === "g" ? 1 : 0) } } } }
  });
};

// ===================== العرض =====================
const kpiCard = (title, value, unit, sub, subColor, badge, cls = "") => `
  <div class="card p-3 sm:p-4 ${cls}">
    <div class="flex items-center justify-between gap-2"><div class="text-sm muted">${title}</div>${badge ? `<span class="mk">${badge}</span>` : ""}</div>
    <div class="mt-1 text-xl sm:text-2xl font-bold kv"><span class="num">${value}</span> <span class="num text-xs sm:text-sm faint font-normal">${unit}</span></div>
    <div class="text-xs mt-1" style="color:${subColor || "var(--ink-3)"}">${sub || "&nbsp;"}</div>
  </div>`;

const renderBanners = () => {
  const out = [], ref = currentRef(), n = ref.rows.length;
  if (state.sigmaInfo && state.sigmaInfo.isDefault) out.push(`<div class="banner banner-warn">⚠ ${t("b.noData")} <button class="btn mt-2 sm:mt-0 sm:ms-2" id="btnBannerHist">${t("b.dl")}</button></div>`);
  else if (n < 250) out.push(`<div class="banner banner-info">ℹ ${t("b.fewData", { n })} <button class="btn mt-2 sm:mt-0 sm:ms-2" id="btnBannerHist">${t("b.dl")}</button></div>`);
  if (state.liveErr) out.push(`<div class="banner banner-warn">⚠ ${escHtml(liveErrText())}</div>`);
  else if (ref.source === "data" && ref.last) out.push(`<div class="banner banner-info">ℹ ${t("b.lastKnown", { d: ref.last.date })}</div>`);
  if (ref.source === "none") out.push(`<div class="banner banner-info">ℹ ${t("b.noPrice")}</div>`);
  if (state.settings.market === "EG" && !ref.egp && ref.source !== "none") out.push(`<div class="banner banner-warn">⚠ ${t("b.noEgp")}</div>`);
  $("banners").innerHTML = out.join("");
  const b = $("btnBannerHist"); if (b) b.addEventListener("click", () => { switchTab("data"); downloadHistory($("histRange").value); });
};
// شريط العرض: الدولة/الوزن/العيار (القوائم لا تُعاد بناؤها إلا عند تغيير اللغة حفاظاً على تركيز لوحة المفاتيح)
const renderViewBar = (rebuild = false) => {
  const s = state.settings;
  if (rebuild || !$("selMarket").options.length) {
    $("selMarket").innerHTML = MARKET_ORDER.map(m => `<option value="${m}">${t("mk." + m)} · ${MARKETS[m].cur}</option>`).join("");
    $("selUnit").innerHTML = ["g", "oz"].map(u => `<option value="${u}">${t("unit." + u)}</option>`).join("");
    $("selKarat").innerHTML = KARATS.map(k => `<option value="${k}">${k}K</option>`).join("");
  }
  $("selMarket").value = s.market; $("selUnit").value = s.unit; $("selKarat").value = String(s.karat);
  $("viewSummary").textContent = t("view.summary", { c: MARKETS[s.market].cur, u: t("unit." + s.unit), k: s.karat });
};
// شريط أسعار الصرف مقابل الدولار (أعلى الشاشة، على اليسار): الذهب والريال والجنيه ومؤشر الدولار
const fxItem = (sym, val, chg) => `<span class="fxi"><span class="sym">${sym}</span><span class="px">${val}</span>${chg === null ? "" : `<span class="chg ${chg > 5e-5 ? "up" : chg < -5e-5 ? "down" : "flat"}">${chg > 5e-5 ? "▲" : chg < -5e-5 ? "▼" : "■"} ${Math.abs(chg * 100).toFixed(2)}%</span>`}</span>`;
const renderFxBar = () => {
  const ref = currentRef(), rows = ref.rows, last = rows[rows.length - 1];
  const liveDate = ref.live && ref.live.updatedAt ? String(ref.live.updatedAt).slice(0, 10) : null;
  const prevRow = ref.source === "live" ? (last && liveDate === last.date ? rows[rows.length - 2] : last) : rows[rows.length - 2];
  const ch = (a, b) => (a > 0 && b > 0) ? a / b - 1 : null, pv = (k) => (prevRow ? +prevRow[k] : null), dxy = lastNonNull(rows, "dxy");
  const items = [fxItem("XAU/USD", ref.priceUsd ? fmt(ref.priceUsd) : "—", ch(ref.priceUsd, ref.prevUsd)), fxItem("USD/SAR", fmt(ref.sar, 4), ch(ref.sar, pv("sar"))), fxItem("USD/EGP", ref.egp ? fmt(ref.egp, 4) : "—", ch(ref.egp, pv("egp")))];
  if (dxy) items.push(fxItem("DXY", fmt(dxy, 2), ch(dxy, prevRow && +prevRow.dxy)));
  $("fxBar").innerHTML = `<div class="row max-w-7xl mx-auto px-4">${items.join("")}</div>`;
};
// ربط كل تسمية (label) بحقلها لقارئات الشاشة
const labelize = () => document.querySelectorAll("label.lbl").forEach(l => { if (l.htmlFor) return; const c = l.parentElement && l.parentElement.querySelector("input,select,textarea"); if (c) { if (!c.id) c.id = "f_" + Math.random().toString(36).slice(2, 8); l.htmlFor = c.id; } });

const renderDashboard = () => {
  const ref = currentRef(), s = state.settings, mk = s.market, cur = MARKETS[mk].cur, ut = unitText(), other = s.unit === "g" ? "oz" : "g";
  const chg = (ref.price && ref.prev) ? ref.price / ref.prev - 1 : null;
  const chgTxt = chg === null ? t("k.noPrev") : `${chg >= 0 ? "▲" : "▼"} ${pct(Math.abs(chg), 2)} ${t("k.today")}`, chgCol = chg === null ? null : (chg >= 0 ? "var(--good)" : "var(--bad)");
  const src = ref.source === "live" ? `${t("k.live")} · ${escHtml(srcName(ref.live.source))}` : (ref.last ? `${t("k.lastKnown")} · ${ref.last.date}` : "");
  const fx = ref.fxNow, prem = premFor(mk), fair0 = currentFair();
  const otherPrice = (ref.priceUsd && fx) ? toView(ref.priceUsd, fx, { ...s, unit: other }) : null;
  $("kpis").innerHTML = [
    kpiCard(t("k.price", { u: t("unit." + s.unit), k: s.karat }), ref.price ? fmt(ref.price) : "—", ut, `<span style="color:${chgCol || "var(--ink-3)"}">${chgTxt}</span> <span class="faint">· ${src}</span>`, null, cur),
    kpiCard(t("k.other", { u: t("unit." + other) }), otherPrice ? fmt(otherPrice) : "—", `${cur}/${t("unit." + other)}`, mk === "GL" ? "&nbsp;" : (fx ? `${t("k.fx")} USD/${cur} ${fmt(fx, 4)} · ${t("k.prem")} ${fmt(prem)}` : t("k.noFx")), null, cur),
    kpiCard(t("k.spot"), ref.priceUsd ? fmt(ref.priceUsd) : "—", "USD/oz", "&nbsp;", null, "USD"),
    kpiCard(t("fair.ratio"), isFinite(fair0.ratio) ? fair0.ratio.toFixed(3) : "—", "", `<span style="color:${fair0.cls.color}">${fair0.cls.icon} ${fair0.cls.label}</span>${fair0.fvView ? ` · ${t("fv.fvLabel")} ${fmt(fair0.fvView)}` : ""}`, null, "")
  ].join("");
  if (ref.price && state.shownPrice !== undefined && state.shownPrice !== ref.price) document.querySelectorAll("#kpis .card").forEach(c => { c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); });
  state.shownPrice = ref.price;

  const sig = tradingSignal(), fair = currentFair();
  $("signalCard").innerHTML = `
    <div class="text-sm muted">${t("sg.title")}</div>
    ${helpHtml("help.signal")}
    <div class="flex items-center gap-3 mt-2">
      <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style="background:color-mix(in srgb, ${sig.color} 14%, transparent);color:${sig.color}">${sig.icon}</div>
      <div><div class="text-3xl font-bold" style="color:${sig.color}">${sig.label}</div><div class="text-xs faint num">${sig.en} · score ${sig.score > 0 ? "+" : ""}${sig.score}</div></div>
    </div>
    <ul class="text-xs muted mt-4 space-y-1.5 leading-5 flex-1">${sig.reasons.map(r => `<li>• ${r}</li>`).join("")}</ul>
    <div class="mt-3 pt-3 border-t text-sm flex justify-between items-center gap-2" style="border-color:var(--border)"><span class="muted">${t("fair.ratio")}</span>
      <span><span class="num font-bold">${isFinite(fair.ratio) ? fair.ratio.toFixed(3) : "—"}</span> <span class="pill" style="color:${fair.cls.color}">${fair.cls.icon} ${fair.cls.label}</span></span></div>
    <p class="text-[11px] faint mt-2">${t("sg.disc")}</p>`;
  const mc = state.mc, si = state.sigmaInfo;
  $("miniStats").innerHTML =
    kpiCard(t("ms.sigma"), si ? pct(si.sigma, 2) : "—", "σ", si ? (si.isDefault ? t("ms.sigmaDef") : `${si.model === "garch" ? "GARCH(1,1)" : "EWMA"} · ${t("ms.from", { n: si.n })}${s.sigmaMult !== 1 ? " · ×" + s.sigmaMult : ""}`) : "", si && si.isDefault ? "var(--warn)" : null) +
    kpiCard(t("ms.band80"), mc ? `${fmtV(mc.p10)} – ${fmtV(mc.p90)}` : "—", ut, mc ? `${t("ms.band90")}: ${fmtV(mc.p5)} – ${fmtV(mc.p95)}` : "") +
    kpiCard(t("ms.data"), String(ref.rows.length), t("ms.days"), ref.rows.length ? `${ref.rows[0].date} → ${ref.rows[ref.rows.length - 1].date}` : "");
  renderHistoryChart();
};

const renderForecast = () => {
  const mc = state.mc, s = state.settings, ut = unitText(); $("inMu").value = s.mu;
  if (!mc) { $("tblGlobalBands").innerHTML = `<tr><td class="faint">${t("fc.noPrice")}</td></tr>`; $("tblLocal").innerHTML = ""; $("probStats").innerHTML = ""; $("simMeta").textContent = ""; renderBoxChart(); return; }
  const S0 = state.S0;
  const rowsP = [["P5", mc.p5, "fc.d5"], ["P10", mc.p10, "fc.d10"], ["P50", mc.p50, "fc.d50"], ["P90", mc.p90, "fc.d90"], ["P95", mc.p95, "fc.d95"]];
  $("tblGlobalBands").innerHTML = `<thead><tr><th>${t("fc.pct")}</th><th>${ut}</th><th>${t("fc.chg")}</th><th>${t("fc.mean")}</th></tr></thead><tbody>` + rowsP.map(([k, v, d]) => `<tr><td class="font-semibold">${k}</td><td><span class="num">${fmt(v)}</span></td><td><span class="num" style="color:${v >= S0 ? "var(--good)" : "var(--bad)"}">${v >= S0 ? "+" : ""}${pct(v / S0 - 1, 2)}</span></td><td class="muted">${t(d)}</td></tr>`).join("") + `</tbody>`;
  const N = mc.all.length, above90 = mc.all.filter(x => x > mc.p90).length / N, below10 = mc.all.filter(x => x < mc.p10).length / N, up = mc.all.filter(x => x > S0).length / N;
  const target = num($("inTarget").value), pT = target ? mc.all.filter(x => x > target).length / N : null, hist = state.backtest;
  const stat = (k, v, sub) => `<div class="stat"><div class="k">${k}</div><div class="v num">${v}</div><div class="s">${sub || ""}</div></div>`;
  $("probStats").innerHTML = stat(t("pr.above90"), pct(above90), hist ? t("pr.histRate", { v: pct(hist.aboveRate) }) : t("pr.runCov")) + stat(t("pr.below10"), pct(below10), hist ? t("pr.histRate", { v: pct(hist.belowRate) }) : t("pr.approx10")) +
    stat(t("pr.up"), pct(up), `${t("pr.cur")} ${fmt(S0)}`) + stat(t("pr.target"), pT === null ? "—" : pct(pT), target ? `${t("pr.tg")} ${fmt(target)}` : t("pr.enterTarget"));
  const si = state.sigmaInfo;
  $("simMeta").textContent = `${N.toLocaleString("en-US")} · σ=${pct(si.sigma, 2)} (${si.model === "garch" ? "GARCH" : si.isDefault ? t("ms.sigmaDef") : "EWMA"}) · nu=${s.nu} · mu=${s.mu} · ${state.mcMs ? state.mcMs.toFixed(0) + "ms" : ""}`;
  // الأسعار حسب العيار: (القيمة − المصنعية) × k/عيار_العرض + المصنعية (تحويل خطي دقيق)
  const prem = premPerUnit(s.market, s.unit, s), byK = (v, k) => (v - prem) * k / s.karat + prem, keys = ["p5", "p10", "p50", "p90", "p95"], ref = currentRef();
  $("tblLocal").innerHTML = `<thead><tr><th>${t("lc.karat")}</th><th>${t("pr.cur")} (${ut})</th>${keys.map(k => `<th>${k.toUpperCase()}</th>`).join("")}</tr></thead><tbody>` +
    KARATS.map(k => `<tr><td>${k}K${k === s.karat ? " ✓" : ""}</td><td class="font-semibold"><span class="num">${fmt(byK(S0, k))}</span></td>${keys.map(q => `<td><span class="num">${fmt(byK(mc[q], k))}</span></td>`).join("")}</tr>`).join("") + `</tbody>`;
  $("localMeta").textContent = t("lc.meta", { sar: fmt(ref.sar, 4), egp: fmt(ref.egp, 4), pa: fmt(s.premiumSA), pe: fmt(s.premiumEG) });
  renderBoxChart();
};

const renderFairInputs = () => {
  const s = state.settings;
  const cf = [["alpha", "fv.alpha"], ["beta1", "fv.b1"], ["beta2", "fv.b2"], ["beta3", "fv.b3"], ["beta4", "fv.b4"]];
  $("coeffInputs").innerHTML = cf.map(([k, l]) => `<div><label class="lbl">${t(l)}</label><input type="number" step="any" class="inp" data-coeff="${k}" value="${s.coeffs[k]}"></div>`).join("");
  const vr = [["realYield", "fv.ry"], ["dxy", "fv.dxy"], ["cbFlows", "fv.cb"], ["geoIndex", "fv.geo"]];
  $("varInputs").innerHTML = vr.map(([k, l]) => `<div><label class="lbl">${t(l)}</label><input type="number" step="any" class="inp" data-fv="${k}" value="${s.fvInputs[k]}"></div>`).join("");
  labelize();
  document.querySelectorAll("[data-coeff]").forEach(el => el.addEventListener("input", () => { const v = num(el.value); if (v !== null) { state.settings.coeffs[el.dataset.coeff] = v; saveSettings(state.settings); renderFair(); renderDashboard(); } }));
  document.querySelectorAll("[data-fv]").forEach(el => el.addEventListener("input", () => { const v = num(el.value); if (v !== null) { state.settings.fvInputs[el.dataset.fv] = v; saveSettings(state.settings); renderFair(); renderDashboard(); } }));
};
const renderFair = () => {
  const f = currentFair(), s = state.settings, ut = unitText(), S0u = state.S0usd, gap = (S0u && isFinite(f.fv)) ? S0u - f.fv : null;
  $("fairResult").innerHTML =
    kpiCard(t("fv.fvLabel"), isFinite(f.fv) ? fmt(f.fv) : "—", "USD/oz", f.fv <= 0 ? t("fv.bad") : "", f.fv <= 0 ? "var(--bad)" : null) +
    kpiCard(t("fv.market"), S0u ? fmt(S0u) : "—", "USD/oz", gap === null ? "" : `${t("fv.gap")} ${gap >= 0 ? "+" : ""}${fmt(gap)} $ (${pct(gap / f.fv, 1)})`) +
    `<div class="card p-4"><div class="text-sm muted">${t("fv.ratioLbl")}</div><div class="mt-1 text-2xl font-bold num">${isFinite(f.ratio) ? f.ratio.toFixed(3) : "—"}</div><div class="mt-2"><span class="pill" style="color:${f.cls.color}">${f.cls.icon} ${f.cls.label}</span></div><div class="text-[11px] faint mt-2">${t("fv.legend")}</div></div>`;
  $("tblFairLocal").innerHTML = `<thead><tr><th>${t("lc.market")}</th><th>${t("fv.fair24")} (${ut})</th><th>${t("fv.mkt24")} (${ut})</th><th>${t("fv.gap")}</th></tr></thead><tbody><tr><td>${t("mk." + s.market)} · ${s.karat}K</td>` +
    (f.fvView && state.S0 ? `<td><span class="num">${fmt(f.fvView)}</span></td><td><span class="num">${fmt(state.S0)}</span></td><td><span class="num" style="color:${f.ratio > 1 ? "var(--bad)" : "var(--good)"}">${f.ratio >= 1 ? "+" : ""}${pct(f.ratio - 1, 1)}</span></td>` : `<td colspan="3" class="faint">—</td>`) + `</tr></tbody>`;
};
const renderDataTable = () => {
  const rows = loadData(); $("rowCount").textContent = `(${rows.length})`;
  if (!rows.length) { $("tblData").innerHTML = `<tr><td class="faint">${t("row.none")}</td></tr>`; $("btnShowAll").classList.add("hidden"); return; }
  const f = (v, d) => (v === null || v === undefined || v === "") ? "—" : fmt(+v, d);
  const items = rows.map((r, i) => ({ r, ret: i > 0 ? Math.log(+r.gold / +rows[i - 1].gold) : null })).reverse(), shown = state.showAllRows ? items : items.slice(0, 250);
  $("btnShowAll").classList.toggle("hidden", state.showAllRows || items.length <= 250);
  $("tblData").innerHTML = `<thead><tr><th>${t("f.dateS")}</th><th>${t("f.goldS")}</th><th>USD/SAR</th><th>USD/EGP</th><th>${t("f.ryS")}</th><th>${t("f.dxyS")}</th><th>VIX</th><th>${t("f.ret")}</th><th></th></tr></thead><tbody>` +
    shown.map(({ r, ret }) => `<tr><td class="num">${r.date}</td><td><span class="num">${f(r.gold, 2)}</span></td><td><span class="num">${f(r.sar, 4)}</span></td><td><span class="num">${f(r.egp, 4)}</span></td><td><span class="num">${f(r.realYield, 2)}</span></td><td><span class="num">${f(r.dxy, 2)}</span></td><td><span class="num">${f(r.vix, 2)}</span></td><td><span class="num" style="color:${ret === null ? "var(--ink-3)" : ret >= 0 ? "var(--good)" : "var(--bad)"}">${ret === null ? "—" : (ret >= 0 ? "+" : "") + pct(ret, 2)}</span></td><td><button class="text-xs btn-danger" data-del="${r.date}" title="${t("row.del")}">✕</button></td></tr>`).join("") + `</tbody>`;
  document.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => { if (!confirm(t("row.delQ", { d: b.dataset.del }))) return; saveData(loadData().filter(r => r.date !== b.dataset.del)); refreshAll(true); }));
};
const renderSettings = () => {
  const s = state.settings;
  $("sPremSA").value = s.premiumSA; $("sPremEG").value = s.premiumEG; $("sLambda").value = s.lambda; $("sNu").value = s.nu; $("sMult").value = s.sigmaMult; $("sN").value = s.nSims;
  $("sVolModel").value = s.volModel; $("sBasis").value = s.basis; $("sRefresh").value = String(s.refreshMin); $("sAutoRow").checked = !!s.autoRow; $("sAutoHist").checked = !!s.autoHist;
};

// ===================== الاختبارات الإحصائية =====================
const doCoverage = () => {
  const pts = runBacktest();
  if (pts.length < 10) { $("coverageResult").innerHTML = `<div class="banner banner-warn">${t("bt.few", { n: loadData().length })}</div>`; return null; }
  const n = pts.length, cov = pts.filter(p => !p.hit).length / n, above = pts.filter(p => p.above).length / n, below = pts.filter(p => p.below).length / n;
  state.backtest = { pts, cov, aboveRate: above, belowRate: below };
  const tol = Math.max(0.05, 2 * Math.sqrt(0.16 / n)), far = Math.abs(cov - 0.8) > tol; let suggestion = "";
  if (far) {
    let lo = 0.2, hi = 4; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; const c = runBacktest(mid).filter(p => !p.hit).length / n; if (c < 0.8) lo = mid; else hi = mid; }
    const k = +(((lo + hi) / 2).toFixed(2)), si = state.sigmaInfo, ns = si ? si.raw * k : null; state.suggestMult = k;
    suggestion = `<div class="mt-2">⚠ ${t("bt.recal", { k: `<b class="num">${k}</b>` })}${ns ? " " + t("bt.newSigma", { a: `<b class="num">${pct(ns, 2)}</b>`, b: pct(si.sigma, 2) }) : ""} <button class="btn mt-2 sm:mt-0 sm:ms-2" id="btnApplyMult">${t("bt.apply")}</button></div>`;
  }
  $("coverageResult").innerHTML = `<div class="banner ${far ? "banner-warn" : "banner-good"}"><div><b>${t("bt.actualCov")}: <span class="num">${pct(cov)}</span></b> ${t("bt.of", { n })} ${t("bt.exp", { tol: pct(tol, 1) })} ${t("bt.above")}: <span class="num">${pct(above)}</span> · ${t("bt.below")}: <span class="num">${pct(below)}</span> ${t("bt.exp10")}</div>${far ? suggestion : `<div class="mt-1">✓ ${t("bt.good")}</div>`}</div>`;
  const ap = $("btnApplyMult"); if (ap) ap.addEventListener("click", () => { state.settings.sigmaMult = +(state.settings.sigmaMult * state.suggestMult).toFixed(3); saveSettings(state.settings); refreshAll(true); toast(t("bt.applied", { v: state.settings.sigmaMult })); });
  renderBacktestChart(pts); renderForecast(); return state.backtest;
};
const xlogy = (x, y) => (x === 0 ? 0 : x * Math.log(y));
const doChristoffersen = () => {
  const bt = state.backtest || doCoverage(); if (!bt) { $("christResult").innerHTML = ""; return; }
  const I = bt.pts.map(p => p.hit), p = 0.2, N = I.length, x = I.reduce((a, b) => a + b, 0); let n00 = 0, n01 = 0, n10 = 0, n11 = 0;
  for (let i = 1; i < N; i++) { const a = I[i - 1], b = I[i]; if (!a && !b) n00++; else if (!a && b) n01++; else if (a && !b) n10++; else n11++; }
  const ph = x / N, LRuc = Math.max(0, -2 * ((xlogy(N - x, 1 - p) + xlogy(x, p)) - (xlogy(N - x, 1 - ph) + xlogy(x, ph))));
  const pi01 = n01 / Math.max(1, n00 + n01), pi11 = n11 / Math.max(1, n10 + n11), pi = (n01 + n11) / Math.max(1, n00 + n01 + n10 + n11);
  const lnNull = xlogy(n00 + n10, 1 - pi) + xlogy(n01 + n11, pi), lnAlt = xlogy(n00, 1 - pi01) + xlogy(n01, pi01) + xlogy(n10, 1 - pi11) + xlogy(n11, pi11);
  const LRind = Math.max(0, -2 * (lnNull - lnAlt)), LRcc = LRuc + LRind, pInd = chi2Sf(LRind, 1), pUc = chi2Sf(LRuc, 1), pCc = chi2Sf(LRcc, 2), indOk = pInd > 0.05, ccOk = pCc > 0.05, noHits = x === 0;
  $("christResult").innerHTML = `<div class="banner ${noHits ? "banner-warn" : indOk ? "banner-good" : "banner-bad"} mt-2"><div class="font-bold mb-1">${t("ch.title2")}</div>${noHits ? `<div>${t("ch.noHits")}</div>` : ""}
    <div class="overflow-x-auto"><table class="tbl mt-1" style="color:inherit"><thead><tr><th>${t("ch.test")}</th><th>LR</th><th>p-value</th><th>${t("ch.result")}</th></tr></thead><tbody>
      <tr><td>${t("ch.uc")}</td><td class="num">${LRuc.toFixed(3)}</td><td class="num">${pUc.toFixed(3)}</td><td>${pUc > 0.05 ? "✓ " + t("ch.pass") : "✗ " + t("ch.fail")}</td></tr>
      <tr><td>${t("ch.ind")}</td><td class="num">${LRind.toFixed(3)}</td><td class="num">${pInd.toFixed(3)}</td><td>${indOk ? "✓ " + t("ch.indOk") : "✗ " + t("ch.indBad")}</td></tr>
      <tr><td>${t("ch.cc")}</td><td class="num">${LRcc.toFixed(3)}</td><td class="num">${pCc.toFixed(3)}</td><td>${ccOk ? "✓ " + t("ch.pass") : "✗ " + t("ch.fail")}</td></tr></tbody></table></div>
    <div class="text-xs mt-1">n00=${n00} · n01=${n01} · n10=${n10} · n11=${n11} · ${t("ch.after", { a: pct(pi11), b: pct(pi01) })} ${!indOk && !noHits ? t("ch.hint") : ""} ${t("ch.approx")}</div></div>`;
};

// ===================== CSV =====================
const CSV_HEADER = "date,gold_usd_oz,usd_sar,usd_egp,real_yield,dxy,vix";
const exportCSV = () => {
  const rows = loadData(); if (!rows.length) { toast(t("csv.none")); return; }
  const v = (x) => (x === null || x === undefined) ? "" : x;
  const csv = [CSV_HEADER, ...rows.map(r => [r.date, r.gold, v(r.sar), v(r.egp), v(r.realYield), v(r.dxy), v(r.vix)].join(","))].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `gold_data_${todayISO()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const parseCSV = (text) => {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map(l => l.trim()).filter(Boolean), sep = lines[0] && lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const out = []; let bad = 0;
  lines.forEach((l, idx) => { const c = l.split(sep).map(x => x.trim().replace(/^"|"$/g, "")); if (idx === 0 && isNaN(parseFloat(c[1]))) return; const d = new Date(c[0]);
    const row = { date: isNaN(d) ? null : d.toISOString().slice(0, 10), gold: num(c[1]), sar: num(c[2]), egp: num(c[3]), realYield: num(c[4]), dxy: num(c[5]), vix: num(c[6]) };
    if (row.date && row.gold > 0) out.push(row); else bad++; });
  return { rows: out, bad };
};
const importCSV = (file) => {
  const reader = new FileReader();
  reader.onload = () => { const { rows, bad } = parseCSV(String(reader.result)); if (!rows.length) { toast(t("csv.invalid")); return; }
    const map = new Map(loadData().map(r => [r.date, r])); let added = 0, updated = 0; rows.forEach(r => { if (map.has(r.date)) updated++; else added++; map.set(r.date, r); });
    saveData([...map.values()].sort((a, b) => a.date < b.date ? -1 : 1)); toast(t("csv.done", { a: added, u: updated, b: bad }), 4500); refreshAll(true); };
  reader.readAsText(file);
};
// بيانات تجريبية مصطنعة للتجربة دون اتصال (ليست أسعاراً حقيقية)
const makeDemo = () => {
  const rows = []; let p = 3500, egp = 48.5, ry = 1.8, dxy = 99, vix = 16; const d = new Date(); d.setDate(d.getDate() - 560);
  while (rows.length < 400) { d.setDate(d.getDate() + 1); if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dr = 0.0003 + 0.011 * studentT(5) / Math.sqrt(5 / 3); p *= Math.exp(dr); egp *= Math.exp(0.002 * randNormal()); ry += 0.02 * randNormal() - 0.2 * dr; dxy *= Math.exp(0.003 * randNormal() - 0.2 * dr); vix = Math.max(10, vix + 0.7 * randNormal() + 20 * Math.abs(dr) - 0.05 * (vix - 16));
    rows.push({ date: d.toISOString().slice(0, 10), gold: +p.toFixed(2), sar: 3.75, egp: +egp.toFixed(4), realYield: +ry.toFixed(2), dxy: +dxy.toFixed(2), vix: +vix.toFixed(2) }); }
  return rows;
};

// ===================== تحديث شامل وتبويبات =====================
const researchVisible = () => !$("tab-research").classList.contains("hidden");
const refreshAll = (resim = true) => {
  if (resim) { runSimulation(); state.backtest = null; $("coverageResult").innerHTML = ""; $("christResult").innerHTML = ""; destroyChart("bt"); $("btChartWrap").classList.add("hidden"); }
  renderBanners(); renderViewBar(); renderFxBar(); renderDashboard(); renderForecast(); renderFair(); renderDataTable(); renderSettings(); renderLiveBadge();
  if (researchVisible()) renderResearch();
};
const switchTab = (name) => {
  document.querySelectorAll(".tab-btn").forEach(x => x.classList.toggle("active", x.dataset.tab === name));
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("hidden", x.id !== "tab-" + name));
  lsSet("gold_tab", name); if (name === "research") renderResearch(); Object.values(state.charts).forEach(c => c.resize());
};
const setLang = (l) => {
  state.lang = l; lsSet(LANG_KEY, l); document.documentElement.lang = l; document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  applyStaticI18n(); chartDefaults(); renderViewBar(true); renderFairInputs(); refreshAll(false); renderFetchLog(); renderHistSteps(); Object.keys(state.msgs).forEach(renderMsg); $("toast").classList.remove("show"); $("toast").textContent = ""; if (state.backtest) { doCoverage(); }
};
const setTheme = (dark) => { document.documentElement.classList.toggle("dark", dark); lsSet(THEME_KEY, dark ? "dark" : "light"); chartDefaults(); refreshAll(false); if (state.backtest) renderBacktestChart(state.backtest.pts); };

const bind = () => {
  document.querySelectorAll(".tab-btn").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("btnTheme").addEventListener("click", () => setTheme(!document.documentElement.classList.contains("dark")));
  const onViewChange = () => { const st = state.settings; st.market = $("selMarket").value; st.unit = $("selUnit").value; st.karat = +$("selKarat").value; saveSettings(st); refreshAll(true); };
  ["selMarket", "selUnit", "selKarat"].forEach(id => $(id).addEventListener("change", onViewChange));
  $("btnHelp").addEventListener("click", () => { state.helpOn = !state.helpOn; lsSet(HELP_KEY, state.helpOn ? "1" : "0"); applyHelp(); });
  document.addEventListener("toggle", (e) => { const d = e.target; if (d && d.matches && d.matches("details.help")) { state.helpState[d.dataset.k] = d.open; lsSet(HELPSTATE_KEY, JSON.stringify(state.helpState)); } }, true);
  $("btnUpdate").addEventListener("click", () => { location.replace(location.pathname + "?v=" + encodeURIComponent(state.newVersion || Date.now())); });
  $("btnLang").addEventListener("click", () => setLang(state.lang === "ar" ? "en" : "ar"));
  const doFetch = () => { retryCount = 0; fetchLiveNow(); };
  $("btnFetchHeader").addEventListener("click", doFetch); $("btnFetchNow").addEventListener("click", doFetch);
  document.querySelectorAll("#rangeBtns button").forEach(b => b.addEventListener("click", () => { state.settings.chartRange = +b.dataset.r; saveSettings(state.settings); renderHistoryChart(); }));
  $("btnHist").addEventListener("click", () => downloadHistory($("histRange").value));
  $("btnManualLive").addEventListener("click", () => { const p = num($("qGold").value), a = num($("qSar").value), e = num($("qEgp").value); if (!(p > 300 && p < 50000) || !(a > 0) || !(e > 0)) { toast(t("man.invalid")); return; } applyManualLive(p, a, e); toast(t("man.applied")); });
  $("btnManualFill").addEventListener("click", () => { const r = currentRef(); if (r.price) $("qGold").value = r.price.toFixed(2); if (r.sar) $("qSar").value = (+r.sar).toFixed(4); if (r.egp) $("qEgp").value = (+r.egp).toFixed(4); });
  $("inMu").addEventListener("change", () => { const v = num($("inMu").value); if (v === null || Math.abs(v) > 0.1) { toast(t("fc.muBad")); return; } state.settings.mu = v; saveSettings(state.settings); });
  $("btnSimulate").addEventListener("click", () => { const v = num($("inMu").value); if (v !== null && Math.abs(v) <= 0.1) { state.settings.mu = v; saveSettings(state.settings); } runSimulation(); renderBanners(); renderForecast(); renderDashboard(); toast(t("fc.simDone")); });
  $("inTarget").addEventListener("input", renderForecast);
  $("btnCoverage").addEventListener("click", doCoverage); $("btnChristoffersen").addEventListener("click", doChristoffersen);
  $("rowForm").addEventListener("submit", (e) => { e.preventDefault(); const last = loadData().slice(-1)[0] || {};
    const row = { date: $("fDate").value, gold: num($("fGold").value), sar: num($("fSar").value) || last.sar || SAR_PEG, egp: num($("fEgp").value) || last.egp || null, realYield: num($("fRy").value), dxy: num($("fDxy").value), vix: num($("fVix").value) };
    if (!row.date || !(row.gold > 0)) { toast(t("row.invalid")); return; }
    if (last.gold && Math.abs(Math.log(row.gold / +last.gold)) > 0.15 && !confirm(t("row.jump"))) return;
    if (addRow(row)) { toast(t("row.added")); $("rowForm").reset(); $("fDate").value = todayISO(); refreshAll(true); } });
  $("btnExport").addEventListener("click", exportCSV); $("csvFile").addEventListener("change", (e) => { if (e.target.files[0]) importCSV(e.target.files[0]); e.target.value = ""; });
  $("btnClear").addEventListener("click", () => { if (confirm(t("row.clearQ"))) { saveData([]); refreshAll(true); toast(t("row.cleared")); } });
  $("btnDemo").addEventListener("click", () => { if (loadData().length && !confirm(t("row.demoQ"))) return; saveData(makeDemo()); refreshAll(true); toast(t("row.demoDone"), 4500); });
  $("btnShowAll").addEventListener("click", () => { state.showAllRows = true; renderDataTable(); });
  $("btnFvFromData").addEventListener("click", () => { const rows = loadData(); const ry = lastNonNull(rows, "realYield"), dx = lastNonNull(rows, "dxy"), vx = lastNonNull(rows, "vix"); if (ry === null && dx === null) { toast(t("fv.noData")); return; } if (ry !== null) state.settings.fvInputs.realYield = ry; if (dx !== null) state.settings.fvInputs.dxy = dx; if (vx !== null) state.settings.fvInputs.geoIndex = vx; saveSettings(state.settings); renderFairInputs(); renderFair(); renderDashboard(); toast(t("fv.used")); });
  $("btnFred").addEventListener("click", async () => { toast(t("fv.fredRun")); const [ry, dx] = await Promise.allSettled([fetchFredLast("DFII10"), fetchFredLast("DTWEXBGS")]); const m = [];
    if (ry.status === "fulfilled") { state.settings.fvInputs.realYield = ry.value.value; m.push(`DFII10=${ry.value.value} (${ry.value.date})`); } if (dx.status === "fulfilled") { state.settings.fvInputs.dxy = dx.value.value; m.push(`DTWEXBGS=${dx.value.value} (${dx.value.date})`); }
    saveSettings(state.settings); renderFairInputs(); renderFair(); renderDashboard(); toast(m.length ? m.join(" · ") : t("fv.fredFail"), 5000); });
  $("btnSaveSettings").addEventListener("click", () => { const s = state.settings; const g = (id, def, ok) => { const v = num($(id).value); return (v !== null && ok(v)) ? v : def; };
    s.premiumSA = g("sPremSA", s.premiumSA, v => v >= 0); s.premiumEG = g("sPremEG", s.premiumEG, v => v >= 0); s.lambda = g("sLambda", s.lambda, v => v > 0.5 && v < 1); s.nu = g("sNu", s.nu, v => v > 2);
    s.sigmaMult = g("sMult", s.sigmaMult, v => v > 0.05 && v < 10); s.nSims = Math.round(g("sN", s.nSims, v => v >= 1000 && v <= 100000));
    s.volModel = $("sVolModel").value; s.basis = $("sBasis").value; s.refreshMin = +$("sRefresh").value; s.autoRow = $("sAutoRow").checked; s.autoHist = $("sAutoHist").checked;
    saveSettings(s); scheduleNext(); refreshAll(true); toast(t("st.saved")); });
  $("btnResetModel").addEventListener("click", () => { if (!confirm(t("st.resetQ"))) return; state.settings = clone(DEFAULT_SETTINGS); saveSettings(state.settings); renderFairInputs(); scheduleNext(); refreshAll(true); toast(t("st.resetDone")); });
};

// ===================== التشغيل =====================
const init = () => {
  state.lang = lsGet(LANG_KEY) === "en" ? "en" : "ar"; state.settings = loadSettings();
  const th = lsGet(THEME_KEY); document.documentElement.classList.toggle("dark", th ? th === "dark" : (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches));
  document.documentElement.lang = state.lang; document.documentElement.dir = isRTL() ? "rtl" : "ltr";
  applyStaticI18n(); chartDefaults(); labelize(); if (!window.Chart) toast(t("toast.noChart"), 5000);
  $("fDate").value = todayISO(); bind(); renderFairInputs(); renderFetchLog(); refreshAll(true);
  const tab = lsGet("gold_tab"); if (tab && document.getElementById("tab-" + tab)) switchTab(tab);
  const live = loadLive(); if (live && live.fetchedAt) state.lastOk = new Date(live.fetchedAt).getTime();
  scheduleNext(1500); setInterval(tick, 1000);
  checkUpdate(); setInterval(checkUpdate, ["localhost", "127.0.0.1"].includes(location.hostname) ? 30000 : 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkUpdate(); if (state.nextAt && Date.now() >= state.nextAt) tick(); } });
  // تنزيل تاريخي تلقائي إن كانت البيانات قليلة (مرة كل 6 ساعات كحد أقصى)
  if (state.settings.autoHist && loadData().length < 250 && Date.now() - (+lsGet(HISTTRY_KEY) || 0) > 6 * 3600 * 1000) setTimeout(() => downloadHistory("5y", { silent: true }), 800);
};
document.addEventListener("DOMContentLoaded", init);
