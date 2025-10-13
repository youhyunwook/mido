// src/ZonePage.jsx
import React, { useRef, useEffect, useState, useMemo } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";

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

export default function ZonePage({ zone, onBack, onInspectorChange }) {
  const fgRef = useRef();
  const [zoneGraph, setZoneGraph] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const NODE_SCALE_MULT = 1.7; // match network_topology scaling

  useEffect(() => {
    if (zone === null || zone === undefined) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`http://localhost:8000/neo4j/nodes?activeView=zone${zone}`);
        const data = await res.json();

        const nodesMap = new Map();
        const rawLinks = [];
        data.forEach((item) => {
          if (item.src_IP?.id) nodesMap.set(String(item.src_IP.id), item.src_IP);
          if (item.dst_IP?.id) nodesMap.set(String(item.dst_IP.id), item.dst_IP);
          if (item.edge?.sourceIP && item.edge?.targetIP) {
            rawLinks.push({
              source: String(item.edge.sourceIP),
              target: String(item.edge.targetIP),
              ...item.edge,
            });
          }
        });

        const nodeIds = new Set([...nodesMap.keys()]);
        const filtered = rawLinks.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));

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

        const nodes = Array.from(nodesMap.values()).map((n) => {
          const kind = (n.kind || n.type || "host").toLowerCase();
          const label = n.label || n.ip || String(n.id);
          const color = n.color || TYPE_COLORS[kind] || TYPE_COLORS.default;
          const status = n.status || "up";
          const subnet =
            n.subnet
              ? n.subnet
              : typeof n.ip === "string" && n.ip.includes(".")
              ? n.ip.split(".").slice(0, 3).join(".") + ".0/24"
              : "unknown/24";
          const zoneNum = Number.isFinite(n.zone) ? n.zone : null;
          return { ...n, id: String(n.id), kind, label, color, status, subnet, zone: zoneNum };
        });

        if (mounted) setZoneGraph({ nodes, links });
      } catch (e) {
        console.error(e);
        if (mounted) setZoneGraph({ nodes: [], links: [] });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [zone]);

  const geoCache = useMemo(
    () => ({
      torus: new THREE.TorusGeometry(7, 1.6, 16, 32),
      cone: new THREE.ConeGeometry(4.2, 9, 10),
      cylinder: new THREE.CylinderGeometry(4.2, 4.2, 8, 18),
      box: new THREE.BoxGeometry(8.2, 2.6, 6.2),
      l3top: new THREE.CylinderGeometry(2.8, 2.8, 2.2, 16),
      sphere: new THREE.SphereGeometry(3.0, 16, 16),
      led: new THREE.SphereGeometry(0.7, 8, 8),
      hit: new THREE.SphereGeometry(7, 8, 8),
      octa: new THREE.OctahedronGeometry(4.2, 0), // ★ hub용 누락 보완
      dashUnit: new THREE.CylinderGeometry(1, 1, 1, 10),
    }),
    []
  );

  const nodeMatCache = useMemo(
    () => ({
      base: new Map(),
      highlight: new THREE.MeshStandardMaterial({ color: 0xffda79, metalness: 0.25, roughness: 0.72 }),
      dim: new THREE.MeshStandardMaterial({ color: 0x324055, metalness: 0.25, roughness: 0.72 }),
      ledUp: new THREE.MeshBasicMaterial({ color: 0x00ff99 }),
      ledDown: new THREE.MeshBasicMaterial({ color: 0xff3355 }),
      hit: new THREE.MeshBasicMaterial({ opacity: 0.0, transparent: true, depthWrite: false }),
      dashedBase: new THREE.MeshStandardMaterial({ color: 0x87aafc, metalness: 0.15, roughness: 0.6, transparent: true, opacity: 0.98, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      dashedInc: new THREE.MeshStandardMaterial({ color: 0x3a6fe2, metalness: 0.2, roughness: 0.55, transparent: true, opacity: 1.0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    }),
    []
  );

  // Dash/curve helpers (render logical links as grouped cylinders)
  const DASH_CONF = {
    count: 16,
    ratio: 0.58,
    baseRadius: 1.35,
    incRadius: 2.8,
  };

  function getCurve(start, end, curvature = 0.12, rotation = 0) {
    const v = new THREE.Vector3().subVectors(end, start);
    const len = v.length() || 1;
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const a = Math.abs(v.x) < 0.9 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
    const perp = new THREE.Vector3().crossVectors(v, a).normalize();
    perp.applyAxisAngle(v.clone().normalize(), rotation);
    const amp = curvature * len * 2.0;
    const ctrl = perp.multiplyScalar(amp).add(mid);
    return new THREE.QuadraticBezierCurve3(start, ctrl, end);
  }

  function ensureDashMeshes(group, dashCount, geo, matBase, matInc) {
    if (!group.userData.dashes) group.userData.dashes = [];
    const cur = group.userData.dashes;
    while (cur.length < dashCount) { const m = new THREE.Mesh(geo, matBase); m.castShadow = false; m.receiveShadow = false; cur.push(m); group.add(m); }
    while (cur.length > dashCount) { const m = cur.pop(); group.remove(m); m.geometry?.dispose?.(); }
    group.userData.matBase = matBase; group.userData.matInc = matInc;
  }

  // enhance meshes after creation to minimize z-fighting
  function enhanceDashMesh(mesh) {
    try {
      mesh.renderOrder = 10;
      if (mesh.material) {
        mesh.material.depthWrite = false;
        mesh.material.polygonOffset = true;
        mesh.material.polygonOffsetFactor = -1;
      }
    } catch (e) {}
  }

  function placeCylinderBetween(mesh, a, b, radius) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const L = dir.length();
    if (L < 1e-6) { mesh.visible = false; return; }
    mesh.visible = true;
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
    mesh.scale.set(radius, L, radius);
  }

  const hashId = (s) => { s = String(s || ''); let h = 0; for (let i=0;i<s.length;i++) h = (h*131 + s.charCodeAt(i)) >>> 0; return h; };

  function linkCurvature(l) { return 0.12; }
  function linkCurveRotation(l) { return ((hashId(getId(l.source)) + hashId(getId(l.target))) % 628) / 100; }

  function linkThreeObject(l) {
    if (String(l.type || '').toLowerCase() !== 'logical') return undefined;
    const group = new THREE.Group(); group.userData = { type: 'logical-dashed', link: l, dashes: [] };
    return group;
  }

  function updateLogicalDashed(l, group) {
      // Resolve endpoints: l.source/l.target may be ids (strings) or node objects
      const srcObj = (l.source && typeof l.source === 'object') ? l.source : zoneGraph.nodes.find(n => String(n.id) === String(l.source));
      const tgtObj = (l.target && typeof l.target === 'object') ? l.target : zoneGraph.nodes.find(n => String(n.id) === String(l.target));
      if (!srcObj || !tgtObj) { group.visible = false; return; }
      const start = new THREE.Vector3(srcObj.x || 0, srcObj.y || 0, srcObj.z || 0);
      const end = new THREE.Vector3(tgtObj.x || 0, tgtObj.y || 0, tgtObj.z || 0);

      // Estimate node clearance (approximate visible radius) to trim curve endpoints
      const estimateClearance = (node) => {
        if (!node) return 3.0;
        // Mirror the sizing logic used in nodeThreeObjectHL: base radius ~3 * scale
        const deg = node.__deg || 0;
        const s = node.kind === 'core' ? 1.4 : Math.max(0.9, Math.min(1.8, 0.95 + (deg) * 0.06));
        return 3.0 * s; // base geometry radius ~3 units scaled
      };
      const cStart = estimateClearance(srcObj);
      const cEnd = estimateClearance(tgtObj);
      const totalVec = new THREE.Vector3().subVectors(end, start);
      const totalLen = totalVec.length() || 1;
      const dir = totalVec.clone().normalize();
      // Trimmed endpoints to avoid overlapping node geometry
      const trimmedStart = start.clone().add(dir.clone().multiplyScalar(Math.min(cStart, totalLen*0.4)));
      const trimmedEnd = end.clone().add(dir.clone().multiplyScalar(-Math.min(cEnd, totalLen*0.4)));
  const curve = getCurve(trimmedStart, trimmedEnd, linkCurvature(l), linkCurveRotation(l));
    const dashCount = DASH_CONF.count; const dashRatio = DASH_CONF.ratio;
    ensureDashMeshes(group, dashCount, geoCache.dashUnit, nodeMatCache.dashedBase, nodeMatCache.dashedInc);
    const incident = !!(selected && (getId(l.source) === selected.id || getId(l.target) === selected.id));
    const radius = incident ? DASH_CONF.incRadius : DASH_CONF.baseRadius; const mat = incident ? group.userData.matInc : group.userData.matBase;
      // Small offsets to avoid dashes overlapping node geometry (clamp t0/t1 inward)
      const EPS = 1.0 / (dashCount * 12); // smaller fraction
      const capTrim = Math.min(0.08, Math.max(0.02, (cStart + cEnd) / (totalLen * 4)));
      for (let i = 0; i < dashCount; i++) {
        const baseT0 = i / dashCount;
        const baseT1 = Math.min(1, baseT0 + (dashRatio / dashCount));
        const t0 = Math.max(0 + capTrim, baseT0 + EPS);
        const t1 = Math.min(1 - capTrim, baseT1 - EPS);
        if (t1 <= t0) { const mesh = group.userData.dashes[i]; if (mesh) mesh.visible = false; continue; }
        const a = curve.getPoint(t0); const b = curve.getPoint(t1);
        const mesh = group.userData.dashes[i]; if (!mesh) continue; mesh.material = mat; placeCylinderBetween(mesh, a, b, Math.max(0.2, radius)); enhanceDashMesh(mesh);
      }
      group.visible = true;
  }

  const getBaseMat = (hex) => {
    let m = nodeMatCache.base.get(hex);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), metalness: 0.25, roughness: 0.72 });
      nodeMatCache.base.set(hex, m);
    }
    return m;
  };

  // Build adjacency map for neighbor highlighting
  const adjacency = useMemo(() => {
    const m = new Map();
    zoneGraph.links.forEach((l) => {
      const a = l.source;
      const b = l.target;
      if (!m.has(a)) m.set(a, new Set());
      if (!m.has(b)) m.set(b, new Set());
      m.get(a).add(b);
      m.get(b).add(a);
    });
    return m;
  }, [zoneGraph]);

  // ID 정규화 헬퍼: 링크 끝점이 "문자열" 또는 "노드 객체" 모두 대응
  const getId = (end) => (end && typeof end === "object" ? (end.id ?? end.__id ?? String(end)) : String(end));

  // Highlight logic for nodes/links
  const isHLNode = (n) => selected && (n.id === selected.id || adjacency.get(selected.id)?.has(n.id));
  const isIncident = (l) => selected && (getId(l.source) === selected.id || getId(l.target) === selected.id); // ★ 수정

  // Inspector 
  useEffect(() => {
    if (!onInspectorChange) return;
    if (!selected) {
      onInspectorChange(null);
      return;
    }
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

  // Custom node object with highlight and always show IP label
  function nodeThreeObjectHL(node) {
    const group = new THREE.Group();
    const baseHex = node.color || "#a0b4ff";
    const mat = !selected ? getBaseMat(baseHex) : (isHLNode(node) ? nodeMatCache.highlight : nodeMatCache.dim);
    let mesh;
    if (node.kind === "core") mesh = new THREE.Mesh(geoCache.torus, mat);
    else if (node.kind === "firewall") mesh = new THREE.Mesh(geoCache.cone, mat);
    else if (node.kind === "router") mesh = new THREE.Mesh(geoCache.cylinder, mat);
    else if (node.kind === "switch" || node.kind === "l2switch") mesh = new THREE.Mesh(geoCache.box, mat);
    else if (node.kind === "l3switch" || node.kind === "switchrouter" || node.kind === "layer3") {
      const baseBox = new THREE.Mesh(geoCache.box, mat);
      const topCyl = new THREE.Mesh(geoCache.l3top, mat);
      topCyl.position.y = 2.6;
      const g = new THREE.Group();
      g.add(baseBox); g.add(topCyl);
      mesh = g;
    } else if (node.kind === "hub") mesh = new THREE.Mesh(geoCache.octa, mat);
    else mesh = new THREE.Mesh(geoCache.sphere, mat);
  const s = (node.kind === "core" ? 1.4 : Math.max(0.9, Math.min(1.8, 0.95 + (node.__deg || 0) * 0.06))) * NODE_SCALE_MULT;
  mesh.scale.set(s, s, s);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const led = new THREE.Mesh(geoCache.led, node.status === "up" ? nodeMatCache.ledUp : nodeMatCache.ledDown);
  led.position.set(0, node.kind === "core" ? 8 * NODE_SCALE_MULT : 6 * s, 0);
    group.add(led);
    const hit = new THREE.Mesh(geoCache.hit, nodeMatCache.hit);
    hit.name = "hit-proxy";
    group.add(hit);
    // Always show IP label above node
    if (node.ip) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 18px Arial';
      const text = node.ip;
      const textWidth = ctx.measureText(text).width;
      canvas.width = textWidth + 16;
      canvas.height = 32;
      ctx.font = 'bold 18px Arial';
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width/2, canvas.height/2);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set((canvas.width/10) * NODE_SCALE_MULT, (canvas.height/10) * NODE_SCALE_MULT, 1);
      sprite.position.set(0, node.kind === "core" ? 15 : 10 * s, 0);
      group.add(sprite);
    }
    return group;
  }

  return (
    <div style={{ height: '100vh', background: '#0f1216', padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: 24 }}>
        <button
          onClick={onBack}
          style={{ background: 'transparent', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 14 }}
        >
          ← Back
        </button>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#fff' }}>{`Zone ${zone}`}</h2>
        <div style={{ color: '#cbd5e1' }}>
          {loading ? 'Loading…' : `${zoneGraph.nodes.length} nodes • ${zoneGraph.links.length} links`}
        </div>
      </div>
      <div style={{ height: '80vh', background: '#181c23', borderRadius: 12, overflow: 'hidden', margin: '0 24px' }}>
        <ForceGraph3D
          ref={fgRef}
          graphData={zoneGraph}
          backgroundColor="#181c23"
          nodeLabel={null}
          nodeThreeObject={nodeThreeObjectHL}
          nodeThreeObjectExtend
          linkThreeObject={linkThreeObject}
          linkThreeObjectExtend={false}

          //  링크 강조 강화 (색/불투명도/두께/파티클/화살표)
          linkColor={(l) => {
            const isLogical = String(l.type || '').toLowerCase() === 'logical';
            if (isLogical) return selected ? (isIncident(l) ? '#3a6fe2' : '#87aafc') : '#87aafc';
            if (!selected) return '#bfc6d4';
            return isIncident(l) ? '#24a0ff' : '#5b6475';
          }}
          linkOpacity={(l) => {
            const isLogical = String(l.type || '').toLowerCase() === 'logical';
            if (isLogical) return selected ? (isIncident(l) ? 1.0 : 0.35) : 0.35;
            return (!selected ? 0.35 : isIncident(l) ? 0.95 : 0.08);
          }}
          linkWidth={(l) => {
            const isLogical = String(l.type || '').toLowerCase() === 'logical';
            if (isLogical) return 0; // hide base line for logical links
            return (!selected ? 1.2 : isIncident(l) ? 6 : 0.5);
          }}

          linkDirectionalParticles={(l) => {
            const isLogical = String(l.type || '').toLowerCase() === 'logical';
            if (isLogical) return 0;
            return (selected && isIncident(l) ? 4 : 0);
          }}
          linkDirectionalParticleWidth={(l) => {
            const isLogical = String(l.type || '').toLowerCase() === 'logical';
            if (isLogical) return 0;
            return (selected && isIncident(l) ? 5 : 0);
          }}
          linkDirectionalParticleSpeed={(l) => {
            const isLogical = String(l.type || '').toLowerCase() === 'logical';
            if (isLogical) return 0;
            return (selected && isIncident(l) ? 0.006 : 0);
          }}
          linkDirectionalParticleColor={(l) => {
            const isLogical = String(l.type || '').toLowerCase() === 'logical';
            if (isLogical) return '#000000';
            return (selected && isIncident(l) ? '#00e5ff' : '#000000');
          }}

          linkDirectionalArrowLength={(l) => {
            const isLogical = String(l.type || '').toLowerCase() === 'logical';
            if (isLogical) return 0;
            return (selected && isIncident(l) ? 6 : 0);
          }}
          linkDirectionalArrowRelPos={0.6} // ★
          linkDirectionalArrowColor={(l) => {
            const isLogical = String(l.type || '').toLowerCase() === 'logical';
            if (isLogical) return '#000000';
            return (selected && isIncident(l) ? '#00e5ff' : '#000000');
          }}

          linkLabel={(l) => {
            const sId = getId(l.source);  
            const tId = getId(l.target);
            const src = zoneGraph.nodes.find(n => n.id === sId);
            const tgt = zoneGraph.nodes.find(n => n.id === tId);
            return `IP: ${(src && src.ip) || sId} → ${(tgt && tgt.ip) || tId}`;
          }}

          enableNodeDrag={false}
          showNavInfo={false}
          cooldownTicks={60}
          d3AlphaDecay={0.028}
          d3VelocityDecay={0.35}
          style={{ height: '100%', width: '100%' }}
          onNodeClick={setSelected}
          onBackgroundClick={() => setSelected(null)}
          onLinkClick={(l) => {
            // when user clicks a link, select source node for inspector and highlight
            const sid = getId(l.source);
            const node = zoneGraph.nodes.find(n => n.id === sid) || zoneGraph.nodes[0];
            if (node) setSelected(node);
          }}
          onLinkUpdate={(l, obj) => { try { const line = l.__lineObj || obj; if (line && line.computeLineDistances) line.computeLineDistances(); } catch {} }}
          onEngineTick={() => {
            const scene = fgRef.current?.scene?.(); if (!scene) return;
            scene.traverse((obj) => { if (obj.userData?.type === 'logical-dashed' && obj.userData.link) { updateLogicalDashed(obj.userData.link, obj); } });
          }}
          onEngineStop={() => { const scene = fgRef.current?.scene?.(); if (!scene) return; scene.traverse((obj) => { if (obj.userData?.type === 'logical-dashed' && obj.userData.link) { updateLogicalDashed(obj.userData.link, obj); obj.visible = true; } }); }}
        />
      </div>
    </div>
  );
}
