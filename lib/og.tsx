// Helpers for next/og images: font loading and oklch -> hex (Satori doesn't parse oklch).

export const OG_SIZE = { width: 1200, height: 630 };

export async function googleFont(family: string, weight: number, text: string, opsz?: number): Promise<ArrayBuffer | null> {
  const axis = opsz ? `:opsz,wght@${opsz},${weight}` : `:wght@${weight}`;
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}${axis}&text=${encodeURIComponent(text)}`;
  try {
    const css = await (await fetch(url)).text();
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!src) return null;
    const res = await fetch(src[1]);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export function oklchToHex(L: number, C: number, H: number): string {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    '#' +
    lin
      .map((x) => {
        const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

export function LogoRow({ scale = 1 }: { scale?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 * scale }}>
      <div
        style={{
          width: 22 * 2 * scale,
          height: 22 * 2 * scale,
          borderRadius: 12 * scale,
          background: '#1D2326',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: 16 * scale, height: 16 * scale, borderRadius: 8 * scale, background: '#E06A33' }} />
      </div>
      <div style={{ fontFamily: 'Bricolage', fontSize: 40 * scale, fontWeight: 800, letterSpacing: '-0.02em', color: '#1D2326' }}>Outward</div>
    </div>
  );
}
