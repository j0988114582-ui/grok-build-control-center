import type { PermissionOption } from '../shared/types'

export function selectPermissionOutcome(options: PermissionOption[], optionId: string): { outcome: { outcome: 'selected'; optionId: string } } {
  if (!options.some((option) => option.optionId === optionId)) throw new Error('Invalid permission option')
  return { outcome: { outcome: 'selected', optionId } }
}
