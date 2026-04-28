import { useState, useRef, useEffect } from "react";

// ─── KEYS (stored in Netlify environment variables) ──────────
const ANTHROPIC_API_KEY = process.env.REACT_APP_ANTHROPIC_KEY || "";
const OURA_PERSONAL_TOKEN = process.env.REACT_APP_OURA_TOKEN || "";
// ─────────────────────────────────────────────────────────────

const TEAL = "#1D9E75";
const TEAL_D = "#0F6E56";
const TEAL_L = "#E1F5EE";
const BLUE = "#378ADD";
const PURPLE = "#7F77DD";
const AMBER = "#BA7517";
const RED = "#E24B4A";

const initWeights = [
  { date: "Mar 1", kg: 89.2 }, { date: "Mar 8", kg: 88.7 },
  { date: "Mar 15", kg: 88.1 }, { date: "Mar 22", kg: 87.9 },
  { date: "Mar 29", kg: 87.4 }, { date: "Apr 5", kg: 87.0 },
  { date: "Apr 12", kg: 86.6 }, { date: "Apr 19", kg: 86.1 },
];

const weekData = [
  { day: "Mon", hrv: 45, sleep: 74, steps: 8200, cal: 1850 },
  { day: "Tue", hrv: 52, sleep: 80, steps: 10100, cal: 2100 },
  { day: "Wed", hrv: 48, sleep: 91, steps: 9300, cal: 1920 },
  { day: "Thu", hrv: 61, sleep: 91, steps: 7800, cal: 1780 },
  { day: "Fri", hrv: 55, sleep: 63, steps: 11200, cal: 2250 },
  { day: "Sat", hrv: 58, sleep: 50, steps: 6500, cal: 2050 },
  { day: "Sun", hrv: 63, sleep: 80, steps: 5200, cal: 1900 },
];

// ── Netlify function caller ──────────────────────────────────
async function fetchOuraData(days = 7) {
  const today = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const endpoints = ["daily_sleep", "daily_readiness", "daily_activity"];
  const keys = ["sleep", "readiness", "activity"];
  const results = {};
  for (let i = 0; i < endpoints.length; i++) {
    try {
      const res = await fetch(
        `/.netlify/functions/oura?endpoint=${endpoints[i]}&start_date=${startDate}&end_date=${today}`
      );
      results[keys[i]] = await res.json();
    } catch (e) {
      results[keys[i]] = { error: e.message, data: [] };
    }
  }
  return results;
}

function buildChartData(ouraData) {
  const sleepItems = Array.isArray(ouraData.sleep?.data) ? ouraData.sleep.data : [];
  const readinessItems = Array.isArray(ouraData.readiness?.data) ? ouraData.readiness.data : [];
  const activityItems = Array.isArray(ouraData.activity?.data) ? ouraData.activity.data : [];

  const sleepMap = {}, readinessMap = {}, activityMap = {};
  sleepItems.forEach(d => { if (d?.day) sleepMap[d.day] = d.score || 0; });
  readinessItems.forEach(d => { if (d?.day) readinessMap[d.day] = d.contributors?.hrv_balance || 0; });
  activityItems.forEach(d => { if (d?.day) activityMap[d.day] = { steps: d.steps || 0, cal: d.total_calories || 0 }; });

  // Get all unique dates sorted ascending
  const allDates = [...new Set([
    ...sleepItems.map(d => d.day),
    ...readinessItems.map(d => d.day),
    ...activityItems.map(d => d.day),
  ])].filter(Boolean).sort();

  return allDates.map(date => {
    const d = new Date(date + "T12:00:00");
    const label = allDates.length <= 7
      ? d.toLocaleDateString("en-US", { weekday: "short" })
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return {
      day: label,
      date,
      hrv: readinessMap[date] || 0,
      sleep: sleepMap[date] || 0,
      steps: activityMap[date]?.steps || 0,
      cal: activityMap[date]?.cal || 0,
    };
  });
}

