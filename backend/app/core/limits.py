import time
from collections import deque

class RateLimiter:
    """Single-process guard. Use a shared gateway limiter for multiple replicas."""
    def __init__(self, maximum: int):
        self.maximum = maximum
        self.buckets: dict[str, deque] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        for candidate in list(self.buckets):
            bucket = self.buckets[candidate]
            while bucket and bucket[0] <= now - 60:
                bucket.popleft()
            if not bucket:
                del self.buckets[candidate]
        if key not in self.buckets and len(self.buckets) >= 10000:
            return False
        bucket = self.buckets.setdefault(key, deque())
        if len(bucket) >= self.maximum:
            return False
        bucket.append(now)
        return True
