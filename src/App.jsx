// ✅ Web App – Calcolatore Frontalieri (V3.3 Hotfix)
// - Fix JSX: rimosso `</div}` errato e chiusure bilanciate.
// - Barra "Anteprima" e footer debug SOLO in sviluppo (Vite DEV).

import React, { useMemo, useState, useEffect } from "react";

// ---------------- Error Boundary (inline) ----------------
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError:false, err:null }; }
  static getDerivedStateFromError(err){ return { hasError:true, err }; }
  componentDidCatch(err, info){ console.error("UI Error:", err, info); }
  render(){
    if(this.state.hasError){
      return (
        <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:16}}>
          <div style={{maxWidth:720,width:'100%',border:'1px solid #e2e8f0',borderRadius:16,padding:16,background:'#fff'}}>
            <h3 style={{margin:0, fontSize:18}}>Si è verificato un errore</h3>
            <p style={{color:'#475569',fontSize:14}}>Premi reset per ricominciare.</p>
            <button onClick={()=>{ try{ localStorage.clear(); }catch{}; location.reload(); }} style={{padding:'8px 12px',borderRadius:12,border:'1px solid #cbd5e1',background:'#0ea5e9',color:'#fff'}}>Reset & ricarica</button>
            <pre style={{fontSize:12, background:'#f8fafc', padding:8, borderRadius:12, marginTop:12, maxHeight:160, overflow:'auto'}}>{String(this.state.err)}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------- Utilità ----------------
const fmtCHF = (n) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "CHF" }).format(Number.isFinite(n) ? n : 0);
function computeSocialCHF(grossYear, base){
  const gy = Number.isFinite(grossYear) ? grossYear : 0;
  const ahv = gy * (base.ahvIvEoPerc || 0);
  const alv = gy * (base.alvPerc || 0);
  const lpp = gy * (base.lppPerc || 0);
  const nbu = gy * (base.nbuPerc || 0);
  const social = ahv + alv + lpp + nbu;
  return { ahv, alv, lpp, nbu, social };
}
function computeSourceTaxCHF(taxableYear, rate){ const t = Number.isFinite(taxableYear) ? taxableYear : 0; return Math.max(0, t * (rate || 0)); }
function estimateHomeTax(baseAmount, effRate){ const b = Number.isFinite(baseAmount) ? baseAmount : 0; return Math.max(0, b * (effRate || 0)); }

// ---------------- Componenti input ----------------
function NumberField({ id, label, value, onChange, min = 0, step = 1, suffix, width }){
  const display = Number.isFinite(value) ? value : "";
  function handleChange(e){ const s=e.target.value; if(s===''){ onChange(NaN); return; } const n=Number(s); if(Number.isFinite(n)) onChange(n); }
  return (
    <div style={{display:'grid',gap:4}}>
      {label && <label htmlFor={id} style={{fontSize:12,color:'#475569'}}>{label}</label>}
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <input id={id} type="number" inputMode="decimal" step={step} min={min} value={display} onChange={handleChange} style={{border:'1px solid #cbd5e1',borderRadius:12,padding:'8px 10px', width: width || 180}}/>
        {suffix && <span style={{fontSize:12,color:'#64748b'}}>{suffix}</span>}
      </div>
    </div>
  );
}
function PercentField({ id, label, value, onChange, step = 0.1, width }){
  const display = Number.isFinite(value) ? Math.round(value*1000)/10 : ""; // 0.12 -> 12.0
  function handleChange(e){ const s=e.target.value; if(s===''){ onChange(NaN); return; } const n=Number(s); if(Number.isFinite(n)) onChange(n/100); }
  return (
    <div style={{display:'grid',gap:4}}>
      {label && <label htmlFor={id} style={{fontSize:12,color:'#475569'}}>{label}</label>}
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <input id={id} type="number" inputMode="decimal" step={step} value={display} onChange={handleChange} style={{border:'1px solid #cbd5e1',borderRadius:12,padding:'8px 10px', width: width || 120}}/>
        <span style={{fontSize:12,color:'#64748b'}}>%</span>
      </div>
    </div>
  );
}
function ReadOnlyField({ label, value }){
  return (
    <div style={{display:'grid',gap:4}}>
      {label && <div style={{fontSize:12,color:'#475569'}}>{label}</div>}
      <div style={{padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:12,background:'#f8fafc',fontSize:14}}>{value}</div>
    </div>
  );
}
function SummaryItem({ label, value, highlight, big }){
  return (
    <div style={{padding:16,border:'1px solid #e2e8f0',borderRadius:16, background: highlight ? '#ecfdf5' : '#fff'}}>
      <div style={{fontSize:12,color:'#64748b'}}>{label}</div>
      <div style={{fontWeight:600, fontSize: big ? 22 : 16, marginTop:4}}>{value}</div>
    </div>
  );
}

