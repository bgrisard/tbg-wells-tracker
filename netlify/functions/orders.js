// netlify/functions/orders.js
// Counts PAID orders from the "this-builds-wells" collection.
// Uses each product's custom.donation_amount metafield (Money type)
// to sum the REAL donation total. Falls back to $5 if missing.

exports.handler = async function(event, context) {

  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
  const SHOP_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
  const COLLECTION_HANDLE = 'this-builds-wells';
  const FALLBACK_DONATION = 5.00; // used if a product has no metafield value

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // 1. Access token
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

    // 2. Map each collection product ID -> its donation amount
    const donationByProduct = new Map();
    let pCursor = null, pHasNext = true;
    while (pHasNext) {
      const data = await gql(`{
        collectionByHandle(handle: "${COLLECTION_HANDLE}") {
          products(first: 250${pCursor ? `, after: "${pCursor}"` : ''}) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                metafield(namespace: "custom", key: "donation_amount") {
                  value
                  type
                }
              }
            }
          }
        }
      }`);
      const coll = data.collectionByHandle;
      if (!coll) throw new Error(`Collection "${COLLECTION_HANDLE}" not found`);
      coll.products.edges.forEach(({ node }) => {
        let amount = FALLBACK_DONATION;
        if (node.metafield && node.metafield.value) {
          // Money type returns JSON like {"amount":"5.00","currencyCode":"USD"}
          // Decimal type returns a plain string like "5.00"
          try {
            const parsed = JSON.parse(node.metafield.value);
            amount = parseFloat(parsed.amount);
          } catch {
            amount = parseFloat(node.metafield.value);
          }
          if (isNaN(amount)) amount = FALLBACK_DONATION;
        }
        donationByProduct.set(node.id, amount);
      });
      pHasNext = coll.products.pageInfo.hasNextPage;
      pCursor = coll.products.pageInfo.endCursor;
    }

    // 3. Pull PAID orders; sum donations for qualifying line items
    let shirts = 0;
    let fundsRaised = 0;
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
          if (item.product && donationByProduct.has(item.product.id)) {
            const perShirt = donationByProduct.get(item.product.id);
            shirts += item.quantity;
            fundsRaised += perShirt * item.quantity;
            orderHasQualifying = true;
          }
        });
        if (orderHasQualifying) qualifyingOrderIds.add(order.id);
      });
      oHasNext = page.pageInfo.hasNextPage;
      oCursor = page.pageInfo.endCursor;
    }

    const people = qualifyingOrderIds.size;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        shirts,
        people,
        fundsRaised: Math.round(fundsRaised * 100) / 100,
        products_in_collection: donationByProduct.size,
        timestamp: new Date().toISOString()
      })
    };

  } catch (err) {
    console.error('Error:', err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ shirts: 0, people: 0, fundsRaised: 0, error: err.message })
    };
  }
};
