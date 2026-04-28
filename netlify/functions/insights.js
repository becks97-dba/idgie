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
      body: JSON.stringify({ error: "API key not configured" }),
    };
  }

  let d;
  try {
    d = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const prompt = `Health AI insights. Respond ONLY with valid JSON, nothing else, no markdown.

Patient: ${d.conditions}. Goals: ${d.goals}. Meds: ${d.medications}.
Sleep: ${d.sleepScore||"?"}, HRV: ${d.hrv||"?"}, Readiness: ${d.readiness||"?"}, Steps: ${d.steps||"?"}, Cal: ${d.calories||"?"}.
Weight: ${d.latestKg}kg now, was ${d.startKg}kg, goal ${d.goalKg}kg, lost ${d.lostKg}kg, ${d.toGoal}kg to go.

Return this exact JSON structure with short values (under 20 words each):
{"overallScore":75,"headline":"One line summary","topWin":"Biggest positive","topConcern":"Main concern","actionItems":["Action 1","Action 2","Action 3"],"trendNarrative":"Two sentence narrative"}`;

  const body = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
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
          resolve({ statusCode: 200, headers: corsHeaders, body: JSON.stringify(insights) });
        } catch (e) {
          resolve({
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Parse failed: " + e.message, raw: data }),
          });
        }
      });
    });
    req.on("error", (e) => {
      resolve({ statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) });
    });
    req.write(body);
    req.end();
  });
};
