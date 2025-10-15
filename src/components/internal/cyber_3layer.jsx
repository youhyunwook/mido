import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';

// ===================== 상수 =====================
const STATUS = ['up', 'down', 'unknown'];
const LAYER_COLORS = { physical: '#3BA3FF', logical: '#9B6BFF', persona: '#FF9E3B' };
const LAYOUT = {
  nodeSpread: 800,        // x/y 기본 분포 반경
  layerZ: { physical: -600, logical: 0, persona: 600 }, // 레이어별 z 분리 증가
  plane: { width: 2000, height: 1400 }, // 레이어 평면 크기 확대
  subnetRadius: 420      // 서브넷 클러스터 배치 반경
};
const KIND_COLORS = {
  CONNECTS_TO: '#A0AEC0',
  CONNECTED: '#A0AEC0',
  HOSTS: '#60A5FA',
  USES: '#F59E0B',
  IN_SUBNET: '#93C5FD',
  IN_VLAN: '#C084FC',
  MEMBER_OF: '#FBBF24'
};

// 백엔드 API 베이스
const API_BASE = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_BASE) || 'http://localhost:8000';
const PROJECT_FILTER = 'multi-layer'; // 또는 null

// ===================== 유틸 =====================
const isCrossLayer = (a, b) => a.layer !== b.layer;

// ===================== 정규화: Node/Edge =====================
function normalizeNode(raw) {
  // __labels / layer 속성 기반으로 레이어 판정
  const labelsLower = (raw.__labels || []).map(s => String(s).toLowerCase());
  let layer =
    (raw.layer && String(raw.layer).toLowerCase()) ||
    (labelsLower.includes('persona') ? 'persona'
      : (labelsLower.includes('logical') || labelsLower.includes('service') || labelsLower.includes('subnet') || labelsLower.includes('vlan')) ? 'logical'
      : (labelsLower.includes('physical') || labelsLower.includes('device') || labelsLower.includes('host')) ? 'physical'
      : 'physical');

  // type/label 기본값
  let type = (raw.type || labelsLower[0] || 'device').toString().toLowerCase();
  let label = raw.label || raw.hostname || raw.name || raw.user_name || raw.service_name || raw.subnet || raw.ip || raw.id;
  if (!label && raw.vlan !== undefined) label = `VLAN-${raw.vlan}`;

    return {
    id: raw.id,
    layer,
    type,
    label: label || String(raw.id || ''),
    status: raw.status || 'up',
    severity: typeof raw.severity === 'number' ? raw.severity : 0,
    ip: raw.ip,
    hostname: raw.hostname,
    os: raw.os,
    subnet: raw.subnet,
    service_name: raw.service_name,
    proto: raw.proto,
    port: raw.port,
    vlan: raw.vlan,
    user_name: raw.user_name,
    role: raw.role,
    dept: raw.dept,
    device_ids: raw.device_ids || [],
    tags: raw.tags || [],
  // 초기 위치 (레이어별 z 고정) — 노드를 레이어 평면 영역에 골고루 분포시킴
  x: (Math.random() - 0.5) * LAYOUT.plane.width * 0.9,
  y: (Math.random() - 0.5) * LAYOUT.plane.height * 0.9,
    z: layer === 'persona' ? LAYOUT.layerZ.persona : layer === 'logical' ? LAYOUT.layerZ.logical : LAYOUT.layerZ.physical
  };
}

function normalizeEdge(rawEdge) {
  if (!rawEdge) return null;
  // 백엔드가 edge.rel = "HOSTS" | "USES" 를 줄 수 있음. 없으면 기존 필드도 시도
  let kind = rawEdge.kind || rawEdge.rel || rawEdge.type || 'CONNECTS_TO';
  if (kind === 'CONNECTED') kind = 'CONNECTS_TO';
  return {
    source: rawEdge.sourceIP,
    target: rawEdge.targetIP,
    kind,
    assumed: Boolean(rawEdge.assumed),
    confidence: typeof rawEdge.confidence === 'number' ? rawEdge.confidence : undefined,
    __sid: rawEdge.sourceIP,
    __tid: rawEdge.targetIP
  };
}

