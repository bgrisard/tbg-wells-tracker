// netlify/functions/orders.js
// Debug version — checks what scopes the token actually has

exports.handler = async function(event, context) {

  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
  const SHOP_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    // Get access token
    const tokenRes = await fetch(`https://${SHOP_DOMAIN}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'client_credentials'
      }).toString()
    });

    const tokenData = await tokenRes.json();
    const access_token = tokenData.access_token;

    // Check what scopes this token has
    const scopeRes = await fetch(`https://${SHOP_DOMAIN}/admin/oauth/access_scopes.json`, {
      headers: { 'X-Shopify-Access-Token': access_token }
    });

    const scopeData = await scopeRes.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ scopes: scopeData, token_prefix: access_token?.substring(0, 10) })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
