"""In-memory sliding-window rate limiting for authentication endpoints.

This is intentionally process-local: it stops brute-force attempts against a
single worker. For multi-instance deployments the limiter should move to
Redis, which is documented in README.md.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    def __init__(self, max_attempts: int, window_seconds: int) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        events = self._events[key]
        cutoff = now - self.window_seconds
        while events and events[0] <= cutoff:
            events.popleft()
        return events

    def retry_after(self, key: str) -> int:
        """Return 0 when allowed, otherwise seconds until the next attempt."""
        now = time.monotonic()
        with self._lock:
            events = self._prune(key, now)
            if len(events) < self.max_attempts:
                return 0
            return max(1, int(events[0] + self.window_seconds - now) + 1)

    def hit(self, key: str) -> int:
        """Record an attempt; return retry-after seconds when now blocked."""
        now = time.monotonic()
        with self._lock:
            events = self._prune(key, now)
            events.append(now)
            if len(events) <= self.max_attempts:
                return 0
            return max(1, int(events[0] + self.window_seconds - now) + 1)

    def reset(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()
