import { Protocol, TableName } from './models';

/** 16 messages (0-15) per conversation = 8 exchanges of A-message + B-reply. */
export const EXCHANGES = 8;
export const PROCESS_IDS = Array.from({ length: 16 }, (_, i) => i); // ProcessId 0..15

export const processLabel = (id: number) => `P${String(id).padStart(3, '0')}`;

export interface ProtocolInfo {
  id: Protocol;
  label: string;
  icon: string;
  table: TableName;
  tag: string;
  tagClass: string;
  persistent: boolean;
  howItWorks: string;
  connection: string;
  whoSends: string;
}

export const PROTOCOLS: ProtocolInfo[] = [
  {
    id: 'short-polling',
    label: 'Short Polling',
    icon: 'refresh',
    table: 'Polling',
    tag: 'Repeated Request / Response',
    tagClass: 'bg-sky-50 text-sky-700 ring-sky-200',
    persistent: false,
    howItWorks:
      'Function A sends its message, then keeps asking Function B "is my reply ready?" at a fixed interval. Simple, but most polls come back empty.',
    connection: 'New HTTP request for every poll',
    whoSends: 'A only. B can only answer when asked',
  },
  {
    id: 'long-polling',
    label: 'Long Polling',
    icon: 'clock',
    table: 'Polling',
    tag: 'Held Request',
    tagClass: 'bg-amber-50 text-amber-700 ring-amber-200',
    persistent: false,
    howItWorks:
      'Function A sends a poll request that Function B holds open until the reply is ready, then answers at once. Far fewer wasted requests than short polling.',
    connection: 'HTTP request held open by B',
    whoSends: 'A asks, B answers when ready',
  },
  {
    id: 'sse',
    label: 'Server-Sent Events (SSE)',
    icon: 'signal',
    table: 'SSE',
    tag: 'One-way Stream (B → A)',
    tagClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    persistent: true,
    howItWorks:
      'Function A opens one long-lived event stream and Function B pushes replies over it. The stream is one-way, so A still sends its messages with a separate HTTP POST.',
    connection: 'One long-lived HTTP stream',
    whoSends: 'B pushes; A uses separate POSTs',
  },
  {
    id: 'websocket',
    label: 'WebSocket',
    icon: 'arrows',
    table: 'WebSocket',
    tag: 'Bidirectional (Full-Duplex)',
    tagClass: 'bg-violet-50 text-violet-700 ring-violet-200',
    persistent: true,
    howItWorks:
      'Establishes one persistent, bidirectional connection where both Function A and Function B can send messages in real time without new HTTP requests.',
    connection: 'One persistent full-duplex socket',
    whoSends: 'Both A and B, any time',
  },
];

export const protocolInfo = (id: Protocol): ProtocolInfo => PROTOCOLS.find((p) => p.id === id)!;
