const https = require("https");

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const req = https.request({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.REACT_APP_ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    const d = JSON.parse(event.body);
    const prompt = `You are a personal health AI. Generate personalized weekly insights.
Profile: ${d.conditions} | Goals: ${d.goals} | Meds: ${d.medications}
Latest Oura data:
- Sleep score: ${d.sleepScore || "N/A"}
- HRV balance: ${d.hrv || "N/A"}
- Readiness score: ${d.readiness || "N/A"}
- Steps today: ${d.steps || "N/A"}
- Calories today: ${d.calories || "N/A"}
Weight trend: ${d.latestKg}kg current, started at ${d.startKg}kg, goal ${d.goalKg}kg (lost ${d.lostKg}kg, ${d.toGoal}kg to go)
Respond ONLY in valid JSON (no markdown):
{"overallScore":number,"headline":"string","topWin":"string","topConcern":"string","actionItems":["string","string","string"],"trendNarrative":"string"}`;

    const response = await callClaude(prompt);
    const text = response.content?.find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const insights = JSON.parse(clean);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(insights),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
