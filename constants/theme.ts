// constants/theme.ts
// Single source of truth for the UI of every actor (Spender, Sponsor, Personal) and the auth screens.
// Change a value here and it updates everywhere. Use:  import { theme } from '@/constants/theme';

export const colors = {
  // base
  white: '#FFFFFF',
  black: '#000000',
  // text
  textStrong: '#0F172A',
  text: '#1E293B',
  textSoft: '#2D3748',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textGray: '#6B7280',
  textSubtle: '#94A3B8',
  // lines & surfaces
  borderStrong: '#CBD5E1',
  border: '#E2E8F0',
  surfaceAlt: '#F1F5F9',
  surfaceGray: '#F3F4F6',
  background: '#F8FAFC',
  backgroundAlt: '#FAFBFD',
  canvas: '#F7F9F8',
  canvasAlt: '#FDFDFD',
  canvasTeal: '#F0F9F8',
  // brand teal
  brand: '#1F4F59',
  brandDark: '#173D45',
  brandAlt: '#1B494E',
  brandDeep: '#123236',
  brandWash: '#EFF4F6',
  brandWashAlt: '#E6F0F2',
  accent: '#3AA39F',
  accentTint: '#E9FCFB',
  accentSoft: '#9BE5D9',
  accentWash: '#F5FEFD',
  aqua: '#54C9CC',
  aquaSoft: '#7EDDE0',
  teal: '#05968A',
  mint: '#43E7A3',
  mintWash: '#F5FCFA',
  // olive / lime
  olive: '#7EA00E',
  oliveBright: '#9BC915',
  oliveLight: '#89B443',
  oliveDeep: '#213502',
  oliveWash: '#F4F8E8',
  oliveTint: '#F3F6E4',
  lime: '#DCD964',
  limeSoft: '#F4F19C',
  limeWash: '#FAFAD8',
  // status
  success: '#0E7C5A',
  successBg: '#E1F5EC',
  successWash: '#F1FAF6',
  green: '#16A34A',
  greenBg: '#F0FDF4',
  greenBorder: '#86EFAC',
  greenSoft: '#DCFCE7',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  dangerSoft: '#FEE2E2',
  dangerBorder: '#FCA5A5',
  dangerBright: '#EF4444',
  dangerLight: '#FFB8B8',
  dangerWash: '#FFF8F8',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  warningMid: '#D97706',
  warningWash: '#FFFBEB',
  warningBorder: '#FDE68A',
  warningDeep: '#92400E',
  amber: '#F59E0B',
  info: '#3B82F6',
  // emerald (insight / scan)
  emerald: '#10B981',
  emeraldLight: '#34D399',
  emeraldDark: '#059669',
  emerald700: '#047857',
  emerald800: '#065F46',
  emerald900: '#064E3B',
  emerald100: '#D1FAE5',
  emerald50: '#ECFDF5',
  emerald200: '#A7F3D0',
  mintBorder: '#D1E7DD',
  mintLine: '#E2F0EC',
  mintBg: '#F6FBF9',
  mintTint: '#E6F4EA',
  mintGray: '#D1DAD5',
  forestDeep: '#0E2417',
  forest: '#1B3623',
  forestMuted: '#586A61',
  roleGreen: '#166534',
  brandInk: '#04201C',
  brandMid: '#357380',
  aquaMid: '#3AA8AC',
  oliveDark: '#3D6105',
  gray900: '#111827',
  gray700: '#374151',
  // additional (income / split)
  dangerDeep: '#991B1B',
  dangerDark: '#C62828',
  dangerWashAlt: '#FFF5F5',
  dangerPink: '#FFCDD2',
  rose: '#E11D48',
  greenLight: '#BBF7D0',
  successBorder: '#B9E6CE',
  successPale: '#E8F5E9',
  successPaleBorder: '#C8E6C9',
  slate700: '#334155',
  canvasMint: '#F0F5F2',
  tealWash: '#E6FFFA',
  tealWashAlt: '#F0FDFA',
  tealSoft: '#CCFBF1',
  cyanGlow: '#BAFDFF',
  cyanNeon: '#00F7FF',
  limeBorder: '#E3E7C2',
  limeLight: '#ECF1BD',
  iosBlue: '#007AFF',
  borderLight: '#F0F0F0',
  ink: '#111111',
  backgroundCool: '#F8F9FA',
  // spender home (Figma reference)
  gradientStart: '#75C093',
  gradientEnd: '#013237',
  progressFill: '#9BE0B5',
  mintPill: '#CDEBD7',
  mintPillText: '#1E5F44',
  dueGreen: '#3E9B70',
  dueTeal: '#146A72',
  // overlay
  overlay: 'rgba(9, 20, 19, 0.5)',
  // auth screens (login / register / reset ...)
  auth: {
    green: '#085334',
    greenTint: '#E6F5EF',
    greenDark: '#204D3A',
    greenBright: '#0E9B59',
    placeholder: '#A0AEC0',
    text: '#1A202C',
    muted: '#718096',
    wash: '#F3FDEC',
    danger: '#E53E3E',
    google: '#EA4335',
    facebook: '#1877F2',
    g1: '#3E973B',
    g2: '#276916',
    g3: '#15492F',
    g4: '#0C9C6C',
    g5: '#07756C',
    g6: '#3F7C77',
  },
  // translucent colors:  colors.alpha.white[60]
  alpha: {
    white: {6: 'rgba(255, 255, 255, 0.06)', 8: 'rgba(255, 255, 255, 0.08)', 10: 'rgba(255, 255, 255, 0.1)', 12: 'rgba(255, 255, 255, 0.12)', 15: 'rgba(255, 255, 255, 0.15)', 20: 'rgba(255, 255, 255, 0.2)', 30: 'rgba(255, 255, 255, 0.3)', 60: 'rgba(255, 255, 255, 0.6)', 65: 'rgba(255, 255, 255, 0.65)', 82: 'rgba(255, 255, 255, 0.82)'},
    black: {50: 'rgba(0, 0, 0, 0.5)', 55: 'rgba(0, 0, 0, 0.55)', 90: 'rgba(0, 0, 0, 0.9)', 5: 'rgba(0, 0, 0, 0.05)'},
    overlay: {50: 'rgba(9, 20, 19, 0.5)'},
    brand: {10: 'rgba(31, 79, 89, 0.1)'},
    danger: {8: 'rgba(220, 38, 38, 0.08)'},
    dangerBright: {15: 'rgba(239, 68, 68, 0.15)'},
    olive: {10: 'rgba(126, 160, 14, 0.1)', 15: 'rgba(126, 160, 14, 0.15)', 30: 'rgba(126, 160, 14, 0.3)'},
    emerald: {15: 'rgba(16, 185, 129, 0.15)', 30: 'rgba(16, 185, 129, 0.3)', 40: 'rgba(16, 185, 129, 0.4)'},
    emeraldLight: {15: 'rgba(52, 211, 153, 0.15)'},
    emerald900: {60: 'rgba(6, 78, 59, 0.6)'},
    info: {15: 'rgba(59, 130, 246, 0.15)'},
    amber: {15: 'rgba(245, 158, 11, 0.15)'},
    scrim: {55: 'rgba(3, 7, 18, 0.55)', 75: 'rgba(3, 7, 18, 0.75)', 90: 'rgba(3, 7, 18, 0.9)'},
    slate: {60: 'rgba(15, 23, 42, 0.6)', 75: 'rgba(15, 23, 42, 0.75)', 95: 'rgba(15, 23, 42, 0.95)', 50: 'rgba(15, 23, 42, 0.5)'},
    aqua: {8: 'rgba(84, 201, 204, 0.08)'},
    heroEnd: {35: 'rgba(1, 50, 55, 0.35)'},
  },
} as const;

