/** Leaflet's own map panes use z-index up to 1000 (leaflet.css) -- any modal/overlay that
 * might ever appear on the same page as a map needs to sit comfortably above that, or the
 * map paints over it (confirmed twice: the onboarding tour on /dashboard/routes, and
 * ConfirmSubmitButton's dialog on the same page once the route builder map shipped). Shared
 * so every such overlay in this app uses the same value rather than each picking its own
 * number. */
export const ABOVE_MAP_Z_INDEX = 2000;
