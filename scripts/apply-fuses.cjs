// electron-builder afterPack hook: harden the packaged Electron binary.
// Disables runAsNode, NODE_OPTIONS and the CLI inspect flags so a local
// attacker cannot repurpose the installed app as a plain Node runtime
// (electron-builder 25 has no built-in electronFuses config, so we use
// @electron/fuses directly).
const path = require('path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

module.exports = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context
  const product = packager.appInfo.productFilename

  let binary
  if (electronPlatformName === 'darwin') {
    binary = path.join(appOutDir, `${product}.app`, 'Contents', 'MacOS', product)
  } else if (electronPlatformName === 'win32') {
    binary = path.join(appOutDir, `${product}.exe`)
  } else {
    binary = path.join(appOutDir, product)
  }

  await flipFuses(binary, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  })
}
