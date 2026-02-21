(() => {
  "use strict";

  const canvas = document.getElementById("canvas");
  const svgLayer = document.getElementById("connectionsSvg");
  const palette = document.getElementById("palette");
  const outputNodeEl = document.getElementById("outputNode");
  const outputValueEl = document.getElementById("outputValue");

  const btnRun = document.getElementById("btnRun");
  const btnReset = document.getElementById("btnReset");
  const btnClear = document.getElementById("btnClear");

  const editorPanel = document.getElementById("nodeEditor");
  const editorTitle = document.getElementById("editorTitle");
  const editorValue = document.getElementById("editorValue");
  const editorClose = document.getElementById("editorClose");
  const editorSave = document.getElementById("editorSave");
  const editorDelete = document.getElementById("editorDelete");
  const editorActivation = document.getElementById("editorActivation");
  const editorActivationSelect = document.getElementById("editorActivationSelect");

  // ─── State ────────────────────────────────────────────────────
  let nodeIdCounter = 0;
  const nodes = new Map();
  const connections = [];
  let selectedNode = null;
  let editingNode = null;
  let connectingFrom = null;
  let tempLine = null;

  let zoomScale = 1;
  let panX = 0;
  let panY = 0;
  let spaceHeld = false;
  let animSpeedMultiplier = 1;
  let animationEnabled = true;

  const OUTPUT_NODE_ID = "output";

  nodes.set(OUTPUT_NODE_ID, {
    id: OUTPUT_NODE_ID,
    type: "output",
    label: "ŷ",
    value: 0,
    activation: "linear",
    el: outputNodeEl,
  });

  setupNodePorts(outputNodeEl, OUTPUT_NODE_ID);

  // ─── Helpers ──────────────────────────────────────────────────

  function uid() {
    return "n" + (++nodeIdCounter);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function clientToCanvas(clientX, clientY) {
    const wrapRect = document.getElementById("canvasWrapper").getBoundingClientRect();
    return {
      x: (clientX - wrapRect.left - panX) / zoomScale,
      y: (clientY - wrapRect.top - panY) / zoomScale,
    };
  }

  function getNodeCenter(el) {
    const body = el.querySelector(".node-body");
    const rect = body.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return clientToCanvas(cx, cy);
  }

  function getPortPosition(portEl) {
    const rect = portEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return clientToCanvas(cx, cy);
  }

  // ─── Drag from Palette ────────────────────────────────────────

  let dragData = null;
  let ghostEl = null;

  palette.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".palette-item");
    if (!item) return;

    dragData = {
      type: item.dataset.type,
      label: item.dataset.label,
    };

    ghostEl = document.createElement("div");
    ghostEl.className = "drag-ghost";
    const preview = item.querySelector(".node-preview").cloneNode(true);
    preview.style.width = "48px";
    preview.style.height = "48px";
    preview.style.fontSize = "1rem";
    ghostEl.appendChild(preview);
    document.body.appendChild(ghostEl);

    e.dataTransfer.setDragImage(ghostEl, 24, 24);
    e.dataTransfer.effectAllowed = "copy";
  });

  document.addEventListener("dragover", (e) => {
    if (!dragData) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  canvas.addEventListener("dragenter", (e) => {
    if (dragData) canvas.classList.add("drag-over");
  });
  canvas.addEventListener("dragleave", (e) => {
    if (e.target === canvas || !canvas.contains(e.relatedTarget)) {
      canvas.classList.remove("drag-over");
    }
  });

  canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    canvas.classList.remove("drag-over");
    if (!dragData) return;

    const pos = clientToCanvas(e.clientX, e.clientY);
    const x = pos.x - 40;
    const y = pos.y - 40;

    const label = nextAvailableLabel(dragData.type, dragData.label);
    createNode(dragData.type, label, x, y);
    dragData = null;
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
  });

  document.addEventListener("dragend", () => {
    dragData = null;
    canvas.classList.remove("drag-over");
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
  });

  // ─── Node Creation ────────────────────────────────────────────

  function nextAvailableLabel(type, baseLabel) {
    const match = baseLabel.match(/^([a-zA-Z]+)(\d*)$/);
    if (!match) return baseLabel;

    const prefix = match[1];
    const hasNumber = match[2] !== "";

    const usedLabels = new Set();
    nodes.forEach((n) => {
      if (n.type === type) usedLabels.add(n.label);
    });

    if (!usedLabels.has(baseLabel)) return baseLabel;

    const startNum = hasNumber ? parseInt(match[2]) : 1;
    let num = startNum;
    while (usedLabels.has(prefix + num)) num++;
    return prefix + num;
  }

  function createNode(type, label, x, y, appendTo) {
    const id = uid();
    const el = document.createElement("div");
    el.className = `nn-node ${type}-node appearing`;
    el.dataset.nodeId = id;
    el.style.left = x + "px";
    el.style.top = y + "px";

    const defaultValues = {
      input: 1.0,
      weight: 0.5,
      bias: 0.0,
      neuron: 0,
      activation: 0,
    };

    const nodeData = {
      id,
      type,
      label,
      value: defaultValues[type] ?? 0,
      activation: type === "activation" ? label : "linear",
      el,
    };

    const iconMap = {
      input: formatSubscript(label),
      weight: formatSubscript(label),
      neuron: "Σ",
      bias: "b",
      activation: label === "sigmoid" ? "σ" : label === "relu" ? "R" : label,
    };

    const labelMap = {
      input: "Input",
      weight: "Weight",
      neuron: "Neuron",
      bias: "Bias",
      activation: capitalize(label),
    };

    const hasPorts = {
      input: { in: false, out: true },
      weight: { in: true, out: true },
      neuron: { in: true, out: true },
      bias: { in: false, out: true },
      activation: { in: true, out: true },
    };

    const ports = hasPorts[type] || { in: true, out: true };

    el.innerHTML = `
      ${ports.in ? '<div class="node-port port-in" data-port="in"></div>' : ''}
      <div class="node-body">
        <div class="node-icon">${iconMap[type]}</div>
        <div class="node-label">${labelMap[type]}</div>
        <div class="node-value">${formatValue(nodeData.value)}</div>
      </div>
      ${ports.out ? '<div class="node-port port-out" data-port="out"></div>' : ''}
      <div class="activation-glow"></div>
    `;

    (appendTo || canvas).appendChild(el);
    nodes.set(id, nodeData);

    setupNodeDrag(el, id);
    setupNodePorts(el, id);
    setupNodeClick(el, id);

    setTimeout(() => el.classList.remove("appearing"), 300);
    return id;
  }

  function formatSubscript(label) {
    const match = label.match(/^([a-zA-Zŷσ]+)(\d+)$/);
    if (match) return `${match[1]}<sub>${match[2]}</sub>`;
    return label;
  }

  function formatValue(v) {
    if (v === null || v === undefined) return "—";
    return Number(v).toFixed(2);
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ─── Node Dragging on Canvas ──────────────────────────────────

  function setupNodeDrag(el, nodeId) {
    let startX, startY, origLeft, origTop;
    let isDragging = false;
    let overPalette = false;

    const onPointerDown = (e) => {
      if (e.target.classList.contains("node-port")) return;
      if (spaceHeld) return;
      e.preventDefault();
      isDragging = true;
      overPalette = false;
      el.classList.add("dragging");

      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseFloat(el.style.left) || 0;
      origTop = parseFloat(el.style.top) || 0;

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = (e.clientX - startX) / zoomScale;
      const dy = (e.clientY - startY) / zoomScale;
      el.style.left = (origLeft + dx) + "px";
      el.style.top = (origTop + dy) + "px";
      redrawConnections();

      if (nodeId !== OUTPUT_NODE_ID) {
        const paletteRect = palette.getBoundingClientRect();
        const isOver = e.clientX >= paletteRect.left && e.clientX <= paletteRect.right
                    && e.clientY >= paletteRect.top && e.clientY <= paletteRect.bottom;
        if (isOver && !overPalette) {
          overPalette = true;
          palette.classList.add("delete-hover");
          el.classList.add("node-delete-preview");
        } else if (!isOver && overPalette) {
          overPalette = false;
          palette.classList.remove("delete-hover");
          el.classList.remove("node-delete-preview");
        }
      }
    };

    const onPointerUp = () => {
      const shouldDelete = overPalette && nodeId !== OUTPUT_NODE_ID;

      isDragging = false;
      overPalette = false;
      el.classList.remove("dragging", "node-delete-preview");
      palette.classList.remove("delete-hover");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);

      if (shouldDelete) {
        el.classList.add("node-deleting");
        setTimeout(() => {
          deleteNode(nodeId);
          closeEditor();
        }, 200);
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
  }

  setupNodeDrag(outputNodeEl, OUTPUT_NODE_ID);

  // ─── Port Connections ─────────────────────────────────────────

  function setupNodePorts(el, nodeId) {
    el.querySelectorAll(".node-port").forEach((port) => {
      port.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();

        const portType = port.dataset.port;

        if (portType === "out") {
          connectingFrom = { nodeId, portEl: port };
          port.classList.add("port-active");
          createTempLine();
          document.addEventListener("pointermove", onConnectMove);
          document.addEventListener("pointerup", onConnectEnd);
        } else if (portType === "in" && connectingFrom) {
          finishConnection(nodeId);
        }
      });

      port.addEventListener("pointerup", (e) => {
        if (connectingFrom && port.dataset.port === "in") {
          e.stopPropagation();
          finishConnection(nodeId);
        }
      });
    });
  }

  function createTempLine() {
    tempLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tempLine.classList.add("temp-connection");
    svgLayer.appendChild(tempLine);
  }

  function onConnectMove(e) {
    if (!connectingFrom || !tempLine) return;
    const from = getPortPosition(connectingFrom.portEl);
    const to = clientToCanvas(e.clientX, e.clientY);
    tempLine.setAttribute("d", bezierPath(from, to));
  }

  function onConnectEnd() {
    cleanupConnect();
  }

  function finishConnection(toNodeId) {
    if (!connectingFrom) return;
    const fromId = connectingFrom.nodeId;
    if (fromId === toNodeId) { cleanupConnect(); return; }

    const exists = connections.some(
      (c) => c.from === fromId && c.to === toNodeId
    );
    if (exists) { cleanupConnect(); return; }

    const conn = {
      from: fromId,
      to: toNodeId,
      svgPath: null,
    };
    connections.push(conn);
    invalidateIncomingCache();
    drawConnection(conn);
    cleanupConnect();
  }

  function cleanupConnect() {
    if (connectingFrom) {
      connectingFrom.portEl.classList.remove("port-active");
      connectingFrom = null;
    }
    if (tempLine) {
      tempLine.remove();
      tempLine = null;
    }
    document.removeEventListener("pointermove", onConnectMove);
    document.removeEventListener("pointerup", onConnectEnd);
  }

  function bezierPath(from, to) {
    const dx = Math.abs(to.x - from.x) * 0.5;
    return `M${from.x},${from.y} C${from.x + dx},${from.y} ${to.x - dx},${to.y} ${to.x},${to.y}`;
  }

  function drawConnection(conn) {
    const fromNode = nodes.get(conn.from);
    const toNode = nodes.get(conn.to);
    if (!fromNode || !toNode) return;

    const fromPort = fromNode.el.querySelector(".port-out");
    const toPort = toNode.el.querySelector(".port-in");
    if (!fromPort || !toPort) return;

    const from = getPortPosition(fromPort);
    const to = getPortPosition(toPort);

    if (!conn.svgPath) {
      conn.svgPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      conn.svgPath.classList.add("connection-line");
      conn.svgPath.style.pointerEvents = "stroke";
      conn.svgPath.addEventListener("click", () => removeConnection(conn));
      svgLayer.appendChild(conn.svgPath);
    }

    conn.svgPath.setAttribute("d", bezierPath(from, to));
  }

  function redrawConnections() {
    if (connections.length > 50) {
      const positions = [];
      for (let i = 0; i < connections.length; i++) {
        const conn = connections[i];
        const fromNode = nodes.get(conn.from);
        const toNode = nodes.get(conn.to);
        if (!fromNode || !toNode) { positions.push(null); continue; }
        const fromPort = fromNode.el.querySelector(".port-out");
        const toPort = toNode.el.querySelector(".port-in");
        if (!fromPort || !toPort) { positions.push(null); continue; }
        positions.push({ from: getPortPosition(fromPort), to: getPortPosition(toPort) });
      }
      for (let i = 0; i < connections.length; i++) {
        const p = positions[i];
        if (p && connections[i].svgPath)
          connections[i].svgPath.setAttribute("d", bezierPath(p.from, p.to));
      }
    } else {
      connections.forEach(drawConnection);
    }
  }

  function removeConnection(conn) {
    const idx = connections.indexOf(conn);
    if (idx >= 0) {
      connections.splice(idx, 1);
      invalidateIncomingCache();
    }
    if (conn.svgPath) conn.svgPath.remove();
  }

  // ─── Node Click / Edit ────────────────────────────────────────

  function setupNodeClick(el, nodeId) {
    el.addEventListener("dblclick", (e) => {
      if (e.target.classList.contains("node-port")) return;
      openEditor(nodeId);
    });
  }

  outputNodeEl.addEventListener("dblclick", () => openEditor(OUTPUT_NODE_ID));

  function openEditor(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return;

    editingNode = nodeId;
    editorPanel.classList.remove("hidden");

    const typeLabels = {
      input: "Edit Input",
      weight: "Edit Weight",
      bias: "Edit Bias",
      neuron: "Edit Neuron",
      activation: "Edit Activation",
      output: "Output Node",
    };
    editorTitle.textContent = typeLabels[node.type] || "Edit Node";

    if (node.type === "output") {
      editorValue.value = node.value;
      editorValue.disabled = true;
    } else {
      editorValue.value = node.value;
      editorValue.disabled = false;
    }

    if (node.type === "neuron" || node.type === "activation") {
      editorActivation.classList.remove("hidden");
      editorActivationSelect.value = node.activation;
    } else {
      editorActivation.classList.add("hidden");
    }

    const rect = node.el.getBoundingClientRect();
    editorPanel.style.left = (rect.right + 12) + "px";
    editorPanel.style.top = rect.top + "px";

    const panelRect = editorPanel.getBoundingClientRect();
    if (panelRect.right > window.innerWidth) {
      editorPanel.style.left = (rect.left - panelRect.width - 12) + "px";
    }
    if (panelRect.bottom > window.innerHeight) {
      editorPanel.style.top = (window.innerHeight - panelRect.height - 12) + "px";
    }
  }

  function closeEditor() {
    editorPanel.classList.add("hidden");
    editingNode = null;
  }

  editorClose.addEventListener("click", closeEditor);

  editorSave.addEventListener("click", () => {
    if (!editingNode) return;
    const node = nodes.get(editingNode);
    if (!node) return;

    if (node.type !== "output") {
      node.value = parseFloat(editorValue.value) || 0;
    }
    if (node.type === "neuron" || node.type === "activation") {
      node.activation = editorActivationSelect.value;
      const iconMap = { sigmoid: "σ", relu: "R", tanh: "tanh", linear: "f" };
      if (node.type === "activation") {
        node.el.querySelector(".node-icon").textContent = iconMap[node.activation] || node.activation;
      }
    }

    updateNodeDisplay(node);
    closeEditor();
  });

  editorDelete.addEventListener("click", () => {
    if (!editingNode || editingNode === OUTPUT_NODE_ID) return;
    deleteNode(editingNode);
    closeEditor();
  });

  function updateNodeDisplay(node) {
    const valEl = node.el.querySelector(".node-value");
    if (valEl) valEl.textContent = formatValue(node.value);
  }

  function deleteNode(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return;

    for (let i = connections.length - 1; i >= 0; i--) {
      if (connections[i].from === nodeId || connections[i].to === nodeId) {
        if (connections[i].svgPath) connections[i].svgPath.remove();
        connections.splice(i, 1);
      }
    }
    invalidateIncomingCache();

    node.el.remove();
    nodes.delete(nodeId);
  }

  // ─── Forward Pass ─────────────────────────────────────────────

  function activationFn(name, x) {
    switch (name) {
      case "sigmoid": return 1 / (1 + Math.exp(-x));
      case "relu": return Math.max(0, x);
      case "tanh": return Math.tanh(x);
      default: return x;
    }
  }

  let incomingByNode = null;

  function invalidateIncomingCache() {
    incomingByNode = null;
  }

  function getIncomingConnections(nodeId) {
    if (!incomingByNode) {
      incomingByNode = new Map();
      connections.forEach((c) => {
        const arr = incomingByNode.get(c.to) || [];
        arr.push(c);
        incomingByNode.set(c.to, arr);
      });
    }
    return incomingByNode.get(nodeId) || [];
  }

  function computeNode(nodeId, cache = new Map()) {
    if (cache.has(nodeId)) return cache.get(nodeId);

    const node = nodes.get(nodeId);
    if (!node) return 0;

    let result;

    if (node.type === "input" || node.type === "bias") {
      result = node.value;
    } else if (node.type === "weight") {
      const incoming = getIncomingConnections(nodeId);
      if (incoming.length === 0) { result = node.value; }
      else {
        let sum = 0;
        incoming.forEach((c) => { sum += computeNode(c.from, cache); });
        result = sum * node.value;
      }
    } else if (node.type === "neuron" || node.type === "activation") {
      const incoming = getIncomingConnections(nodeId);
      let sum = 0;
      incoming.forEach((c) => { sum += computeNode(c.from, cache); });
      result = activationFn(node.activation, sum);
      node.value = result;
    } else if (node.type === "output") {
      const incoming = getIncomingConnections(nodeId);
      let sum = 0;
      incoming.forEach((c) => { sum += computeNode(c.from, cache); });
      result = sum;
      node.value = result;
    } else {
      result = 0;
    }

    cache.set(nodeId, result);
    return result;
  }

  function topologicalOrder(targetId) {
    const order = [];
    const visited = new Set();

    function dfs(nid) {
      if (visited.has(nid)) return;
      visited.add(nid);
      getIncomingConnections(nid).forEach((c) => dfs(c.from));
      order.push(nid);
    }

    dfs(targetId);
    return order;
  }

  function computeForwardOutputs() {
    const outputs = new Map();
    const visited = new Set();

    function compute(nodeId) {
      if (visited.has(nodeId)) return outputs.get(nodeId) || 0;
      visited.add(nodeId);
      const node = nodes.get(nodeId);
      if (!node) return 0;

      let result;
      if (node.type === "input" || node.type === "bias") {
        result = node.value;
      } else if (node.type === "weight") {
        const inc = getIncomingConnections(nodeId);
        if (inc.length === 0) { result = node.value; }
        else {
          let sum = 0;
          inc.forEach((c) => { sum += compute(c.from); });
          result = sum * node.value;
        }
      } else if (node.type === "neuron" || node.type === "activation") {
        const inc = getIncomingConnections(nodeId);
        let sum = 0;
        inc.forEach((c) => { sum += compute(c.from); });
        result = activationFn(node.activation, sum);
        node.value = result;
      } else if (node.type === "output") {
        const inc = getIncomingConnections(nodeId);
        let sum = 0;
        inc.forEach((c) => { sum += compute(c.from); });
        result = sum;
        node.value = result;
      } else {
        result = 0;
      }

      outputs.set(nodeId, result);
      return result;
    }

    compute(OUTPUT_NODE_ID);
    return outputs;
  }

  function getOpString(node) {
    if (!node) return "";
    switch (node.type) {
      case "weight": return "\u00d7" + formatValue(node.value);
      case "bias": return "bias";
      case "neuron": case "activation":
        if (node.activation === "sigmoid") return "\u03c3";
        if (node.activation === "relu") return "ReLU";
        if (node.activation === "tanh") return "tanh";
        return "\u03a3";
      default: return "";
    }
  }

  async function runForwardPass() {
    resetActivations();

    const order = topologicalOrder(OUTPUT_NODE_ID);
    const outputs = computeForwardOutputs();

    if (!animationEnabled) {
      for (let i = 0; i < order.length; i++) {
        const nid = order[i];
        const node = nodes.get(nid);
        if (!node) continue;
        updateNodeDisplay(node);
        setNodeGlow(node);
        node.el.classList.add("active");
      }
      outputValueEl.textContent = formatValue(nodes.get(OUTPUT_NODE_ID).value);
      return;
    }

    for (let i = 0; i < order.length; i++) {
      const nid = order[i];
      const node = nodes.get(nid);
      if (!node) continue;

      await delay(180 / animSpeedMultiplier);

      updateNodeDisplay(node);
      setNodeGlow(node);
      node.el.classList.add("active", "propagating");

      getIncomingConnections(nid).forEach((c) => {
        if (c.svgPath) {
          c.svgPath.classList.add("signal-active");
          const sourceVal = outputs.get(c.from);
          const sourceNode = nodes.get(c.from);
          const opStr = getOpString(sourceNode);
          animateSignal(c, sourceVal, opStr);
        }
      });

      await delay(120 / animSpeedMultiplier);
      node.el.classList.remove("propagating");
    }

    outputValueEl.textContent = formatValue(nodes.get(OUTPUT_NODE_ID).value);
  }

  function setNodeGlow(node) {
    node.el.classList.remove("glow-low", "glow-med", "glow-high");
    const absVal = Math.abs(node.value);
    if (absVal < 0.3) node.el.classList.add("glow-low");
    else if (absVal < 0.7) node.el.classList.add("glow-med");
    else node.el.classList.add("glow-high");
  }

  function animateSignal(conn, value, opStr) {
    if (!conn.svgPath) return;
    const path = conn.svgPath;
    const totalLength = path.getTotalLength();
    const NS = "http://www.w3.org/2000/svg";

    const circle = document.createElementNS(NS, "circle");
    circle.classList.add("signal-particle");
    circle.setAttribute("r", "4");
    svgLayer.appendChild(circle);

    let valueTxt = null;
    let opTxt = null;

    if (value !== undefined) {
      valueTxt = document.createElementNS(NS, "text");
      valueTxt.classList.add("signal-value");
      valueTxt.textContent = formatValue(value);
      svgLayer.appendChild(valueTxt);

      if (opStr) {
        opTxt = document.createElementNS(NS, "text");
        opTxt.classList.add("signal-op");
        opTxt.textContent = opStr;
        svgLayer.appendChild(opTxt);
      }
    }

    let start = null;
    const duration = 500 / animSpeedMultiplier;

    function animate(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const point = path.getPointAtLength(progress * totalLength);

      circle.setAttribute("cx", point.x);
      circle.setAttribute("cy", point.y);

      if (valueTxt) {
        const fade = progress < 0.08 ? progress / 0.08
                   : progress > 0.88 ? (1 - progress) / 0.12
                   : 1;
        valueTxt.setAttribute("x", point.x);
        valueTxt.setAttribute("y", point.y - 14);
        valueTxt.setAttribute("opacity", fade);

        if (opTxt) {
          opTxt.setAttribute("x", point.x);
          opTxt.setAttribute("y", point.y - 26);
          opTxt.setAttribute("opacity", fade * 0.85);
        }
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        circle.remove();
        if (valueTxt) valueTxt.remove();
        if (opTxt) opTxt.remove();
      }
    }

    requestAnimationFrame(animate);
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─── Reset / Clear ────────────────────────────────────────────

  function resetActivations() {
    nodes.forEach((node) => {
      node.el.classList.remove("active", "glow-low", "glow-med", "glow-high", "propagating");
      if (node.type === "neuron" || node.type === "activation") {
        node.value = 0;
        updateNodeDisplay(node);
      }
      if (node.type === "output") {
        node.value = 0;
        updateNodeDisplay(node);
        outputValueEl.textContent = "—";
      }
    });

    connections.forEach((c) => {
      if (c.svgPath) c.svgPath.classList.remove("signal-active");
    });
  }

  function clearAll() {
    nodes.forEach((node, id) => {
      if (id !== OUTPUT_NODE_ID) node.el.remove();
    });

    connections.forEach((c) => {
      if (c.svgPath) c.svgPath.remove();
    });
    connections.length = 0;
    invalidateIncomingCache();

    const idsToRemove = [...nodes.keys()].filter((k) => k !== OUTPUT_NODE_ID);
    idsToRemove.forEach((k) => nodes.delete(k));

    const outNode = nodes.get(OUTPUT_NODE_ID);
    outNode.value = 0;
    outputValueEl.textContent = "—";
    outNode.el.classList.remove("active", "glow-low", "glow-med", "glow-high");

    closeEditor();
    nodeIdCounter = 0;
  }

  // ─── Templates ─────────────────────────────────────────────────

  const templateDropdown = document.getElementById("templateDropdown");
  const btnTemplates = document.getElementById("btnTemplates");
  const templateMenu = document.getElementById("templateMenu");

  btnTemplates.addEventListener("click", (e) => {
    e.stopPropagation();
    templateDropdown.classList.toggle("open");
  });

  document.addEventListener("click", () => {
    templateDropdown.classList.remove("open");
  });

  templateMenu.addEventListener("click", (e) => {
    const item = e.target.closest(".dropdown-item");
    if (!item) return;
    const tpl = item.dataset.template;
    if (tpl && TEMPLATES[tpl]) {
      loadTemplate(TEMPLATES[tpl]);
      templateDropdown.classList.remove("open");
    }
  });

  const TEMPLATES = {
    "single-neuron": {
      name: "Single Neuron",
      nodes: [
        { type: "input", label: "x1", value: 1.0, x: 60, yPct: 0.5 },
        { type: "weight", label: "w1", value: 0.7, x: 220, yPct: 0.5 },
        { type: "neuron", label: "neuron", value: 0, activation: "sigmoid", x: 420, yPct: 0.5 },
      ],
      connections: [[0, 1], [1, 2], [2, "output"]],
    },
    "two-inputs": {
      name: "Two Inputs",
      nodes: [
        { type: "input", label: "x1", value: 1.0, x: 60, yPct: 0.3 },
        { type: "input", label: "x2", value: 0.5, x: 60, yPct: 0.7 },
        { type: "weight", label: "w1", value: 0.8, x: 220, yPct: 0.3 },
        { type: "weight", label: "w2", value: 0.4, x: 220, yPct: 0.7 },
        { type: "neuron", label: "neuron", value: 0, activation: "sigmoid", x: 420, yPct: 0.5 },
      ],
      connections: [[0, 2], [1, 3], [2, 4], [3, 4], [4, "output"]],
    },
    "bias-neuron": {
      name: "Neuron with Bias",
      nodes: [
        { type: "input", label: "x1", value: 2.0, x: 60, yPct: 0.35 },
        { type: "weight", label: "w1", value: 0.5, x: 220, yPct: 0.35 },
        { type: "bias", label: "b", value: -0.5, x: 220, yPct: 0.7 },
        { type: "neuron", label: "neuron", value: 0, activation: "sigmoid", x: 420, yPct: 0.5 },
      ],
      connections: [[0, 1], [1, 3], [2, 3], [3, "output"]],
    },
    "and-gate": {
      name: "AND Gate",
      nodes: [
        { type: "input", label: "x1", value: 1.0, x: 60, yPct: 0.3 },
        { type: "input", label: "x2", value: 1.0, x: 60, yPct: 0.7 },
        { type: "weight", label: "w1", value: 1.0, x: 220, yPct: 0.3 },
        { type: "weight", label: "w2", value: 1.0, x: 220, yPct: 0.7 },
        { type: "bias", label: "b", value: -1.5, x: 340, yPct: 0.82 },
        { type: "neuron", label: "neuron", value: 0, activation: "sigmoid", x: 420, yPct: 0.5 },
      ],
      connections: [[0, 2], [1, 3], [2, 5], [3, 5], [4, 5], [5, "output"]],
    },
    "or-gate": {
      name: "OR Gate",
      nodes: [
        { type: "input", label: "x1", value: 1.0, x: 60, yPct: 0.3 },
        { type: "input", label: "x2", value: 0.0, x: 60, yPct: 0.7 },
        { type: "weight", label: "w1", value: 1.0, x: 220, yPct: 0.3 },
        { type: "weight", label: "w2", value: 1.0, x: 220, yPct: 0.7 },
        { type: "bias", label: "b", value: -0.5, x: 340, yPct: 0.82 },
        { type: "neuron", label: "neuron", value: 0, activation: "sigmoid", x: 420, yPct: 0.5 },
      ],
      connections: [[0, 2], [1, 3], [2, 5], [3, 5], [4, 5], [5, "output"]],
    },
    "three-layer": {
      name: "Two-Layer Network",
      nodes: [
        { type: "input", label: "x1", value: 1.0, x: 40, yPct: 0.3 },
        { type: "input", label: "x2", value: 0.5, x: 40, yPct: 0.7 },
        { type: "weight", label: "w1", value: 0.6, x: 170, yPct: 0.2 },
        { type: "weight", label: "w2", value: -0.3, x: 170, yPct: 0.45 },
        { type: "weight", label: "w3", value: 0.8, x: 170, yPct: 0.65 },
        { type: "weight", label: "w4", value: 0.4, x: 170, yPct: 0.85 },
        { type: "neuron", label: "neuron", value: 0, activation: "relu", x: 330, yPct: 0.3 },
        { type: "neuron", label: "neuron", value: 0, activation: "relu", x: 330, yPct: 0.7 },
        { type: "weight", label: "w5", value: 0.5, x: 480, yPct: 0.35 },
        { type: "weight", label: "w6", value: 0.7, x: 480, yPct: 0.65 },
        { type: "activation", label: "sigmoid", value: 0, x: 620, yPct: 0.5 },
      ],
      connections: [
        [0, 2], [0, 3], [1, 4], [1, 5],
        [2, 6], [3, 6], [4, 7], [5, 7],
        [6, 8], [7, 9],
        [8, 10], [9, 10],
        [10, "output"],
      ],
    },
    "xor-gate": {
      name: "XOR Gate",
      nodes: [
        { type: "input", label: "x1", value: 1.0, x: 40, yPct: 0.3 },
        { type: "input", label: "x2", value: 0.0, x: 40, yPct: 0.7 },
        { type: "weight", label: "w1", value: 1.0, x: 170, yPct: 0.15 },
        { type: "weight", label: "w2", value: 1.0, x: 170, yPct: 0.4 },
        { type: "weight", label: "w3", value: 1.0, x: 170, yPct: 0.6 },
        { type: "weight", label: "w4", value: 1.0, x: 170, yPct: 0.85 },
        { type: "bias", label: "b1", value: -0.5, x: 280, yPct: 0.15 },
        { type: "bias", label: "b2", value: -1.5, x: 280, yPct: 0.85 },
        { type: "neuron", label: "h1", value: 0, activation: "sigmoid", x: 340, yPct: 0.3 },
        { type: "neuron", label: "h2", value: 0, activation: "sigmoid", x: 340, yPct: 0.7 },
        { type: "weight", label: "w5", value: 1.0, x: 470, yPct: 0.35 },
        { type: "weight", label: "w6", value: -2.0, x: 470, yPct: 0.65 },
        { type: "bias", label: "b3", value: -0.5, x: 530, yPct: 0.85 },
        { type: "neuron", label: "out", value: 0, activation: "sigmoid", x: 590, yPct: 0.5 },
      ],
      connections: [
        [0, 2], [0, 3], [1, 4], [1, 5],
        [2, 8], [4, 8], [6, 8],
        [3, 9], [5, 9], [7, 9],
        [8, 10], [9, 11],
        [10, 13], [11, 13], [12, 13],
        [13, "output"],
      ],
    },
    "nand-gate": {
      name: "NAND Gate",
      nodes: [
        { type: "input", label: "x1", value: 1.0, x: 60, yPct: 0.3 },
        { type: "input", label: "x2", value: 1.0, x: 60, yPct: 0.7 },
        { type: "weight", label: "w1", value: -1.0, x: 220, yPct: 0.3 },
        { type: "weight", label: "w2", value: -1.0, x: 220, yPct: 0.7 },
        { type: "bias", label: "b", value: 1.5, x: 340, yPct: 0.82 },
        { type: "neuron", label: "neuron", value: 0, activation: "sigmoid", x: 420, yPct: 0.5 },
      ],
      connections: [[0, 2], [1, 3], [2, 5], [3, 5], [4, 5], [5, "output"]],
    },
    "deep-network": {
      name: "Deep Network (3 Hidden)",
      nodes: [
        { type: "input", label: "x1", value: 1.0, x: 30, yPct: 0.3 },
        { type: "input", label: "x2", value: 0.5, x: 30, yPct: 0.7 },
        // Layer 1 weights
        { type: "weight", label: "w1", value: 0.6, x: 120, yPct: 0.15 },
        { type: "weight", label: "w2", value: -0.4, x: 120, yPct: 0.38 },
        { type: "weight", label: "w3", value: 0.7, x: 120, yPct: 0.62 },
        { type: "weight", label: "w4", value: 0.3, x: 120, yPct: 0.85 },
        // Layer 1 neurons
        { type: "neuron", label: "h1", value: 0, activation: "relu", x: 220, yPct: 0.25 },
        { type: "neuron", label: "h2", value: 0, activation: "relu", x: 220, yPct: 0.75 },
        { type: "bias", label: "b1", value: 0.1, x: 165, yPct: 0.05 },
        { type: "bias", label: "b2", value: -0.1, x: 165, yPct: 0.95 },
        // Layer 2 weights
        { type: "weight", label: "w5", value: 0.5, x: 310, yPct: 0.15 },
        { type: "weight", label: "w6", value: -0.6, x: 310, yPct: 0.38 },
        { type: "weight", label: "w7", value: 0.4, x: 310, yPct: 0.62 },
        { type: "weight", label: "w8", value: 0.8, x: 310, yPct: 0.85 },
        // Layer 2 neurons
        { type: "neuron", label: "h3", value: 0, activation: "relu", x: 410, yPct: 0.25 },
        { type: "neuron", label: "h4", value: 0, activation: "relu", x: 410, yPct: 0.75 },
        { type: "bias", label: "b3", value: 0.0, x: 355, yPct: 0.05 },
        { type: "bias", label: "b4", value: 0.1, x: 355, yPct: 0.95 },
        // Layer 3 weights
        { type: "weight", label: "w9", value: 0.7, x: 500, yPct: 0.25 },
        { type: "weight", label: "w10", value: -0.5, x: 500, yPct: 0.75 },
        // Layer 3 neuron
        { type: "neuron", label: "h5", value: 0, activation: "sigmoid", x: 590, yPct: 0.5 },
        { type: "bias", label: "b5", value: -0.2, x: 545, yPct: 0.9 },
      ],
      connections: [
        [0, 2], [0, 3], [1, 4], [1, 5],
        [2, 6], [4, 6], [8, 6],
        [3, 7], [5, 7], [9, 7],
        [6, 10], [6, 11], [7, 12], [7, 13],
        [10, 14], [12, 14], [16, 14],
        [11, 15], [13, 15], [17, 15],
        [14, 18], [15, 19],
        [18, 20], [19, 20], [21, 20],
        [20, "output"],
      ],
    },
    "regression": {
      name: "Function Approximator",
      nodes: [
        { type: "input", label: "x1", value: 0.5, x: 40, yPct: 0.5 },
        // Wide hidden layer — 4 neurons
        { type: "weight", label: "w1", value: 1.2, x: 150, yPct: 0.1 },
        { type: "weight", label: "w2", value: -0.8, x: 150, yPct: 0.35 },
        { type: "weight", label: "w3", value: 0.5, x: 150, yPct: 0.65 },
        { type: "weight", label: "w4", value: -1.5, x: 150, yPct: 0.9 },
        { type: "bias", label: "b1", value: -0.5, x: 230, yPct: 0.02 },
        { type: "bias", label: "b2", value: 0.3, x: 230, yPct: 0.27 },
        { type: "bias", label: "b3", value: -0.2, x: 230, yPct: 0.73 },
        { type: "bias", label: "b4", value: 0.8, x: 230, yPct: 0.98 },
        { type: "neuron", label: "h1", value: 0, activation: "tanh", x: 290, yPct: 0.12 },
        { type: "neuron", label: "h2", value: 0, activation: "tanh", x: 290, yPct: 0.37 },
        { type: "neuron", label: "h3", value: 0, activation: "tanh", x: 290, yPct: 0.63 },
        { type: "neuron", label: "h4", value: 0, activation: "tanh", x: 290, yPct: 0.88 },
        // Output weights
        { type: "weight", label: "w5", value: 0.6, x: 420, yPct: 0.12 },
        { type: "weight", label: "w6", value: -0.4, x: 420, yPct: 0.37 },
        { type: "weight", label: "w7", value: 0.9, x: 420, yPct: 0.63 },
        { type: "weight", label: "w8", value: -0.3, x: 420, yPct: 0.88 },
        { type: "bias", label: "b5", value: 0.0, x: 530, yPct: 0.85 },
        { type: "neuron", label: "out", value: 0, activation: "linear", x: 560, yPct: 0.5 },
      ],
      connections: [
        [0, 1], [0, 2], [0, 3], [0, 4],
        [1, 9], [5, 9],
        [2, 10], [6, 10],
        [3, 11], [7, 11],
        [4, 12], [8, 12],
        [9, 13], [10, 14], [11, 15], [12, 16],
        [13, 18], [14, 18], [15, 18], [16, 18], [17, 18],
        [18, "output"],
      ],
    },
    "classifier": {
      name: "Binary Classifier",
      nodes: [
        { type: "input", label: "x1", value: 1.0, x: 30, yPct: 0.3 },
        { type: "input", label: "x2", value: 0.5, x: 30, yPct: 0.7 },
        // 6 weights for 2 inputs × 3 hidden neurons
        { type: "weight", label: "w1", value: 0.8, x: 140, yPct: 0.08 },
        { type: "weight", label: "w2", value: -0.6, x: 140, yPct: 0.22 },
        { type: "weight", label: "w3", value: 0.4, x: 140, yPct: 0.42 },
        { type: "weight", label: "w4", value: 0.9, x: 140, yPct: 0.58 },
        { type: "weight", label: "w5", value: -0.3, x: 140, yPct: 0.78 },
        { type: "weight", label: "w6", value: 0.7, x: 140, yPct: 0.92 },
        // 3 hidden neurons + biases
        { type: "bias", label: "b1", value: -0.2, x: 230, yPct: 0.04 },
        { type: "bias", label: "b2", value: 0.1, x: 230, yPct: 0.46 },
        { type: "bias", label: "b3", value: -0.3, x: 230, yPct: 0.96 },
        { type: "neuron", label: "h1", value: 0, activation: "relu", x: 290, yPct: 0.15 },
        { type: "neuron", label: "h2", value: 0, activation: "relu", x: 290, yPct: 0.5 },
        { type: "neuron", label: "h3", value: 0, activation: "relu", x: 290, yPct: 0.85 },
        // Output weights + bias + sigmoid
        { type: "weight", label: "w7", value: 0.5, x: 420, yPct: 0.2 },
        { type: "weight", label: "w8", value: -0.7, x: 420, yPct: 0.5 },
        { type: "weight", label: "w9", value: 0.6, x: 420, yPct: 0.8 },
        { type: "bias", label: "b4", value: -0.1, x: 480, yPct: 0.92 },
        { type: "neuron", label: "out", value: 0, activation: "sigmoid", x: 550, yPct: 0.5 },
      ],
      connections: [
        [0, 2], [0, 4], [0, 6],
        [1, 3], [1, 5], [1, 7],
        [2, 11], [3, 11], [8, 11],
        [4, 12], [5, 12], [9, 12],
        [6, 13], [7, 13], [10, 13],
        [11, 14], [12, 15], [13, 16],
        [14, 18], [15, 18], [16, 18], [17, 18],
        [18, "output"],
      ],
    },
    "digit-recognizer": (() => {
      const W = 5, H = 5, PIXELS = W * H;
      const HIDDEN = 4;
      const nodes = [];
      const conns = [];

      for (let i = 0; i < PIXELS; i++) {
        const row = Math.floor(i / W), col = i % W;
        nodes.push({
          type: "input", label: "p" + (i + 1), value: 0,
          x: 30, yPct: (i + 0.5) / PIXELS,
        });
      }

      const wBase = nodes.length;
      for (let h = 0; h < HIDDEN; h++) {
        for (let p = 0; p < PIXELS; p++) {
          const val = Math.round((Math.random() * 0.6 - 0.3) * 100) / 100;
          nodes.push({
            type: "weight", label: "w" + (h * PIXELS + p + 1), value: val,
            x: 160, yPct: (h * PIXELS + p + 0.5) / (HIDDEN * PIXELS),
          });
          conns.push([p, wBase + h * PIXELS + p]);
        }
      }

      const bBase = nodes.length;
      for (let h = 0; h < HIDDEN; h++) {
        nodes.push({
          type: "bias", label: "b" + (h + 1), value: 0.0,
          x: 280, yPct: (h + 0.5) / HIDDEN * 0.15 + (h * 0.22 + 0.06),
        });
      }

      const nBase = nodes.length;
      for (let h = 0; h < HIDDEN; h++) {
        nodes.push({
          type: "neuron", label: "h" + (h + 1), value: 0, activation: "relu",
          x: 340, yPct: (h + 0.5) / HIDDEN,
        });
        for (let p = 0; p < PIXELS; p++) {
          conns.push([wBase + h * PIXELS + p, nBase + h]);
        }
        conns.push([bBase + h, nBase + h]);
      }

      const ow = nodes.length;
      for (let h = 0; h < HIDDEN; h++) {
        nodes.push({
          type: "weight", label: "v" + (h + 1), value: Math.round((Math.random() * 0.8 - 0.4) * 100) / 100,
          x: 460, yPct: (h + 0.5) / HIDDEN,
        });
        conns.push([nBase + h, ow + h]);
      }

      const outBias = nodes.length;
      nodes.push({ type: "bias", label: "b5", value: 0.0, x: 520, yPct: 0.88 });

      const outNeuron = nodes.length;
      nodes.push({ type: "neuron", label: "out", value: 0, activation: "sigmoid", x: 560, yPct: 0.5 });
      for (let h = 0; h < HIDDEN; h++) conns.push([ow + h, outNeuron]);
      conns.push([outBias, outNeuron]);
      conns.push([outNeuron, "output"]);

      const zero = [
        0,1,1,1,0,
        1,0,0,0,1,
        1,0,0,0,1,
        1,0,0,0,1,
        0,1,1,1,0,
      ];
      const one = [
        0,0,1,0,0,
        0,1,1,0,0,
        0,0,1,0,0,
        0,0,1,0,0,
        0,1,1,1,0,
      ];
      const zero2 = [
        1,1,1,1,1,
        1,0,0,0,1,
        1,0,0,0,1,
        1,0,0,0,1,
        1,1,1,1,1,
      ];
      const one2 = [
        0,1,1,0,0,
        0,0,1,0,0,
        0,0,1,0,0,
        0,0,1,0,0,
        0,0,1,1,0,
      ];

      return {
        name: "5×5 Digit Recognizer",
        nodes,
        connections: conns,
        imageMode: { width: W, height: H },
        sampleData: [
          { inputs: zero, expected: 0 },
          { inputs: one, expected: 1 },
          { inputs: zero2, expected: 0 },
          { inputs: one2, expected: 1 },
        ],
      };
    })(),
    "image-10x10": (() => {
      const W = 10, H = 10, PIXELS = W * H;
      const HIDDEN = 8;
      const nodes = [];
      const conns = [];
      const scale = 0.08;

      for (let i = 0; i < PIXELS; i++) {
        nodes.push({
          type: "input", label: "p" + (i + 1), value: 0,
          x: 28, yPct: (i + 0.5) / PIXELS,
        });
      }

      const wBase = nodes.length;
      for (let h = 0; h < HIDDEN; h++) {
        for (let p = 0; p < PIXELS; p++) {
          const val = (Math.random() * 2 - 1) * scale;
          nodes.push({
            type: "weight", label: "w" + (h * PIXELS + p + 1), value: val,
            x: 140, yPct: (h * PIXELS + p + 0.5) / (HIDDEN * PIXELS),
          });
          conns.push([p, wBase + h * PIXELS + p]);
        }
      }

      const bBase = nodes.length;
      for (let h = 0; h < HIDDEN; h++) {
        nodes.push({
          type: "bias", label: "b" + (h + 1), value: 0,
          x: 260, yPct: (h + 0.5) / HIDDEN * 0.2 + 0.02,
        });
      }

      const nBase = nodes.length;
      for (let h = 0; h < HIDDEN; h++) {
        nodes.push({
          type: "neuron", label: "h" + (h + 1), value: 0, activation: "relu",
          x: 320, yPct: (h + 0.5) / HIDDEN,
        });
        for (let p = 0; p < PIXELS; p++) conns.push([wBase + h * PIXELS + p, nBase + h]);
        conns.push([bBase + h, nBase + h]);
      }

      const ow = nodes.length;
      for (let h = 0; h < HIDDEN; h++) {
        nodes.push({
          type: "weight", label: "v" + (h + 1), value: (Math.random() * 2 - 1) * 0.3,
          x: 420, yPct: (h + 0.5) / HIDDEN,
        });
        conns.push([nBase + h, ow + h]);
      }

      const outBias = nodes.length;
      nodes.push({ type: "bias", label: "bo", value: 0, x: 480, yPct: 0.92 });

      const outNeuron = nodes.length;
      nodes.push({ type: "neuron", label: "out", value: 0, activation: "sigmoid", x: 520, yPct: 0.5 });
      for (let h = 0; h < HIDDEN; h++) conns.push([ow + h, outNeuron]);
      conns.push([outBias, outNeuron]);
      conns.push([outNeuron, "output"]);

      function ring10() {
        const a = [];
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
          const on = r === 0 || r === H - 1 || c === 0 || c === W - 1;
          a.push(on ? 1 : 0);
        }
        return a;
      }

      function vertLine10(col) {
        const a = [];
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++)
          a.push(c === col ? 1 : 0);
        return a;
      }

      function block10(r0, c0, r1, c1) {
        const a = [];
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++)
          a.push(r >= r0 && r <= r1 && c >= c0 && c <= c1 ? 1 : 0);
        return a;
      }

      return {
        name: "10×10 Image Recognizer",
        nodes,
        connections: conns,
        imageMode: { width: W, height: H },
        sampleData: [
          { inputs: ring10(), expected: 0 },
          { inputs: vertLine10(5), expected: 1 },
          { inputs: block10(2, 2, 7, 7), expected: 0 },
          { inputs: vertLine10(2), expected: 1 },
          { inputs: ring10(), expected: 0 },
          { inputs: vertLine10(8), expected: 1 },
        ],
      };
    })(),
  };

  function loadTemplate(tpl) {
    clearAll();
    deactivateImageMode();

    const cRect = canvas.getBoundingClientRect();
    const h = cRect.height;

    const createdIds = [];
    const batchNodes = tpl.nodes.length > 80;
    const fragment = batchNodes ? document.createDocumentFragment() : null;

    tpl.nodes.forEach((spec) => {
      const y = spec.yPct * h - 40;
      const id = createNode(spec.type, spec.label, spec.x, y, fragment);
      const node = nodes.get(id);
      if (node) {
        node.value = spec.value;
        if (spec.activation) node.activation = spec.activation;
        updateNodeDisplay(node);

        if (spec.type === "activation" || spec.type === "neuron") {
          const iconMap = { sigmoid: "σ", relu: "R", tanh: "tanh", linear: "f" };
          if (spec.type === "activation") {
            node.el.querySelector(".node-icon").textContent = iconMap[node.activation] || node.activation;
          }
        }
      }
      createdIds.push(id);
    });

    if (fragment) canvas.appendChild(fragment);

    if (batchNodes) {
      const appearingEls = canvas.querySelectorAll(".nn-node.appearing");
      setTimeout(() => { appearingEls.forEach((el) => el.classList.remove("appearing")); }, 300);
    }

    requestAnimationFrame(() => {
      const svgFrag = batchNodes && tpl.connections.length > 100 ? document.createDocumentFragment() : null;
      tpl.connections.forEach(([fromIdx, toIdx]) => {
        const fromId = createdIds[fromIdx];
        const toId = toIdx === "output" ? OUTPUT_NODE_ID : createdIds[toIdx];
        if (!fromId || !toId) return;

        const conn = { from: fromId, to: toId, svgPath: null };
        if (svgFrag) {
          conn.svgPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
          conn.svgPath.classList.add("connection-line");
          conn.svgPath.style.pointerEvents = "stroke";
          conn.svgPath.addEventListener("click", () => removeConnection(conn));
          svgFrag.appendChild(conn.svgPath);
        }
        connections.push(conn);
        if (!svgFrag) drawConnection(conn);
      });

      if (svgFrag) {
        svgLayer.appendChild(svgFrag);
        redrawConnections();
      }
      invalidateIncomingCache();

      if (tpl.sampleData) {
        trainingData = tpl.sampleData.map((r) => ({
          inputs: [...r.inputs],
          expected: r.expected,
        }));
      }

      if (tpl.imageMode) {
        activateImageMode(tpl.imageMode.width, tpl.imageMode.height);
      } else {
        rebuildTableHeaders();
        renderDatasetTable();
      }
    });
  }

  // ─── Tutorial System (Side Panel) ──────────────────────────────

  const tutorialPanel = document.getElementById("tutorialPanel");
  const tutorialContent = document.getElementById("tutorialContent");
  const tutorialDots = document.getElementById("tutorialDots");
  const tutorialProgressBar = document.getElementById("tutorialProgressBar");
  const tutorialClose = document.getElementById("tutorialClose");
  const tutorialPrev = document.getElementById("tutorialPrev");
  const tutorialNext = document.getElementById("tutorialNext");
  const btnTutorial = document.getElementById("btnTutorial");

  let tutorialStep = 0;

  const TUTORIAL_STEPS = [
    {
      title: "Welcome to Neural Lab",
      subtitle: "Your interactive playground for understanding neural networks",
      html: `
        <p>Neural networks are the backbone of modern AI — from image recognition to language models. But how do they actually work?</p>
        <p>This tutorial will walk you through <span class="tut-highlight">every core concept</span>, step by step. You can interact with the canvas while reading — try things as you go!</p>
        <p>By the end you'll understand:</p>
        <ul>
          <li><strong>Inputs & features</strong> — how data enters the network</li>
          <li><strong>Weights</strong> — how the network learns what matters</li>
          <li><strong>Neurons & summation</strong> — how signals are combined</li>
          <li><strong>Bias</strong> — the network's adjustable threshold</li>
          <li><strong>Activation functions</strong> — why non-linearity is essential</li>
          <li><strong>Forward propagation</strong> — watching numbers flow through the network</li>
          <li><strong>Training & backpropagation</strong> — how the network learns from data</li>
          <li><strong>Datasets</strong> — importing, exporting, and generating training data</li>
          <li><strong>Image recognition</strong> — teaching a network to see with pixel grids</li>
          <li><strong>Cloud training</strong> — offloading to a remote PyTorch server</li>
        </ul>
        <div class="tut-tip">This tutorial stays open on the side — you can interact with the canvas while reading. Close and reopen it from the <strong>Tutorial</strong> button any time.</div>
      `,
    },
    {
      title: "Step 1: Inputs (x)",
      subtitle: "Data enters the network as numbers",
      html: `
        <p>Every neural network starts with <span class="tut-highlight">inputs</span>. These are the raw data values you feed into the network — for example, the pixel brightness of an image, a person's age, or a temperature reading.</p>
        <p>In Neural Lab, inputs are the <span class="tut-highlight">purple nodes</span> labeled x<sub>1</sub>, x<sub>2</sub>, x<sub>3</sub>, etc.</p>
        <div class="tut-diagram">
          <div class="dia-node dia-input">x<sub>1</sub></div>
          <div class="dia-node dia-input">x<sub>2</sub></div>
          <div class="dia-node dia-input">x<sub>3</sub></div>
        </div>
        <p>Each input carries a single numerical value. For a network predicting house prices, x<sub>1</sub> might be square footage (e.g., 1500), x<sub>2</sub> the number of bedrooms (3), and x<sub>3</sub> the distance to a school (0.5 miles).</p>
        <div class="tut-concept">In real networks, inputs are often <strong>normalized</strong> (scaled to a small range like 0–1) so that no single feature dominates the computation.</div>
        <div class="tut-try">Try it: Drag an <strong>Input x<sub>1</sub></strong> from the sidebar onto the canvas, then double-click it to change its value. You can interact with the canvas while this tutorial is open!</div>
      `,
    },
    {
      title: "Step 2: Weights (w)",
      subtitle: "How the network decides what matters",
      html: `
        <p><span class="tut-highlight">Weights</span> are the heart of learning. Each connection between nodes has a weight that controls <strong>how much influence</strong> one node has on the next.</p>
        <div class="tut-diagram">
          <div class="dia-node dia-input">x<sub>1</sub></div>
          <span class="dia-arrow">&rarr;</span>
          <div class="dia-node dia-weight">w<sub>1</sub></div>
          <span class="dia-arrow">&rarr;</span>
          <div class="dia-node dia-neuron">&Sigma;</div>
        </div>
        <p>When data flows from an input to a neuron, it is <strong>multiplied</strong> by the weight:</p>
        <div class="tut-equation">signal = x<sub>1</sub> &times; w<sub>1</sub></div>
        <p>A <strong>large positive weight</strong> (e.g., 2.0) amplifies the signal — it says "this input is very important!"</p>
        <p>A <strong>weight near zero</strong> (e.g., 0.01) mutes the input — "ignore this."</p>
        <p>A <strong>negative weight</strong> (e.g., -1.5) inverts and amplifies — "the opposite of this input matters."</p>
        <div class="tut-concept">During training, a learning algorithm (like gradient descent) automatically adjusts weights to reduce prediction error. This is how the network "learns."</div>
        <div class="tut-try">Try it: Load the <strong>"Single Neuron"</strong> template from the Templates menu. Change w<sub>1</sub> to different values and press <strong>Run</strong> to see how the output changes.</div>
      `,
    },
    {
      title: "Step 3: The Neuron (Σ)",
      subtitle: "Where signals meet and combine",
      html: `
        <p>A <span class="tut-highlight">neuron</span> (or "node") is the core computing unit. It does two things:</p>
        <ul>
          <li><strong>Sum</strong> all incoming weighted signals</li>
          <li>Pass the sum through an <strong>activation function</strong></li>
        </ul>
        <p>If a neuron receives inputs x<sub>1</sub> through x<sub>n</sub>, each with weight w<sub>i</sub>, and has a bias b, it computes:</p>
        <div class="tut-equation">z = (x<sub>1</sub> &times; w<sub>1</sub>) + (x<sub>2</sub> &times; w<sub>2</sub>) + ... + (x<sub>n</sub> &times; w<sub>n</sub>) + b</div>
        <div class="tut-diagram">
          <div class="dia-node dia-input">x<sub>1</sub></div>
          <span class="dia-arrow">&rarr;</span>
          <div class="dia-node dia-weight">w<sub>1</sub></div>
          <span class="dia-arrow">&searr;</span>
          <div class="dia-node dia-neuron">&Sigma;</div>
          <span class="dia-arrow">&rarr;</span>
          <div class="dia-node dia-output">&ycirc;</div>
        </div>
        <p>Think of a neuron like a <strong>decision point</strong>. It gathers evidence from multiple sources, weighs each piece, and produces a single verdict.</p>
        <div class="tut-tip">In Neural Lab, the neuron's <strong>teal/cyan nodes</strong> labeled &Sigma; perform this summation. They glow brighter when their computed value is higher.</div>
        <div class="tut-try">Try it: Load the <strong>"Two Inputs"</strong> template. Watch how both weighted inputs feed into the neuron when you press <strong>Run</strong>.</div>
      `,
    },
    {
      title: "Step 4: Bias (b)",
      subtitle: "The network's adjustable threshold",
      html: `
        <p><span class="tut-highlight">Bias</span> is an extra value added to the weighted sum <em>before</em> the activation function. It shifts the decision boundary, allowing the neuron to activate even when all inputs are zero.</p>
        <div class="tut-equation">z = (x<sub>1</sub> &times; w<sub>1</sub>) + (x<sub>2</sub> &times; w<sub>2</sub>) + <strong style="color:var(--accent-pink)">b</strong></div>
        <div class="tut-diagram">
          <div class="dia-node dia-input">x<sub>1</sub></div>
          <span class="dia-arrow">&rarr;</span>
          <div class="dia-node dia-weight">w<sub>1</sub></div>
          <span class="dia-arrow">&searr;</span>
          <div class="dia-node dia-neuron">&Sigma;</div>
          <span class="dia-arrow">&swarr;</span>
          <div class="dia-node dia-bias">b</div>
        </div>
        <p><strong>Why does bias matter?</strong> Imagine a line on a graph — weights control the <em>slope</em>, but bias controls where the line <em>crosses the axis</em>. Without bias, every line would pass through the origin.</p>
        <p>A <strong>positive bias</strong> makes the neuron more likely to fire. A <strong>negative bias</strong> makes it harder to activate — like raising a threshold.</p>
        <div class="tut-concept">In the AND gate template, the bias is set to <strong>-1.5</strong>. This means both inputs need to contribute enough signal to overcome this threshold, mimicking the AND logic.</div>
        <div class="tut-try">Try it: Load <strong>"Neuron with Bias"</strong>. Change the bias from -0.5 to +2.0 and hit <strong>Run</strong> — see how the output jumps up.</div>
      `,
    },
    {
      title: "Step 5: Activation Functions",
      subtitle: "Adding non-linearity — what makes neural nets powerful",
      html: `
        <p>After summing inputs, the result passes through an <span class="tut-highlight">activation function</span>. This is the secret ingredient that lets neural networks learn complex, non-linear patterns.</p>
        <p>Without activation functions, stacking layers would just produce a fancier linear equation — no more powerful than a single layer.</p>
        <p><strong>Sigmoid (&sigma;)</strong> — squashes any value into the range (0, 1). Great for probabilities.</p>
        <div class="tut-equation">&sigma;(z) = 1 / (1 + e<sup>-z</sup>)</div>
        <p><strong>ReLU</strong> — outputs zero for negatives, passes positives unchanged. Fast and popular in modern networks.</p>
        <div class="tut-equation">ReLU(z) = max(0, z)</div>
        <p><strong>Tanh</strong> — like sigmoid, but squashes to (-1, 1). Centers outputs around zero.</p>
        <div class="tut-diagram">
          <div class="dia-node dia-activation">&sigma;</div>
          <span style="color:var(--text-muted);font-size:0.8rem;">0 to 1</span>
          &emsp;
          <div class="dia-node dia-activation">R</div>
          <span style="color:var(--text-muted);font-size:0.8rem;">0 to &infin;</span>
          &emsp;
          <div class="dia-node dia-activation">tanh</div>
          <span style="color:var(--text-muted);font-size:0.8rem;">-1 to 1</span>
        </div>
        <div class="tut-tip">In Neural Lab, you can add a standalone activation node (green), or set the activation function directly on a neuron by double-clicking it.</div>
        <div class="tut-try">Try it: Build a simple chain — <strong>Input &rarr; Weight &rarr; Neuron &rarr; Output</strong>. Set the neuron's activation to ReLU, give the input a negative value, and press <strong>Run</strong>. The output should be 0!</div>
      `,
    },
    {
      title: "Step 6: Forward Propagation",
      subtitle: "How a prediction travels through the network",
      html: `
        <p><span class="tut-highlight">Forward propagation</span> is the process of passing data through the entire network, layer by layer, from inputs to the final output.</p>
        <p>Here's the full picture:</p>
        <div class="tut-diagram">
          <div class="dia-node dia-input">x<sub>1</sub></div>
          <span class="dia-arrow">&rarr;</span>
          <div class="dia-node dia-weight">w<sub>1</sub></div>
          <span class="dia-arrow">&searr;</span>
          <div class="dia-node dia-neuron">&Sigma;</div>
          <span class="dia-arrow">&rarr;</span>
          <div class="dia-node dia-activation">&sigma;</div>
          <span class="dia-arrow">&rarr;</span>
          <div class="dia-node dia-output">&ycirc;</div>
        </div>
        <p>Step by step:</p>
        <ul>
          <li><strong>Multiply</strong> each input by its corresponding weight</li>
          <li><strong>Sum</strong> all weighted inputs plus the bias at the neuron</li>
          <li><strong>Apply</strong> the activation function to the sum</li>
          <li><strong>Pass</strong> the result to the next layer (or to the output)</li>
        </ul>
        <p>When you press <strong>Run</strong>, you'll see actual <span class="tut-highlight">numbers travel along the connections</span> — showing the computed value at each step and the operation being performed (like &times;W or &sigma;).</p>
        <p><strong>Animation speed:</strong> Use the <strong>speed slider</strong> in the bottom-right corner to slow down or speed up the forward pass animation. A slower speed makes it easier to follow each value as it transforms through the network.</p>
        <div class="tut-concept"><strong>Layers</strong> in real networks: Most practical networks have multiple layers. The input layer feeds a "hidden" layer (or many), which feeds the output layer. Each layer can learn progressively more abstract features.</div>
        <div class="tut-try">Try it: Load the <strong>"Two-Layer Network"</strong> template, set the speed slider to 0.5&times;, and press <strong>Run</strong>. Watch numbers flow through each connection and transform at every node.</div>
      `,
    },
    {
      title: "Step 7: Logic Gates — Your First Network",
      subtitle: "Proving a neural network can think (a little bit)",
      html: `
        <p>A classic way to prove neural networks can compute is to make them replicate <span class="tut-highlight">logic gates</span>.</p>
        <p><strong>AND Gate:</strong> Output is 1 only when <em>both</em> inputs are 1.</p>
        <p>Using a sigmoid neuron with weights w<sub>1</sub> = 1, w<sub>2</sub> = 1, and bias = -1.5:</p>
        <ul>
          <li>x<sub>1</sub>=0, x<sub>2</sub>=0 → z = -1.5 → &sigma;(-1.5) ≈ <strong>0.18</strong> (low, ≈ 0)</li>
          <li>x<sub>1</sub>=1, x<sub>2</sub>=0 → z = -0.5 → &sigma;(-0.5) ≈ <strong>0.38</strong> (low, ≈ 0)</li>
          <li>x<sub>1</sub>=1, x<sub>2</sub>=1 → z = 0.5 → &sigma;(0.5) ≈ <strong>0.62</strong> (high, ≈ 1)</li>
        </ul>
        <p><strong>OR Gate:</strong> Output is 1 when <em>any</em> input is 1. Same setup but bias = -0.5.</p>
        <div class="tut-concept">A single neuron can only learn <strong>linearly separable</strong> patterns (AND, OR, NOT). It <em>cannot</em> learn XOR — that requires at least two layers. This was a famous limitation discovered in 1969!</div>
        <div class="tut-try">Try it: Load the <strong>"AND Gate"</strong> template. Change x<sub>1</sub> and x<sub>2</sub> between 0 and 1, pressing <strong>Run</strong> each time. Verify the AND truth table. Then try the <strong>"OR Gate"</strong>.</div>
      `,
    },
    {
      title: "Step 8: Training — How Networks Learn",
      subtitle: "Gradient descent and the training loop",
      html: `
        <p>So far, you've been setting weights by hand. But in real neural networks, <span class="tut-highlight">training</span> adjusts weights and biases automatically to minimize prediction error.</p>
        <p>Here's the core loop:</p>
        <ul>
          <li><strong>1. Forward pass</strong> — feed inputs through the network, get a prediction &#375;</li>
          <li><strong>2. Compute loss</strong> — measure how wrong the prediction is (e.g., Mean Squared Error: (&#375; - y)&sup2;)</li>
          <li><strong>3. Compute gradients</strong> — figure out which direction to nudge each weight to reduce the loss</li>
          <li><strong>4. Update weights</strong> — adjust each weight by a small step in the gradient direction</li>
          <li><strong>5. Repeat</strong> — do this for many <strong>epochs</strong> (passes through the data) until the loss is small</li>
        </ul>
        <div class="tut-equation">w<sub>new</sub> = w<sub>old</sub> - learning_rate &times; &part;Loss/&part;w</div>
        <p>The <span class="tut-highlight">learning rate</span> controls the step size. Too large and the network overshoots; too small and it learns painfully slowly.</p>
        <div class="tut-concept"><strong>Gradient descent</strong> is like rolling a ball downhill on the loss landscape. The gradient tells you the steepest direction down, and the learning rate controls how far you roll each step.</div>
        <div class="tut-tip">Neural Lab uses <strong>numerical gradient estimation</strong> — it slightly wiggles each weight and measures how the loss changes. This works for any network topology you build!</div>
      `,
    },
    {
      title: "Step 9: The Training Panel",
      subtitle: "Providing data and watching the network learn",
      html: `
        <p>Neural Lab has a built-in <span class="tut-highlight">Training Panel</span> where you can teach your network. Click the green <strong>Train</strong> button in the header to open it.</p>
        <p><strong>The Dataset Editor:</strong></p>
        <ul>
          <li>The table auto-detects your input nodes (x<sub>1</sub>, x<sub>2</sub>, ...) and creates columns for each</li>
          <li>The last column is the <strong>expected output</strong> — what the network <em>should</em> produce</li>
          <li>Click <strong>+ Add Row</strong> to add training examples</li>
          <li>Edit any cell by clicking on it and typing a new number</li>
        </ul>
        <p><strong>Importing &amp; exporting data:</strong></p>
        <ul>
          <li><strong>Drag &amp; drop</strong> a CSV or JSON file directly onto the training panel</li>
          <li>Or click <strong>Import CSV/JSON</strong> to browse for a file</li>
          <li>Click <strong>Export CSV</strong> to download your current dataset as a <code>.csv</code> file — useful for saving your work or sharing data</li>
          <li>CSV format: one header row, then one row per example, last column = expected output</li>
          <li>JSON format: an array of objects like <code>[{"x1": 0, "x2": 1, "expected": 1}]</code> or arrays like <code>[[0, 1, 1]]</code></li>
        </ul>
        <p><strong>AI Data Generator:</strong></p>
        <ul>
          <li>At the bottom of the dataset section, use the <strong>AI Data Generator</strong></li>
          <li>Type a description like <strong>"AND gate truth table"</strong>, <strong>"y = 2*x + 1 with 10 points"</strong>, or <strong>"XOR"</strong></li>
          <li>Click <strong>Generate</strong> to auto-fill the dataset</li>
        </ul>
        <p><strong>Training controls:</strong></p>
        <ul>
          <li><strong>Learning Rate</strong> — how aggressively to update weights (try 0.1 – 2.0)</li>
          <li><strong>Epochs</strong> — how many times to loop through the entire dataset</li>
          <li>Press <strong>Train Network</strong> and watch the loss curve drop in real time!</li>
          <li><strong>Reset Weights</strong> — reverts all weights and biases back to their pre-training values so you can try again with different settings</li>
        </ul>
        <p>After training finishes, the status bar shows the <strong>elapsed time</strong> so you can compare how long different configurations take.</p>
        <div class="tut-try">Try it: Load the <strong>"AND Gate"</strong> template. Open the training panel, type <strong>"AND gate"</strong> in the AI generator and hit Generate. Set learning rate to 2.0, epochs to 1000, and press <strong>Train</strong>. Watch the weights and bias adjust themselves!</div>
      `,
    },
    {
      title: "Step 10: Cloud GPU Training",
      subtitle: "Free GPU-accelerated training via Google Colab",
      html: `
        <p>The default training engine uses <strong>numerical gradient estimation</strong> in your browser — great for learning, but slow for complex networks. Neural Lab supports <span class="tut-highlight">Cloud GPU Training</span> via Google Colab, giving you free access to an NVIDIA T4 GPU with real PyTorch backpropagation.</p>
        <p><strong>What changes with Cloud Training:</strong></p>
        <ul>
          <li><strong>Real backpropagation</strong> — uses PyTorch autograd (the chain rule) instead of numerical wiggling, which is far more accurate and efficient</li>
          <li><strong>Free GPU</strong> — Google Colab provides a T4 GPU at no cost, making training dramatically faster</li>
          <li><strong>Scales better</strong> — handles larger networks and bigger datasets</li>
        </ul>
        <p><strong>How to set it up (free):</strong></p>
        <ul>
          <li>Sign up for a free account at <strong>ngrok.com</strong> and copy your auth token from the dashboard</li>
          <li>Open the notebook <code>cloud-server/Neural_Lab_Cloud.ipynb</code> in <strong>Google Colab</strong></li>
          <li>Go to <strong>Runtime &rarr; Change runtime type</strong> and select <strong>T4 GPU</strong></li>
          <li>Paste your ngrok auth token into Cell 2</li>
          <li>Run all cells &mdash; an <strong>ngrok URL</strong> will be printed at the bottom</li>
          <li>In Neural Lab, open Train, toggle <strong>Cloud GPU</strong> on, paste the ngrok URL</li>
          <li>Click <strong>Test</strong> to verify the connection, then train as normal</li>
        </ul>
        <div class="tut-concept"><strong>Free GPU access.</strong> Colab's free tier gives you an NVIDIA T4 GPU. The ngrok URL is temporary and changes each session, so you'll need to re-copy it when you restart the notebook.</div>
        <div class="tut-tip">Toggle cloud off any time to go back to the local engine for quick experiments. Your endpoint URL is saved automatically.</div>
        <div class="tut-try">Try it: Open the Colab notebook, run all cells, paste the URL into Neural Lab, and train an AND gate with 2000 epochs on the GPU!</div>
      `,
    },
    {
      title: "Step 11: Image Recognition",
      subtitle: "Teaching a network to see",
      html: `
        <p>Neural networks can learn to <span class="tut-highlight">recognize images</span> — even simple ones. The <strong>5&times;5 Digit Recognizer</strong> template under Advanced demonstrates this.</p>
        <p>It uses <strong>25 pixel inputs</strong> (a 5&times;5 grid) and a hidden layer to distinguish the digit "0" from "1".</p>
        <p><strong>How the pixel editor works:</strong></p>
        <ul>
          <li>When an image template is loaded, a <strong>pixel grid</strong> appears where you can click or drag to paint black and white pixels</li>
          <li>Set the <strong>expected output</strong> (e.g., 0 for the digit zero, 1 for the digit one)</li>
          <li>Click <strong>Add to Table</strong> to save the drawn pattern as a training row</li>
          <li>A <strong>sample gallery</strong> shows thumbnails of all your training images — click to reload, &times; to delete</li>
        </ul>
        <p>Each pixel becomes a 0 or 1 input to the network, and training teaches the network which pixel patterns correspond to which digit.</p>
        <div class="tut-concept">This is exactly how real image classifiers start — convert pixels to numbers, feed them through layers, and train. The only difference is scale: real networks use millions of pixels and thousands of neurons.</div>
        <div class="tut-try">Try it: Load the <strong>"5&times;5 Digit Recognizer"</strong> template. Draw a few patterns of 0 and 1, add them to the table, and train with 2000 epochs. Then draw a new pattern and press <strong>Run</strong> to see if it classifies correctly!</div>
      `,
    },
    {
      title: "Step 12: Putting It All Together",
      subtitle: "From playground to real AI",
      html: `
        <p>You've now learned every building block of a neural network — and how to train one. Here's how it all scales to real-world AI:</p>
        <ul>
          <li><strong>More inputs</strong> — an image has thousands of pixels, each one an input</li>
          <li><strong>More neurons</strong> — hidden layers may have hundreds or thousands of neurons</li>
          <li><strong>More layers</strong> — "deep" learning means many layers stacked together</li>
          <li><strong>Training at scale</strong> — real networks train on millions of examples using GPUs, with the same gradient descent loop you just used</li>
          <li><strong>Backpropagation</strong> — in practice, gradients are computed analytically (much faster than numerical estimation) using the chain rule of calculus</li>
        </ul>
        <p>The same fundamental mechanics you've explored here — multiply, sum, activate, propagate, compute loss, update weights — power everything from ChatGPT to self-driving cars.</p>
        <div class="tut-diagram">
          <div class="dia-node dia-input" style="opacity:0.6;width:38px;height:38px;font-size:0.7rem;">x<sub>1</sub></div>
          <div class="dia-node dia-input" style="opacity:0.7;width:38px;height:38px;font-size:0.7rem;">x<sub>2</sub></div>
          <div class="dia-node dia-input" style="opacity:0.8;width:38px;height:38px;font-size:0.7rem;">...</div>
          <div class="dia-node dia-input" style="width:38px;height:38px;font-size:0.7rem;">x<sub>n</sub></div>
          <span class="dia-arrow">&rarr;</span>
          <div class="dia-node dia-neuron" style="width:44px;height:44px;font-size:0.8rem;">&Sigma;</div>
          <div class="dia-node dia-neuron" style="width:44px;height:44px;font-size:0.8rem;">&Sigma;</div>
          <div class="dia-node dia-neuron" style="width:44px;height:44px;font-size:0.8rem;">...</div>
          <span class="dia-arrow">&rarr;</span>
          <div class="dia-node dia-neuron" style="width:44px;height:44px;font-size:0.8rem;">&Sigma;</div>
          <span class="dia-arrow">&rarr;</span>
          <div class="dia-node dia-output" style="width:44px;height:44px;font-size:0.8rem;">&ycirc;</div>
        </div>
        <p><strong>Navigating the canvas:</strong></p>
        <ul>
          <li><strong>Scroll wheel</strong> to zoom in and out</li>
          <li><strong>Click and drag</strong> on the canvas background to pan around</li>
          <li>Use the <strong>Fit</strong> button to reset the view</li>
        </ul>
        <p><strong>Saving your work:</strong> Use <strong>Export CSV</strong> in the training panel to download your dataset for later, and <strong>Import CSV/JSON</strong> to load it back.</p>
        <div class="tut-tip"><strong>Keep experimenting!</strong> Try building your own networks, use the AI generator for training data, and tweak learning rates. Try training an OR gate, then see if a single neuron can learn XOR (spoiler: it can't — you'll need a hidden layer!).</div>
        <p style="text-align:center; margin-top:20px; font-size:0.95rem;">
          <span class="tut-highlight">You now understand how neural networks work and learn. Happy building!</span>
        </p>
      `,
    },
  ];

  function openTutorial(step = 0) {
    tutorialStep = clamp(step, 0, TUTORIAL_STEPS.length - 1);
    tutorialPanel.classList.remove("hidden");
    renderTutorialStep();
  }

  function closeTutorial() {
    tutorialPanel.classList.add("hidden");
  }

  function renderTutorialStep() {
    const step = TUTORIAL_STEPS[tutorialStep];
    const total = TUTORIAL_STEPS.length;

    tutorialContent.innerHTML = `
      <h2>${step.title}</h2>
      <p class="tut-subtitle">${step.subtitle}</p>
      ${step.html}
    `;

    tutorialProgressBar.style.width = ((tutorialStep + 1) / total * 100) + "%";

    tutorialDots.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const dot = document.createElement("div");
      dot.className = "dot" + (i === tutorialStep ? " active" : "");
      dot.addEventListener("click", () => {
        tutorialStep = i;
        renderTutorialStep();
      });
      tutorialDots.appendChild(dot);
    }

    tutorialPrev.style.visibility = tutorialStep === 0 ? "hidden" : "visible";
    tutorialNext.textContent = tutorialStep === total - 1 ? "Finish" : "Next";

    tutorialContent.scrollTop = 0;
  }

  tutorialNext.addEventListener("click", () => {
    if (tutorialStep < TUTORIAL_STEPS.length - 1) {
      tutorialStep++;
      renderTutorialStep();
    } else {
      closeTutorial();
    }
  });

  tutorialPrev.addEventListener("click", () => {
    if (tutorialStep > 0) {
      tutorialStep--;
      renderTutorialStep();
    }
  });

  tutorialClose.addEventListener("click", closeTutorial);

  btnTutorial.addEventListener("click", () => {
    if (tutorialPanel.classList.contains("hidden")) {
      openTutorial(tutorialStep);
    } else {
      closeTutorial();
    }
  });

  // ─── Training Panel ─────────────────────────────────────────────

  const trainingPanel = document.getElementById("trainingPanel");
  const btnTrainOpen = document.getElementById("btnTrain");
  const tpCloseBtn = document.getElementById("tpClose");
  const tpLearningRate = document.getElementById("tpLearningRate");
  const tpEpochs = document.getElementById("tpEpochs");
  const btnStartTrain = document.getElementById("btnStartTrain");
  const btnStopTrain = document.getElementById("btnStopTrain");
  const tpTableHead = document.getElementById("tpTableHead");
  const tpTableBody = document.getElementById("tpTableBody");
  const tpDropZone = document.getElementById("tpDropZone");
  const tpFileInput = document.getElementById("tpFileInput");
  const tpEpochDisplay = document.getElementById("tpEpochDisplay");
  const tpLossDisplay = document.getElementById("tpLossDisplay");
  const tpStatusDisplay = document.getElementById("tpStatusDisplay");
  const tpLossChart = document.getElementById("tpLossChart");
  const tpProgressWrapper = document.getElementById("tpProgressWrapper");
  const tpProgressBar = document.getElementById("tpProgressBar");
  const btnAddRow = document.getElementById("btnAddRow");
  const btnClearData = document.getElementById("btnClearData");

  let trainingData = [];
  let isTraining = false;
  let stopTraining = false;
  let lossHistory = [];
  let savedWeights = null;

  function openTrainingPanel() {
    trainingPanel.classList.remove("hidden");
    rebuildTableHeaders();
    renderDatasetTable();
    tpDropZone.classList.add("active");
    setTimeout(() => tpDropZone.classList.remove("active"), 0);
  }

  function closeTrainingPanel() {
    trainingPanel.classList.add("hidden");
    if (isTraining) {
      stopTraining = true;
    }
  }

  btnTrainOpen.addEventListener("click", openTrainingPanel);
  tpCloseBtn.addEventListener("click", closeTrainingPanel);

  function getInputNodeLabels() {
    const labels = [];
    nodes.forEach((n) => {
      if (n.type === "input") labels.push(n.label);
    });
    labels.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, "")) || 0;
      const numB = parseInt(b.replace(/\D/g, "")) || 0;
      return numA - numB;
    });
    return [...new Set(labels)];
  }

  function getInputNodeByLabel(label) {
    for (const [, n] of nodes) {
      if (n.type === "input" && n.label === label) return n;
    }
    return null;
  }

  function getTrainableNodes() {
    const trainable = [];
    nodes.forEach((n) => {
      if (n.type === "weight" || n.type === "bias") trainable.push(n);
    });
    return trainable;
  }

  function rebuildTableHeaders() {
    const labels = getInputNodeLabels();
    let html = "<tr>";
    labels.forEach((l) => {
      html += `<th>${formatSubscript(l)}</th>`;
    });
    html += `<th class="th-expected">Expected (y)</th><th></th></tr>`;
    tpTableHead.innerHTML = html;
  }

  function renderDatasetTable() {
    const labels = getInputNodeLabels();
    const colCount = labels.length;

    tpTableBody.innerHTML = "";

    if (trainingData.length === 0) {
      addEmptyRow();
      return;
    }

    const useFragment = trainingData.length > 25;
    const fragment = useFragment ? document.createDocumentFragment() : null;

    trainingData.forEach((row, ri) => {
      const tr = document.createElement("tr");
      for (let ci = 0; ci < colCount; ci++) {
        const td = document.createElement("td");
        const inp = document.createElement("input");
        inp.type = "number";
        inp.step = "0.1";
        inp.value = row.inputs[ci] ?? 0;
        inp.addEventListener("change", () => {
          trainingData[ri].inputs[ci] = parseFloat(inp.value) || 0;
        });
        td.appendChild(inp);
        tr.appendChild(td);
      }

      const tdY = document.createElement("td");
      tdY.className = "td-expected";
      const inpY = document.createElement("input");
      inpY.type = "number";
      inpY.step = "0.1";
      inpY.value = row.expected ?? 0;
      inpY.addEventListener("change", () => {
        trainingData[ri].expected = parseFloat(inpY.value) || 0;
      });
      tdY.appendChild(inpY);
      tr.appendChild(tdY);

      const tdDel = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "tp-row-delete";
      delBtn.textContent = "\u00d7";
      delBtn.addEventListener("click", () => {
        trainingData.splice(ri, 1);
        renderDatasetTable();
      });
      tdDel.appendChild(delBtn);
      tr.appendChild(tdDel);

      if (fragment) fragment.appendChild(tr);
      else tpTableBody.appendChild(tr);
    });

    if (fragment) tpTableBody.appendChild(fragment);
  }

  function addEmptyRow() {
    const labels = getInputNodeLabels();
    trainingData.push({
      inputs: labels.map(() => 0),
      expected: 0,
    });
    renderDatasetTable();
  }

  btnAddRow.addEventListener("click", addEmptyRow);

  btnClearData.addEventListener("click", () => {
    trainingData = [];
    lossHistory = [];
    renderDatasetTable();
    renderLossChart();
    tpEpochDisplay.textContent = "—";
    tpLossDisplay.textContent = "—";
    tpStatusDisplay.textContent = "Idle";
    if (imageMode) renderSampleGallery();
  });

  // ─── Image Mode (Pixel Grid Editor) ──────────────────────────

  const tpImageGrid = document.getElementById("tpImageGrid");
  const tpPixelGrid = document.getElementById("tpPixelGrid");
  const tpSampleGallery = document.getElementById("tpSampleGallery");
  const tpSampleCount = document.getElementById("tpSampleCount");
  const btnAddSample = document.getElementById("btnAddSample");
  const btnClearPixels = document.getElementById("btnClearPixels");
  const tpImageExpected = document.getElementById("tpImageExpected");
  const tpTableWrapper = document.getElementById("tpTableWrapper");

  let imageMode = null;
  let pixelCells = [];
  let isPainting = false;
  let paintValue = 1;

  function calcGridDims(count) {
    if (count <= 0) return { width: 1, height: 1 };
    const sq = Math.sqrt(count);
    let w = Math.round(sq);
    let h = Math.ceil(count / w);
    while (w * h < count) h++;
    return { width: w, height: h };
  }

  function activateImageMode(w, h) {
    const count = w * h;
    imageMode = { width: w, height: h, total: count };

    buildPixelGrid(w, h, count);
    tpImageGrid.classList.remove("hidden");
    tpTableWrapper.classList.add("hidden");
    tpDropZone.classList.add("hidden");
    renderSampleGallery();
  }

  function deactivateImageMode() {
    imageMode = null;
    tpImageGrid.classList.add("hidden");
    tpTableWrapper.classList.remove("hidden");
    tpDropZone.classList.remove("hidden");
  }

  function buildPixelGrid(w, h, total) {
    tpPixelGrid.innerHTML = "";
    tpPixelGrid.style.gridTemplateColumns = `repeat(${w}, 30px)`;
    pixelCells = [];

    const frag = document.createDocumentFragment();
    for (let i = 0; i < w * h; i++) {
      const cell = document.createElement("div");
      if (i < total) {
        cell.className = "tp-pixel";
        cell.dataset.idx = i;

        cell.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          isPainting = true;
          paintValue = cell.classList.contains("active") ? 0 : 1;
          setPixel(cell, paintValue);
          tpPixelGrid.setPointerCapture(e.pointerId);
        });

        cell.addEventListener("pointerenter", () => {
          if (isPainting) setPixel(cell, paintValue);
        });
      } else {
        cell.className = "tp-pixel tp-pixel-unused";
      }

      frag.appendChild(cell);
      pixelCells.push(cell);
    }
    tpPixelGrid.appendChild(frag);

    tpPixelGrid.addEventListener("pointerup", () => { isPainting = false; });
    tpPixelGrid.addEventListener("pointerleave", () => { isPainting = false; });
  }

  function setPixel(cell, val) {
    if (val) cell.classList.add("active");
    else cell.classList.remove("active");
  }

  function getPixelValues() {
    const total = imageMode ? imageMode.total : pixelCells.length;
    return pixelCells.slice(0, total).map((c) => c.classList.contains("active") ? 1 : 0);
  }

  function clearPixelGrid() {
    pixelCells.forEach((c) => c.classList.remove("active"));
  }

  function loadPixelsFromArray(arr) {
    pixelCells.forEach((c, i) => {
      if (i < arr.length && arr[i]) c.classList.add("active");
      else c.classList.remove("active");
    });
  }

  btnAddSample.addEventListener("click", () => {
    const inputs = getPixelValues();
    const expected = parseFloat(tpImageExpected.value) || 0;
    trainingData.push({ inputs, expected });
    renderDatasetTable();
    renderSampleGallery();
    clearPixelGrid();
  });

  btnClearPixels.addEventListener("click", clearPixelGrid);

  function renderSampleGallery() {
    if (!imageMode) return;
    const gw = imageMode.width;
    const total = imageMode.total;
    tpSampleGallery.innerHTML = "";
    tpSampleCount.textContent = `(${trainingData.length})`;

    const frag = document.createDocumentFragment();
    trainingData.forEach((row, ri) => {
      const thumb = document.createElement("div");
      thumb.className = "tp-sample-thumb";
      thumb.style.gridTemplateColumns = `repeat(${gw}, 5px)`;

      for (let i = 0; i < gw * imageMode.height; i++) {
        const px = document.createElement("div");
        if (i < total) {
          px.className = "thumb-pixel " + (row.inputs[i] ? "on" : "off");
        } else {
          px.className = "thumb-pixel off";
        }
        thumb.appendChild(px);
      }

      const label = document.createElement("div");
      label.className = "thumb-label";
      label.textContent = row.expected;
      thumb.appendChild(label);

      const del = document.createElement("div");
      del.className = "thumb-delete";
      del.textContent = "\u00d7";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        trainingData.splice(ri, 1);
        renderSampleGallery();
      });
      thumb.appendChild(del);

      thumb.addEventListener("click", () => {
        loadPixelsFromArray(row.inputs);
        tpImageExpected.value = row.expected;
      });

      frag.appendChild(thumb);
    });
    tpSampleGallery.appendChild(frag);
  }

  // ─── File Import (CSV / JSON) ─────────────────────────────────

  tpFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importFile(file);
    tpFileInput.value = "";
  });

  // ─── Folder Import (CSV + images) ─────────────────────────────

  const tpFolderInput = document.getElementById("tpFolderInput");
  const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

  function parseLabelsCSV(text) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 1) return new Map();
    const rawHeader = (lines[0] || "").toLowerCase();
    const header = lines[0].split(/[,\t;]/).map((h) => h.trim().toLowerCase());
    const fileCol = header.findIndex((h) => /^(file|filename|image|path|name)$/.test(h));
    const expectCol = header.findIndex((h) => /^(expected|label|y|class|target|output)$/.test(h));
    const useHeader = fileCol >= 0 || expectCol >= 0 || lines.length > 1;
    const map = new Map();
    const start = useHeader && (fileCol >= 0 || expectCol >= 0) ? 1 : 0;
    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(/[,\t;]/).map((p) => p.trim());
      let filename = "";
      let expected = 0;
      if (useHeader && header.length >= 2) {
        filename = parts[fileCol >= 0 ? fileCol : 0] || "";
        expected = parseFloat(parts[expectCol >= 0 ? expectCol : 1]) || 0;
      } else {
        filename = parts[0] || "";
        expected = parseFloat(parts[1]) || 0;
      }
      if (filename) map.set(filename, expected);
      const base = filename.replace(/\.[^.]+$/, "");
      if (base && base !== filename) map.set(base, expected);
    }
    return map;
  }

  function imageFileToPixelArray(file, gridW, gridH, total) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        canvas.width = gridW;
        canvas.height = gridH;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, gridW, gridH);
        const data = ctx.getImageData(0, 0, gridW, gridH).data;
        const out = [];
        for (let i = 0; i < total && i < gridW * gridH; i++) {
          const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
          const gray = (r + g + b) / 3 / 255;
          out.push(gray > 0.5 ? 1 : 0);
        }
        while (out.length < total) out.push(0);
        resolve(out);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load image: " + file.name));
      };
      img.src = url;
    });
  }

  tpFolderInput.addEventListener("change", async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) { e.target.value = ""; return; }
    const files = Array.from(fileList);
    const inputCount = getInputNodeLabels().length;
    if (inputCount === 0) {
      tpStatusDisplay.textContent = "Build a network first (e.g. load 10×10 or 5×5 Image Recognizer).";
      e.target.value = "";
      return;
    }

    const dims = calcGridDims(inputCount);
    const gridW = dims.width;
    const gridH = dims.height;
    const total = gridW * gridH;

    let csvText = null;
    const csvFile = files.find((f) => /\.csv$/i.test(f.name));
    if (csvFile) {
      csvText = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsText(csvFile);
      });
    }

    const labelsByFile = csvText ? parseLabelsCSV(csvText) : new Map();
    const imageFiles = files.filter((f) => IMAGE_EXT.test(f.name));

    if (imageFiles.length === 0) {
      tpStatusDisplay.textContent = "No image files (.png, .jpg, .gif, .webp) found in folder.";
      e.target.value = "";
      return;
    }

    tpStatusDisplay.textContent = `Loading ${imageFiles.length} images...`;
    tpDropZone.classList.remove("active");

    const newRows = [];
    for (const file of imageFiles) {
      const expected = labelsByFile.get(file.name) ?? labelsByFile.get(file.name.replace(/\.[^.]+$/, "")) ?? 0;
      try {
        const inputs = await imageFileToPixelArray(file, gridW, gridH, total);
        newRows.push({ inputs, expected });
      } catch (err) {
        console.warn(err);
      }
    }

    trainingData = newRows;
    rebuildTableHeaders();
    renderDatasetTable();
    if (imageMode) renderSampleGallery();
    tpStatusDisplay.textContent = csvText
      ? `Loaded ${newRows.length} images from folder (labels from CSV).`
      : `Loaded ${newRows.length} images (no CSV: expected=0 for all). Add a CSV with "file,expected" for labels.`;
    e.target.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) => {
    tpDropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      tpDropZone.classList.add("drag-hover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    tpDropZone.addEventListener(evt, () => {
      tpDropZone.classList.remove("drag-hover");
    });
  });

  tpDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) importFile(file);
  });

  trainingPanel.addEventListener("dragenter", () => {
    tpDropZone.classList.add("active");
  });

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result.trim();
      try {
        if (file.name.endsWith(".json")) {
          parseJSON(text);
        } else {
          parseCSV(text);
        }
        rebuildTableHeaders();
        renderDatasetTable();
        tpDropZone.classList.remove("active");
        tpStatusDisplay.textContent = `Loaded ${trainingData.length} rows`;
      } catch (err) {
        tpStatusDisplay.textContent = "Import error: " + err.message;
      }
    };
    reader.readAsText(file);
  }

  function parseCSV(text) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error("Need header + at least 1 data row");

    const header = lines[0].split(/[,\t;]/);
    const inputLabels = getInputNodeLabels();
    const dataRows = lines.slice(1);

    trainingData = dataRows.map((line) => {
      const vals = line.split(/[,\t;]/).map((v) => parseFloat(v.trim()) || 0);
      const expected = vals.pop();
      return {
        inputs: vals.slice(0, inputLabels.length),
        expected: expected ?? 0,
      };
    });
  }

  function parseJSON(text) {
    const data = JSON.parse(text);
    const inputLabels = getInputNodeLabels();

    if (Array.isArray(data)) {
      trainingData = data.map((row) => {
        if (Array.isArray(row)) {
          const expected = row.pop();
          return { inputs: row.slice(0, inputLabels.length), expected: expected ?? 0 };
        }
        const inputs = [];
        inputLabels.forEach((l) => {
          inputs.push(parseFloat(row[l]) || 0);
        });
        const expected = parseFloat(row.expected ?? row.y ?? row.output ?? 0);
        return { inputs, expected };
      });
    } else {
      throw new Error("JSON must be an array of rows");
    }
  }

  // ─── CSV Export ─────────────────────────────────────────────────

  const btnExportCsv = document.getElementById("btnExportCsv");
  btnExportCsv.addEventListener("click", () => {
    if (trainingData.length === 0) {
      tpStatusDisplay.textContent = "Nothing to export";
      return;
    }
    const labels = getInputNodeLabels();
    const header = [...labels, "expected"].join(",");
    const rows = trainingData.map((r) => {
      const vals = labels.map((_, i) => r.inputs[i] ?? 0);
      vals.push(r.expected);
      return vals.join(",");
    });
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "neural-lab-dataset.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    tpStatusDisplay.textContent = `Exported ${trainingData.length} rows`;
  });

  // ─── AI Data Generator ──────────────────────────────────────────

  const aiDataPrompt = document.getElementById("aiDataPrompt");
  const btnAiGenerate = document.getElementById("btnAiGenerate");
  const aiDataStatus = document.getElementById("aiDataStatus");

  btnAiGenerate.addEventListener("click", generateAiData);
  aiDataPrompt.addEventListener("keydown", (e) => {
    if (e.key === "Enter") generateAiData();
  });

  function generateAiData() {
    const prompt = aiDataPrompt.value.trim().toLowerCase();
    if (!prompt) {
      showAiStatus("Type a description first", "error");
      return;
    }

    const inputLabels = getInputNodeLabels();
    const numInputs = inputLabels.length;

    if (numInputs === 0) {
      showAiStatus("Add input nodes to your network first", "error");
      return;
    }

    let generated = null;

    if (/and\s*gate|and\s*truth/i.test(prompt)) {
      generated = generateTruthTable(numInputs, "and");
    } else if (/or\s*gate|or\s*truth/i.test(prompt)) {
      generated = generateTruthTable(numInputs, "or");
    } else if (/nand/i.test(prompt)) {
      generated = generateTruthTable(numInputs, "nand");
    } else if (/nor\b/i.test(prompt)) {
      generated = generateTruthTable(numInputs, "nor");
    } else if (/xor/i.test(prompt)) {
      generated = generateTruthTable(numInputs, "xor");
    } else if (/xnor/i.test(prompt)) {
      generated = generateTruthTable(numInputs, "xnor");
    } else if (/not\s*gate/i.test(prompt)) {
      generated = [
        { inputs: [0], expected: 1 },
        { inputs: [1], expected: 0 },
      ];
    } else if (/linear|y\s*=/.test(prompt)) {
      generated = generateLinearData(prompt, numInputs);
    } else if (/quadratic|parabola|x\s*(\^2|\*\*2|squared)/.test(prompt)) {
      generated = generateQuadraticData(prompt, numInputs);
    } else if (/sine|sin\s*\(|cosine|cos\s*\(/.test(prompt)) {
      generated = generateTrigData(prompt, numInputs);
    } else if (/random|noise|scatter/.test(prompt)) {
      generated = generateRandomData(prompt, numInputs);
    } else if (/identity|pass\s*through/.test(prompt)) {
      generated = generateFunctionData(numInputs, (xs) => xs.reduce((a, b) => a + b, 0), prompt);
    } else if (/classif|binary|0\s*(or|and|\/)\s*1/.test(prompt)) {
      generated = generateBinaryClassification(numInputs, prompt);
    } else {
      generated = parseSimpleExpression(prompt, numInputs);
    }

    if (!generated || generated.length === 0) {
      showAiStatus("Couldn't understand that. Try: 'AND gate', 'y = 2*x + 1', 'XOR', 'random 20 rows', 'quadratic'", "error");
      return;
    }

    trainingData = generated;
    rebuildTableHeaders();
    renderDatasetTable();
    showAiStatus(`Generated ${generated.length} rows`, "success");
  }

  function showAiStatus(msg, cls) {
    aiDataStatus.textContent = msg;
    aiDataStatus.className = "tp-ai-status " + (cls || "");
  }

  function generateTruthTable(numInputs, gate) {
    const n = Math.min(numInputs, 4);
    const rows = 1 << n;
    const data = [];
    for (let i = 0; i < rows; i++) {
      const bits = [];
      for (let b = n - 1; b >= 0; b--) bits.push((i >> b) & 1);
      let expected;
      switch (gate) {
        case "and":  expected = bits.every(v => v === 1) ? 1 : 0; break;
        case "or":   expected = bits.some(v => v === 1) ? 1 : 0; break;
        case "nand": expected = bits.every(v => v === 1) ? 0 : 1; break;
        case "nor":  expected = bits.some(v => v === 1) ? 0 : 1; break;
        case "xor":  expected = bits.reduce((a, b) => a ^ b, 0); break;
        case "xnor": expected = bits.reduce((a, b) => a ^ b, 0) ? 0 : 1; break;
        default:     expected = 0;
      }
      const inputs = bits.slice();
      while (inputs.length < numInputs) inputs.push(0);
      data.push({ inputs, expected });
    }
    return data;
  }

  function generateLinearData(prompt, numInputs) {
    const countMatch = prompt.match(/(\d+)\s*(points?|rows?|samples?|data)/);
    const count = countMatch ? parseInt(countMatch[1]) : 10;

    const coeffs = [];
    const termPattern = /([+-]?\s*\d*\.?\d+)\s*\*?\s*x(\d*)/g;
    let m;
    while ((m = termPattern.exec(prompt)) !== null) {
      const coeff = parseFloat(m[1].replace(/\s/g, "")) || 1;
      const idx = m[2] ? parseInt(m[2]) - 1 : 0;
      coeffs[idx] = coeff;
    }

    const interceptMatch = prompt.match(/[+-]\s*(\d+\.?\d*)\s*$/);
    const intercept = interceptMatch ? parseFloat(interceptMatch[0].replace(/\s/g, "")) : 0;

    if (coeffs.length === 0) coeffs[0] = 1;

    const data = [];
    for (let i = 0; i < count; i++) {
      const inputs = [];
      let y = intercept;
      for (let j = 0; j < numInputs; j++) {
        const x = parseFloat(((i / (count - 1 || 1)) * 2 - 1).toFixed(2));
        inputs.push(x);
        y += (coeffs[j] || 0) * x;
      }
      data.push({ inputs, expected: parseFloat(y.toFixed(4)) });
    }
    return data;
  }

  function generateQuadraticData(prompt, numInputs) {
    const countMatch = prompt.match(/(\d+)\s*(points?|rows?|samples?|data)/);
    const count = countMatch ? parseInt(countMatch[1]) : 10;
    const data = [];
    for (let i = 0; i < count; i++) {
      const inputs = [];
      let y = 0;
      for (let j = 0; j < numInputs; j++) {
        const x = parseFloat(((i / (count - 1 || 1)) * 4 - 2).toFixed(2));
        inputs.push(x);
        y += x * x;
      }
      data.push({ inputs, expected: parseFloat(y.toFixed(4)) });
    }
    return data;
  }

  function generateTrigData(prompt, numInputs) {
    const isCos = /cos/i.test(prompt);
    const countMatch = prompt.match(/(\d+)\s*(points?|rows?|samples?|data)/);
    const count = countMatch ? parseInt(countMatch[1]) : 12;
    const data = [];
    for (let i = 0; i < count; i++) {
      const x = parseFloat(((i / (count - 1 || 1)) * 2 * Math.PI).toFixed(3));
      const inputs = [x];
      while (inputs.length < numInputs) inputs.push(0);
      const y = isCos ? Math.cos(x) : Math.sin(x);
      data.push({ inputs, expected: parseFloat(y.toFixed(4)) });
    }
    return data;
  }

  function generateRandomData(prompt, numInputs) {
    const countMatch = prompt.match(/(\d+)\s*(points?|rows?|samples?|data)?/);
    const count = countMatch ? Math.min(parseInt(countMatch[1]), 200) : 20;
    const data = [];
    for (let i = 0; i < count; i++) {
      const inputs = [];
      for (let j = 0; j < numInputs; j++) {
        inputs.push(parseFloat((Math.random() * 2 - 1).toFixed(2)));
      }
      const expected = parseFloat((Math.random()).toFixed(3));
      data.push({ inputs, expected });
    }
    return data;
  }

  function generateFunctionData(numInputs, fn, prompt) {
    const countMatch = prompt.match(/(\d+)\s*(points?|rows?|samples?|data)/);
    const count = countMatch ? parseInt(countMatch[1]) : 10;
    const data = [];
    for (let i = 0; i < count; i++) {
      const inputs = [];
      for (let j = 0; j < numInputs; j++) {
        inputs.push(parseFloat(((i / (count - 1 || 1)) * 2 - 1).toFixed(2)));
      }
      data.push({ inputs, expected: parseFloat(fn(inputs).toFixed(4)) });
    }
    return data;
  }

  function generateBinaryClassification(numInputs, prompt) {
    const countMatch = prompt.match(/(\d+)\s*(points?|rows?|samples?|data)/);
    const count = countMatch ? parseInt(countMatch[1]) : 20;
    const data = [];
    for (let i = 0; i < count; i++) {
      const inputs = [];
      for (let j = 0; j < numInputs; j++) {
        inputs.push(parseFloat((Math.random() * 2 - 1).toFixed(2)));
      }
      const expected = inputs.reduce((a, b) => a + b, 0) > 0 ? 1 : 0;
      data.push({ inputs, expected });
    }
    return data;
  }

  function parseSimpleExpression(prompt, numInputs) {
    const exprMatch = prompt.match(/y\s*=\s*(.+)/i) || prompt.match(/output\s*=\s*(.+)/i);
    if (!exprMatch) return null;

    let expr = exprMatch[1].trim();
    const countMatch = prompt.match(/(\d+)\s*(points?|rows?|samples?|data)/);
    const count = countMatch ? parseInt(countMatch[1]) : 10;

    const data = [];
    try {
      for (let i = 0; i < count; i++) {
        const inputs = [];
        let evalExpr = expr;
        for (let j = 0; j < numInputs; j++) {
          const x = (i / (count - 1 || 1)) * 2 - 1;
          inputs.push(parseFloat(x.toFixed(2)));
          evalExpr = evalExpr.replace(new RegExp(`x${j + 1}`, "g"), `(${x})`);
        }
        evalExpr = evalExpr.replace(/x\b/g, `(${inputs[0]})`);
        evalExpr = evalExpr.replace(/\^/g, "**");
        const y = Function(`"use strict"; return (${evalExpr})`)();
        if (typeof y === "number" && isFinite(y)) {
          data.push({ inputs, expected: parseFloat(y.toFixed(4)) });
        }
      }
    } catch {
      return null;
    }
    return data.length > 0 ? data : null;
  }

  // ─── Training Engine (Numerical Gradient Descent) ─────────────

  function computeSilent() {
    const cache = new Map();

    function compute(nodeId) {
      if (cache.has(nodeId)) return cache.get(nodeId);
      const node = nodes.get(nodeId);
      if (!node) return 0;

      let result;

      if (node.type === "input" || node.type === "bias") {
        result = node.value;
      } else if (node.type === "weight") {
        const inc = getIncomingConnections(nodeId);
        if (inc.length === 0) { result = node.value; }
        else {
          let sum = 0;
          inc.forEach((c) => { sum += compute(c.from); });
          result = sum * node.value;
        }
      } else if (node.type === "neuron" || node.type === "activation") {
        const inc = getIncomingConnections(nodeId);
        let sum = 0;
        inc.forEach((c) => { sum += compute(c.from); });
        result = activationFn(node.activation, sum);
        node.value = result;
      } else if (node.type === "output") {
        const inc = getIncomingConnections(nodeId);
        let sum = 0;
        inc.forEach((c) => { sum += compute(c.from); });
        result = sum;
        node.value = result;
      } else {
        result = 0;
      }

      cache.set(nodeId, result);
      return result;
    }

    return compute(OUTPUT_NODE_ID);
  }

  function computeLoss(dataset) {
    const inputLabels = getInputNodeLabels();
    let totalLoss = 0;

    dataset.forEach((row) => {
      inputLabels.forEach((label, i) => {
        const n = getInputNodeByLabel(label);
        if (n) n.value = row.inputs[i] ?? 0;
      });

      const predicted = computeSilent();
      const diff = predicted - row.expected;
      totalLoss += diff * diff;
    });

    return totalLoss / dataset.length;
  }

  async function trainNetwork() {
    const inputLabels = getInputNodeLabels();
    const trainable = getTrainableNodes();

    if (inputLabels.length === 0) {
      tpStatusDisplay.textContent = "No input nodes found!";
      return;
    }
    if (trainable.length === 0) {
      tpStatusDisplay.textContent = "No weights/biases to train!";
      return;
    }
    if (trainingData.length === 0 || trainingData.every((r) => r.inputs.every((v) => v === 0) && r.expected === 0)) {
      tpStatusDisplay.textContent = "Add training data first!";
      return;
    }

    const lr = parseFloat(tpLearningRate.value) || 0.5;
    const epochs = parseInt(tpEpochs.value) || 500;
    const epsilon = 0.001;
    const gradClip = 5.0;

    isTraining = true;
    stopTraining = false;
    lossHistory = [];
    btnStartTrain.classList.add("hidden");
    btnStopTrain.classList.remove("hidden");
    tpProgressWrapper.classList.remove("hidden");
    tpStatusDisplay.textContent = "Training...";

    const t0 = performance.now();

    for (let epoch = 0; epoch < epochs; epoch++) {
      if (stopTraining) break;

      const currentLoss = computeLoss(trainingData);
      lossHistory.push(currentLoss);

      const gradients = [];
      for (const param of trainable) {
        const origVal = param.value;
        const eps = Math.max(epsilon, Math.abs(origVal) * 0.001);

        param.value = origVal + eps;
        const lossPlus = computeLoss(trainingData);

        param.value = origVal - eps;
        const lossMinus = computeLoss(trainingData);

        param.value = origVal;

        let grad = (lossPlus - lossMinus) / (2 * eps);
        grad = Math.max(-gradClip, Math.min(gradClip, grad));
        gradients.push(grad);
      }

      trainable.forEach((param, i) => {
        param.value -= lr * gradients[i];
      });

      if (epoch % 10 === 0 || epoch === epochs - 1) {
        tpEpochDisplay.textContent = `${epoch + 1} / ${epochs}`;
        tpLossDisplay.textContent = currentLoss.toFixed(6);
        tpProgressBar.style.width = ((epoch + 1) / epochs * 100) + "%";
        if (epoch % 50 === 0 || epoch === epochs - 1) renderLossChart();

        trainable.forEach((p) => updateNodeDisplay(p));
      }

      if (epoch % 20 === 0) {
        await delay(0);
      }
    }

    const finalLoss = computeLoss(trainingData);
    lossHistory.push(finalLoss);
    tpLossDisplay.textContent = finalLoss.toFixed(6);
    tpEpochDisplay.textContent = `${Math.min(lossHistory.length, parseInt(tpEpochs.value))} / ${tpEpochs.value}`;
    tpProgressBar.style.width = "100%";
    const elapsed = ((performance.now() - t0) / 1000);
    const timeStr = elapsed < 1 ? `${Math.round(elapsed * 1000)}ms`
                  : elapsed < 60 ? `${elapsed.toFixed(1)}s`
                  : `${Math.floor(elapsed / 60)}m ${Math.round(elapsed % 60)}s`;
    tpStatusDisplay.textContent = stopTraining ? `Stopped — ${timeStr}` : `Done — ${timeStr}`;
    renderLossChart();

    trainable.forEach((p) => {
      updateNodeDisplay(p);
      p.el.classList.add("training-updated");
      setTimeout(() => p.el.classList.remove("training-updated"), 500);
    });

    isTraining = false;
    stopTraining = false;
    btnStartTrain.classList.remove("hidden");
    btnStopTrain.classList.add("hidden");
  }

  function saveCurrentWeights() {
    savedWeights = [];
    nodes.forEach((n) => {
      if (n.type === "weight" || n.type === "bias") {
        savedWeights.push({ id: n.id, value: n.value });
      }
    });
    btnResetWeights.disabled = false;
  }

  const btnResetWeights = document.getElementById("btnResetWeights");
  btnResetWeights.disabled = true;

  btnResetWeights.addEventListener("click", () => {
    if (!savedWeights || isTraining) return;
    for (const sw of savedWeights) {
      const node = nodes.get(sw.id);
      if (node) {
        node.value = sw.value;
        updateNodeDisplay(node);
        node.el.classList.add("training-updated");
        setTimeout(() => node.el.classList.remove("training-updated"), 500);
      }
    }
    tpStatusDisplay.textContent = "Weights reset to pre-training values";
    lossHistory = [];
    renderLossChart();
    tpLossDisplay.textContent = "—";
    tpEpochDisplay.textContent = "—";
    tpProgressBar.style.width = "0%";
  });

  btnStartTrain.addEventListener("click", () => {
    saveCurrentWeights();
    if (useCloudTraining) {
      trainNetworkCloud();
    } else {
      trainNetwork();
    }
  });
  btnStopTrain.addEventListener("click", () => {
    stopTraining = true;
    if (cloudAbort) cloudAbort.abort();
  });

  // ─── Cloud Training ────────────────────────────────────────────

  const tpCloudToggle = document.getElementById("tpCloudToggle");
  const tpCloudBadge = document.getElementById("tpCloudBadge");
  const tpCloudUrlGroup = document.getElementById("tpCloudUrlGroup");
  const tpCloudUrl = document.getElementById("tpCloudUrl");
  const btnCloudTest = document.getElementById("btnCloudTest");
  let useCloudTraining = false;
  let cloudAbort = null;

  const savedCloudUrl = localStorage.getItem("neurallab_cloud_url");
  if (savedCloudUrl) tpCloudUrl.value = savedCloudUrl;

  tpCloudToggle.addEventListener("change", () => {
    useCloudTraining = tpCloudToggle.checked;
    if (useCloudTraining) {
      tpCloudUrlGroup.classList.remove("hidden");
      tpCloudBadge.textContent = "cloud";
      tpCloudBadge.className = "toggle-badge badge-ready";
    } else {
      tpCloudUrlGroup.classList.add("hidden");
      tpCloudBadge.className = "toggle-badge";
    }
  });

  tpCloudUrl.addEventListener("change", () => {
    localStorage.setItem("neurallab_cloud_url", tpCloudUrl.value.trim());
  });

  function isNgrokHost(host) {
    const h = host.toLowerCase();
    return h.endsWith(".ngrok-free.app") || h.endsWith(".ngrok-free.dev") || h.endsWith(".ngrok.io");
  }

  function normalizeCloudUrl(raw) {
    let s = raw.trim().replace(/\/+$/, "");
    if (!s) return s;
    try {
      if (!/^https?:\/\//i.test(s)) {
        const looksLikeNgrok = /\.(ngrok-free\.(app|dev)|ngrok\.io)(:\d+)?$/i.test(s);
        s = (looksLikeNgrok ? "https://" : "http://") + s;
      }
      const u = new URL(s);
      const host = u.hostname.toLowerCase();
      if (isNgrokHost(host)) u.protocol = "https:";
      return u.origin;
    } catch (_) {
      return raw.trim().replace(/\/+$/, "");
    }
  }

  function cloudFetch(urlPath, options = {}) {
    const base = normalizeCloudUrl(tpCloudUrl.value);
    const url = base + urlPath;
    const headers = { ...options.headers };
    try {
      const u = new URL(base);
      if (isNgrokHost(u.hostname)) headers["ngrok-skip-browser-warning"] = "1";
    } catch (_) {}
    return fetch(url, { ...options, headers });
  }

  btnCloudTest.addEventListener("click", async () => {
    const raw = tpCloudUrl.value.trim().replace(/\/+$/, "");
    if (!raw) {
      tpStatusDisplay.textContent = "Enter a cloud endpoint URL first";
      return;
    }
    const base = normalizeCloudUrl(tpCloudUrl.value);
    const pingUrl = base + "/ping";
    tpCloudBadge.textContent = "Testing...";
    tpCloudBadge.className = "toggle-badge badge-loading";
    try {
      const res = await fetch(pingUrl, { method: "GET", headers: { "ngrok-skip-browser-warning": "1" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("Content-Type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server returned non-JSON. Open the URL in a browser, click through any ngrok warning, then try again.");
      }
      const data = await res.json();
      const dev = data.device ? ` (${data.device})` : "";
      tpCloudBadge.textContent = "Connected" + dev;
      tpCloudBadge.className = "toggle-badge badge-ready";
      tpStatusDisplay.textContent = "Cloud endpoint reachable!" + dev;
    } catch (err) {
      tpCloudBadge.textContent = "Unreachable";
      tpCloudBadge.className = "toggle-badge badge-error";
      const isNetwork = err.name === "TypeError" || (err.message && (err.message.includes("fetch") || err.message.includes("network") || err.message.includes("Failed")));
      const hint = isNetwork
        ? " Open " + pingUrl + " in a new tab and click through any ngrok warning, then try Test again."
        : "";
      tpStatusDisplay.textContent = "Could not reach endpoint: " + err.message + hint;
    }
  });

  function buildCloudPayload() {
    const inputLabels = getInputNodeLabels();
    const order = topologicalOrder(OUTPUT_NODE_ID);

    const nodesObj = {};
    nodes.forEach((n, id) => {
      nodesObj[id] = {
        type: n.type,
        label: n.label,
        value: n.value,
        activation: n.activation || "linear",
      };
    });

    const conns = connections.map((c) => ({ from: c.from, to: c.to }));

    return {
      nodes: nodesObj,
      connections: conns,
      trainingData: trainingData,
      learningRate: parseFloat(tpLearningRate.value) || 0.5,
      epochs: parseInt(tpEpochs.value) || 500,
      inputLabels: inputLabels,
      topologicalOrder: order,
    };
  }

  async function trainNetworkCloud() {
    const url = tpCloudUrl.value.trim().replace(/\/+$/, "");
    if (!url) {
      tpStatusDisplay.textContent = "Enter a cloud endpoint URL first";
      return;
    }

    const inputLabels = getInputNodeLabels();
    const trainable = getTrainableNodes();

    if (inputLabels.length === 0) {
      tpStatusDisplay.textContent = "No input nodes found!";
      return;
    }
    if (trainable.length === 0) {
      tpStatusDisplay.textContent = "No weights/biases to train!";
      return;
    }
    if (trainingData.length === 0 || trainingData.every((r) => r.inputs.every((v) => v === 0) && r.expected === 0)) {
      tpStatusDisplay.textContent = "Add training data first!";
      return;
    }

    isTraining = true;
    stopTraining = false;
    lossHistory = [];
    btnStartTrain.classList.add("hidden");
    btnStopTrain.classList.remove("hidden");
    tpProgressWrapper.classList.remove("hidden");
    tpProgressBar.style.width = "0%";
    tpStatusDisplay.textContent = "Sending to cloud...";
    tpEpochDisplay.textContent = "—";
    tpLossDisplay.textContent = "—";

    cloudAbort = new AbortController();

    try {
      const payload = buildCloudPayload();

      tpStatusDisplay.textContent = `Training on cloud (${payload.epochs} epochs)...`;
      tpProgressBar.style.width = "50%";
      tpProgressBar.classList.add("indeterminate");

      const res = await cloudFetch("/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: cloudAbort.signal,
      });

      tpProgressBar.classList.remove("indeterminate");

      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();

      if (!data) throw new Error("Empty response from server");
      if (data.error) throw new Error(data.error);

      lossHistory = data.lossHistory || [];
      const finalLoss = data.finalLoss ?? (lossHistory[lossHistory.length - 1] || 0);
      const elapsed = data.elapsed ? ` in ${data.elapsed}s` : "";
      const dev = data.device ? ` on ${data.device}` : "";

      if (data.trainedWeights) {
        for (const tw of data.trainedWeights) {
          const node = nodes.get(tw.id);
          if (node) {
            node.value = tw.value;
            updateNodeDisplay(node);
            node.el.classList.add("training-updated");
            setTimeout(() => node.el.classList.remove("training-updated"), 500);
          }
        }
      }

      tpEpochDisplay.textContent = `${data.epochs || payload.epochs} / ${payload.epochs}`;
      tpLossDisplay.textContent = finalLoss.toFixed(6);
      tpProgressBar.style.width = "100%";
      tpStatusDisplay.textContent = `Done (cloud${dev}${elapsed})!`;
      renderLossChart();

    } catch (err) {
      tpProgressBar.classList.remove("indeterminate");
      if (err.name === "AbortError") {
        tpStatusDisplay.textContent = "Stopped (cloud request cancelled)";
      } else {
        tpStatusDisplay.textContent = "Cloud error: " + err.message;
      }
    }

    cloudAbort = null;
    isTraining = false;
    stopTraining = false;
    btnStartTrain.classList.remove("hidden");
    btnStopTrain.classList.add("hidden");
  }

  // ─── Loss Chart Rendering ─────────────────────────────────────

  function renderLossChart() {
    if (lossHistory.length < 2) {
      tpLossChart.innerHTML = `<text x="200" y="80" text-anchor="middle" fill="#64748b" font-size="11" font-family="system-ui">Train the network to see the loss curve</text>`;
      return;
    }

    const w = 400;
    const h = 150;
    const pad = { top: 12, right: 12, bottom: 22, left: 42 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const maxLoss = Math.max(...lossHistory) || 1;
    const minLoss = Math.min(...lossHistory);
    const range = maxLoss - minLoss || 1;

    const step = plotW / (lossHistory.length - 1);

    let pathD = "";
    let areaD = `M${pad.left},${pad.top + plotH}`;

    lossHistory.forEach((loss, i) => {
      const x = pad.left + i * step;
      const y = pad.top + plotH - ((loss - minLoss) / range) * plotH;
      if (i === 0) {
        pathD += `M${x},${y}`;
      } else {
        pathD += ` L${x},${y}`;
      }
      areaD += ` L${x},${y}`;
    });

    areaD += ` L${pad.left + (lossHistory.length - 1) * step},${pad.top + plotH} Z`;

    const gridLines = 4;
    let gridSvg = "";
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (plotH / gridLines) * i;
      const val = maxLoss - (range / gridLines) * i;
      gridSvg += `<line x1="${pad.left}" y1="${y}" x2="${w - pad.right}" y2="${y}" stroke="#2a3450" stroke-width="0.5"/>`;
      gridSvg += `<text x="${pad.left - 4}" y="${y + 3}" text-anchor="end" fill="#64748b" font-size="8" font-family="monospace">${val.toFixed(3)}</text>`;
    }

    const epochLabels = [0, Math.floor(lossHistory.length / 2), lossHistory.length - 1];
    let axisLabels = "";
    epochLabels.forEach((idx) => {
      const x = pad.left + idx * step;
      axisLabels += `<text x="${x}" y="${h - 4}" text-anchor="middle" fill="#64748b" font-size="8" font-family="monospace">${idx}</text>`;
    });

    tpLossChart.innerHTML = `
      ${gridSvg}
      <path d="${areaD}" fill="url(#lossGrad)" opacity="0.3"/>
      <path d="${pathD}" fill="none" stroke="#00CEC9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${pad.left + (lossHistory.length - 1) * step}" cy="${pad.top + plotH - ((lossHistory[lossHistory.length - 1] - minLoss) / range) * plotH}" r="3" fill="#00CEC9" filter="drop-shadow(0 0 4px rgba(0,206,201,0.6))"/>
      ${axisLabels}
      <defs>
        <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00CEC9" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#00CEC9" stop-opacity="0"/>
        </linearGradient>
      </defs>
    `;
  }

  // ─── Training panel resize handle ─────────────────────────────

  const tpDragHandle = document.getElementById("tpDragHandle");
  let tpResizing = false;
  let tpStartY = 0;
  let tpStartH = 0;

  tpDragHandle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    tpResizing = true;
    tpStartY = e.clientY;
    tpStartH = trainingPanel.offsetHeight;
    document.addEventListener("pointermove", onTpResize);
    document.addEventListener("pointerup", onTpResizeEnd);
  });

  function onTpResize(e) {
    if (!tpResizing) return;
    const dy = tpStartY - e.clientY;
    const newH = clamp(tpStartH + dy, 200, window.innerHeight * 0.7);
    trainingPanel.style.height = newH + "px";
  }

  function onTpResizeEnd() {
    tpResizing = false;
    document.removeEventListener("pointermove", onTpResize);
    document.removeEventListener("pointerup", onTpResizeEnd);
  }

  // ─── Canvas Zoom & Pan ──────────────────────────────────────────

  const canvasWrapper = document.getElementById("canvasWrapper");
  const zoomLevelEl = document.getElementById("zoomLevel");
  const btnZoomIn = document.getElementById("btnZoomIn");
  const btnZoomOut = document.getElementById("btnZoomOut");
  const btnZoomReset = document.getElementById("btnZoomReset");

  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOrigX = 0;
  let panOrigY = 0;

  function applyTransform() {
    const t = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
    canvas.style.transform = t;
    svgLayer.style.transform = t;
    canvas.style.transformOrigin = "0 0";
    svgLayer.style.transformOrigin = "0 0";
    zoomLevelEl.textContent = Math.round(zoomScale * 100) + "%";
  }

  function setZoom(newScale, cx, cy) {
    const prev = zoomScale;
    newScale = clamp(newScale, 0.2, 3);
    const ratio = newScale / prev;
    panX = cx - ratio * (cx - panX);
    panY = cy - ratio * (cy - panY);
    zoomScale = newScale;
    applyTransform();
    redrawConnections();
  }

  canvasWrapper.addEventListener("wheel", (e) => {
    if (e.target.closest(".zoom-controls")) return;
    e.preventDefault();
    const rect = canvasWrapper.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom(zoomScale * factor, cx, cy);
  }, { passive: false });

  btnZoomIn.addEventListener("click", () => {
    const rect = canvasWrapper.getBoundingClientRect();
    setZoom(zoomScale * 1.25, rect.width / 2, rect.height / 2);
  });

  btnZoomOut.addEventListener("click", () => {
    const rect = canvasWrapper.getBoundingClientRect();
    setZoom(zoomScale / 1.25, rect.width / 2, rect.height / 2);
  });

  btnZoomReset.addEventListener("click", () => {
    zoomScale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
    redrawConnections();
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      spaceHeld = true;
      canvasWrapper.classList.add("pan-ready");
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceHeld = false;
      canvasWrapper.classList.remove("pan-ready");
    }
  });

  canvasWrapper.addEventListener("pointerdown", (e) => {
    const onNode = e.target.closest(".nn-node");
    const onPort = e.target.classList.contains("node-port");
    const onControls = e.target.closest(".canvas-controls");
    const onTestPanel = e.target.closest("#testImagePanel");
    const bgClick = e.button === 0 && !onNode && !onPort && !onControls && !onTestPanel;

    if (e.button === 1 || bgClick || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panOrigX = panX;
      panOrigY = panY;
      canvasWrapper.classList.add("panning");
      canvasWrapper.setPointerCapture(e.pointerId);
    }
  });

  canvasWrapper.addEventListener("pointermove", (e) => {
    if (!isPanning) return;
    panX = panOrigX + (e.clientX - panStartX);
    panY = panOrigY + (e.clientY - panStartY);
    applyTransform();
    redrawConnections();
  });

  canvasWrapper.addEventListener("pointerup", (e) => {
    if (isPanning) {
      isPanning = false;
      canvasWrapper.classList.remove("panning");
    }
  });

  // ─── Animation speed & toggle ─────────────────────────────────

  const animSpeedSlider = document.getElementById("animSpeed");
  const animSpeedLabel = document.getElementById("animSpeedLabel");
  const btnAnimToggle = document.getElementById("btnAnimToggle");

  animSpeedSlider.addEventListener("input", () => {
    animSpeedMultiplier = parseFloat(animSpeedSlider.value);
    animSpeedLabel.textContent = animSpeedMultiplier <= 0.25 ? "¼×"
      : animSpeedMultiplier === 0.5 ? "½×"
      : animSpeedMultiplier.toFixed(1).replace(/\.0$/, "") + "×";
  });

  function updateAnimToggleLabel() {
    btnAnimToggle.textContent = animationEnabled ? "Anim On" : "Anim Off";
    btnAnimToggle.classList.toggle("active", animationEnabled);
    btnAnimToggle.title = animationEnabled ? "Animation on (click to turn off)" : "Animation off (click to turn on)";
  }
  btnAnimToggle.addEventListener("click", () => {
    animationEnabled = !animationEnabled;
    updateAnimToggleLabel();
  });
  updateAnimToggleLabel();

  // ─── Test Image Input Panel ──────────────────────────────────

  const testImagePanel = document.getElementById("testImagePanel");
  const testPixelGrid = document.getElementById("testPixelGrid");
  const testImageBadge = document.getElementById("testImageBadge");
  const btnToggleTestImage = document.getElementById("btnToggleTestImage");
  const btnTestApply = document.getElementById("btnTestApply");
  const testImageClose = document.getElementById("testImageClose");

  let testPixelCells = [];
  let testIsPainting = false;
  let testPaintValue = 1;

  function buildTestPixelGrid() {
    const labels = getInputNodeLabels();
    const count = labels.length;
    if (count === 0) return;

    const dims = calcGridDims(count);
    testImageBadge.textContent = dims.width + "\u00d7" + dims.height;
    testPixelGrid.innerHTML = "";
    testPixelGrid.style.gridTemplateColumns = `repeat(${dims.width}, 26px)`;
    testPixelCells = [];

    for (let i = 0; i < dims.width * dims.height; i++) {
      const cell = document.createElement("div");
      if (i < count) {
        cell.className = "tp-pixel";
        cell.dataset.idx = i;

        cell.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          testIsPainting = true;
          testPaintValue = cell.classList.contains("active") ? 0 : 1;
          if (testPaintValue) cell.classList.add("active");
          else cell.classList.remove("active");
          testPixelGrid.setPointerCapture(e.pointerId);
        });

        cell.addEventListener("pointerenter", () => {
          if (testIsPainting) {
            if (testPaintValue) cell.classList.add("active");
            else cell.classList.remove("active");
          }
        });
      } else {
        cell.className = "tp-pixel tp-pixel-unused";
      }

      testPixelGrid.appendChild(cell);
      testPixelCells.push(cell);
    }

    testPixelGrid.addEventListener("pointerup", () => { testIsPainting = false; });
    testPixelGrid.addEventListener("pointerleave", () => { testIsPainting = false; });
  }

  function openTestImagePanel() {
    buildTestPixelGrid();
    testImagePanel.classList.remove("hidden");
    btnToggleTestImage.classList.add("active");
  }

  function closeTestImagePanel() {
    testImagePanel.classList.add("hidden");
    btnToggleTestImage.classList.remove("active");
  }

  btnToggleTestImage.addEventListener("click", () => {
    if (testImagePanel.classList.contains("hidden")) {
      openTestImagePanel();
    } else {
      closeTestImagePanel();
    }
  });

  testImageClose.addEventListener("click", closeTestImagePanel);

  btnTestApply.addEventListener("click", () => {
    const labels = getInputNodeLabels();
    const count = labels.length;
    const values = testPixelCells.slice(0, count).map((c) =>
      c.classList.contains("active") ? 1 : 0
    );

    labels.forEach((label, i) => {
      const n = getInputNodeByLabel(label);
      if (n) {
        n.value = values[i];
        updateNodeDisplay(n);
      }
    });
  });

  // ─── Button handlers ──────────────────────────────────────────

  btnRun.addEventListener("click", runForwardPass);
  btnReset.addEventListener("click", resetActivations);
  btnClear.addEventListener("click", clearAll);

  // ─── Keyboard shortcuts ───────────────────────────────────────

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!tutorialPanel.classList.contains("hidden")) {
        closeTutorial();
        return;
      }
      if (!trainingPanel.classList.contains("hidden")) {
        closeTrainingPanel();
        return;
      }
      closeEditor();
      cleanupConnect();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (editingNode && editingNode !== OUTPUT_NODE_ID && document.activeElement.tagName !== "INPUT") {
        deleteNode(editingNode);
        closeEditor();
      }
    }
  });

  // Close editor when clicking outside
  document.addEventListener("pointerdown", (e) => {
    if (editingNode && !editorPanel.contains(e.target)) {
      const clickedNode = e.target.closest(".nn-node");
      if (!clickedNode) closeEditor();
    }
  });

  // ─── Window resize (debounced) ─────────────────────────────────

  function debounce(fn, ms) {
    let t = null;
    return () => {
      if (t) clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function onResize() {
    redrawConnections();
    const wRect = document.getElementById("canvasWrapper").getBoundingClientRect();
    outputNodeEl.style.left = (wRect.width / zoomScale - 140) + "px";
    outputNodeEl.style.top = (wRect.height / zoomScale / 2 - 45) + "px";
  }

  window.addEventListener("resize", debounce(onResize, 80));

  // ─── Initial output node position (centered right) ───────────

  function positionOutputNode() {
    const wRect = document.getElementById("canvasWrapper").getBoundingClientRect();
    outputNodeEl.style.left = (wRect.width / zoomScale - 140) + "px";
    outputNodeEl.style.top = (wRect.height / zoomScale / 2 - 45) + "px";
  }

  positionOutputNode();

  // ─── Auto-show tutorial on first visit ────────────────────────

  if (!localStorage.getItem("neurallab_visited")) {
    localStorage.setItem("neurallab_visited", "1");
    setTimeout(() => openTutorial(0), 600);
  }
})();
