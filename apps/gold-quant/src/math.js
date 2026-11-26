// ===================== مكتبة الإحصاء المتقدمة =====================
// إحصاءات وصفية
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const variance = (a, ddof = 1) => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - ddof); };
const stdev = (a) => Math.sqrt(variance(a));
const skewness = (a) => { const m = mean(a), n = a.length; const s2 = a.reduce((s, x) => s + (x - m) ** 2, 0) / n; const s3 = a.reduce((s, x) => s + (x - m) ** 3, 0) / n; return s3 / Math.pow(s2, 1.5); };
const exKurtosis = (a) => { const m = mean(a), n = a.length; const s2 = a.reduce((s, x) => s + (x - m) ** 2, 0) / n; const s4 = a.reduce((s, x) => s + (x - m) ** 4, 0) / n; return s4 / (s2 * s2) - 3; };
const quantileOf = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); const pos = (s.length - 1) * q, b = Math.floor(pos); return s[b + 1] !== undefined ? s[b] + (pos - b) * (s[b + 1] - s[b]) : s[b]; };

// دوال خاصة: غاما وبيتا غير المكتملتين (Numerical Recipes) لحساب قيم p الدقيقة
const gammln = (x) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const cj of c) s += cj / ++y; return -t + Math.log(2.5066282746310005 * s / x); };
const gser = (a, x) => { let sum = 1 / a, del = sum, ap = a; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-13) break; } return sum * Math.exp(-x + a * Math.log(x) - gammln(a)); };
const gcf = (a, x) => { let b = x + 1 - a, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-13) break; } return Math.exp(-x + a * Math.log(x) - gammln(a)) * h; };
const gammq = (a, x) => (x <= 0 ? 1 : (x < a + 1 ? 1 - gser(a, x) : gcf(a, x)));
const chi2Sf = (x, df) => gammq(df / 2, x / 2); // دالة البقاء لتوزيع كاي تربيع
const betacf = (a, b, x) => { const FP = 1e-300; const qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FP) d = FP; d = 1 / d; let h = d; for (let m = 1; m <= 300; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-14) break; } return h; };
const betai = (a, b, x) => { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(gammln(a + b) - gammln(a) - gammln(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; };
const tCdf = (t, nu) => { const p = 0.5 * betai(nu / 2, 0.5, nu / (nu + t * t)); return t > 0 ? 1 - p : p; };
const tPvalue2 = (t, nu) => betai(nu / 2, 0.5, nu / (nu + t * t)); // قيمة p ثنائية الذيل
const tQuantile = (p, nu) => { let lo = -300, hi = 300; for (let i = 0; i < 90; i++) { const mid = (lo + hi) / 2; if (tCdf(mid, nu) < p) lo = mid; else hi = mid; } return (lo + hi) / 2; };
const tQuantCache2 = {};
// كمّيات t المعيارية (بتباين 1) الدقيقة — لنطاقات التنبؤ
const tStdQuantiles = (nu) => { const k = String(nu); if (tQuantCache2[k]) return tQuantCache2[k]; const n = Math.max(2.1, nu), sc = Math.sqrt(n / (n - 2)); const q = {}; [0.05, 0.10, 0.50, 0.90, 0.95].forEach(p => { q[p] = tQuantile(p, n) / sc; }); return (tQuantCache2[k] = q); };

// اختبار Jarque–Bera للطبيعية
const jarqueBera = (r) => { const n = r.length, S = skewness(r), K = exKurtosis(r); const JB = n / 6 * (S * S + K * K / 4); return { JB, p: chi2Sf(JB, 2), skew: S, kurt: K }; };

// الارتباط الذاتي واختبار Ljung–Box
const acfVals = (x, m) => { const mu = mean(x); const d = x.map(v => v - mu); const den = d.reduce((s, v) => s + v * v, 0); return Array.from({ length: m }, (_, k) => { const lag = k + 1; let s = 0; for (let t = lag; t < d.length; t++) s += d[t] * d[t - lag]; return s / den; }); };
const ljungBox = (x, m = 10) => { const n = x.length, rho = acfVals(x, m); let Q = 0; rho.forEach((r, k) => { Q += r * r / (n - (k + 1)); }); Q *= n * (n + 2); return { Q, p: chi2Sf(Q, m), rho }; };

// اختبار نسبة التباين (Lo–MacKinlay) المقاوم لعدم تجانس التباين
const varianceRatio = (r, q) => {
  const n = r.length, mu = mean(r); const d = r.map(v => v - mu);
  const s1 = d.reduce((s, v) => s + v * v, 0) / (n - 1);
  const m = q * (n - q + 1) * (1 - q / n);
  let sq = 0; for (let t = q - 1; t < n; t++) { let sum = 0; for (let j = 0; j < q; j++) sum += d[t - j]; sq += sum * sum; }
  sq /= m; const VR = sq / s1;
  const den = d.reduce((s, v) => s + v * v, 0) ** 2; let theta = 0;
  for (let j = 1; j < q; j++) { let num = 0; for (let t = j; t < n; t++) num += d[t] * d[t] * d[t - j] * d[t - j]; theta += (2 * (q - j) / q) ** 2 * (n * num / den); }
  const z = (VR - 1) / Math.sqrt(theta / n); const p = 2 * (1 - 0.5 * (2 - erfcApprox(Math.abs(z) / Math.SQRT2)));
  return { VR, z, p };
};
const erfcApprox = (x) => { const z = Math.abs(x), t = 1 / (1 + 0.5 * z); const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; };

// أس هيرست بطريقة المدى المعاد تدريجه R/S
const hurstRS = (r) => {
  const sizes = [8, 16, 32, 64, 128, 256].filter(s => s <= r.length / 2); const xs = [], ys = [];
  for (const s of sizes) { const k = Math.floor(r.length / s); let acc = 0, cnt = 0; for (let c = 0; c < k; c++) { const ch = r.slice(c * s, (c + 1) * s); const m = mean(ch); let cum = 0, mx = -Infinity, mn = Infinity; for (const v of ch) { cum += v - m; mx = Math.max(mx, cum); mn = Math.min(mn, cum); } const S = Math.sqrt(ch.reduce((a, v) => a + (v - m) ** 2, 0) / s); if (S > 0) { acc += (mx - mn) / S; cnt++; } } if (cnt) { xs.push(Math.log(s)); ys.push(Math.log(acc / cnt)); } }
  if (xs.length < 3) return null;
  const mx = mean(xs), my = mean(ys); let num = 0, den = 0; xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; }); return num / den;
};

