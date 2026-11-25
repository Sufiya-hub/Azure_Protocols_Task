"""Reads conversations from Function A's own storage (Azurite A)."""

import json
from functools import lru_cache

from azure.core.exceptions import ResourceNotFoundError
from azure.data.tables import TableServiceClient

from . import config

PARTITION_KEY = "PROCESSES"
MESSAGES_PER_CONVERSATION = 16


@lru_cache(maxsize=1)
def _service() -> TableServiceClient:
    return TableServiceClient.from_connection_string(config.azurite_a_connection())


def get_conversation(table: str, process_id: int) -> list[str]:
    """Return messages 0..15 of ProcessId's ConversationJson from the given table."""
    client = _service().get_table_client(table)
    try:
        entity = client.get_entity(partition_key=PARTITION_KEY, row_key=str(process_id))
    except ResourceNotFoundError as ex:
        raise LookupError(f"ProcessId {process_id} not found in table '{table}' (Azurite A)") from ex

    conversation = json.loads(entity["ConversationJson"])
    return [conversation[str(i)] for i in range(MESSAGES_PER_CONVERSATION)]


def ping() -> bool:
    """True when Azurite A's table service answers."""
    try:
        next(iter(_service().list_tables(results_per_page=1)), None)
        return True
    except Exception:  # noqa: BLE001 - health check only
        return False
