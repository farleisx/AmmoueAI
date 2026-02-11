import { supabaseAdmin } from '../lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { owner_email, business_name, services } = req.body

  if (!owner_email || !business_name || !services || !Array.isArray(services)) {
    return res.status(400).json({ error: 'Missing or invalid fields' })
  }

  // 1️⃣ Create business
  const { data: business, error } = await supabaseAdmin
    .from('businesses')
    .insert([{ owner_email }])
    .select()
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  const business_id = business.id

  // 2️⃣ Insert services dynamically
  const servicesToInsert = services.map(s => ({
    business_id,
    name: s.name,
    duration: s.duration,
    price: s.price
  }))

  const { error: servicesError } = await supabaseAdmin
    .from('services')
    .insert(servicesToInsert)

  if (servicesError) {
    return res.status(400).json({ error: servicesError.message })
  }

  return res.status(200).json({
    success: true,
    business_id
  })
}
