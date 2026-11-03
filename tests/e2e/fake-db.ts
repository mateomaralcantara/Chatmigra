// In-memory PostgREST for the E2E family: enough of Supabase's REST dialect
// (select / eq / in / order / limit / insert / update / delete / single) for
// the Tutor to read and write real rows that survive page reloads.
import type { Page, Route } from '@playwright/test';
import { SUPABASE, USER } from './fixtures';

type Row = Record<string, unknown>;

export class FakeDb {
  tables = new Map<string, Row[]>();
  /** "table:METHOD" -> HTTP status to fail with (simulates outages). */
  failures = new Map<string, number>();
  private clock = 0;
  private seq = 0;

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  insert(table: string, row: Row): Row {
    const full: Row = {
      id: `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      // Monotonic and never behind the browser clock, which the app also uses.
      created_at: new Date((this.clock = Math.max(this.clock + 1, Date.now()))).toISOString(),
      created_by: USER.id,
      ...row,
    };
    this.rows(table).push(full);
    return full;
  }

  messages(caseId?: string): Row[] {
    return this.rows('applicant_case_messages')
      .filter((m) => !caseId || m.case_id === caseId)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  private filter(rows: Row[], params: URLSearchParams): Row[] {
    let out = rows;
    for (const [key, raw] of params) {
      if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) continue;
      const [op, ...rest] = raw.split('.');
      const value = rest.join('.');
      if (op === 'eq') out = out.filter((r) => String(r[key]) === value);
      else if (op === 'neq') out = out.filter((r) => String(r[key]) !== value);
      else if (op === 'in') {
        const list = value.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''));
        out = out.filter((r) => list.includes(String(r[key])));
      } else if (op === 'is' && value === 'null') out = out.filter((r) => r[key] == null);
    }
    return out;
  }

  private order(rows: Row[], params: URLSearchParams): Row[] {
    const order = params.get('order');
    const out = [...rows];
    if (order) {
      const [column, dir] = order.split(',')[0].split('.');
      out.sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (dir === 'desc' ? -1 : 1));
    }
    const limit = Number(params.get('limit'));
    return limit > 0 ? out.slice(0, limit) : out;
  }

  async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.replace('/rest/v1/', '');
    const method = request.method();
    const single = (request.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });

    const failure = this.failures.get(`${table}:${method}`);
    if (failure) return reply(failure, { message: 'simulated outage', code: 'E2E' });

    if (method === 'GET' || method === 'HEAD') {
      const rows = this.order(this.filter(this.rows(table), url.searchParams), url.searchParams);
      if (single) return rows.length ? reply(200, rows[0]) : reply(406, { code: 'PGRST116', message: 'no rows' });
      return reply(200, rows);
    }
    if (method === 'POST') {
      const body = request.postDataJSON() as Row | Row[];
      const created = (Array.isArray(body) ? body : [body]).map((row) => this.insert(table, row));
      return reply(201, single ? created[0] : created);
    }
    if (method === 'PATCH') {
      const changes = request.postDataJSON() as Row;
      const rows = this.filter(this.rows(table), url.searchParams);
      rows.forEach((row) => Object.assign(row, changes));
      return reply(200, single ? rows[0] ?? null : rows);
    }
    if (method === 'DELETE') {
      const doomed = new Set(this.filter(this.rows(table), url.searchParams));
      this.tables.set(table, this.rows(table).filter((r) => !doomed.has(r)));
      return reply(200, []);
    }
    return reply(405, { message: method });
  }

  async install(page: Page) {
    // Registered after the generic fixture, so it takes priority for these tables.
    await page.route(`${SUPABASE}/rest/v1/applicant_*`, (route) => this.handle(route));
  }
}

/** Browser speech doubles: the Tutor's voice and the applicant's microphone. */
export const SPEECH_STUB = `
(() => {
  const spoken = [];
  window.__spoken = spoken;
  const synth = {
    speaking: false,
    getVoices: () => [],
    cancel() {},
    speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 30); },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  class FakeRecognition {
    constructor() { window.__mic = this; this.running = false; }
    start() { this.running = true; window.__micStarts = (window.__micStarts || 0) + 1; }
    stop() { if (this.running) { this.running = false; setTimeout(() => this.onend && this.onend(), 0); } }
    say(text) {
      const result = [{ transcript: text }]; result.isFinal = true;
      this.onresult && this.onresult({ results: [result] });
    }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
})();
`;
