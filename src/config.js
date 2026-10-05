// Public by design. The publishable key can only do what Row Level Security allows (each signed-in
// person reaches their own rows and nothing else), which is why it is safe to ship in the app.
// NEVER put the service_role / secret key anywhere in this repo: that one bypasses all rules.
export const SUPABASE_URL = 'https://zxlmbvokkokgjwhafdan.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8rfQBdJxn7v3gd_G3h15xw_UgDLezeL';
