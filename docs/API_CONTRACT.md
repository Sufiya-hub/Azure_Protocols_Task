# Function A ↔ Function B: API Contract

Function A (initiator) is already built against this contract and tested.
Function B (receiver) must implement the endpoints below so both functions work together.

Both apps live under `backend/`: Function A in `backend/function_a`, Function B in `backend/function_b`.
Each folder is its own Azure Functions app with its own `.venv`, `requirements.txt` and `local.settings.json`.

> **Assumed message rule (confirm with the task):** 16 messages (0–15) make 8 exchanges.
> In exchange *n*, A sends message `2n−2` and B replies with message `2n−1`, i.e. **B replies with `index + 1`**.
> Message 15 is the closing reply (`"type": "close"`).

---

## 1. Storage: two Azurites, two connection strings

Each function uses **only its own** Azurite. Both contain the same 3 tables
(`Polling`, `SSE`, `WebSocket`), 16 rows each (`PartitionKey = PROCESSES`, `RowKey = ProcessId` as string, ProcessId 0–15).

| | Function A | Function B |
|---|---|---|
| Azurite | A, ports 10000 / 10001 / **10002** | B, ports 20000 / 20001 / **20002** |
| Data folder | `C:\azurite-data` | `C:\azurite-data-b` |
| Start | `npx --yes azurite --location C:\azurite-data` | `npx --yes azurite --location C:\azurite-data-b --blobPort 20000 --queuePort 20001 --tablePort 20002` |

**Connection string A** (Function A: `AzureWebJobsStorage`, `AZURITE_A_CONNECTION`):
```
DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;
```

**Connection string B** (Function B: `AzureWebJobsStorage` and its own table setting):
```
DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:20000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:20001/devstoreaccount1;TableEndpoint=http://127.0.0.1:20002/devstoreaccount1;
```
The account name and key are Azurite's public development defaults (identical on every laptop); only the **ports** differ.

---

## 2. Addresses

| | Value (Function A setting) |
|---|---|
| Function B HTTP base | `http://localhost:7072/api` (`FUNCTION_B_BASE_URL`) |
| Function B WebSocket | `ws://localhost:8765/ws` (`FUNCTION_B_WS_URL`) |

Run Function B with `func start --port 7072`. Function A uses port 7071.

---

## 3. Shared JSON

**Message A → B**
```json
{ "processId": 3, "exchangeNo": 2, "index": 2, "message": "The express service has available seats." }
```
**Reply B → A** (`message` read from **Azurite B**, row `processId`, key `index + 1` of `ConversationJson`)
```json
{ "processId": 3, "index": 3, "replyTo": 2, "message": "Please check the departure platform number.", "type": "reply" }
```
`type` is `"close"` when `index` is 15, otherwise `"reply"`.

---

## 4. Short / Long Polling (table `Polling`)

| Call | Function B must |
|---|---|
| `POST /api/polling/messages` body = message + `"mode": "short"\|"long"` | Store it, answer **202** |
| `GET /api/polling/reply?processId=3&index=2` | **204** if the reply is not ready yet, **200** + reply JSON when ready |
| `GET /api/polling/reply?processId=3&index=2&wait=30` (long poll) | **Hold the request** until the reply is ready (max `wait` seconds) → **200** + reply. If still not ready after `wait`, answer **204** (A will poll again). |

Unknown `processId`/`index` → **404**.

---

## 5. Server-Sent Events (table `SSE`)

| Call | Function B must |
|---|---|
| `GET /api/sse/stream?processId=3` | Respond `200`, `Content-Type: text/event-stream`, keep the stream open. **First event must be `ready`** with a stream id: `event: ready` / `data: {"streamId":"s1","processId":3}` |
| `POST /api/sse/messages` body = message + `"streamId"` | Answer **202**, then push the reply **on that stream**: `event: message` / `data: <reply JSON>` |
| after the closing reply (index 15) | Send `event: close` / `data: {"reason":"conversation complete"}` and end the stream |

Each event ends with a blank line. Comment lines (`: keep-alive`) are allowed.
Python Azure Functions can stream HTTP responses using the `azurefunctions-extensions-http-fastapi` package.

---

## 6. WebSocket (table `WebSocket`)

A normal Azure Functions HTTP trigger cannot serve WebSockets, so Function B must expose a
WebSocket server separately (e.g. a small Python `websockets` server) at `ws://localhost:8765/ws`.

| Direction | Frame (JSON text) |
|---|---|
| A connects | `ws://localhost:8765/ws?processId=3` |
| A → B | `{"type":"message","processId":3,"exchangeNo":2,"index":2,"message":"..."}` |
| B → A | the reply JSON from section 3 (one reply frame per message frame) |
| Close | A closes the socket after its last exchange. B may close after sending the `close` reply. |

One connection carries several exchanges (A can send exchanges 1–8 without a new handshake).

---

## 7. How Function A calls Function B (for testing B)

Function A exposes (port 7071):

| Endpoint | Body |
|---|---|
| `POST /api/polling/run` | `{"processId":3,"exchangeNo":2,"count":1,"mode":"short"\|"long"}` |
| `POST /api/sse/run` | `{"processId":3,"exchangeNo":2,"count":1}` |
| `POST /api/websocket/run` | `{"processId":3,"exchangeNo":2,"count":1}` |

`processId` is optional: when it is left out, **Function A picks it with `rand(0,15)`** and sends that
ProcessId to Function B in every message, so B always receives an explicit `processId`.

The response lists every step on the wire. `"error"` explains any contract mismatch (HTTP 502).
