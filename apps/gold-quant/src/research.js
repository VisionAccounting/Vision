// ===================== الدراسات الإحصائية المتقدمة =====================
// مقارنة تغطية EWMA وGARCH بإعادة تقدير GARCH كل 63 يوماً (Walk-forward) بلا نظر للمستقبل
const backtestCompare = (lr, s) => {
  const N = lr.length, start = 250; if (N < start + 80) return null;
  const q = tStdQuantiles(s.nu), res = { ewma: { n: 0, in80: 0, in90: 0 }, garch: { n: 0, in80: 0, in90: 0 } };
  for (let b = start; b < N; b += 63) {
    const end = Math.min(N, b + 63), off = Math.max(0, b - 1500), g = garchFit(lr.slice(off, b)); if (!g) continue;
    const h = garchFilter(lr.slice(off, end).map(x => x - g.mean), g, g.longRunVar);
    for (let i = b; i < end; i++) {
      const x = lr[i];
      for (const [name, sig] of [["garch", Math.sqrt(h[i - off])], ["ewma", ewmaSigma(lr.slice(Math.max(0, i - 30), i), s.lambda)]]) {
        const c = BASE_MU - 0.5 * sig * sig, R = res[name]; R.n++;
        if (x >= c + sig * q[0.1] && x <= c + sig * q[0.9]) R.in80++;
        if (x >= c + sig * q[0.05] && x <= c + sig * q[0.95]) R.in90++;
      }
    }
  }
  ["ewma", "garch"].forEach(k => { res[k].cov80 = res[k].in80 / res[k].n; res[k].cov90 = res[k].in90 / res[k].n; });
  return res;
};
const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
let researchMemo = { rows: null, sig: null, val: null };
const computeResearch = (rows) => {
  const last = rows[rows.length - 1], s = state.settings, sig = s.nu + "|" + s.lambda + "|" + viewSig();
  if (researchMemo.rows === rows && researchMemo.sig === sig) return researchMemo.val;
  if (rows.length < 60) return { insufficient: true, n: rows.length };
  const t0 = performance.now(), prices = rows.map(r => +r.gold), lr = logReturns(rows), N = lr.length, R = { n: N, from: rows[0].date, to: last.date };
  // 1) التوزيع والاختبارات
  const jb = jarqueBera(lr);
  R.dist = { meanAnn: mean(lr) * 252, volAnn: stdev(lr) * Math.sqrt(252), skew: jb.skew, kurt: jb.kurt, jb, mdd: maxDrawdown(prices), var95: histVaR(lr, 0.05), var99: histVaR(lr, 0.01) };
  R.tests = { adfP: adf(prices.map(Math.log)), adfR: adf(lr), lb: ljungBox(lr, 10), lb2: ljungBox(lr.map(v => v * v), 10), vr5: N > 60 ? varianceRatio(lr, 5) : null, vr20: N > 120 ? varianceRatio(lr, 20) : null, hurst: hurstRS(lr) };
  // 2) نماذج التقلب
  R.ewma = ewmaSigma(lr.slice(-30), s.lambda); R.g = getGarch(rows); R.gj = null;
  if (R.g) { try { R.gj = garchFit(lr.slice(-1500), { gjr: true }); } catch (e) { R.gj = null; } R.nuEst = estimateNu(R.g.z); R.volPct = R.g.sigmaPath.filter(x => x <= R.g.sigmaNext).length / R.g.sigmaPath.length; }
  // 3) الانحدار الكلي (مستويات وتغيّرات) والتكامل المشترك
  const vars = [["realYield", "RealYield"], ["dxy", "DXY"], ["vix", "VIX"]].filter(([k]) => rows.filter(r => r[k] !== null && r[k] !== undefined).length >= 100);
  R.regVars = vars.map(v => v[1]);
  if (vars.length) {
    const comp = rows.filter(r => vars.every(([k]) => r[k] !== null && r[k] !== undefined));
    if (comp.length >= 100) {
      const lvl = ols(comp.map(r => vars.map(([k]) => +r[k])), comp.map(r => +r.usd));
      if (lvl) R.regLvl = { ...lvl, n: comp.length, eg: engleGranger(lvl.resid, vars.length), names: ["α", ...vars.map(v => v[1])] };
    }
    const X = [], Y = [], dates = [], cols = { g: [], dxy: [], ry: [], vix: [] };
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; if (!vars.every(([k]) => a[k] != null && b[k] != null) || !(+a.usd > 0)) continue;
      const row = vars.map(([k]) => k === "dxy" ? Math.log(+b[k] / +a[k]) : (+b[k] - +a[k])); X.push(row); Y.push(Math.log(+b.usd / +a.usd)); dates.push(b.date); }
    if (X.length >= 100) { const f = ols(X, Y); if (f) R.regChg = { ...f, names: ["α", ...vars.map(v => v[1])] };
      const idx = (name) => vars.findIndex(v => v[1] === name);
      R.roll = {}; const W = 60;
      if (idx("DXY") >= 0 && X.length > W + 5) R.roll.dxy = { dates: dates.slice(W - 1), v: rollingCorr(Y, X.map(r => r[idx("DXY")]), W) };
      if (idx("RealYield") >= 0 && X.length > W + 5) R.roll.ry = { dates: dates.slice(W - 1), v: rollingCorr(Y, X.map(r => r[idx("RealYield")]), W) };
      const names = ["Gold", ...vars.map(v => v[1])], series = [Y, ...vars.map((v, j) => X.map(r => r[j]))];
      R.corr = { names, m: series.map(a => series.map(b => corr(a, b))) }; }
  }
  // 4) القراءة الإحصائية المركبة
  const comps = [], P = prices[prices.length - 1], sma200 = sma(prices, 200), fair = currentFair();
  if (sma200) comps.push({ k: "trend", w: 0.25, val: `${((P / sma200 - 1) * 100).toFixed(1)}%`, sc: clamp((P / sma200 - 1) / 0.1) });
  if (prices.length > 64) { const m = P / prices[prices.length - 64] - 1; comps.push({ k: "mom3", w: 0.15, val: `${(m * 100).toFixed(1)}%`, sc: clamp(m / 0.1) }); }
  if (prices.length > 253) { const m = P / prices[prices.length - 253] - 1; comps.push({ k: "mom12", w: 0.1, val: `${(m * 100).toFixed(1)}%`, sc: clamp(m / 0.25) }); }
  const rs = rsi(prices, 14); if (rs !== null) comps.push({ k: "rsi", w: 0.1, val: rs.toFixed(0), sc: rs > 70 ? -clamp((rs - 70) / 15, 0, 1) : rs < 30 ? clamp((30 - rs) / 15, 0, 1) : 0 });
  if (sma200) { const sd = stdev(prices.slice(-200)), z = (P - sma200) / sd; comps.push({ k: "z", w: 0.1, val: z.toFixed(2), sc: -clamp(z / 2.5) * 0.6 }); }
  if (R.volPct !== undefined) comps.push({ k: "vol", w: 0.1, val: `${(R.volPct * 100).toFixed(0)}%`, sc: R.volPct > 0.85 ? -0.5 : 0 });
  if (isFinite(fair.ratio)) comps.push({ k: "val", w: 0.2, val: fair.ratio.toFixed(2), sc: clamp((1 - fair.ratio) / 0.15) });
  const wsum = comps.reduce((a, c) => a + c.w, 0); R.comp = { items: comps, total: wsum ? comps.reduce((a, c) => a + c.w * c.sc, 0) / wsum : 0 };
  // 5) مقارنة النماذج رجعياً
  try { R.bt = backtestCompare(lr, s); } catch (e) { R.bt = null; }
  R.lr = lr; R.ms = performance.now() - t0; researchMemo = { rows, sig, val: R }; return R;
};