// مصفوفات صغيرة: معكوس Gauss–Jordan بتحوير محوري
const matInv = (A) => { const n = A.length; const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-14) return null; [M[c], M[p]] = [M[p], M[c]]; const pv = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= pv; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; } } return M.map(r => r.slice(n)); };

// انحدار OLS مع أخطاء معيارية وإحصاءات t وقيم p وDurbin–Watson
const ols = (X, y, { intercept = true } = {}) => {
  const n = y.length; const Z = intercept ? X.map(r => [1, ...r]) : X; const k = Z[0].length; if (n <= k + 2) return null;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0)), Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { Xty[a] += Z[i][a] * y[i]; for (let b = a; b < k; b++) XtX[a][b] += Z[i][a] * Z[i][b]; }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
  const inv = matInv(XtX); if (!inv) return null;
  const beta = inv.map(row => row.reduce((s, v, j) => s + v * Xty[j], 0));
  const resid = y.map((v, i) => v - Z[i].reduce((s, z, j) => s + z * beta[j], 0));
  const sse = resid.reduce((s, e) => s + e * e, 0), df = n - k, s2 = sse / df;
  const se = inv.map((row, i) => Math.sqrt(Math.max(0, row[i]) * s2)); const tstat = beta.map((b, i) => b / se[i]); const pval = tstat.map(t => tPvalue2(t, df));
  const ym = mean(y); const sst = intercept ? y.reduce((s, v) => s + (v - ym) ** 2, 0) : y.reduce((s, v) => s + v * v, 0);
  const r2 = 1 - sse / sst, adjR2 = 1 - (1 - r2) * (n - (intercept ? 1 : 0)) / df;
  let dwn = 0; for (let i = 1; i < n; i++) dwn += (resid[i] - resid[i - 1]) ** 2;
  return { beta, se, tstat, pval, r2, adjR2, dw: dwn / sse, resid, n, df, sigma: Math.sqrt(s2) };
};

