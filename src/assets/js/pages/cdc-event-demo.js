/**
 * Live change-event visualizer (Phase 4c).
 * Edit a mock `customer` table — every insert / update / delete emits a
 * Debezium-style change event (op, ts_ms, source.lsn, before, after) so
 * readers see the actual artifact CDC produces. Progressive enhancement:
 * if the markup isn't present the module is a no-op.
 */

const doc = document;

const onReady = (cb) => {
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", cb, { once: true });
  } else {
    cb();
  }
};

const TIERS = ["free", "pro", "enterprise"];
const NAMES = ["Ada", "Grace", "Linus", "Margaret", "Alan", "Radia", "Ken"];
const esc = (s) =>
  String(s).replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
  );

onReady(() => {
  const root = doc.getElementById("cdc-event-demo");
  if (!root) return;

  const tbody = root.querySelector("[data-ced-tbody]");
  const eventEl = root.querySelector("[data-ced-event]");
  const opBadge = root.querySelector("[data-ced-op-badge]");
  const lsnEl = root.querySelector("[data-ced-lsn]");
  const insertBtn = root.querySelector("[data-ced-insert]");
  const resetBtn = root.querySelector("[data-ced-reset]");
  if (!tbody || !eventEl || !opBadge || !lsnEl) return;

  let seq = 0; // drives a fake-but-monotonic LSN
  let nextId = 1;
  let rows = [];

  const lsn = () => {
    // A plausible-looking, strictly increasing WAL LSN ("0/1A2B3C0").
    const n = 0x1a2b3c0 + seq * 0xd8;
    return "0/" + n.toString(16).toUpperCase();
  };

  const seed = () => {
    seq = 0;
    nextId = 1;
    rows = [
      { id: nextId++, name: "Ada", tier: "free" },
      { id: nextId++, name: "Grace", tier: "pro" },
    ];
  };

  const renderTable = () => {
    tbody.innerHTML = rows
      .map(
        (r) => `
      <tr data-id="${r.id}">
        <td class="ced-mono">${r.id}</td>
        <td>${esc(r.name)}</td>
        <td><span class="ced-tier ced-tier--${r.tier}">${r.tier}</span></td>
        <td class="ced-row-actions">
          <button type="button" class="ced-rowbtn" data-ced-update="${r.id}" aria-label="Update ${esc(r.name)}'s tier">update</button>
          <button type="button" class="ced-rowbtn ced-rowbtn--del" data-ced-delete="${r.id}" aria-label="Delete ${esc(r.name)}">delete</button>
        </td>
      </tr>`,
      )
      .join("");
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="ced-empty">Table is empty — insert a row to emit a <code>c</code> (create) event.</td></tr>`;
    }
  };

  const OP_LABEL = { c: "c · create", u: "u · update", d: "d · delete" };

  const emit = (op, before, after) => {
    seq += 1;
    opBadge.textContent = OP_LABEL[op];
    opBadge.className = "ced-op-badge ced-op-badge--" + op;
    lsnEl.textContent = lsn();

    const envelope = {
      op,
      ts_ms: 1724130000000 + seq * 137,
      source: { db: "shop", table: "customer", lsn: lsn() },
      before: before || null,
      after: after || null,
    };
    // Pretty-print with op-coloured before/after so the diff reads at a glance.
    const json = JSON.stringify(envelope, null, 2);
    eventEl.innerHTML = esc(json)
      .replace(
        /(&quot;op&quot;: &quot;)(\w)/,
        `$1<span class="ced-j-op ced-j-op--${op}">$2`,
      )
      .replace(
        /(&quot;(?:before|after|source|ts_ms|op|lsn|db|table)&quot;)/g,
        '<span class="ced-j-key">$1</span>',
      );
  };

  const insert = () => {
    const name = NAMES[nextId % NAMES.length];
    const row = { id: nextId++, name, tier: "free" };
    rows.push(row);
    renderTable();
    emit("c", null, { id: row.id, name: row.name, tier: row.tier });
  };

  const update = (id) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    const before = { id: r.id, name: r.name, tier: r.tier };
    r.tier = TIERS[(TIERS.indexOf(r.tier) + 1) % TIERS.length];
    renderTable();
    emit("u", before, { id: r.id, name: r.name, tier: r.tier });
  };

  const del = (id) => {
    const idx = rows.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const r = rows[idx];
    rows.splice(idx, 1);
    renderTable();
    emit("d", { id: r.id, name: r.name, tier: r.tier }, null);
  };

  tbody.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.cedUpdate) update(Number(t.dataset.cedUpdate));
    else if (t.dataset.cedDelete) del(Number(t.dataset.cedDelete));
  });
  if (insertBtn) insertBtn.addEventListener("click", insert);
  if (resetBtn)
    resetBtn.addEventListener("click", () => {
      seed();
      renderTable();
      opBadge.textContent = "waiting…";
      opBadge.className = "ced-op-badge";
      lsnEl.textContent = "0/0";
      eventEl.innerHTML = `<span class="ced-j-comment"># Edit the table to emit a change event.</span>`;
    });

  seed();
  renderTable();
  lsnEl.textContent = "0/0";
  eventEl.innerHTML = `<span class="ced-j-comment"># Edit the table to emit a change event.</span>`;
});
