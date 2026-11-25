"""Function A (initiator): entry point.

Protocol functions (one per table):
  POST /api/polling/run     -> Short / Long Polling  (table: Polling)
  POST /api/sse/run         -> Server-Sent Events     (table: SSE)
  POST /api/websocket/run   -> WebSocket              (table: WebSocket)
Helpers:
  GET  /api/health
  GET  /api/conversations/{table}/{processId}
"""

import asyncio

import azure.functions as func

from protocols.polling import bp as polling_bp
from protocols.sse import bp as sse_bp
from protocols.websocket import bp as websocket_bp
from shared import config, storage
from shared.runner import json_response

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)
app.register_functions(polling_bp)
app.register_functions(sse_bp)
app.register_functions(websocket_bp)

TABLES = {"Polling", "SSE", "WebSocket"}


@app.route(route="health", methods=["GET"])
async def health(req: func.HttpRequest) -> func.HttpResponse:
    azurite_ok = await asyncio.to_thread(storage.ping)
    return json_response(
        {
            "function": "A",
            "role": "initiator",
            "azuriteA": "reachable" if azurite_ok else "NOT reachable",
            "functionB": {"http": config.function_b_base_url(), "websocket": config.function_b_ws_url()},
        },
        200 if azurite_ok else 503,
    )


@app.route(route="conversations/{table}/{processId:int}", methods=["GET"])
async def conversation(req: func.HttpRequest) -> func.HttpResponse:
    table = req.route_params.get("table", "")
    if table not in TABLES:
        return json_response({"error": f"table must be one of {sorted(TABLES)}"}, 400)
    process_id = int(req.route_params["processId"])
    try:
        messages = await asyncio.to_thread(storage.get_conversation, table, process_id)
    except LookupError as ex:
        return json_response({"error": str(ex)}, 404)
    return json_response({"table": table, "processId": process_id, "messages": messages})
