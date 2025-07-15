import React, { useEffect, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";

function InternalNetwork() {
  const [graph, setGraph] = useState({ nodes: [], links: [] });

  useEffect(() => {
    fetch("bolt://223.195.38.211:7687")
      .then(res => res.json())
      .then(data => {
        // API에서 nodes, links 구조로 변환 필요
        setGraph({
          nodes: data.nodes, // 예시 구조에 맞춰서
          links: data.links
        });
      });
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#222" }}>
      <ForceGraph3D
        graphData={graph}
        nodeLabel="city"
        nodeAutoColorBy="group"
        linkDirectionalArrowLength={4}
      />
    </div>
  );
}
export default InternalNetwork;



