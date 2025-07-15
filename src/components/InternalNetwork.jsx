import React, { useState } from "react";
import ForceGraph3D from "react-force-graph-3d";

// 노드 데이터와 링크 데이터 동적 생성 예시
function generateGraph(rings = 3, nodesPerRing = 8) {
  const nodes = [];
  const links = [];
  let nodeId = 0;

  // 중심 노드
  nodes.push({ id: "center", group: 0, label: "Center" });

  // 원형 배치된 노드들과 연결 생성
  for (let r = 1; r <= rings; r++) {
    for (let k = 0; k < nodesPerRing; k++) {
      const angle = (2 * Math.PI * k) / nodesPerRing;
      // 구/원상 배치
      const x = r * 50 * Math.cos(angle);
      const y = r * 50 * Math.sin(angle);
      const z = r * 25 * (k % 2 === 0 ? 1 : -1);
      const id = `node${nodeId++}`;
      nodes.push({
        id,
        group: r,
        label: `R${r}-N${k + 1}`,
        x,
        y,
        z
      });
      // 중심 노드와 연결
      links.push({ source: "center", target: id });
      // 이웃 노드 간 원형 연결
      if (k > 0) {
        links.push({ source: `node${nodeId - 2}`, target: id });
      }
      // 원형 폐쇄 연결
      if (k === nodesPerRing - 1)
        links.push({ source: id, target: `node${nodeId - nodesPerRing}` });
    }
  }
  return { nodes, links };
}

function InternalNetwork() {
  const [graph] = useState(() => generateGraph(3, 8)); // 3개의 링, 각 링마다 8개 노드

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#181824" }}>
      <ForceGraph3D
        graphData={graph}
        nodeLabel="label"
        linkDirectionalArrowLength={6}
        linkWidth={1.5}
        nodeAutoColorBy="group"
        nodeOpacity={0.9}
        linkOpacity={0.8}
        backgroundColor="#181824"
      />
    </div>
  );
}

export default InternalNetwork;
