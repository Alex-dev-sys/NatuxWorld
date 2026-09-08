const REQUIRED_ENV = {
  win: ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD'],
  mac: [
    'CSC_LINK', 'CSC_KEY_PASSWORD', 'MAC_SIGNING_IDENTITY',
    'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID',
  ],
}

function checkCodeSigning(platform, env = process.env) {
  if (!Object.hasOwn(REQUIRED_ENV, platform)) {
    throw new Error('Signing platform must be win or mac')
  }
  const missing = REQUIRED_ENV[platform].filter(name =>
    typeof env[name] !== 'string' || env[name].trim().length === 0)
  if (missing.length) {
    // Print names only; certificate contents, passwords and identities stay private.
    throw new Error(`Missing signing environment variables: ${missing.join(', ')}`)
  }
  if (platform === 'mac' && env.MAC_SIGNING_IDENTITY.trim() === '-') {
    throw new Error('MAC_SIGNING_IDENTITY must identify a distribution certificate; ad-hoc signing is not allowed')
  }
}

function main(args) {
  if (args.length !== 2 || args[0] !== '--platform') {
    throw new Error('Usage: node scripts/check-code-signing.cjs --platform win|mac')
  }
  checkCodeSigning(args[1])
  console.log(`Signing prerequisites present for ${args[1]}`)
}

module.exports = { checkCodeSigning }

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
