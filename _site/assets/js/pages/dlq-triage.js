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
  const cmd1 = $('#cmd1');
  const cmd2 = $('#cmd2');
  const cmd3 = $('#cmd3');
  const cmd4 = $('#cmd4');
  const cmd5 = $('#cmd5');
  if (!cmd1 || !cmd2 || !cmd3 || !cmd4 || !cmd5) return;

  const bootstrap = $('#bootstrap');
  const dlq = $('#dlq');
  const connector = $('#connector');
  const group = $('#group');

  const copy = (triggerSelector, sourceSelector) => {
    $(triggerSelector)?.addEventListener('click', async () => {
      const text = $(sourceSelector)?.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        const button = $(triggerSelector);
        if (!button) return;
        const label = button.textContent;
        button.textContent = 'copied!';
        setTimeout(() => {
          button.textContent = label;
        }, 1200);
      } catch (_) {
        const button = $(triggerSelector);
        if (!button) return;
        const label = button.textContent;
        button.textContent = 'error';
        setTimeout(() => {
          button.textContent = label;
        }, 1200);
      }
    });
  };

  ['#copy1', '#copy2', '#copy3', '#copy4', '#copy5'].forEach((selector, index) => {
    copy(selector, `#cmd${index + 1}`);
  });

  const update = () => {
    const b = (bootstrap?.value || 'localhost:29092').trim() || 'localhost:29092';
    const t = (dlq?.value || 'dlq.inventory').trim() || 'dlq.inventory';
    const c = (connector?.value || 'inventory-connector').trim() || 'inventory-connector';
    const g = (group?.value || 'my-sink').trim() || 'my-sink';

    cmd1.textContent = `# count a sample & show latest offsets\nkafka-run-class kafka.tools.GetOffsetShell \\\n  --broker-list ${b} --topic ${t} --time -1

# peek a few DLQ records (value only)\nkafka-console-consumer --bootstrap-server ${b} \\\n  --topic ${t} --from-beginning --timeout-ms 4000 \\\n  --max-messages 5 | jq -C .`;

    cmd2.textContent = `# show headers (kcat recommended)\nkcat -b ${b} -t ${t} -C -J -c 5 | jq -C .

# extract original payload if wrapped (common in Connect DLQs)\nkafka-console-consumer --bootstrap-server ${b} \\\n  --topic ${t} --from-beginning --timeout-ms 4000 --max-messages 5 \\\n  | jq -r '.original.value // .record.value // .value // .payload.original.value // .payload.record.value // empty' \\\n  | jq -C .`;

    cmd3.textContent = `curl -s http://localhost:8083/connectors | jq\ncurl -s http://localhost:8083/connectors/${c}/status | jq\n# restart connector (use sparingly)\ncurl -s -X POST http://localhost:8083/connectors/${c}/restart`;

    cmd4.textContent = `kafka-consumer-groups --bootstrap-server ${b} \\\n  --describe --group ${g}`;

    cmd5.textContent = `# re-drive DLQ values into a sandbox topic (no headers preserved)\nkafka-console-consumer --bootstrap-server ${b} \\\n  --topic ${t} --from-beginning --max-messages 100 \\\n  | jq -r '.original.value // .record.value // .value // .payload.original.value // .payload.record.value // empty' \\\n  | kafka-console-producer --bootstrap-server ${b} --topic sandbox.replay`;
  };

  ['input', 'change'].forEach((eventName) => {
    [bootstrap, dlq, connector, group].forEach((input) => {
      input?.addEventListener(eventName, update);
    });
  });

  update();
});
