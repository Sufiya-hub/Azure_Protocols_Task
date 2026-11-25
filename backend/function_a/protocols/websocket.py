"""Protocol function 3: WebSocket (table: WebSocket).

Function A is the WebSocket CLIENT. It performs one handshake with Function B's
WebSocket server, then sends message frames and receives reply frames on the same
connection for every exchange in the run.

Note: a normal Azure Functions HTTP trigger cannot act as a general WebSocket server,
so Function B is expected to expose its WebSocket endpoint separately (FUNCTION_B_WS_URL).
"""

import asyncio
import json
from urllib.parse import urlencode

import azure.functions as func
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake, InvalidURI

from shared import config
from shared.runner import FunctionBError, Run, handle
from shared.trace import Trace

bp = func.Blueprint()

TABLE = "WebSocket"


@bp.route(route="websocket/run", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
async def websocket_run(req: func.HttpRequest) -> func.HttpResponse:
    """POST {"processId": 3, "exchangeNo": 2, "count": 1, "message"?: "..."}"""

    async def driver(run: Run, trace: Trace) -> None:
        url = f"{config.function_b_ws_url()}?{urlencode({'processId': run.process_id})}"
        timeout = config.reply_timeout()
        trace.step("A", "control", "WebSocket handshake", f"GET {url} · Upgrade: websocket")
        trace.count("httpRequests")
        trace.count("connectionsOpened")
        try:
            async with connect(url, open_timeout=10, close_timeout=5) as ws:
                trace.step("B", "control", "101 Switching Protocols", "Full-duplex connection open")
                for ex in run.exchanges:
                    frame = {"type": "message", **ex.request_payload(run.process_id)}
                    await ws.send(json.dumps(frame))
                    trace.count("framesOrEvents")
                    trace.step("A", "request", "Message frame", ex.message, frame)

                    raw = await asyncio.wait_for(ws.recv(), timeout)
                    reply = json.loads(raw)
                    ex.reply = reply
                    trace.count("framesOrEvents")
                    trace.step("B", "response", f"{reply.get('type', 'reply').capitalize()} frame", reply.get("message"), reply)

                reason = "Conversation complete" if run.exchanges[-1].closing else "Run finished"
                trace.step("A", "control", "Close frame", reason)
            trace.step("B", "control", "Connection closed", None)
        except (OSError, InvalidHandshake, InvalidURI) as ex:
            raise FunctionBError(f"Could not open WebSocket to Function B at {url} ({ex})") from ex
        except ConnectionClosed as ex:
            raise FunctionBError(f"Function B closed the WebSocket unexpectedly ({ex})") from ex
        except asyncio.TimeoutError as ex:
            raise FunctionBError(f"No reply frame from Function B within {timeout:.0f}s") from ex
        except json.JSONDecodeError as ex:
            raise FunctionBError("Function B sent a frame that is not JSON") from ex

    return await handle(req, "websocket", TABLE, driver)
