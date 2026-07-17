/** P-COMP: auto-grow caps for main and Team composers. */

export const MAIN_COMPOSER_MIN_PX = 88
export const MAIN_COMPOSER_MAX_VH = 0.5
export const TEAM_COMPOSER_MIN_PX = 52
export const TEAM_COMPOSER_MAX_PX = 120
export const TEAM_COMPOSER_MAX_PANE_RATIO = 0.28
/** Transcript keeps a usable floor at minimum window size (1040×680). */
export const TRANSCRIPT_MIN_PX = 120

export function mainComposerMaxPx(viewportHeight: number): number {
  return Math.max(MAIN_COMPOSER_MIN_PX, Math.floor(viewportHeight * MAIN_COMPOSER_MAX_VH))
}

export function teamComposerMaxPx(paneHeight: number): number {
  const fromPane = Math.floor(paneHeight * TEAM_COMPOSER_MAX_PANE_RATIO)
  return Math.max(TEAM_COMPOSER_MIN_PX, Math.min(TEAM_COMPOSER_MAX_PX, fromPane || TEAM_COMPOSER_MAX_PX))
}

/**
 * Fit a textarea height between min/max from its scrollHeight.
 * Returns the applied height in px.
 */
export function fitTextareaHeight(
  textarea: HTMLTextAreaElement,
  options: { minPx: number; maxPx: number }
): number {
  const { minPx, maxPx } = options
  textarea.style.height = '0px'
  const content = textarea.scrollHeight
  const next = Math.min(maxPx, Math.max(minPx, content))
  textarea.style.height = `${next}px`
  textarea.style.overflowY = content > maxPx ? 'auto' : 'hidden'
  return next
}

/**
 * Fit the whole main `.composer` box (textarea + command rail) up to 50vh.
 * Measures textarea content then expands the container.
 */
export function fitMainComposer(
  composer: HTMLElement,
  textarea: HTMLTextAreaElement,
  viewportHeight: number
): number {
  const maxPx = mainComposerMaxPx(viewportHeight)
  const minPx = MAIN_COMPOSER_MIN_PX
  textarea.style.height = '0px'
  const textContent = textarea.scrollHeight
  const rail = composer.querySelector('.composer-actions, .send-button') as HTMLElement | null
  const railH = rail ? rail.getBoundingClientRect().height : 0
  // padding inside composer (~top/bottom of textarea area)
  const chrome = 8
  const desired = Math.max(minPx, textContent + Math.max(0, railH - 36) + chrome)
  const next = Math.min(maxPx, desired)
  composer.style.height = `${next}px`
  composer.style.maxHeight = `${maxPx}px`
  // textarea fills remaining space inside the grid row
  const innerMax = Math.max(40, next - 8)
  textarea.style.height = '100%'
  textarea.style.maxHeight = `${innerMax}px`
  textarea.style.overflowY = desired > maxPx ? 'auto' : 'hidden'
  return next
}
