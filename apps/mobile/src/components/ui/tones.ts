import type { ColorRoles } from '../../theme';

export type Tone =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'caramel'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export interface ToneColors {
  background: string;
  foreground: string;
}

/** Soft background with readable text (AA) for pills, badges and tinted blocks. */
export function toneColors(colors: ColorRoles, tone: Tone): ToneColors {
  switch (tone) {
    case 'primary':
      return { background: colors.primarySoft, foreground: colors.onPrimarySoft };
    case 'secondary':
      return { background: colors.secondarySoft, foreground: colors.onSecondarySoft };
    case 'caramel':
      return { background: colors.caramelSoft, foreground: colors.onCaramelSoft };
    case 'success':
      return { background: colors.successSoft, foreground: colors.onSuccessSoft };
    case 'warning':
      return { background: colors.warningSoft, foreground: colors.onWarningSoft };
    case 'error':
      return { background: colors.errorSoft, foreground: colors.onErrorSoft };
    case 'info':
      return { background: colors.infoSoft, foreground: colors.onInfoSoft };
    case 'neutral':
      return { background: colors.surfaceMuted, foreground: colors.textSecondary };
  }
}
