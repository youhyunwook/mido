import React, { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";

// ------------------------------
// 1) 데이터 로딩 & 표준화 + 중앙 Core로 고아링크 수렴
// ------------------------------
async function fetchNetworkData(activeView = "externalInternal") {
  const res = await fetch(`http://localhost:8000/neo4j/nodes?activeView=${activeView}`);
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

  // 고아 링크 → CORE
  const orphan = rawLinks.filter((l) => !nodeIds.has(l.source) || !nodeIds.has(l.target));
  if (orphan.length) {
    const coreId = "__core__";
    if (!nodesMap.has(coreId)) {
      nodesMap.set(coreId, {
        id: coreId,
        label: "CORE",
        kind: "core",
        type: "core",
        color: "#ffffff",
        status: "up",
        zone: null,
      });
    }
    for (const l of orphan) {
      const srcOK = nodeIds.has(l.source);
      const tgtOK = nodeIds.has(l.target);
      if (srcOK && !tgtOK) filtered.push({ ...l, target: coreId, type: l.type || "logical" });
      else if (!srcOK && tgtOK) filtered.push({ ...l, source: coreId, type: l.type || "logical" });
    }
  }

  // self-loop/중복 제거
  const seen = new Set();
  const links = [];
  for (const l of filtered) {
    if (l.source === l.target) continue;
    const k1 = `${l.source}|${l.target}|${l.type || ""}`;
    const k2 = `${l.target}|${l.source}|${l.type || ""}`;
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1);
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
    const subnet = n.subnet
      ? n.subnet
      : typeof n.ip === "string" && n.ip.includes(".")
      ? n.ip.split(".").slice(0, 3).join(".") + ".0/24"
      : "unknown/24";
    const zone = Number.isFinite(n.zone) ? n.zone : n.kind === "core" ? null : 0;
    return { ...n, kind, label, color, status, subnet, zone };
  });

  return { nodes, links };
}

// ------------------------------
// 2) 유틸
// ------------------------------
function idOf(x) {
  return typeof x === "object" && x !== null ? x.id : x;
}

function hashId(x) {
  const s = String(x);
  let h = 0 >>> 0;
  for (let i = 0; i < s.length; i++) h = (((h << 5) - h) + s.charCodeAt(i)) >>> 0; // h*31 + c
  return h >>> 0;
}

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

function buildNeighbors(nodes, links) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const neigh = new Map();
  for (const n of nodes) neigh.set(n.id, new Set());
  for (const l of links) {
    const s = idOf(l.source),
      t = idOf(l.target);
    if (byId.has(s) && byId.has(t)) {
      neigh.get(s)?.add(t);
      neigh.get(t)?.add(s);
    }
  }
  return { byId, neigh };
}

// ------------------------------
// 3) 레이아웃: Zone별 Firewall 중심 Starburst + Core 고정
// ------------------------------
function computeZoneCenters(nodes, zoneGap = 800, pinnedZones = new Set()) {
  const zones = [...new Set(nodes.map((n) => n.zone).filter((z) => Number.isFinite(z)))].sort((a, b) => a - b);
  const centers = new Map();

  if (pinnedZones && pinnedZones.size) {
    for (const z of pinnedZones) if (zones.includes(z)) centers.set(z, { x: 0, y: 0, z: 0 });
    const others = zones.filter((z) => !pinnedZones.has(z));
    const R = zoneGap * 1.2;
    const step = (2 * Math.PI) / Math.max(1, others.length);
    others.forEach((z, i) => {
      centers.set(z, {
        x: Math.cos(i * step) * R,
        y: Math.sin(i * step) * R,
        z: ((i % 5) - 2) * 90,
      });
    });
    return centers;
  }

  const cols = Math.ceil(Math.sqrt(zones.length || 1));
  const rows = Math.ceil((zones.length || 1) / cols);
  zones.forEach((z, i) => {
    const r = Math.floor(i / cols),
      c = i % cols;
    const cx = (c - (cols - 1) / 2) * zoneGap;
    const cy = (r - (rows - 1) / 2) * zoneGap;
    const cz = ((i % 5) - 2) * 100;
    centers.set(z, { x: cx, y: cy, z: cz });
  });
  return centers;
}

