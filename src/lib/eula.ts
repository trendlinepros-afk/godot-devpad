import eulaText from '../../build/eula.txt?raw'

// Single source of truth for the EULA: build/eula.txt is shown by the Windows
// installers (NSIS license page + MSI License Agreement dialog) and rendered
// in-app on first launch. Bump EULA_VERSION when the text changes materially —
// users must re-accept the new version.

export const EULA_VERSION = '1.1'
export const EULA_TEXT: string = eulaText
