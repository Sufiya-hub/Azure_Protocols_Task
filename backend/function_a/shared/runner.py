"""Common request handling for the three protocol functions."""

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Awaitable, Callable

import azure.functions as func

from . import messages, storage
from .trace import Trace

MAX_PROCESS_ID = 15


class FunctionBError(Exception):
    """Function B was unreachable or answered something the contract does not allow."""


@dataclass
class Exchange:
    exchange_no: int
    index: int
    message: str
    closing: bool
    reply: dict | None = None

    def request_payload(self, process_id: int) -> dict:
        return {"processId": process_id, "exchangeNo": self.exchange_no, "index": self.index, "message": self.message}


@dataclass
class Run:
    process_id: int
    exchanges: list[Exchange]
    options: dict


Driver = Callable[[Run, Trace], Awaitable[None]]


def _parse(req: func.HttpRequest) -> tuple[int, int, int, str | None, dict]:
    try:
        body = req.get_json()
    except ValueError:
        raise ValueError("Request body must be JSON, e.g. {\"processId\": 3, \"exchangeNo\": 1}")
    if not isinstance(body, dict):
        raise ValueError("Request body must be a JSON object")

    def as_int(name: str, default: int | None = None) -> int:
        value = body.get(name, default)
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f"'{name}' must be an integer")
        return value

    process_id = as_int("processId")
    exchange_no = as_int("exchangeNo", 1)
    count = as_int("count", 1)
    if not 0 <= process_id <= MAX_PROCESS_ID:
        raise ValueError(f"'processId' must be 0-{MAX_PROCESS_ID}")
    if not 1 <= exchange_no <= messages.EXCHANGES:
        raise ValueError(f"'exchangeNo' must be 1-{messages.EXCHANGES}")
    if not 1 <= count <= messages.EXCHANGES - exchange_no + 1:
        raise ValueError(f"'count' must be 1-{messages.EXCHANGES - exchange_no + 1} for exchangeNo {exchange_no}")

    override = body.get("message")
    if override is not None and (not isinstance(override, str) or not override.strip()):
        raise ValueError("'message' must be a non-empty string when given")
    return process_id, exchange_no, count, override, body


def json_response(body: dict, status: int = 200) -> func.HttpResponse:
    return func.HttpResponse(json.dumps(body, ensure_ascii=False), status_code=status, mimetype="application/json")


async def handle(req: func.HttpRequest, protocol: str, table: str, driver: Driver) -> func.HttpResponse:
    """Validate the request, load Function A's conversation from Azurite A, run the protocol driver."""
    try:
        process_id, exchange_no, count, override, body = _parse(req)
    except ValueError as ex:
        return json_response({"error": str(ex)}, 400)

    try:
        conversation = await asyncio.to_thread(storage.get_conversation, table, process_id)
    except LookupError as ex:
        return json_response({"error": str(ex)}, 404)
    except Exception as ex:  # noqa: BLE001
        logging.exception("Azurite A read failed")
        return json_response({"error": f"Could not read Azurite A: {ex}"}, 503)

    exchanges = []
    for n in range(exchange_no, exchange_no + count):
        index = messages.a_index(n)
        text = override.strip() if (override and count == 1) else conversation[index]
        exchanges.append(Exchange(n, index, text, messages.is_closing(n)))

    run = Run(process_id, exchanges, body)
    trace = Trace()
    error, status = None, 200
    try:
        await driver(run, trace)
    except FunctionBError as ex:
        error, status = str(ex), 502
    except Exception as ex:  # noqa: BLE001
        logging.exception("Protocol run failed")
        error, status = f"Unexpected error: {ex}", 500

    stats = {**trace.stats, "elapsedMs": trace.elapsed_ms()}
    return json_response(
        {
            "mode": "live",
            "protocol": protocol,
            "table": table,
            "processId": process_id,
            "exchanges": [
                {
                    "exchangeNo": e.exchange_no,
                    "request": e.request_payload(process_id),
                    "reply": e.reply,
                }
                for e in exchanges
            ],
            "closed": any(e.closing and e.reply is not None for e in exchanges),
            "steps": trace.steps,
            "stats": stats,
            "error": error,
        },
        status,
    )
