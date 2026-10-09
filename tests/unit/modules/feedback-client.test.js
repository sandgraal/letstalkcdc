/**
 * Unit tests for the assistant feedback client (P13-10).
 *
 * fetch, storage, clock and uuid are all injected, so these tests assert what
 * goes over the wire and what survives in the queue, not how it is wired.
 *
 * @module tests/unit/modules/feedback-client.test
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createFeedbackClient,
  FEEDBACK_KEY,
  MAX_QUEUE,
  MAX_ATTEMPTS,
  MAX_AGE_MS,
  REQUEST_TIMEOUT_MS,
} from "../../../src/js/feedback-client.js";

const URL = "https://example.supabase.co";
const KEY = "sb_publishable_test";
const T0 = Date.parse("2026-10-01T12:00:00.000Z");

function makeStorage(initial) {
  const data = new Map();
  if (initial !== undefined) data.set(FEEDBACK_KEY, JSON.stringify(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    read: () => JSON.parse(data.get(FEEDBACK_KEY) || "[]"),
  };
}

function makeUuid() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

/** fetch fake that answers from a list of statuses (last one repeats). */
function makeFetch(...statuses) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const next = statuses.length > 1 ? statuses.shift() : statuses[0];
    if (next instanceof Error) throw next;
    return { status: next };
  };
  fn.calls = calls;
  return fn;
}

function setup({ statuses = [201], configured = true, initial, clock } = {}) {
  const fetchImpl = makeFetch(...statuses);
  const storage = makeStorage(initial);
  const time = { now: clock ?? T0 };
  const client = createFeedbackClient({
    url: configured ? URL : "",
    key: configured ? KEY : "",
    fetchImpl,
    storage,
    now: () => time.now,
    uuid: makeUuid(),
  });
  return { client, fetchImpl, storage, time };
}

const vote = (over = {}) => ({
  question: "What is CDC?",
  intentId: "what-is-cdc",
  helpful: true,
  ...over,
});

