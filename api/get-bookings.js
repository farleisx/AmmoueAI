// api/get-bookings.js
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // 1. Handle CORS so the generated sites can talk to your API
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const business_id = searchParams.get('business_id');

    if (!business_id) {
      return new Response(JSON.stringify({ error: 'business_id is required' }), { status: 400 });
    }

    // 2. Query Supabase
    // We filter by business_id so owners only see their own customers
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    const query = `${SUPABASE_URL}/rest/v1/bookings?business_id=eq.${business_id}&select=*&order=booking_date.desc,booking_time.asc`;

    const res = await fetch(query, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Allows the generated site to see the data
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
