"""Records every step Function A sees on the wire, so the UI can draw the real flow."""

import time
from datetime import datetime, timezone
from typing import Any


class Trace:
    def __init__(self) -> None:
        self._t0 = time.perf_counter()
        self.steps: list[dict[str, Any]] = []
        self.stats = {"httpRequests": 0, "connectionsOpened": 0, "emptyResponses": 0, "framesOrEvents": 0}

    def step(self, sender: str, kind: str, title: str, detail: str | None = None, payload: Any = None) -> None:
        """sender: 'A' or 'B'. kind: request | response | empty | push | control."""
        self.steps.append(
            {
                "n": len(self.steps) + 1,
                "from": sender,
                "kind": kind,
                "title": title,
                "detail": detail,
                "payload": payload,
                "time": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                "atMs": self.elapsed_ms(),
            }
        )

    def count(self, field: str, by: int = 1) -> None:
        self.stats[field] += by

    def elapsed_ms(self) -> int:
        return round((time.perf_counter() - self._t0) * 1000)
