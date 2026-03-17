// Graph visualization using vis-network

function renderGraph(data) {
  const container = document.getElementById('graph-container');
  container.innerHTML = '';

  if (typeof vis === 'undefined') {
    container.innerHTML = '<div class="empty" style="padding:2rem;color:#f43f5e">vis-network failed to load. Check your internet connection — the graph library is loaded from unpkg.com.</div>';
    return;
  }

  if (!data || !data.nodes || !data.nodes.length) {
    container.innerHTML = '<div class="empty" style="padding:2rem">No graph data. Enter an entity name above.</div>';
    return;
  }

  // Color by entity type
  const typeColors = {
    Person: '#f59e0b',
    Organization: '#3b82f6',
    Concept: '#a78bfa',
    Location: '#10b981',
    Event: '#f43f5e',
    Technology: '#06b6d4',
    Other: '#64748b',
  };

  const nodes = new vis.DataSet(data.nodes.map(n => ({
    id: n.id,
    label: n.label || n.id,
    title: `<b>${n.label}</b><br>${n.type || ''}<br>${n.description || ''}`,
    color: {
      background: typeColors[n.type] || typeColors.Other,
      border: '#1a1d27',
      highlight: { background: '#7c6af7', border: '#fff' },
    },
    font: { color: '#f1f5f9', size: 13 },
    size: 10 + Math.min((n.rank || 0) * 2, 20),
  })));

  const edges = new vis.DataSet(data.edges.map(e => ({
    id: e.id,
    from: e.from,
    to: e.to,
    label: e.label || '',
    title: e.label || '',
    width: Math.max(1, (e.weight || 1) * 2),
    color: { color: '#2d3148', highlight: '#7c6af7' },
    font: { color: '#94a3b8', size: 10, align: 'middle' },
    smooth: { type: 'dynamic' },
  })));

  const options = {
    physics: {
      enabled: true,
      stabilization: { iterations: 100 },
      barnesHut: { gravitationalConstant: -3000, centralGravity: 0.3 },
    },
    interaction: {
      hover: true,
      tooltipDelay: 100,
      navigationButtons: false,
      keyboard: false,
    },
    layout: { randomSeed: 42 },
    nodes: { borderWidth: 1, shape: 'dot' },
    edges: { arrows: { to: { enabled: true, scaleFactor: 0.5 } } },
  };

  new vis.Network(container, { nodes, edges }, options);
}