// ---------------- Calcolo principale ----------------
function computeAll({ pay, months, has14, chBase, regimes, profile, fx, itAddiz }){
  const effectiveMonths = has14 ? Math.max(months,14) : months;
  const grossYear = (Number(pay.grossMonthlyCHF)||0) * effectiveMonths + (Number(pay.allowancesCHF)||0);
  const social = computeSocialCHF(grossYear, chBase);
  const taxableCH = Math.max(0, grossYear - social.social);
  const r = regimes[profile.regime] || {};
  const sourceTax = computeSourceTaxCHF(taxableCH, r.sourceTaxRate) * (r.sourceFactor ?? 1);

  let homeTaxCHF = 0, creditCHF = 0, itIrpefNetCHF = 0, itAddizCHF = 0;
  if (profile.residenceCountry==='IT' && profile.regime === 'FR_IT_NEW'){
    const itBaseEUR = Math.max(0, taxableCH * fx.chfToEur - (r.itAllowanceEUR||0));
    const teoricaITEUR = estimateHomeTax(itBaseEUR, r.itEffRate||0);
    const creditEUR = Math.min(teoricaITEUR, sourceTax * (r.itTaxCreditShare ?? 1) * fx.chfToEur);
    creditCHF = creditEUR / fx.chfToEur;
    itIrpefNetCHF = Math.max(0, (teoricaITEUR - creditEUR) / fx.chfToEur);
    const addizEUR = itAddiz.enable ? itBaseEUR * ((itAddiz.regionalRate||0) + (itAddiz.municipalRate||0)) : 0;
    itAddizCHF = addizEUR / fx.chfToEur;
    homeTaxCHF = itIrpefNetCHF + itAddizCHF;
  } else if (profile.regime === 'FR_DE' || profile.regime === 'FR_FR'){
    const teoricaCHF = estimateHomeTax(taxableCH, r.homeTaxRate||0);
    const creditMaxCHF = sourceTax * (r.creditShare ?? 1);
    creditCHF = Math.min(teoricaCHF, creditMaxCHF);
    homeTaxCHF = Math.max(0, teoricaCHF - creditCHF);
  } else if (profile.regime === 'FR_IT_OLD'){
    homeTaxCHF = 0; creditCHF = 0; // esclusiva CH (semplificato)
  }

  const totalTax = social.social + sourceTax + homeTaxCHF;
  const netYear = grossYear - totalTax;
  const netMonthly = netYear / (has14 ? Math.max(months,14) : months);
  return { grossYear, ...social, taxableCH, sourceTax, creditCHF, itIrpefNetCHF, itAddizCHF, homeTaxCHF, totalTax, netYear, netMonthly };
}

