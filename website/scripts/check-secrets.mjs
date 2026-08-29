// scripts/check-secrets.mjs
// Fails (exit 1) if any required secret is missing, too short, or still a placeholder.
const PLACEHOLDERS = [/change_me/i, /your_/i, /min_32_chars/i, /example/i]
const REQUIRED = ['JWT_SECRET', 'ADMIN_PASSWORD', 'ADMIN_SECRET', 'GAME_API_KEY', 'TWOFA_ENC_KEY', 'ADMIN_TOTP_SECRET']

let bad = false
for (const name of REQUIRED) {
  const v = process.env[name]
  if (!v) { console.error(`✗ ${name} is not set`); bad = true; continue }
  if (v.length < 16) { console.error(`✗ ${name} is too short (<16 chars)`); bad = true; continue }
  if (PLACEHOLDERS.some((re) => re.test(v))) { console.error(`✗ ${name} still looks like a placeholder`); bad = true; continue }
  console.log(`✓ ${name} ok`)
}
// JWT_SECRET specifically should be long.
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error('✗ JWT_SECRET should be at least 32 chars'); bad = true
}
if (bad) { console.error('\nSecret check FAILED — fix env before deploying.'); process.exit(1) }
console.log('\nAll secrets present and non-default.')
