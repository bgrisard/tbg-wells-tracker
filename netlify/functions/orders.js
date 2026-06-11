// netlify/functions/orders.js
// Fetches order data from Shopify using client credentials
// Called by the tracker on every page load

exports.handler = async function(event, context) {

  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
  const SHOP_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // e.g. 93u1hd-ge.myshopify.com

  // CORS headers so the HTML page can call this function
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Step 1: Get an access token using client credentials
    const tokenRes = await fetch(`https://${SHOP_DOMAIN}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'client_credentials'
      })
    });

    if (!tokenRes.ok) {
      throw new Error('Token request failed: ' + tokenRes.status);
    }

    const { access_token } = await tokenRes.json();

    // Step 2: Fetch orders from Admin API
    // Paginate through all paid orders
    let orders = [];
    let url = `https://${SHOP_DOMAIN}/admin/api/2024-10/orders.json?status=any&financial_status=paid&limit=250`;

    while (url) {
      const ordersRes = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': access_token,
          'Content-Type': 'application/json'
        }
      });

      if (!ordersRes.ok) throw new Error('Orders fetch failed: ' + ordersRes.status);

      const data = await ordersRes.json();
      orders = orders.concat(data.orders || []);

      // Check for next page via Link header
      const linkHeader = ordersRes.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = match ? match[1] : null;
      } else {
        url = null;
      }
    }

    // Step 3: Count qualifying items
    // Add your product tags to this array once you have your product list
    // e.g. const QUALIFYING_TAGS = ['this-builds-wells'];
    // Empty = count ALL orders
    const QUALIFYING_TAGS = [];

    let shirts = 0;
    let people = orders.length;

    orders.forEach(order => {
      order.line_items.forEach(item => {
        const tags = (item.properties || [])
          .filter(p => p.name === '_tags')
          .map(p => p.value);

        const qualifies = QUALIFYING_TAGS.length === 0 ||
          QUALIFYING_TAGS.some(t => tags.includes(t));

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
    // Return fallback data so the page still renders
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ shirts: 1, people: 1, error: err.message })
    };
  }
};
