// scripts/admin-totp-setup.mjs
// Prints an otpauth URI for ADMIN_TOTP_SECRET (set it first, or one is generated) so an
// admin can scan it. Run: `node scripts/admin-totp-setup.mjs`
import { authenticator } from 'otplib'

const secret = process.env.ADMIN_TOTP_SECRET || authenticator.generateSecret()
const uri = authenticator.keyuri('admin', 'NATUX WORLD Admin', secret)
console.log('ADMIN_TOTP_SECRET =', secret)
console.log('otpauth URI       =', uri)
console.log('\nSet ADMIN_TOTP_SECRET in the server env to the value above, then scan the URI.')
