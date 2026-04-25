
import { useState, useRef, useEffect } from "react";


// ── Oura API helpers ────────────────────────────────────────
async function fetchOuraData(token) {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  
  // Use corsproxy.io to bypass browser CORS restrictions
  const proxy = "https://api.allorigins.win/raw?url=";
  const base = "https://api.ouraring.com/v2/usercollection";
  const headers = { Authorization: `Bearer ${token}` };

  const urls = {
    sleep: `${base}/daily_sleep?start_date=${weekAgo}&end_date=${today}`,
    readiness: `${base}/daily_readiness?start_date=${weekAgo}&end_date=${today}`,
    activity: `${base}/daily_activity?start_date=${weekAgo}&end_date=${today}`,
    workouts: `${base}/workout?start_date=${weekAgo}&end_date=${today}`,
  };

  const results = {};
  for (const [key, url] of Object.entries(urls)) {
    try {
      const res = await fetch(proxy + encodeURIComponent(url), { headers });
      if (!res.ok) {
        results[key] = { error: `HTTP ${res.status}`, data: [] };
      } else {
        results[key] = await res.json();
      }
    } catch (e) {
      results[key] = { error: e.message, data: [] };
    }
  }

  return results;
}

function buildChartData(ouraData) {
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const sleepMap = {}, readinessMap = {}, activityMap = {};

  const sleepItems = Array.isArray(ouraData.sleep?.data) ? ouraData.sleep.data : [];
  const readinessItems = Array.isArray(ouraData.readiness?.data) ? ouraData.readiness.data : [];
  const activityItems = Array.isArray(ouraData.activity?.data) ? ouraData.activity.data : [];

  sleepItems.forEach(d => {
    if (!d?.day) return;
    const day = days[new Date(d.day + "T12:00:00").getDay()];
    sleepMap[day] = d.score || 0;
  });
  readinessItems.forEach(d => {
    if (!d?.day) return;
    const day = days[new Date(d.day + "T12:00:00").getDay()];
    readinessMap[day] = d.contributors?.hrv_balance || 0;
  });
  activityItems.forEach(d => {
    if (!d?.day) return;
    const day = days[new Date(d.day + "T12:00:00").getDay()];
    activityMap[day] = { steps: d.steps || 0, cal: d.total_calories || 0 };
  });

  return ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => ({
    day,
    hrv: readinessMap[day] || 0,
    sleep: sleepMap[day] || 0,
    steps: activityMap[day]?.steps || 0,
    cal: activityMap[day]?.cal || 0,
  }));
};

