import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars missing - usando localStorage fallback")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 10 } }
})

// Helpers para converter dados
export const uploadFoto = async (base64, bucket = "fotos") => {
  try {
    const blob = await (await fetch(base64)).blob()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.jpg`
    const { data, error } = await supabase.storage.from(bucket).upload(fileName, blob)
    if (error) throw error
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName)
    return urlData.publicUrl
  } catch (e) {
    console.error("Upload erro, usando base64:", e)
    return base64 // fallback
  }
}
