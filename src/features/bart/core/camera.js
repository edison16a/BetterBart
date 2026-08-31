/** Clamp a value to an inclusive range. */
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

/**
 * Returns a centered, viewport-shaped map view that remains fully inside the
 * drawable map. The scale leaves a small amount of geographic context while
 * preventing the hatched outer border from entering the viewport.
 */
export function centeredMapView({
  mapWidth,
  mapHeight,
  viewportWidth,
  viewportHeight,
  scale = 0.82,
}) {
  const aspect = viewportWidth / Math.max(1, viewportHeight);
  const maximumContainedWidth = Math.min(mapWidth, mapHeight * aspect);
  const width = maximumContainedWidth * scale;
  const height = width / aspect;

  return {
    x: (mapWidth - width) / 2,
    y: (mapHeight - height) / 2,
    w: width,
    h: height,
  };
}

/**
 * Returns a viewport-shaped view around a map point, clamped to the map's
 * interior so stations near an edge never reveal the outer border.
 */
export function pointMapView({
  mapWidth,
  mapHeight,
  viewportWidth,
  viewportHeight,
  point,
  width: requestedWidth,
  verticalAnchor = 0.5,
}) {
  const aspect = viewportWidth / Math.max(1, viewportHeight);
  const width = Math.min(requestedWidth, mapWidth, mapHeight * aspect);
  const height = width / aspect;

  return {
    x: clamp(point.x - width / 2, 0, mapWidth - width),
    y: clamp(point.y - height * verticalAnchor, 0, mapHeight - height),
    w: width,
    h: height,
  };
}
