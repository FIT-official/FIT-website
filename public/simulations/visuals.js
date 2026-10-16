// The temperature field and its legend share one piecewise-linear sRGB map.
// The fractional midpoint preserves the original field's interpolation.
export const HEAT_COLOR_STOPS = [
  { temperature: 20, rgb: [222, 242, 255] },
  { temperature: 60, rgb: [254, 141, 147.5] },
  { temperature: 100, rgb: [190, 40, 40] },
];

export function heatColor(temperature) {
  const first = HEAT_COLOR_STOPS[0], last = HEAT_COLOR_STOPS.at(-1);
  const t = Math.max(first.temperature, Math.min(last.temperature, temperature));
  const upperIndex = HEAT_COLOR_STOPS.findIndex(stop => stop.temperature >= t);
  const upper = HEAT_COLOR_STOPS[upperIndex], lower = HEAT_COLOR_STOPS[Math.max(0, upperIndex - 1)];
  const fraction = upper === lower ? 0 : (t - lower.temperature) / (upper.temperature - lower.temperature);
  return `rgb(${lower.rgb.map((channel, i) => channel + fraction * (upper.rgb[i] - channel)).join(', ')})`;
}

export function heatLegendGradient() {
  const min = HEAT_COLOR_STOPS[0].temperature, max = HEAT_COLOR_STOPS.at(-1).temperature;
  return `linear-gradient(90deg in srgb, ${HEAT_COLOR_STOPS.map(stop => `${heatColor(stop.temperature)} ${(stop.temperature - min) / (max - min) * 100}%`).join(', ')})`;
}
