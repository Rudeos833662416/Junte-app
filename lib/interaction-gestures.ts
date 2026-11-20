export function isDoubleTap(previousTapAt: number | null, now: number, maxDelayMs = 280) {
  return previousTapAt !== null && now - previousTapAt <= maxDelayMs;
}

export function shouldDismissSwipe(distance: number, velocity = 0, threshold = 120) {
  return distance >= threshold || (distance >= threshold * 0.55 && velocity >= 1.1);
}