// ── Simple SVG charts ────────────────────────────────────────
function SimpleLineChart({ data, dataKey, color }) {
  const w = 560, h = 155, pad = { top: 10, right: 10, bottom: 24, left: 36 };
  const vals = data.map(d => d[dataKey]).filter(v => v > 0);
  if (vals.length === 0) return <div style={{ height: 155, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)", fontSize: 12 }}>No data yet</div>;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;
  const activeData = data.filter(d => d[dataKey] > 0);
  const x = i => pad.left + (i / Math.max(activeData.length - 1, 1)) * iw;
  const y = v => pad.top + ih - ((v - min) / range) * ih;
  const points = activeData.map((d, i) => `${x(i)},${y(d[dataKey])}`).join(" ");
  const area = activeData.length > 1
    ? `M${x(0)},${y(activeData[0][dataKey])} ` + activeData.map((d, i) => `L${x(i)},${y(d[dataKey])}`).join(" ") + ` L${x(activeData.length - 1)},${pad.top + ih} L${x(0)},${pad.top + ih} Z`
    : "";
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      {[0, 1, 2, 3].map(i => <line key={i} x1={pad.left} x2={w - pad.right} y1={pad.top + (ih / 3) * i} y2={pad.top + (ih / 3) * i} stroke="rgba(128,128,128,0.15)" strokeDasharray="4 4" />)}
      {area && <path d={area} fill={color} fillOpacity={0.15} />}
      {activeData.length > 1 && <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />}
      {activeData.map((d, i) => <circle key={i} cx={x(i)} cy={y(d[dataKey])} r={3} fill={color} />)}
      {activeData.map((d, i) => <text key={i} x={x(i)} y={h - 4} textAnchor="middle" fontSize={10} fill="#888">{d.day}</text>)}
      {[min, Math.round((min + max) / 2), max].map((v, i) => <text key={i} x={pad.left - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="#888">{Math.round(v)}</text>)}
    </svg>
  );
}

function WeightChart({ data, goalKg, color }) {
  const sorted = [...data].sort((a, b) => new Date(a.date + " 2026") - new Date(b.date + " 2026"));
  const w = 480, h = 230, pad = { top: 10, right: 60, bottom: 24, left: 40 };
  const vals = sorted.map(d => d.kg);
  const allVals = [...vals, goalKg];
  const min = Math.min(...allVals) - 2;
  const max = Math.max(...allVals) + 2;
  const range = max - min || 1;
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;
  const x = i => pad.left + (i / Math.max(sorted.length - 1, 1)) * iw;
  const y = v => pad.top + ih - ((v - min) / range) * ih;
  const points = sorted.map((d, i) => `${x(i)},${y(d.kg)}`).join(" ");
  const area = sorted.length > 1
    ? `M${x(0)},${y(sorted[0].kg)} ` + sorted.map((d, i) => `L${x(i)},${y(d.kg)}`).join(" ") + ` L${x(sorted.length - 1)},${pad.top + ih} L${x(0)},${pad.top + ih} Z`
    : "";
  const goalY = y(goalKg);
  const trending = sorted.length > 1 && sorted[sorted.length - 1].kg < sorted[0].kg;
  const lineColor = trending ? color : RED;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      {[0, 1, 2, 3].map(i => <line key={i} x1={pad.left} x2={w - pad.right} y1={pad.top + (ih / 3) * i} y2={pad.top + (ih / 3) * i} stroke="rgba(128,128,128,0.15)" strokeDasharray="4 4" />)}
      <line x1={pad.left} x2={w - pad.right} y1={goalY} y2={goalY} stroke={color} strokeDasharray="6 4" strokeWidth={1.5} />
      <text x={w - pad.right + 4} y={goalY + 4} fontSize={10} fill={color} fontWeight="500">Goal</text>
      <text x={w - pad.right + 4} y={goalY + 15} fontSize={10} fill={color}>{goalKg}kg</text>
      {area && <path d={area} fill={lineColor} fillOpacity={0.12} />}
      {sorted.length > 1 && <polyline points={points} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />}
      {sorted.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.kg)} r={3} fill={lineColor} />)}
      {sorted.map((d, i) => i % 2 === 0 ? <text key={i} x={x(i)} y={h - 4} textAnchor="middle" fontSize={9} fill="#888">{d.date}</text> : null)}
      {[Math.ceil(min + 1), Math.round((min + max) / 2), Math.floor(max - 1)].map((v, i) => <text key={i} x={pad.left - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="#888">{v}</text>)}
    </svg>
  );
}

// ── Password gate ────────────────────────────────────────────
const APP_PASSWORD = "idgie2025";

