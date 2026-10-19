export function stripBounds(width, contentWidth, offset, edge = 28) {
  const overflow = width > 0 && contentWidth > width + 2;
  const viewport = Math.max(0, width - (overflow ? edge * 2 : 0));
  const maximum = Math.max(0, contentWidth - viewport);
  const position = Math.max(0, Math.min(maximum, offset));
  return { overflow, previous: overflow && position > 2, next: overflow && position < maximum - 2,
    position, maximum, distance: Math.max(44, viewport * 0.8) };
}
