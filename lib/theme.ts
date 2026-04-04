export function barberTheme(primaryColor?: string) {
  return {
    '--brand': primaryColor || '#c49b63',
  } as React.CSSProperties;
}