// ---------------- App ----------------
export default function App(){
  // Viewport preview
  const [viewport, setViewport] = useState('desktop');
  const [mode, setMode] = useState('G2N');
  const [profile, setProfile] = useState({ residenceCountry: 'IT', regime: 'FR_IT_OLD', workCanton: 'TI' });
  const [months, setMonths] = useState(13);
  const [has14, setHas14] = useState(false);

  // Solo DEV: mostra barra anteprima e footer debug
  const isDev = import.meta?.env?.DEV;

  const [chBase] = useState({ ahvIvEoPerc: 0.053, alvPerc: 0.011, lppPerc: 0.055, nbuPerc: 0.01 });
  const [regimes, setRegimes] = useState({
    FR_IT_NEW: { label: 'Frontaliere (nuovo)', sourceTaxRate: 0.08, sourceFactor: 0.8, itAllowanceEUR: 10000, itEffRate: 0.22, itTaxCreditShare: 1.0 },
    FR_IT_OLD: { label: 'Frontaliere (vecchio)', sourceTaxRate: 0.045, sourceFactor: 1.0 },
    RES_B:     { label: 'Residente CH B',        sourceTaxRate: 0.12 },
    RES_C:     { label: 'Residente CH C',        sourceTaxRate: 0.0 },
    FR_FR:     { label: 'Frontaliere Francia',   sourceTaxRate: 0.045, homeTaxRate: 0.14, creditShare: 1.0 },
    FR_DE:     { label: 'Frontaliere Germania',  sourceTaxRate: 0.045, homeTaxRate: 0.18, creditShare: 1.0 },
  });
  const [fx, setFx] = useState({ chfToEur: 1.0 });
  const [pay, setPay] = useState({ grossMonthlyCHF: 5500, dependents: 0, allowancesCHF: 0 });
  const [itAddiz, setItAddiz] = useState({ enable: true, region: '', municipality: '', regionalRate: 0.015, municipalRate: 0.006 });

  const effectiveMonths = useMemo(()=> has14 ? Math.max(months,14) : months, [has14,months]);
  const result = useMemo(()=> computeAll({ pay, months:effectiveMonths, has14:false, chBase, regimes, profile, fx, itAddiz }), [pay, effectiveMonths, chBase, regimes, profile, fx, itAddiz]);

  // Inversione Netto→Lordo (bisezione)
  const [targetNetMonthly, setTargetNetMonthly] = useState(3500);
  const invertedGross = useMemo(()=>{
    let lo=0, hi=30000;
    for(let i=0;i<42;i++){
      const mid=(lo+hi)/2; const probePay={...pay, grossMonthlyCHF: mid};
      const rr = computeAll({ pay:probePay, months:effectiveMonths, has14:false, chBase, regimes, profile, fx, itAddiz });
      if (rr.netMonthly < targetNetMonthly) lo = mid; else hi = mid;
    }
    return (lo+hi)/2;
  }, [targetNetMonthly, effectiveMonths, pay.allowancesCHF, regimes, profile, chBase, fx, itAddiz]);

  // Test automatici (console-only)
  useEffect(()=>{
    function approxEq(a,b,tol=1e-6){ return Math.abs(a-b) <= tol; }
    const scenarios = [];
    scenarios.push(()=>{ const p={ residenceCountry:'IT', regime:'FR_IT_NEW', workCanton:'TI' }; const r=computeAll({ pay:{grossMonthlyCHF:4000,dependents:0,allowancesCHF:0}, months:13, has14:false, chBase, regimes, profile:p, fx:{chfToEur:1}, itAddiz }); return {name:'A – IT nuovo 4k', pass:r.grossYear>0 && r.totalTax>=0 && r.netYear<=r.grossYear && r.creditCHF<=r.sourceTax+1e-6}; });
    scenarios.push(()=>{ const p={ residenceCountry:'IT', regime:'FR_IT_OLD', workCanton:'TI' }; const r=computeAll({ pay:{grossMonthlyCHF:4000,dependents:0,allowancesCHF:0}, months:13, has14:false, chBase, regimes, profile:p, fx:{chfToEur:1}, itAddiz }); return {name:'B – IT vecchio 4k', pass: approxEq(r.homeTaxCHF,0)}; });
    scenarios.push(()=>{ const p={ residenceCountry:'FR', regime:'FR_FR', workCanton:'GE' }; const r=computeAll({ pay:{grossMonthlyCHF:5000,dependents:0,allowancesCHF:0}, months:13, has14:false, chBase, regimes, profile:p, fx:{chfToEur:1}, itAddiz }); return {name:'C – FR_FR 5k', pass: r.creditCHF <= r.sourceTax + 1e-6}; });
    scenarios.push(()=>{ const p={ residenceCountry:'IT', regime:'RES_C', workCanton:'TI' }; const r=computeAll({ pay:{grossMonthlyCHF:4500,dependents:0,allowancesCHF:0}, months:12, has14:false, chBase, regimes, profile:p, fx:{chfToEur:1}, itAddiz }); return {name:'D – RES_C 4.5k', pass: r.netYear <= r.grossYear && r.homeTaxCHF>=0}; });
    console.log('[Test automatici]', scenarios.map(f=>f()));
  }, [chBase, regimes, itAddiz]);

  // ---------------- UI ----------------
  return (
    <ErrorBoundary>
      <div style={{minHeight:'100vh', background:'linear-gradient(#f8fafc, #fff)', color:'#0f172a'}}>
        {/* Header */}
        <div style={{position:'sticky', top:0, zIndex:10, background:'#ffffffb3', backdropFilter:'blur(8px)', borderBottom:'1px solid #e2e8f0'}}>
          <div style={{maxWidth:1200, margin:'0 auto', padding:'0 16px', height:64, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div style={{height:36,width:36,borderRadius:12,background:'#000',color:'#fff',display:'grid',placeItems:'center',fontWeight:700}}>FR</div>
              <div>
                <div style={{fontSize:12,color:'#64748b',lineHeight:1}}>Calcolatore</div>
                <div style={{fontWeight:600}}>Frontalieri & Permessi</div>
              </div>
            </div>
            <div style={{border:'1px solid #e2e8f0',borderRadius:12, overflow:'hidden', display:'flex'}}>
              <button onClick={()=>setMode('G2N')} style={{padding:'8px 12px', border:'none', background: mode==='G2N'?'#0ea5e9':'transparent', color: mode==='G2N'?'#fff':'#0f172a'}}>Lordo → Netto</button>
              <button onClick={()=>setMode('N2G')} style={{padding:'8px 12px', border:'none', background: mode==='N2G'?'#0ea5e9':'transparent', color: mode==='N2G'?'#fff':'#0f172a'}}>Netto → Lordo</button>
            </div>
          </div>

          {/* Toolbar viewport preview - SOLO in DEV */}
          {isDev && (
            <div style={{maxWidth:1200, margin:'0 auto', padding:'8px 16px 12px 16px', display:'flex', gap:8, alignItems:'center'}}>
              <span style={{fontSize:12,color:'#64748b'}}>Anteprima:</span>
              {['mobile','tablet','desktop'].map(v => (
                <button key={v}
                  onClick={()=>setViewport(v)}
                  style={{padding:'6px 10px', border:'1px solid #e2e8f0', borderRadius:10, background: viewport===v?'#0ea5e9':'#fff', color: viewport===v?'#fff':'#0f172a'}}>
                  {v==='mobile'?'Smartphone':v==='tablet'?'Tablet':'Desktop'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Viewport container */}
        <div style={{display:'grid', placeItems:'start center', padding:'12px 16px'}}>
          {(() => {
            const width = viewport==='mobile' ? 390 : viewport==='tablet' ? 768 : 1200;
            const radius = viewport==='desktop' ? 0 : 24;
            const border = viewport==='desktop' ? 'none' : '1px solid #e2e8f0';
            const shadow = viewport==='desktop' ? 'none' : '0 10px 30px rgba(2,6,23,0.08)';
            return (
              <div style={{width, maxWidth:'100%', border, borderRadius:radius, boxShadow:shadow, overflow:'hidden', background:'#fff'}}>
                <main style={{maxWidth:1200, margin:'0 auto', padding:'24px 16px', display:'grid', gap:24}}>

                  {/* Impostazioni */}
                  <section style={{border:'1px solid #e2e8f0', borderRadius:16, background:'#fff'}}>
                    <div style={{padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:600}}>Impostazioni</div>
                    <div style={{padding:16, display:'grid', gridTemplateColumns: viewport==='desktop' ? '200px 220px 160px minmax(280px,1fr) 140px' : 'repeat(auto-fit, minmax(220px,1fr))', gap:12, alignItems:'start', maxWidth: viewport==='desktop' ? 1080 : undefined, margin: viewport==='desktop' ? '0 auto' : undefined}}>
                      {/* Paese */}
                      <div style={{display:'grid', gap:4}}>
                        <label style={{fontSize:12,color:'#475569'}}>Paese di residenza</label>
                        <select value={profile.residenceCountry} onChange={(e)=>setProfile(prev=>({ ...prev, residenceCountry:e.target.value }))} style={{border:'1px solid #cbd5e1', borderRadius:12, padding:'6px 8px', width:'100%'}}>
                          <option value="IT">Italia</option>
                          <option value="FR">Francia</option>
                          <option value="DE">Germania</option>
                        </select>
                      </div>
                      {/* Regime */}
                      <div style={{display:'grid', gap:4}}>
                        <label style={{fontSize:12,color:'#475569'}}>Regime</label>
                        <select value={profile.regime} onChange={(e)=>setProfile(prev=>({ ...prev, regime:e.target.value }))} style={{border:'1px solid #cbd5e1', borderRadius:12, padding:'6px 8px', width:'100%'}}>
                          <option value="FR_IT_NEW">Frontaliere (nuovo)</option>
                          <option value="FR_IT_OLD">Frontaliere (vecchio)</option>
                          <option value="RES_B">Residente CH B</option>
                          <option value="RES_C">Residente CH C</option>
                          <option value="FR_FR">Frontaliere Francia</option>
                          <option value="FR_DE">Frontaliere Germania</option>
                        </select>
                      </div>
                      {/* Canton */}
                      <div style={{display:'grid', gap:4}}>
                        <label style={{fontSize:12,color:'#475569'}}>Canton di lavoro</label>
                        <select value={profile.workCanton} onChange={(e)=>setProfile(prev=>({ ...prev, workCanton:e.target.value }))} style={{border:'1px solid #cbd5e1', borderRadius:12, padding:'6px 8px', width:'100%'}}>
                          {['TI','GR','VS','GE','BS','BL','JU','SH','ZH','SG','VD','NE'].map(c=> <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      {/* Mensilità */}
                      <div style={{display:'grid', gap:8}}>
                        <div style={{fontSize:12,color:'#475569'}}>Mensilità</div>
                        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                          <button aria-label="-1" onClick={()=> setMonths(m=> Math.max(12, Math.min(14, (m||12)-1)))} style={{width:32,height:32,border:'1px solid #cbd5e1',borderRadius:10,background:'#fff'}}>–</button>
                          <input
                            type="number"
                            min={12}
                            max={14}
                            step={1}
                            value={months}
                            onChange={(e)=>{ const n = Number(e.target.value); if(Number.isFinite(n)) setMonths(Math.max(12, Math.min(14, n))); }}
                            style={{width:72,textAlign:'center',border:'1px solid #cbd5e1',borderRadius:12,padding:'8px 10px'}}
                            inputMode="numeric"
                          />
                          <button aria-label="+1" onClick={()=> setMonths(m=> Math.max(12, Math.min(14, (m||12)+1)))} style={{width:32,height:32,border:'1px solid #cbd5e1',borderRadius:10,background:'#fff'}}>+</button>
                          <label style={{display:'flex', alignItems:'center', gap:8, fontSize:14, whiteSpace:'normal'}}>
                            <input type="checkbox" checked={has14} onChange={(e)=>setHas14(e.target.checked)} /> 14ª mensilità
                          </label>
                        </div>
                        <div style={{fontSize:12,color:'#64748b', display: viewport==='desktop' ? 'none' : 'block'}}>Valori ammessi: 12–14. Se attivi la 14ª, il calcolo usa comunque {String('{')}Math.max(months,14){String('}')}. </div>
                      </div>
                      {/* FX */}
                      <div style={{minWidth:160}}>
                        <div style={{fontSize:12,color:'#475569'}}>Cambio CHF→EUR</div>
                        <NumberField id="fx" label="" value={fx.chfToEur} onChange={(v)=>setFx({ chfToEur: v || 1 })} step={0.01} suffix="×" width={120} />
                      </div>
                    </div>
                  </section>

                  {/* Addizionali Italia (condizionale) */}
                  {(profile.residenceCountry==='IT' && profile.regime==='FR_IT_NEW') && (
                    <section style={{border:'1px solid #e2e8f0', borderRadius:16, background:'#fff'}}>
                      <div style={{padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:600}}>Addizionali Italia</div>
                      <div style={{padding:16, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:16, alignItems:'end'}}>
                        <div style={{gridColumn:'1 / -1', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:12, padding:12, fontSize:14, color:'#334155'}}>
                          Le addizionali <b>regionale</b> e <b>comunale</b> sono stime su imponibile italiano (dopo franchigia) e non sono coperte dal credito per imposte estere.
                        </div>
                        <label style={{display:'flex',alignItems:'center',gap:8}}>
                          <input type="checkbox" checked={itAddiz.enable} onChange={(e)=>setItAddiz(prev=>({ ...prev, enable: e.target.checked }))} />
                          Applica addizionali IRPEF
                        </label>
                        <div>
                          <div style={{fontSize:12,color:'#475569'}}>Regione (facoltativa)</div>
                          <input placeholder="Es. Lombardia" value={itAddiz.region} onChange={(e)=>setItAddiz(prev=>({ ...prev, region: e.target.value }))} style={{border:'1px solid #cbd5e1',borderRadius:12,padding:'8px 10px', width:180}} />
                        </div>
                        <div>
                          <div style={{fontSize:12,color:'#475569'}}>Comune (facoltativo)</div>
                          <input placeholder="Es. Como" value={itAddiz.municipality} onChange={(e)=>setItAddiz(prev=>({ ...prev, municipality: e.target.value }))} style={{border:'1px solid #cbd5e1',borderRadius:12,padding:'8px 10px', width:180}} />
                        </div>
                        <PercentField id="regRate" label="Aliquota regionale" value={itAddiz.regionalRate} onChange={(v)=>setItAddiz(prev=>({ ...prev, regionalRate: v }))} />
                        <PercentField id="munRate" label="Aliquota comunale" value={itAddiz.municipalRate} onChange={(v)=>setItAddiz(prev=>({ ...prev, municipalRate: v }))} />
                      </div>
                    </section>
                  )}

                  {/* Retribuzione */}
                  <section style={{border:'1px solid #e2e8f0', borderRadius:16, background:'#fff'}}>
                    <div style={{padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:600}}>Retribuzione</div>
                    <div style={{padding:16, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:16}}>
                      {mode==='G2N' ? (
                        <>
                          <NumberField id="gross" label="Lordo mensile" value={pay.grossMonthlyCHF} onChange={(v)=>setPay(prev=>({ ...prev, grossMonthlyCHF: v }))} suffix="CHF" step={50} />
                          <NumberField id="allow" label="Indennità/bonus annui" value={pay.allowancesCHF} onChange={(v)=>setPay(prev=>({ ...prev, allowancesCHF: v }))} suffix="CHF" step={50} />
                          <NumberField id="dep" label="Familiari a carico" value={pay.dependents} onChange={(v)=>setPay(prev=>({ ...prev, dependents: v }))} step={1} />
                          <ReadOnlyField label="Mensilità effettive" value={`${effectiveMonths}`} />
                        </>
                      ) : (
                        <>
                          <NumberField id="netTarget" label="Netto mensile desiderato" value={targetNetMonthly} onChange={setTargetNetMonthly} suffix="CHF" step={25} />
                          <ReadOnlyField label="Lordo mensile stimato" value={fmtCHF(invertedGross)} />
                          <div style={{display:'flex',alignItems:'end'}}>
                            <button onClick={()=> setPay(prev=>({ ...prev, grossMonthlyCHF: Math.round(invertedGross) }))} style={{padding:'8px 12px',borderRadius:12,border:'1px solid #cbd5e1',background:'#f1f5f9'}}>Usa questo lordo</button>
                          </div>
                        </>
                      )}
                    </div>
                  </section>

                  {/* Parametri regime dinamici */}
                  <section style={{border:'1px solid #e2e8f0', borderRadius:16, background:'#fff'}}>
                    <div style={{padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:600}}>Parametri regime: {regimes[profile.regime]?.label}</div>
                    <div style={{padding:16, display:'grid', gridTemplateColumns: viewport==='mobile' ? '1fr' : viewport==='tablet' ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap:16}}>
                      {/* Imposta alla fonte - SEMPRE visibile */}
                      <PercentField
                        id="srcRate"
                        label="Imposta alla fonte CH"
                        value={regimes[profile.regime]?.sourceTaxRate ?? 0}
                        onChange={(v)=> setRegimes(prev=>({ ...prev, [profile.regime]: { ...prev[profile.regime], sourceTaxRate: v } }))}
                        width={viewport==='mobile' ? '100%' : undefined}
                      />

                      {/* Nota vecchio frontaliero */}
                      {profile.regime==='FR_IT_OLD' && (
                        <div style={{gridColumn:'1 / -1', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:12, padding:12, color:'#92400e', fontSize:14}}>
                          Vecchio Frontaliero: <b>tassazione esclusiva in Svizzera</b>. IRPEF Italia non dovuta nel modello semplificato.
                        </div>
                      )}

                      {/* Parametri specifici NUOVO frontaliero (Italia) */}
                      {profile.regime==='FR_IT_NEW' && (
                        <>
                          <PercentField
                            id="srcFactor"
                            label="Quota imposta alla fonte (80%)"
                            value={regimes.FR_IT_NEW.sourceFactor ?? 0}
                            onChange={(v)=> setRegimes(prev=>({ ...prev, FR_IT_NEW: { ...prev.FR_IT_NEW, sourceFactor: v } }))}
                            width={viewport==='mobile' ? '100%' : undefined}
                          />
                          <NumberField
                            id="itAllowance"
                            label="Franchigia italiana"
                            value={regimes.FR_IT_NEW.itAllowanceEUR ?? 0}
                            onChange={(v)=> setRegimes(prev=>({ ...prev, FR_IT_NEW: { ...prev.FR_IT_NEW, itAllowanceEUR: v } }))}
                            suffix="EUR"
                            step={100}
                            width={viewport==='mobile' ? '100%' : undefined}
                          />
                          <PercentField
                            id="itEff"
                            label="Aliquota IRPEF eff."
                            value={regimes.FR_IT_NEW.itEffRate ?? 0}
                            onChange={(v)=> setRegimes(prev=>({ ...prev, FR_IT_NEW: { ...prev.FR_IT_NEW, itEffRate: v } }))}
                            width={viewport==='mobile' ? '100%' : undefined}
                          />
                          <PercentField
                            id="itCredShare"
                            label="Quota credito"
                            value={regimes.FR_IT_NEW.itTaxCreditShare ?? 0}
                            onChange={(v)=> setRegimes(prev=>({ ...prev, FR_IT_NEW: { ...prev.FR_IT_NEW, itTaxCreditShare: v } }))}
                            width={viewport==='mobile' ? '100%' : undefined}
                          />
                        </>
                      )}

                      {/* Parametri per FR/DE */}
                      {(profile.regime==='FR_DE' || profile.regime==='FR_FR') && (
                        <>
                          <PercentField
                            id="homeRate"
                            label="Aliquota paese di residenza (eff.)"
                            value={regimes[profile.regime]?.homeTaxRate ?? 0}
                            onChange={(v)=> setRegimes(prev=>({ ...prev, [profile.regime]: { ...prev[profile.regime], homeTaxRate: v } }))}
                            width={viewport==='mobile' ? '100%' : undefined}
                          />
                          <PercentField
                            id="creditShare"
                            label="Quota credito su fonte"
                            value={regimes[profile.regime]?.creditShare ?? 0}
                            onChange={(v)=> setRegimes(prev=>({ ...prev, [profile.regime]: { ...prev[profile.regime], creditShare: v } }))}
                            width={viewport==='mobile' ? '100%' : undefined}
                          />
                        </>
                      )}
                    </div>
                  </section>

                  {/* Risultato */}
                  <section style={{border:'1px solid #e2e8f0', borderRadius:16, background:'#fff'}}>
                    <div style={{padding:'12px 16px', borderBottom:'1px solid #e2e8f0', fontWeight:600}}>Risultato</div>
                    <div style={{padding:16, display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16}}>
                      <SummaryItem label="Lordo annuo" value={fmtCHF(result.grossYear)} />
                      <SummaryItem label="Contributi sociali" value={fmtCHF(result.social)} />
                      <SummaryItem label="AHV/IV/EO" value={fmtCHF(result.ahv)} />
                      <SummaryItem label="ALV" value={fmtCHF(result.alv)} />
                      <SummaryItem label="LPP" value={fmtCHF(result.lpp)} />
                      <SummaryItem label="Infortuni NBU" value={fmtCHF(result.nbu)} />
                      <SummaryItem label="Imponibile CH" value={fmtCHF(result.taxableCH)} />
                      <SummaryItem label="Imposta alla fonte CH" value={fmtCHF(result.sourceTax)} />

                      {(profile.residenceCountry==='IT' && profile.regime==='FR_IT_NEW') && (
                        <>
                          <SummaryItem label="IRPEF Italia netta" value={fmtCHF(result.itIrpefNetCHF)} />
                          <SummaryItem label="Addizionali Italia" value={fmtCHF(result.itAddizCHF)} />
                        </>
                      )}

                      {(profile.regime!=='RES_B' && profile.regime!=='RES_C') && (
                        <SummaryItem label="Totale imposte paese di residenza" value={fmtCHF(result.homeTaxCHF)} />
                      )}

                      <SummaryItem label="Credito per imposta CH" value={fmtCHF(result.creditCHF)} />
                      <SummaryItem label="Totale oneri" value={fmtCHF(result.totalTax)} />
                      <SummaryItem label="Netto annuo" value={fmtCHF(result.netYear)} highlight />
                      <SummaryItem label="Netto mensile" value={fmtCHF(result.netMonthly)} highlight big />
                    </div>
                  </section>

                </main>
              </div>
            );
          })()}
        </div>

        {/* Footer debug - SOLO in DEV */}
        {isDev && (
          <div style={{maxWidth:1200, margin:'0 auto', padding:'12px 16px', fontSize:12, color:'#64748b'}}>
            Regime: <b>{profile.regime}</b> • Residenza: <b>{profile.residenceCountry}</b> • Modalità: <b>{mode}</b> • Viewport: <b>{viewport}</b>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