function PasswordGate({ onUnlock }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const attempt = () => {
    if (input === APP_PASSWORD) { onUnlock(); }
    else {
      setError(true); setShake(true);
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setError(false), 2500);
      setInput("");
    }
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)", fontFamily: "var(--font-sans)" }}>
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "48px 40px", width: 320, textAlign: "center", transform: shake ? "translateX(6px)" : "none", transition: "transform 0.1s" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500, color: TEAL, letterSpacing: "0.08em", marginBottom: 4 }}>IDGIE</div>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.06em", marginBottom: 32 }}>YOUR HEALTH, CONNECTED</div>
        <input type="password" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && attempt()} placeholder="Enter password" autoFocus
          style={{ width: "100%", border: `0.5px solid ${error ? RED : "var(--color-border-tertiary)"}`, borderRadius: "var(--border-radius-md)", padding: "10px 14px", fontSize: 14, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", textAlign: "center", letterSpacing: "0.1em", marginBottom: 12, outline: "none" }} />
        {error && <div style={{ fontSize: 12, color: RED, marginBottom: 12 }}>Incorrect password — try again</div>}
        <button onClick={attempt} style={{ width: "100%", padding: "10px", background: TEAL, border: "none", borderRadius: "var(--border-radius-md)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)" }}>Unlock</button>
      </div>
    </div>
  );
}

