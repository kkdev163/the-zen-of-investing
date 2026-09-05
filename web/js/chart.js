function niceStep(value) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export class TrajectoryChart {
  constructor(canvas, tooltip, { formatMoney, formatMonth }) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.tooltip = tooltip;
    this.formatMoney = formatMoney;
    this.formatMonth = formatMonth;
    this.points = [];
    this.series = [];
    this.scale = 'linear';
    this.plot = null;
    this.hoverIndex = null;

    this.handlePointer = this.handlePointer.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    canvas.addEventListener('pointermove', this.handlePointer);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas.parentElement);
  }

  setData({ points, series, scale }) {
    this.points = points;
    this.series = series;
    this.scale = scale;
    this.hoverIndex = null;
    this.tooltip.hidden = true;
    this.draw();
  }

  setupCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * pixelRatio);
    this.canvas.height = Math.round(rect.height * pixelRatio);
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    return rect;
  }

  draw() {
    if (!this.points.length || !this.series.length) return;
    const rect = this.setupCanvas();
    const compact = rect.width < 620;
    const padding = { top: 16, right: compact ? 12 : 24, bottom: 42, left: compact ? 62 : 78 };
    const width = rect.width - padding.left - padding.right;
    const height = rect.height - padding.top - padding.bottom;
    const values = this.points.flatMap((point) => this.series.map((item) => point[item.key]));
    const rawMax = Math.max(0, ...values);
    const rawMin = Math.min(0, ...values);
    const paddedMax = rawMax * 1.04;
    const paddedMin = rawMin * 1.04;
    const tickStep = niceStep((paddedMax - paddedMin) / 5);
    const yMax = Math.max(tickStep, Math.ceil(paddedMax / tickStep) * tickStep);
    const yMin = Math.min(0, Math.floor(paddedMin / tickStep) * tickStep);
    const symlogConstant = 10_000;

    const xFor = (month) => padding.left + month / 360 * width;
    const transform = (number) => Math.sign(number) * Math.log10(1 + Math.abs(number) / symlogConstant);
    const yFor = this.scale === 'log'
      ? (value) => {
          const minLog = transform(yMin);
          const maxLog = transform(yMax);
          return padding.top + height - (transform(value) - minLog) / (maxLog - minLog) * height;
        }
      : (value) => padding.top + height - (value - yMin) / (yMax - yMin) * height;

    this.plot = { ...padding, width, height, xFor, yFor };
    const context = this.context;
    context.clearRect(0, 0, rect.width, rect.height);
    context.font = `${compact ? 10 : 11}px "SFMono-Regular", Menlo, monospace`;
    context.textBaseline = 'middle';

    const logarithmicTicks = [10_000, 100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000];
    const gridValues = this.scale === 'log'
      ? [...logarithmicTicks.map((value) => -value).reverse(), 0, ...logarithmicTicks]
          .filter((value) => value >= yMin && value <= yMax)
      : Array.from(
          { length: Math.round((yMax - yMin) / tickStep) + 1 },
          (_, index) => yMin + tickStep * index
        );

    gridValues.forEach((value) => {
      const y = yFor(value);
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(padding.left + width, y);
      context.strokeStyle = value === 0 ? 'rgba(27, 35, 33, .28)' : 'rgba(27, 35, 33, .09)';
      context.lineWidth = value === 0 ? 1.4 : 1;
      context.stroke();
      context.fillStyle = '#727a76';
      context.textAlign = 'right';
      context.fillText(this.formatMoney(value, true), padding.left - 11, y);
    });

    const yearStep = compact ? 10 : 5;
    for (let year = 0; year <= 30; year += yearStep) {
      const x = xFor(year * 12);
      context.fillStyle = '#727a76';
      context.textAlign = year === 0 ? 'left' : year === 30 ? 'right' : 'center';
      context.fillText(String(2026 + year), x, padding.top + height + 25);
    }

    this.series.forEach((item) => this.drawSeries(item));
    if (this.hoverIndex !== null) this.drawHover(this.points[this.hoverIndex]);
  }

  drawSeries(series) {
    const { xFor, yFor, top, height } = this.plot;
    const context = this.context;
    const trace = () => {
      context.beginPath();
      this.points.forEach((point, index) => {
        const x = xFor(point.month);
        const y = yFor(point[series.key]);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
    };

    trace();
    if (series.fill) {
      const gradient = context.createLinearGradient(0, top, 0, top + height);
      gradient.addColorStop(0, series.fill);
      gradient.addColorStop(1, 'rgba(19, 121, 105, 0)');
      context.lineTo(xFor(360), yFor(0));
      context.lineTo(xFor(0), yFor(0));
      context.closePath();
      context.fillStyle = gradient;
      context.fill();
      trace();
    }

    context.strokeStyle = series.color;
    context.lineWidth = 2.7;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.stroke();
  }

  drawHover(point) {
    const { xFor, yFor, top, height } = this.plot;
    const context = this.context;
    const x = xFor(point.month);
    context.save();
    context.setLineDash([4, 5]);
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, top + height);
    context.strokeStyle = 'rgba(27, 35, 33, .36)';
    context.lineWidth = 1;
    context.stroke();
    context.setLineDash([]);

    this.series.forEach((series) => {
      context.beginPath();
      context.arc(x, yFor(point[series.key]), 4.5, 0, Math.PI * 2);
      context.fillStyle = '#fff';
      context.fill();
      context.lineWidth = 2.5;
      context.strokeStyle = series.color;
      context.stroke();
    });
    context.restore();
  }

  handlePointer(event) {
    if (!this.plot) return;
    const rect = this.canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    if (localX < this.plot.left || localX > this.plot.left + this.plot.width) {
      this.handlePointerLeave();
      return;
    }

    this.hoverIndex = Math.max(0, Math.min(
      this.points.length - 1,
      Math.round((localX - this.plot.left) / this.plot.width * (this.points.length - 1))
    ));
    const point = this.points[this.hoverIndex];
    this.tooltip.replaceChildren();
    const date = document.createElement('time');
    date.textContent = this.formatMonth(point.month);
    this.tooltip.append(date);
    this.series.forEach((series) => {
      const row = document.createElement('div');
      row.className = 'tooltip-row';
      row.style.setProperty('--series-color', series.color);
      const label = document.createElement('span');
      label.textContent = series.label;
      const value = document.createElement('b');
      value.textContent = this.formatMoney(point[series.key]);
      row.append(label, value);
      this.tooltip.append(row);
    });

    this.tooltip.hidden = false;
    const tooltipWidth = this.tooltip.offsetWidth;
    const tooltipHeight = this.tooltip.offsetHeight;
    let left = localX + 15;
    if (left + tooltipWidth > rect.width) left = localX - tooltipWidth - 15;
    const top = Math.max(8, Math.min(rect.height - tooltipHeight - 8, event.clientY - rect.top - tooltipHeight / 2));
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
    this.draw();
  }

  handlePointerLeave() {
    if (this.hoverIndex === null) return;
    this.hoverIndex = null;
    this.tooltip.hidden = true;
    this.draw();
  }
}
