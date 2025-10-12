import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";

import ZonePage from "./zones/ZonePage";

// ------------------------------
// 1) 데이터 fetch & 정규화
// ------------------------------
async function fetchNetworkData(activeView = "default") {
  const res = await fetch(`http://localhost:8000/neo4j/nodes?activeView=${encodeURIComponent(activeView)}`);
  const data = await res.json();

  const nodesMap = new Map();
  const rawLinks = [];
  data.forEach((item) => {
    if (item.src_IP?.id) nodesMap.set(item.src_IP.id, item.src_IP);
    if (item.dst_IP?.id) nodesMap.set(item.dst_IP.id, item.dst_IP);
    if (item.edge?.sourceIP && item.edge?.targetIP) {
      rawLinks.push({ source: item.edge.sourceIP, target: item.edge.targetIP, ...item.edge });
    }
  });

  const nodeIds = new Set([...nodesMap.keys()]);
  const filtered = rawLinks.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
  const orphan = rawLinks.filter((l) => !nodeIds.has(l.source) || !nodeIds.has(l.target));
  if (orphan.length) {
    const coreId = "__core__";
    if (!nodesMap.has(coreId)) {
      nodesMap.set(coreId, { id: coreId, label: "CORE", kind: "core", type: "core", color: "#ffffff", status: "up", zone: null });
    }
    for (const l of orphan) {
      const srcOK = nodeIds.has(l.source);
      const tgtOK = nodeIds.has(l.target);
      if (srcOK && !tgtOK) filtered.push({ ...l, target: coreId, type: l.type || "logical" });
      else if (!srcOK && tgtOK) filtered.push({ ...l, source: coreId, type: l.type || "logical" });
    }
  }

  // Merge duplicates
  const seen = new Set();
  const links = [];
  for (const l of filtered) {
    const a = String(l.source);
    const b = String(l.target);
    const key = a < b ? `${a}__${b}__${l.type || ""}` : `${b}__${a}__${l.type || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(l);
  }

  const TYPE_COLORS = {
    core: "#ffffff",
    firewall: "#e55353",
    router: "#f6a609",
    l3switch: "#f6a609",
    switchrouter: "#f6a609",
    layer3: "#f6a609",
    switch: "#3fb950",
    hub: "#26c6da",
    server: "#6aa7ff",
    host: "#6aa7ff",
    default: "#a0b4ff",
  };

  const nodes = Array.from(nodesMap.values()).map((n) => {
    const kind = (n.kind || n.type || "host").toLowerCase();
    const label = n.label || n.ip || String(n.id);
    const color = n.color || TYPE_COLORS[kind] || TYPE_COLORS.default;
    const status = n.status || "up";
    const subnet = n.subnet ? n.subnet : (typeof n.ip === "string" && n.ip.includes(".")) ? n.ip.split(".").slice(0, 3).join(".") + ".0/24" : "unknown/24";
    const zone = Number.isFinite(n.zone) ? n.zone : n.kind === "core" ? null : 0;
    return { ...n, kind, label, color, status, subnet, zone };
  });

  return { nodes, links };
}

// ------------------------------
// 2) 그래프 유틸리티 함수
// ------------------------------
function idOf(n) { return typeof n === "object" ? n.id : n; }
function hashId(s) { s = String(s || ""); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) >>> 0; return h; }
function buildAdjacency(links) { const m = new Map(); links.forEach((l) => { const a = idOf(l.source); const b = idOf(l.target); if (!m.has(a)) m.set(a, new Set()); if (!m.has(b)) m.set(b, new Set()); m.get(a).add(b); m.get(b).add(a); }); return m; }

// ------------------------------
// 3) 레이아웃: 존별 원형 토폴로지 + 중앙 집중 방화벽
// ------------------------------
const LAYOUT = {
  ZONE_RADIUS: 600,
  ROLE_BASE_R: 46,
  ROLE_STEP_R: 26,
  FW_R_RATIO: 0.35,
  FW_SPREAD: 10,
  DEPTH_Z: { firewall: 51, router: 41, l3switch: 27, switchrouter: 27, layer3: 27, switch: 14, server: 0, host: -14, hub: -14, default: -7 },
  OUTER_RING_MULT: 9,
  ZONE_GAP_MARGIN: 60
};

function computeZoneCenters(zones) {
  const centers = new Map();
  const CORE_CENTER = { x: 0, y: 0, z: 0 };
  if (zones.includes(null)) centers.set(null, CORE_CENTER);
  const others = zones.filter((z) => z !== null);
  const n = others.length;
  const baseR = LAYOUT.ZONE_RADIUS;
  const OUTER_R = LAYOUT.ROLE_BASE_R + LAYOUT.ROLE_STEP_R * LAYOUT.OUTER_RING_MULT;
  let R = baseR;
  if (n > 1) {
    const s = Math.sin(Math.PI / n) || 0.001;
    const needed = (OUTER_R + LAYOUT.ZONE_GAP_MARGIN / 2) / s;
    R = Math.max(baseR, Math.ceil(needed));
  }
  const step = (2 * Math.PI) / Math.max(1, n);
  others.forEach((z, i) => { centers.set(z, { x: Math.cos(i * step) * R, y: Math.sin(i * step) * R, z: 0 }); });
  return centers;
}

function anchorNode(n, { x, y, z }) { n.x = x; n.y = y; n.z = z; n.fx = x; n.fy = y; n.fz = z; }

function applyTopologyLayout(g, centers) {
  const roleOrder = ["router", "l3switch", "switchrouter", "layer3", "switch", "server", "host", "hub", "default"]; // firewall excluded
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const byZone = new Map();
  g.nodes.forEach((n) => { if (n.kind === "firewall") return; const z = n.zone; if (!byZone.has(z)) byZone.set(z, []); byZone.get(z).push(n); });
  const corePos = centers.get(null) || { x: 0, y: 0, z: 0 };
  g.nodes.filter((n) => n.kind === "core").forEach((n) => anchorNode(n, corePos));
  byZone.forEach((nodes, z) => {
    if (z === null) return; const c = centers.get(z) || { x: 0, y: 0, z: 0 };
    const groups = new Map(); nodes.forEach((n) => { const key = roleOrder.includes(n.kind) ? n.kind : "default"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(n); });
    const baseR = LAYOUT.ROLE_BASE_R; const stepR = LAYOUT.ROLE_STEP_R;
    roleOrder.forEach((role, ringIdx) => { const arr = groups.get(role); if (!arr || !arr.length) return; const Rrole = baseR + stepR * ringIdx; const N = arr.length; const angStep = (2 * Math.PI) / N;
      for (let i = 0; i < N; i++) { const theta = i * angStep; const x = c.x + Rrole * Math.cos(theta); const y = c.y + Rrole * Math.sin(theta); const zpos = c.z + (LAYOUT.DEPTH_Z[role] ?? 0); anchorNode(arr[i], { x, y, z: zpos }); } });
  });
  const anyZone = Array.from(centers.entries()).find(([z]) => z !== null);
  const measuredR = anyZone ? Math.hypot(anyZone[1].x, anyZone[1].y) : LAYOUT.ZONE_RADIUS;
  const FW_R = Math.max(60, Math.round(measuredR * LAYOUT.FW_R_RATIO));
  const firewallNodes = g.nodes.filter((n) => n.kind === "firewall");
  const zoneVec = (z) => { const c = centers.get(z); if (!c) return { x: 0, y: 0 }; const dx = c.x; const dy = c.y; const len = Math.hypot(dx, dy) || 1; return { x: dx / len, y: dy / len }; };
  const zoneWeightsByFirewall = new Map();
  g.links.forEach((l) => {
    const a = idOf(l.source); const b = idOf(l.target);
    const na = byId.get(a); const nb = byId.get(b); if (!na || !nb) return;
    if (na.kind === "firewall" && nb.zone !== null && nb.zone !== undefined) {
      if (!zoneWeightsByFirewall.has(na.id)) zoneWeightsByFirewall.set(na.id, new Map());
      const m = zoneWeightsByFirewall.get(na.id); m.set(nb.zone, (m.get(nb.zone) || 0) + 1);
    } else if (nb.kind === "firewall" && na.zone !== null && na.zone !== undefined) {
      if (!zoneWeightsByFirewall.has(nb.id)) zoneWeightsByFirewall.set(nb.id, new Map());
      const m = zoneWeightsByFirewall.get(nb.id); m.set(na.zone, (m.get(na.zone) || 0) + 1);
    }
  });
  firewallNodes.forEach((fw, idx) => {
    const weights = zoneWeightsByFirewall.get(fw.id);
    let vx = 0, vy = 0;
    if (weights && weights.size) { weights.forEach((w, z) => { const v = zoneVec(z); vx += v.x * w; vy += v.y * w; }); }
    else { const ang = ((hashId(fw.id) % 628) / 100); vx = Math.cos(ang); vy = Math.sin(ang); }
    const vlen = Math.hypot(vx, vy) || 1; vx /= vlen; vy /= vlen;
    const tangent = Math.atan2(vy, vx) + Math.PI / 2;
    const offsetMag = (idx % 2 === 0 ? 1 : -1) * Math.floor(idx / 2) * LAYOUT.FW_SPREAD;
    const x = 0 + vx * FW_R + Math.cos(tangent) * offsetMag;
    const y = 0 + vy * FW_R + Math.sin(tangent) * offsetMag;
    const z = 0 + (LAYOUT.DEPTH_Z.firewall || 0);
    anchorNode(fw, { x, y, z });
  });
}

// ------------------------------
// 4) 필터링 헬퍼
// ------------------------------
function normalizeZoneVal(z) {
  return (z === null || z === undefined) ? null : Number.isFinite(z) ? z : Number(z);
}
function buildFilteredGraph(fullGraph, selectedZones) {
  if (!fullGraph || !fullGraph.nodes) return { nodes: [], links: [] };
  const zonesSet = new Set(selectedZones ?? []);
  if (zonesSet.size === 0) return { nodes: [], links: [] };
  const inSelectedZone = new Set(fullGraph.nodes.filter((n) => zonesSet.has(normalizeZoneVal(n.zone))).map((n) => n.id));
  const linkStage1 = fullGraph.links.filter((l) => inSelectedZone.has(idOf(l.source)) || inSelectedZone.has(idOf(l.target)));
  const nodeIds = new Set([...inSelectedZone]);
  linkStage1.forEach((l) => { nodeIds.add(idOf(l.source)); nodeIds.add(idOf(l.target)); });
  const coreIds = new Set(fullGraph.nodes.filter((n) => n.kind === "core").map((n) => n.id));
  if (coreIds.size) {
    fullGraph.links.forEach((l) => {
      const a = idOf(l.source); const b = idOf(l.target);
      if ((coreIds.has(a) && nodeIds.has(b)) || (coreIds.has(b) && nodeIds.has(a))) {
        nodeIds.add(a); nodeIds.add(b);
      }
    });
  }
  const links = fullGraph.links.filter((l) => nodeIds.has(idOf(l.source)) && nodeIds.has(idOf(l.target)));
  const nodes = fullGraph.nodes.filter((n) => nodeIds.has(n.id) || zonesSet.has(normalizeZoneVal(n.zone)));
  return { nodes, links };
}

// ------------------------------
// 5) 컴포넌트
// ------------------------------
export default function NetworkTopology3D_LeftSidebar({ activeView = "default", onInspectorChange }) {
  const fgRef = useRef(null);
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [selected, setSelected] = useState(null);

  // === 쿼리(View) 상태 ===
  const [view, setView] = useState(activeView);
  useEffect(() => { setView(activeView); }, [activeView]);

  useEffect(() => {
    fetchNetworkData(view).then((g) => {
      const deg = new Map();
      g.links.forEach((l) => {
        deg.set(idOf(l.source), (deg.get(idOf(l.source)) || 0) + 1);
        deg.set(idOf(l.target), (deg.get(idOf(l.target)) || 0) + 1);
      });
      g.nodes.forEach((n) => (n.__deg = deg.get(n.id) || 0));
      const zonesFetched = Array.from(new Set(g.nodes.map((n) => n.zone)));
      const centersFetched = computeZoneCenters(zonesFetched);
      applyTopologyLayout(g, centersFetched);
      setGraph(g);
      setSelected(null);
    });
  }, [view]);

  const allZones = useMemo(() => {
    const set = new Set();
    graph.nodes.forEach((n) => {
      const z = normalizeZoneVal(n.zone);
      if (z !== null && !Number.isNaN(z)) set.add(z);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [graph.nodes]);

  const countByZone = useMemo(() => {
    const m = new Map(); allZones.forEach((z) => m.set(z, 0));
    graph.nodes.forEach((n) => {
      const z = normalizeZoneVal(n.zone);
      if (m.has(z)) m.set(z, (m.get(z) || 0) + 1);
    });
    return m;
  }, [graph.nodes, allZones]);

  const [selectedZones, setSelectedZones] = useState([]);
  useEffect(() => { setSelectedZones(allZones); }, [allZones]);

  const [activeZone, setActiveZone] = useState(null);
  const filtered = useMemo(() => buildFilteredGraph(graph, selectedZones), [graph, selectedZones]);
  const adjacency = useMemo(() => buildAdjacency(filtered.links), [filtered.links]);
  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => { setSelectedId(selected?.id ?? null); }, [selected]);
  const isHLNode = (n) => selectedId && (n.id === selectedId || adjacency.get(selectedId)?.has(n.id));
  const isIncident = (l) => selectedId && (idOf(l.source) === selectedId || idOf(l.target) === selectedId);

  // node Inspector
  useEffect(() => {
    const inspectorJsx = (
      <div className="h-[78vh] rounded-xl bg-white/95 p-3 overflow-auto">
        <h2 className="text-sm font-semibold mb-2">Node</h2>
        {selected ? (
          <table className="w-full text-xs">
            <tbody>
              {["label","kind","ip","subnet","zone","id"].map((key) => (
                <tr key={key} className="border-b border-gray-200/80">
                  <td className="py-1.5 font-medium text-gray-500">{key}</td>
                  <td className="py-1.5 text-right font-mono break-all">{String(selected[key] ?? "")}</td>
                </tr>
              ))}
              <tr className="border-b border-gray-200/80">
                <td className="py-1.5 font-medium text-gray-500">이웃연결수</td>
                <td className="py-1.5 text-right font-mono break-all">{adjacency.get(selected.id)?.size ?? 0}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500"></p>
        )}
      </div>
    );
    onInspectorChange?.(inspectorJsx);
  }, [selected, onInspectorChange, adjacency]);

  // Three.js 지오메트리 & 머티리얼 공유
  const geoCache = useMemo(() => ({
    torus: new THREE.TorusGeometry(7, 1.6, 16, 32),
    cone: new THREE.ConeGeometry(4.2, 9, 10),
    cylinder: new THREE.CylinderGeometry(4.2, 4.2, 8, 18),
    box: new THREE.BoxGeometry(8.2, 2.6, 6.2),
    l3top: new THREE.CylinderGeometry(2.8, 2.8, 2.2, 16),
    sphere: new THREE.SphereGeometry(3.0, 16, 16),
    octa: new THREE.OctahedronGeometry(4.2),
    led: new THREE.SphereGeometry(0.7, 8, 8),
    hit: new THREE.SphereGeometry(7, 8, 8),
  }), []);

  const nodeMatCache = useMemo(() => ({
    base: new Map(),
    highlight: new THREE.MeshStandardMaterial({ color: 0xffda79, metalness: 0.25, roughness: 0.72 }),
    dim: new THREE.MeshStandardMaterial({ color: 0x324055, metalness: 0.25, roughness: 0.72 }),
    ledUp: new THREE.MeshBasicMaterial({ color: 0x00ff99 }),
    ledDown: new THREE.MeshBasicMaterial({ color: 0xff3355 }),
    hit: new THREE.MeshBasicMaterial({ opacity: 0.0, transparent: true, depthWrite: false }),
  }), []);

  const getBaseMat = (hex) => { let m = nodeMatCache.base.get(hex); if (!m) { m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), metalness: 0.25, roughness: 0.72 }); nodeMatCache.base.set(hex, m); } return m; };

  // === 링크 머티리얼 (logical = 점선, physical = 실선) ===
  const linkMats = useMemo(() => ({
    dashed: new THREE.LineDashedMaterial({ color: 0x87aafc, dashSize: 2.2, gapSize: 2.2, transparent: true, opacity: 0.95 }),
    dashedInc: new THREE.LineDashedMaterial({ color: 0x3a6fe2, dashSize: 2.2, gapSize: 2.2, transparent: true, opacity: 0.95 }),
    basic: new THREE.MeshBasicMaterial({ color: 0xa9b9ff }),
    basicInc: new THREE.MeshBasicMaterial({ color: 0x3a6fe2 })
  }), []);

  function nodeThreeObject(node) {
    const group = new THREE.Group();
    const baseHex = (node.color || "#a0b4ff");
    const mat = !selectedId ? getBaseMat(baseHex) : (isHLNode(node) ? nodeMatCache.highlight : nodeMatCache.dim);
    let mesh;
    if (node.kind === "core") mesh = new THREE.Mesh(geoCache.torus, mat);
    else if (node.kind === "firewall") mesh = new THREE.Mesh(geoCache.cone, mat);
    else if (node.kind === "router") mesh = new THREE.Mesh(geoCache.cylinder, mat);
    else if (node.kind === "switch" || node.kind === "l2switch") mesh = new THREE.Mesh(geoCache.box, mat);
    else if (node.kind === "l3switch" || node.kind === "switchrouter" || node.kind === "layer3") {
      const baseBox = new THREE.Mesh(geoCache.box, mat);
      const topCyl = new THREE.Mesh(geoCache.l3top, mat);
      topCyl.position.y = 2.6;
      const g = new THREE.Group(); g.add(baseBox); g.add(topCyl); mesh = g;
    }
    else if (node.kind === "hub") mesh = new THREE.Mesh(geoCache.octa, mat);
    else mesh = new THREE.Mesh(geoCache.sphere, mat);
    const s = node.kind === "core" ? 1.4 : Math.max(0.9, Math.min(1.8, 0.95 + (node.__deg || 0) * 0.06));
    mesh.scale.set(s, s, s); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    const led = new THREE.Mesh(geoCache.led, node.status === "up" ? nodeMatCache.ledUp : nodeMatCache.ledDown); led.position.set(0, node.kind === "core" ? 8 : 6 * s, 0); group.add(led);
    const hit = new THREE.Mesh(geoCache.hit, nodeMatCache.hit); hit.name = "hit-proxy"; group.add(hit);
    return group;
  }

  const isLogicalLink = (l) => String(l.type || "").toLowerCase() === "logical";
  const isPhysicalLink = (l) => String(l.type || "").toLowerCase() === "physical";

  // ★ logical은 '라인(dashed)'로 보이게: linkWidth=0 고정
  const linkWidth = (l) => {
    if (isLogicalLink(l)) return 0;                         // dashed line
    // physical은 실선(튜브) 굵기
    return selectedId ? (isIncident(l) ? 3 : 1.7) : 1.9;
  };

  const linkMaterial = (l) => {
    if (isLogicalLink(l)) {
      return (selectedId && isIncident(l)) ? linkMats.dashedInc : linkMats.dashed;
    }
    return (selectedId && isIncident(l)) ? linkMats.basicInc : linkMats.basic;
  };

  // 색상은 보조(툴팁/레이블 없는 경우 대비)
  const linkColor = (l) =>
    selectedId ? (isIncident(l) ? (isLogicalLink(l) ? "#3a6fe2" : "#3a6fe2") : (isLogicalLink(l) ? "#87aafc" : "#7f90b8"))
               : (isLogicalLink(l) ? "#87aafc" : "#a9b9ff");

  const linkDirectionalParticles = (l) => (selectedId ? (isIncident(l) ? 4 : 0) : isLogicalLink(l) ? 0 : 2);
  const linkDirectionalParticleSpeed = (l) => (isPhysicalLink(l) ? 0.006 : 0.0);
  const linkDirectionalParticleWidth = 1.2;
  const linkCurvature = (l) => (isPhysicalLink(l) ? 0.05 : 0.16);
  const linkCurveRotation = (l) => ((hashId(idOf(l.source)) + hashId(idOf(l.target))) % 628) / 100;

  const focusNodeById = useCallback((nodeId) => {
    const node = filtered.nodes.find((n) => n.id === nodeId) || graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setSelected(node);
    const distance = 170;
    const zFixed = 680;
    const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
    fgRef.current?.cameraPosition({ x: (node.x || 1) * distRatio, y: (node.y || 1) * distRatio, z: zFixed }, node, 900);
  }, [filtered.nodes, graph.nodes]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const core = graph.nodes.find((n) => n.kind === "core");
      if (core) focusNodeById(core.id);
    }, 300);
    return () => clearTimeout(timer);
  }, [graph.nodes, focusNodeById]);

  const handleNodeClick = (n) => setSelected(n);
  const handleBackgroundClick = () => setSelected(null);

  const toggleZone = (z) => {
    setSelected((prev) => (prev && normalizeZoneVal(prev.zone) === z ? null : prev));
    setSelectedZones((prev) => {
      const set = new Set(prev);
      if (set.has(z)) set.delete(z); else set.add(z);
      return Array.from(set).sort((a,b)=>a-b);
    });
  };
  const selectAll = () => setSelectedZones(allZones);
  const selectNone = () => setSelectedZones([]);

  // Space+Drag for pan
  const spaceDownRef = useRef(false);
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const controls = fg.controls && fg.controls();
    const renderer = fg.renderer && fg.renderer();
    if (!controls || !renderer) return;

    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.listenToKeyEvents && controls.listenToKeyEvents(window);
    controls.keyPanSpeed = 8.0;

    const el = renderer.domElement;
    let space = false;
    const setCursor = () => { if (el) el.style.cursor = space ? "grab" : ""; };

    const onKeyDown = (e) => {
      if (e.code === "Space" || e.key === " ") {
        if (!space) {
          space = true; spaceDownRef.current = true; setCursor();
          controls.mouseButtons.LEFT = 2; // PAN
          e.preventDefault();
        }
      }
    };
    const onKeyUp = (e) => {
      if (e.code === "Space" || e.key === " ") {
        space = false; spaceDownRef.current = false; setCursor();
        controls.mouseButtons.LEFT = 0; // ROTATE
      }
    };
    const onMouseDown = () => { if (space && el) el.style.cursor = "grabbing"; };
    const onMouseUp = () => { if (space && el) el.style.cursor = "grab"; };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    controls.mouseButtons.RIGHT = 2; // PAN

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // 존 상세 페이지 토글
  if (activeZone !== null) {
    return <ZonePage zone={activeZone} onBack={() => setActiveZone(null)} />;
  }

  return (
    <div style={{width:'100%',height:'100vh',background:'linear-gradient(135deg,#0b0f18,#0a0c10)',borderRadius:0,overflow:'hidden',border:'1px solid rgba(255,255,255,0.10)',boxShadow:'0 8px 32px 0 #0006',display:'flex'}}>
      {/* Left vertical toolbar */}
      <aside style={{width:280,flex:'none',background:'rgba(0,0,0,0.30)',backdropFilter:'blur(6px)',borderRight:'1px solid rgba(255,255,255,0.10)',padding:16,display:'flex',flexDirection:'column',borderRadius:0}}>
        {/* View(쿼리) 섹션 */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <div style={{width:12,height:12,borderRadius:6,background:'#60a5fa',boxShadow:'0 0 4px #60a5fa'}}></div>
          <span style={{fontSize:15,color:'#e5e7eb',fontWeight:600}}>View (쿼리)</span>
        </div>

        {/* 상단: All 단독 버튼 */}
        <div style={{display:'grid',gridTemplateColumns:'1fr',gap:6,marginBottom:10}}>
          <button
            onClick={()=>setView("default")}
            style={{
              padding:'8px 0',borderRadius:8,fontSize:13,
              background:view==="default"?'#2563ebcc':'rgba(255,255,255,0.08)',
              color:'#fff',border:'1px solid rgba(255,255,255,0.15)',cursor:'pointer'
            }}
          >
            All
          </button>
        </div>

        {/* 구분선 */}
        <div style={{height:1, background:'rgba(255,255,255,0.10)', margin:'6px 0 10px'}} />

        {/* 하단: Link Type (Physical / Logical) - 내부 버튼 제거 */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <span style={{fontSize:13, color:'#cbd5e1'}}>Link Type</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:14}}>
          <button
            onClick={()=>setView("physical")}
            style={{
              padding:'7px 0',borderRadius:8,fontSize:12,
              background:view==="physical"?'#2563ebcc':'rgba(255,255,255,0.08)',
              color:'#fff',border:'1px solid rgba(255,255,255,0.15)',cursor:'pointer'
            }}
            title="물리 링크만 보기"
          >
            Physical
          </button>
          <button
            onClick={()=>setView("logical")}
            style={{
              padding:'7px 0',borderRadius:8,fontSize:12,
              background:view==="logical"?'#2563ebcc':'rgba(255,255,255,0.08)',
              color:'#fff',border:'1px solid rgba(255,255,255,0.15)',cursor:'pointer'
            }}
            title="논리 링크(점선)만 보기"
          >
            Logical
          </button>
        </div>

        {/* 뷰 초기화 */}
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <button onClick={() => {
            setSelected(null);
            setSelectedZones(allZones);
            setView("default"); // 초기 뷰 = All
            const core = graph.nodes.find((n) => n.kind === "core");
            if (core && fgRef.current) {
              const distance = 170;
              const zFixed = 680;
              const distRatio = 1 + distance / Math.hypot(core.x || 1, core.y || 1, core.z || 1);
              fgRef.current.cameraPosition({ x: (core.x || 1) * distRatio, y: (core.y || 1) * distRatio, z: zFixed }, core, 800);
            }
          }} style={{flex:1,padding:'7px 0', borderRadius:8,fontSize:13,background:'#2563ebcc',color:'#fff',border:'1px solid #3b82f6',cursor:'pointer'}}>뷰 초기화</button>
        </div>

        {/* Zones 목록 */}
        <div style={{display:'flex',alignItems:'center',gap:8,margin:'8px 0 10px'}}>
          <div style={{width:12,height:12,borderRadius:6,background:'#60a5fa',boxShadow:'0 0 4px #60a5fa'}}></div>
          <span style={{fontSize:15,color:'#e5e7eb',fontWeight:600}}>Zones</span>
        </div>

        <div style={{flex:1,overflowY:'auto',paddingRight:4}}>
          {allZones.map((z) => {
            const active = selectedZones.includes(z);
            const ct = countByZone.get(z) || 0;
            return (
              <div key={z} style={{border:'1px solid '+(active?'#3b82f6':'#e5e7eb22'),borderRadius:8,marginBottom:8,background:'rgba(255,255,255,0.05)'}}>
                {/* 존 상세 보기(ZonePage) */}
                <button
                  onClick={() => setActiveZone(z)}
                  style={{
                    width:'100%',textAlign:'left',padding:'10px 14px',fontSize:13,color:active?'#fff':'#cbd5e1',fontWeight:active?600:400,background:'transparent',border:'none',cursor:'pointer'
                  }}
                >
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span>Zone {z}</span>
                    <span style={{fontSize:11,padding:'2px 8px',borderRadius:999,background:'rgba(255,255,255,0.12)',color:'#fff'}}>{ct}</span>
                  </div>
                </button>

                {/* 쿼리 바로 실행: zoneN / zoneN_strict */}
                <div style={{display:'flex',gap:6,padding:'0 10px 10px'}}>
                  <button
                    onClick={()=>setView(`zone${z}`)}
                    title="해당 존과 교차하는 엣지 포함"
                    style={{flex:1,padding:'6px 0',borderRadius:8,fontSize:12,background:'rgba(255,255,255,0.08)',color:'#e5e7eb',border:'1px solid rgba(255,255,255,0.15)',cursor:'pointer'}}
                  >simple</button>
                  <button
                    onClick={()=>setView(`zone${z}_strict`)}
                    title="양끝 노드 모두 같은 존만"
                    style={{flex:1,padding:'6px 0',borderRadius:8,fontSize:12,background:'rgba(255,255,255,0.08)',color:'#e5e7eb',border:'1px solid rgba(255,255,255,0.15)',cursor:'pointer'}}
                  >detail</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Zone filter checkboxes (로컬 표시 제어) */}
        <div style={{marginTop:'auto',paddingTop:18}}>
          <div style={{marginBottom:10, fontSize:13, color:'#e5e7eb', fontWeight:600}}>Zone Filter</div>
          <form style={{display:'flex',flexDirection:'column',gap:6,marginBottom:10}}>
            {allZones.map((z) => (
              <label key={z} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'#cbd5e1',cursor:'pointer'}}>
                <input
                  type="checkbox"
                  checked={selectedZones.includes(z)}
                  onChange={() => toggleZone(z)}
                  style={{accentColor:'#2563eb',width:16,height:16,margin:0}}
                />
                <span>Zone {z} <span style={{fontSize:11,marginLeft:4,color:'#94a3b8'}}>({countByZone.get(z) || 0})</span></span>
              </label>
            ))}
          </form>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <button onClick={selectAll}  style={{flex:1,padding:'8px 0',borderRadius:8,fontSize:13,background:'rgba(255,255,255,0.10)',color:'#f1f5f9',border:'1px solid rgba(255,255,255,0.10)',cursor:'pointer'}}>All</button>
            <button onClick={selectNone} style={{flex:1,padding:'8px 0',borderRadius:8,fontSize:13,background:'rgba(255,255,255,0.10)',color:'#f1f5f9',border:'1px solid rgba(255,255,255,0.10)',cursor:'pointer'}}>None</button>
          </div>
          <div style={{marginTop:4,fontSize:12,color:'#94a3b8'}}>{filtered.nodes.length} nodes • {filtered.links.length} links</div>
        </div>
      </aside>

      {/* Graph area */}
      <main style={{flex:1,height:'100%'}}>
        <ForceGraph3D
          ref={fgRef}
          graphData={filtered}
          backgroundColor="#0f1216"
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend
          linkWidth={linkWidth}                       // ← logical: 0 (라인), physical: 튜브
          linkColor={linkColor}
          linkMaterial={linkMaterial}                 // ← logical: LineDashedMaterial
          linkDirectionalParticles={linkDirectionalParticles}
          linkDirectionalParticleSpeed={linkDirectionalParticleSpeed}
          linkDirectionalParticleWidth={1.2}
          linkCurvature={linkCurvature}
          linkCurveRotation={linkCurveRotation}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.6}
          onEngineStop={() => {
            fgRef.current?.scene()?.traverse((obj) => {
              if (obj.type === "Line" || obj.type === "LineSegments") obj.computeLineDistances?.();
            });
          }}
          onNodeClick={(n)=>setSelected(n)}
          onBackgroundClick={()=>setSelected(null)}
          enableNodeDrag={false}
          showNavInfo={false}
          warmupTicks={18}
          cooldownTicks={70}
          d3AlphaDecay={0.028}
          d3VelocityDecay={0.35}
        />
      </main>
    </div>
  );
}
