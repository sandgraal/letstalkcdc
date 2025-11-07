/**
 * CDC Pipeline Simulation Widget
 * Interactive visualization of Change Data Capture flow
 */

const doc = document;

// Helper to check if element exists
const exists = (selector) => doc.querySelector(selector) !== null;

// Wait for DOM ready
const onReady = (cb) => {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
};

// Simulation state
const state = {
  isRunning: false,
  mode: 'streaming', // 'streaming' or 'batch'
  records: [],
  nextId: 1,
  eventQueue: [],
};

// Sample data for simulation
const sampleProducts = [
  { id: 101, name: 'Widget Pro', price: 29.99, stock: 50 },
  { id: 102, name: 'Gadget Max', price: 49.99, stock: 30 },
  { id: 103, name: 'Tool Elite', price: 19.99, stock: 100 },
];

// Generate random operation
function generateRandomEvent() {
  const ops = ['insert', 'update', 'delete'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  
  if (op === 'insert') {
    const product = sampleProducts[Math.floor(Math.random() * sampleProducts.length)];
    return {
      op: 'INSERT',
      table: 'products',
      after: { ...product, id: state.nextId++ },
      timestamp: Date.now(),
    };
  } else if (op === 'update' && state.records.length > 0) {
    const record = state.records[Math.floor(Math.random() * state.records.length)];
    return {
      op: 'UPDATE',
      table: 'products',
      before: { ...record },
      after: { ...record, stock: record.stock + Math.floor(Math.random() * 20) - 10 },
      timestamp: Date.now(),
    };
  } else if (op === 'delete' && state.records.length > 0) {
    const record = state.records[Math.floor(Math.random() * state.records.length)];
    return {
      op: 'DELETE',
      table: 'products',
      before: { ...record },
      timestamp: Date.now(),
    };
  }
  
  // Fallback to insert if delete/update not possible
  const product = sampleProducts[Math.floor(Math.random() * sampleProducts.length)];
  return {
    op: 'INSERT',
    table: 'products',
    after: { ...product, id: state.nextId++ },
    timestamp: Date.now(),
  };
}

// Create event element
function createEventElement(event) {
  const el = doc.createElement('div');
  el.className = 'cdc-event';
  el.dataset.op = event.op.toLowerCase();
  
  const opIcon = {
    INSERT: '➕',
    UPDATE: '🔄',
    DELETE: '❌',
  }[event.op] || '•';
  
  const recordId = (event.after || event.before)?.id || '?';
  el.innerHTML = `
    <span class="event-icon">${opIcon}</span>
    <span class="event-op">${event.op}</span>
    <span class="event-id">#${recordId}</span>
  `;
  
  return el;
}

// Animate event through pipeline
async function animateEvent(event) {
  const stages = [
    { id: 'source-db', label: 'Source DB', duration: 300 },
    { id: 'cdc-connector', label: 'CDC Connector', duration: 400 },
    { id: 'message-broker', label: 'Message Broker', duration: 500 },
    { id: 'target-sink', label: 'Target Sink', duration: 300 },
  ];
  
  const eventEl = createEventElement(event);
  
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const stageEl = doc.getElementById(stage.id);
    
    if (!stageEl) continue;
    
    const eventList = stageEl.querySelector('.stage-events');
    if (eventList) {
      eventList.appendChild(eventEl);
      
      // Add active state
      stageEl.classList.add('active');
      
      // Wait for duration
      await new Promise(resolve => setTimeout(resolve, stage.duration));
      
      // Remove active state
      stageEl.classList.remove('active');
      
      // Move to next stage (remove from current)
      if (i < stages.length - 1) {
        eventEl.remove();
      } else {
        // At final stage, apply the operation
        applyEvent(event);
        
        // Keep for a bit then fade out
        setTimeout(() => {
          eventEl.style.opacity = '0';
          setTimeout(() => eventEl.remove(), 300);
        }, 1000);
      }
    }
  }
  
  updateStats();
}

// Apply event to records
function applyEvent(event) {
  if (event.op === 'INSERT' && event.after) {
    state.records.push(event.after);
  } else if (event.op === 'UPDATE' && event.after) {
    const idx = state.records.findIndex(r => r.id === event.after.id);
    if (idx >= 0) {
      state.records[idx] = event.after;
    }
  } else if (event.op === 'DELETE' && event.before) {
    const idx = state.records.findIndex(r => r.id === event.before.id);
    if (idx >= 0) {
      state.records.splice(idx, 1);
    }
  }
  
  updateRecordsDisplay();
}

