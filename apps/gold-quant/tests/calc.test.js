// اختبارات الحسابات الأساسية (بدون متصفح):  node apps/gold-quant/tests/calc.test.js
// تقارن النواة بمراجع محسوبة يدوياً/تحليلياً: التحويلات، الصرف، EWMA، المئينات، Monte Carlo، نسبة العدالة.
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
['i18n.js', 'math.js', 'core.js'].forEach(f => vm.runInThisContext(fs.readFileSync(path.join(SRC, f), 'utf8') + '\n', { filename: f }));
let fail = 0;
const ok = (name, cond, detail = '') => { if (!cond) fail++; console.log((cond ? 'PASS' : 'FAIL'), name, detail); };
const near = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
state.settings = loadSettings();
const S = (o) => ({ ...state.settings, ...o });
const OZ = 31.1035;

// ---- 1) تحويل السعر: أونصة/جرام، عيار، مصنعية ----
const gold = 4123.45, sar = 3.7505, egp = 47.9;
const g24 = toView(gold, sar, S({ market: 'SA', unit: 'g', karat: 24, premiumSA: 0 }));
ok('SAR gram 24K = gold/31.1035 × fx', near(g24, gold / OZ * sar), g24.toFixed(4));
ok('matches legacy localPrice()', near(g24, localPrice(gold, sar, 24, 0)));
ok('ounce 24K SAR = gold × fx', near(toView(gold, sar, S({ market: 'SA', unit: 'oz', karat: 24, premiumSA: 0 })), gold * sar));
ok('global ounce 24K = spot', near(toView(gold, 1, S({ market: 'GL', unit: 'oz', karat: 24 })), gold));
for (const mk of ['SA', 'EG', 'GL']) for (const k of [24, 22, 21, 18]) {
  const fx = mk === 'EG' ? egp : mk === 'SA' ? sar : 1, prem = { premiumSA: 7.5, premiumEG: 120 };
  const vg = toView(gold, fx, S({ market: mk, unit: 'g', karat: k, ...prem })), vo = toView(gold, fx, S({ market: mk, unit: 'oz', karat: k, ...prem }));
  ok(`ounce = 31.1035 × gram (incl. premium) ${mk} ${k}K`, near(vo, vg * OZ, 1e-12));
}
{ // العيار خطي بعد طرح المصنعية
  const p = 15, c = (k) => toView(gold, sar, S({ market: 'SA', unit: 'g', karat: k, premiumSA: p })) - p;
  ok('22K = 24K × 22/24 (premium excluded)', near(c(22), c(24) * 22 / 24)); ok('18K = 24K × 18/24', near(c(18), c(24) * 18 / 24));
}

// ---- 2) سلسلة الصرف: ملء للأمام والخلف ----
const rows = [{ date: '2026-01-01', gold: 4000, egp: null }, { date: '2026-01-02', gold: 4040, egp: 48 }, { date: '2026-01-03', gold: 4000, egp: null }, { date: '2026-01-04', gold: 4100, egp: 50 }];
ok('EGP backfill/forward-fill', JSON.stringify(fxSeries(rows, 'EG')) === JSON.stringify([48, 48, 48, 50]));
ok('SAR default peg 3.75 when missing', JSON.stringify(fxSeries(rows, 'SA')) === JSON.stringify([3.75, 3.75, 3.75, 3.75]));
ok('EGP unavailable entirely -> null', fxSeries([{ gold: 1 }, { gold: 2 }], 'EG').every(v => v === null));

