// src/utils/GraphUtil.jsx

// 1. 기본 원형 그래프
export function generateGraph(rings, nodesPerRing) {
  const nodes = [];
  const links = [];
  let nodeId = 0;
  nodes.push({ id: "center", group: 0, label: "Center" });
  for (let r = 1; r <= rings; r++) {
    for (let k = 0; k < nodesPerRing; k++) {
      const angle = (2 * Math.PI * k) / nodesPerRing;
      const x = r * 50 * Math.cos(angle);
      const y = r * 50 * Math.sin(angle);
      const z = r * 25 * (k % 2 === 0 ? 1 : -1);
      const id = `node${nodeId++}`;
      nodes.push({ id, group: r, label: `R${r}-N${k + 1}`, x, y, z });
      links.push({ source: "center", target: id });
      if (k > 0) links.push({ source: `node${nodeId - 2}`, target: id });
      if (k === nodesPerRing - 1)
        links.push({ source: id, target: `node${nodeId - nodesPerRing}` });
    }
  }
  return { nodes, links };
}

// 2. 원형 그래프 클러스터 모음
export function generateMultiGraph(clusterCount = 3, rings = 3, nodesPerRing = 8, gap = 300) {
  const nodes = [];
  const links = [];
  for (let c = 0; c < clusterCount; c++) {
    const centerX = Math.cos((2 * Math.PI * c) / clusterCount) * gap;
    const centerY = Math.sin((2 * Math.PI * c) / clusterCount) * gap;
    const prefix = `C${c}_`;
    const cluster = generateGraph(rings, nodesPerRing);
    cluster.nodes.forEach((node) => {
      node.id = prefix + node.id;
      node.label = prefix + (node.label || node.id);
      node.x = (node.x || 0) + centerX;
      node.y = (node.y || 0) + centerY;
      node.z = (node.z || 0);
    });
    cluster.links.forEach((link) => {
      link.source = prefix + link.source;
      link.target = prefix + link.target;
    });
    nodes.push(...cluster.nodes);
    links.push(...cluster.links);
  }
  return { nodes, links };
}

// 3. 계층형 그래프: 수직 분리 + 랜덤 분포
export function createHierarchicalGraphLayers({ layers }) {
  if (!Array.isArray(layers) || layers.length < 2) {
    throw new Error("layers 배열이 올바르지 않거나 계층 수가 부족합니다.");
  }
  const nodes = [];
  const links = [];
  const zDistance = 200;
  const layerNodeIds = [];
  layers.forEach((layer, layerIdx) => {
    const nodeIds = [];
    const z = layerIdx * zDistance;
    for (let i = 0; i < layer.count; i++) {
      // 완전 랜덤 분포로 변경
      const spread = 200 + 200 * layerIdx;
      const x = (Math.random() - 0.5) * spread;
      const y = (Math.random() - 0.5) * spread;
      const id = `${layer.name.slice(0, 2).toUpperCase()}${i + 1}`;
      nodes.push({
        id,
        layer: layer.name,
        fx: x,
        fy: y,
        fz: z,
        name: `${layer.name} ${i + 1}`
      });
      nodeIds.push(id);
    }
    layerNodeIds.push(nodeIds);
  });
  // 계층간 균등 분배 링크: 각 lower node가 최소 1개 upper에 연결됨
  for (let l = 1; l < layerNodeIds.length; l++) {
    const upper = layerNodeIds[l - 1];
    const lower = layerNodeIds[l];
    const upperCount = upper.length;
    const lowerCount = lower.length;
    // 모든 lower 노드는 최소 1개 upper에 연결, upper 수로 round-robin 분배
    for (let i = 0; i < lowerCount; i++) {
      const upperIdx = Math.floor(i * upperCount / lowerCount);
      links.push({ source: upper[upperIdx], target: lower[i] });
    }
  }
  return { nodes, links };
}
