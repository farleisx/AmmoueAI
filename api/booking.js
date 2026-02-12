// api/main-handler.js
import { supabaseAdmin } from '../lib/supabase.js'

export default async function handler(req, res) {
  // 1️⃣ ADD CORS HEADERS
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  // 2️⃣ HANDLE PREFLIGHT
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // 3️⃣ ROUTE LOGIC BASED ON METHOD AND BODY/QUERY
  try {
    // --- GET LOGIC (From get-bookings.js) ---
    if (req.method === 'GET') {
      const { business_id } = req.query;

      if (!business_id) {
        return res.status(400).json({ error: 'business_id is required' });
      }

      const { data, error } = await supabaseAdmin
        .from('bookings')
        .select('*')
        .eq('business_id', business_id)
        .order('booking_date', { ascending: false })
        .order('booking_time', { ascending: true });

      if (error) throw error;
      return res.status(200).json(data);
    }

    // --- POST LOGIC ---
    if (req.method === 'POST') {
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { action } = req.query; // Use a query param to differentiate POST actions

      // ACTION: SETUP OR CREATE BUSINESS (From setup-business.js / create-business logic)
      if (action === 'setup' || data.owner_email && data.services) {
        const { owner_email, business_name, services } = data;

        if (!owner_email || !services || !Array.isArray(services)) {
          return res.status(400).json({ error: 'Missing or invalid fields' });
        }

        const { data: business, error: bError } = await supabaseAdmin
          .from('businesses')
          .insert([{ owner_email, name: business_name }])
          .select()
          .single();

        if (bError) return res.status(400).json({ error: bError.message });

        const servicesToInsert = services.map(s => ({
          business_id: business.id,
          name: s.name,
          duration: s.duration,
          price: s.price
        }));

        const { error: sError } = await supabaseAdmin
          .from('services')
          .insert(servicesToInsert);

        if (sError) return res.status(400).json({ error: sError.message });

        return res.status(200).json({ success: true, business_id: business.id });
      }

      // ACTION: CREATE BOOKING (From create-booking.js)
      else {
        const business_id = data.business_id;
        const service_id = data.service_id || data.service || 'general';
        
        const customer_name = data.customer_name || data.name || data.customer || data['customer-name'] || data.full_name;
        const customer_email = data.customer_email || data.email || data['customer-email'] || data.user_email;
        
        const booking_date = data.booking_date || data.date || data.day;
        const booking_time = data.booking_time || data.time || data.slot;

        if (!business_id || !customer_name || !customer_email) {
          return res.status(400).json({ 
            error: 'Missing required fields',
            received: {
              business_id: !!business_id,
              customer_name: !!customer_name,
              customer_email: !!customer_email,
              raw_keys: Object.keys(data)
            }
          });
        }

        const { error: bookingError } = await supabaseAdmin
          .from('bookings')
          .insert([
            {
              business_id,
              service_id,
              customer_name,
              customer_email,
              booking_date,
              booking_time
            }
          ]);

        if (bookingError) throw bookingError;

        return res.status(200).json({ success: true });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
