# Function A: Initiator

Python Azure Functions (v2 programming model, runtime v4). Function A reads its conversations
from **Azurite A** and talks to Function B using Short Polling, Long Polling, SSE or WebSocket.
The contract with Function B is in [`docs/API_CONTRACT.md`](../../docs/API_CONTRACT.md).

## Structure

```
backend/
  function_a/              ← this app (initiator)
  function_b/              ← teammate's app (receiver)

backend/function_a/
  function_app.py          entry point: registers the 3 protocol functions + helpers
  protocols/
    polling.py             POST /api/polling/run    (Short + Long Polling, table Polling)
    sse.py                 POST /api/sse/run        (Server-Sent Events,   table SSE)
    websocket.py           POST /api/websocket/run  (WebSocket client,     table WebSocket)
  shared/
    config.py              app settings
    storage.py             reads ConversationJson from Azurite A
    messages.py            which message A sends per exchange (ASSUMED RULE lives here)
    runner.py              validation, error handling, response format
    trace.py               records each step for the UI
  local.settings.example.json
```

## Run it

1. Start **Azurite A** (port 10002) and make sure its tables are seeded.
2. First time only:
   ```powershell
   cd backend\function_a
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   Copy-Item local.settings.example.json local.settings.json
   ```
3. Start Function A:
   ```powershell
   cd backend\function_a
   $env:VIRTUAL_ENV = "$PWD\.venv"
   $env:PATH = "$PWD\.venv\Scripts;$env:PATH"
   func start --port 7071
   ```
   Both lines matter: without `VIRTUAL_ENV`, Core Tools uses the system Python and fails with
   `No module named 'httpx'`. (`.\.venv\Scripts\Activate.ps1` does the same, if your execution policy allows scripts.)
4. Check it: `http://localhost:7071/api/health` should report `"azuriteA": "reachable"`.

Function B must be running (port 7072 + WebSocket on 8765) for the `/run` endpoints to succeed.
If it is not, they return **502** with the address that could not be reached.

## Example

```powershell
Invoke-RestMethod http://localhost:7071/api/websocket/run -Method Post -ContentType application/json `
  -Body '{"processId":3,"exchangeNo":1,"count":8}'
```

Body fields: `processId` 0–15 (**optional: leave it out and Function A picks `rand(0,15)`**;
the response's `processId` / `processIdSource: "random"` says which one), `exchangeNo` 1–8, `count` (exchanges on the same connection, default 1),
`message` (optional custom text, only when `count` is 1), `mode` (`short`/`long`, polling only).
