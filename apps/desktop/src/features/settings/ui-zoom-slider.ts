import {
  UI_ZOOM_DEFAULT,
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  normalizeUiZoom,
} from "@/features/preferences";

/** Each half of the track covers one side of 100%, despite unequal limits. */
export function uiZoomToSlider(zoom: number): number {
  const value = normalizeUiZoom(zoom);
  return value <= UI_ZOOM_DEFAULT
    ? (50 * (value - UI_ZOOM_MIN)) / (UI_ZOOM_DEFAULT - UI_ZOOM_MIN)
    : 50 + (50 * (value - UI_ZOOM_DEFAULT)) / (UI_ZOOM_MAX - UI_ZOOM_DEFAULT);
}

export function sliderToUiZoom(position: number): number {
  return normalizeUiZoom(
    position <= 50
      ? UI_ZOOM_MIN + (position / 50) * (UI_ZOOM_DEFAULT - UI_ZOOM_MIN)
      : UI_ZOOM_DEFAULT +
          ((position - 50) / 50) * (UI_ZOOM_MAX - UI_ZOOM_DEFAULT),
  );
}
