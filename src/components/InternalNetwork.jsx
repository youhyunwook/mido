import React, { useRef, useMemo, useState, useEffect } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { createLayeredGridGraph } from "./GraphUtil";

// 더 깔끔한 레이어 설정
const layers = [
  { name: "Device", count: 6 },    // 엔드포인트 장치들
  { name: "Access", count: 3 },    // 액세스 스위치
  { name: "Distrib", count: 2 },   // 분산 계층
  { name: "Core", count: 1 },      // 코어 스위치
  { name: "DMZ", count: 3 },       // DMZ 영역
  { name: "Server", count: 4 }     // 서버 팜
];

const layerRadii = [45, 25, 18, 8, 22, 35];
const layerGap = 20;

// 더 세련된 색상 팔레트 (네트워크 토폴로지용)
const nodeColors = [
  "#00d4ff", // Device - 시안 블루
  "#4ade80", // Access - 그린
  "#f59e0b", // Distrib - 앰버
  "#ef4444", // Core - 레드 (중요)
  "#a855f7", // DMZ - 퍼플
  "#06b6d4"  // Server - 티얼
];

// 링크의 고유 키 생성
const getLinkKey = l => {
  const getName = n => (typeof n === "object" ? n.name || n.id : n);
  return [getName(l.source), getName(l.target)].sort().join('←→');
};

