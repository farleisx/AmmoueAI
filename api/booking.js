/* [NEW_PAGE: api/booking.js] */
import { supabaseAdmin } from '../lib/supabase.js'

export default async function handler(req, res) {
  // 1️⃣ FORCE CORS HEADERS - Allowing all origins for generated sites
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

  console.log(`%c[API] ${req.method} Request Received`, 'color: #3b82f6; font-weight: bold;');

  try {
    // --- GET: FETCH BOOKINGS FOR ADMIN ---
    if (req.method === 'GET') {
      const { business_id } = req.query;

      if (!business_id) {
        console.error('[API] GET Failed: Missing business_id');
        return res.status(400).json({ error: 'business_id is required' });
      }

      const { data, error } = await supabaseAdmin
        .from('bookings')
        .select('*')
        .eq('business_id', business_id)
        .order('booking_date', { ascending: false })
        .order('booking_time', { ascending: true });

      if (error) {
        console.error('[API] Supabase Fetch Error:', error.message);
        throw error;
      }
      
      console.log(`[API] Successfully fetched ${data.length} bookings for ${business_id}`);
      return res.status(200).json(data);
    }

    // --- POST: CREATE BUSINESS OR BOOKING ---
    if (req.method === 'POST') {
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { action } = req.query;

      console.log('[API] POST Data received:', data);

      // ACTION: SETUP BUSINESS (Called when site is first generated)
      if (action === 'setup' || (data.owner_email && data.services)) {
        const { owner_email, business_name, services } = data;

        if (!owner_email || !services || !Array.isArray(services)) {
          return res.status(400).json({ error: 'Missing or invalid fields for setup' });
        }

        const { data: business, error: bError } = await supabaseAdmin
          .from('businesses')
          .insert([{ owner_email, name: business_name }])
          .select()
          .single();

        if (bError) {
          console.error('[API] Business Setup Error:', bError.message);
          return res.status(400).json({ error: bError.message });
        }

        const servicesToInsert = services.map(s => ({
          business_id: business.id,
          name: s.name,
          duration: s.duration,
          price: s.price
        }));

        const { error: sError } = await supabaseAdmin
          .from('services')
          .insert(servicesToInsert);

        if (sError) {
          console.error('[API] Services Setup Error:', sError.message);
          return res.status(400).json({ error: sError.message });
        }

        return res.status(200).json({ success: true, business_id: business.id });
      }

      // ACTION: CREATE BOOKING (Called by the customer form)
      else {
        // NORMALIZE INPUTS: Handle every variation the AI might generate
        const business_id = String(data.business_id || '');
        const service_id = String(data.service_id || data.service || 'general');
        const customer_name = String(data.customer_name || data.name || data.customer || data['customer-name'] || data.full_name || 'Guest');
        const customer_email = String(data.customer_email || data.email || data['customer-email'] || data.user_email || 'no-email@test.com');
        
        // Ensure empty dates/times are sent as null, not empty strings
        const booking_date = data.booking_date || data.date || data.day || null;
        const booking_time = data.booking_time || data.time || data.slot || null;

        if (!business_id || business_id === '') {
          console.error('[API] Booking Failed: No business_id in payload');
          return res.status(400).json({ error: 'business_id is required to save a booking' });
        }

        const payload = {
          business_id: business_id,
          service_id: service_id,
          customer_name: customer_name,
          customer_email: customer_email,
          booking_date: booking_date === "" ? null : booking_date,
          booking_time: booking_time === "" ? null : booking_time
        };

        console.log('[API] Attempting Supabase Insert with payload:', payload);

        const { error: bookingError } = await supabaseAdmin
          .from('bookings')
          .insert([payload]);

        if (bookingError) {
          console.error('[API] Supabase Booking Insert Error:', bookingError.message);
          return res.status(500).json({ error: bookingError.message });
        }

        console.log('[API] Booking Success saved to DB');
        return res.status(200).json({ success: true });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[API] Global Error Handler:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
