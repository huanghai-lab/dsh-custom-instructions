/**
 * Custom instructions editor client plugin — registers the settings page
 * (设置 → 自定义指令) into `settings.section`. The page edits the global
 * instruction file (~/.dsh/AGENTS.md) served by the host route family.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings-surface SlotMap merge (the 'settings.section'
// entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { CSS, CustomInstructionsSection } from './InstructionsSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.section': {
      kind: 'list'
      scope: 'root'
      owner: { close: () => void }
    }
  }
}

/** Required services. */
export const inject = ['slots']

/**
 * Register the custom-instructions settings page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = '@huanghai-lab/dsh-custom-instructions'
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'custom-instructions: styles')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'custom-instructions',
    order: 25,
    label: '自定义指令',
  }, CustomInstructionsSection))
}