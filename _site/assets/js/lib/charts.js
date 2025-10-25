export const getDevicePixelRatio = () => {
  if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
    return window.devicePixelRatio;
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.devicePixelRatio === 'number') {
    return globalThis.devicePixelRatio;
  }
  return 1;
};

export const prepareCanvas = (canvas, height = 280) => {
  const ctx = canvas.getContext('2d');
  const parentWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || 640;
  const dpr = getDevicePixelRatio();
  canvas.width = parentWidth * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, parentWidth, height);
  return { ctx, width: parentWidth, height };
};

export const drawRoundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

export const drawBarChart = (canvas, values, labels, palette) => {
  const { ctx, width, height } = prepareCanvas(canvas);
  const padding = 32;
  const barGap = 24;
  const axisY = height - padding;
  const chartHeight = axisY - padding;

  const maxValue = Math.max(...values, 1);
  const count = values.length;
  const totalGap = barGap * Math.max(0, count - 1);
  const barWidth = Math.max(24, (width - padding * 2 - totalGap) / count);

  ctx.strokeStyle = palette.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, axisY + 0.5);
  ctx.lineTo(width - padding + 0.5, axisY + 0.5);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = palette.text;
  ctx.font = '600 13px var(--font-sans, system-ui)';

  const barColors = Array.isArray(palette.bars) && palette.bars.length > 0
    ? palette.bars
    : [
        { soft: 'rgba(14, 165, 233, 0.35)', strong: 'rgba(14, 165, 233, 0.95)' }
      ];

  values.forEach((value, index) => {
    const x = padding + index * (barWidth + barGap);
    const barHeight = (value / maxValue) * chartHeight;
    const y = axisY - barHeight;

    const gradient = ctx.createLinearGradient(0, y, 0, axisY);
    const colors = barColors[index % barColors.length];
    gradient.addColorStop(0, colors.strong);
    gradient.addColorStop(1, colors.soft);

    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, x, y, barWidth, barHeight, 8);
    ctx.fill();

    ctx.fillStyle = palette.textStrong;
    ctx.font = '600 14px var(--font-sans, system-ui)';
    ctx.fillText(Math.round(value), x + barWidth / 2, y - 22);

    ctx.fillStyle = palette.text;
    ctx.font = '500 13px var(--font-sans, system-ui)';
    ctx.fillText(labels[index], x + barWidth / 2, axisY + 8);
  });

  ctx.fillStyle = palette.textMuted;
  ctx.font = '500 12px var(--font-sans, system-ui)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const steps = 4;
  for (let i = 0; i <= steps; i += 1) {
    const value = (maxValue / steps) * i;
    const y = axisY - (value / maxValue) * chartHeight;
    ctx.beginPath();
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.moveTo(padding, y + 0.5);
    ctx.lineTo(width - padding, y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(Math.round(value), padding - 10, y);
  }
};

export const toRgba = (hex, alpha) => {
  const value = hex.replace('#', '').trim();
  const expanded = value.length === 3
    ? value.split('').map((ch) => ch + ch).join('')
    : value.padEnd(6, '0');
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const paddingLeft = (width) => Math.max(32, width * 0.1);

export const drawRadarChart = (canvas, { labels, datasets, palette, height = 420 }) => {
  const { ctx, width } = prepareCanvas(canvas, height);
  const centerX = width / 2;
  const topPadding = 36;
  const radius = Math.min(width, height - 90) / 2 - topPadding;
  const axes = labels.length;
  const steps = 5;

  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.font = '500 13px var(--font-sans, system-ui)';
  ctx.fillStyle = palette.text;

  for (let step = 1; step <= steps; step += 1) {
    const stepRadius = (radius * step) / steps;
    ctx.beginPath();
    for (let i = 0; i < axes; i += 1) {
      const angle = (Math.PI * 2 * i) / axes - Math.PI / 2;
      const x = centerX + Math.cos(angle) * stepRadius;
      const y = topPadding + radius + Math.sin(angle) * stepRadius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.4;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (let i = 0; i < axes; i += 1) {
    const angle = (Math.PI * 2 * i) / axes - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = topPadding + radius + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(centerX, topPadding + radius);
    ctx.lineTo(x, y);
    ctx.strokeStyle = palette.axis;
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = angle > Math.PI / 2 || angle < -Math.PI / 2 ? 'bottom' : 'top';
    ctx.fillStyle = palette.text;
    ctx.font = '600 13px var(--font-sans, system-ui)';
    ctx.fillText(labels[i], 0, angle > Math.PI / 2 || angle < -Math.PI / 2 ? -12 : 12);
    ctx.restore();
  }

  datasets.forEach((dataset) => {
    ctx.beginPath();
    dataset.data.forEach((value, index) => {
      const angle = (Math.PI * 2 * index) / axes - Math.PI / 2;
      const distance = (Math.max(0, Math.min(5, value)) / 5) * radius;
      const x = centerX + Math.cos(angle) * distance;
      const y = topPadding + radius + Math.sin(angle) * distance;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = toRgba(dataset.color, dataset.fillAlpha);
    ctx.strokeStyle = dataset.color;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    dataset.data.forEach((value, index) => {
      const angle = (Math.PI * 2 * index) / axes - Math.PI / 2;
      const distance = (Math.max(0, Math.min(5, value)) / 5) * radius;
      const x = centerX + Math.cos(angle) * distance;
      const y = topPadding + radius + Math.sin(angle) * distance;
      ctx.beginPath();
      ctx.fillStyle = palette.background;
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dataset.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '500 13px var(--font-sans, system-ui)';
  ctx.fillStyle = palette.text;

  const legendX = paddingLeft(width);
  const legendYStart = height - 60;
  const legendGap = 20;

  datasets.forEach((dataset, index) => {
    const y = legendYStart + index * legendGap;
    ctx.fillStyle = toRgba(dataset.color, dataset.fillAlpha);
    ctx.fillRect(legendX, y - 6, 18, 18);
    ctx.strokeStyle = dataset.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(legendX, y - 6, 18, 18);
    ctx.fillStyle = palette.text;
    ctx.fillText(dataset.label, legendX + 28, y + 3);
  });
};
