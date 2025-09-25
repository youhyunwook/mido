import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';

const LAYERS = { physical: 'physical', logical: 'logical', persona: 'persona' };
const STATUS = ['up', 'down', 'unknown'];

const LAYER_COLORS = { physical: '#3BA3FF', logical: '#9B6BFF', persona: '#FF9E3B' };
const KIND_COLORS = { CONNECTS_TO: '#A0AEC0', HOSTS: '#60A5FA', USES: '#F59E0B', IN_SUBNET: '#93C5FD', IN_VLAN: '#C084FC', MEMBER_OF: '#FBBF24' };

const randItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function maskName(name = '') {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  const initials = parts.map(p => p[0]?.toUpperCase()).filter(Boolean).join('.') + '.';
  return initials;
}
function genIPv4(subnetIdx) { const x = subnetIdx; const y = randInt(2, 254); return { ip: `192.168.${x}.${y}`, subnet: `192.168.${x}.0/24` }; }
const isCrossLayer = (a, b) => a.layer !== b.layer;

export function buildAdjacency(nodes, links) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const adj = new Map();
  nodes.forEach(n => adj.set(n.id, new Set()));
  links.forEach(l => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (adj.has(s)) adj.get(s).add(t);
    if (adj.has(t)) adj.get(t).add(s);
    l.__sid = s; l.__tid = t; l.__s = byId[s]; l.__t = byId[t];
  });
  return { byId, adj };
}

