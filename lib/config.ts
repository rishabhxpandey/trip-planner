// Config knobs (were prototype tweaks). NEXT_PUBLIC_ so the client sees the same values.
export const WEEK_STARTS_MONDAY = process.env.NEXT_PUBLIC_WEEK_STARTS_MONDAY === 'true';
export const MIN_RANGE_DAYS = Math.max(1, Number(process.env.NEXT_PUBLIC_MIN_RANGE_DAYS ?? 2) || 2);
export const PUBLIC_VETOES = process.env.NEXT_PUBLIC_PUBLIC_VETOES !== 'false';
