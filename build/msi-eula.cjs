// electron-builder `msiProjectCreated` hook.
//
// The generated WiX project uses WixUI_InstallDir but rewires WelcomeDlg
// straight to InstallScopeDlg, skipping the License Agreement step. This hook
// (1) converts build/eula.txt to RTF and registers it as WixUILicenseRtf, and
// (2) reinserts LicenseAgreementDlg into the wizard flow:
//       Welcome → License Agreement (must accept) → Install Scope → …
// The user cannot proceed until "I accept the terms in the License Agreement"
// is checked (LicenseAccepted = "1") — WiX's standard, unchecked by default.

const fs = require('fs')
const path = require('path')

function toRtf(text) {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    // RTF is ANSI — encode any non-ASCII (em dashes, quotes) as \uN? escapes.
    .replace(/[^\x00-\x7F]/g, (ch) => `\\u${ch.charCodeAt(0)}?`)
  const body = escaped
    .split(/\r?\n/)
    .map((line) => `${line}\\par`)
    .join('\n')
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Segoe UI;}}\\f0\\fs18\n${body}\n}`
}

exports.default = async function msiProjectCreated(projectFilePath) {
  const eulaTxt = fs.readFileSync(path.join(__dirname, 'eula.txt'), 'utf-8')
  const rtfPath = path.join(__dirname, 'eula.rtf')
  fs.writeFileSync(rtfPath, toRtf(eulaTxt), 'utf-8')

  let wxs = fs.readFileSync(projectFilePath, 'utf-8')
  if (wxs.includes('WixUILicenseRtf')) return // already patched

  // Register our EULA text for the standard LicenseAgreementDlg.
  wxs = wxs.replace(
    '<UIRef Id="WixUI_InstallDir"/>',
    `<WixVariable Id="WixUILicenseRtf" Value="${rtfPath}"/>\n      <UIRef Id="WixUI_InstallDir"/>`,
  )

  // WixUI_InstallDir's own library ALREADY wires WelcomeDlg → LicenseAgreementDlg
  // (and License's Back → Welcome), so re-declaring those publishes collides:
  // WiX links ControlEvent symbols by (dialog, control, event, argument,
  // condition) and errors with LGHT0091 on exact duplicates. Instead:
  //
  // 1. DELETE the template's Welcome → InstallScopeDlg override — with it gone,
  //    the library's built-in Welcome → License Agreement publish takes effect.
  wxs = wxs.replace(
    /\s*<Publish Dialog="WelcomeDlg" Control="Next" Event="NewDialog" Value="InstallScopeDlg"[^>]*>NOT Installed<\/Publish>/,
    '',
  )
  // 2. Route License Agreement's Next to InstallScopeDlg. The library's own
  //    publish targets InstallDirDlg — a different argument, so no duplicate —
  //    and Order 99 makes ours run last and win.
  // 3. Point Install Scope's Back at the License step (edit the template's own
  //    publish in place; the library has no InstallScopeDlg symbols).
  wxs = wxs.replace(
    /<Publish Dialog="InstallScopeDlg" Control="Back" Event="NewDialog" Value="WelcomeDlg"([^>]*)>1<\/Publish>/,
    [
      '<Publish Dialog="LicenseAgreementDlg" Control="Next" Event="NewDialog" Value="InstallScopeDlg" Order="99">LicenseAccepted = "1"</Publish>',
      '        <Publish Dialog="InstallScopeDlg" Control="Back" Event="NewDialog" Value="LicenseAgreementDlg"$1>1</Publish>',
    ].join('\n'),
  )

  fs.writeFileSync(projectFilePath, wxs, 'utf-8')
  console.log('[msi-eula] injected EULA license step into', projectFilePath)
}