export default function InternalNetwork() {
  const fgRef = useRef();
  
  const [graphData] = useState(() => {
    const { nodes = [], links = [] } = createLayeredGridGraph({
      layers,
      layerGap,
      layerRadius: layerRadii
    }) ?? {};

    // 추가 연결 생성 (더 현실적인 네트워크 구조)
    // Core와 DMZ 연결
    links.push({ source: "Core-1", target: "DMZ-1" });
    links.push({ source: "Core-1", target: "DMZ-2" });
    
    // DMZ와 Server 연결
    for (let i = 1; i <= 3; i++) {
      if (i <= 2) links.push({ source: `DMZ-${i}`, target: `Server-${i}` });
    }
    links.push({ source: "DMZ-3", target: "Server-3" });
    links.push({ source: "DMZ-3", target: "Server-4" });

    // 그래프를 중심으로 이동
    const center = nodes.reduce(
      (acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y, z: acc.z + n.z }),
      { x: 0, y: 0, z: 0 }
    );
    center.x /= nodes.length;
    center.y /= nodes.length; 
    center.z /= nodes.length;

    nodes.forEach(n => {
      n.x -= center.x;
      n.y -= center.y;
      n.z -= center.z;
    });

    return { nodes, links };
  });

  const [highlighted, setHighlighted] = useState({
    nodes: new Set(),
    links: new Set(),
    dimmedNodes: new Set()
  });
  
  const [hasInitialized, setHasInitialized] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoverNode, setHoverNode] = useState(null);

  // 고해상도 렌더링 및 카메라 설정
  useEffect(() => {
    if (fgRef.current) {
      const renderer = fgRef.current.renderer();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      
      // 카메라 컨트롤 설정 개선
      const controls = fgRef.current.controls();
      if (controls) {
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 50;
        controls.maxDistance = 1000;
        controls.maxPolarAngle = Math.PI;
        controls.minPolarAngle = 0;
        
        // 부드러운 줌 설정
        controls.zoomSpeed = 0.5;
        controls.panSpeed = 0.8;
        controls.rotateSpeed = 0.5;
      }
      
      // 부드러운 조명 설정
      const scene = fgRef.current.scene();
      const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(50, 100, 50);
      directionalLight.castShadow = true;
      scene.add(ambientLight);
      scene.add(directionalLight);
    }

    const handleResize = () => {
      if (fgRef.current) {
        fgRef.current.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 노드 클릭 핸들러 - 연결된 모든 노드 강조
  const handleNodeClick = (node, event) => {
    event.stopPropagation();
    
    const getName = n => (typeof n === "object" ? n.name || n.id : n);
    
    // 그래프 인접 리스트 생성
    const adjacency = {};
    graphData.nodes.forEach(n => { 
      adjacency[n.name] = new Set(); 
    });
    
    graphData.links.forEach(l => {
      const source = getName(l.source);
      const target = getName(l.target);
      adjacency[source].add(target);
      adjacency[target].add(source);
    });

    // BFS로 연결된 모든 노드 찾기
    const connected = new Set([node.name]);
    const queue = [node.name];
    
    while (queue.length > 0) {
      const current = queue.shift();
      adjacency[current].forEach(neighbor => {
        if (!connected.has(neighbor)) {
          connected.add(neighbor);
          queue.push(neighbor);
        }
      });
    }

    // 강조할 링크 찾기
    const highlightLinks = new Set();
    graphData.links.forEach(l => {
      const source = getName(l.source);
      const target = getName(l.target);
      if (connected.has(source) && connected.has(target)) {
        highlightLinks.add(getLinkKey(l));
      }
    });

    const dimmedNodes = new Set(
      graphData.nodes
        .filter(n => !connected.has(n.name))
        .map(n => n.name)
    );

    setHighlighted({
      nodes: connected,
      links: highlightLinks,
      dimmedNodes
    });
    
    setSelectedNode(node);
  };

  const handleBackgroundClick = () => {
    setHighlighted({ 
      nodes: new Set(), 
      links: new Set(), 
      dimmedNodes: new Set() 
    });
    setSelectedNode(null);
  };

  const handleNodeHover = (node) => {
    setHoverNode(node);
  };

  // 향상된 노드 렌더링
  const nodeThreeObject = useMemo(() => {
    return node => {
      const layerIndex = layers.findIndex(l => l.name === node.layer);
      const isHighlighted = highlighted.nodes.has(node.name);
      const isDimmed = highlighted.dimmedNodes.has(node.name);
      const isSelected = selectedNode?.name === node.name;
      const isHovered = hoverNode?.name === node.name;
      
      const baseColor = nodeColors[layerIndex] || "#64748b";
      const opacity = isDimmed ? 0.2 : 1;
      const scale = isSelected ? 1.4 : isHovered ? 1.2 : 1;
      const radius = (isSelected ? 4.5 : 3.5) * scale;

      // 메인 구체
      const geometry = new THREE.SphereGeometry(radius, 20, 20);
      const material = new THREE.MeshPhongMaterial({ 
        color: baseColor,
        transparent: opacity < 1,
        opacity,
        shininess: 100
      });
      
      const sphere = new THREE.Mesh(geometry, material);
      sphere.castShadow = true;
      sphere.receiveShadow = true;

      // 선택/강조 시 외곽 링
      if (isSelected || isHighlighted) {
        const ringGeometry = new THREE.RingGeometry(radius * 1.2, radius * 1.4, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: isSelected ? "#ffffff" : baseColor,
          transparent: true,
          opacity: isSelected ? 0.8 : 0.5,
          side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        sphere.add(ring);
      }

      // 깔끔한 라벨
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const text = node.name.replace('-', ' ');
      
      ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, sans-serif";
      const metrics = ctx.measureText(text);
      const padding = 8;
      
      canvas.width = metrics.width + padding * 2;
      canvas.height = 24;
      
      // 라벨 배경
      ctx.fillStyle = isDimmed ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.7)";
      ctx.roundRect(0, 0, canvas.width, canvas.height, 4);
      ctx.fill();
      
      // 라벨 텍스트
      ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = isDimmed ? "rgba(255,255,255,0.4)" : "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(text, canvas.width / 2, 16);

      const texture = new THREE.CanvasTexture(canvas);
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      
      const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        opacity: opacity
      });
      
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(canvas.width / 8, canvas.height / 8, 1);
      sprite.position.set(0, radius + 8, 0);

      const group = new THREE.Group();
      group.add(sphere);
      group.add(sprite);
      
      return group;
    };
  }, [highlighted, selectedNode, hoverNode]);

  // 링크 스타일링
  const linkWidth = (link) => {
    const key = getLinkKey(link);
    if (highlighted.links.has(key)) return 3;
    if (highlighted.links.size > 0) return 0.5;
    return 1.5;
  };

  const linkColor = (link) => {
    const key = getLinkKey(link);
    if (highlighted.links.has(key)) return "#00ff88";
    if (highlighted.links.size > 0) return "#334155";
    return "#64748b";
  };

  const linkOpacity = (link) => {
    const key = getLinkKey(link);
    if (highlighted.links.size === 0) return 0.8;
    return highlighted.links.has(key) ? 1 : 0.2;
  };

  return (
    <>
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeThreeObject={nodeThreeObject}
        linkWidth={linkWidth}
        linkColor={linkColor}
        linkOpacity={linkOpacity}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.003}
        linkDirectionalParticleWidth={1.5}
        showNavInfo={false}
        enableNodeDrag={false}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onBackgroundClick={handleBackgroundClick}
        cooldownTicks={150}
        d3AlphaDecay={0.01}
        d3VelocityDecay={0.3}
        onEngineStop={() => {
          // 초기 로딩 시에만 한 번 줌 조정
          if (!hasInitialized && fgRef.current) {
            setTimeout(() => {
              fgRef.current.zoomToFit(400, 20);
              setHasInitialized(true);
            }, 100);
          }
        }}
        controlType="orbit"
        backgroundColor="rgba(0,0,0,0)"
        cameraPosition={{ x: 0, y: 0, z: 300 }}
        enablePointerInteraction={true}
        width={window.innerWidth}
        height={window.innerHeight}
      />
      
      {/* 범례 */}
      <div style={{
        position: "absolute",
        top: "10px",
        right: "10px",
        background: "rgba(15,23,42,0.98)",
        padding: "8px",
        borderRadius: "8px",
        fontSize: "10px",
        color: "#e2e8f0",
        zIndex: 10,
        border: "1px solid rgba(148,163,184,0.2)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
      }}>
        {layers.map((layer, i) => (
          <div key={layer.name} style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "2px"
          }}>
            <div style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: nodeColors[i],
              marginRight: "6px"
            }} />
            {layer.name}
          </div>
        ))}
      </div>

      {/* 선택된 노드 정보 */}
      {selectedNode && (
        <div style={{
          position: "absolute",
          bottom: "10px",
          left: "10px",
          background: "linear-gradient(135deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.95) 100%)",
          color: "#e2e8f0",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid rgba(148,163,184,0.3)",
          fontSize: "12px",
          fontWeight: "500",
          zIndex: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
        }}>
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
            📡 {selectedNode.name}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "10px" }}>
            Layer: {selectedNode.layer}
          </div>
        </div>
      )}
    </>
  );
}