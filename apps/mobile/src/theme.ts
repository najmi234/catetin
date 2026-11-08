import { useColorScheme } from 'react-native';

const light = {
  background: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF0F5',
  border: '#E2E5EC',
  text: '#0F172A',
  textMuted: '#64748B',
  primary: '#4F46E5',
  primarySoft: '#EEF2FF',
  onPrimary: '#FFFFFF',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  success: '#059669',
  successSoft: '#ECFDF5',
  warning: '#B45309',
  warningSoft: '#FFFBEB',
};

export type Palette = typeof light;

const dark: Palette = {
  background: '#0B0F19',
  surface: '#151B28',
  surfaceMuted: '#1E2535',
  border: '#273047',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  primary: '#818CF8',
  primarySoft: '#1E1B4B',
  onPrimary: '#0B0F19',
  danger: '#F87171',
  dangerSoft: '#3B1414',
  success: '#34D399',
  successSoft: '#0B2B22',
  warning: '#FBBF24',
  warningSoft: '#3A2A08',
};

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const fontSize = { caption: 12, small: 13, body: 15, heading: 17, title: 22, hero: 28 };
