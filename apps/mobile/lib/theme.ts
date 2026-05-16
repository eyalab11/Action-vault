/**
 * ActionVault Design System
 *
 * Aesthetic direction: MyMind-inspired — warm, airy, zen-like
 * Warm white backgrounds, generous whitespace, editorial serif headlines,
 * vibrant warm orange accent, soft rounded cards with subtle shadows.
 * Calm, distraction-free, feels like a private oasis.
 */

export const colors = {
  // Backgrounds — warm whites
  bg: '#FEFCF9',
  surface: '#FFFFFF',
  surfaceSecondary: '#F6F3EE',
  surfaceWarm: '#FFF8F0',

  // Text — warm, not harsh
  textPrimary: '#1A1A1A',
  textSecondary: '#5C5C5C',
  textMuted: '#9B9B9B',
  textLight: '#B8B8B8',

  // Accent — MyMind warm orange
  accent: '#FF5924',
  accentSoft: 'rgba(255, 89, 36, 0.08)',
  accentMuted: 'rgba(255, 89, 36, 0.15)',

  // Playful palette
  pink: '#FF7DD3',
  yellow: '#FFE926',
  green: '#5CB13E',
  blue: '#4A90D9',

  // Semantic
  success: '#5CB13E',
  successSoft: 'rgba(92, 177, 62, 0.10)',
  warning: '#F5A623',
  warningSoft: 'rgba(245, 166, 35, 0.10)',
  danger: '#E5503E',
  dangerSoft: 'rgba(229, 80, 62, 0.08)',

  // Borders — barely there
  border: '#EEEBE6',
  borderSubtle: '#F5F2ED',

  // Shadows
  shadowLight: 'rgba(0, 0, 0, 0.04)',
  shadowMedium: 'rgba(0, 0, 0, 0.08)',

  // Category palette — soft pastels on warm white
  categories: {
    AI:            { bg: '#EEF0FF', text: '#5B5FD6' },
    Work:          { bg: '#F3EEFF', text: '#7B5CC4' },
    Money:         { bg: '#E8F8EE', text: '#2D8A4E' },
    Productivity:  { bg: '#FFF4E0', text: '#C47D15' },
    Learning:      { bg: '#E8F2FF', text: '#3B7DD8' },
    Travel:        { bg: '#E5F9EC', text: '#2B8C42' },
    Food:          { bg: '#FFF0F1', text: '#D4424B' },
    Fitness:       { bg: '#FFF3E6', text: '#C06D1D' },
    PersonalAdmin: { bg: '#F0F0F0', text: '#6B6B6B' },
    Inspiration:   { bg: '#FCF0FF', text: '#A44BC4' },
    Other:         { bg: '#F0F0F0', text: '#6B6B6B' },
  } as Record<string, { bg: string; text: string }>,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

/** Card shadow for elevated surfaces */
export const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 3,
} as const;

export const typography = {
  // Display — big hero text, editorial serif feel
  // (System serif on iOS = New York, on Android = Noto Serif)
  display: {
    fontSize: 32,
    fontWeight: '700' as const,
    letterSpacing: -0.8,
    color: colors.textPrimary,
  },
  // Headline
  headline: {
    fontSize: 24,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  // Title
  title: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  // Body
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  // Caption
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
    letterSpacing: 0.2,
    color: colors.textMuted,
  },
  // Label — small, refined
  label: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
} as const;
