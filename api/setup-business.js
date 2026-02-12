// api/setup-business.js
import { supabaseAdmin } from '../lib/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { owner_email, business_name, services } = req.body

  if (!owner_email || !services) {
    return res.status(400).json({ error: 'Missing owner email or services' })
  }

  // 1. Create the business entry
  const { data: business, error } = await supabaseAdmin
    .from('businesses')
    .insert([{ owner_email, name: business_name }])
    .select().single()

  if (error) return res.status(400).json({ error: error.message })

  // 2. Insert services linked to this new business
  const servicesToInsert = services.map(s => ({
    business_id: business.id,
    name: s.name,
    duration: s.duration,
    price: s.price
  }))

  const { error: servicesError } = await supabaseAdmin
    .from('services')
    .insert(servicesToInsert)

  if (servicesError) return res.status(400).json({ error: servicesError.message })

  return res.status(200).json({ success: true, business_id: business.id })
}