// ── Main app ─────────────────────────────────────────────────
export default function IdgieApp() {
  const [unlocked, setUnlocked] = useState(false);
  const [nav, setNav] = useState("dashboard");

  // Oura state
  const [ouraData, setOuraData] = useState(null);
  const [ouraLoading, setOuraLoading] = useState(false);
  const [ouraError, setOuraError] = useState("");
  const [chartData, setChartData] = useState(weekData);

  // Weight state
  const [weights, setWeights] = useState(() => {
    try {
      const saved = localStorage.getItem("idgie_weights");
      return saved ? JSON.parse(saved) : initWeights;
    } catch (e) { return initWeights; }
  });
  const [newWeightKg, setNewWeightKg] = useState("");
  const [newWeightDate, setNewWeightDate] = useState(new Date().toISOString().split("T")[0]);
  const [goalKg, setGoalKg] = useState(() => {
    try {
      const saved = localStorage.getItem("idgie_goal_kg");
      return saved ? parseFloat(saved) : 70;
    } catch (e) { return 70; }
  });
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("70");

  // Insights state
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Trend chart
  const [activeMetric, setActiveMetric] = useState("hrv");
  const [trendDays, setTrendDays] = useState(7);
  const [extendedData, setExtendedData] = useState([]);

  // BCBSAL state
  const [bcbsalConnected, setBcbsalConnected] = useState(() => !!localStorage.getItem("idgie_bcbsal_token"));
  const [bcbsalData, setBcbsalData] = useState(null);
  const [bcbsalLoading, setBcbsalLoading] = useState(false);
  const [bcbsalError, setBcbsalError] = useState("");



  // Profile
  const [profile] = useState({
    conditions: "Pre-diabetic, high blood pressure",
    goals: "Lose 15 lbs, improve HRV, reduce A1C",
    medications: "Lisinopril 10mg",
  });

  const card = { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "20px" };

  const metrics = [
    { key: "hrv", label: "HRV", color: TEAL, unit: "ms" },
    { key: "sleep", label: "Sleep", color: BLUE, unit: "score" },
    { key: "steps", label: "Steps", color: PURPLE, unit: "" },
    { key: "cal", label: "Calories", color: AMBER, unit: "" },
  ];
  const activeM = metrics.find(m => m.key === activeMetric);

  // Load Oura on startup with 24hr cache
  useEffect(() => {
    if (OURA_PERSONAL_TOKEN || true) { // always try via Netlify function
      loadOuraData();
    }
  }, []); // eslint-disable-line

  const loadOuraData = async (force = false) => {
    const cacheKey = "idgie_oura_cache";
    const cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        if (cached && Date.now() - cached.timestamp < cacheExpiry) {
          setOuraData(cached.data);
          setChartData(buildChartData(cached.data));
          return;
        }
      } catch (e) {}
    }
    setOuraLoading(true);
    setOuraError("");
    try {
      const data = await fetchOuraData();
      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
      setOuraData(data);
      setChartData(buildChartData(data));
    } catch (e) {
      setOuraError("Could not load Oura data");
    }
    setOuraLoading(false);
  };

  const refreshOura = () => loadOuraData(true);

  const loadExtendedData = async (days) => {
    setOuraLoading(true);
    try {
      const data = await fetchOuraData(days);
      setExtendedData(buildChartData(data));
    } catch (e) {}
    setOuraLoading(false);
  };

  const handleTrendDaysChange = (days) => {
    setTrendDays(days);
    if (days === 7) {
      setExtendedData([]);
    } else {
      loadExtendedData(days);
    }
  };

  // Weight helpers
  const addWeight = () => {
    const kg = parseFloat(newWeightKg);
    if (!kg || kg < 30 || kg > 300) return;
    const label = new Date(newWeightDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const updated = [...weights, { date: label, kg }];
    setWeights(updated);
    try { localStorage.setItem("idgie_weights", JSON.stringify(updated)); } catch (e) {}
    setNewWeightKg("");
  };

  const deleteWeight = (index) => {
    const updated = weights.filter((_, i) => i !== index);
    setWeights(updated);
    try { localStorage.setItem("idgie_weights", JSON.stringify(updated)); } catch (e) {}
  };

  const latestKg = weights[weights.length - 1]?.kg || 0;
  const startKg = weights[0]?.kg || 0;
  const lostKg = (startKg - latestKg).toFixed(1);
  const toGoal = Math.max(0, latestKg - goalKg).toFixed(1);
  const pct = Math.min(100, Math.max(0, Math.round(((startKg - latestKg) / Math.max(startKg - goalKg, 0.1)) * 100)));

  // Handle BCBSAL OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (code && state) {
      window.history.replaceState({}, "", window.location.pathname);
      setBcbsalLoading(true);
      const redirectUri = window.location.origin;
      fetch("/.netlify/functions/bcbsal?code=" + code + "&redirect_uri=" + encodeURIComponent(redirectUri))
        .then(r => r.json())
        .then(data => {
          if (data.access_token) {
            localStorage.setItem("idgie_bcbsal_token", data.access_token);
            setBcbsalConnected(true);
            setBcbsalLoading(false);
            loadBCBSALData();
          } else {
            setBcbsalError("Authorization failed: " + (data.error || "unknown error"));
            setBcbsalLoading(false);
          }
        })
        .catch(e => {
          setBcbsalError("Connection error: " + e.message);
          setBcbsalLoading(false);
        });
    }
  }, []); // eslint-disable-line

  const disconnectBCBSAL = () => {
    localStorage.removeItem("idgie_bcbsal_token");
    setBcbsalConnected(false);
    setBcbsalData(null);
  };

  // BCBSAL helpers
  const connectBCBSAL = () => {
    const redirectUri = window.location.origin;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: "9akZZDwCKo0ZlxU2uag4je9zrDKpO8WToHjKBcZx",
      redirect_uri: redirectUri,
      scope: "patient/*.read launch/patient openid fhirUser",
      state: Math.random().toString(36).slice(2),
      aud: "https://api-bcbsal-uat.safhir.io/v1/api",
    });
    window.location.href = "https://api-bcbsal-uat.safhir.io/slapv3/o/pdex/authorize/?" + params.toString();
  };

  const loadBCBSALData = async () => {
    const token = localStorage.getItem("idgie_bcbsal_token");
    if (!token) return;
    setBcbsalLoading(true);
    setBcbsalError("");
    try {
      const res = await fetch("/.netlify/functions/bcbsal", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBcbsalData(data);
    } catch (e) {
      setBcbsalError("Could not load BCBSAL data — try reconnecting");
    }
    setBcbsalLoading(false);
  };

  // AI insights
  const generateInsights = async () => {
    setLoadingInsights(true);
    setInsights(null);
    try {
      const todayActivity = ouraData?.activity?.data?.slice(-1)[0];
      const todayReadiness = ouraData?.readiness?.data?.slice(-1)[0];
      const todaySleep = ouraData?.sleep?.data?.slice(-1)[0];
      const res = await fetch("/.netlify/functions/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conditions: profile.conditions,
          goals: profile.goals,
          medications: profile.medications,
          sleepScore: todaySleep?.score,
          hrv: todayReadiness?.contributors?.hrv_balance,
          readiness: todayReadiness?.score,
          steps: todayActivity?.steps,
          calories: todayActivity?.total_calories,
          latestKg, startKg, goalKg, lostKg, toGoal,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setInsights(data);
    } catch { setInsights({ error: true }); }
    setLoadingInsights(false);
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", sym: "◉" },
    { id: "weight", label: "Weight log", sym: "⊡" },
    { id: "correlation", label: "Correlation", sym: "⋈" },
    { id: "records", label: "Health records", sym: "≡" },
    { id: "insights", label: "AI insights", sym: "✦" },
  ];

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  // Get today's live stats
  const todayActivity = ouraData?.activity?.data?.slice(-1)[0];
  const todayReadiness = ouraData?.readiness?.data?.slice(-1)[0];
  const todaySleep = ouraData?.sleep?.data?.slice(-1)[0];

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-sans)", background: "var(--color-background-tertiary)" }}>

      {/* ── Sidebar ── */}
      <aside style={{ width: 196, background: "var(--color-background-primary)", borderRight: "0.5px solid var(--color-border-tertiary)", padding: "24px 12px", display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
        <div style={{ padding: "0 8px 24px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500, color: TEAL, letterSpacing: "0.08em" }}>IDGIE</div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", letterSpacing: "0.06em" }}>YOUR HEALTH, CONNECTED</div>
        </div>
        {navItems.map(item => (
          <button key={item.id} onClick={() => setNav(item.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: "var(--border-radius-md)", border: "none", cursor: "pointer", textAlign: "left", width: "100%", background: nav === item.id ? TEAL_L : "transparent", color: nav === item.id ? TEAL_D : "var(--color-text-secondary)", fontSize: 13, fontWeight: nav === item.id ? 500 : 400, fontFamily: "var(--font-sans)", transition: "background 0.15s" }}>
            <span style={{ fontSize: 13, width: 16, textAlign: "center", flexShrink: 0 }}>{item.sym}</span>
            {item.label}
          </button>
        ))}
        <div style={{ marginTop: "auto", paddingTop: 20 }}>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 8, paddingLeft: 10 }}>SOURCES</div>
          {[
            { label: "Oura Ring", on: !!ouraData },
            { label: "BCBSAL", on: bcbsalConnected },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 10px", fontSize: 12 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.on ? TEAL : "#888780", flexShrink: 0 }} />
              <span style={{ color: s.on ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, padding: "28px 32px", overflow: "auto" }}>

        {/* ─── DASHBOARD ─── */}
        {nav === "dashboard" && (
          <div>
            <h2 style={{ margin: "0 0 2px", fontSize: 20 }}>Good morning</h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 16px", fontSize: 13 }}>Here's your health picture today</p>

            {ouraData && !ouraLoading && (
              <div style={{ background: TEAL_L, border: `0.5px solid ${TEAL}50`, borderRadius: "var(--border-radius-md)", padding: "8px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: TEAL_D }}>◉ Oura Ring connected — showing your real data</span>
                <button onClick={() => loadOuraData(true)} style={{ fontSize: 11, color: TEAL_D, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>Refresh →</button>
              </div>
            )}
            {ouraLoading && (
              <div style={{ background: TEAL_L, border: `0.5px solid ${TEAL}50`, borderRadius: "var(--border-radius-md)", padding: "8px 14px", marginBottom: 16 }}>
                <span style={{ fontSize: 12, color: TEAL_D }}>◌ Syncing your Oura data...</span>
              </div>
            )}
            {!ouraData && !ouraLoading && (
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "8px 14px", marginBottom: 16 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Showing sample data — Oura Ring syncs automatically each day</span>
              </div>
            )}

            {/* Health score + stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "172px 1fr", gap: 16, marginBottom: 18 }}>
              <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>
                <div style={{ position: "relative", width: 104, height: 104 }}>
                  <svg viewBox="0 0 104 104" style={{ transform: "rotate(-90deg)", width: 104, height: 104 }}>
                    <circle cx="52" cy="52" r="44" fill="none" stroke="var(--color-border-secondary)" strokeWidth="8" />
                    <circle cx="52" cy="52" r="44" fill="none" stroke={TEAL} strokeWidth="8"
                      strokeDasharray={`${2 * Math.PI * 44 * ((todayReadiness?.score || 73) / 100)} ${2 * Math.PI * 44}`} strokeLinecap="round" />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, color: TEAL }}>{todayReadiness?.score || 73}</span>
                    <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>/ 100</span>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)" }}>Readiness score</div>
                <div style={{ fontSize: 11, color: TEAL, marginTop: 3 }}>Oura Ring</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
                {[
                  { label: "HRV", value: todayReadiness?.contributors?.hrv_balance || "--", unit: "balance", color: TEAL, live: !!ouraData },
                  { label: "Sleep", value: todaySleep?.score || "--", unit: "score", color: BLUE, live: !!ouraData },
                  { label: "Steps", value: todayActivity?.steps ? (todayActivity.steps).toLocaleString() : "--", unit: "today", color: PURPLE, live: !!ouraData },
                  { label: "Calories", value: todayActivity?.total_calories ? (todayActivity.total_calories).toLocaleString() : "--", unit: "kcal", color: AMBER, live: !!ouraData },
                ].map(m => (
                  <div key={m.label} style={{ ...card, padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{m.label.toUpperCase()}</span>
                      {m.live && <span style={{ fontSize: 9, color: TEAL_D, background: TEAL_L, padding: "1px 5px", borderRadius: 8 }}>Live</span>}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{m.unit}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trend chart */}
            <div style={{ ...card, marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Oura trends</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[7, 30, 90].map(d => (
                      <button key={d} onClick={() => handleTrendDaysChange(d)}
                        style={{ padding: "2px 10px", borderRadius: 20, border: `0.5px solid ${trendDays === d ? TEAL : "var(--color-border-tertiary)"}`, background: trendDays === d ? TEAL_L : "transparent", color: trendDays === d ? TEAL_D : "var(--color-text-secondary)", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  {metrics.map(m => (
                    <button key={m.key} onClick={() => setActiveMetric(m.key)}
                      style={{ padding: "3px 10px", borderRadius: 20, border: `0.5px solid ${activeMetric === m.key ? m.color : "var(--color-border-tertiary)"}`, background: activeMetric === m.key ? `${m.color}22` : "transparent", color: activeMetric === m.key ? m.color : "var(--color-text-secondary)", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <SimpleLineChart data={trendDays === 7 ? chartData : extendedData} dataKey={activeMetric} color={activeM.color} />
            </div>

            {/* Weight summary */}
            <div style={{ ...card }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Weight progress</span>
                <button onClick={() => setNav("weight")} style={{ fontSize: 12, color: TEAL, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>Log weight →</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                {[
                  { label: "Current", value: `${latestKg} kg`, color: TEAL },
                  { label: "Lost", value: `${lostKg} kg`, color: BLUE },
                  { label: "To goal", value: `${toGoal} kg`, color: PURPLE },
                  { label: "Progress", value: `${pct}%`, color: AMBER },
                ].map(s => (
                  <div key={s.label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "12px" }}>
                    <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 6 }}>{s.label.toUpperCase()}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 500, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── WEIGHT LOG ─── */}
        {nav === "weight" && (
          <div>
            <h2 style={{ margin: "0 0 2px", fontSize: 20 }}>Weight log</h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 24px", fontSize: 13 }}>Track in kilograms · log weekly or add historical entries anytime</p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14, marginBottom: 20 }}>
              {[
                { label: "Current weight", value: `${latestKg} kg`, color: TEAL },
                { label: "Total lost", value: `${lostKg} kg`, color: BLUE },
                { label: "To goal", value: `${toGoal} kg`, color: PURPLE },
                { label: "Goal progress", value: `${pct}%`, color: AMBER },
              ].map(s => (
                <div key={s.label} style={{ ...card, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 8 }}>{s.label.toUpperCase()}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Weight history</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--color-text-tertiary)" }}>Goal:</span>
                    {editingGoal
                      ? <><input value={goalInput} onChange={e => setGoalInput(e.target.value)} style={{ width: 48, border: "0.5px solid var(--color-border-tertiary)", borderRadius: 4, padding: "2px 6px", fontSize: 11, background: "var(--color-background-secondary)", color: "var(--color-text-primary)" }} /><span style={{ fontSize: 11 }}>kg</span>
                          <button onClick={() => {
                            const newGoal = parseFloat(goalInput) || goalKg;
                            setGoalKg(newGoal);
                            try { localStorage.setItem("idgie_goal_kg", newGoal); } catch (e) {}
                            setEditingGoal(false);
                          }} style={{ fontSize: 11, color: TEAL, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>Save</button></>
                      : <><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: TEAL }}>{goalKg} kg</span>
                          <button onClick={() => setEditingGoal(true)} style={{ fontSize: 11, color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>edit</button></>
                    }
                  </div>
                </div>
                <WeightChart data={weights} goalKg={goalKg} color={TEAL} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 14 }}>Log a weigh-in</div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Date</label>
                    <input type="date" value={newWeightDate} onChange={e => setNewWeightDate(e.target.value)}
                      style={{ width: "100%", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "7px 10px", fontSize: 12, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Weight (kg)</label>
                    <input type="number" step="0.1" value={newWeightKg} onChange={e => setNewWeightKg(e.target.value)} placeholder="e.g. 86.1"
                      style={{ width: "100%", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "7px 10px", fontSize: 12, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" }} />
                  </div>
                  <button onClick={addWeight} style={{ width: "100%", padding: "9px", background: TEAL, border: "none", borderRadius: "var(--border-radius-md)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                    Add entry
                  </button>
                </div>
                <div style={{ ...card, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12 }}>History</div>
                  <div style={{ maxHeight: 280, overflow: "auto" }}>
                    {[...weights].reverse().map((w, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{w.date}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, color: TEAL }}>{w.kg} kg</span>
                          <button onClick={() => deleteWeight(weights.length - 1 - i)} style={{ fontSize: 10, color: RED, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── HEALTH RECORDS ─── */}
        {nav === "records" && (
          <div>
            <h2 style={{ margin: "0 0 2px", fontSize: 20 }}>Health records</h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 20px", fontSize: 13 }}>Connect your insurance and provider records</p>

            <div style={{ background: TEAL_L, border: `0.5px solid ${TEAL}60`, borderRadius: "var(--border-radius-lg)", padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: TEAL_D, marginBottom: 5 }}>Your legal right to your health data</div>
              <div style={{ fontSize: 12, color: TEAL_D, lineHeight: 1.65 }}>Under the <strong>21st Century Cures Act</strong>, health insurers must provide free access to your data via SMART on FHIR APIs — including claims, EOBs, clinical notes, labs, and medications.</div>
            </div>

            {/* BCBSAL Card */}
            <div style={{ ...card, marginBottom: 16, border: `0.5px solid ${bcbsalConnected ? TEAL + "60" : "var(--color-border-tertiary)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>BCBSAL — Blue Cross Blue Shield Alabama</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: bcbsalConnected ? TEAL : "#888", display: "inline-block" }} />
                    <span style={{ fontSize: 11, color: bcbsalConnected ? TEAL : "var(--color-text-tertiary)" }}>
                      {bcbsalConnected ? "Connected via SMART on FHIR" : "Not connected"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {bcbsalConnected && (
                    <button onClick={disconnectBCBSAL} style={{ padding: "5px 12px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 20, background: "transparent", color: "var(--color-text-tertiary)", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)" }}>Disconnect</button>
                  )}
                  <button onClick={bcbsalConnected ? loadBCBSALData : connectBCBSAL}
                    style={{ padding: "5px 14px", border: `0.5px solid ${BLUE}`, borderRadius: 20, background: `${BLUE}18`, color: BLUE, fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                    {bcbsalConnected ? (bcbsalLoading ? "Loading..." : "Refresh data") : "Connect BCBSAL →"}
                  </button>
                </div>
              </div>

              {!bcbsalConnected && (
                <div>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 14px", lineHeight: 1.6 }}>
                    Connect via SMART on FHIR to pull your claims, EOBs, coverage details, and care gaps into IDGIE automatically.
                  </p>
                  {[
                    { n: "1", title: "Click Connect BCBSAL above", detail: "You'll be redirected to the BCBSAL secure login page" },
                    { n: "2", title: "Sign in with your BCBSAL member credentials", detail: "Same login as bcbsal.com" },
                    { n: "3", title: "Approve IDGIE's data access request", detail: "Select claims, coverage, and care gaps to share" },
                    { n: "4", title: "You'll be redirected back to IDGIE", detail: "Your insurance data loads automatically" },
                  ].map((s, i) => (
                    <div key={s.n} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${BLUE}18`, border: `0.5px solid ${BLUE}60`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, color: BLUE }}>{s.n}</div>
                      <div><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{s.title}</div><div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{s.detail}</div></div>
                    </div>
                  ))}
                </div>
              )}

              {bcbsalConnected && bcbsalData && (
                <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
                    {[
                      { label: "Plan", value: bcbsalData.coverage?.plan || "—" },
                      { label: "Member ID", value: bcbsalData.coverage?.memberId || "—" },
                      { label: "Status", value: bcbsalData.coverage?.status || "active" },
                    ].map(s => (
                      <div key={s.label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 12px" }}>
                        <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", marginBottom: 4 }}>{s.label.toUpperCase()}</div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {bcbsalData.claims?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 500, marginBottom: 10 }}>RECENT CLAIMS</div>
                      {bcbsalData.claims.slice(0, 5).map((claim, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{claim.provider}</div>
                            <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{claim.date} · {claim.type}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: TEAL }}>${claim.amount}</div>
                            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{claim.status}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {bcbsalData.careGaps?.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 500, marginBottom: 10 }}>CARE GAPS</div>
                      {bcbsalData.careGaps.map((gap, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none", alignItems: "center" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: RED, flexShrink: 0 }} />
                          <span style={{ fontSize: 12 }}>{gap}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {bcbsalError && <div style={{ fontSize: 12, color: RED, marginTop: 10 }}>{bcbsalError}</div>}
            </div>

          </div>
        )}

        {/* ─── CORRELATION ─── */}
        {nav === "correlation" && (
          <div>
            <h2 style={{ margin: "0 0 2px", fontSize: 20 }}>Health correlation</h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 20px", fontSize: 13 }}>Compare your Oura Ring metrics against your weight over the same time period to spot patterns</p>

            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Weight vs Oura metrics</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {[7, 30, 90].map(d => (
                    <button key={d} onClick={() => handleTrendDaysChange(d)}
                      style={{ padding: "2px 10px", borderRadius: 20, border: `0.5px solid ${trendDays === d ? TEAL : "var(--color-border-tertiary)"}`, background: trendDays === d ? TEAL_L : "transparent", color: trendDays === d ? TEAL_D : "var(--color-text-secondary)", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 500, marginBottom: 10 }}>WEIGHT (kg)</div>
                <WeightChart data={weights} goalKg={goalKg} color={TEAL} />
              </div>

              <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: BLUE, fontWeight: 500, marginBottom: 10 }}>SLEEP SCORE (Oura)</div>
                <SimpleLineChart data={trendDays === 7 ? chartData : extendedData} dataKey="sleep" color={BLUE} />
              </div>

              <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: TEAL, fontWeight: 500, marginBottom: 10 }}>HRV BALANCE (Oura)</div>
                <SimpleLineChart data={trendDays === 7 ? chartData : extendedData} dataKey="hrv" color={TEAL} />
              </div>

              <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 20 }}>
                <div style={{ fontSize: 10, color: PURPLE, fontWeight: 500, marginBottom: 10 }}>STEPS (Oura)</div>
                <SimpleLineChart data={trendDays === 7 ? chartData : extendedData} dataKey="steps" color={PURPLE} />
              </div>
            </div>

            <div style={{ ...card, background: "var(--color-background-secondary)" }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>How to read this</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 10 }}>
                Look for weeks where your weight drops and check what your sleep and HRV looked like during that period.
              </div>
              {[
                { color: TEAL, text: "Higher HRV → better recovery → more effective activity → faster weight loss" },
                { color: BLUE, text: "Better sleep scores → lower cortisol → reduced cravings → easier calorie control" },
                { color: PURPLE, text: "More steps → higher daily burn → accelerated progress toward your 70kg goal" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.color, flexShrink: 0, marginTop: 4 }} />
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── AI INSIGHTS ─── */}
        {nav === "insights" && (
          <div>
            <h2 style={{ margin: "0 0 2px", fontSize: 20 }}>AI health insights</h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 20px", fontSize: 13 }}>Personalized weekly analysis based on your Oura Ring data and weight progress</p>

            <button onClick={generateInsights} disabled={loadingInsights}
              style={{ padding: "10px 22px", background: loadingInsights ? "var(--color-background-secondary)" : TEAL, border: "none", borderRadius: "var(--border-radius-md)", color: loadingInsights ? "var(--color-text-tertiary)" : "#fff", fontSize: 13, fontWeight: 500, cursor: loadingInsights ? "not-allowed" : "pointer", marginBottom: 24, fontFamily: "var(--font-sans)" }}>
              {loadingInsights ? "Generating insights..." : "✦  Generate weekly health insights"}
            </button>

            {insights && !insights.error && (
              <div>
                <div style={{ ...card, border: `0.5px solid ${TEAL}60`, display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 16 }}>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 44, fontWeight: 500, color: TEAL, lineHeight: 1 }}>{insights.overallScore}</div>
                    <div style={{ fontSize: 9, color: "var(--color-text-tertiary)", marginTop: 4 }}>HEALTH SCORE</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{insights.headline}</div>
                    <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{insights.trendNarrative}</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                  <div style={{ ...card, border: `0.5px solid ${TEAL}40` }}>
                    <div style={{ fontSize: 9, color: TEAL, fontWeight: 500, marginBottom: 8 }}>TOP WIN THIS WEEK</div>
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>{insights.topWin}</div>
                  </div>
                  <div style={{ ...card, border: `0.5px solid ${RED}40` }}>
                    <div style={{ fontSize: 9, color: RED, fontWeight: 500, marginBottom: 8 }}>WATCH OUT FOR</div>
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>{insights.topConcern}</div>
                  </div>
                </div>

                <div style={card}>
                  <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 500, marginBottom: 14 }}>YOUR ACTION ITEMS</div>
                  {insights.actionItems.map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 14, padding: "10px 0", borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: TEAL, fontWeight: 500, flexShrink: 0, minWidth: 18 }}>{String(i + 1).padStart(2, "0")}</span>
                      <span style={{ fontSize: 13, lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {insights?.error && (
              <div style={{ ...card, padding: 32, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: RED }}>Could not generate insights — check your Anthropic API key</div>
              </div>
            )}

            {!insights && !loadingInsights && (
              <div style={{ ...card, padding: 56, textAlign: "center" }}>
                <div style={{ fontSize: 28, color: "var(--color-text-tertiary)", marginBottom: 12 }}>✦</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Ready to analyze</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                  Click the button above to generate personalized insights<br />
                  based on your Oura Ring data and weight progress
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