function buildWorkoutData(ouraData) {
  const icons = { running: "◇", cycling: "◈", strength_training: "◉", yoga: "◎", walking: "◇", softball: "◈" };
  return (ouraData.workouts?.data || []).slice(0, 4).map((w, i) => ({
    id: i + 1,
    date: new Date(w.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    type: w.activity?.replace(/_/g, " ").replace(/\w/g, l => l.toUpperCase()) || "Workout",
    icon: icons[w.activity] || "◉",
    duration: w.duration ? `${Math.floor(w.duration / 60)}h ${w.duration % 60}m` : "—",
    calories: w.calories || 0,
    avgHR: w.average_heart_rate || 0,
    maxHR: w.max_heart_rate || 0,
    ouraReadiness: 75,
  }));
}
// ────────────────────────────────────────────────────────────

// ── Simple SVG line chart (no external dependencies) ──
function SimpleLineChart({ data, dataKey, color }) {
  const w = 560, h = 155, pad = { top: 10, right: 10, bottom: 24, left: 36 };
  const vals = data.map(d => d[dataKey]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;
  const x = i => pad.left + (i / (data.length - 1)) * iw;
  const y = v => pad.top + ih - ((v - min) / range) * ih;
  const points = data.map((d, i) => `${x(i)},${y(d[dataKey])}`).join(" ");
  const area = `M${x(0)},${y(data[0][dataKey])} ` + data.map((d,i) => `L${x(i)},${y(d[dataKey])}`).join(" ") + ` L${x(data.length-1)},${pad.top+ih} L${x(0)},${pad.top+ih} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      {[0,1,2,3].map(i => <line key={i} x1={pad.left} x2={w-pad.right} y1={pad.top + (ih/3)*i} y2={pad.top + (ih/3)*i} stroke="rgba(128,128,128,0.15)" strokeDasharray="4 4" />)}
      <path d={area} fill={color} fillOpacity={0.15} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d[dataKey])} r={3} fill={color} />)}
      {data.map((d, i) => <text key={i} x={x(i)} y={h-4} textAnchor="middle" fontSize={10} fill="#888">{d.day}</text>)}
      {[min, Math.round((min+max)/2), max].map((v,i) => <text key={i} x={pad.left-6} y={y(v)+4} textAnchor="end" fontSize={10} fill="#888">{Math.round(v)}</text>)}
    </svg>
  );
}

function WeightChart({ data, goalKg, color }) {
  const w = 480, h = 230, pad = { top: 10, right: 40, bottom: 24, left: 40 };
  const vals = data.map(d => d.kg);
  const allVals = [...vals, goalKg];
  const min = Math.min(...allVals) - 1, max = Math.max(...allVals) + 1;
  const range = max - min || 1;
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;
  const x = i => pad.left + (i / Math.max(data.length - 1, 1)) * iw;
  const y = v => pad.top + ih - ((v - min) / range) * ih;
  const points = data.map((d, i) => `${x(i)},${y(d.kg)}`).join(" ");
  const area = data.length > 1 ? `M${x(0)},${y(data[0].kg)} ` + data.map((d,i) => `L${x(i)},${y(d.kg)}`).join(" ") + ` L${x(data.length-1)},${pad.top+ih} L${x(0)},${pad.top+ih} Z` : "";
  const goalY = y(goalKg);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      {[0,1,2,3].map(i => <line key={i} x1={pad.left} x2={w-pad.right} y1={pad.top+(ih/3)*i} y2={pad.top+(ih/3)*i} stroke="rgba(128,128,128,0.15)" strokeDasharray="4 4" />)}
      <line x1={pad.left} x2={w-pad.right} y1={goalY} y2={goalY} stroke={color} strokeDasharray="6 4" strokeWidth={1.5} />
      <text x={w-pad.right+4} y={goalY+4} fontSize={10} fill={color}>Goal {goalKg}kg</text>
      {area && <path d={area} fill={color} fillOpacity={0.15} />}
      {data.length > 1 && <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />}
      {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.kg)} r={3} fill={color} />)}
      {data.map((d, i) => i % 2 === 0 ? <text key={i} x={x(i)} y={h-4} textAnchor="middle" fontSize={9} fill="#888">{d.date}</text> : null)}
      {[Math.ceil(min), Math.round((min+max)/2), Math.floor(max)].map((v,i) => <text key={i} x={pad.left-6} y={y(v)+4} textAnchor="end" fontSize={10} fill="#888">{v}</text>)}
    </svg>
  );
}

// ─── PASTE YOUR ANTHROPIC API KEY BETWEEN THE QUOTES BELOW ───
const ANTHROPIC_API_KEY = process.env.REACT_APP_ANTHROPIC_KEY || "";
// ─────────────────────────────────────────────────────────────

// ─── PASTE YOUR OURA PERSONAL ACCESS TOKEN BELOW ────────────
const OURA_PERSONAL_TOKEN = process.env.REACT_APP_OURA_TOKEN || "";
// ─────────────────────────────────────────────────────────────



const weekData = [
  { day: "Mon", hrv: 45, sleep: 7.2, steps: 8200, cal: 1850 },
  { day: "Tue", hrv: 52, sleep: 6.8, steps: 10100, cal: 2100 },
  { day: "Wed", hrv: 48, sleep: 7.5, steps: 9300, cal: 1920 },
  { day: "Thu", hrv: 61, sleep: 8.1, steps: 7800, cal: 1780 },
  { day: "Fri", hrv: 55, sleep: 7.0, steps: 11200, cal: 2250 },
  { day: "Sat", hrv: 58, sleep: 8.4, steps: 6500, cal: 2050 },
  { day: "Sun", hrv: 63, sleep: 8.2, steps: 5200, cal: 1900 },
];

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

const initWorkouts = [
  { id: 1, date: "Apr 20", type: "Softball practice", icon: "◈", duration: "1h 45m", calories: 520, avgHR: 142, maxHR: 168, ouraReadiness: 82 },
  { id: 2, date: "Apr 18", type: "Strength training", icon: "◉", duration: "45m", calories: 310, avgHR: 128, maxHR: 151, ouraReadiness: 76 },
  { id: 3, date: "Apr 16", type: "Outdoor walk", icon: "◇", duration: "32m", calories: 185, avgHR: 98, maxHR: 112, ouraReadiness: 88 },
  { id: 4, date: "Apr 14", type: "Softball game", icon: "◈", duration: "2h 10m", calories: 680, avgHR: 155, maxHR: 178, ouraReadiness: 79 },
];

const APP_PASSWORD = "idgie2025"; // change this to whatever you want

function PasswordGate({ onUnlock }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const attempt = () => {
    if (input === APP_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setError(false), 2500);
      setInput("");
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)", fontFamily: "var(--font-sans)" }}>
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "48px 40px", width: 320, textAlign: "center", transform: shake ? "translateX(6px)" : "none", transition: "transform 0.1s" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500, color: "#1D9E75", letterSpacing: "0.08em", marginBottom: 4 }}>IDGIE</div>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", letterSpacing: "0.06em", marginBottom: 32 }}>YOUR HEALTH, CONNECTED</div>
        <input
          type="password"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && attempt()}
          placeholder="Enter password"
          autoFocus
          style={{ width: "100%", border: `0.5px solid ${error ? "#E24B4A" : "var(--color-border-tertiary)"}`, borderRadius: "var(--border-radius-md)", padding: "10px 14px", fontSize: 14, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", textAlign: "center", letterSpacing: "0.1em", marginBottom: 12, outline: "none" }}
        />
        {error && <div style={{ fontSize: 12, color: "#E24B4A", marginBottom: 12 }}>Incorrect password — try again</div>}
        <button onClick={attempt}
          style={{ width: "100%", padding: "10px", background: "#1D9E75", border: "none", borderRadius: "var(--border-radius-md)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
          Unlock
        </button>
      </div>
    </div>
  );
}

export default function IdgieApp() {
  const apiKey = ANTHROPIC_API_KEY;
  const [unlocked, setUnlocked] = useState(false);
  const [nav, setNav] = useState("dashboard");
  const [ouraData, setOuraData] = useState(null);
  const [ouraLoading, setOuraLoading] = useState(false);
  const [ouraError, setOuraError] = useState("");
  const [chartData, setChartData] = useState(weekData);
  const [liveWorkouts, setLiveWorkouts] = useState(initWorkouts);

  // Load Oura data on startup if token is set
  useEffect(() => {
    if (OURA_PERSONAL_TOKEN) {
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
          const wk = buildWorkoutData(cached.data);
          if (wk.length > 0) setLiveWorkouts(wk);
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
      const wk = buildWorkoutData(data);
      if (wk.length > 0) setLiveWorkouts(wk);
    } catch (e) {
      setOuraError("Could not load Oura data — check your token");
    }
    setOuraLoading(false);
  };

  const refreshOura = () => loadOuraData(true);

  // Food log
  const [meals, setMeals] = useState([
    { id: 1, time: "8:30 AM", name: "Oatmeal with mixed berries", macros: "320 cal · 52g carbs · 8g fat · 12g protein", fit: "Great for blood sugar stability", fitScore: 8 },
    { id: 2, time: "12:15 PM", name: "Grilled chicken salad", macros: "480 cal · 18g carbs · 22g fat · 48g protein", fit: "High protein supports your fitness goals", fitScore: 9 },
  ]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [uploadedImg, setUploadedImg] = useState(null);
  const fileRef = useRef();

  // Profile
  const [profile, setProfile] = useState({
    conditions: "Pre-diabetic, high blood pressure",
    goals: "Lose 15 lbs, improve HRV, reduce A1C",
    medications: "Lisinopril 10mg",
  });

  // AI insights
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Trend chart
  const [activeMetric, setActiveMetric] = useState("hrv");

  // Weight
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
      return saved ? parseFloat(saved) : 78;
    } catch (e) { return 78; }
  });
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("78");

  // Workouts
  const [workouts] = useState(initWorkouts);
  const [workoutInsights, setWorkoutInsights] = useState({});
  const [analyzingWorkout, setAnalyzingWorkout] = useState(null);

  // PlushCare PDF
  const [analyzingPdf, setAnalyzingPdf] = useState(false);
  const [pdfSummary, setPdfSummary] = useState(null);
  const pdfRef = useRef();

  const card = { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "20px" };
  const metrics = [
    { key: "hrv", label: "HRV", color: TEAL, unit: "ms" },
    { key: "sleep", label: "Sleep", color: BLUE, unit: "hrs" },
    { key: "steps", label: "Steps", color: PURPLE, unit: "" },
    { key: "cal", label: "Calories", color: AMBER, unit: "" },
  ];
  const activeM = metrics.find(m => m.key === activeMetric);

  // ── Food analysis ──
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(",")[1];
      setUploadedImg(ev.target.result);
      setAnalyzing(true);
      setAnalysis(null);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1000,
            messages: [{ role: "user", content: [
              { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
              { type: "text", text: `Analyze this food image for:
Conditions: ${profile.conditions}
Goals: ${profile.goals}
Medications: ${profile.medications}
Respond ONLY in valid JSON (no fences):
{"foodName":"string","calories":number,"macros":{"carbs":number,"fat":number,"protein":number,"fiber":number},"fitScore":number,"fitSummary":"string","cautions":["string"],"tips":["string"]}` }
            ] }]
          }),
        });
        const data = await res.json();
        const text = data.content?.find(b => b.type === "text")?.text || "";
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        setAnalysis(parsed);
        const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setMeals(prev => [{ id: Date.now(), time: t, name: parsed.foodName, macros: `${parsed.calories} cal · ${parsed.macros.carbs}g carbs · ${parsed.macros.fat}g fat · ${parsed.macros.protein}g protein`, fit: parsed.fitSummary, fitScore: parsed.fitScore }, ...prev]);
      } catch { setAnalysis({ error: true }); }
      finally { setAnalyzing(false); }
    };
    reader.readAsDataURL(file);
  };

  // ── Weekly insights ──
  const generateInsights = async () => {
    setLoadingInsights(true); setInsights(null);
    try {
      const latestKg = weights[weights.length - 1]?.kg;
      const lostKg = (weights[0]?.kg - latestKg).toFixed(1);
      const mealSummary = meals.slice(0, 5).map(m => `${m.time}: ${m.name}`).join("\n");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `Health AI — generate personalized weekly insights.
Profile: ${profile.conditions} | Goals: ${profile.goals} | Meds: ${profile.medications}
Biometrics: HRV 45→63ms (↑), sleep avg 7.6h, steps 8357/day (Watch wins vs Oura), cal 1979/day
Weight: ${latestKg}kg (down ${lostKg}kg from start, goal ${goalKg}kg)
Workouts: Softball practice 1h45m, Strength 45m, Softball game 2h10m
Meals:\n${mealSummary}
Respond ONLY in valid JSON:
{"overallScore":number,"headline":"string","topWin":"string","topConcern":"string","actionItems":["string","string","string"],"trendNarrative":"string"}` }]
        }),
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      setInsights(JSON.parse(text.replace(/```json|```/g, "").trim()));
    } catch { setInsights({ error: true }); }
    finally { setLoadingInsights(false); }
  };

  // ── Workout recovery tips ──
  const analyzeWorkout = async (w) => {
    setAnalyzingWorkout(w.id);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 600,
          messages: [{ role: "user", content: `Recovery tips for:
Type: ${w.type}, Duration: ${w.duration}, Calories: ${w.calories}, Avg HR: ${w.avgHR}bpm (max ${w.maxHR}bpm)
Oura readiness before: ${w.ouraReadiness}/100
Patient: ${profile.conditions} | ${profile.goals} | ${profile.medications}
Respond ONLY in valid JSON:
{"intensity":"string","recoveryTime":"string","immediateActions":["string"],"nutritionTip":"string","nextWorkoutTip":"string"}` }]
        }),
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      setWorkoutInsights(prev => ({ ...prev, [w.id]: JSON.parse(text.replace(/```json|```/g, "").trim()) }));
    } catch { setWorkoutInsights(prev => ({ ...prev, [w.id]: { error: true } })); }
    finally { setAnalyzingWorkout(null); }
  };

  // ── PlushCare PDF ──
  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(",")[1];
      setAnalyzingPdf(true); setPdfSummary(null);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1000,
            messages: [{ role: "user", content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: `Summarize this PlushCare visit note for: ${profile.conditions} | Goals: ${profile.goals}
Respond ONLY in valid JSON:
{"visitDate":"string","provider":"string","diagnoses":["string"],"medications":["string"],"keyFindings":["string"],"followUpItems":["string"],"relevantToGoals":"string"}` }
            ] }]
          }),
        });
        const data = await res.json();
        const text = data.content?.find(b => b.type === "text")?.text || "";
        setPdfSummary(JSON.parse(text.replace(/```json|```/g, "").trim()));
      } catch { setPdfSummary({ error: true }); }
      finally { setAnalyzingPdf(false); }
    };
    reader.readAsDataURL(file);
  };

  // ── Weight helpers ──
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
  const pct = Math.min(100, Math.max(0, Math.round(((startKg - latestKg) / (startKg - goalKg)) * 100)));

  const navItems = [
    { id: "dashboard", label: "Dashboard", sym: "◉" },
    { id: "food", label: "Food log", sym: "⊕" },
    { id: "workouts", label: "Workouts", sym: "◈" },
    { id: "weight", label: "Weight log", sym: "⊡" },
    { id: "insights", label: "AI insights", sym: "✦" },
    { id: "sources", label: "Data sources", sym: "◇" },
    { id: "records", label: "Health records", sym: "≡" },
  ];

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-sans)", background: "var(--color-background-tertiary)" }}>

      {!ANTHROPIC_API_KEY && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, background: "#BA7517", color: "#fff", textAlign: "center", padding: "8px", fontSize: 12 }}>
          ⚠ No API key found — add VITE_ANTHROPIC_KEY in Replit Secrets for AI features to work
        </div>
      )}
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
            { label: "Apple Watch", on: true },
            { label: "Oura Ring", on: true },
            { label: "BCBSAL", on: false },
            { label: "Castlight", on: false },
            { label: "PlushCare", on: false },
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
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 16px", fontSize: 13 }}>Here's your health picture for today</p>
            {OURA_PERSONAL_TOKEN && !ouraLoading && ouraData && (
              <div style={{ background: TEAL_L, border: `0.5px solid ${TEAL}50`, borderRadius: "var(--border-radius-md)", padding: "8px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: TEAL_D }}>◉ Oura Ring connected — showing your real data</span>
                <button onClick={refreshOura} style={{ fontSize: 11, color: TEAL_D, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>Refresh →</button>
              </div>
            )}
            {ouraLoading && (
              <div style={{ background: TEAL_L, border: `0.5px solid ${TEAL}50`, borderRadius: "var(--border-radius-md)", padding: "8px 14px", marginBottom: 16 }}>
                <span style={{ fontSize: 12, color: TEAL_D }}>◌ Syncing your Oura data...</span>
              </div>
            )}
            {!OURA_PERSONAL_TOKEN && (
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "8px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Showing sample data — connect Oura Ring for your real stats</span>
                <span style={{ fontSize: 11, color: TEAL }}>Add your token in App.js to connect →</span>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "172px 1fr", gap: 16, marginBottom: 18 }}>
              <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}>
                <div style={{ position: "relative", width: 104, height: 104 }}>
                  <svg viewBox="0 0 104 104" style={{ transform: "rotate(-90deg)", width: 104, height: 104 }}>
                    <circle cx="52" cy="52" r="44" fill="none" stroke="var(--color-border-secondary)" strokeWidth="8" />
                    <circle cx="52" cy="52" r="44" fill="none" stroke={TEAL} strokeWidth="8" strokeDasharray={`${2 * Math.PI * 44 * 0.73} ${2 * Math.PI * 44}`} strokeLinecap="round" />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, color: TEAL }}>73</span>
                    <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>/ 100</span>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)" }}>Health score</div>
                <div style={{ fontSize: 11, color: TEAL, marginTop: 3 }}>↑ 4 pts this week</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
                {(() => {
                  const todayActivity = ouraData?.activity?.data?.slice(-1)[0];
                  const todayReadiness = ouraData?.readiness?.data?.slice(-1)[0];
                  const todaySleep = ouraData?.sleep?.data?.slice(-1)[0];
                  const liveStats = [
                    { label: "HRV", value: todayReadiness ? `${todayReadiness.contributors?.hrv_balance || "--"}` : "85", unit: "ms", delta: "Oura readiness", up: true, color: TEAL, badge: ouraData ? "Live" : null },
                    { label: "Sleep", value: todaySleep ? `${todaySleep.score || "--"}` : "84", unit: "score", delta: "Oura sleep score", up: true, color: BLUE, badge: ouraData ? "Live" : null },
                    { label: "Steps", value: todayActivity ? `${(todayActivity.steps || 0).toLocaleString()}` : "5,877", unit: "today", delta: `Target ${(todayActivity?.target_meters || 8000).toLocaleString()}m`, up: true, color: PURPLE, badge: ouraData ? "Live" : null },
                    { label: "Calories", value: todayActivity ? `${(todayActivity.total_calories || 0).toLocaleString()}` : "2,025", unit: "kcal", delta: `Active: ${(todayActivity?.active_calories || 0)} kcal`, up: true, color: AMBER, badge: ouraData ? "Live" : null },
                  ];
                  return liveStats;
                })().map(m => (
                  <div key={m.label} style={{ ...card, padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{m.label.toUpperCase()}</span>
                      {m.badge && <span style={{ fontSize: 9, color: TEAL_D, background: TEAL_L, padding: "1px 5px", borderRadius: 8 }}>{m.badge}</span>}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>{m.unit}</div>
                    <div style={{ fontSize: 11, color: m.up ? TEAL : RED }}>{m.up ? "↑ " : "↓ "}{m.delta}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...card, marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>7-day trends</span>
                <div style={{ display: "flex", gap: 5 }}>
                  {metrics.map(m => (
                    <button key={m.key} onClick={() => setActiveMetric(m.key)}
                      style={{ padding: "3px 10px", borderRadius: 20, border: `0.5px solid ${activeMetric === m.key ? m.color : "var(--color-border-tertiary)"}`, background: activeMetric === m.key ? `${m.color}22` : "transparent", color: activeMetric === m.key ? m.color : "var(--color-text-secondary)", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <SimpleLineChart data={chartData} dataKey={activeMetric} color={activeM.color} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Today's meals</span>
                  <button onClick={() => setNav("food")} style={{ fontSize: 12, color: TEAL, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>Log food →</button>
                </div>
                {meals.slice(0, 3).map((meal, i) => (
                  <div key={meal.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meal.name}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{meal.macros}</div>
                    </div>
                    {meal.fitScore && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: meal.fitScore >= 7 ? TEAL : RED, marginLeft: 8, flexShrink: 0 }}>{meal.fitScore}/10</span>}
                  </div>
                ))}
              </div>

              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Recent workouts</span>
                  <button onClick={() => setNav("workouts")} style={{ fontSize: 12, color: TEAL, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>All workouts →</button>
                </div>
                {liveWorkouts.slice(0, 3).map((w, i) => (
                  <div key={w.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{w.type}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{w.duration} · {w.calories} cal</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{w.date}</div>
                      <div style={{ fontSize: 11, color: w.ouraReadiness >= 80 ? TEAL : w.ouraReadiness >= 65 ? AMBER : RED }}>Readiness {w.ouraReadiness}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── FOOD LOG ─── */}
        {nav === "food" && (
          <div>
            <h2 style={{ margin: "0 0 2px", fontSize: 20 }}>Food log</h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 24px", fontSize: 13 }}>Snap a photo — AI analyzes how it fits your specific health conditions and goals</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ ...card, marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 12 }}>YOUR HEALTH PROFILE</div>
                  {[{ key: "conditions", label: "Conditions" }, { key: "goals", label: "Goals" }, { key: "medications", label: "Medications" }].map(f => (
                    <div key={f.key} style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>{f.label}</label>
                      <textarea value={profile[f.key]} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))}
                        style={{ width: "100%", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "6px 10px", fontSize: 12, resize: "none", minHeight: 42, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", fontFamily: "var(--font-sans)" }} />
                    </div>
                  ))}
                </div>
                <div onClick={() => fileRef.current?.click()}
                  style={{ background: "var(--color-background-primary)", border: `1.5px dashed ${TEAL}50`, borderRadius: "var(--border-radius-lg)", padding: 28, textAlign: "center", cursor: "pointer" }}>
                  {uploadedImg
                    ? <img src={uploadedImg} alt="food" style={{ maxWidth: "100%", maxHeight: 180, borderRadius: "var(--border-radius-md)", objectFit: "cover" }} />
                    : (<><div style={{ fontSize: 22, marginBottom: 8, color: TEAL }}>⊕</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: TEAL }}>Tap to upload a food photo</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>Camera or file upload · real AI analysis</div></>)}
                </div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleImageUpload} />
              </div>
              <div>
                {analyzing && <div style={{ ...card, padding: 40, textAlign: "center" }}><div style={{ fontSize: 20, color: TEAL, marginBottom: 10 }}>◌</div><div style={{ fontSize: 13, fontWeight: 500, color: TEAL }}>Analyzing your meal...</div><div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>Checking against your health profile</div></div>}
                {analysis && !analyzing && !analysis.error && (
                  <div style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div><div style={{ fontSize: 15, fontWeight: 500 }}>{analysis.foodName}</div><div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>AI analysis</div></div>
                      <div style={{ background: analysis.fitScore >= 7 ? TEAL_L : "#FAEEDA", borderRadius: "var(--border-radius-md)", padding: "6px 12px", textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500, color: analysis.fitScore >= 7 ? TEAL_D : "#854F0B" }}>{analysis.fitScore}<span style={{ fontSize: 11 }}>/10</span></div>
                        <div style={{ fontSize: 9, color: analysis.fitScore >= 7 ? TEAL_D : "#854F0B" }}>FIT SCORE</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: 12, marginBottom: 14 }}>
                      {[{ label: "Calories", value: analysis.calories }, { label: "Carbs", value: `${analysis.macros?.carbs}g` }, { label: "Fat", value: `${analysis.macros?.fat}g` }, { label: "Protein", value: `${analysis.macros?.protein}g` }].map(s => (
                        <div key={s.label} style={{ textAlign: "center" }}><div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 500, color: TEAL }}>{s.value}</div><div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{s.label}</div></div>
                      ))}
                    </div>
                    <div style={{ borderLeft: `3px solid ${TEAL}`, paddingLeft: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 9, color: TEAL, fontWeight: 500, marginBottom: 3 }}>HEALTH FIT</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{analysis.fitSummary}</div>
                    </div>
                    {analysis.cautions?.length > 0 && <div style={{ borderLeft: `3px solid ${RED}`, paddingLeft: 12, marginBottom: 12 }}><div style={{ fontSize: 9, color: RED, fontWeight: 500, marginBottom: 3 }}>CAUTIONS</div>{analysis.cautions.map((c, i) => <div key={i} style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>· {c}</div>)}</div>}
                    {analysis.tips?.length > 0 && <div style={{ borderLeft: `3px solid ${PURPLE}`, paddingLeft: 12 }}><div style={{ fontSize: 9, color: PURPLE, fontWeight: 500, marginBottom: 3 }}>TIPS</div>{analysis.tips.map((t, i) => <div key={i} style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>· {t}</div>)}</div>}
                  </div>
                )}
                {!analyzing && !analysis && <div style={{ ...card, padding: 40, textAlign: "center" }}><div style={{ fontSize: 22, color: "var(--color-text-tertiary)", marginBottom: 10 }}>⊡</div><div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Upload a food photo to see<br />your personalized analysis</div></div>}
                <div style={{ ...card, marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12 }}>Today's log</div>
                  {meals.map((meal, i) => (
                    <div key={meal.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meal.name}</div><div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{meal.time}</div></div>
                      {meal.fitScore && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: meal.fitScore >= 7 ? TEAL : RED, marginLeft: 8, flexShrink: 0 }}>{meal.fitScore}/10</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── WORKOUTS ─── */}
        {nav === "workouts" && (
          <div>
            <h2 style={{ margin: "0 0 2px", fontSize: 20 }}>Workouts</h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 10px", fontSize: 13 }}>Apple Watch logs your sessions · Oura Ring tracks your recovery · steps and calories always take the higher reading</p>
            <div style={{ background: TEAL_L, border: `0.5px solid ${TEAL}50`, borderRadius: "var(--border-radius-md)", padding: "10px 14px", marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: TEAL_D }}>◈ Conflict resolution active — when Apple Watch and Oura Ring disagree on steps or calories, the higher number wins automatically</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {liveWorkouts.map(w => {
                const wi = workoutInsights[w.id];
                return (
                  <div key={w.id} style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: wi ? 16 : 0 }}>
                      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <div style={{ width: 42, height: 42, borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: TEAL }}>{w.icon}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{w.type}</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>{w.date} · {w.duration}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 500 }}>{w.calories} cal</div>
                          <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>avg {w.avgHR} · max {w.maxHR} bpm</div>
                        </div>
                        <div style={{ textAlign: "center", padding: "0 14px", borderLeft: "0.5px solid var(--color-border-tertiary)" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 500, color: w.ouraReadiness >= 80 ? TEAL : w.ouraReadiness >= 65 ? AMBER : RED }}>{w.ouraReadiness}</div>
                          <div style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>OURA READINESS</div>
                        </div>
                        {!wi && (
                          <button onClick={() => analyzeWorkout(w)} disabled={analyzingWorkout === w.id}
                            style={{ padding: "6px 12px", border: `0.5px solid ${TEAL}`, borderRadius: "var(--border-radius-md)", background: "transparent", color: TEAL, fontSize: 11, cursor: analyzingWorkout === w.id ? "not-allowed" : "pointer", fontFamily: "var(--font-sans)", whiteSpace: "nowrap" }}>
                            {analyzingWorkout === w.id ? "Analyzing..." : "Get recovery tips"}
                          </button>
                        )}
                      </div>
                    </div>
                    {wi && !wi.error && (
                      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        <div style={{ borderLeft: `3px solid ${TEAL}`, paddingLeft: 10 }}>
                          <div style={{ fontSize: 9, color: TEAL, fontWeight: 500, marginBottom: 4 }}>INTENSITY · RECOVERY</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-primary)" }}>{wi.intensity} · {wi.recoveryTime}</div>
                        </div>
                        <div style={{ borderLeft: `3px solid ${BLUE}`, paddingLeft: 10 }}>
                          <div style={{ fontSize: 9, color: BLUE, fontWeight: 500, marginBottom: 4 }}>NUTRITION TIP</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.4 }}>{wi.nutritionTip}</div>
                        </div>
                        <div style={{ borderLeft: `3px solid ${PURPLE}`, paddingLeft: 10 }}>
                          <div style={{ fontSize: 9, color: PURPLE, fontWeight: 500, marginBottom: 4 }}>NEXT WORKOUT</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.4 }}>{wi.nextWorkoutTip}</div>
                        </div>
                        {wi.immediateActions?.length > 0 && (
                          <div style={{ gridColumn: "1/-1", borderLeft: `3px solid ${AMBER}`, paddingLeft: 10 }}>
                            <div style={{ fontSize: 9, color: AMBER, fontWeight: 500, marginBottom: 4 }}>DO NOW (next 1–2 hrs)</div>
                            {wi.immediateActions.map((a, i) => <span key={i} style={{ fontSize: 12, color: "var(--color-text-primary)", marginRight: 16 }}>· {a}</span>)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
                      ? <><input value={goalInput} onChange={e => setGoalInput(e.target.value)} style={{ width: 48, border: "0.5px solid var(--color-border-tertiary)", borderRadius: 4, padding: "2px 6px", fontSize: 11, background: "var(--color-background-secondary)", color: "var(--color-text-primary)" }} /><span style={{ fontSize: 11 }}>kg</span><button onClick={() => { const newGoal = parseFloat(goalInput) || goalKg;
                      setGoalKg(newGoal);
                      try { localStorage.setItem("idgie_goal_kg", newGoal); } catch (e) {}
                      setEditingGoal(false); }} style={{ fontSize: 11, color: TEAL, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>Save</button></>
                      : <><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: TEAL }}>{goalKg} kg</span><button onClick={() => setEditingGoal(true)} style={{ fontSize: 11, color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>edit</button></>
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
                  <button onClick={addWeight}
                    style={{ width: "100%", padding: "9px", background: TEAL, border: "none", borderRadius: "var(--border-radius-md)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                    Add entry
                  </button>
                </div>
                <div style={{ ...card, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12 }}>History</div>
                  <div style={{ maxHeight: 240, overflow: "auto" }}>
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

        {/* ─── AI INSIGHTS ─── */}
        {nav === "insights" && (
          <div>
            <h2 style={{ margin: "0 0 2px", fontSize: 20 }}>AI health insights</h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 20px", fontSize: 13 }}>Personalized weekly analysis across all your data — biometrics, workouts, weight, and food</p>
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
                  <div style={{ ...card, border: `0.5px solid ${TEAL}40` }}><div style={{ fontSize: 9, color: TEAL, fontWeight: 500, marginBottom: 8 }}>TOP WIN THIS WEEK</div><div style={{ fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{insights.topWin}</div></div>
                  <div style={{ ...card, border: `0.5px solid ${RED}40` }}><div style={{ fontSize: 9, color: RED, fontWeight: 500, marginBottom: 8 }}>WATCH OUT FOR</div><div style={{ fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{insights.topConcern}</div></div>
                </div>
                <div style={card}>
                  <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 500, marginBottom: 14 }}>YOUR ACTION ITEMS</div>
                  {insights.actionItems.map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 14, padding: "10px 0", borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: TEAL, fontWeight: 500, flexShrink: 0, minWidth: 18 }}>{String(i + 1).padStart(2, "0")}</span>
                      <span style={{ fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!insights && !loadingInsights && (
              <div style={{ ...card, padding: 56, textAlign: "center" }}>
                <div style={{ fontSize: 28, color: "var(--color-text-tertiary)", marginBottom: 12 }}>✦</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Your health data is ready to analyze</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>Click the button above to generate personalized insights<br />across your biometrics, workouts, weight, and food data</div>
              </div>
            )}
          </div>
        )}

        {/* ─── DATA SOURCES ─── */}
        {nav === "sources" && (
          <div>
            <h2 style={{ margin: "0 0 2px", fontSize: 20 }}>Data sources</h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 24px", fontSize: 13 }}>When Apple Watch and Oura Ring report different values, the higher reading always wins</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {[
                { name: "Apple Watch", connected: true, desc: "Syncing steps, HRV, heart rate, workouts, and active calories via Apple Health", data: ["Steps & activity", "Heart rate & HRV", "Workout sessions", "Sleep via Apple Health"], accent: BLUE },
                { name: "Oura Ring", connected: !!OURA_PERSONAL_TOKEN, desc: OURA_PERSONAL_TOKEN ? "Connected — syncing sleep, HRV, readiness, activity, and workouts from your ring" : "Connect your Oura Ring to pull real sleep, HRV, readiness, and workout data into IDGIE", data: ["Sleep stages & quality", "Readiness & HRV", "Activity & steps", "Workouts"], accent: PURPLE },
                { name: "BCBSAL member portal", connected: false, desc: "Connect via SMART on FHIR to pull claims, benefits, and care gap alerts automatically", data: ["Claims & EOBs", "Coverage & benefits", "Care gaps", "Prior authorizations"], accent: TEAL },
                { name: "Castlight Health", connected: false, desc: "Access cost estimates, care recommendations, and employer wellness programs", data: ["Cost estimates", "Provider search", "Wellness programs", "Care recommendations"], accent: AMBER },
              ].map(src => (
                <div key={src.name} style={{ ...card, border: `0.5px solid ${src.connected ? src.accent + "60" : "var(--color-border-tertiary)"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{src.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: src.connected ? TEAL : "#EF9F27", display: "inline-block" }} />
                        <span style={{ fontSize: 11, color: src.connected ? TEAL : AMBER }}>{src.connected ? "Connected" : "Not connected"}</span>
                      </div>
                    </div>
                    <button
                      onClick={src.name === "Oura Ring" ? refreshOura : undefined}
                      style={{ padding: "5px 12px", border: `0.5px solid ${src.accent}`, borderRadius: 20, background: `${src.accent}18`, color: src.accent, fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                      {src.name === "Oura Ring" ? (ouraLoading ? "Syncing..." : "Sync now") : src.connected ? "Sync now" : "Connect →"}
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>{src.desc}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {src.data.map(d => <span key={d} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>{d}</span>)}
                  </div>
                </div>
              ))}
            </div>

            {/* PlushCare — manual PDF sync */}
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>PlushCare telehealth</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: BLUE, display: "inline-block" }} />
                    <span style={{ fontSize: 11, color: BLUE }}>Manual sync via PDF upload</span>
                  </div>
                </div>
                <button onClick={() => pdfRef.current?.click()}
                  style={{ padding: "5px 14px", border: `0.5px solid ${BLUE}`, borderRadius: 20, background: `${BLUE}18`, color: BLUE, fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  Upload visit note →
                </button>
                <input ref={pdfRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={handlePdfUpload} />
              </div>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 12px", lineHeight: 1.6 }}>
                PlushCare uses a proprietary EHR without a public FHIR endpoint. Download your visit summary PDF from the PlushCare portal and upload it here — IDGIE will read and summarize it in the context of your health goals.
              </p>
              {analyzingPdf && <div style={{ textAlign: "center", padding: "14px 0", color: BLUE, fontSize: 13 }}>◌ Reading your visit note...</div>}
              {pdfSummary && !pdfSummary.error && (
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Visit summary — {pdfSummary.visitDate}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{pdfSummary.provider}</div>
                  </div>
                  {[{ label: "Key findings", items: pdfSummary.keyFindings, color: TEAL }, { label: "Medications", items: pdfSummary.medications, color: BLUE }, { label: "Follow-up needed", items: pdfSummary.followUpItems, color: AMBER }].map(s => s.items?.length > 0 && (
                    <div key={s.label} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, color: s.color, fontWeight: 500, marginBottom: 4 }}>{s.label.toUpperCase()}</div>
                      {s.items.map((item, i) => <div key={i} style={{ fontSize: 12, color: "var(--color-text-primary)", marginBottom: 2 }}>· {item}</div>)}
                    </div>
                  ))}
                  {pdfSummary.relevantToGoals && (
                    <div style={{ borderLeft: `3px solid ${TEAL}`, paddingLeft: 10, marginTop: 10 }}>
                      <div style={{ fontSize: 9, color: TEAL, fontWeight: 500, marginBottom: 3 }}>RELEVANT TO YOUR GOALS</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{pdfSummary.relevantToGoals}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── HEALTH RECORDS ─── */}
        {nav === "records" && (
          <div>
            <h2 style={{ margin: "0 0 2px", fontSize: 20 }}>Connect health records</h2>
            <p style={{ color: "var(--color-text-secondary)", margin: "0 0 20px", fontSize: 13 }}>Use federal interoperability rules to pull your data from insurers and providers</p>
            <div style={{ background: TEAL_L, border: `0.5px solid ${TEAL}60`, borderRadius: "var(--border-radius-lg)", padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: TEAL_D, marginBottom: 5 }}>Your legal right to your health data</div>
              <div style={{ fontSize: 12, color: TEAL_D, lineHeight: 1.65 }}>Under the <strong>21st Century Cures Act</strong> and CMS Interoperability Rule (2021), health insurers and most providers <strong>must</strong> provide free access to your data via SMART on FHIR APIs — including claims, EOBs, clinical notes, labs, and medications.</div>
            </div>
            {[
              { title: "Connect BCBSAL (Blue Cross Blue Shield Alabama)", accent: BLUE, steps: [
                { n: "1", title: "Log in to bcbsal.com", detail: "Sign in to your BCBSAL member account using your existing credentials" },
                { n: "2", title: "Navigate to Data Sharing or API Access", detail: "Find this under My Account or Privacy & Permissions — look for FHIR or third-party app settings" },
                { n: "3", title: "Authorize IDGIE", detail: "You'll go through a standard OAuth flow to grant read access to your claims and benefits data" },
                { n: "4", title: "Data begins syncing", detail: "Claims, EOBs, coverage details, and care gaps appear in your dashboard automatically" },
              ]},
              { title: "Connect providers via Apple Health Records", accent: "#5A5A5A", steps: [
                { n: "1", title: "Open Health app → Health Records on your iPhone", detail: "Go to Browse → Health Records → Add Account" },
                { n: "2", title: "Search for your hospitals and practices", detail: "UAB, Ascension, and most major health systems support SMART on FHIR and appear in the list" },
                { n: "3", title: "Sign in with your patient portal login", detail: "Use your MyChart, MyUABHealth, or other provider portal credentials" },
                { n: "4", title: "Enable sync with IDGIE", detail: "Grant read permission for labs, vitals, medications, clinical notes, and immunizations" },
              ]},
              { title: "Connect Castlight employer benefits", accent: AMBER, steps: [
                { n: "1", title: "Log in through your employer's benefits portal", detail: "Access Castlight via your HR/benefits portal or directly at castlighthealth.com" },
                { n: "2", title: "Find integrations or data export settings", detail: "Look in Account Settings for third-party app access" },
                { n: "3", title: "Connect and authorize IDGIE", detail: "Grant access to pull cost estimates, care recommendations, and wellness program progress" },
              ]},
            ].map(section => (
              <div key={section.title} style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: section.accent, marginBottom: 16 }}>{section.title}</div>
                {section.steps.map((s, i) => (
                  <div key={s.n} style={{ display: "flex", gap: 14, padding: "9px 0", borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none", alignItems: "flex-start" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${section.accent}18`, border: `0.5px solid ${section.accent}60`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, color: section.accent }}>{s.n}</div>
                    <div><div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{s.title}</div><div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{s.detail}</div></div>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ ...card, background: "var(--color-background-secondary)" }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Additional resources</div>
              {[
                { label: "CMS Blue Button 2.0 — Medicare claims API", url: "https://bluebutton.cms.gov/" },
                { label: "SMART Health IT — FHIR app authorization guide", url: "https://smarthealthit.org/" },
                { label: "HL7 FHIR patient access documentation", url: "https://hl7.org/fhir/patient-access/" },
              ].map(r => <a key={r.label} href={r.url} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12, color: TEAL, textDecoration: "none", marginBottom: 5 }}>{r.label} →</a>)}
            </div>
          </div>
        )}


      </main>
    </div>
  );
}
