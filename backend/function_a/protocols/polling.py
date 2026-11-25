"""Protocol function 1: Short Polling and Long Polling (table: Polling).

Function A posts its message to Function B, then:
  short -> asks B for the reply every POLL_INTERVAL_SECONDS (204 = not ready, 200 = reply)
  long  -> sends one poll that B holds open until the reply is ready
"""

import asyncio

import azure.functions as func
import httpx

from shared import config
from shared.runner import Exchange, FunctionBError, Run, handle, json_response
from shared.trace import Trace

bp = func.Blueprint()

TABLE = "Polling"


@bp.route(route="polling/run", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
async def polling_run(req: func.HttpRequest) -> func.HttpResponse:
    """POST {"processId": 3, "exchangeNo": 2, "count": 1, "mode": "short" | "long", "message"?: "..."}"""
    mode = (req.params.get("mode") or _body_mode(req) or "short").lower()
    if mode not in ("short", "long"):
        return json_response({"error": "'mode' must be \"short\" or \"long\""}, 400)

    async def driver(run: Run, trace: Trace) -> None:
        base = config.function_b_base_url()
        async with httpx.AsyncClient(base_url=base, timeout=httpx.Timeout(10.0)) as client:
            for ex in run.exchanges:
                await _post_message(client, run, ex, mode, trace)
                if mode == "short":
                    await _short_poll(client, run, ex, trace)
                else:
                    await _long_poll(client, run, ex, trace)

    return await handle(req, f"{mode}-polling", TABLE, driver)


def _body_mode(req: func.HttpRequest) -> str | None:
    try:
        body = req.get_json()
        return body.get("mode") if isinstance(body, dict) else None
    except ValueError:
        return None


async def _call(client: httpx.AsyncClient, method: str, url: str, **kwargs) -> httpx.Response:
    try:
        return await client.request(method, url, **kwargs)
    except httpx.ConnectError as ex:
        raise FunctionBError(f"Function B is not reachable at {client.base_url} ({ex})") from ex
    except httpx.TimeoutException as ex:
        raise FunctionBError(f"Function B did not answer {method} {url} in time") from ex


async def _post_message(client: httpx.AsyncClient, run: Run, ex: Exchange, mode: str, trace: Trace) -> None:
    payload = {**ex.request_payload(run.process_id), "mode": mode}
    trace.step("A", "request", "POST /polling/messages", ex.message, payload)
    trace.count("httpRequests")
    res = await _call(client, "POST", "/polling/messages", json=payload)
    if res.status_code not in (200, 202):
        raise FunctionBError(f"POST /polling/messages returned {res.status_code}: {res.text[:200]}")
    trace.step("B", "control", f"{res.status_code} Accepted", "Message stored, reply pending")


def _accept_reply(ex: Exchange, res: httpx.Response, trace: Trace, title: str) -> None:
    reply = res.json()
    ex.reply = reply
    trace.step("B", "response", title, reply.get("message"), reply)


async def _short_poll(client: httpx.AsyncClient, run: Run, ex: Exchange, trace: Trace) -> None:
    params = {"processId": run.process_id, "index": ex.index}
    for poll in range(1, config.max_polls() + 1):
        await asyncio.sleep(config.poll_interval())
        trace.step("A", "request", f"GET /polling/reply (poll #{poll})", "Is my reply ready?", params)
        trace.count("httpRequests")
        res = await _call(client, "GET", "/polling/reply", params=params)
        if res.status_code == 204:
            trace.step("B", "empty", "204 No Content", "Not ready yet")
            trace.count("emptyResponses")
            continue
        if res.status_code == 200:
            _accept_reply(ex, res, trace, "200 OK")
            return
        raise FunctionBError(f"GET /polling/reply returned {res.status_code}: {res.text[:200]}")
    raise FunctionBError(f"No reply from Function B after {config.max_polls()} polls")


async def _long_poll(client: httpx.AsyncClient, run: Run, ex: Exchange, trace: Trace) -> None:
    wait = config.long_poll_wait()
    params = {"processId": run.process_id, "index": ex.index, "wait": int(wait)}
    for attempt in range(1, 4):  # re-poll if B's hold times out with 204
        trace.step("A", "request", f"GET /polling/reply?wait={int(wait)} (held)", "Hold this request until my reply is ready", params)
        trace.count("httpRequests")
        res = await _call(client, "GET", "/polling/reply", params=params, timeout=httpx.Timeout(10.0, read=wait + 10))
        if res.status_code == 200:
            _accept_reply(ex, res, trace, "200 OK (held request answered)")
            return
        if res.status_code == 204:
            trace.step("B", "empty", "204 No Content", f"Hold expired (attempt {attempt}), polling again")
            trace.count("emptyResponses")
            continue
        raise FunctionBError(f"GET /polling/reply returned {res.status_code}: {res.text[:200]}")
    raise FunctionBError("Function B did not reply to 3 long polls")
