//#region sim/core/EventBus.ts
var e = class {
	constructor() {
		this.handlers = /* @__PURE__ */ new Set();
	}
	emit(e) {
		this.handlers.forEach((t) => t(e));
	}
	on(e) {
		return this.handlers.add(e), () => this.handlers.delete(e);
	}
}, t = class {
	constructor() {
		this.bus = new e(), this.seq = 0, this.randomSeed = 42;
	}
	configure(e) {}
	reset(e) {
		this.seq = 0, this.randomSeed = e;
	}
	onEvent(e) {
		return this.bus.on(e);
	}
}, n = class extends t {
	constructor(...e) {
		super(...e), this.name = "polling", this.table = /* @__PURE__ */ new Map(), this.lastSync = 0, this.pollIntervalMs = 1e3, this.includeSoftDeletes = !1;
	}
	configure(e) {
		e.poll_interval_ms !== void 0 && (this.pollIntervalMs = e.poll_interval_ms), e.include_soft_deletes !== void 0 && (this.includeSoftDeletes = e.include_soft_deletes);
	}
	reset(e) {
		super.reset(e), this.table.clear(), this.lastSync = 0;
	}
	applySourceOp(e) {
		if (e.op !== "redeliver") {
			if (e.op === "insert") this.table.set(e.pk.id, {
				id: e.pk.id,
				table: e.table,
				data: e.after,
				version: 1,
				updated_at_ms: e.t,
				deleted: !1
			});
			else if (e.op === "update") {
				let t = this.table.get(e.pk.id);
				if (!t || t.deleted) return;
				this.table.set(e.pk.id, {
					...t,
					table: t.table ?? e.table,
					data: {
						...t.data,
						...e.after
					},
					version: t.version + 1,
					updated_at_ms: e.t
				});
			} else if (e.op === "delete") {
				let t = this.table.get(e.pk.id);
				if (!t) return;
				this.table.set(e.pk.id, {
					...t,
					table: t.table ?? e.table,
					deleted: !0,
					updated_at_ms: e.t
				});
			}
		}
	}
	shouldPoll(e) {
		return e - this.lastSync >= this.pollIntervalMs;
	}
	tick(e) {
		if (!this.shouldPoll(e)) return;
		let t = [...this.table.values()].filter((e) => e.updated_at_ms > this.lastSync);
		for (let e of t) {
			if (e.deleted && !this.includeSoftDeletes) continue;
			let t = {
				source: "demo-db",
				table: e.table,
				op: e.deleted ? "d" : e.version > 1 ? "u" : "c",
				pk: { id: e.id },
				before: null,
				after: e.deleted ? null : e.data,
				ts_ms: e.updated_at_ms,
				tx: {
					id: `tx-${e.updated_at_ms}`,
					lsn: null,
					index: 0,
					total: 1,
					last: !0
				},
				seq: ++this.seq,
				meta: { method: "polling" }
			};
			this.bus.emit(t);
		}
		this.lastSync = e;
	}
}, r = class extends t {
	constructor(...e) {
		super(...e), this.name = "trigger", this.table = /* @__PURE__ */ new Map(), this.audit = [], this.extractOffset = 0, this.extractIntervalMs = 500, this.lastExtract = 0, this.triggerOverheadMs = 5;
	}
	configure(e) {
		e.extract_interval_ms !== void 0 && (this.extractIntervalMs = e.extract_interval_ms), e.trigger_overhead_ms !== void 0 && (this.triggerOverheadMs = e.trigger_overhead_ms);
	}
	reset(e) {
		super.reset(e), this.table.clear(), this.audit = [], this.extractOffset = 0, this.lastExtract = 0;
	}
	applySourceOp(e) {
		if (e.op === "redeliver") return;
		let t = e.t + this.triggerOverheadMs, n = e.txn ?? {
			id: `tx-${t}`,
			index: 0,
			total: 1,
			last: !0
		}, r = n.id ?? `tx-${t}`, a = typeof n.index == "number" ? n.index : 0, o = typeof n.total == "number" ? n.total : 1, s = typeof n.last == "boolean" ? n.last : a >= o - 1;
		if (e.op === "insert") this.table.set(e.pk.id, {
			id: e.pk.id,
			table: e.table,
			data: e.after,
			version: 1,
			updated_at_ms: t,
			deleted: !1
		}), this.audit.push({
			audit_id: i(),
			op: "c",
			pk: e.pk,
			before: null,
			after: e.after,
			tx_id: r,
			tx_index: a,
			tx_total: o,
			tx_last: s,
			table: e.table,
			commit_ts_ms: t
		});
		else if (e.op === "update") {
			let n = this.table.get(e.pk.id), c = n ? { ...n.data } : null, l = n ? {
				...n.data,
				...e.after
			} : e.after;
			this.table.set(e.pk.id, {
				id: e.pk.id,
				table: n?.table ?? e.table,
				data: l,
				version: (n?.version ?? 0) + 1,
				updated_at_ms: t,
				deleted: !1
			}), this.audit.push({
				audit_id: i(),
				op: "u",
				pk: e.pk,
				before: c,
				after: l,
				tx_id: r,
				tx_index: a,
				tx_total: o,
				tx_last: s,
				table: e.table,
				commit_ts_ms: t
			});
		} else if (e.op === "delete") {
			let n = this.table.get(e.pk.id) || {
				id: e.pk.id,
				table: e.table,
				data: {},
				version: 0,
				updated_at_ms: t,
				deleted: !0
			};
			this.table.set(e.pk.id, {
				...n,
				deleted: !0,
				updated_at_ms: t
			}), this.audit.push({
				audit_id: i(),
				op: "d",
				pk: e.pk,
				before: n ? n.data : null,
				after: null,
				tx_id: r,
				tx_index: a,
				tx_total: o,
				tx_last: s,
				table: e.table,
				commit_ts_ms: t
			});
		}
	}
	tick(e) {
		if (e - this.lastExtract < this.extractIntervalMs) return;
		let t = this.audit.slice(this.extractOffset);
		for (let e of t) {
			let t = {
				source: "demo-db",
				table: e.table,
				op: e.op,
				pk: e.pk,
				before: e.before,
				after: e.after,
				ts_ms: e.commit_ts_ms,
				tx: {
					id: e.tx_id,
					lsn: null,
					index: e.tx_index,
					total: e.tx_total,
					last: e.tx_last
				},
				seq: ++this.seq,
				meta: { method: "trigger" }
			};
			this.bus.emit(t);
		}
		this.extractOffset = this.audit.length, this.lastExtract = e;
	}
};
function i() {
	return Math.random().toString(36).slice(2);
}
//#endregion
//#region sim/engines/LogEngine.ts
var a = class extends t {
	constructor(...e) {
		super(...e), this.name = "log", this.table = /* @__PURE__ */ new Map(), this.wal = [], this.lsn = 0, this.fetchIntervalMs = 100, this.lastFetch = 0, this.opCounter = 0, this.walByOp = /* @__PURE__ */ new Map();
	}
	configure(e) {
		e.fetch_interval_ms !== void 0 && (this.fetchIntervalMs = e.fetch_interval_ms);
	}
	reset(e) {
		super.reset(e), this.table.clear(), this.wal = [], this.lsn = 0, this.lastFetch = 0, this.opCounter = 0, this.walByOp.clear();
	}
	applySourceOp(e) {
		let t = this.opCounter++;
		if (e.op === "redeliver") {
			let t = this.walByOp.get(e.ref);
			t && this.wal.push({
				...t,
				before: t.before ? { ...t.before } : null,
				after: t.after ? { ...t.after } : null,
				redelivered: !0
			});
			return;
		}
		let n = e.txn ?? {
			id: `tx-${e.t}`,
			index: 0,
			total: 1,
			last: !0
		}, r = n.id ?? `tx-${e.t}`, i = typeof n.index == "number" ? n.index : 0, a = typeof n.total == "number" ? n.total : 1, o = typeof n.last == "boolean" ? n.last : i >= a - 1;
		if (e.op === "insert") this.table.set(e.pk.id, {
			id: e.pk.id,
			table: e.table,
			data: e.after,
			version: 1,
			updated_at_ms: e.t,
			deleted: !1
		}), this.pushRecord(t, {
			lsn: ++this.lsn,
			tx_id: r,
			tx_index: i,
			tx_total: a,
			tx_last: o,
			table: e.table,
			op: "c",
			pk: e.pk,
			before: null,
			after: e.after,
			commit_ts_ms: e.ts_ms ?? e.t
		});
		else if (e.op === "update") {
			let n = this.table.get(e.pk.id), s = n ? { ...n.data } : null, c = n ? {
				...n.data,
				...e.after
			} : e.after;
			this.table.set(e.pk.id, {
				id: e.pk.id,
				table: n?.table ?? e.table,
				data: c,
				version: (n?.version ?? 0) + 1,
				updated_at_ms: e.t,
				deleted: !1
			}), this.pushRecord(t, {
				lsn: ++this.lsn,
				tx_id: r,
				tx_index: i,
				tx_total: a,
				tx_last: o,
				table: e.table,
				op: "u",
				pk: e.pk,
				before: s,
				after: c,
				commit_ts_ms: e.ts_ms ?? e.t
			});
		} else if (e.op === "delete") {
			let n = this.table.get(e.pk.id);
			this.table.delete(e.pk.id), this.pushRecord(t, {
				lsn: ++this.lsn,
				tx_id: r,
				tx_index: i,
				tx_total: a,
				tx_last: o,
				table: e.table,
				op: "d",
				pk: e.pk,
				before: n ? n.data : null,
				after: null,
				commit_ts_ms: e.ts_ms ?? e.t
			});
		}
	}
	pushRecord(e, t) {
		this.walByOp.set(e, t), this.wal.push(t);
	}
	tick(e) {
		if (e - this.lastFetch < this.fetchIntervalMs) return;
		let t = this.wal.slice(this.seq);
		for (let e of t) {
			let t = {
				source: "demo-db",
				table: e.table,
				op: e.op,
				pk: e.pk,
				before: e.before,
				after: e.after,
				ts_ms: e.commit_ts_ms,
				tx: {
					id: e.tx_id,
					lsn: e.lsn,
					index: e.tx_index,
					total: e.tx_total,
					last: e.tx_last
				},
				seq: ++this.seq,
				meta: { method: "log" },
				...e.redelivered ? { redelivered: !0 } : {}
			};
			this.bus.emit(t);
		}
		this.lastFetch = e;
	}
}, o = class {
	constructor() {
		this.scenario = null, this.engines = [], this.idx = 0, this.now = 0, this.playing = !1;
	}
	attach(e) {
		this.engines = e;
	}
	load(e) {
		this.scenario = e, this.idx = 0, this.now = 0, this.playing = !1;
	}
	reset(e) {
		this.engines.forEach((t) => t.reset(e)), this.idx = 0, this.now = 0;
	}
	onTick(e) {
		this.onTickCb = e;
	}
	start() {
		this.playing = !0;
	}
	pause() {
		this.playing = !1;
	}
	tick(e) {
		if (!this.playing || !this.scenario) return;
		this.now += e;
		let { ops: t } = this.scenario;
		for (; this.idx < t.length && t[this.idx].t <= this.now;) {
			let e = t[this.idx++];
			this.engines.forEach((t) => t.applySourceOp(e));
		}
		this.engines.forEach((e) => e.tick(this.now)), this.onTickCb?.(this.now);
	}
}, s = /* @__PURE__ */ new Set([
	"c",
	"u",
	"d"
]);
function c(e) {
	switch (e.op) {
		case "insert": return "c";
		case "update": return "u";
		case "delete": return "d";
		default: return null;
	}
}
function l(e) {
	return e.map((e, t) => {
		let n = c(e);
		if (!n) return null;
		let r = e.pk?.id == null ? "" : String(e.pk.id);
		return {
			key: `${n}::${r}`,
			op: n,
			pk: r,
			index: t,
			time: e.t
		};
	}).filter((e) => !!e);
}
function u(e) {
	return e.map((e, t) => {
		if (!s.has(e.op) || e.redelivered) return null;
		let n = e.pk?.id == null ? "" : String(e.pk.id), r = e.op;
		return {
			key: `${r}::${n}`,
			op: r,
			pk: n,
			index: t,
			time: e.ts_ms
		};
	}).filter((e) => !!e);
}
function d(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = t.get(n.key);
		e ? e.push(n) : t.set(n.key, [n]);
	}
	return t;
}
function f(e, t) {
	let n = [], r = [], i = [], a = d(e), o = d(t), s = /* @__PURE__ */ new Set([...a.keys(), ...o.keys()]);
	for (let e of s) {
		let t = a.get(e) ?? [], s = o.get(e) ?? [], c = Math.min(t.length, s.length);
		for (let e = 0; e < c; e++) {
			let r = t[e], i = s[e];
			n.push({
				expected: r,
				actual: i,
				lagMs: Math.max(0, i.time - r.time)
			});
		}
		for (let e = c; e < t.length; e++) r.push(t[e]);
		for (let e = c; e < s.length; e++) i.push(s[e]);
	}
	return {
		matched: n,
		missing: r,
		extra: i
	};
}
function p(e) {
	let t = [], n = [...e].sort((e, t) => e.actual.index - t.actual.index), r = -Infinity;
	for (let e of n) e.expected.index < r ? t.push({
		type: "ordering",
		op: e.expected.op,
		pk: e.expected.pk,
		expectedIndex: e.expected.index,
		actualIndex: e.actual.index,
		expectedTime: e.expected.time,
		actualTime: e.actual.time
	}) : r = e.expected.index;
	return t;
}
function m(e) {
	return e.filter((e) => e.lagMs > 0).sort((e, t) => t.lagMs - e.lagMs).slice(0, 5).map((e) => ({
		op: e.expected.op,
		pk: e.expected.pk,
		expectedTime: e.expected.time,
		actualTime: e.actual.time,
		lagMs: e.lagMs
	}));
}
function h(e, t, n) {
	let { matched: r, missing: i, extra: a } = f(l(t), u(n)), o = [];
	for (let e of i) o.push({
		type: "missing",
		op: e.op,
		pk: e.pk,
		expectedIndex: e.index,
		expectedTime: e.time
	});
	for (let e of a) o.push({
		type: "extra",
		op: e.op,
		pk: e.pk,
		actualIndex: e.index,
		actualTime: e.time
	});
	o.push(...p(r));
	let s = m(r), c = s.reduce((e, t) => Math.max(e, t.lagMs), 0);
	return {
		method: e,
		totals: {
			missing: o.filter((e) => e.type === "missing").length,
			extra: o.filter((e) => e.type === "extra").length,
			ordering: o.filter((e) => e.type === "ordering").length
		},
		issues: o,
		lag: {
			max: c,
			samples: s
		}
	};
}
function g(e, t) {
	return t.map((t) => h(t.method, e, t.events));
}
//#endregion
//#region sim/bundle.ts
var _ = {
	EventBus: e,
	PollingEngine: n,
	TriggerEngine: r,
	LogEngine: a,
	ScenarioRunner: o,
	diffLane: h,
	diffAllLanes: g
};
typeof window < "u" && (window.__LetstalkCdcSimulatorBundle = _);
//#endregion
export { e as EventBus, a as LogEngine, n as PollingEngine, o as ScenarioRunner, r as TriggerEngine, _ as default, g as diffAllLanes, h as diffLane };