// ---- 3) سلسلة العرض: العوائد = عائد الذهب + عائد الصرف (بدون مصنعية) ----
const fxRows = [{ date: 'a', gold: 4000, egp: 30 }, { date: 'b', gold: 4040, egp: 30 }, { date: 'c', gold: 4000, egp: 48 }, { date: 'd', gold: 4100, egp: 48 }];
for (const [unit, karat] of [['g', 24], ['oz', 24], ['g', 21], ['oz', 18]]) {
  const v = viewRows(fxRows, S({ market: 'EG', unit, karat, basis: 'local', premiumEG: 0 })), lr = logReturns(v);
  const expect = [1, 2, 3].map(i => Math.log(fxRows[i].gold / fxRows[i - 1].gold) + Math.log(fxRows[i].egp / fxRows[i - 1].egp));
  ok(`local-basis log return = gold ret + FX ret (EGP ${unit} ${karat}K, incl. -35% devaluation jump)`, lr.every((x, i) => near(x, expect[i], 1e-12)), lr.map(x => x.toFixed(4)).join(','));
}
{
  const v = viewRows(fxRows, S({ market: 'EG', unit: 'g', karat: 24, basis: 'usd', premiumEG: 0 })), lr = logReturns(v);
  ok('usd-basis returns equal pure gold returns', lr.every((x, i) => near(x, Math.log(fxRows[i + 1].gold / fxRows[i].gold), 1e-12)));
  ok('usd-basis level uses current FX', near(v[v.length - 1].gold, 4100 / OZ * 48), v[v.length - 1].gold.toFixed(3));
}
{
  const v0 = logReturns(viewRows(fxRows, S({ market: 'SA', unit: 'g', karat: 24, premiumSA: 0 }))), v1 = logReturns(viewRows(fxRows, S({ market: 'SA', unit: 'g', karat: 24, premiumSA: 50 })));
  ok('fixed premium dampens |returns| (retail price vol < metal vol)', v1.every((x, i) => Math.abs(x) < Math.abs(v0[i])));
  ok('unit and karat do not change returns', (() => { const a = logReturns(viewRows(fxRows, S({ market: 'GL', unit: 'g', karat: 24 }))), b = logReturns(viewRows(fxRows, S({ market: 'GL', unit: 'oz', karat: 18 }))); return a.every((x, i) => near(x, b[i], 1e-12)); })());
  ok('usd field preserved in view rows', viewRows(fxRows, S({ market: 'SA' })).every((r, i) => r.usd === fxRows[i].gold));
}

// ---- 4) EWMA: مرجع محسوب يدوياً ----
{
  const r = [0.01, -0.02, 0.015, 0.0, 0.005, 0.02, -0.01];
  let v = (0.01 ** 2 + 0.02 ** 2 + 0.015 ** 2 + 0 + 0.005 ** 2) / 5; v = 0.94 * v + 0.06 * 0.02 ** 2; v = 0.94 * v + 0.06 * 0.01 ** 2;
  ok('EWMA sigma matches hand computation', near(ewmaSigma(r, 0.94), Math.sqrt(v), 1e-12), `${ewmaSigma(r, 0.94).toFixed(6)} vs ${Math.sqrt(v).toFixed(6)}`);
  ok('EWMA with lambda=1 keeps seed variance', near(ewmaSigma(r, 1), Math.sqrt((0.01 ** 2 + 0.02 ** 2 + 0.015 ** 2 + 0.005 ** 2) / 5), 1e-12));
}
// ---- 5) المئين بالاستيفاء الخطي (مثل numpy.percentile) ----
ok('percentile([1,2,3,4],0.5)=2.5', near(percentile([1, 2, 3, 4], 0.5), 2.5)); ok('percentile([1,2,3,4],0.9)=3.7', near(percentile([1, 2, 3, 4], 0.9), 3.7));
ok('percentile q=0 / q=1 edges', percentile([5, 6, 7], 0) === 5 && percentile([5, 6, 7], 1) === 7);

