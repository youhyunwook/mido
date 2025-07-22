import React, { useRef, useMemo, useState, useEffect } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { createLayeredGridGraph } from "./GraphUtil";

// 오버레이(480x340) 영역 맞춤 설정
const layers = [
  { name: "Hosts", count: 8 },
  { name: "Switch", count: 1 },
  { name: "Bridge", count: 1 },
  { name: "LS", count: 1 },
  { name: "ISGs", count: 4 },
  { name: "Core", count: 1 },
  { name: "Infra", count: 4 }
];
const layerRadii = [50, 17, 12, 10, 18, 7, 26];
const layerGap = 16;
const borderColors = [
  "#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#073b4c", "#6c757d", "#495057"
];

// 링크의 고유 키 생성
const getLinkKey = l => {
  const getName = n => (typeof n === "object" ? n.name : n);
  return [getName(l.source), getName(l.target)].join('--');
};

export default function InternalNetwork() {
  const fgRef = useRef();

  const [{ nodes, links }] = useState(() => {
    const { nodes = [], links = [] } =
      createLayeredGridGraph({
        layers,
        layerGap,
        layerRadius: layerRadii
      }) ?? {};

    for (let i = 0; i < 4; i++) {
      links.push({ source: `ISGs-${i + 1}`, target: `Core-1` });
      links.push({ source: `Infra-${i + 1}`, target: `Core-1` });
    }
    const avg = nodes.reduce(
      (acc, n) => ({
        x: acc.x + n.x,
        y: acc.y + n.y,
        z: acc.z + n.z
      }),
      { x: 0, y: 0, z: 0 }
    );
    avg.x /= nodes.length;
    avg.y /= nodes.length;
    avg.z /= nodes.length;

    nodes.forEach(n => {
      n.x -= avg.x;
      n.y -= avg.y;
      n.z -= avg.z;
    });

    return { nodes, links };
  });

  const [highlighted, setHighlighted] = useState({
    nodes: new Set(),      // name 기반
    links: new Set(),      // source-target string 기반
    dimmedNodes: new Set() // name 기반
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.renderer().setPixelRatio(window.devicePixelRatio);
    }
    const handleResize = () => {
      if (fgRef.current) {
        fgRef.current.renderer().setPixelRatio(window.devicePixelRatio);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 노드 클릭 시 간접 연결 포함 모든 연관 노드 강조
  const handleNodeClick = node => {
    const getName = n => (typeof n === "object" ? n.name : n);

    // 1. 그래프 인접 리스트 생성
    const adjacency = {};
    nodes.forEach(n => { adjacency[n.name] = new Set(); });
    links.forEach(l => {
      const s = getName(l.source), t = getName(l.target);
      adjacency[s].add(t);
      adjacency[t].add(s);
    });

    // 2. 선택 노드에서 BFS로 연결된 모든 노드 탐색
    const visited = new Set();
    const stack = [node.name];
    while (stack.length) {
      const curr = stack.pop();
      if (!visited.has(curr)) {
        visited.add(curr);
        adjacency[curr].forEach(nei => {
          if (!visited.has(nei)) stack.push(nei);
        });
      }
    }

    // 3. 강조/흐림 대상 산출
    const connectedNames = visited;
    const highlightLinks = links.filter(
      l => connectedNames.has(getName(l.source)) && connectedNames.has(getName(l.target))
    ).map(l => [getName(l.source), getName(l.target)].join('--'));
    setHighlighted({
      nodes: connectedNames,
      links: new Set(highlightLinks),
      dimmedNodes: new Set(nodes.filter(n => !connectedNames.has(n.name)).map(n => n.name))
    });
    setSelectedNode(node);
  };

  const handleBackgroundClick = () => {
    setHighlighted({ nodes: new Set(), links: new Set(), dimmedNodes: new Set() });
    setSelectedNode(null);
  };

  useEffect(() => {
    if (!selectedNode || !fgRef.current) return;
    const graphData = fgRef.current.graphData;
    if (!graphData || !Array.isArray(graphData.nodes)) return;
    const nodeObj = graphData.nodes.find(n => n.name === selectedNode.name)?.__threeObj;
    if (!nodeObj) return;
    const camera = fgRef.current.camera();
    const position = nodeObj.position.clone();
    const vector = position.project(camera);
    const canvas = fgRef.current.renderer().domElement;
    const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (1 - (vector.y * 0.5 + 0.5)) * canvas.clientHeight;
    setPopupPos({ x, y });
  }, [selectedNode, nodes]);

  // 노드 렌더링 (강조/흐림 적용)
  const nodeThreeObject = useMemo(() => {
    return node => {
      const isDimmed = highlighted.dimmedNodes.has(node.name);
      const color = borderColors[layers.findIndex(l => l.name === node.layer)];
      const opacity = isDimmed ? 0.3 : 1;
      const radius = 3;
      const sphereGeom = new THREE.SphereGeometry(radius, 16, 16);
      const sphereMat = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity });
      const sphereMesh = new THREE.Mesh(sphereGeom, sphereMat);

      // 라벨(canvas)
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const labelText = node.name;
      ctx.font = "600 12px Arial";
      const textWidth = ctx.measureText(labelText).width;
      canvas.width = textWidth + 10;
      canvas.height = 25;
      ctx.font = "600 12px Arial";
      ctx.textAlign = "center";
      ctx.globalAlpha = opacity;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 3;
      ctx.strokeText(labelText, canvas.width / 2, 16);
      ctx.fillStyle = "#222";
      ctx.fillText(labelText, canvas.width / 2, 16);
      ctx.globalAlpha = 1;

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: opacity < 1, opacity });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
      sprite.position.set(0, radius + 4, 0);

      const group = new THREE.Group();
      group.add(sphereMesh);
      group.add(sprite);
      return group;
    };
  }, [highlighted.dimmedNodes]);

  // 링크 강조/흐림 적용
  const linkWidth = l => highlighted.links.has(getLinkKey(l)) ? 2.2 : 1;
  const linkColor = l => highlighted.links.has(getLinkKey(l)) ? "#fa5252" : "#adb5bd";
  const linkOpacity = l =>
    highlighted.links.size === 0
      ? 1
      : highlighted.links.has(getLinkKey(l))
        ? 1
        : 0.3;

  return (
    <div className="dashboard-sub-overlay">
      <ForceGraph3D
        ref={fgRef}
        graphData={{ nodes, links }}
        nodeThreeObject={nodeThreeObject}
        linkWidth={linkWidth}
        linkColor={linkColor}
        linkOpacity={linkOpacity}
        showNavInfo={false}
        enableNodeDrag={false}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        onEngineStop={() => {
          if (fgRef.current) {
            fgRef.current.zoomToFit(0, 12);
          }
        }}
      />
      {selectedNode && (
        <div
          style={{
            position: "absolute",
            left: popupPos.x + 14,
            top: popupPos.y - 8,
            backgroundColor: "#2a2a3b",
            color: "#fff",
            padding: "7px 10px",
            borderRadius: "7px",
            zIndex: 10,
            pointerEvents: "none",
            fontSize: "11px",
            fontWeight: "bold"
          }}
        >
          {selectedNode.name}
        </div>
      )}
    </div>
  );
}
