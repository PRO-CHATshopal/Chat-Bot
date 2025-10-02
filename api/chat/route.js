export const config = { runtime: 'edge' };

// CORS headers for every response
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// helper: parse body safely for text/plain or JSON
async function readBody(req) {
  const ct = (req.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) return await req.json();
  const txt = await req.text();
  try { return JSON.parse(txt || '{}'); } catch { return {}; }
}

// Shopify product search
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
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  // Health check
  if (req.method === 'GET') {
    return new Response('OK', { status: 200, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  try {
    const { message, history = [], policies = {} } = await readBody(req);

    const shopDomain = process.env.SHOPIFY_STORE_DOMAIN || '';
    const token = process.env.SHOPIFY_STOREFRONT_TOKEN || '';
    const model = process.env.AI_MODEL || 'gpt-4o-mini';

    const text = String(message || '').slice(0, 2000);
    const products = text ? await searchProducts(shopDomain, token, text) : [];

    const system = `You are a helpful Shopify sales assistant named Shopal.
- Be concise and friendly.
- When referencing products, ONLY use Markdown links like [Title](/products/{handle}). Never show raw URLs.
- Use only the store policies provided.
- For order-specific issues, offer human handoff.`;

    const policyText =
      `Shipping: ${policies.shipping || '3–7 business days in Canada; selected USA items.'}\n` +
      `Returns: ${policies.returns || '30 days from delivery; unused/undamaged.'}\n` +
      `Regions: ${policies.regions || 'Canada + limited USA items.'}\n` +
      `Contact: ${policies.contact || 'Live agent 9am–6pm ET.'}`;

    // 🔻 Product context: titles as Markdown links, no raw URL text
    const toolCtx = products.length
      ? `Matched products:\n${products
          .map(p => `• [${p.title}](/products/${p.handle})`)
          .join('\n')}`
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
