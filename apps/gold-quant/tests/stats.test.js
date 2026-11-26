const fs=require('fs'),vm=require('vm');
vm.runInThisContext(fs.readFileSync(require("path").join(__dirname,"..","src","math.js"),'utf8'));
const ok=(n,c,d)=>console.log((c?'PASS':'FAIL'),n,d??'');
ok('chi2Sf(3.841,1)≈.05',Math.abs(chi2Sf(3.841,1)-0.05)<1e-3,chi2Sf(3.841,1));
ok('chi2Sf(5.991,2)≈.05',Math.abs(chi2Sf(5.991,2)-0.05)<1e-3);
ok('chi2Sf(18.307,10)≈.05',Math.abs(chi2Sf(18.307,10)-0.05)<1e-3);
ok('tQuantile(.975,5)=2.5706',Math.abs(tQuantile(0.975,5)-2.5706)<1e-3,tQuantile(0.975,5));
ok('tPvalue2(2.5706,5)≈.05',Math.abs(tPvalue2(2.5706,5)-0.05)<1e-3);
let seed=12345; const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return (seed+1)/4294967297;};
const rn=()=>Math.sqrt(-2*Math.log(rnd()))*Math.cos(2*Math.PI*rnd());
// OLS recovery
const X=[],y=[]; for(let i=0;i<1000;i++){const a=rn(),b=rn(),c=rn(); X.push([a,b,c]); y.push(2+1.5*a-0.7*b+0.3*c+0.5*rn());}
const f=ols(X,y); ok('OLS beta',f.beta.every((b,i)=>Math.abs(b-[2,1.5,-0.7,0.3][i])<0.08),f.beta.map(v=>v.toFixed(3)).join(','));
ok('OLS R2 high',f.r2>0.85,f.r2.toFixed(3)); ok('OLS DW≈2',Math.abs(f.dw-2)<0.2,f.dw.toFixed(2));
// GARCH recovery
const n=3000,w=0.000002,al=0.08,be=0.9; let h=w/(1-al-be); const r=[]; for(let t=0;t<n;t++){const e=Math.sqrt(h)*rn(); r.push(e); h=w+al*e*e+be*h;}
const t0=Date.now(); const g=garchFit(r); console.log('garch ms',Date.now()-t0);
ok('GARCH alpha',Math.abs(g.alpha-0.08)<0.03,g.alpha.toFixed(3)); ok('GARCH beta',Math.abs(g.beta-0.9)<0.04,g.beta.toFixed(3)); ok('persistence',Math.abs(g.persistence-0.98)<0.02,g.persistence.toFixed(3));
const gj=garchFit(r,{gjr:true}); ok('GJR gamma small',gj.gamma<0.1,gj.gamma.toFixed(3));
// ADF
const rw=[0]; for(let i=1;i<1500;i++) rw.push(rw[i-1]+rn()); const wn=Array.from({length:1500},rn);
const a1=adf(rw), a2=adf(wn); ok('ADF random walk not rejected',!a1.reject5,a1.stat.toFixed(2)); ok('ADF white noise rejected',a2.reject1,a2.stat.toFixed(2));
// EG: cointegrated pair
const x2=rw, y2=x2.map(v=>3+2*v+rn()); const ff=ols(x2.map(v=>[v]),y2); const eg=engleGranger(ff.resid,1); ok('EG cointegrated rejects',eg.reject5,eg.stat.toFixed(2));
const y3=[0]; for(let i=1;i<1500;i++) y3.push(y3[i-1]+rn()); const f3=ols(rw.map(v=>[v]),y3); ok('EG independent RW not rejected (usually)',!engleGranger(f3.resid,1).reject5,engleGranger(f3.resid,1).stat.toFixed(2));
// Hurst/VR/LB/JB
const H=hurstRS(wn); ok('Hurst iid ~0.5-0.6',H>0.42&&H<0.66,H.toFixed(2));
const vr=varianceRatio(wn,5); ok('VR iid≈1',Math.abs(vr.VR-1)<0.2&&vr.p>0.01,JSON.stringify(vr));
const ar=[0]; for(let i=1;i<1500;i++) ar.push(0.4*ar[i-1]+rn()); const vr2=varianceRatio(ar,5); ok('VR AR(1)>1 & sig',vr2.VR>1.3&&vr2.p<0.01,vr2.VR.toFixed(2));
const lb=ljungBox(wn,10); ok('LB iid p>0.01',lb.p>0.01,lb.p.toFixed(3)); const lb2=ljungBox(ar,10); ok('LB AR p<0.001',lb2.p<0.001);
const lbs=ljungBox(r.map(v=>v*v),10); ok('LB r² ARCH effect',lbs.p<0.001,lbs.p.toExponential(1));
const jb=jarqueBera(wn); ok('JB normal p>0.01',jb.p>0.01,jb.p.toFixed(3)); const tt=Array.from({length:3000},()=>rn()/Math.sqrt(rnd()*0+ (Array.from({length:3},rn).reduce((s,v)=>s+v*v,0)/3))); ok('JB t3 rejects',jarqueBera(tt).p<0.001);
// FHS
const fan=fhsFan(4000,g,0.0002,5,4000); ok('FHS widths grow',fan[4].p95-fan[4].p5>fan[0].p95-fan[0].p5,fan[0].p5.toFixed(0)+'..'+fan[0].p95.toFixed(0));
const q=tStdQuantiles(5); ok('t std q95',Math.abs(q[0.95]-2.015/Math.sqrt(5/3))<0.01,q[0.95].toFixed(3));
console.log('rsi',rsi(rw.map(v=>v+100)).toFixed(1),'mdd',maxDrawdown(rw.map(v=>v+100)).toFixed(2));
