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
// 작은 렌더영역 기준 소형 반지름
const layerRadii = [50, 17, 12, 10, 18, 7, 26];
const layerGap = 16;
const borderColors = [
  "#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#073b4c", "#6c757d", "#495057"
];

export default function InternalNetwork() {
  const fgRef = useRef();

  // 1) 중앙 정렬 (nodes를 오버레이 중심에 이동)
  const [{ nodes, links }] = useState(() => {
    const { nodes, links } = createLayeredGridGraph({
      layers,
      layerGap,
      layerRadius: layerRadii
    });
    for (let i = 0; i < 4; i++) {
      links.push({ source: `ISGs-${i + 1}`, target: `Core-1` });
      links.push({ source: `Infra-${i + 1}`, target: `Core-1` });
    }
    // 모든 노드 중심좌표 계산 후 offset
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

  const [highlighted, setHighlighted] = useState({ nodes: new Set(), links: new Set() });
  const [selectedNode, setSelectedNode] = useState(null);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

  // 2) 확대시에도 선명함 유지
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

  const handleNodeClick = node => {
    const connectedLinks = links.filter(
      l => l.source === node.name || l.target === node.name
    );
    const neighborNames = new Set();
    connectedLinks.forEach(link => {
      neighborNames.add(typeof link.source === "object" ? link.source.name : link.source);
      neighborNames.add(typeof link.target === "object" ? link.target.name : link.target);
    });
    const highlightNodes = nodes.filter(n => neighborNames.has(n.name));
    setHighlighted({
      nodes: new Set([node, ...highlightNodes]),
      links: new Set(connectedLinks)
    });
    setSelectedNode(node);
  };

  const handleBackgroundClick = () => {
    setHighlighted({ nodes: new Set(), links: new Set() });
    setSelectedNode(null);
  };

  useEffect(() => {
    if (selectedNode && fgRef.current) {
      const { x, y, z } = selectedNode;
      fgRef.current.cameraPosition(
        { x, y, z: z + 60 },
        { x, y, z },
        700
      );
    }
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode || !fgRef.current) return;
    const camera = fgRef.current.camera();
    const nodeObj = fgRef.current.graphData().nodes.find(n => n.name === selectedNode.name)?.__threeObj;
    if (!nodeObj) return;

    const position = nodeObj.position.clone();
    const vector = position.project(camera);
    const canvas = fgRef.current.renderer().domElement;
    const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (1 - (vector.y * 0.5 + 0.5)) * canvas.clientHeight;
    setPopupPos({ x, y });
  }, [selectedNode]);

  function handleRenderBorderLines(scene) {
    scene.children
      .filter(obj => obj.userData?.borderRing)
      .forEach(obj => scene.remove(obj));
    layers.forEach((layer, idx) => {
      const radius = layerRadii[idx];
      const z = idx * layerGap;
      const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, 2 * Math.PI);
      const points = curve.getPoints(128);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: borderColors[idx % borderColors.length], linewidth: 2
      });
      const borderLine = new THREE.Line(geometry, material);
      borderLine.position.set(0, 0, z);
      borderLine.rotation.x = Math.PI / 2;
      borderLine.userData.borderRing = true;
      scene.add(borderLine);
    });
  }

  const nodeThreeObject = useMemo(() => node => {
    const color = highlighted.nodes.has(node)
      ? "#ff4d4f"
      : borderColors[layers.findIndex(l => l.name === node.layer)];
    const radius = highlighted.nodes.has(node) ? 6 : 3;
    const sphereGeom = new THREE.SphereGeometry(radius, 16, 16);
    const sphereMat = new THREE.MeshLambertMaterial({ color });
    const sphereMesh = new THREE.Mesh(sphereGeom, sphereMat);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const labelText = node.name;
    ctx.font = "600 12px Arial";
    const textWidth = ctx.measureText(labelText).width;
    canvas.width = textWidth + 10;
    canvas.height = 25;
    ctx.font = "600 12px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.strokeText(labelText, canvas.width / 2, 16);
    ctx.fillStyle = "#222";
    ctx.fillText(labelText, canvas.width / 2, 16);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
    sprite.position.set(0, radius + 4, 0);

    const group = new THREE.Group();
    group.add(sphereMesh);
    group.add(sprite);
    return group;
  }, [highlighted.nodes]);

  const linkWidth = link => (highlighted.links.has(link) ? 2.2 : 1);
  const linkColor = link => (highlighted.links.has(link) ? "#fa5252" : "#adb5bd");

  return (
    <div className="dashboard-sub-overlay">
      <ForceGraph3D
        ref={fgRef}
        graphData={{ nodes, links }}
        nodeThreeObject={nodeThreeObject}
        linkWidth={linkWidth}
        linkColor={linkColor}
        showNavInfo={false}
        enableNodeDrag={false}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        onEngineStop={() => {
          if (fgRef.current) {
            handleRenderBorderLines(fgRef.current.scene());
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
