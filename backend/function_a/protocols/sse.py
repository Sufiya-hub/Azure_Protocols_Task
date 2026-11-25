"""Protocol function 2: Server-Sent Events (table: SSE).

Function A opens ONE event stream from Function B and keeps it open for the whole run.
SSE is one-way (B -> A), so A sends each message with a separate HTTP POST and then
waits for B's reply to arrive as a pushed `message` event on the stream.
"""

import asyncio
import json
from typing import AsyncIterator

import azure.functions as func
import httpx

from shared import config
from shared.runner import FunctionBError, Run, handle
from shared.trace import Trace

bp = func.Blueprint()

TABLE = "SSE"


@bp.route(route="sse/run", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
async def sse_run(req: func.HttpRequest) -> func.HttpResponse:
    """POST {"processId": 3, "exchangeNo": 2, "count": 1, "message"?: "..."}"""

    async def driver(run: Run, trace: Trace) -> None:
        base = config.function_b_base_url()
        timeout = config.reply_timeout()
        async with httpx.AsyncClient(base_url=base, timeout=httpx.Timeout(10.0)) as client:
            params = {"processId": run.process_id}
            trace.step("A", "control", "GET /sse/stream", "Accept: text/event-stream", params)
            trace.count("httpRequests")
            trace.count("connectionsOpened")
            try:
                async with client.stream(
                    "GET", "/sse/stream", params=params,
                    headers={"Accept": "text/event-stream"},
                    timeout=httpx.Timeout(10.0, read=timeout + 15),
                ) as stream:
                    content_type = stream.headers.get("content-type", "")
                    if stream.status_code != 200 or "text/event-stream" not in content_type:
                        raise FunctionBError(f"GET /sse/stream returned {stream.status_code} ({content_type})")
                    events = _events(stream)

                    ready = await _next_event(events, timeout, expect="ready")
                    stream_id = ready.get("streamId")
                    trace.step("B", "control", "200 OK · text/event-stream", "Stream open (event: ready)", ready)

                    for ex in run.exchanges:
                        payload = {**ex.request_payload(run.process_id), "streamId": stream_id}
                        trace.step("A", "request", "POST /sse/messages", ex.message, payload)
                        trace.count("httpRequests")
                        res = await client.post("/sse/messages", json=payload)
                        if res.status_code not in (200, 202):
                            raise FunctionBError(f"POST /sse/messages returned {res.status_code}: {res.text[:200]}")
                        trace.step("B", "control", f"{res.status_code} Accepted", "Reply will arrive on the stream")

                        reply = await _next_event(events, timeout, expect="message")
                        ex.reply = reply
                        trace.count("framesOrEvents")
                        trace.step("B", "push", "event: message", reply.get("message"), reply)

                        if ex.closing:
                            try:
                                closed = await _next_event(events, 5, expect="close")
                                trace.step("B", "control", "event: close", "Conversation complete, stream closed", closed)
                            except FunctionBError:
                                trace.step("A", "control", "Stream closed by A", "B sent no close event")
            except httpx.ConnectError as ex:
                raise FunctionBError(f"Function B is not reachable at {base} ({ex})") from ex
            except httpx.TimeoutException as ex:
                raise FunctionBError("Function B's event stream timed out") from ex

    return await handle(req, "sse", TABLE, driver)


async def _events(stream: httpx.Response) -> AsyncIterator[tuple[str, str]]:
    """Parse an SSE byte stream into (event, data) pairs. Comment lines (': ...') are keep-alives."""
    event, data = "message", []
    async for line in stream.aiter_lines():
        if line == "":
            if data:
                yield event, "\n".join(data)
            event, data = "message", []
            continue
        if line.startswith(":"):
            continue
        field, _, value = line.partition(":")
        value = value[1:] if value.startswith(" ") else value
        if field == "event":
            event = value
        elif field == "data":
            data.append(value)


async def _next_event(events: AsyncIterator[tuple[str, str]], timeout: float, expect: str) -> dict:
    try:
        name, data = await asyncio.wait_for(anext(events), timeout)
    except StopAsyncIteration as ex:
        raise FunctionBError(f"Function B closed the stream while A waited for '{expect}'") from ex
    except asyncio.TimeoutError as ex:
        raise FunctionBError(f"No '{expect}' event from Function B within {timeout:.0f}s") from ex
    if name != expect:
        raise FunctionBError(f"Expected SSE event '{expect}' but got '{name}'")
    try:
        return json.loads(data) if data else {}
    except json.JSONDecodeError as ex:
        raise FunctionBError(f"SSE '{name}' data is not JSON: {data[:200]}") from ex
