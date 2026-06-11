// netlify/functions/orders.js

exports.handler = async function(event, context) {

  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
  const SHOP_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

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

    if (!tokenRes.ok) throw new Error(`Token failed: ${tokenRes.status}`);
    const { access_token } = await tokenRes.json();

    // Fetch all orders via REST
    let orders = [];
    let url = `https://${SHOP_DOMAIN}/admin/api/2024-10/orders.json?status=any&limit=250`;

    while (url) {
      const res = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': access_token,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) throw new Error(`Orders failed: ${res.status} ${await res.text()}`);

      const data = await res.json();
      orders = orders.concat(data.orders || []);

      const link = res.headers.get('Link') || '';
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }

    // Add product tags here once you have your product list
    // e.g. const QUALIFYING_TAGS = ['this-builds-wells'];
    const QUALIFYING_TAGS = [];

    let shirts = 0;
    const people = orders.length;

    orders.forEach(order => {
      (order.line_items || []).forEach(item => {
        const productTags = (item.product_tags || '').split(', ').filter(Boolean);
        const qualifies = QUALIFYING_TAGS.length === 0 ||
          QUALIFYING_TAGS.some(t => productTags.includes(t));
        if (qualifies) shirts += item.quantity;
      });
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ shirts, people, timestamp: new Date().toISOString() })
    };

  } catch (err) {
    console.error('Error:', err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ shirts: 0, people: 0, error: err.message })
    };
  }
};
