export interface RegionRect { x: number; y: number; width: number; height: number }

export function clampRegion<T extends RegionRect>(region: T, viewportWidth: number, viewportHeight: number): T {
  const boundWidth = Math.max(1, viewportWidth);
  const boundHeight = Math.max(1, viewportHeight);
  const width = Math.min(boundWidth, Math.max(10, Number.isFinite(region.width) ? region.width : 10));
  const height = Math.min(boundHeight, Math.max(10, Number.isFinite(region.height) ? region.height : 10));
  return { ...region, width, height,
    x: Math.min(boundWidth - width, Math.max(0, Number.isFinite(region.x) ? region.x : 0)),
    y: Math.min(boundHeight - height, Math.max(0, Number.isFinite(region.y) ? region.y : 0)),
  };
}

export function drawRegion(startX: number, startY: number, endX: number, endY: number): RegionRect {
  return { x: Math.min(startX, endX), y: Math.min(startY, endY), width: Math.abs(endX - startX), height: Math.abs(endY - startY) };
}
