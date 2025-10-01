export const config = { runtime: 'edge' };

// --- CORS (for all responses) ---
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// --- Helper: Shopify product search ---
async function searchProducts(shopDomain, token, q) {
  const url = `https://${shopDomain}/api/2024-07/graphql.json`;
  const query = `#graphql
    query ($q:String!){
      products(first:5, query:$q){
        edges{ node{ title handle onlineStoreUrl } }
      }
    }`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token
    },
    body: JSON.stringify({ query, variables: { q } })
  });
  const j = await r.json();
  return (j?.data?.products?.edges || []).map(e => e.node);
}

export default async function handler(req) {
  // 1) CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  // 2) Simple GET health check (handy for testing)
  if (req.method === 'GET') {
    return new Response('OK', { status: 200, headers: CORS });
  }
  // 3) Only POST for chat
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  try {
    const { message, history = [], policies = {} } = await req.json();

    const shopDomain = process.env.SHOPIFY_STORE_DOMAIN || '';
    const token = process.env.SHOPIFY_STOREFRONT_TOKEN || '';
    const model = process.env.AI_MODEL || 'gpt-4o-mini';

    const text = String(message || '').slice(0, 2000);

    // Optional: use .myshopify.com for reliability
    // e.g., set SHOPIFY_STORE_DOMAIN=easycartglobal.myshopify.com in Vercel
    const products = text ? await searchProducts(shopDomain, token, text) : [];

    const system = `You are a helpful Shopify sales assistant.
- Be concise and friendly.
- Provide links to products when possible.
- Use only the store policies provided.
- For order-specific issues, offer human handoff.`;

    const policyText =
      `Shipping: ${policies.shipping || '3–7 business days in Canada; selected items in USA.'}\n` +
      `Returns: ${policies.returns || '30 days from delivery; unused/undamaged.'}\n` +
      `Regions: ${policies.regions || 'Canada + limited USA items.'}\n` +
      `Contact: ${policies.contact || 'Live agent 9am–6pm ET.'}`;

    const toolCtx = products.length
      ? `Matched products:\n${products.map(p => `• ${p.title} — https://${shopDomain}/products/${p.handle}`).join('\n')}`
      : 'No product matches.';

    const payload = {
      model,
      messages: [
        { role: 'system', content: system + '\nPolicies:\n' + policyText },
        ...history,
        { role: 'user', content: `${text}\n\n${toolCtx}` }
      ],
      temperature: 0.3
    };

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      return new Response(JSON.stringify({ error: 'OpenAI error', detail }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const data = await aiRes.json();
    const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a reply.';

    return new Response(JSON.stringify({ reply, products }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error', detail: String(e) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
}
