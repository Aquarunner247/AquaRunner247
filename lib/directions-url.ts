/**
 * A driving-directions link to a set of coordinates.
 *
 * Google Maps' universal URL rather than a native scheme (`comgooglemaps://`, `maps://`): it opens
 * the Google Maps app when it is installed, hands off to Apple Maps or the browser when it is not,
 * and needs no per-platform branching or a Capacitor plugin to do it. That reasoning first lived in
 * next-stop-ribbon.tsx; it is here because the schedule list and the map pins now want the same
 * link, and three hand-built URLs would drift.
 *
 * Returns null without coordinates rather than a link to nowhere -- a stop that has never been
 * geocoded should offer no directions button at all, not one that opens a map of the Pacific.
 */
export function directionsUrl(point: { latitude: number | null; longitude: number | null }): string | null {
  if (point.latitude == null || point.longitude == null) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}&travelmode=driving`;
}
