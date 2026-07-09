/**
 * Deterministic decorative QR-style code generated from a seed string.
 * Purely visual placeholder for the Phase 1 preview — the live system
 * will generate real scannable codes.
 */
export function FakeQR({ seed, size = 132 }: { seed: string; size?: number }) {
  const grid = 13;
  // simple deterministic hash → bit for each cell
  const cells: boolean[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < grid * grid; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    cells.push((h >> 8) % 100 < 48);
  }
  const cell = size / grid;

  const isFinder = (r: number, c: number) => {
    const inBox = (br: number, bc: number) =>
      r >= br && r < br + 3 && c >= bc && c < bc + 3;
    return inBox(0, 0) || inBox(0, grid - 3) || inBox(grid - 3, 0);
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Registration QR code">
      <rect width={size} height={size} fill="#fff" />
      {cells.map((on, i) => {
        const r = Math.floor(i / grid);
        const c = i % grid;
        if (isFinder(r, c)) return null;
        if (!on) return null;
        return (
          <rect
            key={i}
            x={c * cell + 1}
            y={r * cell + 1}
            width={cell - 2}
            height={cell - 2}
            rx={1.5}
            fill="#12224E"
          />
        );
      })}
      {/* finder squares */}
      {[
        [0, 0],
        [0, grid - 3],
        [grid - 3, 0],
      ].map(([r, c], i) => (
        <g key={i}>
          <rect x={c * cell} y={r * cell} width={cell * 3} height={cell * 3} rx={4} fill="#1E40AF" />
          <rect
            x={c * cell + cell * 0.7}
            y={r * cell + cell * 0.7}
            width={cell * 1.6}
            height={cell * 1.6}
            rx={2}
            fill="#fff"
          />
        </g>
      ))}
    </svg>
  );
}
