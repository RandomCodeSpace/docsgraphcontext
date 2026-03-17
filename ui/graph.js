// Graph visualization — pure Canvas, no external dependencies

const TYPE_COLORS = {
  Person:       '#f59e0b',
  Organization: '#3b82f6',
  Concept:      '#a78bfa',
  Location:     '#10b981',
  Event:        '#f43f5e',
  Technology:   '#06b6d4',
  Other:        '#64748b',
};

function renderGraph(data) {
  const container = document.getElementById('graph-container');

  // Clean up any previous render (disconnect ResizeObserver, cancel animation)
  if (container._graphCleanup) container._graphCleanup();
  container.innerHTML = '';

  if (!data || !data.nodes || !data.nodes.length) {
    container.innerHTML = '<div class="empty" style="padding:2rem">No graph data. Enter an entity name above.</div>';
    return;
  }

  // ── Canvas + tooltip setup ────────────────────────────────────────────────
  container.style.position = 'relative';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:default';
  container.appendChild(canvas);

  const tip = document.createElement('div');
  tip.style.cssText = [
    'position:absolute;background:#1a1d27;border:1px solid #2d3148',
    'border-radius:6px;padding:8px 12px;font-size:12px;color:#f1f5f9',
    'pointer-events:none;display:none;max-width:220px;z-index:100',
    'line-height:1.5',
  ].join(';');
  container.appendChild(tip);

  // ── Build node / edge objects ─────────────────────────────────────────────
  const cx = () => canvas.width  / 2;
  const cy = () => canvas.height / 2;

  // Seed deterministic positions in a circle so first frame looks reasonable
  const nodes = data.nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / data.nodes.length;
    const r = Math.min(canvas.width, canvas.height) * 0.3 || 150;
    return {
      id:   n.id,
      label: n.label || n.id,
      type:  n.type  || 'Other',
      desc:  n.description || '',
      color: TYPE_COLORS[n.type] || TYPE_COLORS.Other,
      r:     8 + Math.min((n.rank || 0) * 1.5, 14),
      x: (canvas.width  || 800) / 2 + r * Math.cos(angle),
      y: (canvas.height || 600) / 2 + r * Math.sin(angle),
      vx: 0, vy: 0,
    };
  });

  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });

  const edges = (data.edges || [])
    .map(e => ({ from: byId[e.from], to: byId[e.to], label: e.label || '', weight: e.weight || 0.5 }))
    .filter(e => e.from && e.to);

  // ── Simulation parameters ─────────────────────────────────────────────────
  let alpha     = 1.0;
  const DECAY   = 0.015;
  const REPULSE = 1500;
  const ATTRACT = 0.05;
  const GRAVITY = 0.01;
  const DAMP    = 0.82;

  // ── Viewport state ────────────────────────────────────────────────────────
  let tx = 0, ty = 0, scale = 1;

  // ── Input state ───────────────────────────────────────────────────────────
  let dragging  = null;
  let panning   = false;
  let panStart  = null;
  let rafId     = null;

  // ── Resize handling ───────────────────────────────────────────────────────
  function resize() {
    canvas.width  = container.clientWidth  || 800;
    canvas.height = container.clientHeight || 600;
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // ── Simulation step ───────────────────────────────────────────────────────
  function simulate() {
    if (alpha <= 0.001) return;

    // Repulsion between every pair
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x || 0.01;
        let dy = b.y - a.y || 0.01;
        const d2 = dx * dx + dy * dy;
        const d  = Math.sqrt(d2);
        const f  = (REPULSE * alpha) / d2;
        const fx = f * dx / d;
        const fy = f * dy / d;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    // Attraction along edges (spring)
    for (const e of edges) {
      const dx = e.to.x - e.from.x;
      const dy = e.to.y - e.from.y;
      const f  = ATTRACT * alpha;
      e.from.vx += dx * f; e.from.vy += dy * f;
      e.to.vx   -= dx * f; e.to.vy   -= dy * f;
    }

    // Gravity toward canvas centre
    for (const n of nodes) {
      n.vx += (cx() - n.x) * GRAVITY * alpha;
      n.vy += (cy() - n.y) * GRAVITY * alpha;
    }

    // Integrate
    for (const n of nodes) {
      if (n === dragging) continue;
      n.vx *= DAMP; n.vy *= DAMP;
      n.x  += n.vx; n.y  += n.vy;
    }

    alpha -= DECAY;
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  function draw() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    // Edges
    for (const e of edges) {
      const { from: a, to: b } = e;
      const dx  = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux  = dx / len, uy = dy / len;
      const sx  = a.x + ux * a.r, sy = a.y + uy * a.r;
      const ex  = b.x - ux * (b.r + 6), ey = b.y - uy * (b.r + 6);

      // Line
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = '#2d3148';
      ctx.lineWidth   = Math.max(0.5, e.weight * 2);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(dy, dx);
      const AL = 9, AW = 0.38;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - AL * Math.cos(angle - AW), ey - AL * Math.sin(angle - AW));
      ctx.lineTo(ex - AL * Math.cos(angle + AW), ey - AL * Math.sin(angle + AW));
      ctx.closePath();
      ctx.fillStyle = '#2d3148';
      ctx.fill();

      // Edge label
      if (e.label) {
        ctx.font      = '10px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText(e.label, (sx + ex) / 2, (sy + ey) / 2 - 4);
      }
    }

    // Nodes
    for (const n of nodes) {
      // Circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle   = n.color;
      ctx.fill();
      ctx.strokeStyle = '#1a1d27';
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // Label below node
      const short = n.label.length > 14 ? n.label.slice(0, 13) + '…' : n.label;
      ctx.font          = `${Math.max(10, Math.floor(n.r))}px sans-serif`;
      ctx.fillStyle     = '#f1f5f9';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'top';
      ctx.fillText(short, n.x, n.y + n.r + 3);
    }

    ctx.restore();
  }

  // ── Animation loop ────────────────────────────────────────────────────────
  function loop() {
    simulate();
    draw();
    rafId = requestAnimationFrame(loop);
  }
  loop();

  // ── Coordinate helpers ────────────────────────────────────────────────────
  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - tx) / scale,
      y: (clientY - rect.top  - ty) / scale,
    };
  }

  function hitNode(wx, wy) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = wx - n.x, dy = wy - n.y;
      if (dx * dx + dy * dy <= n.r * n.r) return n;
    }
    return null;
  }

  // ── Mouse events ──────────────────────────────────────────────────────────
  canvas.addEventListener('mousedown', e => {
    const w = toWorld(e.clientX, e.clientY);
    const node = hitNode(w.x, w.y);
    if (node) {
      dragging = node;
      alpha = Math.max(alpha, 0.3);
      canvas.style.cursor = 'grabbing';
    } else {
      panning  = true;
      panStart = { x: e.clientX - tx, y: e.clientY - ty };
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('mousemove', e => {
    if (dragging) {
      const w = toWorld(e.clientX, e.clientY);
      dragging.x = w.x; dragging.y = w.y;
      dragging.vx = 0;  dragging.vy = 0;
      return;
    }
    if (panning && panStart) {
      tx = e.clientX - panStart.x;
      ty = e.clientY - panStart.y;
      return;
    }
    // Tooltip
    const w    = toWorld(e.clientX, e.clientY);
    const node = hitNode(w.x, w.y);
    if (node) {
      const rect = container.getBoundingClientRect();
      tip.style.left    = (e.clientX - rect.left + 14) + 'px';
      tip.style.top     = (e.clientY - rect.top  + 14) + 'px';
      tip.style.display = 'block';
      tip.innerHTML     =
        `<b>${node.label}</b><br>` +
        `<span style="color:#94a3b8">${node.type}</span>` +
        (node.desc ? `<br><span style="color:#cbd5e1">${node.desc}</span>` : '');
      canvas.style.cursor = 'pointer';
    } else {
      tip.style.display   = 'none';
      canvas.style.cursor = 'default';
    }
  });

  const stopDrag = () => {
    dragging = null; panning = false; canvas.style.cursor = 'default';
  };
  canvas.addEventListener('mouseup',    stopDrag);
  canvas.addEventListener('mouseleave', () => { stopDrag(); tip.style.display = 'none'; });

  // Scroll to zoom, centred on cursor
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect   = canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const my     = e.clientY - rect.top;
    tx     = mx - factor * (mx - tx);
    ty     = my - factor * (my - ty);
    scale *= factor;
  }, { passive: false });

  // ── Cleanup ───────────────────────────────────────────────────────────────
  container._graphCleanup = () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
  };
}