// ---- 6) Monte Carlo مقابل الصيغة التحليلية (t بتباين موحد) ----
{
  const S0 = 4000, sg = 0.012, mu = 0.0002, nu = 5, N = 400000, mc = monteCarlo(S0, sg, mu, nu, N), q = tStdQuantiles(nu);
  for (const [name, p] of [['p5', 0.05], ['p10', 0.1], ['p50', 0.5], ['p90', 0.9], ['p95', 0.95]]) {
    const exact = S0 * Math.exp(mu - 0.5 * sg * sg + sg * q[p]);
    ok(`MC ${name} within 0.1% of analytic`, Math.abs(mc[name] / exact - 1) < 0.001, `${mc[name].toFixed(2)} vs ${exact.toFixed(2)}`);
  }
  const logs = mc.all.map(x => Math.log(x / S0)); const m = logs.reduce((a, b) => a + b, 0) / N, sd = Math.sqrt(logs.reduce((a, b) => a + (b - m) ** 2, 0) / N);
  ok('MC log-return std ≈ sigma (unit-variance t)', Math.abs(sd / sg - 1) < 0.02, sd.toFixed(5));
  ok('MC median ≈ S0·exp(mu − σ²/2)', Math.abs(mc.p50 / (S0 * Math.exp(mu - 0.5 * sg * sg)) - 1) < 0.001);
}
// ---- 7) الانتقال لعملة العرض يحفظ نسب النطاقات ----
{
  const s0 = 4100, band = { p10: 4050, p90: 4160 }, fx = 3.75, k = S({ market: 'SA', unit: 'g', karat: 22, premiumSA: 0 });
  ok('band ratio is invariant under currency/unit conversion', near(toView(band.p90, fx, k) / toView(s0, fx, k), band.p90 / s0, 1e-12));
}
// ---- 8) القيمة العادلة وتصنيفها ----
ok('fairValue linear model', near(fairValue(1.8, 99, 80, 120, { alpha: 5200, beta1: -450, beta2: -12, beta3: 1.5, beta4: 8 }), 5200 - 810 - 1188 + 120 + 960, 1e-12));
const cls = (r) => classifyFairness(r).key;
ok('fairness boundaries', cls(1.15) === 'fair' && cls(1.1500001) === 'over' && cls(0.85) === 'fair' && cls(0.8499999) === 'under' && cls(NaN) === 'na');
// ---- 9) إعدادات: ترحيل القيم القديمة ----
{ const prev = state.settings; const old = { markets: ['EG', 'SA'], unit: 'bad', karat: 99, basis: 'x' };
  global.localStorage = { getItem: (k) => (k === 'gold_model_settings' ? JSON.stringify(old) : null), setItem() {} }; const s = loadSettings(); delete global.localStorage;
  ok('settings migration/validation', s.market === 'EG' && s.unit === 'g' && s.karat === 24 && s.basis === 'local' && s.markets === undefined, JSON.stringify([s.market, s.unit, s.karat, s.basis])); state.settings = prev; }
// ---- 10) الذاكرة المؤقتة: لا نتائج قديمة عند تغيّر الصفوف أو الإعدادات ----
{ const r1 = viewRows(fxRows, S({ market: 'EG' })), r2 = viewRows(fxRows, S({ market: 'EG' }));
  ok('viewRows memo: same rows+settings -> same object', r1 === r2);
  const r3 = viewRows(fxRows, S({ market: 'EG', premiumEG: 5 })); ok('memo invalidated by premium change', r3 !== r1 && r3[0].gold > r1[0].gold);
  const copy = fxRows.map(r => ({ ...r })); copy[1].egp = 35; const r4 = viewRows(copy, S({ market: 'EG' }));
  ok('memo invalidated when a middle row changes', r4 !== r3 && Math.abs(r4[1].fx - 35) < 1e-12); }
// ---- 11) سلامة البيانات: كشف القيم الشاذة (مثل إدخال سعر الجرام مكان الأونصة) ----
{ const d = (n) => '2026-01-' + String(n).padStart(2, '0');
  const base = [6100, 6120, 6090, 6130, 6150].map((g, i) => ({ date: d(i + 1), gold: g }));
  ok('clean data -> no suspicious rows', suspiciousRows(base).length === 0);
  const lastBad = [...base, { date: d(6), gold: 740.95 }];
  ok('last row 740.95 after 6150 flagged', suspiciousRows(lastBad).map(r => r.date).join() === d(6));
  const midBad = [...base.slice(0, 3), { date: d(4), gold: 740.95 }, ...base.slice(3).map((r, i) => ({ ...r, date: d(5 + i) }))];
  ok('middle spike flagged (reverts next day)', suspiciousRows(midBad).map(r => r.date).join() === d(4));
  const realMove = [...base, { date: d(6), gold: 6150 * 1.06 }];
  ok('a real 6% move is NOT flagged', suspiciousRows(realMove).length === 0);
  const regime = [{ date: d(1), gold: 1000 }, { date: d(2), gold: 1300 }, { date: d(3), gold: 1310 }];
  ok('persistent level change (not reverting) is not flagged as spike', suspiciousRows(regime).length === 0);
  ok('robust reference median ignores the bad row', refUsdMedian(midBad) === 6120, String(refUsdMedian(midBad)));
  ok('liveSuspect: manual 740.95 vs ~6100 history', liveSuspect({ price: 740.95 }, base) === true && liveSuspect({ price: 6200 }, base) === false); }
console.log(fail ? `\n${fail} FAILED` : '\nall calc tests passed'); process.exit(fail ? 1 : 0);
