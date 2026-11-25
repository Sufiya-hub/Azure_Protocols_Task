"""Which message Function A sends in each exchange.

ASSUMED RULE (confirm against the task wording, then change only this file):
    16 messages (0-15) form 8 exchanges. In exchange n (1..8)
    Function A sends message 2n-2 and Function B replies with message 2n-1.
    Exchange 8 (messages 14 and 15) closes the conversation.
"""

EXCHANGES = 8


def a_index(exchange_no: int) -> int:
    return (exchange_no - 1) * 2


def expected_b_index(exchange_no: int) -> int:
    return a_index(exchange_no) + 1


def is_closing(exchange_no: int) -> bool:
    return exchange_no == EXCHANGES
