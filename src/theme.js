export const colors = {
  blue: '#2563eb',
  blueDark: '#1d4ed8',
  blueSoft: '#e8f0ff',
  purple: '#7c53bd',
  purpleSoft: '#f1ecfb',
  rose: '#c94970',
  roseSoft: '#fbeaf0',
  amber: '#c98b13',
  amberSoft: '#fff4d9',
  teal: '#12a18f',
  tealDark: '#087c70',
  tealSoft: '#e7f5f2',
  indigo: '#4f46e5',
  indigoDark: '#3730a3',
  indigoSoft: '#ececfe',
  navy: '#11192f',
  text: '#192238',
  muted: '#66717d',
  border: 'rgba(8,124,112,0.13)',
  surface: '#ffffff',
  background: '#f3f7f6',
  glass: 'rgba(255,255,255,0.88)',
  glassBorder: 'rgba(255,255,255,0.82)',
  danger: '#c8342c',
  gold: '#f7d76b',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 30,
};

export const shadow = {
  shadowColor: '#153937',
  shadowOpacity: 0.09,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 9 },
  elevation: 4,
};

export const typography = {
  eyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.1 },
  pageTitle: { fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.3 },
  subtitle: { fontSize: 11.5, lineHeight: 17, fontWeight: '400' },
  sectionTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: -0.2 },
  cardTitle: { fontSize: 14, lineHeight: 18, fontWeight: '700', letterSpacing: -0.12 },
  body: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  label: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
};

/**
 * Shared decorative palette for screen-level header panels (icon chip + soft
 * surface + decorative glow accents). Every panel shares the same structure
 * and typography via PageHeader; only the `tone` differs per page so screens
 * stay visually distinct while remaining consistent in shape and rhythm.
 */
export const panelTones = {
  teal: {
    icon: colors.tealDark,
    chipBg: '#dff5ef',
    chipBorder: '#b9dfd9',
    surface: '#effaf7',
    border: '#b9dfd9',
    glow: 'rgba(24,143,121,0.08)',
    glowSoft: 'rgba(24,143,121,0.06)',
  },
  blue: {
    icon: colors.blueDark,
    chipBg: '#e3ecff',
    chipBorder: '#c3d4fb',
    surface: colors.blueSoft,
    border: '#c3d4fb',
    glow: 'rgba(37,99,235,0.08)',
    glowSoft: 'rgba(37,99,235,0.06)',
  },
  purple: {
    icon: '#2563a8',
    chipBg: '#e4f0ff',
    chipBorder: '#c5dcf7',
    surface: '#f0f7ff',
    border: '#c5dcf7',
    glow: 'rgba(37,99,168,0.08)',
    glowSoft: 'rgba(37,99,168,0.06)',
  },
  rose: {
    icon: '#2d6fae',
    chipBg: '#e2f1ff',
    chipBorder: '#c0dcf4',
    surface: '#eff8ff',
    border: '#c0dcf4',
    glow: 'rgba(45,111,174,0.08)',
    glowSoft: 'rgba(45,111,174,0.06)',
  },
  amber: {
    icon: '#356fa8',
    chipBg: '#e5f2ff',
    chipBorder: '#c6def3',
    surface: '#f1f8ff',
    border: '#c6def3',
    glow: 'rgba(53,111,168,0.08)',
    glowSoft: 'rgba(53,111,168,0.06)',
  },
  indigo: {
    icon: '#315fa8',
    chipBg: '#e4edff',
    chipBorder: '#c6d5f4',
    surface: '#f0f5ff',
    border: '#c6d5f4',
    glow: 'rgba(49,95,168,0.08)',
    glowSoft: 'rgba(49,95,168,0.06)',
  },
};
