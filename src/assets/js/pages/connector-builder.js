const doc = document;

const onReady = (cb) => {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
};

onReady(() => {
  const $ = (selector) => doc.querySelector(selector);
  const $$ = (selector) => Array.from(doc.querySelectorAll(selector));

  let src = 'postgres';

  $$('.tabs button').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.tabs button').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      src = button.dataset.src;
      renderSpecific();
      renderAll();
    });
  });

  const cname = $('#cname');
  const curl = $('#curl');
  const host = $('#host');
  const port = $('#port');
  const user = $('#user');
  const pass = $('#pass');
  const schemainc = $('#schemainc');
  const tableinc = $('#tableinc');
  const prefix = $('#prefix');
  const snap = $('#snap');
  const tomb = $('#tomb');
  const schchg = $('#schchg');
  const dlq = $('#dlq');
  const hb = $('#hb');
  const debz = $('#debz');
  const jsonEl = $('#json');
  const postEl = $('#post');
  const putEl = $('#put');
  const sp = $('#db-specific');
  const adv = $('#advanced');

  if (!cname || !curl || !host || !port || !user || !pass || !sp || !adv) {
    return;
  }

  const csv = (value) => value.split(',').map((token) => token.trim()).filter(Boolean).join(',');

  const renderSpecific = () => {
    if (src === 'postgres') {
      sp.innerHTML = `
        <div class="row"><label>database:</label><input id="dbname" type="text" value="postgres"></div>
        <div class="row"><label>slot name:</label><input id="slot" type="text" value="cdc_slot"></div>
        <div class="row"><label>publication mode:</label>
          <select id="pubmode">
            <option value="filtered" selected>filtered (auto)</option>
            <option value="all_tables">all_tables (auto)</option>
            <option value="disabled">disabled (manual)</option>
          </select>
        </div>`;
      adv.innerHTML = `
        <div class="row"><label>decimal handling:</label>
          <select id="decimal"><option>string</option><option>precise</option><option>double</option></select>
        </div>`;
    } else if (src === 'mysql') {
      sp.innerHTML = `
        <div class="row"><label>server id:</label><input id="serverid" type="text" value="5400"></div>`;
      adv.innerHTML = `
        <div class="row"><label>time.precision.mode:</label>
          <select id="timeprec"><option>connect</option><option>adaptive</option></select>
        </div>`;
      if (port.value === '5432') port.value = '3306';
      if (host.value === 'pg') host.value = 'mysql';
    } else if (src === 'oracle') {
      sp.innerHTML = `
        <div class="row"><label>service (CDB):</label><input id="dbname" type="text" value="ORCLCDB"></div>
        <div class="row"><label>PDB name:</label><input id="pdb" type="text" value="ORCLPDB1"></div>`;
      adv.innerHTML = `
        <div class="row"><label>log mining:</label>
          <select id="logmin"><option value="online_catalog">online_catalog</option><option value="redo_log_catalog">redo_log_catalog</option></select>
        </div>`;
      if (port.value === '5432') port.value = '1521';
      if (host.value === 'pg') host.value = 'oracle';
    }
  };

  const buildConfig = () => {
    const v2 = debz.value === '2';
    const base = {
      'tombstones.on.delete': tomb.checked ? 'false' : 'true',
      'include.schema.changes': schchg.checked ? 'false' : 'true',
      'heartbeat.interval.ms': hb.value || '5000',
      'snapshot.mode': snap.value || 'initial'
    };

    if (v2) {
      base['topic.prefix'] = prefix.value || 'server1';
    } else {
      base['database.server.name'] = prefix.value || 'server1';
    }

    if (schemainc.value) base['schema.include.list'] = csv(schemainc.value);
    if (tableinc.value) base['table.include.list'] = csv(tableinc.value);
    if (dlq.value) {
      base['errors.tolerance'] = 'all';
      base['errors.deadletterqueue.topic.name'] = dlq.value.trim();
    }

    if (src === 'postgres') {
      Object.assign(base, {
        'connector.class': 'io.debezium.connector.postgresql.PostgresConnector',
        'database.hostname': host.value,
        'database.port': port.value,
        'database.user': user.value,
        'database.password': pass.value,
        'database.dbname': $('#dbname')?.value || 'postgres',
        'slot.name': $('#slot')?.value || 'cdc_slot',
        'publication.autocreate.mode': $('#pubmode')?.value || 'filtered',
        'decimal.handling.mode': $('#decimal')?.value || 'string'
      });
    } else if (src === 'mysql') {
      Object.assign(base, {
        'connector.class': 'io.debezium.connector.mysql.MySqlConnector',
        'database.hostname': host.value,
        'database.port': port.value,
        'database.user': user.value,
        'database.password': pass.value,
        'database.server.id': $('#serverid')?.value || '5400'
      });
    } else if (src === 'oracle') {
      Object.assign(base, {
        'connector.class': 'io.debezium.connector.oracle.OracleConnector',
        'database.hostname': host.value,
        'database.port': port.value,
        'database.user': user.value,
        'database.password': pass.value,
        'database.dbname': $('#dbname')?.value || 'ORCLCDB',
        'database.pdb.name': $('#pdb')?.value || 'ORCLPDB1',
        'log.mining.strategy': $('#logmin')?.value || 'online_catalog'
      });
    }

    return base;
  };

  const renderAll = () => {
    const cfg = buildConfig();
    const name = cname.value || 'inventory-connector';
    const endpoint = (curl.value || '').replace(/\/$/, '');

    jsonEl.textContent = JSON.stringify({ name, config: cfg }, null, 2);

    const post = [
      `curl -s -X POST ${endpoint}/connectors \\\\`,
      `  -H 'content-type: application/json' \\\\`,
      `  -d '${JSON.stringify({ name, config: cfg }).replace(/'/g, "'\\\\''")}' | jq .`
    ].join('\n');
    postEl.textContent = post;

    const put = [
      `curl -s -X PUT ${endpoint}/connectors/${name}/config \\\\`,
      `  -H 'content-type: application/json' \\\\`,
      `  -d '${JSON.stringify(cfg).replace(/'/g, "'\\\\''")}' | jq .`
    ].join('\n');
    putEl.textContent = put;
  };

  const copy = (text, selector) => {
    navigator.clipboard.writeText(text).then(() => {
      const button = doc.querySelector(selector);
      if (!button) return;
      const label = button.textContent;
      button.textContent = 'copied!';
      setTimeout(() => {
        button.textContent = label;
      }, 1200);
    }).catch(() => {
      const button = doc.querySelector(selector);
      if (!button) return;
      const label = button.textContent;
      button.textContent = 'error';
      setTimeout(() => {
        button.textContent = label;
      }, 1200);
    });
  };

  $('#copyJson')?.addEventListener('click', () => copy(jsonEl.textContent, '#copyJson'));
  $('#copyPost')?.addEventListener('click', () => copy(postEl.textContent, '#copyPost'));
  $('#copyPut')?.addEventListener('click', () => copy(putEl.textContent, '#copyPut'));
  $('#dlJson')?.addEventListener('click', () => {
    const blob = new Blob([jsonEl.textContent], { type: 'application/json' });
    const link = doc.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${($('#cname')?.value || 'connector')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  ['input', 'change'].forEach((eventName) => {
    [cname, curl, host, port, user, pass, schemainc, tableinc, prefix, snap, tomb, schchg, dlq, hb, debz]
      .filter(Boolean)
      .forEach((element) => element.addEventListener(eventName, renderAll));
  });

  renderSpecific();
  renderAll();
});
