// netlify/functions/orders.js
// Counts PAID orders containing products from the "this-builds-wells" collection

exports.handler = async function(event, context) {

  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
  const SHOP_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
  const COLLECTION_HANDLE = 'this-builds-wells';

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // 1. Get access token
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

    const gql = async (query) => {
      const res = await fetch(`https://${SHOP_DOMAIN}/admin/api/2024-10/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });
      if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
      const json = await res.json();
      if (json.errors) throw new Error('GraphQL: ' + JSON.stringify(json.errors));
      return json.data;
    };

    // 2. Build the set of product IDs in the collection
    const productIds = new Set();
    let pCursor = null, pHasNext = true;
    while (pHasNext) {
      const data = await gql(`{
        collectionByHandle(handle: "${COLLECTION_HANDLE}") {
          products(first: 250${pCursor ? `, after: "${pCursor}"` : ''}) {
            pageInfo { hasNextPage endCursor }
            edges { node { id } }
          }
        }
      }`);
      const coll = data.collectionByHandle;
      if (!coll) throw new Error(`Collection "${COLLECTION_HANDLE}" not found`);
      coll.products.edges.forEach(e => productIds.add(e.node.id));
      pHasNext = coll.products.pageInfo.hasNextPage;
      pCursor = coll.products.pageInfo.endCursor;
    }

    // 3. Pull PAID orders, count line items whose product is in the collection
    let shirts = 0;
    const qualifyingOrderIds = new Set();
    let oCursor = null, oHasNext = true;
    while (oHasNext) {
      const data = await gql(`{
        orders(first: 100${oCursor ? `, after: "${oCursor}"` : ''}, query: "financial_status:paid") {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              lineItems(first: 100) {
                edges {
                  node {
                    quantity
                    product { id }
                  }
                }
              }
            }
          }
        }
      }`);
      const page = data.orders;
      page.edges.forEach(({ node: order }) => {
        let orderHasQualifying = false;
        order.lineItems.edges.forEach(({ node: item }) => {
          if (item.product && productIds.has(item.product.id)) {
            shirts += item.quantity;
            orderHasQualifying = true;
          }
        });
        if (orderHasQualifying) qualifyingOrderIds.add(order.id);
      });
      oHasNext = page.pageInfo.hasNextPage;
      oCursor = page.pageInfo.endCursor;
    }

    // "people involved" = number of paid orders that included a qualifying shirt
    const people = qualifyingOrderIds.size;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        shirts,
        people,
        products_in_collection: productIds.size,
        timestamp: new Date().toISOString()
      })
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