/** Spacing scale (padding / margin / gap), in px. Usage: theme.space[12] */
export const space = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 8: 8, 10: 10, 12: 12, 14: 14, 15: 15, 16: 16, 18: 18, 20: 20, 24: 24, 28: 28, 30: 30, 32: 32, 36: 36, 40: 40} as const;

export const radius = {xxs: 2, xs: 4, sm: 8, tight: 10, md: 12, soft: 14, lg: 16, xl: 20, xxl: 24, xxxl: 28, jumbo: 30, pill: 999} as const;

export const fontSize = {micro: 10, tiny: 11, small: 12, caption: 13, body: 14, bodyLg: 15, subtitle: 16, title: 18, heading: 20, headingLg: 22, display: 26, displayLg: 28, hero: 32} as const;

export const fontWeight = {light: '300', regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800', black: '900'} as const;

/** Ready-made shadows. Usage: ...theme.shadow.md */
export const shadow = {
  sm: { shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  md: { shadowColor: colors.black, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  lg: { shadowColor: colors.brandDark, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 8 },
  xl: { shadowColor: colors.brandDark, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.22, shadowRadius: 24, elevation: 12 },
} as const;

/** Chart / category palettes */
export const chart = {
  category: [colors.aqua, colors.brand, colors.olive, colors.lime, colors.oliveDeep, colors.aquaMid, colors.brandMid, colors.oliveBright, colors.limeSoft, colors.oliveDark],
  lightCards: [colors.brandWashAlt, colors.oliveWash, colors.limeWash],
} as const;

/** Gradients (Figma: linear, 0% #75C093 100% -> 100% #013237 at 80% opacity). Change start/end to rotate it. */
export const gradient = {
  hero: {
    stops: [
      { offset: 0, color: colors.gradientStart, opacity: 1 },
      { offset: 1, color: colors.gradientEnd, opacity: 0.8 },
    ],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
} as const;

export const theme = { colors, space, radius, fontSize, fontWeight, shadow, chart, gradient } as const;
export default theme;