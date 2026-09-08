const { checkCodeSigning } = require('../scripts/check-code-signing.cjs')

// electron-builder 25 does not expand environment macros in mac.identity.
// A function reads the environment at config-load time without storing credentials.
module.exports = () => ({
  extends: './electron-builder.yml',
  forceCodeSigning: true,
  beforePack(context) {
    const platform = { win32: 'win', darwin: 'mac' }[context.electronPlatformName]
    if (!platform) throw new Error('The signed profile supports Windows and macOS only')
    checkCodeSigning(platform)
  },
  win: {
    signAndEditExecutable: true,
  },
  mac: {
    // Empty string overrides the base null on Windows; the mac preflight requires
    // a real identity before packaging. Never fall back to development signing.
    identity: process.env.MAC_SIGNING_IDENTITY || '',
    type: 'distribution',
    hardenedRuntime: true,
    notarize: true,
  },
})
