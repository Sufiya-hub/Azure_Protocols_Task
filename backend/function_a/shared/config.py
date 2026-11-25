"""App settings for Function A (read from local.settings.json -> Values)."""

import os


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing app setting '{name}'. Copy local.settings.example.json to local.settings.json.")
    return value


def _number(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


def azurite_a_connection() -> str:
    """Connection string of Azurite A, the only storage Function A uses."""
    return _required("AZURITE_A_CONNECTION")


def function_b_base_url() -> str:
    return _required("FUNCTION_B_BASE_URL").rstrip("/")


def function_b_ws_url() -> str:
    return _required("FUNCTION_B_WS_URL")


def poll_interval() -> float:
    return _number("POLL_INTERVAL_SECONDS", 1)


def max_polls() -> int:
    return int(_number("MAX_POLLS", 15))


def long_poll_wait() -> float:
    return _number("LONG_POLL_WAIT_SECONDS", 30)


def reply_timeout() -> float:
    return _number("REPLY_TIMEOUT_SECONDS", 30)
