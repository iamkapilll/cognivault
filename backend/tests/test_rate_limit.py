"""Rate limiter behaviour used by login and registration."""

from __future__ import annotations

from app.core.rate_limit import SlidingWindowLimiter


def test_attempts_are_allowed_up_to_the_limit():
    limiter = SlidingWindowLimiter(max_attempts=3, window_seconds=60)

    assert limiter.retry_after("ip:user") == 0
    assert limiter.hit("ip:user") == 0
    assert limiter.hit("ip:user") == 0
    assert limiter.hit("ip:user") == 0
    assert limiter.retry_after("ip:user") > 0


def test_blocked_attempt_reports_retry_after():
    limiter = SlidingWindowLimiter(max_attempts=1, window_seconds=60)

    limiter.hit("key")

    assert limiter.retry_after("key") > 0
    assert limiter.hit("key") > 0


def test_keys_are_isolated():
    limiter = SlidingWindowLimiter(max_attempts=1, window_seconds=60)

    limiter.hit("first")

    assert limiter.retry_after("second") == 0


def test_reset_clears_a_key():
    limiter = SlidingWindowLimiter(max_attempts=1, window_seconds=60)

    limiter.hit("key")
    limiter.reset("key")

    assert limiter.retry_after("key") == 0


def test_window_expiry_releases_the_key():
    limiter = SlidingWindowLimiter(max_attempts=1, window_seconds=0)

    limiter.hit("key")

    assert limiter.retry_after("key") == 0
