const https = require("https");

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { ...headers, "User-Agent": "IDGIE-App" } }, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

exports.handler = async (event) => {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No token provided" }),
    };
  }

  const BASE = "https://api.bcbsal.com/fhir/r4";
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/fhir+json",
  };

  try {
    // Fetch coverage, claims, and care gaps in parallel
    const [coverageRes, claimsRes, conditionsRes] = await Promise.all([
      httpsGet(`${BASE}/Coverage?_count=1`, headers).catch(() => null),
      httpsGet(`${BASE}/ExplanationOfBenefit?_count=10&_sort=-created`, headers).catch(() => null),
      httpsGet(`${BASE}/Condition?_count=20`, headers).catch(() => null),
    ]);

    // Parse coverage
    const coverageEntry = coverageRes?.entry?.[0]?.resource;
    const coverage = coverageEntry ? {
      plan: coverageEntry.class?.find(c => c.type?.coding?.[0]?.code === "plan")?.name || "BCBSAL",
      memberId: coverageEntry.subscriberId || "—",
      status: coverageEntry.status || "active",
    } : null;

    // Parse claims/EOBs
    const claims = (claimsRes?.entry || []).map(e => {
      const r = e.resource;
      return {
        provider: r.careTeam?.[0]?.provider?.display || r.insurer?.display || "Provider",
        date: r.created?.split("T")[0] || "—",
        type: r.type?.coding?.[0]?.display || "Claim",
        amount: r.total?.find(t => t.category?.coding?.[0]?.code === "submitted")?.amount?.value?.toFixed(2) || "—",
        status: r.status || "—",
      };
    });

    // Parse conditions as care gaps
    const careGaps = (conditionsRes?.entry || [])
      .map(e => e.resource?.code?.coding?.[0]?.display || e.resource?.code?.text)
      .filter(Boolean)
      .slice(0, 5);

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ coverage, claims, careGaps }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