const statBox = (k, v, sub) => `<div class="stat"><div class="k">${k}</div><div class="v num">${v}</div><div class="s">${sub || ""}</div></div>`;
const verdict = (ok, yes, no) => `<span style="color:${ok ? "var(--good)" : "var(--warn)"}">${ok ? "✓ " + yes : "● " + no}</span>`;
const pv = (p) => p === null || p === undefined ? "—" : (p < 0.0001 ? "<0.0001" : p.toFixed(4));
let fanH = 21;
const renderResearch = () => {
  const root = $("researchRoot"), rows = viewRows(), vs = state.settings, ut = unitText();
  ["retHist", "volTerm", "fan", "roll"].forEach(destroyChart);
  const R = computeResearch(rows);
  if (R.insufficient) { root.innerHTML = `<div class="card p-5"><h2 class="font-bold mb-2">${t("rs.title")}</h2><p class="muted text-sm mb-3">${t("rs.need", { n: R.n })}</p><button class="btn btn-primary" id="rsDl">${t("b.dl")}</button></div>`; $("rsDl").addEventListener("click", () => { switchTab("data"); downloadHistory($("histRange").value); }); return; }
  const d = R.dist, T = R.tests, g = R.g, gj = R.gj, ann = Math.sqrt(252), S0 = state.S0 || +rows[rows.length - 1].gold, mu = state.settings.mu;
  const sec = (title, body, sub, hk) => `<div class="card p-4"><h2 class="font-bold mb-1">${title}</h2>${sub ? `<p class="text-xs faint mb-1">${sub}</p>` : ""}${hk ? helpHtml(hk) : '<div class="mb-2"></div>'}${body}</div>`;
  const parts = [];
  // رأس
  parts.push(`<div class="card p-4"><div class="flex flex-wrap items-center justify-between gap-2"><div><h2 class="font-bold">${t("rs.title")}</h2><p class="text-xs faint">${t("rs.sub", { n: R.n, a: R.from, b: R.to, ms: R.ms.toFixed(0) })}</p><p class="text-xs muted mt-1">${t("rs.viewNote", { c: MARKETS[vs.market].cur, u: t("unit." + vs.unit), k: vs.karat, b: t("st.basis." + vs.basis) })}</p></div><button class="btn" id="rsRecalc">${t("rs.recalc")}</button></div>${R.n < 250 ? `<p class="banner banner-warn mt-3 text-sm">${t("rs.few")}</p>` : ""}</div>`);
  // 1) التوزيع
  const eq = (c) => c ? "var(--bad)" : "var(--good)";
  parts.push(sec(t("rs.dist"), `<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">${statBox(t("rs.meanAnn"), pct(d.meanAnn, 1), t("rs.logRet"))}${statBox(t("rs.volAnn"), pct(d.volAnn, 1), "σ·√252")}${statBox(t("rs.skew"), d.skew.toFixed(2), d.skew < -0.2 ? t("rs.negSkew") : d.skew > 0.2 ? t("rs.posSkew") : t("rs.symm"))}${statBox(t("rs.kurt"), d.kurt.toFixed(2), d.kurt > 1 ? t("rs.fat") : t("rs.thin"))}
    ${statBox("VaR 95% (1d)", pct(d.var95.var, 2), `CVaR ${pct(d.var95.cvar, 2)}`)}${statBox("VaR 99% (1d)", pct(d.var99.var, 2), `CVaR ${pct(d.var99.cvar, 2)}`)}${statBox(t("rs.mdd"), pct(d.mdd, 1), t("rs.mddSub"))}${statBox("JB p-value", pv(d.jb.p), d.jb.p < 0.05 ? t("rs.notNormal") : t("rs.normalOk"))}</div><div class="chart-box" style="height:240px"><canvas id="chartRetHist"></canvas></div>`, t("rs.dist.sub"), "help.rs.dist"));
  // 2) اختبارات
  const rowT = (name, stat, p, vd) => `<tr><td>${name}</td><td><span class="num">${stat}</span></td><td><span class="num">${p}</span></td><td>${vd}</td></tr>`;
  const trs = [];
  if (T.adfP) trs.push(rowT(t("rs.adfP"), T.adfP.stat.toFixed(2), `${T.adfP.crit[5]} (5%)`, verdict(T.adfP.reject5, t("rs.stationary"), t("rs.unitRoot"))));
  if (T.adfR) trs.push(rowT(t("rs.adfR"), T.adfR.stat.toFixed(2), `${T.adfR.crit[5]} (5%)`, verdict(T.adfR.reject5, t("rs.stationary"), t("rs.unitRoot"))));
  trs.push(rowT(t("rs.lb"), T.lb.Q.toFixed(1), pv(T.lb.p), verdict(T.lb.p > 0.05, t("rs.noAc"), t("rs.ac"))));
  trs.push(rowT(t("rs.lb2"), T.lb2.Q.toFixed(1), pv(T.lb2.p), verdict(T.lb2.p > 0.05, t("rs.noArch"), t("rs.arch"))));
  if (T.vr5) trs.push(rowT("VR(5)", T.vr5.VR.toFixed(3), pv(T.vr5.p), verdict(T.vr5.p > 0.05, t("rs.rw"), T.vr5.VR > 1 ? t("rs.mom") : t("rs.mr"))));
  if (T.vr20) trs.push(rowT("VR(20)", T.vr20.VR.toFixed(3), pv(T.vr20.p), verdict(T.vr20.p > 0.05, t("rs.rw"), T.vr20.VR > 1 ? t("rs.mom") : t("rs.mr"))));
  if (T.hurst !== null) trs.push(rowT(t("rs.hurst"), T.hurst.toFixed(3), "≈0.55 iid", verdict(T.hurst > 0.42 && T.hurst < 0.62, t("rs.rw"), T.hurst >= 0.62 ? t("rs.persist") : t("rs.antiP"))));
  parts.push(sec(t("rs.tests"), `<div class="overflow-x-auto"><table class="tbl"><thead><tr><th>${t("ch.test")}</th><th>${t("rs.stat")}</th><th>p / ${t("rs.crit")}</th><th>${t("ch.result")}</th></tr></thead><tbody>${trs.join("")}</tbody></table></div>`, t("rs.tests.sub"), "help.rs.tests"));
  // 3) نماذج التقلب
  if (g) {
    const gr = (m, name) => m ? `<tr><td>${name}</td><td><span class="num">${m.alpha.toFixed(3)}</span></td><td><span class="num">${m.beta.toFixed(3)}</span></td><td><span class="num">${m.gamma ? m.gamma.toFixed(3) : "—"}</span></td><td><span class="num">${m.persistence.toFixed(3)}</span></td><td><span class="num">${isFinite(m.halfLife) ? m.halfLife.toFixed(0) : "∞"}</span></td><td><span class="num">${pct(m.sigmaNext * ann, 1)}</span></td><td><span class="num">${pct(m.longRunSigma * ann, 1)}</span></td><td><span class="num">${m.aic.toFixed(0)}</span></td></tr>` : "";
    parts.push(sec(t("rs.vol"), `<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">${statBox("EWMA σ", pct(R.ewma * ann, 1), t("rs.ann") + " · λ=" + state.settings.lambda)}${statBox("GARCH σ", pct(g.sigmaNext * ann, 1), t("rs.ann"))}${statBox(t("rs.longRun"), pct(g.longRunSigma * ann, 1), t("rs.ann"))}${statBox(t("rs.volPct"), pct(R.volPct, 0), R.volPct > 0.8 ? t("rs.hiVol") : R.volPct < 0.3 ? t("rs.loVol") : t("rs.midVol"))}</div>
      <div class="overflow-x-auto mb-3"><table class="tbl"><thead><tr><th>${t("rs.model")}</th><th>α</th><th>β</th><th>γ</th><th>${t("rs.persistence")}</th><th>${t("rs.half")}</th><th>σ ${t("rs.next")}</th><th>${t("rs.longRun")}</th><th>AIC</th></tr></thead><tbody>${gr(g, "GARCH(1,1)")}${gr(gj, "GJR-GARCH")}</tbody></table></div>
      <div class="flex flex-wrap items-center gap-3 mb-3"><span class="text-sm muted">${t("rs.nuEst")}: <b class="num">${R.nuEst.toFixed(1)}</b></span><button class="btn" id="rsApplyNu">${t("rs.applyNu")}</button><button class="btn" id="rsUseGarch">${t("rs.useGarch")}</button></div>
      <div class="chart-box" style="height:220px"><canvas id="chartVolTerm"></canvas></div>`, t("rs.vol.sub"), "help.rs.vol"));
    // 4) مخروط التنبؤ FHS
    parts.push(sec(t("rs.fan"), `<div class="flex flex-wrap items-center gap-3 mb-3"><span class="text-sm muted">${t("rs.horizon")}</span><div class="seg" id="fanBtns">${[5, 10, 21, 63].map(h => `<button data-h="${h}" aria-pressed="${h === fanH}">${h}d</button>`).join("")}</div></div><div class="chart-box" style="height:280px"><canvas id="chartFan"></canvas></div><div class="overflow-x-auto mt-3"><table class="tbl" id="fanTable"></table></div>`, t("rs.fan.sub"), "help.rs.fan"));
  }
  // 5) الانحدار
  const regTbl = (m, title, fmtB) => m ? `<h3 class="font-semibold text-sm mb-1">${title}</h3><div class="overflow-x-auto mb-2"><table class="tbl"><thead><tr><th>${t("rs.var")}</th><th>β</th><th>SE</th><th>t</th><th>p</th></tr></thead><tbody>${m.names.map((nm, i) => `<tr><td>${nm}</td><td><span class="num">${fmtB(m.beta[i])}</span></td><td><span class="num">${fmtB(m.se[i])}</span></td><td><span class="num">${m.tstat[i].toFixed(2)}</span></td><td><span class="num" style="color:${m.pval[i] < 0.05 ? "var(--good)" : "var(--ink-3)"}">${pv(m.pval[i])}</span></td></tr>`).join("")}</tbody></table></div><div class="text-xs muted mb-4">n=${m.n} · R²=${m.r2.toFixed(3)} · adj.R²=${m.adjR2.toFixed(3)} · DW=${m.dw.toFixed(2)} · σ<sub>ε</sub>=${fmtB(m.sigma)}</div>` : "";
  if (R.regLvl || R.regChg) {
    const eg = R.regLvl && R.regLvl.eg;
    parts.push(sec(t("rs.reg"), `${regTbl(R.regLvl, t("rs.regLvl"), (v) => v.toFixed(Math.abs(v) < 1 ? 4 : 2))}${eg ? `<div class="banner ${eg.reject5 ? "banner-good" : "banner-warn"} mb-3 text-sm">Engle–Granger: ${t("rs.stat")} <b class="num">${eg.stat.toFixed(2)}</b> ${t("rs.vs")} <span class="num">${eg.crit5}</span> (5%, ${t("rs.approx")}) — ${eg.reject5 ? "✓ " + t("rs.coint") : "● " + t("rs.noCoint")}${!eg.reject5 || R.regLvl.dw < 0.5 ? `<br>${t("rs.spurious")}` : ""}</div>` : ""}${regTbl(R.regChg, t("rs.regChg"), (v) => v.toFixed(Math.abs(v) < 0.01 ? 5 : 4))}${R.regLvl ? `<button class="btn btn-primary" id="rsApplyReg">${t("rs.applyReg")}</button><p class="text-xs faint mt-2">${t("rs.applyNote")}</p>` : ""}`, t("rs.reg.sub", { v: R.regVars.join(", ") }), "help.rs.reg"));
  } else parts.push(sec(t("rs.reg"), `<p class="text-sm muted">${t("rs.regNone")}</p>`));
  // 6) الارتباطات
  if (R.corr) {
    const C = R.corr; parts.push(sec(t("rs.corr"), `<div class="overflow-x-auto"><table class="tbl"><thead><tr><th></th>${C.names.map(n => `<th>${n}</th>`).join("")}</tr></thead><tbody>${C.names.map((n, i) => `<tr><td class="font-semibold">${n}</td>${C.m[i].map(v => `<td style="background:color-mix(in srgb, ${v >= 0 ? "var(--blue)" : "var(--bad)"} ${Math.round(Math.abs(v) * 55)}%, transparent)"><span class="num">${v.toFixed(2)}</span></td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="chart-box mt-3" style="height:220px"><canvas id="chartRoll"></canvas></div>`, t("rs.corr.sub"), "help.rs.corr"));
  }
  // 7) القراءة المركبة
  const tot = R.comp.total, lab = tot > 0.25 ? { l: t("rs.pos"), c: "var(--good)" } : tot < -0.25 ? { l: t("rs.neg"), c: "var(--bad)" } : { l: t("rs.neu"), c: "var(--neutral)" };
  parts.push(sec(t("rs.comp"), `<div class="flex items-center gap-3 mb-3"><span class="pill text-lg" style="color:${lab.c}">${lab.l}</span><span class="num font-bold">${tot >= 0 ? "+" : ""}${tot.toFixed(2)}</span><span class="text-xs faint">[-1, +1]</span></div><div class="overflow-x-auto"><table class="tbl"><thead><tr><th>${t("rs.factor")}</th><th>${t("rs.value")}</th><th>${t("rs.weight")}</th><th>${t("rs.score")}</th></tr></thead><tbody>${R.comp.items.map(c => `<tr><td>${t("rs.c." + c.k)}</td><td><span class="num">${c.val}</span></td><td><span class="num">${(c.w * 100).toFixed(0)}%</span></td><td><span class="num" style="color:${c.sc > 0.05 ? "var(--good)" : c.sc < -0.05 ? "var(--bad)" : "var(--ink-3)"}">${c.sc >= 0 ? "+" : ""}${c.sc.toFixed(2)}</span></td></tr>`).join("")}</tbody></table></div><p class="text-xs faint mt-2">${t("sg.disc")}</p>`, t("rs.comp.sub"), "help.rs.comp"));
  // 8) مقارنة رجعية
  if (R.bt) {
    const b = R.bt, better = Math.abs(b.garch.cov80 - 0.8) < Math.abs(b.ewma.cov80 - 0.8) ? "GARCH" : "EWMA";
    parts.push(sec(t("rs.bt"), `<div class="overflow-x-auto"><table class="tbl"><thead><tr><th>${t("rs.model")}</th><th>${t("rs.cov80")}</th><th>${t("rs.cov90")}</th><th>n</th></tr></thead><tbody>${["ewma", "garch"].map(k => `<tr><td>${k === "ewma" ? "EWMA" : "GARCH(1,1)"}</td><td><span class="num">${pct(b[k].cov80, 1)}</span> <span class="faint text-xs">(Δ ${((b[k].cov80 - 0.8) * 100).toFixed(1)}pp)</span></td><td><span class="num">${pct(b[k].cov90, 1)}</span> <span class="faint text-xs">(Δ ${((b[k].cov90 - 0.9) * 100).toFixed(1)}pp)</span></td><td><span class="num">${b[k].n}</span></td></tr>`).join("")}</tbody></table></div><p class="text-sm mt-2">${t("rs.btBest", { m: better })}</p>`, t("rs.bt.sub"), "help.rs.bt"));
  }
  // 9) خلاصة تفسيرية
  const I = [];
  I.push(d.jb.p < 0.05 ? t("in.fat", { k: d.kurt.toFixed(1) }) : t("in.normal"));
  if (T.adfP && !T.adfP.reject5) I.push(t("in.nonstat"));
  if (T.lb2.p < 0.05) I.push(t("in.arch"));
  if (T.hurst !== null) I.push(T.hurst >= 0.62 ? t("in.trend", { h: T.hurst.toFixed(2) }) : T.hurst <= 0.42 ? t("in.mr", { h: T.hurst.toFixed(2) }) : t("in.rw", { h: T.hurst.toFixed(2) }));
  if (T.vr20 && T.vr20.p < 0.05) I.push(T.vr20.VR > 1 ? t("in.vrMom") : t("in.vrMr"));
  if (g) { if (g.persistence > 0.97) I.push(t("in.persist", { p: g.persistence.toFixed(3), h: isFinite(g.halfLife) ? g.halfLife.toFixed(0) : "∞" })); I.push(R.volPct > 0.8 ? t("in.hiVol") : R.volPct < 0.3 ? t("in.loVol") : t("in.midVol")); if (gj && gj.gamma > 0.03) I.push(t("in.asym")); }
  if (R.regLvl && R.regLvl.eg) I.push(R.regLvl.eg.reject5 ? t("in.coint") : t("in.spur"));
  parts.push(`<div class="card p-4"><h2 class="font-bold mb-2">${t("rs.summary")}</h2><ul class="interp list-disc ps-5">${I.map(x => `<li>${x}</li>`).join("")}</ul></div>`);
  root.innerHTML = parts.join("");
  // أحداث
  $("rsRecalc").addEventListener("click", () => { researchMemo = { rows: null, sig: null, val: null }; garchMemo = { rows: null, val: null }; renderResearch(); });
  const an = $("rsApplyNu"); if (an) an.addEventListener("click", () => { state.settings.nu = +R.nuEst.toFixed(1); saveSettings(state.settings); refreshAll(true); toast(t("rs.nuApplied", { v: state.settings.nu })); });
  const ug = $("rsUseGarch"); if (ug) ug.addEventListener("click", () => { state.settings.volModel = "garch"; saveSettings(state.settings); refreshAll(true); toast(t("rs.garchOn")); });
  const ar = $("rsApplyReg"); if (ar) ar.addEventListener("click", () => {
    const m = R.regLvl, c = state.settings.coeffs, get = (n) => { const i = m.names.indexOf(n); return i >= 0 ? m.beta[i] : 0; };
    c.alpha = m.beta[0]; c.beta1 = get("RealYield"); c.beta2 = get("DXY"); c.beta3 = 0; c.beta4 = get("VIX");
    const lr = lastNonNull(rows, "realYield"), dx = lastNonNull(rows, "dxy"), vx = lastNonNull(rows, "vix"); const v = state.settings.fvInputs; if (lr !== null) v.realYield = lr; if (dx !== null) v.dxy = dx; if (vx !== null) v.geoIndex = vx; v.cbFlows = 0;
    saveSettings(state.settings); renderFairInputs(); refreshAll(false); toast(t("rs.regApplied"), 4500); });
  if (!window.Chart) return;
  // مدرج العوائد مع المنحنى الطبيعي ومنحنى t
  const lr = R.lr, m = mean(lr), sd = stdev(lr), bins = 41, lo = m - 5 * sd, hi = m + 5 * sd, w = (hi - lo) / bins, cnt = new Array(bins).fill(0);
  lr.forEach(x => { const i = Math.floor((x - lo) / w); if (i >= 0 && i < bins) cnt[i]++; });
  const cen = cnt.map((_, i) => lo + (i + 0.5) * w), dens = (x) => 1 / (sd * Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * ((x - m) / sd) ** 2) * w * lr.length;
  const nuU = Math.max(3.5, Math.min(30, R.nuEst || state.settings.nu)), scT = Math.sqrt(nuU / (nuU - 2)), tdens = (x) => { const z = (x - m) / sd * scT; const c = Math.exp(gammln((nuU + 1) / 2) - gammln(nuU / 2)) / Math.sqrt(nuU * Math.PI); return c * Math.pow(1 + z * z / nuU, -(nuU + 1) / 2) * scT / sd * w * lr.length; };
  state.charts.retHist = new Chart($("chartRetHist"), { data: { labels: cen.map(c => (c * 100).toFixed(1) + "%"), datasets: [
    { type: "bar", label: t("rs.empirical"), data: cnt, backgroundColor: cssVar("--gold-band-80"), borderRadius: 2, barPercentage: 1, categoryPercentage: 0.95, order: 3 },
    { type: "line", label: t("rs.normalCurve"), data: cen.map(dens), borderColor: cssVar("--ink-3"), borderDash: [5, 4], borderWidth: 1.6, pointRadius: 0, tension: 0.3, order: 2 },
    { type: "line", label: `t (ν=${nuU.toFixed(1)})`, data: cen.map(tdens), borderColor: cssVar("--blue"), borderWidth: 2, pointRadius: 0, tension: 0.3, order: 1 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } }, tooltip: baseTooltip() }, scales: { x: { reverse: isRTL(), grid: { display: false }, ticks: { maxTicksLimit: 9 } }, y: { display: false } } } });
  if (g) {
    const H = 60, hs = Array.from({ length: H }, (_, i) => i + 1);
    state.charts.volTerm = new Chart($("chartVolTerm"), { type: "line", data: { labels: hs, datasets: [
      { label: "GARCH", data: hs.map(h => Math.sqrt(g.termVar(h)) * ann * 100), borderColor: cssVar("--gold"), borderWidth: 2.2, pointRadius: 0 },
      { label: "EWMA", data: hs.map(() => R.ewma * ann * 100), borderColor: cssVar("--ink-3"), borderDash: [5, 4], borderWidth: 1.6, pointRadius: 0 },
      { label: t("rs.longRun"), data: hs.map(() => g.longRunSigma * ann * 100), borderColor: cssVar("--blue"), borderDash: [2, 3], borderWidth: 1.4, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } }, tooltip: { ...baseTooltip(), callbacks: { title: (it) => `${it[0].label}d`, label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } }, scales: { x: { reverse: isRTL(), grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: { position: yPos(), title: { display: true, text: t("rs.annVolPct") }, ticks: { callback: (v) => v + "%" } } } } });
    const drawFan = () => {
      destroyChart("fan"); const fan = fhsFan(S0, g, mu, fanH, 4000), labels = ["0", ...fan.map((_, i) => String(i + 1))], b90 = cssVar("--gold-band-90"), b80 = cssVar("--gold-band-80");
      const col = (k) => [S0, ...fan.map(f => f[k])];
      state.charts.fan = new Chart($("chartFan"), { type: "line", data: { labels, datasets: [
        { order: 5, label: "P95", data: col("p95"), borderColor: b90, backgroundColor: b90, borderWidth: 1, pointRadius: 0, fill: "+1" },
        { order: 4, label: "P90", data: col("p90"), borderColor: b80, backgroundColor: b80, borderWidth: 1, pointRadius: 0, fill: "+1" },
        { order: 3, label: "P50", data: col("p50"), borderColor: cssVar("--gold-mid"), borderWidth: 2, pointRadius: 0, fill: false },
        { order: 2, label: "P10", data: col("p10"), borderColor: b80, backgroundColor: b80, borderWidth: 1, pointRadius: 0, fill: "-1" },
        { order: 1, label: "P5", data: col("p5"), borderColor: b90, backgroundColor: b90, borderWidth: 1, pointRadius: 0, fill: "-1" }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } }, tooltip: { ...baseTooltip(), callbacks: { title: (it) => `${t("rs.day")} ${it[0].label}`, label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed.y)}` } } }, scales: { x: { reverse: isRTL(), grid: { display: false }, ticks: { maxTicksLimit: 9 } }, y: { position: yPos(), title: { display: true, text: ut }, ticks: { callback: (v) => fmt(v, vs.unit === "g" ? 1 : 0) } } } } });
      const fl = fan[fan.length - 1];
      $("fanTable").innerHTML = `<thead><tr><th>${t("rs.day")} ${fanH}</th>${["P5", "P10", "P50", "P90", "P95"].map(k => `<th>${k}</th>`).join("")}</tr></thead><tbody><tr><td>${ut}</td>${["p5", "p10", "p50", "p90", "p95"].map(k => `<td><span class="num">${fmt(fl[k])}</span></td>`).join("")}</tr><tr><td>%</td>${["p5", "p10", "p50", "p90", "p95"].map(k => `<td><span class="num" style="color:${fl[k] >= S0 ? "var(--good)" : "var(--bad)"}">${fl[k] >= S0 ? "+" : ""}${pct(fl[k] / S0 - 1, 1)}</span></td>`).join("")}</tr></tbody>`;
    };
    drawFan();
    document.querySelectorAll("#fanBtns button").forEach(b => b.addEventListener("click", () => { fanH = +b.dataset.h; document.querySelectorAll("#fanBtns button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); drawFan(); }));
  }
  if (R.roll && (R.roll.dxy || R.roll.ry)) {
    const base = R.roll.dxy || R.roll.ry, ds = [];
    if (R.roll.dxy) ds.push({ label: "Gold–DXY", data: R.roll.dxy.v, borderColor: cssVar("--gold"), borderWidth: 2, pointRadius: 0 });
    if (R.roll.ry) ds.push({ label: "Gold–ΔRealYield", data: R.roll.ry.v, borderColor: cssVar("--blue"), borderWidth: 2, pointRadius: 0 });
    state.charts.roll = new Chart($("chartRoll"), { type: "line", data: { labels: base.dates, datasets: ds }, options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } }, tooltip: { ...baseTooltip(), callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(2)}` } } }, scales: { x: { reverse: isRTL(), grid: { display: false }, ticks: { maxTicksLimit: 7, callback: function (v) { return this.getLabelForValue(v).slice(0, 7); } } }, y: { position: yPos(), min: -1, max: 1 } } } });
  }
};