// Update stats display
function updateStats() {
  const statsEl = doc.getElementById('cdc-stats');
  if (!statsEl) return;
  
  const totalEvents = state.eventQueue.length;
  const recordCount = state.records.length;
  
  statsEl.innerHTML = `
    <div class="stat-item">
      <span class="stat-label">Total Events:</span>
      <span class="stat-value">${totalEvents}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Current Records:</span>
      <span class="stat-value">${recordCount}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Mode:</span>
      <span class="stat-value">${state.mode}</span>
    </div>
  `;
}

// Update records display
function updateRecordsDisplay() {
  const recordsEl = doc.getElementById('cdc-records');
  if (!recordsEl) return;
  
  if (state.records.length === 0) {
    recordsEl.innerHTML = '<div class="no-records">No records yet</div>';
    return;
  }
  
  recordsEl.innerHTML = state.records
    .slice(-5) // Show last 5
    .map(record => `
      <div class="record-item">
        <span class="record-id">#${record.id}</span>
        <span class="record-name">${record.name || 'Unknown'}</span>
        <span class="record-price">$${record.price?.toFixed(2) || '0.00'}</span>
      </div>
    `)
    .join('');
}

// Process event queue
async function processQueue() {
  if (state.eventQueue.length === 0 || !state.isRunning) {
    state.isRunning = false;
    return;
  }
  
  const event = state.eventQueue.shift();
  await animateEvent(event);
  
  // Continue processing
  if (state.isRunning) {
    const delay = state.mode === 'batch' ? 200 : 800;
    setTimeout(() => processQueue(), delay);
  }
}

// Initialize simulation
function initSimulation() {
  const container = doc.getElementById('cdc-simulation');
  if (!container) return;
  
  // Insert event button
  const insertBtn = doc.getElementById('sim-insert');
  if (insertBtn) {
    insertBtn.addEventListener('click', () => {
      const event = { ...generateRandomEvent(), op: 'INSERT' };
      state.eventQueue.push(event);
      if (!state.isRunning) {
        state.isRunning = true;
        processQueue();
      }
    });
  }
  
  // Update event button
  const updateBtn = doc.getElementById('sim-update');
  if (updateBtn) {
    updateBtn.addEventListener('click', () => {
      if (state.records.length === 0) {
        alert('Add some records first using INSERT');
        return;
      }
      const event = generateRandomEvent();
      event.op = 'UPDATE';
      state.eventQueue.push(event);
      if (!state.isRunning) {
        state.isRunning = true;
        processQueue();
      }
    });
  }
  
  // Delete event button
  const deleteBtn = doc.getElementById('sim-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (state.records.length === 0) {
        alert('Add some records first using INSERT');
        return;
      }
      const event = generateRandomEvent();
      event.op = 'DELETE';
      state.eventQueue.push(event);
      if (!state.isRunning) {
        state.isRunning = true;
        processQueue();
      }
    });
  }
  
  // Auto-generate button
  const autoBtn = doc.getElementById('sim-auto');
  if (autoBtn) {
    let autoInterval = null;
    autoBtn.addEventListener('click', () => {
      if (autoInterval) {
        clearInterval(autoInterval);
        autoInterval = null;
        autoBtn.textContent = 'Auto-Generate Events';
        autoBtn.classList.remove('active');
      } else {
        autoBtn.textContent = 'Stop Auto-Generate';
        autoBtn.classList.add('active');
        autoInterval = setInterval(() => {
          const event = generateRandomEvent();
          state.eventQueue.push(event);
          if (!state.isRunning) {
            state.isRunning = true;
            processQueue();
          }
        }, 2000);
      }
    });
  }
  
  // Mode toggle
  const modeToggle = doc.getElementById('sim-mode-toggle');
  if (modeToggle) {
    modeToggle.addEventListener('change', (e) => {
      state.mode = e.target.checked ? 'batch' : 'streaming';
      updateStats();
    });
  }
  
  // Reset button
  const resetBtn = doc.getElementById('sim-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.records = [];
      state.eventQueue = [];
      state.nextId = 1;
      state.isRunning = false;
      
      // Clear all event displays
      doc.querySelectorAll('.stage-events').forEach(el => {
        el.innerHTML = '';
      });
      
      updateStats();
      updateRecordsDisplay();
    });
  }
  
  // Initialize displays
  updateStats();
  updateRecordsDisplay();
}

// Initialize on load
onReady(initSimulation);
