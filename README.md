# this builds wells — impact tracker

Live impact dashboard for the TBG "this builds wells" collection.

## Deploy steps

### 1. Add environment variables in Netlify
Go to: Netlify → your site → Site configuration → Environment variables → Add a variable

Add these three:
- `SHOPIFY_CLIENT_ID` — from TBG Dashboard app → Settings in the Dev Dashboard
- `SHOPIFY_CLIENT_SECRET` — same place, click the eye icon to reveal
- `SHOPIFY_STORE_DOMAIN` — `93u1hd-ge.myshopify.com`

### 2. Push these files to GitHub
Netlify auto-deploys on every push.

### 3. Update qualifying products
When you have your product list, open `netlify/functions/orders.js`
and add your product tags to the `QUALIFYING_TAGS` array:
```js
const QUALIFYING_TAGS = ['this-builds-wells'];
```

### 4. Update the donation config
In `index.html`, find the config block:
```js
const DOLLARS_PER_SHIRT = 5;
const WELL_COST = 15000;
```
Adjust as needed.

## File structure
```
/
├── index.html                  ← the tracker page
├── netlify.toml                ← Netlify config
├── netlify/
│   └── functions/
│       └── orders.js           ← serverless function (calls Shopify)
├── .env.example                ← environment variable template
└── README.md
```