function starburstFirewallCentered(
  nodes,
  links,
  {
    minArms = 6,
    maxArms = 18,
    baseRadius = 36,
    layerStepR = 58,
    layerStepZ = 22,
    bucketSpreadDegNear = 18,
    bucketSpreadDegFar = 60,
    armJitterAngle = 0.0,
    nodeJitterR = 8,
    nodeJitterZ = 6,
  } = {}
) {
  const PIN_HINTS = new Set(["786", 786, "172.45.0.195"]);
  const isPinnedNode = (n) => PIN_HINTS.has(n.id) || PIN_HINTS.has(String(n.id)) || PIN_HINTS.has(n.label) || PIN_HINTS.has(n.ip);
  const pinnedZones = new Set(
    nodes.filter((n) => Number.isFinite(n.zone) && n.kind === "firewall" && isPinnedNode(n)).map((n) => n.zone)
  );

  const centers = computeZoneCenters(nodes, 800, pinnedZones);
  const { byId, neigh } = buildNeighbors(nodes, links);

  for (const n of nodes) n.__deg = neigh.get(n.id)?.size || 0;

  const zoneNodes = new Map();
  const zoneSubnets = new Map();
  for (const n of nodes) {
    if (!Number.isFinite(n.zone)) continue;
    if (!zoneNodes.has(n.zone)) zoneNodes.set(n.zone, []);
    zoneNodes.get(n.zone).push(n);
    if (!zoneSubnets.has(n.zone)) zoneSubnets.set(n.zone, new Set());
    zoneSubnets.get(n.zone).add(n.subnet);
  }

  function pickFirewallRoot(arr) {
    const pinnedFw = arr.find(
      (n) => n.kind === "firewall" && (String(n.id) === "786" || n.id === 786 || n.label === "172.45.0.195" || n.ip === "172.45.0.195")
    );
    if (pinnedFw) return pinnedFw;
    const fws = arr.filter((n) => n.kind === "firewall");
    if (fws.length) return fws.sort((a, b) => (neigh.get(b.id)?.size || 0) - (neigh.get(a.id)?.size || 0))[0];
    const pref = new Set(["router", "l3switch", "switchrouter", "layer3"]);
    const cand = arr.filter((n) => pref.has(n.kind));
    if (cand.length) return cand.sort((a, b) => (neigh.get(b.id)?.size || 0) - (neigh.get(a.id)?.size || 0))[0];
    return arr.slice().sort((a, b) => (neigh.get(b.id)?.size || 0) - (neigh.get(a.id)?.size || 0))[0];
  }

  for (const [zone, arr] of zoneNodes.entries()) {
    const center = centers.get(zone) || { x: 0, y: 0, z: 0 };
    const root = pickFirewallRoot(arr);

    if (root) {
      root.__targetX = center.x;
      root.__targetY = center.y;
      root.__targetZ = center.z;
      root.fx = center.x;
      root.fy = center.y;
      root.fz = center.z;
      root.__progress = 0;
    }

    // BFS 깊이 산출 (같은 zone 내에서만)
    const depth = new Map();
    const q = [];
    if (root) {
      depth.set(root.id, 0);
      q.push(root.id);
    }
    while (q.length) {
      const u = q.shift();
      for (const v of neigh.get(u) || []) {
        if (!depth.has(v) && byId.get(v)?.zone === zone) {
          depth.set(v, depth.get(u) + 1);
          q.push(v);
        }
      }
    }

    // Subnet → ARM
    const snList = [...(zoneSubnets.get(zone) || new Set())].sort();
    const armCount = Math.max(minArms, Math.min(maxArms, snList.length || minArms));
    const snToArm = new Map();
    snList.forEach((sn) => snToArm.set(sn, hashId(sn) % armCount));
    const base = -Math.PI;
    const step = (2 * Math.PI) / armCount;

    // 버킷 배치
    const buckets = new Map();
    for (const n of arr) {
      if (root && n.id === root.id) continue;
      const d = depth.has(n.id) ? depth.get(n.id) : 1;
      const arm = snToArm.get(n.subnet) ?? (hashId(n.id) % armCount);
      const key = `${arm}|${d}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(n);
    }

    for (const [key, list] of buckets.entries()) {
      list.sort((a, b) => String(a.label || a.ip || a.id).localeCompare(String(b.label || b.ip || b.id)));
      const [armStr, depthStr] = key.split("|");
      const arm = parseInt(armStr, 10);
      const d = parseInt(depthStr, 10);

      const t = Math.min(1, d / 4);
      const spreadDeg = bucketSpreadDegNear * (1 - t) + bucketSpreadDegFar * t;
      const spread = (spreadDeg * Math.PI) / 180;

      for (let i = 0; i < list.length; i++) {
        const frac = list.length === 1 ? 0 : i / (list.length - 1) - 0.5;
        const thetaBase = base + arm * step;
        const theta = thetaBase + frac * spread + (Math.random() - 0.5) * armJitterAngle;

        const n = list[i];
        const typeBias = n.kind === "switch" || n.kind === "hub" ? -10 : n.kind === "server" || n.kind === "host" ? 12 : 0;
        const r = baseRadius + d * layerStepR + typeBias + (Math.random() - 0.5) * nodeJitterR;
        const phi = Math.min(Math.PI / 2.2, 0.38 + d * 0.06 + (Math.random() - 0.5) * 0.05);

        n.__targetX = center.x + r * Math.cos(theta) * Math.cos(phi);
        n.__targetY = center.y + r * Math.sin(theta) * Math.cos(phi);
        n.__targetZ = center.z + r * Math.sin(phi) + (Math.random() - 0.5) * nodeJitterZ + d * (layerStepZ * 0.15);

        n.fx = center.x;
        n.fy = center.y;
        n.fz = center.z;
        n.__progress = 0;
      }
    }
  }

  // CORE 고정 (뒤로 살짝)
  for (const n of nodes) {
    if (n.kind === "core") {
      n.__targetX = 0;
      n.__targetY = 0;
      n.__targetZ = -280;
      n.fx = 0;
      n.fy = 0;
      n.fz = -280;
      n.__progress = 1;
    }
  }

  return { nodes };
}

// ------------------------------
// 4) 메인 컴포넌트 (+ Space-Drag Pan)
// ------------------------------
export default function FirewallCenteredStarburst({ onInspectorChange }) {
  const fgRef = useRef();
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [selected, setSelected] = useState(null);
  const spaceDownRef = useRef(false);

  // 라이트
  useEffect(() => {
    const scene = fgRef.current?.scene?.();
    if (!scene) return;
    const old = scene.getObjectByName("_decor");
    if (old) scene.remove(old);
    const decor = new THREE.Group();
    decor.name = "_decor";
    decor.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.95);
    dir.position.set(260, 320, 360);
    decor.add(dir);
    const rim = new THREE.DirectionalLight(0x88ccff, 0.35);
    rim.position.set(-260, -200, -300);
    decor.add(rim);
    scene.add(decor);
    return () => {
      scene.remove(decor);
    };
  }, []);

  // 데이터 로딩 + 레이아웃 적용
  useEffect(() => {
    (async () => {
      const raw = await fetchNetworkData("externalInternal");
      const laid = starburstFirewallCentered(raw.nodes, raw.links, {
        minArms: 6,
        maxArms: 18,
        layerStepR: 60,
        layerStepZ: 24,
        bucketSpreadDegNear: 20,
        bucketSpreadDegFar: 70,
      });
      setGraph({ nodes: laid.nodes, links: raw.links });
    })();
  }, []);

  // Space + Drag = Pan
  useEffect(() => {
    const fg = fgRef.current;
    const controls = fg?.controls?.();
    const renderer = fg?.renderer?.();
    if (!controls || !renderer) return;

    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.listenToKeyEvents?.(window);
    controls.keyPanSpeed = 12.0;

    const el = renderer.domElement;
    let space = false;
    const setCursor = () => { if (el) el.style.cursor = space ? "grab" : ""; };

    const onKeyDown = (e) => {
      if (e.code === "Space" || e.key === " ") {
        if (!space) {
          space = true; spaceDownRef.current = true; setCursor();
          controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
          e.preventDefault();
        }
      }
    };
    const onKeyUp = (e) => {
      if (e.code === "Space" || e.key === " ") {
        space = false; spaceDownRef.current = false; setCursor();
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      }
    };
    const onMouseDown = () => { if (space && el) el.style.cursor = "grabbing"; };
    const onMouseUp = () => { if (space && el) el.style.cursor = "grab"; };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // 성장 애니메이션
  useEffect(() => {
    let raf; const speed = 0.045;
    const animate = (t = 0) => {
      let changed = false;
      for (const n of graph.nodes) {
        if (n.__progress == null) continue;
        if (n.__progress < 1) n.__progress = Math.min(1, n.__progress + speed);
        const u = n.__progress; const ease = u < 0.5 ? 2 * u * u : -1 + (4 - 2 * u) * u;
        n.fx = n.fx + (n.__targetX - n.fx) * ease;
        n.fy = n.fy + (n.__targetY - n.fy) * ease;
        n.fz = n.fz + (n.__targetZ - n.fz) * ease;
        if (n.__progress >= 1) {
          const wob = 0.9 + (n.__deg || 0) * 0.02;
          n.fx += Math.sin(0.0018 * t + hashId(n.id) * 0.00013) * 0.6 * wob;
          n.fy += Math.cos(0.0015 * t + hashId(n.id) * 0.00017) * 0.6 * wob;
          n.fz += Math.sin(0.0012 * t + hashId(n.id) * 0.00011) * 0.4 * wob;
        }
        changed = true;
      }
      if (changed) fgRef.current?.refresh();
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [graph.nodes]);

  // 인접/선택
  const adjacency = useMemo(() => buildAdjacency(graph.links), [graph.links]);
  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => { setSelectedId(selected?.id ?? null); }, [selected]);
  const isHLNode = (n) => selectedId && (n.id === selectedId || adjacency.get(selectedId)?.has(n.id));
  const isIncident = (l) => selectedId && (idOf(l.source) === selectedId || idOf(l.target) === selectedId);

  // Inspector 패널 콜백
  useEffect(() => {
    const inspectorJsx = (
      <div className="h-[80vh] rounded-2xl bg-white/90 p-4 overflow-auto mt-4">
        <h2 className="text-xl font-semibold mb-3">Node Info</h2>
        {selected ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {["subnet", "zone", "ip", "id", "kind", "label"].map((key) => (
                  <tr key={key} className="border-b border-gray-200/80">
                    <td className="py-2 font-medium text-gray-500">{key}</td>
                    <td className="py-2 text-right font-mono break-all">{String(selected[key] ?? "")}</td>
                  </tr>
                ))}
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
    onInspectorChange?.(inspectorJsx);
  }, [selected, adjacency, onInspectorChange, graph.nodes]);

  // 노드/링크 렌더링
  function nodeThreeObject(node) {
    const group = new THREE.Group();
    const base = new THREE.Color(node.color || "#a0b4ff");
    const HIGHLIGHT = new THREE.Color(0xffda79);
    const DIM = new THREE.Color(0x324055);
    const use = !selectedId ? base : isHLNode(node) ? HIGHLIGHT : DIM;

    const mat = new THREE.MeshStandardMaterial({ color: use, metalness: 0.25, roughness: 0.72 });
    let mesh;
    if (node.kind === "core") mesh = new THREE.Mesh(new THREE.TorusGeometry(7, 1.6, 16, 32), mat);
    else if (node.kind === "firewall") mesh = new THREE.Mesh(new THREE.ConeGeometry(4.2, 9, 10), mat);
    else if (node.kind === "router") mesh = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 8, 18), mat);
    else if (node.kind === "switch" || node.kind === "l2switch") mesh = new THREE.Mesh(new THREE.BoxGeometry(8.2, 2.6, 6.2), mat);
    else if (node.kind === "l3switch" || node.kind === "switchrouter" || node.kind === "layer3") {
      const baseBox = new THREE.Mesh(new THREE.BoxGeometry(8.2, 2.6, 6.2), mat);
      const topCyl = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 2.2, 16), mat);
      topCyl.position.y = 2.6;
      const g = new THREE.Group();
      g.add(baseBox);
      g.add(topCyl);
      mesh = g;
    } else if (node.kind === "hub") mesh = new THREE.Mesh(new THREE.OctahedronGeometry(4.2), mat);
    else mesh = new THREE.Mesh(new THREE.SphereGeometry(3.0, 16, 16), mat);

    const s = node.kind === "core" ? 1.4 : Math.max(0.9, Math.min(1.8, 0.95 + (node.__deg || 0) * 0.06));
    mesh.scale.set(s, s, s);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 8, 8),
      new THREE.MeshBasicMaterial({ color: node.status === "up" ? 0x00ff99 : 0xff3355 })
    );
    led.position.set(0, node.kind === "core" ? 8 : 6 * s, 0);
    group.add(led);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(7, 8, 8),
      new THREE.MeshBasicMaterial({ opacity: 0.0, transparent: true, depthWrite: false })
    );
    hit.name = "hit-proxy";
    group.add(hit);

    return group;
  }

  const isLogicalLink = (l) => String(l.type || "").toLowerCase() === "logical";
  const isPhysicalLink = (l) => String(l.type || "").toLowerCase() === "physical";

  const linkWidth = (l) =>
    selectedId ? (isIncident(l) ? 3 : isPhysicalLink(l) ? 1.7 : 1.0) : isPhysicalLink(l) ? 1.9 : 1.1;
  const linkColor = (l) =>
    selectedId ? (isIncident(l) ? "#3a6fe2" : isLogicalLink(l) ? "#88a0cc" : "#7f90b8") : isLogicalLink(l) ? "#87aafc" : "#a9b9ff";
  const linkMaterial = (l) =>
    isLogicalLink(l)
      ? new THREE.LineDashedMaterial({ color: selectedId && isIncident(l) ? 0x3a6fe2 : 0x87aafc, dashSize: 2, gapSize: 2, transparent: true, opacity: 0.95 })
      : new THREE.LineBasicMaterial({ color: selectedId && isIncident(l) ? 0x3a6fe2 : 0xa9b9ff });
  const linkDirectionalParticles = (l) => (selectedId ? (isIncident(l) ? 4 : 0) : isLogicalLink(l) ? 0 : 2);
  const linkDirectionalParticleSpeed = (l) => (isPhysicalLink(l) ? 0.006 : 0.0);
  const linkDirectionalParticleWidth = 1.2;
  const linkCurvature = (l) => (isPhysicalLink(l) ? 0.05 : 0.16);
  const linkCurveRotation = (l) => ((hashId(idOf(l.source)) + hashId(idOf(l.target))) % 628) / 100;

  const focusNodeById = (nodeId) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setSelected(node);
    const distance = 140;
    const zFixed = 420;
    const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
    fgRef.current?.cameraPosition({ x: (node.x || 1) * distRatio, y: (node.y || 1) * distRatio, z: zFixed }, node, 900);
  };
  const handleNodeClick = (n) => {
    if (spaceDownRef.current) return; // 팬 중 클릭 무시
    focusNodeById(n.id);
  };
  const handleBackgroundClick = () => setSelected(null);

  return (
    <div className="w-full h-full">
      <ForceGraph3D
        ref={fgRef}
        graphData={graph}
        backgroundColor="#0f1216"
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend
        linkWidth={linkWidth}
        linkColor={linkColor}
        linkMaterial={linkMaterial}
        linkDirectionalParticles={linkDirectionalParticles}
        linkDirectionalParticleSpeed={linkDirectionalParticleSpeed}
        linkDirectionalParticleWidth={linkDirectionalParticleWidth}
        linkCurvature={linkCurvature}
        linkCurveRotation={linkCurveRotation}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0.6}
        onEngineStop={() => {
          fgRef.current?.scene()?.traverse((obj) => {
            if (obj.type === "Line" || obj.type === "LineSegments") obj.computeLineDistances?.();
          });
        }}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        enableNodeDrag={false}
        showNavInfo={false}
        warmupTicks={18}
        cooldownTicks={70}
        d3AlphaDecay={0.028}
        d3VelocityDecay={0.35}
      />
    </div>
  );
}
