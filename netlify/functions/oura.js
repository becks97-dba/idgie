const https = require("https");

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { ...headers, "User-Agent": "IDGIE-App" }
    };
    https.get(url, options, (res) => {
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
  const token = process.env.REACT_APP_OURA_TOKEN;
  const { endpoint, start_date, end_date } = event.queryStringParameters;
  const url = `https://api.ouraring.com/v2/usercollection/${endpoint}?start_date=${start_date}&end_date=${end_date}`;

  try {
    const data = await httpsGet(url, { Authorization: `Bearer ${token}` });
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
