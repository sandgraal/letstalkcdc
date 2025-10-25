const doc = document;

const onReady = (cb) => {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
};

onReady(() => {
  const stepperBtn = doc.getElementById('failure-stepper');
  const idempotentBtn = doc.getElementById('idempotent-stepper');
  const diagramVisual = doc.getElementById('diagram-visual');
  if (!stepperBtn || !diagramVisual) return;

  const steps = [
    { id: 'step-1', icon: '📥', text: '1. Consume Message' },
    { id: 'step-2', icon: '💾', text: '2. Process & Write' },
    { id: 'step-3', icon: '💥', text: '3. CRASH!' },
    {
      id: 'step-4',
      icon: '🔄',
      text: '4. Restart & Re-process (Duplicate!)'
    }
  ];

  let currentStep = 0;

  stepperBtn.addEventListener('click', () => {
    const allSteps = doc.querySelectorAll('.step-diagram .step');
    if (currentStep >= steps.length) {
      currentStep = 0;
      allSteps.forEach((el) => el.classList.remove('active', 'completed'));
      diagramVisual.innerHTML = '<div class="icon">🎬</div><p>Ready to start</p>';
      stepperBtn.textContent = 'Start Animation';
      return;
    }

    if (currentStep > 0) {
      doc.getElementById(steps[currentStep - 1].id)?.classList.add('completed');
    }

    const current = doc.getElementById(steps[currentStep].id);
    if (current) {
      current.classList.add('active');
      current.classList.remove('completed');
    }

    diagramVisual.innerHTML = `<div class="icon">${steps[currentStep].icon}</div><p>${steps[currentStep].text}</p>`;
    stepperBtn.textContent = currentStep === steps.length - 1 ? 'Reset Animation' : 'Next Step';
    currentStep += 1;
  });

  idempotentBtn?.addEventListener('click', () => {
    doc.querySelectorAll('.step-diagram .step').forEach((el) => el.classList.remove('active', 'completed'));
    diagramVisual.innerHTML = '<div class="icon">🧮</div><p>Idempotent upsert: replay is a no-op</p>';

    const sequence = ['step-1', 'step-2'];
    let index = 0;
    const tick = () => {
      if (index < sequence.length) {
        const el = doc.getElementById(sequence[index]);
        if (el) {
          el.classList.add('active');
          if (index > 0) {
            doc.getElementById(sequence[index - 1])?.classList.add('completed');
          }
        }
        index += 1;
        setTimeout(tick, 600);
      } else {
        doc.getElementById('step-4')?.classList.add('active');
        diagramVisual.innerHTML = '<div class="icon">🧊</div><p>Replay hits same <code>event_id</code> → MERGE matches → 0 rows changed</p>';
      }
    };

    tick();
  });
});
