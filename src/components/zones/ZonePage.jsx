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
    }),
    []
  );

  const getBaseMat = (hex) => {
    let m = nodeMatCache.base.get(hex);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), metalness: 0.25, roughness: 0.72 });
      nodeMatCache.base.set(hex, m);
    }
    return m;
  };

  function nodeThreeObject(node) {
    const group = new THREE.Group();
    const baseHex = node.color || "#a0b4ff";
    const mat = getBaseMat(baseHex);
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

    const s = node.kind === "core" ? 1.4 : Math.max(0.9, Math.min(1.8, 0.95 + (node.__deg || 0) * 0.06));
    mesh.scale.set(s, s, s);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const led = new THREE.Mesh(geoCache.led, node.status === "up" ? nodeMatCache.ledUp : nodeMatCache.ledDown);
    led.position.set(0, node.kind === "core" ? 8 : 6 * s, 0);
    group.add(led);

    const hit = new THREE.Mesh(geoCache.hit, nodeMatCache.hit);
    hit.name = "hit-proxy";
    group.add(hit);

    return group;
  }

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

  // ★ ID 정규화 헬퍼: 링크 끝점이 "문자열" 또는 "노드 객체" 모두 대응
  const getId = (end) => (end && typeof end === "object" ? (end.id ?? end.__id ?? String(end)) : String(end));

  // Highlight logic for nodes/links
  const isHLNode = (n) => selected && (n.id === selected.id || adjacency.get(selected.id)?.has(n.id));
  const isIncident = (l) => selected && (getId(l.source) === selected.id || getId(l.target) === selected.id); // ★ 수정

  // Inspector 패널 대신 오른쪽 대시보드로 정보 전달
  useEffect(() => {
    if (!onInspectorChange) return;
    if (!selected) {
      onInspectorChange(null);
      return;
    }
    onInspectorChange(
      <table style={{ width: '100%', fontSize: 13, color: '#222', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', marginBottom: 8 }}>
        <tbody>
          {['label','kind','ip','subnet','zone','id'].map((key) => (
            <tr key={key} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '7px 6px', fontWeight: 600, color: '#64748b' }}>{key}</td>
              <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#222' }}>{String(selected[key] ?? '')}</td>
            </tr>
          ))}
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            <td style={{ padding: '7px 6px', fontWeight: 600, color: '#64748b' }}>이웃연결수</td>
            <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#222' }}>{adjacency.get(selected.id)?.size ?? 0}</td>
          </tr>
        </tbody>
      </table>
    );
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
    const s = node.kind === "core" ? 1.4 : Math.max(0.9, Math.min(1.8, 0.95 + (node.__deg || 0) * 0.06));
    mesh.scale.set(s, s, s);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const led = new THREE.Mesh(geoCache.led, node.status === "up" ? nodeMatCache.ledUp : nodeMatCache.ledDown);
    led.position.set(0, node.kind === "core" ? 8 : 6 * s, 0);
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
      sprite.scale.set(canvas.width/10, canvas.height/10, 1);
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

          // ★ 링크 강조 강화 (색/불투명도/두께/파티클/화살표)
          linkColor={(l) => {
            if (!selected) return '#bfc6d4';
            return isIncident(l) ? '#24a0ff' : '#5b6475';
          }}
          linkOpacity={(l) => (!selected ? 0.35 : isIncident(l) ? 0.95 : 0.08)} 
          linkWidth={(l) => (!selected ? 1.2 : isIncident(l) ? 6 : 0.5)}       

          linkDirectionalParticles={(l) => (selected && isIncident(l) ? 4 : 0)} 
          linkDirectionalParticleWidth={(l) => (selected && isIncident(l) ? 5 : 0)} 
          linkDirectionalParticleSpeed={(l) => (selected && isIncident(l) ? 0.006 : 0)} 
          linkDirectionalParticleColor={(l) => (selected && isIncident(l) ? '#00e5ff' : '#000000')} 

          linkDirectionalArrowLength={(l) => (selected && isIncident(l) ? 6 : 0)} 
          linkDirectionalArrowRelPos={0.6} // ★
          linkDirectionalArrowColor={(l) => (selected && isIncident(l) ? '#00e5ff' : '#000000')} 

          linkLabel={(l) => {
            const sId = getId(l.source);  // ★ 객체/문자열 모두 대응
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
        />
      </div>
    </div>
  );
}
