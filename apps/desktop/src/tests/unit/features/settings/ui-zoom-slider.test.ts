import { describe, expect, it } from "vitest";
import {
  sliderToUiZoom,
  uiZoomToSlider,
} from "@/features/settings/ui-zoom-slider";
import { UI_ZOOM_MAX, UI_ZOOM_MIN } from "@/features/preferences";

describe("ui zoom slider mapping", () => {
  it("places 100% at the midpoint and the limits at the ends", () => {
    expect(uiZoomToSlider(1)).toBe(50);
    expect(uiZoomToSlider(UI_ZOOM_MIN)).toBe(0);
    expect(uiZoomToSlider(UI_ZOOM_MAX)).toBe(100);
  });

  it("round-trips every supported percentage", () => {
    for (
      let percent = UI_ZOOM_MIN * 100;
      percent <= UI_ZOOM_MAX * 100;
      percent += 1
    ) {
      expect(sliderToUiZoom(uiZoomToSlider(percent / 100))).toBeCloseTo(
        percent / 100,
        5,
      );
    }
  });

  it("clamps out-of-range input through normalization", () => {
    expect(sliderToUiZoom(-10)).toBe(UI_ZOOM_MIN);
    expect(sliderToUiZoom(200)).toBe(UI_ZOOM_MAX);
    expect(uiZoomToSlider(0.1)).toBe(0);
    expect(uiZoomToSlider(9)).toBe(100);
  });
});