// ===================== 레코드 → 그래프 =====================
function mergeRecordsToGraph(allRecords) {
  const nodesMap = new Map();
  const links = [];

  for (const rec of allRecords) {
    const sRaw = rec.src_IP || rec.n || rec.source; 
    const tRaw = rec.dst_IP || rec.t || rec.target; 
    const eRaw = rec.edge || rec.r; 
    if (!sRaw || !tRaw) continue;
    const sid = sRaw.id; const tid = tRaw.id;
    if (!sid || !tid) continue;
    if (!nodesMap.has(sid)) nodesMap.set(sid, normalizeNode(sRaw));
    if (!nodesMap.has(tid)) nodesMap.set(tid, normalizeNode(tRaw));
    const e = normalizeEdge(eRaw);
    if (e) links.push(e);
  }

  // 서브넷 클러스터 근처로 물리 노드 살짝 재배치
  const nodes = [...nodesMap.values()];
  const subs = nodes.filter(n => n.type === 'subnet');
  const devs = nodes.filter(n => n.layer === 'physical');
  const subnetCenters = new Map();
  subs.forEach((s, i) => {
    const angle = (i / Math.max(1, subs.length)) * Math.PI * 2;
    const radius = LAYOUT.subnetRadius;
    subnetCenters.set(s.subnet || s.label || s.id, { cx: Math.cos(angle) * radius, cy: Math.sin(angle) * radius });
  });
  devs.forEach(d => {
    const key = d.subnet || d.label;
    const c = subnetCenters.get(key);
    if (c) { d.x = c.cx + (Math.random() - 0.5) * 50; d.y = c.cy + (Math.random() - 0.5) * 50; }
  });

  return { nodes, links };
}

