import React, { useEffect, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { createHierarchicalGraphLayers } from "./GraphUtil";

const LAYERS = [
  { name: "physigs", count: 6 },
  { name: "logical", count: 18 },
  { name: "persona", count: 48 }
];

// 각 레이어별 색상 지정
const LAYER_COLORS = {
  physigs: 0xffe082,   // 옅은 주황
  logical: 0x90caf9,   // 옅은 파랑
  persona: 0xb39ddb    // 옅은 보라
};

function InternalNetwork() {
  const [graph] = useState(() => createHierarchicalGraphLayers({ layers: LAYERS }));
  const fgRef = useRef();

  useEffect(() => {
    if (!fgRef.current) return;
    const scene = fgRef.current.scene();
    let oldGroup = scene.getObjectByName("layer_planes_group");
    if (oldGroup) scene.remove(oldGroup);

    // 각 레이어별 노드 좌표 수집
    const layerNodes = {};
    graph.nodes.forEach(n => {
      layerNodes[n.layer] = layerNodes[n.layer] || [];
      layerNodes[n.layer].push(n);
    });

    const margin = 50;
    const group = new THREE.Group();
    group.name = "layer_planes_group";

    Object.entries(layerNodes).forEach(([layer, nodes]) => {
      if (!nodes.length) return;
      const minX = Math.min(...nodes.map(n => n.fx ?? n.x ?? 0));
      const maxX = Math.max(...nodes.map(n => n.fx ?? n.x ?? 0));
      const minY = Math.min(...nodes.map(n => n.fy ?? n.y ?? 0));
      const maxY = Math.max(...nodes.map(n => n.fy ?? n.y ?? 0));
      const z = nodes[0].fz ?? nodes[0].z ?? 0;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const width = maxX - minX + margin;
      const height = maxY - minY + margin;

      // 레이어별 색상 Plane(반투명, 양면)
      const color = LAYER_COLORS[layer] || 0xffffff;
      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshBasicMaterial({
        color,
        opacity: 0.18,
        transparent: true,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(centerX, centerY, z);
      mesh.name = `${layer}_plane`;
      group.add(mesh);

      // 레이어 명칭 라벨(Sprite 이용)
      const fontSize = 36;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white";
      ctx.shadowColor = "black";
      ctx.shadowBlur = 6;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillText(layer, 10, canvas.height / 2);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(80, 20, 1); // 텍스트 크기
      sprite.position.set(maxX + margin / 2 + 40, centerY, z);

      group.add(sprite);
    });

    scene.add(group);
  }, [graph]);

  return (
    <ForceGraph3D
      ref={fgRef}
      linkOpacity={0.2}
      linkWidth={2}
      linkColor={link => '#ccc'}
      graphData={graph}
      cooldownTicks={100}
      nodeRelSize={5}
      d3Force="charge"
      d3VelocityDecay={0.25}
      d3AlphaDecay={0.005}
      nodeResolution={50}
      onEngineInit={fg => {
        fg.d3Force('charge').strength(0);
        fg.d3Force('center').strength(0.2);
      }}
      onEngineStop={() => {
        if (fgRef.current) fgRef.current.zoomToFit(1000, 40);
      }}
      nodeColor={node => LAYER_COLORS[node.layer] || 0xffffff}
    />
  );
}

export default InternalNetwork;