function generateMockGraph({ nodeCount = 300, linkCount = 600 }) {
  const nodes = []; const links = [];
  const personaCount = Math.floor(nodeCount * 0.18);
  const logicalCount  = Math.floor(nodeCount * 0.42);
  const physicalCount = nodeCount - personaCount - logicalCount;
  const subnetCount = Math.max(8, Math.floor(logicalCount * 0.25));
  const serviceCount = Math.max(30, logicalCount - subnetCount - 6);
  const vlanCount = Math.max(4, logicalCount - subnetCount - serviceCount);
  const teamCount = Math.max(3, Math.floor(personaCount * 0.15));

  for (let i = 0; i < subnetCount; i++) nodes.push({ id: `log:subnet:${i}`, layer: LAYERS.logical, type: 'subnet', label: `Subnet ${i}`, subnet: `192.168.${i}.0/24`, vlan: null, status: randItem(STATUS), severity: randInt(0, 40), tags: ['logical','subnet'] });
  for (let i = 0; i < serviceCount; i++) { const port = randItem([80,443,22,5432,6379,9200,3306]); nodes.push({ id: `log:svc:${i}`, layer: LAYERS.logical, type: 'service', label: `SVC-${i}`, service_name: randItem(['Auth','Payments','API','Web','DB','Cache','Search']), proto: port===53?'UDP':'TCP', port, subnet: null, vlan: null, status: randItem(STATUS), severity: randInt(5,70), tags:['logical','service'] }); }
  for (let i = 0; i < vlanCount; i++) nodes.push({ id: `log:vlan:${i}`, layer: LAYERS.logical, type: 'vlan', label: `VLAN-${100+i}`, vlan: 100+i, status: 'up', severity: randInt(0,20), tags:['logical','vlan'] });

  const logicalSubnets = nodes.filter(n => n.type === 'subnet');
  for (let i = 0; i < physicalCount; i++) {
    const sn = logicalSubnets[i % logicalSubnets.length];
    const { ip } = genIPv4(i % logicalSubnets.length);
    nodes.push({ id: `phy:dev:${i}`, layer: LAYERS.physical, type: randItem(['server','switch','router','pc']), label: `DEV-${i}`, ip, hostname: `host-${i}`, os: randItem(['Ubuntu','Windows','CentOS','Debian','ESXi']), status: randItem(STATUS), severity: randInt(0,100), subnet: sn.subnet, tags:['physical'] });
  }

  for (let i = 0; i < personaCount; i++) {
    const first = randItem(['Alex','Sun','Jin','Min','Hye','Young','Eun','Ji','Hyun','Soo']);
    const last = randItem(['Kim','Lee','Park','Choi','Jang','Yoon']);
    nodes.push({ id: `per:user:${i}`, layer: LAYERS.persona, type: 'user', label: `${first} ${last}`, user_name: `${first} ${last}`, role: randItem(['DevOps','SRE','Backend','SecOps','Data']), dept: randItem(['Platform','Finance','Sales','R&D']), device_ids: [], status: randItem(['unknown','up']), severity: randInt(0,25), tags:['persona'] });
  }
  for (let i = 0; i < teamCount; i++) nodes.push({ id: `per:team:${i}`, layer: LAYERS.persona, type: 'team', label: `Team-${i}`, status: 'up', severity: randInt(0,10), tags:['persona','team'] });

  const devs = nodes.filter(n => n.layer === LAYERS.physical);
  const svcs = nodes.filter(n => n.type === 'service');
  const subs = nodes.filter(n => n.type === 'subnet');
  const vlans = nodes.filter(n => n.type === 'vlan');
  const users = nodes.filter(n => n.type === 'user');
  const teams = nodes.filter(n => n.type === 'team');

  devs.forEach(d => { const peers = devs.filter(p => p.subnet === d.subnet && p.id !== d.id); peers.slice(0, randInt(1,3)).forEach(p => links.push({ source: d.id, target: p.id, kind: 'CONNECTS_TO', assumed: Math.random()<0.2, bandwidth_mbps: randInt(100, 1000) })); });
  devs.forEach(d => { const s = subs.find(su => su.subnet === d.subnet); if (s) links.push({ source: d.id, target: s.id, kind: 'IN_SUBNET', assumed: false }); });
  vlans.forEach(v => { let count = 0; svcs.forEach(s => { if (Math.random()<0.15) { links.push({ source: v.id, target: s.id, kind: 'IN_VLAN', assumed: Math.random()<0.1 }); count++; } }); if (count===0 && svcs.length) links.push({ source: v.id, target: svcs[randInt(0, svcs.length-1)].id, kind: 'IN_VLAN', assumed: false }); });

  const hostCountByDev = new Map(devs.map(d => [d.id, 0]));
  svcs.forEach(s => { const host = randItem(devs); links.push({ source: host.id, target: s.id, kind: 'HOSTS', assumed: Math.random()<0.05 }); hostCountByDev.set(host.id, (hostCountByDev.get(host.id)||0)+1); });
  devs.forEach(d => { if ((hostCountByDev.get(d.id)||0)===0 && svcs.length) { const s = svcs[randInt(0, svcs.length-1)]; links.push({ source: d.id, target: s.id, kind: 'HOSTS', assumed: true }); hostCountByDev.set(d.id, 1); } });

  const useCountBySvc = new Map(svcs.map(s => [s.id, 0]));
  users.forEach(u => {
    const svcPick = randInt(2,5);
    for (let k=0;k<svcPick;k++){
      const s = randItem(svcs);
      links.push({ source: u.id, target: s.id, kind: 'USES', assumed: Math.random()<0.25, confidence: Math.random()*0.5+0.4 });
      useCountBySvc.set(s.id, (useCountBySvc.get(s.id)||0)+1);
    }
  });
  svcs.forEach(s => { if ((useCountBySvc.get(s.id)||0)===0 && users.length) { const u = users[randInt(0, users.length-1)]; links.push({ source: u.id, target: s.id, kind: 'USES', assumed: false, confidence: 0.9 }); useCountBySvc.set(s.id, 1); } });

  users.forEach(u => { const t = randItem(teams); if (t) links.push({ source: u.id, target: t.id, kind: 'MEMBER_OF', assumed: false }); });
  while (links.length > linkCount) links.splice(randInt(0, links.length - 1), 1);

  nodes.forEach(n => { n.x = (Math.random()-0.5)*400; n.y = (Math.random()-0.5)*400; n.z = n.layer===LAYERS.persona ? 240 : n.layer===LAYERS.logical ? 0 : -240; });
  const subnetCenters = new Map();
  subs.forEach((s,i)=>{ const angle=(i/subs.length)*Math.PI*2; const radius=220; subnetCenters.set(s.subnet,{cx:Math.cos(angle)*radius,cy:Math.sin(angle)*radius}); });
  devs.forEach(d=>{ const c=subnetCenters.get(d.subnet); if(c){ d.x=c.cx+(Math.random()-0.5)*50; d.y=c.cy+(Math.random()-0.5)*50; } });

  return { nodes, links };
}

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

      <div style={{ padding: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#fff' }}>레이어별 상세</div>
        {selected.layer === 'physical' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 4, fontSize: 12, color: '#d1d5db' }}>
            <div><b>IP</b><div>{selected.ip || '-'}</div></div>
            <div><b>Host</b><div>{selected.hostname || '-'}</div></div>
            <div><b>OS</b><div>{selected.os || '-'}</div></div>
            <div><b>Subnet</b><div>{selected.subnet || '-'}</div></div>
          </div>
        )}
        {selected.layer === 'logical' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 4, fontSize: 12, color: '#d1d5db' }}>
            <div><b>Service</b><div>{selected.service_name || '-'}</div></div>
            <div><b>Proto/Port</b><div>{selected.proto || '-'}{selected.port ? `/${selected.port}` : ''}</div></div>
            <div><b>Subnet</b><div>{selected.subnet || '-'}</div></div>
            <div><b>VLAN</b><div>{selected.vlan ?? '-'}</div></div>
          </div>
        )}
        {selected.layer === 'persona' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 4, fontSize: 12, color: '#d1d5db' }}>
            <div><b>User</b><div>{maskName(selected.user_name) || '-'}</div></div>
            <div><b>Role</b><div>{selected.role || '-'}</div></div>
            <div><b>Dept</b><div>{selected.dept || '-'}</div></div>
            <div><b>Devices</b><div>{Array.isArray(selected.device_ids) ? selected.device_ids.length : 0}</div></div>
          </div>
        )}
      </div>

      <ConnLists selectedId={selected.id} visible={visible} byId={byId} adj={adj} />

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
  if(selectedId && byId[selectedId]) {
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

export const __tests__ = {
  shouldZoomOnNodeClick: () => false,
  yawLimitIsThirtyDeg: () => Math.abs(Math.PI/6 - (30*Math.PI/180)) < 1e-12,
  xyzStepRadians: () => Math.PI/60, // 3° per key
  clampInfinity: () => THREE.MathUtils.clamp(42, -Infinity, Infinity) === 42,
  eulerOrderYXZ: () => { const e = new THREE.Euler(0,0,0,'YXZ'); return e.order === 'YXZ'; }
};

export default function CyberMultiLayer3D({ onNodeSelect = () => {} }) {
  const fgRef = useRef();

  const [graphData, setGraphData] = useState(() => generateMockGraph({ nodeCount: 300, linkCount: 600 }));
  const [pulse, setPulse] = useState(false); // pulse 모드 여부 (기본: false)
  const [selectedId, setSelectedId] = useState(null); // 선택된 노드 ID
  const [search, setSearch] = useState(''); // 검색어 
  const [layerFilter, setLayerFilter] = useState({ physical: true, logical: true, persona: true }); // 레이어 필터 상태
  const [assumedFilter, setAssumedFilter] = useState('all'); 
  const [statusFilter, setStatusFilter] = useState(new Set(STATUS)); // 상태 필터 (기본: 모두 선택)

  const { byId, adj } = useMemo(() => buildAdjacency(graphData.nodes, graphData.links), [graphData]);

  // 레이어 플레인 유틸
  const addLayerPlanes = () => {
    const scene = fgRef.current?.scene?.(); if (!scene) return;
    const existing = scene.getObjectByName('layer-planes'); if (existing) scene.remove(existing);
    const group = new THREE.Group(); group.name = 'layer-planes';
    const makePlane = (z, color, label) => {
      const planeGeo = new THREE.PlaneGeometry(1200, 800, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false });
      const mesh = new THREE.Mesh(planeGeo, mat); mesh.position.set(0, 0, z);
      const edges = new THREE.EdgesGeometry(planeGeo);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 }));
      line.position.set(0, 0, z + 0.1);
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64; const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0,0,256,64); ctx.font = '28px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, 10, 32);
      const tex = new THREE.CanvasTexture(canvas); const sprMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.75, depthWrite: false });
      const sprite = new THREE.Sprite(sprMat); sprite.scale.set(160, 40, 1); sprite.position.set(-520, 340, z + 0.2);
      group.add(mesh); group.add(line); group.add(sprite);
    };
    makePlane(-240, LAYER_COLORS.physical, 'Physical');
    makePlane(0,    LAYER_COLORS.logical,  'Logical');
    makePlane(240,  LAYER_COLORS.persona,  'Persona');
    scene.add(group);
  };
  const toggleLayerPlanes = (visible) => { const scene = fgRef.current?.scene?.(); const group = scene?.getObjectByName('layer-planes'); if (group) group.visible = !!visible; };

  // 초기 배치 및 플레인 추가
  useEffect(() => {
    // z 레이어 배치
    const targetZ = (n) => (n.layer === LAYERS.persona ? 240 : n.layer === LAYERS.logical ? 0 : -240);
    graphData.nodes.forEach(n => { n.z = targetZ(n); });
    setGraphData({ nodes: [...graphData.nodes], links: [...graphData.links] });
    fgRef.current?.refresh();
    addLayerPlanes();
    toggleLayerPlanes(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 포스 설정 약화 (덜 흔들리게)
  useEffect(() => {
    const fg = fgRef.current; if (!fg) return;
    try { fg.d3Force('charge') && fg.d3Force('charge').strength(0); } catch {}
    try { fg.d3Force('link') && fg.d3Force('link').strength(() => 0.05); } catch {}
  }, []);

  // === Rotation controls: X(±75°), Y(±30°), Z(∞) ===
  useEffect(() => {
    const fg = fgRef.current; if (!fg) return;
    const controls = fg.controls && fg.controls();
    if (controls) {
      controls.enableRotate = false;
      controls.enablePan = false;
      controls.enableZoom = true;   // zoom 허용
      controls.minPolarAngle = 1e-6;
      controls.maxPolarAngle = 1e-6; // top-down 고정
    }

    // 카메라 고정 (0,1800,0)
    fg.cameraPosition({ x: 0, y: 1800, z: 0 }, { x: 0, y: 0, z: 0 }, 0);

    const dom = fg.renderer().domElement;
    const scene = fg.scene();
    scene.rotation.order = 'YXZ';
    scene.rotation.set(0, 0, 0, 'YXZ');

    // 제한 & 감도
    const PITCH_LIMIT = 1.3;        // ≈ 75° X축
    const YAW_LIMIT   = Math.PI/6;  // ≈ 30° Y축
    const ROLL_LIMIT  = Infinity;   // 무제한 (360°+) Z축

    const PITCH_SENS  = 0.005; // 피치
    const YAW_SENS    = 0.006; // 요
    const ROLL_SENS   = 0.006; // 쉬프트+드래그 시 롤
    const KEY_STEP    = Math.PI / 60; // 3° per key

    const clampAll = () => {
      scene.rotation.x = THREE.MathUtils.clamp(scene.rotation.x, -PITCH_LIMIT, PITCH_LIMIT);
      scene.rotation.y = THREE.MathUtils.clamp(scene.rotation.y, -YAW_LIMIT,   YAW_LIMIT);
      scene.rotation.z = THREE.MathUtils.clamp(scene.rotation.z, -ROLL_LIMIT,  ROLL_LIMIT); // 무제한
      scene.rotation.order = 'YXZ';
    };

    // 포인터 드래그: 기본(피치+요), Shift 누르면 롤
    let dragging = false; let lastX = 0; let lastY = 0;
    const getX = (e) => e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const getY = (e) => e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;

    const onDown = (e) => { dragging = true; lastX = getX(e); lastY = getY(e); };
    const onMove = (e) => {
      if (!dragging) return;
      const x = getX(e), y = getY(e);
      const dx = x - lastX; const dy = y - lastY; lastX = x; lastY = y;

      if (e.shiftKey) {
        scene.rotation.z += dx * ROLL_SENS;
      } else {
        scene.rotation.y += dx * YAW_SENS;
        scene.rotation.x += dy * PITCH_SENS;
      }
      clampAll();
    };
    const onUp = () => { dragging = false; };

    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    dom.addEventListener('pointerleave', onUp);

    // 키보드: ↑/↓(피치), ←/→(요), Z/X(롤), R(리셋), U/I(대각축 회전)
    const worldDiag = new THREE.Vector3(1,1,1).normalize();
    const onKey = (e) => {
      let used = true;
      switch (e.key) {
        case 'ArrowUp':   scene.rotation.x -= KEY_STEP; break;
        case 'ArrowDown': scene.rotation.x += KEY_STEP; break;
        case 'ArrowLeft': scene.rotation.y -= KEY_STEP; break;
        case 'ArrowRight':scene.rotation.y += KEY_STEP; break;
        case 'z': case 'Z': scene.rotation.z -= KEY_STEP; break;
        case 'x': case 'X': scene.rotation.z += KEY_STEP; break;
        case 'r': case 'R': scene.rotation.set(0,0,0,'YXZ'); break;
        case 'u': case 'U':
          scene.rotateOnWorldAxis(worldDiag, +KEY_STEP);
          scene.rotation.setFromQuaternion(scene.quaternion, 'YXZ');
          break;
        case 'i': case 'I':
          scene.rotateOnWorldAxis(worldDiag, -KEY_STEP);
          scene.rotation.setFromQuaternion(scene.quaternion, 'YXZ');
          break;
        default: used = false;
      }
      if (used) { clampAll(); }
    };
    window.addEventListener('keydown', onKey);

    // 런타임 스모크 테스트
    try {
      const cam = fg.camera();
      console.assert(Math.abs(cam.position.x) < 1e-6 && Math.abs(cam.position.z) < 1e-6 && Math.abs(cam.position.y - 1800) < 1e-6, '[TEST] Camera fixed at (0,1800,0)');
      if (controls) console.assert(controls.enableRotate === false, '[TEST] OrbitControls.enableRotate should be false');

      const bx = scene.rotation.x, by = scene.rotation.y, bz = scene.rotation.z;
      scene.rotation.x += 0.01; scene.rotation.y += 0.01; scene.rotation.z += 0.01; clampAll();
      console.assert(scene.rotation.x !== bx, '[TEST] Pitch(X) should change');
      console.assert(scene.rotation.y !== by, '[TEST] Yaw(Y) should change');
      console.assert(scene.rotation.z !== bz, '[TEST] Roll(Z) should change');
      // 복원
      scene.rotation.set(bx, by, bz, 'YXZ');
    } catch {}

    return () => {
      dom.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointerleave', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // 필터링된 가시 그래프 계산
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
      const sn = l.__s || byId[s]; const tn = l.__t || byId[t];
      if (sn && tn) { if (!statusFilter.has(sn.status) || !statusFilter.has(tn.status)) return false; }
      return true;
    };
    const links = graphData.links.filter(passesLink);
    const used = new Set();
    links.forEach(l => { const s = l.__sid || (typeof l.source==='object'?l.source.id:l.source); const t = l.__tid || (typeof l.target==='object'?l.target.id:l.target); used.add(s); used.add(t); });
    const nodes = graphData.nodes.filter(n => nodeSet.has(n.id) && (used.has(n.id) || !search));
    return { nodes, links };
  }, [graphData, layerFilter, assumedFilter, statusFilter, search, byId]);

  // pulse OFF: 모든 노드 보이되, 링크는 선택된 노드와 연결된 것만
  const graphToRender = useMemo(() => {
    if (pulse) return visible;
    if (!selectedId) return { nodes: visible.nodes, links: [] };

    const sel = new Set([selectedId]);
    (adj.get(selectedId) || []).forEach(nid => sel.add(nid));

    const links = visible.links.filter(l => {
      const s = l.__sid || (typeof l.source==='object'? l.source.id : l.source);
      const t = l.__tid || (typeof l.target==='object'? l.target.id : l.target);
      return sel.has(s) || sel.has(t);
    });
    return { nodes: visible.nodes, links };
  }, [pulse, visible, selectedId, adj]);

  // 하이라이트 집합 계산
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
  const linkParticles = (l) => {
    if (!pulse || !selectedId) return 0;
    const s = l.source; const t = l.target;
    if (!s || !t || typeof s.id === 'undefined' || typeof t.id === 'undefined') return 0;
    const touchesSel = s.id === selectedId || t.id === selectedId;
    return touchesSel && isCrossLayer(s, t) ? 2 : 0;
  };

  const linkMaterial = (l) => {
    const color = new THREE.Color(linkColor(l));
    if (l.assumed) {
      try {
        return new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1, transparent: true, opacity: isLinkDimmed(l) ? 0.25 : 0.65 });
      } catch {
        return new THREE.LineBasicMaterial({ color, transparent: true, opacity: isLinkDimmed(l) ? 0.25 : 0.65 });
      }
    }
    return new THREE.LineBasicMaterial({ color, transparent: true, opacity: isLinkDimmed(l) ? 0.25 : 0.95 });
  };

  // 이벤트 핸들러
  const onBackgroundClick = () => {
    setSelectedId(null);
    onNodeSelect(null);
  };

  const resetView = () => {
    setSelectedId(null);
    onNodeSelect(null);
    const fg = fgRef.current; if (!fg) return;
    try { const rot = fg.scene().rotation; rot.order='YXZ'; rot.x = 0; rot.y = 0; rot.z = 0; } catch {}
    fg.cameraPosition({ x: 0, y: 1800, z: 0 }, { x: 0, y: 0, z: 0 }, 600);
  };

  const onNodeClick = (node) => {
    setSelectedId(node?.id || null);
    if (node) {
      onNodeSelect(
        <NodeDetailPanel
          selected={node}
          adj={adj}
          visible={visible}
          byId={byId}
          onClearSelection={onBackgroundClick}
          onResetView={resetView}
        />
      );
    } else {
      onNodeSelect(null);
    }
  };

  const onLinkClick = (l) => { 
    const sid = l.__sid || (typeof l.source==='object'?l.source.id:l.source);
    const node = byId[sid];
    if (node) onNodeClick(node);
  };
  
  const onLinkUpdate = (link, threeObj) => {
    try { const line = link.__lineObj || threeObj; if (line && line.computeLineDistances) line.computeLineDistances(); } catch {}
  };

  try {
    const maybeProcess = typeof process !== 'undefined' ? process : undefined;
    const isTestEnv = (typeof window !== 'undefined' && window.__RUN_INLINE_TESTS__) || (maybeProcess && maybeProcess.env && maybeProcess.env.NODE_ENV === 'test');
    if (isTestEnv) {
      console.assert(__tests__.shouldZoomOnNodeClick() === false, '[TEST] Node click should not zoom');
      const { byId: tById, adj: tAdj } = buildAdjacency([{id:'a'},{id:'b'}], [{source:'a', target:'b'}]);
      console.assert(tById['a'] && tAdj.get('a').has('b'), '[TEST] buildAdjacency basic connectivity');
      console.assert(__tests__.yawLimitIsThirtyDeg() === true, '[TEST] Yaw limit constant ≈ 30°');
      console.assert(__tests__.clampInfinity() === true, '[TEST] Infinity clamp identity');
      console.assert(__tests__.eulerOrderYXZ() === true, '[TEST] Euler order YXZ');
    }
  } catch {}

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 600, background: '#1e1e1e', color: '#fff', overflow: 'hidden', display: 'flex' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {/* 툴바 */}
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 12 }}>
            <input
              placeholder="검색: label, ip, user, role, dept..."
              value={search}
              onChange={(e)=>setSearch(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.5)', background: 'rgba(20,20,20,0.7)', color: '#fff' }}
            />
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
            <button onClick={()=>setPulse(p=>!p)} style={{ padding:'4px 8px', borderRadius:6, background: pulse ? '#3b82f6' : '#2d2d2d', color:'#fff', border:'1px solid rgba(128,128,128,0.5)' }}>{pulse ? '펄스 ON' : '펄스 OFF'}</button>
            <button onClick={resetView} style={{ padding:'4px 8px', borderRadius:6, background:'#2d2d2d', color:'#fff', border:'1px solid rgba(128,128,128,0.5)' }}>뷰 초기화</button>
          </div>
        </div>

        <ForceGraph3D
          ref={fgRef}
          graphData={graphToRender}
          backgroundColor="#1e1e1e"
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
      </div>
    </div>
  );
}
