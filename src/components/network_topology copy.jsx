import React, { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";

async function fetchNetworkData(activeView = "externalInternal") {
  const response = await fetch(`http://localhost:8000/neo4j/nodes?activeView=${activeView}`);
  const data = await response.json();
  const nodesMap = new Map();
  const links = [];
  data.forEach(item => {
    if (item.src_IP && item.src_IP.id) nodesMap.set(item.src_IP.id, item.src_IP);
    if (item.dst_IP && item.dst_IP.id) nodesMap.set(item.dst_IP.id, item.dst_IP);
    if (item.edge && item.edge.sourceIP && item.edge.targetIP) {
      links.push({
        source: item.edge.sourceIP,
        target: item.edge.targetIP,
        ...item.edge
      });
    }
  });
  return { nodes: Array.from(nodesMap.values()), links };
}

export default function NetworkTopology3D({
  clusters = 8,
  nodesPerCluster = 35,
  linkProbIntra = 0.08,
  linkProbInter = 0.012,
  assumedProb = 0.18,
  onInspectorChange,
  onTestPageRequest,
}) {
  const fgRef = useRef();
  const [selected, setSelected] = useState(null);

  // API 데이터 가져오기 (초기 로딩)
  const [baseData, setBaseData] = useState({ nodes: [], links: [] });
  useEffect(() => {
    fetchNetworkData("externalInternal").then(setBaseData);
  }, []);

  // 링크 데이터가 변경될 때만 다시 계산되는 인접 리스트
  const adjacency = useMemo(() => buildAdjacency(baseData.links), [baseData]);

  // 선택된 노드가 변경되면 카메라 이동
  useEffect(() => {
    if (!selected || !fgRef.current) return;
    const distance = 120;
    const distRatio = 1 + distance / Math.hypot(selected.x || 1, selected.y || 1, selected.z || 1);
    fgRef.current.cameraPosition(
      { x: (selected.x || 1) * distRatio, y: (selected.y || 1) * distRatio, z: 400 }, // z축 고정
      selected, // lookAt 대상
      800 // 이동 시간 (ms)
    );
  }, [selected]);

  const selectedId = selected?.id ?? null;

  // 노드 강조 여부
  const isHLNode = (n) => {
    if (!selectedId) return false;
    if (n.id === selectedId) return true;
    const neigh = adjacency.get(selectedId);
    return neigh ? neigh.has(n.id) : false;
  };

  // 링크가 선택된 노드에 연결되어 있는지
  const isIncident = (l) => selectedId && (idOf(l.source) === selectedId || idOf(l.target) === selectedId);

  /**
   * 각 노드의 3D 객체(메시)를 생성합니다.
   * @param {object} node - 노드 데이터
   * @returns {THREE.Group} Three.js 그룹 객체
   */
  function nodeMesh(node) {
    const group = new THREE.Group();

  // 노드 종류별 지오메트리
    let geom;
    if (node.kind === "switch") geom = new THREE.BoxGeometry(6, 3, 6);
    else if (node.kind === "router") geom = new THREE.CylinderGeometry(3, 3, 6, 16);
    else geom = new THREE.SphereGeometry(2.2, 16, 16); // host

    const baseColor = new THREE.Color(node.color);
    const HIGHLIGHT = new THREE.Color(0xffda79);
    const DIM = new THREE.Color(0x1b2a4a);
    const useColor = isHLNode(node) ? HIGHLIGHT : selectedId ? DIM : baseColor;

    const body = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: useColor, metalness: 0.25, roughness: 0.6 }));
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

  // 노드 주변 링
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(node.kind === "host" ? 3.3 : 4.5, node.kind === "host" ? 3.7 : 5.2, 24),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, side: THREE.DoubleSide, transparent: true, opacity: isHLNode(node) ? 0.85 : 0.25 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

  // 노드 상태 LED
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), new THREE.MeshBasicMaterial({ color: node.status === "up" ? 0x00ff99 : 0xff3355 }));
    led.position.set(0, node.kind === "host" ? 2.8 : 3.8, 0);
    group.add(led);

  // 노드 라벨
    const label = makeTextSprite(node.label || node.id, { fontsize: 70, borderThickness: 0, fillStyle: isHLNode(node) ? "#ffffff" : "#d6e2ff" });
    label.position.set(0, node.kind === "host" ? 5 : 7, 0);
    group.add(label);

  // 클릭 감지용 히트박스
    const hit = new THREE.Mesh(new THREE.SphereGeometry(7, 8, 8), new THREE.MeshBasicMaterial({ opacity: 0.0, transparent: true, depthWrite: false }));
    hit.name = "hit-proxy";
    group.add(hit);
    return group;
  }

  // info 패널 상위 컴포넌트 연동
  useEffect(() => {
    const inspectorJsx = (
      <div className="h-[80vh] rounded-2xl bg-white/90 p-4 overflow-auto mt-4">
        <h2 className="text-xl font-semibold mb-3">Node Info</h2>
        {selected ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(selected)
                  .filter(([key]) => !['x','y','z','vx','vy','vz','__threeObj','__id'].includes(key))
                  .map(([key, value]) => {
                    const displayKey = key === "__labels" ? "Labels" : key;
                    return (
                      <tr key={key} className="border-b border-gray-200/80">
                        <td className="py-2 font-medium text-gray-500">{displayKey}</td>
                        <td className="py-2 text-right font-mono break-all">{String(value)}</td>
                      </tr>
                    );
                  })}
                <tr>
                  <td className="py-2 font-medium text-gray-500">연결 이웃 수</td>
                  <td className="py-2 text-right">{adjacency.get(selected.id)?.size ?? 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500"></p>
        )}
      </div>
    );
  // info JSX 전달
    onInspectorChange(inspectorJsx);
  }, [selected, adjacency, onInspectorChange, baseData.nodes]);

  // 그래프 영역만 렌더링
  // 확대(휠) 시 카메라 z값이 일정 이하로 내려가면 testpage로 이동
  const handleWheel = (e) => {
    if (!fgRef.current || typeof fgRef.current.camera !== "function") return;
    setTimeout(() => {
      if (!fgRef.current || typeof fgRef.current.camera !== "function") return;
      const camera = fgRef.current.camera();
      if (!camera) return;
      const z = camera.position.z;
      // if (z > 0 && z < 40 && typeof onTestPageRequest === "function") {
      //   onTestPageRequest();
      // }
      console.log("Camera Z:", z);
    }, 200);
  };

  return (
    <div className="w-full h-full grid grid-cols-12 gap-3">
      <div className="col-span-12 h-[80vh] rounded-2xl shadow-md relative" onWheel={handleWheel}>
        <ForceGraph3D
          ref={fgRef}
          graphData={baseData}
          backgroundColor="#2b2f36"
          nodeThreeObject={nodeMesh}
          nodeThreeObjectExtend={true}
          nodeRelSize={4}
          nodeOpacity={0.95}
          nodeColor={(n) => {
            if (!selectedId) return n.color ?? 0x6aa7ff;
            return isHLNode(n) ? "#ffd166" : "#c9d3ea";
          }}
          linkOpacity={0.65}
          linkWidth={(l) => (isIncident(l) ? 3 : l.backbone ? 1.6 : 0.9)}
          linkColor={(l) => (isIncident(l) ? "#3a6fe2" : l.backbone ? "#9aaee8" : "#8fb3ff")}
          linkMaterial={(l) =>
            l.assumed
              ? new THREE.LineDashedMaterial({ color: isIncident(l) ? 0x3a6fe2 : 0x8fb3ff, dashSize: 2, gapSize: 2, transparent: true, opacity: 0.9 })
              : new THREE.LineBasicMaterial({ color: isIncident(l) ? 0x3a6fe2 : l.backbone ? 0x9aaee8 : 0x8fb3ff })
          }
          linkDirectionalParticles={(l) => (l.assumed ? 0 : isIncident(l) ? 4 : 0)}
          linkDirectionalParticleWidth={1}
          linkDirectionalParticleSpeed={0.004}
          onEngineStop={() => {
            fgRef.current?.scene()?.traverse((obj) => {
              if (obj.type === "Line" || obj.type === "LineSegments") {
                obj.computeLineDistances?.();
              }
            });
          }}
          onNodeClick={(n) => setSelected((prev) => (prev && prev.id === n.id ? null : n))}
          onBackgroundClick={() => setSelected(null)}
          enableNodeDrag={false}
          showNavInfo={false}
          warmupTicks={30}
          cooldownTicks={60}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.35}
        />
      </div>
    </div>
  );
}
// 객체 대신 ID 추출
function idOf(x) {
  return typeof x === "object" && x !== null ? x.id : x;
}

// 링크 배열로부터 인접 리스트(Map) 생성
function buildAdjacency(links) {
  const map = new Map();
  for (const l of links) {
    const s = idOf(l.source);
    const t = idOf(l.target);
    if (!map.has(s)) map.set(s, new Set());
    if (!map.has(t)) map.set(t, new Set());
    map.get(s).add(t);
    map.get(t).add(s);
  }
  return map;
}


/**
 * Three.js로 노드 라벨 텍스트 스프라이트 생성
 * @param {string} message
 * @param {object} [opts={}] - 스타일 옵션
 * @returns {THREE.Sprite}
 */
function makeTextSprite(message, { fontsize = 90, fillStyle = "#fff" } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = `${fontsize}px Inter, system-ui, -apple-system, Segoe UI, Roboto`;
  ctx.font = font;
  const textWidth = ctx.measureText(message).width;
  canvas.width = textWidth + 40;
  canvas.height = fontsize + 30;
  const r = 12;
  ctx.fillStyle = "rgba(10,16,32,0.8)";
  roundRect(ctx, 0, 0, canvas.width, canvas.height, r, true, false);
  ctx.fillStyle = fillStyle;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
  return sprite;
}

// 캔버스 둥근 사각형 유틸리티
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