// اختبار ديكي–فولر الموسّع باختيار فترات الإبطاء بمعيار AIC
const ADF_CRIT = { c: { 1: -3.43, 5: -2.86, 10: -2.57 }, nc: { 1: -2.58, 5: -1.95, 10: -1.62 } };
const adf = (y, { trend = 'c', maxLag } = {}) => {
  const n = y.length, dy = []; for (let i = 0; i < n - 1; i++) dy.push(y[i + 1] - y[i]);
  const ML = maxLag !== undefined ? maxLag : Math.min(12, Math.floor(12 * Math.pow(n / 100, 0.25))); let best = null;
  for (let p = 0; p <= ML; p++) {
    const X = [], Y = [];
    for (let i = ML; i < n - 1; i++) { const row = [y[i]]; for (let j = 1; j <= p; j++) row.push(dy[i - j]); X.push(row); Y.push(dy[i]); }
    const f = ols(X, Y, { intercept: trend === 'c' }); if (!f) continue;
    const N = Y.length, sse = f.resid.reduce((s, e) => s + e * e, 0), kk = X[0].length + (trend === 'c' ? 1 : 0), aic = N * Math.log(sse / N) + 2 * kk;
    const gi = trend === 'c' ? 1 : 0; if (!best || aic < best.aic) best = { aic, lag: p, stat: f.tstat[gi], n: N };
  }
  if (!best) return null; const crit = ADF_CRIT[trend];
  return { stat: best.stat, lag: best.lag, n: best.n, crit, reject5: best.stat < crit[5], reject1: best.stat < crit[1] };
};
// اختبار Engle–Granger للتكامل المشترك (قيم حرجة تقريبية حسب عدد المتغيرات المفسِّرة)
const EG_CRIT5 = { 1: -3.34, 2: -3.74, 3: -4.10 };
const engleGranger = (resid, k) => { const a = adf(resid, { trend: 'nc' }); if (!a) return null; const c5 = EG_CRIT5[k] || -3.74; return { stat: a.stat, lag: a.lag, crit5: c5, reject5: a.stat < c5 }; };

// مُحسِّن Nelder–Mead
const nelderMead = (f, x0, { iters = 500, step = 0.15, tol = 1e-10 } = {}) => {
  const n = x0.length; let S = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += (Math.abs(p[i]) > 1e-8 ? p[i] * step : step); S.push(p); }
  let F = S.map(f);
  for (let it = 0; it < iters; it++) {
    const idx = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = idx.map(i => S[i]); F = idx.map(i => F[i]);
    if (Math.abs(F[n] - F[0]) < tol) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
    const pt = (co) => c.map((v, j) => v + co * (S[n][j] - v));
    const xr = pt(-1), fr = f(xr);
    if (fr < F[0]) { const xe = pt(-2), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else { const xc = pt(fr < F[n] ? -0.5 : 0.5), fc = f(xc); if (fc < Math.min(fr, F[n])) { S[n] = xc; F[n] = fc; } else { for (let i = 1; i <= n; i++) { S[i] = S[0].map((v, j) => v + 0.5 * (S[i][j] - v)); F[i] = f(S[i]); } } }
  }
  let b = 0; for (let i = 1; i <= n; i++) if (F[i] < F[b]) b = i; return { x: S[b], fx: F[b] };
};

