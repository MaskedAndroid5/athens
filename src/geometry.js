export function fitsParcel(o) {
  const width = o.kind === 'solar' ? 5.2 : o.kind === 'resident' ? 0.8 : 3.2;
  const radius =
    ((width * o.scale) / 2) * (Math.abs(Math.sin(o.rotation)) + Math.abs(Math.cos(o.rotation)));
  return o.position.every((n) => Math.abs(n) + radius <= 19);
}
