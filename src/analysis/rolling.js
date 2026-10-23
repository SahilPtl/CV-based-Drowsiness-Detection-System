// Intervals are half-open [start,end). No extrapolation beyond a valid endpoint.
export class RollingWindow {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.valid = [];
    this.eligible = [];
  }
  append(list, start, end, closed = false) {
    if (end <= start) return;
    const previous = list.at(-1);
    if (previous && previous.end === start && previous.closed === closed)
      previous.end = end;
    else list.push({ start, end, closed });
  }
  addValid(start, end, closed) {
    this.append(this.valid, start, end, closed);
  }
  addEligible(start, end) {
    this.append(this.eligible, start, end);
  }
  measure(now) {
    const boundary = now - this.windowMs;
    for (const list of [this.valid, this.eligible]) {
      while (list.length && list[0].end <= boundary) list.shift();
      if (list.length) list[0].start = Math.max(boundary, list[0].start);
    }
    let validMs = 0,
      closedMs = 0,
      eligibleMs = 0;
    for (const interval of this.valid) {
      const duration = Math.max(
        0,
        Math.min(interval.end, now) - interval.start,
      );
      validMs += duration;
      if (interval.closed) closedMs += duration;
    }
    for (const interval of this.eligible)
      eligibleMs += Math.max(0, Math.min(interval.end, now) - interval.start);
    return {
      validMs,
      closedMs,
      eligibleMs,
      percent: validMs ? (100 * closedMs) / validMs : null,
      coverage: eligibleMs ? Math.min(1, validMs / eligibleMs) : null,
    };
  }
}
