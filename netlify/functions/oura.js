exports.handler = async (event) => {
  const token = process.env.REACT_APP_OURA_TOKEN;
  const { endpoint, start_date, end_date } = event.queryStringParameters;
  const url = `https://api.ouraring.com/v2/usercollection/${endpoint}?start_date=${start_date}&end_date=${end_date}`;
  
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
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
