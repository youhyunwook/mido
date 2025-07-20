const { createHierarchicalGraphLayers } = require('./src/components/GraphUtil.jsx');

const LAYERS = [
  { name: "physigs", count: 6 },
  { name: "logical", count: 18 },
  { name: "persona", count: 48 }
];

const graph = createHierarchicalGraphLayers({ layers: LAYERS });
console.log("nodes:", graph.nodes);
console.log("links:", graph.links);