describe("feedback client", () => {
  describe("sending", () => {
    it("sends exactly one correctly shaped request for a vote", async () => {
      const { client, fetchImpl, storage } = setup();
      await client.submit(vote());

      expect(fetchImpl.calls).toHaveLength(1);
      const [{ url, options, body }] = fetchImpl.calls;
      expect(url).toBe(`${URL}/rest/v1/assistant_feedback`);
      expect(options.method).toBe("POST");
      expect(options.headers.apikey).toBe(KEY);
      expect(options.headers.Authorization).toBe(`Bearer ${KEY}`);
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers.Prefer).toBe("return=minimal");
      expect(body).toEqual({
        id: "00000000-0000-4000-8000-000000000001",
        question: "What is CDC?",
        intent_id: "what-is-cdc",
        helpful: true,
        ts: new Date(T0).toISOString(),
      });
      expect(storage.read()).toEqual([]);
    });

    it("uses the same value for apikey and Authorization", async () => {
      const { client, fetchImpl } = setup();
      await client.submit(vote());
      const { headers } = fetchImpl.calls[0].options;
      expect(headers.Authorization).toBe(`Bearer ${headers.apikey}`);
    });

    it("sends a missing intent as null and tolerates a trailing slash", async () => {
      const fetchImpl = makeFetch(201);
      const client = createFeedbackClient({
        url: `${URL}/`,
        key: KEY,
        fetchImpl,
        storage: makeStorage(),
        uuid: makeUuid(),
      });
      await client.submit(vote({ intentId: null, helpful: false }));
      expect(fetchImpl.calls[0].url).toBe(`${URL}/rest/v1/assistant_feedback`);
      expect(fetchImpl.calls[0].body.intent_id).toBeNull();
      expect(fetchImpl.calls[0].body.helpful).toBe(false);
    });

    it("truncates question to 2000 and intent_id to 200 characters", async () => {
      const { client, fetchImpl } = setup();
      await client.submit(
        vote({ question: "q".repeat(2500), intentId: "i".repeat(300) }),
      );
      const { body } = fetchImpl.calls[0];
      expect(body.question).toHaveLength(2000);
      expect(body.intent_id).toHaveLength(200);
    });

    it("truncates by code points, never splitting an emoji", async () => {
      const { client, fetchImpl } = setup();
      await client.submit(vote({ question: "😀".repeat(2100) }));
      const q = fetchImpl.calls[0].body.question;
      expect(Array.from(q)).toHaveLength(2000);
      expect(q.endsWith("😀")).toBe(true);
    });

    it("never sends a lone surrogate, even across the truncation point", async () => {
      const { client, fetchImpl } = setup();
      const lone = "\uD83D"; // high surrogate with no partner
      await client.submit(vote({ question: "a".repeat(1999) + lone + "b" }));
      const q = fetchImpl.calls[0].body.question;
      expect(q.isWellFormed()).toBe(true);
      expect(Array.from(q)).toHaveLength(2000);
      expect(q).toBe("a".repeat(1999) + "\uFFFD");
    });

    it("truncates the question when queueing, so a huge paste is not stored whole", async () => {
      const { client, storage } = setup({ configured: false });
      await client.submit(vote({ question: "😀".repeat(5000) }));
      const [stored] = storage.read();
      expect(Array.from(stored.question)).toHaveLength(2000);
    });
  });

  describe("timeout", () => {
    afterEach(() => vi.restoreAllMocks());

    it("gives every request a 10 second abort signal", async () => {
      expect(REQUEST_TIMEOUT_MS).toBe(10000);
      const spy = vi.spyOn(AbortSignal, "timeout");
      const { client, fetchImpl } = setup();
      await client.submit(vote());
      expect(spy).toHaveBeenCalledWith(10000);
      expect(fetchImpl.calls[0].options.signal).toBeDefined();
    });

    it("keeps the entry, without counting an attempt, when the request is aborted", async () => {
      const storage = makeStorage();
      let aborted = 0;
      const fetchImpl = (url, options) =>
        new Promise((resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            aborted++;
            reject(options.signal.reason);
          });
        });
      const client = createFeedbackClient({
        url: URL,
        key: KEY,
        fetchImpl,
        storage,
        uuid: makeUuid(),
        timeoutMs: 20,
      });
      await client.submit(vote());

      expect(aborted).toBe(1);
      expect(storage.read()).toHaveLength(1);
      expect(storage.read()[0].attempts).toBeUndefined();
    });
  });

  describe("unconfigured", () => {
    it("queues the vote and never fetches", async () => {
      const { client, fetchImpl, storage } = setup({ configured: false });
      expect(client.isConfigured).toBe(false);
      await client.submit(vote());
      await client.sync();

      expect(fetchImpl.calls).toHaveLength(0);
      expect(storage.read()).toHaveLength(1);
      expect(storage.read()[0]).toMatchObject({
        question: "What is CDC?",
        intentId: "what-is-cdc",
        helpful: true,
      });
      expect(client.queueSize()).toBe(1);
    });

    it("treats a url without a key (or the reverse) as unconfigured", () => {
      const a = createFeedbackClient({
        url: URL,
        key: "",
        storage: makeStorage(),
      });
      const b = createFeedbackClient({
        url: "",
        key: KEY,
        storage: makeStorage(),
      });
      expect(a.isConfigured).toBe(false);
      expect(b.isConfigured).toBe(false);
    });
  });

  describe("retry", () => {
    it("keeps a failed entry and delivers it later with the same id", async () => {
      const { client, fetchImpl, storage } = setup({ statuses: [503, 201] });
      await client.submit(vote());
      expect(storage.read()).toHaveLength(1);
      expect(storage.read()[0].attempts).toBe(1);

      await client.sync();
      expect(fetchImpl.calls).toHaveLength(2);
      expect(fetchImpl.calls[1].body.id).toBe(fetchImpl.calls[0].body.id);
      expect(storage.read()).toEqual([]);
    });

    it("keeps the entry after a network error", async () => {
      const { client, storage } = setup({
        statuses: [new TypeError("offline")],
      });
      await client.submit(vote());
      expect(storage.read()).toHaveLength(1);
    });

    it("does not count an attempt for network errors, however often they happen", async () => {
      const { client, fetchImpl, storage } = setup({
        statuses: [new TypeError("offline")],
      });
      await client.submit(vote());
      for (let i = 0; i < MAX_ATTEMPTS + 3; i++) await client.sync();

      expect(fetchImpl.calls).toHaveLength(MAX_ATTEMPTS + 4);
      expect(storage.read()).toHaveLength(1);
      expect(storage.read()[0].attempts).toBeUndefined();
    });

    it("ends the pass at the first network failure instead of trying every entry", async () => {
      const ts = new Date(T0).toISOString();
      const ids = ["a", "b", "c", "d", "e"];
      const initial = ids.map((id) => ({
        id,
        question: `q-${id}`,
        helpful: true,
        ts,
      }));
      const storage = makeStorage(initial);
      const down = makeFetch(new TypeError("blocked"));
      const offline = createFeedbackClient({
        url: URL,
        key: KEY,
        fetchImpl: down,
        storage,
        now: () => T0,
        uuid: makeUuid(),
      });

      await offline.sync();
      expect(down.calls).toHaveLength(1);
      expect(storage.read().map((e) => e.id)).toEqual(ids);
      expect(storage.read().every((e) => e.attempts === undefined)).toBe(true);

      await offline.sync();
      expect(down.calls).toHaveLength(2);

      const up = makeFetch(201);
      const online = createFeedbackClient({
        url: URL,
        key: KEY,
        fetchImpl: up,
        storage,
        now: () => T0,
        uuid: makeUuid(),
      });
      await online.sync();
      expect(up.calls.map((c) => c.body.id)).toEqual(ids);
      expect(storage.read()).toEqual([]);
    });

    it("counts one attempt each time the server answers 5xx, 408 or 429", async () => {
      for (const status of [408, 429, 500, 503]) {
        const { client, storage } = setup({ statuses: [status] });
        await client.submit(vote());
        await client.sync();
        expect(storage.read()[0].attempts).toBe(2);
      }
    });

    it.each([408, 429, 500, 502, 503])(
      "retries later on %i",
      async (status) => {
        const { client, storage } = setup({ statuses: [status] });
        await client.submit(vote());
        expect(storage.read()).toHaveLength(1);
      },
    );

    it("flushes a backlog queued while unconfigured-then-configured", async () => {
      const storage = makeStorage();
      const offline = createFeedbackClient({
        url: "",
        key: "",
        storage,
        uuid: makeUuid(),
      });
      await offline.submit(vote({ question: "one" }));
      await offline.submit(vote({ question: "two" }));

      const fetchImpl = makeFetch(201);
      const online = createFeedbackClient({
        url: URL,
        key: KEY,
        fetchImpl,
        storage,
      });
      await online.sync();
      expect(fetchImpl.calls.map((c) => c.body.question)).toEqual([
        "one",
        "two",
      ]);
      expect(online.queueSize()).toBe(0);
    });
  });

  describe("overlapping syncs", () => {
    it("does not send the same entry twice", async () => {
      let release;
      const gate = new Promise((r) => (release = r));
      const calls = [];
      const fetchImpl = async (url, options) => {
        calls.push(JSON.parse(options.body));
        await gate;
        return { status: 201 };
      };
      const storage = makeStorage();
      const client = createFeedbackClient({
        url: URL,
        key: KEY,
        fetchImpl,
        storage,
        uuid: makeUuid(),
      });
      const first = client.submit(vote());
      const second = client.sync();
      const third = client.sync();
      release();
      await Promise.all([first, second, third]);

      expect(calls).toHaveLength(1);
      expect(storage.read()).toEqual([]);
    });

    it("sends a vote cast during a running sync without overwriting the queue", async () => {
      let release;
      const gate = new Promise((r) => (release = r));
      const calls = [];
      const fetchImpl = async (url, options) => {
        calls.push(JSON.parse(options.body));
        if (calls.length === 1) await gate;
        return { status: 201 };
      };
      const storage = makeStorage();
      const client = createFeedbackClient({
        url: URL,
        key: KEY,
        fetchImpl,
        storage,
        uuid: makeUuid(),
      });
      const first = client.submit(vote({ question: "first" }));
      const second = client.submit(vote({ question: "second" }));
      release();
      await Promise.all([first, second]);

      expect(calls.map((c) => c.question)).toEqual(["first", "second"]);
      expect(new Set(calls.map((c) => c.id)).size).toBe(2);
      expect(storage.read()).toEqual([]);
    });
  });

  describe("queue limits", () => {
    it("caps the queue at 50 entries, dropping the oldest", async () => {
      const { client, storage } = setup({ configured: false });
      for (let i = 0; i < MAX_QUEUE + 5; i++) {
        await client.submit(vote({ question: `q${i}` }));
      }
      const queue = storage.read();
      expect(queue).toHaveLength(MAX_QUEUE);
      expect(queue[0].question).toBe("q5");
      expect(queue.at(-1).question).toBe(`q${MAX_QUEUE + 4}`);
    });

    it("drops an entry after the attempt cap", async () => {
      const { client, fetchImpl, storage } = setup({ statuses: [500] });
      await client.submit(vote());
      for (let i = 0; i < MAX_ATTEMPTS + 3; i++) await client.sync();

      expect(fetchImpl.calls).toHaveLength(MAX_ATTEMPTS);
      expect(storage.read()).toEqual([]);
    });

    it("drops an entry older than 14 days without sending it", async () => {
      const old = new Date(T0 - MAX_AGE_MS - 1000).toISOString();
      const fresh = new Date(T0 - 1000).toISOString();
      const { client, fetchImpl, storage } = setup({
        initial: [
          {
            id: "old",
            question: "old",
            intentId: null,
            helpful: true,
            ts: old,
          },
          {
            id: "new",
            question: "new",
            intentId: null,
            helpful: true,
            ts: fresh,
          },
        ],
      });
      await client.sync();
      expect(fetchImpl.calls.map((c) => c.body.id)).toEqual(["new"]);
      expect(storage.read()).toEqual([]);
    });

    it("gives legacy queue entries without an id a stable one", async () => {
      const { client, fetchImpl } = setup({
        statuses: [500, 201],
        initial: [
          {
            question: "legacy",
            intentId: "x",
            helpful: false,
            ts: new Date(T0).toISOString(),
          },
        ],
      });
      await client.sync();
      await client.sync();
      expect(fetchImpl.calls).toHaveLength(2);
      expect(fetchImpl.calls[0].body.id).toBeTruthy();
      expect(fetchImpl.calls[1].body.id).toBe(fetchImpl.calls[0].body.id);
    });

    it("swallows localStorage quota errors", async () => {
      const storage = {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("full", "QuotaExceededError");
        },
      };
      const fetchImpl = makeFetch(201);
      const client = createFeedbackClient({
        url: URL,
        key: KEY,
        fetchImpl,
        storage,
        uuid: makeUuid(),
      });
      // Never rejects, and still reports the (unpersistable) queue as empty.
      await expect(client.submit(vote())).resolves.toBe(0);
      await expect(client.sync()).resolves.toBe(0);
      expect(fetchImpl.calls).toHaveLength(0);
    });

    it("does not write storage when there is nothing to change", async () => {
      const storage = makeStorage();
      const setItem = vi.spyOn(storage, "setItem");
      const client = createFeedbackClient({
        url: URL,
        key: KEY,
        fetchImpl: makeFetch(201),
        storage,
        uuid: makeUuid(),
      });
      await client.sync();
      await client.sync();
      expect(setItem).not.toHaveBeenCalled();
      expect(storage.getItem(FEEDBACK_KEY)).toBeNull();
    });

    it("never sends a legacy entry whose new id could not be stored", async () => {
      const legacy = [
        {
          question: "legacy",
          intentId: null,
          helpful: true,
          ts: new Date(T0).toISOString(),
        },
      ];
      const fetchImpl = makeFetch(201);
      const client = createFeedbackClient({
        url: URL,
        key: KEY,
        fetchImpl,
        storage: {
          getItem: () => JSON.stringify(legacy),
          setItem: () => {
            throw new DOMException("full", "QuotaExceededError");
          },
        },
        now: () => T0,
        uuid: makeUuid(),
      });
      await client.sync();
      expect(fetchImpl.calls).toHaveLength(0);
    });

    it("recovers from a corrupt queue", async () => {
      const storage = makeStorage();
      storage.setItem(FEEDBACK_KEY, "{not json");
      const client = createFeedbackClient({
        url: "",
        key: "",
        storage,
        uuid: makeUuid(),
      });
      await client.submit(vote());
      expect(client.queueSize()).toBe(1);
    });
  });

  describe("a persistently failing entry", () => {
    it("is tried once per sync and does not swallow a concurrent submit", async () => {
      let release;
      const gate = new Promise((r) => (release = r));
      const calls = [];
      const fetchImpl = async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push(body.question);
        if (calls.length === 1) await gate;
        return { status: body.question === "stuck" ? 503 : 201 };
      };
      const storage = makeStorage([
        {
          id: "stuck-id",
          question: "stuck",
          helpful: true,
          ts: new Date(T0).toISOString(),
        },
      ]);
      const client = createFeedbackClient({
        url: URL,
        key: KEY,
        fetchImpl,
        storage,
        now: () => T0,
        uuid: makeUuid(),
      });

      const running = client.sync();
      const concurrent = client.submit(vote({ question: "fresh" }));
      release();
      await Promise.all([running, concurrent]);

      expect(calls).toEqual(["stuck", "fresh"]);
      expect(storage.read()).toHaveLength(1);
      expect(storage.read()[0]).toMatchObject({
        id: "stuck-id",
        attempts: 1,
      });
    });
  });

  describe("poison handling", () => {
    it("treats 409 as already delivered and removes the entry", async () => {
      const { client, storage } = setup({ statuses: [409] });
      await client.submit(vote());
      expect(storage.read()).toEqual([]);
    });

    it.each([401, 403])(
      "treats %i as a config error: keeps every entry, stops, counts no attempt",
      async (status) => {
        const ts = new Date(T0).toISOString();
        const { client, fetchImpl, storage } = setup({
          statuses: [status],
          initial: [
            { id: "a", question: "one", helpful: true, ts },
            { id: "b", question: "two", helpful: false, ts },
          ],
        });
        await client.sync();

        expect(fetchImpl.calls.map((c) => c.body.id)).toEqual(["a"]);
        expect(storage.read().map((e) => e.id)).toEqual(["a", "b"]);
        expect(storage.read().every((e) => e.attempts === undefined)).toBe(
          true,
        );
      },
    );

    it("delivers entries kept after a 401 once the key is fixed", async () => {
      const { client, fetchImpl, storage } = setup({
        statuses: [401, 201],
      });
      await client.submit(vote({ question: "kept" }));
      expect(storage.read()).toHaveLength(1);

      await client.sync();
      expect(fetchImpl.calls).toHaveLength(2);
      expect(storage.read()).toEqual([]);
    });

    it("does not retry a config error again within the same sync", async () => {
      const { client, fetchImpl } = setup({ statuses: [403] });
      const first = client.submit(vote({ question: "first" }));
      const second = client.submit(vote({ question: "second" }));
      await Promise.all([first, second]);
      expect(fetchImpl.calls).toHaveLength(1);
    });

    it.each([400, 404, 422])(
      "drops the entry on permanent %i",
      async (status) => {
        const { client, fetchImpl, storage } = setup({ statuses: [status] });
        await client.submit(vote());
        await client.sync();
        expect(fetchImpl.calls).toHaveLength(1);
        expect(storage.read()).toEqual([]);
      },
    );

    it("does not let a poison entry block the ones behind it", async () => {
      const { client, fetchImpl, storage } = setup({
        statuses: [400, 201],
        initial: [
          {
            id: "a",
            question: "bad",
            helpful: true,
            ts: new Date(T0).toISOString(),
          },
          {
            id: "b",
            question: "good",
            helpful: true,
            ts: new Date(T0).toISOString(),
          },
        ],
      });
      await client.sync();
      expect(fetchImpl.calls.map((c) => c.body.id)).toEqual(["a", "b"]);
      expect(storage.read()).toEqual([]);
    });
  });
});
