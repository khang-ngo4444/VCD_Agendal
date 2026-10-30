// Insights › Last 30 days (views/insights.ejs, Figma W14 v2), drawn with Chart.js (served from /js/vendor).
// - Bars or lines: the switch redraws at once and saves the choice to the account in the background.
// - The legend buttons show or hide a series.
// - One tooltip per day with both numbers; the day under the pointer is shaded; ← → / Home / End read day by day.
// Without this script (or if Chart.js didn't load) the plain server-drawn bars stay; the table is always there.

(() => {
  if (window.agendalInsights) return;
  window.agendalInsights = true;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const csrfToken = () => document.querySelector('input[name=_csrf]')?.value ?? '';
  const TICKS = new Set([0, 10, 20, 29]); // first day, two in between, today
  const SELECTED = ['bg-base-100', 'shadow-sm'];
  const UNSELECTED = ['text-muted', 'hover:text-base-content'];

  // The theme's colours (light / dark, accent) as the page draws them.
  function palette(el) {
    const css = getComputedStyle(el);
    const v = (name) => css.getPropertyValue(name).trim();
    const muted = el.querySelector('.text-muted') ?? el; // axis labels in the page's muted text colour
    return { tasks: v('--color-primary'), checkIns: v('--color-success'), text: v('--color-base-content'), surface: v('--color-base-100'), grid: v('--color-base-300'), muted: getComputedStyle(muted).color };
  }

  // Shades the hovered (or keyboard-selected) day behind the bars or points.
  const dayShade = {
    id: 'dayShade',
    beforeDatasetsDraw(chart) {
      const active = chart.tooltip?.getActiveElements?.() ?? [];
      if (!active.length) return;
      const { ctx, chartArea, scales } = chart;
      const step = scales.x.width / chart.data.labels.length;
      const x = scales.x.getPixelForValue(active[0].index) - step / 2;
      ctx.save();
      ctx.fillStyle = chart.options.plugins.dayShade.color;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.roundRect(x + 2, chartArea.top, step - 4, chartArea.bottom - chartArea.top, 6);
      ctx.fill();
      ctx.restore();
    },
  };

  function datasetStyle(type, colour, surface) {
    return type === 'line'
      ? { borderColor: colour, backgroundColor: colour, borderWidth: 2.5, tension: 0.35, fill: false, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: surface, pointBorderColor: colour, pointBorderWidth: 2, pointHoverBorderWidth: 2 }
      : { backgroundColor: colour, hoverBackgroundColor: colour, borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 12, categoryPercentage: 0.7, barPercentage: 0.85 };
  }

  function draw(section, type, hidden) {
    const data = JSON.parse(section.querySelector('#trend-data').textContent);
    const canvas = section.querySelector('#trend-chart');
    Chart.getChart(canvas)?.destroy();
    const c = palette(section);
    const series = [
      { label: 'Tasks completed', data: data.tasks, colour: c.tasks, words: (n) => `${plural(n, 'task')} completed` },
      { label: 'Habit check-ins', data: data.checkIns, colour: c.checkIns, words: (n) => plural(n, 'habit check-in') },
    ];
    return new Chart(canvas, {
      type,
      data: {
        labels: data.labels,
        datasets: series.map((s, i) => ({ label: s.label, data: s.data, hidden: hidden[i], ...datasetStyle(type, s.colour, c.surface) })),
      },
      plugins: [dayShade],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion ? false : { duration: 450 },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 8 } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: c.muted, autoSkip: false, maxRotation: 0, font: { size: 12 }, callback: (value, i) => (TICKS.has(i) ? data.labels[i] : '') } },
          y: { beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { color: c.muted, precision: 0, maxTicksLimit: 5, font: { size: 11 } } },
        },
        plugins: {
          legend: { display: false }, // the legend is the buttons above the chart
          dayShade: { color: c.grid },
          tooltip: {
            backgroundColor: c.text,
            titleColor: c.surface,
            bodyColor: c.surface,
            padding: 10,
            cornerRadius: 10,
            boxPadding: 4,
            usePointStyle: true,
            titleFont: { weight: '600' },
            callbacks: {
              title: (items) => data.days[items[0].dataIndex],
              label: (item) => series[item.datasetIndex].words(item.parsed.y),
              labelColor: (item) => ({ backgroundColor: series[item.datasetIndex].colour, borderColor: series[item.datasetIndex].colour }),
            },
          },
        },
      },
    });
  }

  // ← → Home End: move the tooltip day by day (the canvas is focusable and describes this in its label).
  function moveTo(chart, index) {
    const visible = chart.data.datasets.map((_, i) => i).filter((i) => chart.isDatasetVisible(i));
    if (!visible.length) return;
    const active = visible.map((datasetIndex) => ({ datasetIndex, index }));
    const point = chart.getDatasetMeta(visible[0]).data[index];
    chart.setActiveElements(active);
    chart.tooltip.setActiveElements(active, { x: point.x, y: point.y });
    chart.update();
  }

  function setUp(section) {
    if (!window.Chart || !section) return;
    const form = section.querySelector('[data-chart-type]');
    const legend = [...section.querySelectorAll('[data-series]')];
    const hidden = () => legend.map((button) => button.getAttribute('aria-pressed') === 'false');
    let type = form.querySelector('[aria-pressed="true"]')?.value ?? 'bar';
    // Show the chart box before drawing: Chart.js sizes the canvas from it, and a hidden box measures 0 px wide.
    section.querySelector('[data-chart]').hidden = false;
    section.querySelector('[data-chart-fallback]').hidden = true;
    let chart = draw(section, type, hidden());

    // Bars / Lines: redraw now, save in the background. Capture phase, so app.js's double-submit guard never sees it.
    form.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const next = event.submitter?.value;
        if (!next || next === type) return;
        type = next;
        for (const button of form.querySelectorAll('button[name=chart]')) {
          const on = button.value === type;
          button.setAttribute('aria-pressed', String(on));
          button.classList.remove(...(on ? UNSELECTED : SELECTED));
          button.classList.add(...(on ? SELECTED : UNSELECTED));
        }
        chart = draw(section, type, hidden());
        const body = new URLSearchParams({ chart: type });
        // X-Tab-Id: this tab already shows the new chart, so the live update (services/sync.js) skips it instead of
        // reloading the page content here; other open tabs still follow.
        const headers = { 'X-CSRF-Token': csrfToken(), 'X-Requested-With': 'fetch', 'X-Tab-Id': window.agendal?.tabId ?? '' };
        fetch(form.getAttribute('action'), { method: 'POST', body, headers }).catch(() => {
          window.agendal?.toast('Couldn’t save the chart type. It will go back next time.', { type: 'error' });
        });
      },
      true
    );

    for (const button of legend) {
      button.addEventListener('click', () => {
        const i = Number(button.dataset.series);
        const show = !chart.isDatasetVisible(i);
        chart.setDatasetVisibility(i, show);
        button.setAttribute('aria-pressed', String(show));
        chart.update();
      });
    }

    const canvas = section.querySelector('#trend-chart');
    let index = null;
    canvas.addEventListener('keydown', (event) => {
      const last = chart.data.labels.length - 1;
      const next = { ArrowLeft: (index ?? last + 1) - 1, ArrowRight: (index ?? -1) + 1, Home: 0, End: last }[event.key];
      if (next == null) return;
      event.preventDefault();
      index = Math.min(last, Math.max(0, next));
      moveTo(chart, index);
    });
    canvas.addEventListener('blur', () => {
      index = null;
      chart.setActiveElements([]);
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.update();
    });
  }

  // Semester activity: an instant tooltip like GitHub's ("2 tasks on Sunday, 18 October") above the day under the
  // pointer, instead of the browser's slow, small title tooltip (the titles stay in the HTML for no-JS visitors).
  function setUpHeatmap() {
    const tip = document.querySelector('[data-heat-tip]');
    if (!tip) return;
    const text = tip.querySelector('[data-heat-tip-text]');
    const cells = document.querySelectorAll('[data-heat-count]');
    cells.forEach((cell) => cell.removeAttribute('title'));
    const hide = () => (tip.hidden = true);
    const show = (cell) => {
      text.replaceChildren(Object.assign(document.createElement('strong'), { textContent: cell.dataset.heatCount }), ` on ${cell.dataset.heatDay}`);
      const box = cell.getBoundingClientRect();
      tip.hidden = false;
      // Centred above the day, kept inside the window.
      const half = tip.offsetWidth / 2;
      tip.style.left = `${Math.min(Math.max(box.left + box.width / 2, half + 8), innerWidth - half - 8)}px`;
      tip.style.top = `${box.top - 8}px`;
    };
    const grid = cells[0]?.parentElement;
    if (!grid) return;
    grid.addEventListener('pointerover', (event) => {
      const cell = event.target.closest('[data-heat-count]');
      if (cell) show(cell);
      else hide();
    });
    grid.addEventListener('pointerleave', hide);
  }
  // The tooltip is placed in the window, so it would float off its day while the page scrolls: hide it then.
  addEventListener('scroll', () => document.querySelector('[data-heat-tip]')?.setAttribute('hidden', ''), { passive: true, capture: true });

  const init = () => {
    setUp(document.querySelector('[data-trend]'));
    setUpHeatmap();
  };
  init();
  document.addEventListener('agendal:render', init); // live updates swap the page content in (public/js/app.js)
})();
