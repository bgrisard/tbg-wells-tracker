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

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Token failed ${tokenRes.status}: ${errText}`);
    }

    const { access_token } = await tokenRes.json();

    // Fetch ALL orders — no status filter so nothing gets excluded
    let orders = [];
    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const query = `{
        orders(first: 250${cursor ? `, after: "${cursor}"` : ''}) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              displayFinancialStatus
              lineItems(first: 50) {
                edges {
                  node {
                    quantity
                    product { tags }
                  }
                }
              }
            }
          }
        }
      }`;

      const res = await fetch(`https://${SHOP_DOMAIN}/admin/api/2024-10/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });

      if (!res.ok) throw new Error('GraphQL fetch failed: ' + res.status);

      const json = await res.json();

      // Log any GraphQL errors
      if (json.errors) {
        throw new Error('GraphQL errors: ' + JSON.stringify(json.errors));
      }

      const page = json?.data?.orders;
      if (!page) break;

      orders = orders.concat(page.edges.map(e => e.node));
      hasNext = page.pageInfo.hasNextPage;
      cursor = page.pageInfo.endCursor;
    }

    // Add product tags here once you have your product list
    // e.g. const QUALIFYING_TAGS = ['this-builds-wells'];
    const QUALIFYING_TAGS = [];

    let shirts = 0;
    const people = orders.length;

    orders.forEach(order => {
      order.lineItems.edges.forEach(({ node: item }) => {
        const tags = item.product?.tags || [];
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
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ shirts: 0, people: 0, error: err.message })
    };
  }
};
