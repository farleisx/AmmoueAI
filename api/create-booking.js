import { supabaseAdmin } from '../lib/supabase.js'

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    business_id,
    service_id,
    customer_name,
    customer_email,
    booking_date,
    booking_time
  } = req.body

  if (!business_id || !service_id || !customer_name || !customer_email) {
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

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(200).json({ success: true })
}