// ===================== 데이터 페치 =====================
async function fetchThreeLayer(project) {
  const url = `${API_BASE}/neo4j/nodes?activeView=3layer${project ? `&project=${encodeURIComponent(project)}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API 3layer 실패: ${res.status}`);
  return res.json(); // [{src_IP, dst_IP, edge}, ...]
}

// ===================== 인접 계산 =====================
function buildAdjacency(nodes, links) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const adj = new Map(); nodes.forEach(n => adj.set(n.id, new Set()));
  links.forEach(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (adj.has(s)) adj.get(s).add(t);
    if (adj.has(t)) adj.get(t).add(s);
    l.__sid = s; l.__tid = t; l.__s = byId[s]; l.__t = byId[t];
  });
  return { byId, adj };
}

// ===================== 폴백 모킹 =====================
function generateMockGraph() {
  const nodes = [];
  const links = [];
  for (let i = 0; i < 30; i++) nodes.push({ id: `dev-${i}`, layer: 'physical', type: 'server', label: `DEV-${i}`, status: 'up', severity: 0, x: (Math.random()-0.5)*LAYOUT.nodeSpread, y: (Math.random()-0.5)*LAYOUT.nodeSpread, z: LAYOUT.layerZ.physical });
  for (let i = 0; i < 10; i++) nodes.push({ id: `svc-${i}`, layer: 'logical', type: 'service', label: `SVC-${i}`, status: 'up', severity: 0, x: (Math.random()-0.5)*LAYOUT.nodeSpread, y: (Math.random()-0.5)*LAYOUT.nodeSpread, z: LAYOUT.layerZ.logical });
  for (let i = 0; i < 10; i++) nodes.push({ id: `user-${i}`, layer: 'persona', type: 'user', label: `USER-${i}`, status: 'up', severity: 0, x: (Math.random()-0.5)*LAYOUT.nodeSpread, y: (Math.random()-0.5)*LAYOUT.nodeSpread, z: LAYOUT.layerZ.persona });
  for (let i = 0; i < 80; i++) links.push({ source: `dev-${Math.floor(Math.random()*30)}`, target: `svc-${Math.floor(Math.random()*10)}`, kind: 'HOSTS' });
  for (let i = 0; i < 80; i++) links.push({ source: `user-${Math.floor(Math.random()*10)}`, target: `svc-${Math.floor(Math.random()*10)}`, kind: 'USES' });
  return { nodes, links };
}

// ===================== 상세 패널 =====================
function NodeDetailPanel({ selected, adj, visible, byId, onClearSelection, onResetView }) {
  if (!selected) {
    return (
      <div style={{ padding: 16, color: '#d1d5db', fontSize: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>선택된 노드가 없습니다</div>
        노드를 클릭하면 상세 정보와 연결 리스트가 여기에 표시됩니다.
      </div>
    );
  }
  return (
    <>
      <div style={{ padding: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#fff' }}>기본 정보</div>
        <div style={{ display: 'grid', rowGap: 6, color: '#e5e7eb', fontSize: 13 }}>
          <div><b>ID:</b> <span style={{ wordBreak: 'break-all' }}>{selected.id}</span></div>
          <div><b>Layer:</b> {selected.layer}</div>
          <div><b>Type:</b> {selected.type}</div>
          <div><b>Label:</b> {selected.label}</div>
          <div><b>Status:</b> {selected.status}</div>
          <div><b>Severity:</b> {selected.severity}</div>
          {Array.isArray(selected.tags) && selected.tags.length > 0 && (<div><b>Tags:</b> {selected.tags.join(', ')}</div>)}
        </div>
      </div>
      <ConnLists selectedId={selected.id} visible={visible} adj={adj} byId={byId} />
      <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8 }}>
        <button onClick={onClearSelection} style={{ padding: '4px 8px', background: '#374151', color: '#fff', border: 'none', borderRadius: 6 }}>선택 해제</button>
        <button onClick={onResetView} style={{ padding: '4px 8px', background: '#374151', color: '#fff', border: 'none', borderRadius: 6 }}>전체 보기</button>
      </div>
    </>
  );
}

function ConnLists({ selectedId, visible, byId, adj }) {
  return (
    <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#fff' }}>동일 레이어 연결</div>
      <ConnList listType="same" selectedId={selectedId} visible={visible} byId={byId} adj={adj} />
      <div style={{ height: 12 }} />
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#fff' }}>교차 레이어 연결</div>
      <ConnList listType="cross" selectedId={selectedId} visible={visible} byId={byId} adj={adj} />
    </div>
  );
}

function ConnList({ listType, selectedId, visible, byId, adj }) {
  const items = [];
  if (selectedId && byId[selectedId]) {
    (adj.get(selectedId) || []).forEach(nid => {
      const l = visible.links.find(lnk => {
        const s = lnk.__sid || (typeof lnk.source === 'object' ? lnk.source.id : lnk.source);
        const t = lnk.__tid || (typeof lnk.target === 'object' ? lnk.target.id : lnk.target);
        return (s === selectedId && t === nid) || (t === selectedId && s === nid);
      });
      const other = byId[nid];
      if (!l || !other) return;
      const cross = other.layer !== byId[selectedId].layer;
      if ((listType === 'same' && !cross) || (listType === 'cross' && cross)) items.push({ l, other });
    });
  }
  if (!items.length) return <div style={{ fontSize: 12, color: '#9ca3af' }}>없음</div>;
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(55,65,81,0.5)', fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: LAYER_COLORS[it.other.layer] }} />
            <span style={{ color: '#e5e7eb' }}>{it.other.label}</span>
            <span style={{ color: '#9ca3af' }}>({it.other.type})</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {it.l.assumed && <span style={{ background: '#374151', color: '#e5e7eb', padding: '2px 6px', borderRadius: 4, fontSize: 10 }}>assumed</span>}
            <span style={{ color: '#9ca3af' }}>{it.l.kind}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===================== 메인 컴포넌트 =====================
export default function CyberMultiLayer3D({ onNodeSelect = () => {}, onInspectorChange = () => {} }) {
  const fgRef = useRef();

  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [pulse, setPulse] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [layerFilter, setLayerFilter] = useState({ physical: true, logical: true, persona: true });
  const [assumedFilter, setAssumedFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(new Set(STATUS));

  const { byId, adj } = useMemo(() => buildAdjacency(graphData.nodes, graphData.links), [graphData]);

  // 레이어 플레인
  const addLayerPlanes = () => {
    const scene = fgRef.current?.scene?.(); if (!scene) return;
    const existing = scene.getObjectByName('layer-planes'); if (existing) scene.remove(existing);
    const group = new THREE.Group(); group.name = 'layer-planes';
    const makePlane = (z, color, label) => {
      const planeGeo = new THREE.PlaneGeometry(LAYOUT.plane.width, LAYOUT.plane.height, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false });
      const mesh = new THREE.Mesh(planeGeo, mat); mesh.position.set(0, 0, z);
      const edges = new THREE.EdgesGeometry(planeGeo);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 }));
      line.position.set(0, 0, z + 0.1);
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128; const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0,0,512,128); ctx.font = '40px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, 14, 64);
  const tex = new THREE.CanvasTexture(canvas); const sprMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false });
  const sprite = new THREE.Sprite(sprMat); sprite.scale.set(320, 80, 1);
  // 평면 영역의 좌상단에 레이블 표시 (여백 포함)
  sprite.position.set(-LAYOUT.plane.width/2 + 180, LAYOUT.plane.height/2 - 80, z + 0.2);
      group.add(mesh); group.add(line); group.add(sprite);
    };
  makePlane(LAYOUT.layerZ.physical, LAYER_COLORS.physical, 'Physical');
  makePlane(LAYOUT.layerZ.logical,  LAYER_COLORS.logical,  'Logical');
  makePlane(LAYOUT.layerZ.persona,  LAYER_COLORS.persona,  'Persona');
    scene.add(group);
  };
  const toggleLayerPlanes = (visible) => { const scene = fgRef.current?.scene?.(); const group = scene?.getObjectByName('layer-planes'); if (group) group.visible = !!visible; };

  // 초기 로딩: 카메라, 컨트롤, 레이어 평면 설정
  useEffect(() => {
    const fg = fgRef.current; if (!fg) return;
    const controls = fg.controls && fg.controls();
    if (controls) {
      controls.enableRotate = false;
      controls.enablePan = false;
      controls.enableZoom = true;
      controls.minPolarAngle = 1e-6;
      controls.maxPolarAngle = 1e-6;
    }
    fg.cameraPosition({ x: 0, y: 1800, z: 0 }, { x: 0, y: 0, z: 0 }, 0);
    const scene = fg.scene(); scene.rotation.order = 'YXZ'; scene.rotation.set(0, 0, 0, 'YXZ');
    addLayerPlanes(); toggleLayerPlanes(true);
  }, []);

  // 포스(힘) 설정 완화
  useEffect(() => {
    const fg = fgRef.current; if (!fg) return;
    try { fg.d3Force('charge') && fg.d3Force('charge').strength(0); } catch {}
    try { fg.d3Force('link') && fg.d3Force('link').strength(() => 0.05); } catch {}
  }, []);

  // 데이터 로딩 (3계층 통합: HOSTS + USES+ PHYSICAL 동일레이어 연결)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (mounted) setLoading(true);
      } catch (e) {}
      try {
        const records = await fetchThreeLayer(PROJECT_FILTER || undefined);
        const g = mergeRecordsToGraph(records);
        if (mounted) setGraphData(g);
      } catch (e) {
        if (mounted) setGraphData(generateMockGraph());
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 회전 제어 (Yaw ±30°, Pitch 제한, Roll 무제한)
  useEffect(() => {
    const fg = fgRef.current; if (!fg) return;
    const dom = fg.renderer().domElement;
    const scene = fg.scene();
    const PITCH_LIMIT = 1.3; const YAW_LIMIT = Math.PI/6; const ROLL_LIMIT = Infinity; const PITCH_SENS = 0.005; const YAW_SENS = 0.006; const ROLL_SENS = 0.006; const KEY_STEP = Math.PI/60;
    const clampAll = () => { scene.rotation.x = THREE.MathUtils.clamp(scene.rotation.x, -PITCH_LIMIT, PITCH_LIMIT); scene.rotation.y = THREE.MathUtils.clamp(scene.rotation.y, -YAW_LIMIT, YAW_LIMIT); scene.rotation.z = THREE.MathUtils.clamp(scene.rotation.z, -ROLL_LIMIT, ROLL_LIMIT); scene.rotation.order='YXZ'; };
  let dragging=false,lastX=0,lastY=0;
  let spacePressed = false;
    const getX = (e) => e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const getY = (e) => e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    const onDown = (e)=>{dragging=true; lastX=getX(e); lastY=getY(e);};
  const onMove = (e)=>{ if(!dragging) return; const x=getX(e), y=getY(e); const dx=x-lastX, dy=y-lastY; lastX=x; lastY=y; if(spacePressed){ scene.rotation.z += dx*ROLL_SENS; } else { scene.rotation.y += dx*YAW_SENS; scene.rotation.x += dy*PITCH_SENS; } clampAll(); };
    const onUp = ()=>{dragging=false;};
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    dom.addEventListener('pointerleave', onUp);
    const worldDiag = new THREE.Vector3(1,1,1).normalize();
    const onKey = (e)=>{ let used=true; switch(e.key){ case 'ArrowUp': scene.rotation.x -= KEY_STEP; break; case 'ArrowDown': scene.rotation.x += KEY_STEP; break; case 'ArrowLeft': scene.rotation.y -= KEY_STEP; break; case 'ArrowRight': scene.rotation.y += KEY_STEP; break; case 'z': case 'Z': scene.rotation.z -= KEY_STEP; break; case 'x': case 'X': scene.rotation.z += KEY_STEP; break; case 'r': case 'R': scene.rotation.set(0,0,0,'YXZ'); break; case 'u': case 'U': scene.rotateOnWorldAxis(worldDiag, +KEY_STEP); scene.rotation.setFromQuaternion(scene.quaternion,'YXZ'); break; case 'i': case 'I': scene.rotateOnWorldAxis(worldDiag, -KEY_STEP); scene.rotation.setFromQuaternion(scene.quaternion,'YXZ'); break; default: used=false;} if(used){clampAll();} };
    // Space 키를 누르고 드래그하면 Roll(회전) 모드로 전환
    const onSpaceDown = (ev) => { if (ev.code === 'Space' || ev.key === ' ') { spacePressed = true; try { ev.preventDefault(); } catch {} } };
    const onSpaceUp = (ev) => { if (ev.code === 'Space' || ev.key === ' ') { spacePressed = false; try { ev.preventDefault(); } catch {} } };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onSpaceDown);
    window.addEventListener('keyup', onSpaceUp);
    return ()=>{ dom.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); dom.removeEventListener('pointerleave', onUp); window.removeEventListener('keydown', onKey); window.removeEventListener('keydown', onSpaceDown); window.removeEventListener('keyup', onSpaceUp); };
  }, []);

  // 필터링 후 시각화용 그래프 계산
  const visible = useMemo(() => {
    const passesNode = (n) => {
      if (!layerFilter[n.layer]) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [n.label,n.ip,n.user_name,n.role,n.dept,n.hostname,n.service_name,n.subnet,n.type]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
    const nodeSet = new Set(graphData.nodes.filter(passesNode).map(n => n.id));
    const passesLink = (l) => {
      const s = l.__sid || (typeof l.source==='object'?l.source.id:l.source);
      const t = l.__tid || (typeof l.target==='object'?l.target.id:l.target);
      if (!nodeSet.has(s) || !nodeSet.has(t)) return false;
      if (assumedFilter !== 'all' && (!!l.assumed !== (assumedFilter==='true'))) return false;
      const sn = byId[s]; const tn = byId[t];
      if (sn && tn) { if (!statusFilter.has(sn.status) || !statusFilter.has(tn.status)) return false; }
      return true;
    };
    const links = graphData.links.filter(passesLink);
    const used = new Set(); links.forEach(l => { const s = l.__sid || (typeof l.source==='object'?l.source.id:l.source); const t = l.__tid || (typeof l.target==='object'?l.target.id:l.target); used.add(s); used.add(t); });
    const nodes = graphData.nodes.filter(n => nodeSet.has(n.id) && (used.has(n.id) || !search));
    return { nodes, links };
  }, [graphData, layerFilter, assumedFilter, statusFilter, search, byId]);

  const highlight = useMemo(() => {
    if (!selectedId) return { nodes: new Set(), links: new Set() };
    const nSet = new Set([selectedId]); const lSet = new Set();
    (adj.get(selectedId) || []).forEach(nid => nSet.add(nid));
    visible.links.forEach(l => { const s = l.__sid || (typeof l.source==='object'?l.source.id:l.source); const t = l.__tid || (typeof l.target==='object'?l.target.id:l.target); if (nSet.has(s) && nSet.has(t)) lSet.add(l); });
    return { nodes: nSet, links: lSet };
  }, [selectedId, visible, adj]);

  const isNodeDimmed = (n) => selectedId && !highlight.nodes.has(n.id);
  const isLinkDimmed = (l) => selectedId && !highlight.links.has(l);
  const nodeColor = (n) => (!selectedId ? (LAYER_COLORS[n.layer] || '#B0B0B0') : (isNodeDimmed(n) ? '#2A2A2A' : (LAYER_COLORS[n.layer] || '#B0B0B0')));
  const linkColor = (l) => { const rgb = new THREE.Color(KIND_COLORS[l.kind] || '#A0AEC0'); const c = isLinkDimmed(l) ? rgb.lerp(new THREE.Color('#2A2A2A'), 0.6) : rgb; return `#${c.getHexString()}`; };
  const linkWidth = (l) => isLinkDimmed(l) ? 0.3 : (l.assumed ? 0.6 : 1.5);
  const linkParticles = (l) => { if (!pulse || !selectedId) return 0; const s = l.source; const t = l.target; if (!s || !t || typeof s.id === 'undefined' || typeof t.id === 'undefined') return 0; const touchesSel = s.id === selectedId || t.id === selectedId; return touchesSel && isCrossLayer(s, t) ? 2 : 0; };
  const linkMaterial = (l) => { const color = new THREE.Color(linkColor(l)); if (l.assumed) { try { return new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1, transparent: true, opacity: isLinkDimmed(l) ? 0.25 : 0.65 }); } catch { return new THREE.LineBasicMaterial({ color, transparent: true, opacity: isLinkDimmed(l) ? 0.25 : 0.65 }); } } return new THREE.LineBasicMaterial({ color, transparent: true, opacity: isLinkDimmed(l) ? 0.25 : 0.95 }); };

  const onBackgroundClick = () => { setSelectedId(null); onNodeSelect(null); onInspectorChange(null); };
  const resetView = () => { setSelectedId(null); onNodeSelect(null); const fg = fgRef.current; if (!fg) return; try { const rot = fg.scene().rotation; rot.order='YXZ'; rot.x = 0; rot.y = 0; rot.z = 0; } catch {} fg.cameraPosition({ x: 0, y: 1800, z: 0 }, { x: 0, y: 0, z: 0 }, 600); };
  const onNodeClick = (node) => {
    setSelectedId(node?.id || null);
    if (node) {
      const panel = <NodeDetailPanel selected={node} adj={adj} visible={visible} byId={byId} onClearSelection={onBackgroundClick} onResetView={resetView} />;
      onNodeSelect(panel);
      try { onInspectorChange(panel); } catch(e) {}
    } else { onNodeSelect(null); onInspectorChange(null); }
  };
  const onLinkClick = (l) => { const sid = l.__sid || (typeof l.source==='object'?l.source.id:l.source); const node = byId[sid]; if (node) onNodeClick(node); };
  const onLinkUpdate = (link, threeObj) => { try { const line = link.__lineObj || threeObj; if (line && line.computeLineDistances) line.computeLineDistances(); } catch {} };

  // 렌더용 그래프: 펄스 OFF일 경우 1-홉 이내만 표시
  const graphToRender = useMemo(() => {
    if (pulse) return visible;
    if (!selectedId) return { nodes: visible.nodes, links: [] };
    const sel = new Set([selectedId]); (adj.get(selectedId) || []).forEach(nid => sel.add(nid));
    const links = visible.links.filter(l => { const s = l.__sid || (typeof l.source==='object'? l.source.id : l.source); const t = l.__tid || (typeof l.target==='object'? l.target.id : l.target); return sel.has(s) || sel.has(t); });
    return { nodes: visible.nodes, links };
  }, [pulse, visible, selectedId, adj]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 600, background: '#1e1e1e', color: '#fff', overflow: 'hidden', display: 'flex' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {/* 툴바 */}
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, background: 'rgba(57,48,107,0.7)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 12 }}>
            <input placeholder="검색: label, ip, user, role, dept..." value={search} onChange={(e)=>setSearch(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.5)', background: 'rgba(20,20,20,0.7)', color: '#fff' }} />
            <span style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />
            {['physical','logical','persona'].map(id => (
              <label key={id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={layerFilter[id]} onChange={(e)=>setLayerFilter(v=>({...v,[id]:e.target.checked}))} />
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: LAYER_COLORS[id] }} />
                  <span>{id}</span>
                </span>
              </label>
            ))}
            <span style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>assumed</span>
              <select value={assumedFilter} onChange={(e)=>setAssumedFilter(e.target.value)} style={{ background: 'rgba(20,20,20,0.7)', color:'#fff', border:'1px solid rgba(128,128,128,0.5)', borderRadius: 6, padding: '2px 4px' }}>
                <option value="all">all</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <span style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>status</span>
              {STATUS.map(s => (
                <label key={s} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <input type="checkbox" checked={statusFilter.has(s)} onChange={(e)=>{const nxt=new Set(statusFilter); e.target.checked?nxt.add(s):nxt.delete(s); setStatusFilter(nxt);}} />
                  <span style={{ textTransform: 'uppercase' }}>{s}</span>
                </label>
              ))}
            </div>
            <span style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />
            <button onClick={()=>setPulse(p=>!p)} style={{ padding:'4px 8px', borderRadius:6, background: pulse ? '#3b82f6' : '#F0EDFD', color:'#000', border:'1px solid rgba(128,128,128,0.5)' }}>{pulse ? '펄스 ON' : '펄스 OFF'}</button>
            <button onClick={() => { setSearch(''); setLayerFilter({ physical: true, logical: true, persona: true }); setAssumedFilter('all'); setStatusFilter(new Set(STATUS)); }} style={{ padding:'4px 8px', borderRadius:6, background:'#F0EDFD', color:'#000', border:'1px solid rgba(128,128,128,0.5)' }}>필터 초기화</button>
            <button onClick={resetView} style={{ padding:'4px 8px', borderRadius:6, background:'#F0EDFD', color:'#000', border:'1px solid rgba(128,128,128,0.5)' }}>뷰 초기화</button>
          </div>
        </div>

        <ForceGraph3D
          ref={fgRef}
          graphData={graphToRender}
          backgroundColor="#0b1220" // 3계층 시각화 배경색 부분 조정
          nodeAutoColorBy={null}
          nodeColor={nodeColor}
          nodeLabel={(n) => `${n.label} (layer: ${n.layer})`}
          nodeRelSize={5.2}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkMaterial={linkMaterial}
          linkDirectionalParticles={linkParticles}
          linkDirectionalParticleWidth={() => 2}
          linkDirectionalParticleSpeed={() => 0.006 + Math.random()*0.004}
          onNodeClick={onNodeClick}
          onBackgroundClick={onBackgroundClick}
          onLinkClick={onLinkClick}
          onLinkUpdate={onLinkUpdate}
          cooldownTicks={0}
          enableNodeDrag={false}
          showNavInfo={false}
        />
        {loading && (
          <div style={{position:'absolute',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
            <div style={{background:'rgba(0,0,0,0.6)',color:'#fff',padding:'12px 18px',borderRadius:8,backdropFilter:'blur(4px)'}}>Loading…</div>
          </div>
        )}
      </div>
    </div>
  );
}
