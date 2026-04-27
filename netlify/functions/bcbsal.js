const https = require("https");
const querystring = require("querystring");

const CLIENT_ID = process.env.BCBSAL_CLIENT_ID;
const CLIENT_SECRET = process.env.BCBSAL_CLIENT_SECRET;
const TOKEN_HOST = "api-bcbsal-uat.safhir.io";
const TOKEN_PATH = "/slapv3/o/pdex/token/";
const FHIR_HOST = "api-bcbsal-uat.safhir.io";
const FHIR_PATH = "/v1/api";

function httpsRequest(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers }, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" };

  // Step 1: Exchange auth code for token
  if (event.queryStringParameters && event.queryStringParameters.code) {
    const code = event.queryStringParameters.code;
    const redirectUri = event.queryStringParameters.redirect_uri || "";
    const body = querystring.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });
    try {
      const res = await httpsRequest(TOKEN_HOST, TOKEN_PATH, "POST", {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      }, body);
      if (res.body.access_token) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ access_token: res.body.access_token }) };
      }
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Token exchange failed", detail: res.body }) };
    } catch (e) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
    }
  }

  // Step 2: Fetch FHIR data
  const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: "No token provided" }) };

  const fhirHeaders = { Authorization: "Bearer " + token, Accept: "application/fhir+json" };

  try {
    const [coverageRes, eobRes] = await Promise.all([
      httpsRequest(FHIR_HOST, FHIR_PATH + "/Coverage", "GET", fhirHeaders),
      httpsRequest(FHIR_HOST, FHIR_PATH + "/ExplanationOfBenefit?_count=10&_sort=-created", "GET", fhirHeaders),
    ]);

    const coverageEntry = coverageRes.body && coverageRes.body.entry && coverageRes.body.entry[0] && coverageRes.body.entry[0].resource;
    const coverage = coverageEntry ? {
      plan: (coverageEntry.class && coverageEntry.class.find(function(c) { return c.type && c.type.coding && c.type.coding[0] && c.type.coding[0].code === "plan"; }) || {}).name || "BCBSAL",
      memberId: coverageEntry.subscriberId || (coverageEntry.identifier && coverageEntry.identifier[0] && coverageEntry.identifier[0].value) || "---",
      status: coverageEntry.status || "active",
    } : { plan: "BCBSAL", memberId: "---", status: "active" };

    const claims = ((eobRes.body && eobRes.body.entry) || []).map(function(e) {
      const r = e.resource;
      return {
        provider: (r.careTeam && r.careTeam[0] && r.careTeam[0].provider && r.careTeam[0].provider.display) || (r.provider && r.provider.display) || "Provider",
        date: (r.created && r.created.split("T")[0]) || (r.billablePeriod && r.billablePeriod.start && r.billablePeriod.start.split("T")[0]) || "---",
        type: (r.type && r.type.coding && r.type.coding[0] && r.type.coding[0].display) || "Claim",
        amount: ((r.total && r.total.find(function(t) { return t.category && t.category.coding && ["submitted","charged"].includes(t.category.coding[0] && t.category.coding[0].code); })) || {}).amount && ((r.total.find(function(t) { return t.category && t.category.coding && ["submitted","charged"].includes(t.category.coding[0] && t.category.coding[0].code); })).amount.value || 0).toFixed(2) || "---",
        status: r.status || "---",
      };
    });

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ coverage, claims, careGaps: [] }) };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: e.message }) };
  }
};
