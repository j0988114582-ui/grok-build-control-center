/** P-COMP: auto-grow caps for main and Team composers. */

export const MAIN_COMPOSER_MIN_PX = 88
/** Default composer box: about 3 rows. Long drafts scroll inside instead of covering the transcript. */
export const MAIN_COMPOSER_DEFAULT_PX = 88
/** One-line height when the user collapses the composer to read the conversation. */
export const MAIN_COMPOSER_COLLAPSED_PX = 44
/**
 * Fallback ceiling used only when live geometry is unknown. The main composer itself
 * stays at `MAIN_COMPOSER_DEFAULT_PX` (~3 rows) and scrolls internally.
 */
export const MAIN_COMPOSER_MAX_VH = 0.9
export const TEAM_COMPOSER_MIN_PX = 52
export const TEAM_COMPOSER_MAX_PX = 120
export const TEAM_COMPOSER_MAX_PANE_RATIO = 0.28
/** Transcript keeps a usable floor at minimum window size (1040×680). */
export const TRANSCRIPT_MIN_PX = 120

export function mainComposerMaxPx(viewportHeight: number): number {
  return Math.max(MAIN_COMPOSER_MIN_PX, Math.floor(viewportHeight * MAIN_COMPOSER_MAX_VH))
}

/** Safety helper: never let a live cap eat the transcript below `TRANSCRIPT_MIN_PX`. */
export function availableComposerMaxPx(composerHeight: number, transcriptHeight: number): number {
  if (!Number.isFinite(composerHeight) || !Number.isFinite(transcriptHeight)) return MAIN_COMPOSER_MIN_PX
  return Math.max(MAIN_COMPOSER_MIN_PX, Math.floor(composerHeight + transcriptHeight - TRANSCRIPT_MIN_PX))
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
 * Fit the main `.composer` box to a fixed ~3-row cap (or the collapsed one-line cap).
 * Long drafts scroll inside the textarea instead of stealing transcript space.
 */
export function fitMainComposer(
  composer: HTMLElement,
  textarea: HTMLTextAreaElement,
  viewportHeight: number,
  /** Explicit cap (default ~3 rows, or collapsed height). */
  maxPxOverride?: number
): number {
  const fallback = Math.min(MAIN_COMPOSER_DEFAULT_PX, mainComposerMaxPx(viewportHeight))
  const maxPx = maxPxOverride !== undefined && Number.isFinite(maxPxOverride)
    ? Math.max(MAIN_COMPOSER_COLLAPSED_PX, Math.floor(maxPxOverride))
    : fallback
  const next = Math.min(MAIN_COMPOSER_DEFAULT_PX, maxPx)
  textarea.style.height = '0px'
  const textContent = textarea.scrollHeight
  composer.style.height = `${next}px`
  composer.style.maxHeight = `${next}px`
  const innerMax = Math.max(32, next - 8)
  textarea.style.height = '100%'
  textarea.style.maxHeight = `${innerMax}px`
  textarea.style.overflowY = textContent > innerMax ? 'auto' : 'hidden'
  return next
}
