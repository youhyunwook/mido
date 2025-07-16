// import React, { useState, useEffect } from "react";
// import ForceGraph3D from "react-force-graph-3d";
// import { createHierarchicalGraphLayers } from "./GraphUtil";

// function InternalNetwork() {
//   const [graph] = useState(() =>
//     createHierarchicalGraphLayers({
//       layers: [
//         { name: "physigs", count: 6 },
//         { name: "logical", count: 18 },
//         { name: "persona", count: 48 }
//       ]
//     })
//   );

//   const [dimensions, setDimensions] = useState({
//     width: window.innerWidth,
//     height: window.innerHeight
//   });

//   useEffect(() => {
//     const handleResize = () => setDimensions({
//       width: window.innerWidth,
//       height: window.innerHeight
//     });
//     window.addEventListener("resize", handleResize);
//     return () => window.removeEventListener("resize", handleResize);
//   }, []);

//   const width = dimensions.width / 2;
//   const height = dimensions.height - 72;

//   return (
//     <div style={{ width: "100%", height: "100%" }}>
//       <ForceGraph3D
//         graphData={graph}
//         width={width}
//         height={height}
//         nodeLabel="name"
//         nodeAutoColorBy="layer"
//         nodeOpacity={0.95}
//         linkOpacity={0.8}
//         backgroundColor="#00000000"
//         // 필요하면 다음 작성도 가능:
//         // dagMode="zout"
//         // dagLevelDistance={200}
//       />
//     </div>
//   );
// }

import React, { useState, useEffect, useRef } from "react";
import ForceGraph3D from "react-force-graph-3d";
import { createHierarchicalGraphLayers } from "./GraphUtil";
import * as THREE from "three";

const LAYERS = [
  { name: "physigs", count: 6 },
  { name: "logical", count: 18 },
  { name: "persona", count: 48 }
];
const Z_DISTANCE = 200; // 계층별 z-좌표 간격

function InternalNetwork() {
  const [graph] = useState(() =>
    createHierarchicalGraphLayers({ layers: LAYERS })
  );

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  useEffect(() => {
    const handleResize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const width = dimensions.width / 2;
  const height = dimensions.height - 72;

  const fgRef = useRef();

  // ▶️ 계층별 반투명 평면과 텍스트 추가
  useEffect(() => {
    if (!fgRef.current) return;
    const scene = fgRef.current.scene();
    // 중복 방지: 이미 있으면 제거
    const old = scene.getObjectByName("layer_planes_group");
    if (old) scene.remove(old);
    const group = new THREE.Group();
    group.name = "layer_planes_group";
    LAYERS.forEach((layer, i) => {
      // 현재 계층 노드 그리드 예상 범위 계산
      const cols = Math.ceil(Math.sqrt(layer.count));
      const rows = Math.ceil(layer.count / cols);
      const planeWidth = Math.max(400, cols * 120);
      const planeHeight = Math.max(250, rows * 120);

      // ▶️ 반투명 흰색 평면
      const planeGeo = new THREE.PlaneGeometry(planeWidth, planeHeight);
      const planeMat = new THREE.MeshLambertMaterial({
        color: 0xf0f0f0,
        transparent: true,
        opacity: 0.3, // 30% 투명도
        side: THREE.DoubleSide
      });
      const plane = new THREE.Mesh(planeGeo, planeMat);
      plane.position.set(0, 0, i * Z_DISTANCE);
      group.add(plane);

      // ▶️ 계층명 텍스트 SPRITE
      const canvas = document.createElement("canvas");
      const csize = 256;
      canvas.width = csize; canvas.height = csize;
      const ctx = canvas.getContext('2d');
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#FFF";
      ctx.strokeStyle = "#222";
      ctx.fillText(layer.name, csize / 2, csize / 2);
      ctx.strokeText(layer.name, csize / 2, csize / 2);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(-planeWidth / 2 - 80, -planeHeight / 2 + 40, i * Z_DISTANCE + 8);
      sprite.scale.set(140, 50, 1);
      group.add(sprite);
    });
    scene.add(group);

    // 정리
    return () => {
      scene.remove(group);
    };
    // eslint-disable-next-line
  }, [fgRef, graph, width, height]);

  return (
    <div style={{ width, height }}>
      <ForceGraph3D
        ref={fgRef}
        graphData={graph}
        width={width}
        height={height}
        nodeLabel="name"
        nodeAutoColorBy="layer"
        nodeOpacity={0.95}
        linkOpacity={0.8}
        backgroundColor="#00000000"
      />
    </div>
  );
}

export default InternalNetwork;
