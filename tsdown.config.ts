/**
 * Build config for the custom-instructions client plugin.
 *
 * Uses the vendored dsh client-bundle preset (shared/tsdown.client.ts, kept
 * in sync with the dsh-web-ui family): node-half lib/ plus the browser bundle
 * lib/client.js (closure-factory artifact for the GUI's __ModuleLoader__).
 */
import { clientBundle } from './shared/tsdown.client.ts'

export default clientBundle('@huanghai-lab/dsh-custom-instructions', ['src/index.ts', 'src/invariant.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/dsh-host-webserver',
  ],
})
