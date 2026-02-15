/* [NEW_PAGE: api/booking.js] */
import { supabaseAdmin } from '../lib/supabase.js'

export default async function handler(req, res) {
  // 1️⃣ FORCE CORS HEADERS
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

  console.log(`[API] ${req.method} Request Received`);

  try {
    // --- GET: FETCH BOOKINGS ---
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
      
      console.log(`[API] Successfully fetched ${data.length} bookings`);
      return res.status(200).json(data);
    }

    // --- POST: CREATE BOOKING OR SETUP ---
    if (req.method === 'POST') {
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { action } = req.query;

      // Action: Setup Business
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

      // Action: Standard Booking
      else {
        const payload = {
          business_id: String(data.business_id || ''),
          service_id: String(data.service_id || data.service || 'general'),
          customer_name: String(data.customer_name || data.name || data.customer || 'Guest'),
          customer_email: String(data.customer_email || data.email || 'no-email@test.com'),
          booking_date: data.booking_date || data.date || null,
          booking_time: data.booking_time || data.time || null
        };

        if (!payload.business_id) {
          return res.status(400).json({ error: 'business_id is required' });
        }

        const { error: bookingError } = await supabaseAdmin
          .from('bookings')
          .insert([payload]);

        if (bookingError) {
          console.error('[API] Supabase Booking Error:', bookingError.message);
          return res.status(500).json({ error: bookingError.message });
        }

        return res.status(200).json({ success: true });
      }
    }

    // --- DELETE: REMOVE A BOOKING ---
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        console.error('[API] DELETE Failed: Missing id');
        return res.status(400).json({ error: 'Booking ID is required' });
      }

      console.log(`[API] Attempting to delete booking: ${id}`);

      const { error } = await supabaseAdmin
        .from('bookings')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[API] Supabase Delete Error:', error.message);
        return res.status(500).json({ error: error.message });
      }

      console.log(`[API] Successfully deleted booking: ${id}`);
      return res.status(200).json({ success: true, deleted: id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[API] Global Error Handler:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
