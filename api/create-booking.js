import { supabaseAdmin } from '../lib/supabase.js'

export default async function handler(req, res) {
  // 1. FORCE CORS HEADERS ON EVERY RESPONSE
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  // 2. HANDLE PREFLIGHT (CRITICAL)
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  // 3. ACTUAL LOGIC
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      business_id,
      service_id,
      customer_name,
      customer_email,
      booking_date,
      booking_time
    } = req.body

    // Basic validation
    if (!business_id || !customer_name || !customer_email) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const { error } = await supabaseAdmin
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
      ])

    if (error) throw error

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Booking Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
