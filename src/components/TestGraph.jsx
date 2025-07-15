// src/components/TestGraph.jsx
import React from "react";
import ForceGraph3D from "react-force-graph-3d";

export default function TestGraph() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <ForceGraph3D
        graphData={{
          nodes: [
            { id: "a" },
            { id: "b" }
          ],
          links: [
            { source: "a", target: "b" }
          ]
        }}
        nodeLabel="id"
      />
    </div>
  );
}
