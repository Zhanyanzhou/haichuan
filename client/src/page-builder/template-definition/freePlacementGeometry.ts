import type { DynamicTemplatePlacement } from "./generated/templateDefinition.generated";

export type FreePlacementResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const MIN_SIZE = 0.02;
const SNAP_DISTANCE = 0.008;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function snap(value: number, guides: readonly number[]) {
  let nearest = value;
  let distance = SNAP_DISTANCE;
  guides.forEach((guide) => {
    const nextDistance = Math.abs(value - guide);
    if (nextDistance <= distance) {
      nearest = guide;
      distance = nextDistance;
    }
  });
  return nearest;
}

export function getFreePlacementGuides(siblings: readonly DynamicTemplatePlacement[]) {
  return {
    x: [0, 0.5, 1, ...siblings.flatMap((item) => [item.x, item.x + item.width / 2, item.x + item.width])],
    y: [0, 0.5, 1, ...siblings.flatMap((item) => [item.y, item.y + item.height / 2, item.y + item.height])],
  };
}

export function moveFreePlacement(
  start: DynamicTemplatePlacement,
  dx: number,
  dy: number,
  siblings: readonly DynamicTemplatePlacement[] = [],
): DynamicTemplatePlacement {
  const guides = getFreePlacementGuides(siblings);
  let x = clamp(start.x + dx, 0, 1 - start.width);
  let y = clamp(start.y + dy, 0, 1 - start.height);
  const snappedLeft = snap(x, guides.x);
  const snappedCenter = snap(x + start.width / 2, guides.x) - start.width / 2;
  const snappedRight = snap(x + start.width, guides.x) - start.width;
  x = [snappedLeft, snappedCenter, snappedRight].reduce((best, candidate) => (
    Math.abs(candidate - x) < Math.abs(best - x) ? candidate : best
  ), x);
  const snappedTop = snap(y, guides.y);
  const snappedMiddle = snap(y + start.height / 2, guides.y) - start.height / 2;
  const snappedBottom = snap(y + start.height, guides.y) - start.height;
  y = [snappedTop, snappedMiddle, snappedBottom].reduce((best, candidate) => (
    Math.abs(candidate - y) < Math.abs(best - y) ? candidate : best
  ), y);
  return { ...start, x: clamp(x, 0, 1 - start.width), y: clamp(y, 0, 1 - start.height) };
}

export function resizeFreePlacement(
  start: DynamicTemplatePlacement,
  handle: FreePlacementResizeHandle,
  dx: number,
  dy: number,
  siblings: readonly DynamicTemplatePlacement[] = [],
): DynamicTemplatePlacement {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - MIN_SIZE);
  if (handle.includes("e")) right = clamp(right + dx, left + MIN_SIZE, 1);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - MIN_SIZE);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + MIN_SIZE, 1);
  const guides = getFreePlacementGuides(siblings);
  if (handle.includes("w")) left = clamp(snap(left, guides.x), 0, right - MIN_SIZE);
  if (handle.includes("e")) right = clamp(snap(right, guides.x), left + MIN_SIZE, 1);
  if (handle.includes("n")) top = clamp(snap(top, guides.y), 0, bottom - MIN_SIZE);
  if (handle.includes("s")) bottom = clamp(snap(bottom, guides.y), top + MIN_SIZE, 1);
  return {
    ...start,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}