// نموذج GARCH(1,1) أو GJR-GARCH بتقدير الإمكان الأعظم شبه الغاوسي مع استهداف التباين
const logistic = (u) => 1 / (1 + Math.exp(-u));
const garchFilter = (e, P, V) => { const n = e.length, h = new Array(n + 1); h[0] = V; for (let t = 0; t < n; t++) { const e2 = e[t] * e[t]; h[t + 1] = P.omega + P.alpha * e2 + (P.gamma && e[t] < 0 ? P.gamma * e2 : 0) + P.beta * h[t]; } return h; };
const garchFit = (r, { gjr = false } = {}) => {
  const n = r.length; if (n < 100) return null; const m = mean(r), e = r.map(x => x - m); const V = e.reduce((s, x) => s + x * x, 0) / n;
  const par = (u) => { const alpha = logistic(u[0]) * 0.4, beta = logistic(u[1]) * 0.999, gamma = gjr ? logistic(u[2]) * 0.4 : 0; return { alpha, beta, gamma, omega: V * (1 - alpha - beta - gamma / 2) }; };
  const nll = (u) => { const P = par(u); if (P.alpha + P.beta + P.gamma / 2 >= 0.9995 || P.omega <= 0) return 1e12; let h = V, s = 0; for (let t = 0; t < n; t++) { if (h < 1e-14) return 1e12; s += Math.log(h) + e[t] * e[t] / h; const e2 = e[t] * e[t]; h = P.omega + P.alpha * e2 + (gjr && e[t] < 0 ? P.gamma * e2 : 0) + P.beta * h; } return 0.5 * s; };
  const logit = (p) => Math.log(p / (1 - p)); const x0 = [logit(0.08 / 0.4), logit(0.88 / 0.999)]; if (gjr) x0.push(logit(0.05 / 0.4));
  let best = nelderMead(nll, x0, { iters: 600 }); const again = nelderMead(nll, best.x, { iters: 400 }); if (again.fx < best.fx) best = again;
  const P = par(best.x), h = garchFilter(e, P, V), persist = P.alpha + P.beta + P.gamma / 2, hNext = h[n];
  const z = e.map((x, t) => x / Math.sqrt(h[t])); const zm = mean(z), zs = stdev(z), zz = z.map(v => (v - zm) / zs);
  const k = x0.length + 0, logL = -best.fx - 0.5 * n * Math.log(2 * Math.PI);
  return { ...P, gjr, persistence: persist, longRunVar: V, hNext, sigmaNext: Math.sqrt(hNext), sigmaPath: h.slice(0, n).map(Math.sqrt), z: zz, logL, aic: -2 * logL + 2 * (k + 1), halfLife: persist < 1 ? Math.log(0.5) / Math.log(persist) : Infinity, mean: m,
    longRunSigma: Math.sqrt(P.omega / Math.max(1e-12, 1 - persist)), termVar: (H) => P.omega / Math.max(1e-12, 1 - persist) + Math.pow(persist, H - 1) * (hNext - P.omega / Math.max(1e-12, 1 - persist)) };
};
// تقدير درجات حرية t من التفرطح الزائد للبواقي المعيارية
const estimateNu = (z) => { const k = exKurtosis(z); return k > 0.1 ? Math.min(30, Math.max(3.5, 4 + 6 / k)) : 30; };

// محاكاة التاريخ المفلتر (Filtered Historical Simulation) لمخروط التنبؤ متعدد الأفق
const fhsFan = (S0, g, mu, H, N) => {
  const z = g.z, nz = z.length, steps = Array.from({ length: H }, () => new Float64Array(N));
  for (let i = 0; i < N; i++) { let h = g.hNext, ls = 0; for (let s = 0; s < H; s++) { const e = Math.sqrt(h) * z[(Math.random() * nz) | 0]; ls += mu - 0.5 * h + e; steps[s][i] = S0 * Math.exp(ls); h = g.omega + g.alpha * e * e + (g.gamma && e < 0 ? g.gamma * e * e : 0) + g.beta * h; } }
  return steps.map(a => { const s = Array.from(a).sort((x, y) => x - y); const q = (p) => { const pos = (N - 1) * p, b = Math.floor(pos); return s[b + 1] !== undefined ? s[b] + (pos - b) * (s[b + 1] - s[b]) : s[b]; }; return { p5: q(0.05), p10: q(0.1), p50: q(0.5), p90: q(0.9), p95: q(0.95) }; });
};

// مؤشرات فنية/إحصائية
const sma = (a, w) => { if (a.length < w) return null; return mean(a.slice(-w)); };
const rsi = (p, n = 14) => { if (p.length < n + 1) return null; let g = 0, l = 0; for (let i = 1; i <= n; i++) { const d = p[i] - p[i - 1]; if (d > 0) g += d; else l -= d; } g /= n; l /= n; for (let i = n + 1; i < p.length; i++) { const d = p[i] - p[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; } return l === 0 ? 100 : 100 - 100 / (1 + g / l); };
const maxDrawdown = (p) => { let pk = p[0], dd = 0; for (const v of p) { pk = Math.max(pk, v); dd = Math.max(dd, (pk - v) / pk); } return dd; };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };
const rollingCorr = (a, b, w) => { const out = []; for (let i = w; i <= a.length; i++) out.push(corr(a.slice(i - w, i), b.slice(i - w, i))); return out; };
const histVaR = (r, q) => { const v = quantileOf(r, q); const tail = r.filter(x => x <= v); return { var: -v, cvar: -mean(tail) }; };
