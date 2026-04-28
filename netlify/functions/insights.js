const https = require("https");

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  const apiKey = process.env.REACT_APP_ANTHROPIC_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Anthropic API key not configured in Netlify environment variables" }),
    };
  }

  let d;
  try {
    d = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const prompt = `You are a personal health AI. Generate personalized weekly insights.
Profile: ${d.conditions} | Goals: ${d.goals} | Meds: ${d.medications}
Latest Oura data:
- Sleep score: ${d.sleepScore || "N/A"}
- HRV balance: ${d.hrv || "N/A"}
- Readiness score: ${d.readiness || "N/A"}
- Steps today: ${d.steps || "N/A"}
- Calories today: ${d.calories || "N/A"}
Weight: ${d.latestKg}kg current, started ${d.startKg}kg, goal ${d.goalKg}kg, lost ${d.lostKg}kg, ${d.toGoal}kg to go
Respond ONLY in valid JSON with no markdown fences:
{"overallScore":number,"headline":"string","topWin":"string","topConcern":"string","actionItems":["string","string","string"],"trendNarrative":"string"}`;

  const body = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          const text = response.content?.find(b => b.type === "text")?.text || "";
          const clean = text.replace(/```json|```/g, "").trim();
          const insights = JSON.parse(clean);
          resolve({
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(insights),
          });
        } catch (e) {
          resolve({
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Failed to parse Claude response: " + e.message, raw: data.slice(0, 200) }),
          });
        }
      });
    });

    req.on("error", (e) => {
      resolve({
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Network error: " + e.message }),
      });
    });

    req.write(body);
    req.end();
  });
};
