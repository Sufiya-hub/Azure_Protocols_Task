"""Seed the Polling, SSE and WebSocket tables in a local Azurite instance.

Usage (PowerShell):
    $env:AZURITE_TABLE_CONNECTION = "<connection string copied from Storage Explorer>"
    python seed_azurite.py

Run it once per Azurite (A on port 10002, B on port 20002), each time with
that Azurite's connection string. Re-running is safe: entities are upserted
(insert or replace), so no duplicates are created.
"""

import json
import os
import sys
from pathlib import Path

from azure.core.exceptions import AzureError
from azure.data.tables import TableServiceClient, UpdateMode

DATA_DIR = Path(__file__).resolve().parent / "data"
TABLES = ["Polling", "SSE", "WebSocket"]
EXPECTED_ENTITIES = 15
EXPECTED_MESSAGES = 16  # message indexes "0".."15"


def load_and_validate(table_name: str) -> list[dict]:
    path = DATA_DIR / f"{table_name}.json"
    entities = json.loads(path.read_text(encoding="utf-8"))

    if len(entities) != EXPECTED_ENTITIES:
        raise ValueError(f"{path.name}: expected {EXPECTED_ENTITIES} entities, found {len(entities)}")

    for e in entities:
        pid = e["ProcessId"]
        if not isinstance(pid, int) or e["RowKey"] != str(pid) or e["PartitionKey"] != "PROCESSES":
            raise ValueError(f"{path.name}: bad keys for ProcessId={pid!r}")
        conversation = json.loads(e["ConversationJson"])
        if sorted(conversation, key=int) != [str(i) for i in range(EXPECTED_MESSAGES)]:
            raise ValueError(f"{path.name}: ProcessId {pid} must have message indexes 0-15")

    ids = sorted(e["ProcessId"] for e in entities)
    if ids != list(range(1, EXPECTED_ENTITIES + 1)):
        raise ValueError(f"{path.name}: ProcessId values must be 1-15, got {ids}")
    return entities


def main() -> int:
    conn = os.environ.get("AZURITE_TABLE_CONNECTION")
    if not conn:
        print("ERROR: set AZURITE_TABLE_CONNECTION first (copy it from Storage Explorer).")
        return 1

    service = TableServiceClient.from_connection_string(conn)
    print(f"Target table endpoint: {service.url}")

    try:
        for table_name in TABLES:
            entities = load_and_validate(table_name)
            table = service.create_table_if_not_exists(table_name)
            for e in entities:
                table.upsert_entity(e, mode=UpdateMode.REPLACE)
            count = sum(1 for _ in table.list_entities(select=["RowKey"]))
            print(f"  {table_name}: upserted {len(entities)} entities, table now holds {count}")
    except AzureError as ex:
        print(f"ERROR talking to Azurite: {ex}")
        print("Check that the Azurite window is running and the connection string ports are correct.")
        return 1

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
