import { Injectable } from '@angular/core';
import { TableName } from './models';
import { FUNCTION_A_API } from './protocol-client';

interface ProcessRow {
  ProcessId: number;
  ConversationJson: string;
}

/**
 * Loads conversations from the mock copies of the Azurite tables (public/mock/*.json).
 * Used only by the simulation client; the real backend will read from Azurite instead.
 */
@Injectable({ providedIn: 'root' })
export class ConversationService {
  private cache = new Map<TableName, Promise<Map<number, string[]>>>();

  /** Live mode: Function A's own copy, read from Azurite A via GET /api/conversations/{table}/{id}. */
  async getFromFunctionA(table: TableName, processId: number): Promise<string[]> {
    let res: Response;
    try {
      res = await fetch(`${FUNCTION_A_API}/conversations/${table}/${processId}`);
    } catch {
      throw new Error('Function A is not reachable, so its message could not be loaded.');
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.messages) {
      throw new Error(body?.error ? `Function A: ${body.error}` : `Function A is not reachable (HTTP ${res.status}).`);
    }
    return body.messages as string[];
  }

  async get(table: TableName, processId: number): Promise<string[]> {
    const rows = await this.load(table);
    const conversation = rows.get(processId);
    if (!conversation) throw new Error(`ProcessId ${processId} not found in ${table} mock data`);
    return conversation;
  }

  private load(table: TableName): Promise<Map<number, string[]>> {
    let pending = this.cache.get(table);
    if (!pending) {
      pending = fetch(`mock/${table}.json`)
        .then((res) => {
          if (!res.ok) throw new Error(`Could not load mock/${table}.json (HTTP ${res.status})`);
          return res.json() as Promise<ProcessRow[]>;
        })
        .then((rows) => {
          const map = new Map<number, string[]>();
          for (const row of rows) {
            const messages = JSON.parse(row.ConversationJson) as Record<string, string>;
            map.set(row.ProcessId, Array.from({ length: 16 }, (_, i) => messages[String(i)] ?? ''));
          }
          return map;
        });
      pending.catch(() => this.cache.delete(table)); // allow retry after a failed load
      this.cache.set(table, pending);
    }
    return pending;
  }
}
