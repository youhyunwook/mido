// import React, { useRef, useState, useEffect } from "react";
// import Globe from "react-globe.gl";
// import {
//   ComposableMap,
//   Geographies,
//   Geography,
//   Marker,
//   ZoomableGroup,
// } from "react-simple-maps";
// import { geoCentroid } from "d3-geo";
// import arcsData from "../arcs.js";
// const geoUrl = "/2d_world.json";

// function ExternalNetwork() {
//   const globeRef = useRef();
//   const containerRef = useRef(null);
//   const [show2D, setShow2D] = useState(false);
//   const [mapCenter, setMapCenter] = useState([0, 20]);
//   const [mapZoom, setMapZoom] = useState(1);
//   const [mapKey, setMapKey] = useState(0);
//   const [markers, setMarkers] = useState([]);
//   const [dimensions, setDimensions] = useState({ width: 300, height: 240 });

//   // 네트워크 노드 데이터 fetch
//   useEffect(() => {
//     fetch("http://localhost:8000/neo4j/nodes")
//       .then((res) => res.json())
//       .then(setMarkers)
//       .catch(() => {});
//   }, []);

//   // ResizeObserver로 부모 크기 추적 (완전 반응형)
//   useEffect(() => {
//     function updateSize() {
//       if (containerRef.current) {
//         setDimensions({
//           width: containerRef.current.offsetWidth,
//           height: containerRef.current.offsetHeight,
//         });
//       }
//     }
//     // 기본 resize 지원
//     updateSize();
//     window.addEventListener("resize", updateSize);

//     // ResizeObserver 지원 (강력권장)
//     let observer;
//     if (window.ResizeObserver && containerRef.current) {
//       observer = new window.ResizeObserver(() => updateSize());
//       observer.observe(containerRef.current);
//     }
//     return () => {
//       window.removeEventListener("resize", updateSize);
//       if (observer) observer.disconnect();
//     };
//   }, []);

//   // 3D→2D 전환
//   useEffect(() => {
//     if (!globeRef.current || show2D) return;
//     const controls = globeRef.current.controls();
//     const checkZoom = () => {
//       if (controls.object.position.length() < 110 && !show2D) setShow2D(true);
//     };
//     controls.addEventListener("change", checkZoom);
//     return () => controls.removeEventListener("change", checkZoom);
//   }, [show2D]);

//   // 2D→3D 돌아올 때 위치·zoom 초기화
//   useEffect(() => {
//     if (!show2D && globeRef.current) {
//       setMapCenter([0, 20]);
//       setMapZoom(1);
//       setMapKey((k) => k + 1);
//       globeRef.current.pointOfView({ altitude: 2 }, 1000);
//     }
//   }, [show2D]);

//   // 2D Map
//   if (show2D) {
//     return (
//       <div
//         ref={containerRef}
//         style={{
//           width: "100%",
//           height: "100%",
//           minWidth: 0,
//           minHeight: 0,
//           position: "relative",
//           background: "#181830",
//         }}
//       >
//         <button
//           onClick={() => setShow2D(false)}
//           style={{
//             position: "absolute",
//             left: "50%",
//             top: "50%",
//             transform: "translate(-50%, -50%)",
//             zIndex: 10,
//           }}
//         >
//           3D로 이동
//         </button>
//         <ComposableMap
//           key={mapKey}
//           projection="geoMercator"
//           width={dimensions.width}
//           height={dimensions.height}
//           style={{ width: "100%", height: "100%" }}
//         >
//           <ZoomableGroup
//             center={mapCenter}
//             zoom={mapZoom}
//             maxZoom={10}
//             minZoom={1}
//             style={{ width: "100%", height: "100%" }}
//           >
//             <Geographies geography={geoUrl}>
//               {({ geographies }) => (
//                 <>
//                   {geographies.map((geo) => (
//                     <Geography
//                       key={geo.rsmKey}
//                       geography={geo}
//                       fill="#272744"
//                       stroke="#777"
//                       style={{
//                         default: { outline: "none" },
//                         hover: { fill: "#006ca9", outline: "none" },
//                       }}
//                       onDoubleClick={(e) => {
//                         e.stopPropagation();
//                         const [lng, lat] = geoCentroid(geo);
//                         setMapCenter([lng, lat]);
//                         setMapZoom((z) => Math.min(Number(z) * 1.5, 8));
//                         setMapKey((k) => k + 1);
//                       }}
//                     />
//                   ))}
//                 </>
//               )}
//             </Geographies>
//             {markers.map((m, i) => (
//               <Marker
//                 key={i}
//                 coordinates={[
//                   m.longitude ?? m.lng ?? 0,
//                   m.latitude ?? m.lat ?? 0,
//                 ]}
//                 onClick={() =>
//                   setMapCenter([
//                     m.longitude ?? m.lng ?? 0,
//                     m.latitude ?? m.lat ?? 0,
//                   ])
//                 }
//               >
//                 <circle r={4} fill="#ffd700" stroke="#fff" />
//                 <text y={-14} fontSize={10} fill="#fff">
//                   {m.label}
//                 </text>
//               </Marker>
//             ))}
//           </ZoomableGroup>
//         </ComposableMap>
//       </div>
//     );
//   }

//   // 3D Globe
//   return (
//     <div
//       ref={containerRef}
//       style={{
//         width: "100%",
//         height: "100%",
//         minWidth: 0,
//         minHeight: 0,
//         position: "relative",
//       }}
//     >
//       <Globe
//         ref={globeRef}
//         width={dimensions.width}
//         height={dimensions.height}
//         style={{ width: "100%", height: "100%" }}
//         arcsData={arcsData}
//         arcLabel={(d) => d.label}
//         arcColor={(d) => d.color}
//         arcDashLength={0.4}
//         arcDashGap={0.3}
//         arcStroke={0.4}
//         arcDashAnimateTime={2000}
//         pointsData={markers}
//         pointLat={(m) =>
//           "latitude" in m ? m.latitude : "lat" in m ? m.lat : 0
//         }
//         pointLng={(m) =>
//           "longitude" in m ? m.longitude : "lng" in m ? m.lng : 0
//         }
//         pointLabel="label"
//         pointColor={() => "#FF5533"}
//         pointAltitude={0.02}
//         globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
//       />
//       <button
//         onClick={() => setShow2D(true)}
//         style={{
//           position: "absolute",
//           left: "50%",
//           top: "50%",
//           transform: "translate(-50%, -50%)",
//           zIndex: 10,
//         }}
//       >
//         2D로 보기
//       </button>
//     </div>
//   );
// }

// export default ExternalNetwork;


import React, { useRef, useState, useEffect } from "react";
import Globe from "react-globe.gl";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import arcsData from "../arcs.js";
const geoUrl = "/2d_world.json";

function ExternalNetwork() {
  const globeRef = useRef();
  const containerRef = useRef(null);
  const [show2D, setShow2D] = useState(false);
  const [mapCenter, setMapCenter] = useState([0, 20]);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapKey, setMapKey] = useState(0);
  const [markers, setMarkers] = useState([]);
  const [dimensions, setDimensions] = useState({ width: 300, height: 240 });

  // 네트워크 노드 데이터 fetch
  useEffect(() => {
    fetch("http://localhost:8000/neo4j/nodes")
      .then((res) => res.json())
      .then(setMarkers)
      .catch(() => {});
  }, []);

  // ResizeObserver로 부모 크기 추적 (완전 반응형)
  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    }
    updateSize();
    window.addEventListener("resize", updateSize);

    let observer;
    if (window.ResizeObserver && containerRef.current) {
      observer = new window.ResizeObserver(() => updateSize());
      observer.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener("resize", updateSize);
      if (observer) observer.disconnect();
    };
  }, []);

  // 3D→2D 전환
  useEffect(() => {
    if (!globeRef.current || show2D) return;
    const controls = globeRef.current.controls();
    const checkZoom = () => {
      if (controls.object.position.length() < 110 && !show2D) setShow2D(true);
    };
    controls.addEventListener("change", checkZoom);
    return () => controls.removeEventListener("change", checkZoom);
  }, [show2D]);

  // 2D→3D 돌아올 때 위치·zoom 초기화
  useEffect(() => {
    if (!show2D && globeRef.current) {
      setMapCenter([0, 20]);
      setMapZoom(1);
      setMapKey((k) => k + 1);
      globeRef.current.pointOfView({ altitude: 2 }, 1000);
    }
  }, [show2D]);

  // -------- 아래 부분만 추가 --------
  // 2D 아크 곡선 연결선 렌더 (SVG Path)
  function ArcsOverlay({ arcsData, projection }) {
    if (!projection) return null;
    return (
      <g>
        {
          arcsData.map((arc, i) => {
            // 위·경도 필드 자동 추출
            const startLng = arc.startLng ?? arc.sourceLng ?? arc.longitude1 ?? arc.lng1 ?? 0;
            const startLat = arc.startLat ?? arc.sourceLat ?? arc.latitude1 ?? arc.lat1 ?? 0;
            const endLng = arc.endLng ?? arc.targetLng ?? arc.longitude2 ?? arc.lng2 ?? 0;
            const endLat = arc.endLat ?? arc.targetLat ?? arc.latitude2 ?? arc.lat2 ?? 0;
            // x/y 변환
            const [x1, y1] = projection([startLng, startLat]);
            const [x2, y2] = projection([endLng, endLat]);
            // 컨트롤 포인트: 위로 살짝 곡선
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2 - Math.max(Math.abs(y2 - y1), Math.abs(x2 - x1)) * 0.3;
            return (
              <path
                key={i}
                d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                stroke={arc.color ? (Array.isArray(arc.color) ? arc.color[0] : arc.color) : "#ff5533"}
                strokeWidth={2}
                fill="none"
                opacity={0.75}
                strokeDasharray="7,4"
              >
                <title>{arc.label}</title>
              </path>
            );
          })
        }
      </g>
    );
  }
  // -------- (여기까지 추가) --------

  // 2D Map
  if (show2D) {
    return (
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
          position: "relative",
          background: "#181830",
        }}
      >
        <button
          onClick={() => setShow2D(false)}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 10,
          }}
        >
          3D로 이동
        </button>
        <ComposableMap
          key={mapKey}
          projection="geoMercator"
          width={dimensions.width}
          height={dimensions.height}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup
            center={mapCenter}
            zoom={mapZoom}
            maxZoom={10}
            minZoom={1}
            style={{ width: "100%", height: "100%" }}
          >
            <Geographies geography={geoUrl}>
              {({ geographies, projection }) => (
                <>
                  {geographies.map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="#272744"
                      stroke="#777"
                      style={{
                        default: { outline: "none" },
                        hover: { fill: "#006ca9", outline: "none" },
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        const [lng, lat] = geoCentroid(geo);
                        setMapCenter([lng, lat]);
                        setMapZoom((z) => Math.min(Number(z) * 1.5, 8));
                        setMapKey((k) => k + 1);
                      }}
                    />
                  ))}
                  {/* --- arcsData SVG Path arcs 추가 --- */}
                  <ArcsOverlay arcsData={arcsData} projection={projection} />
                </>
              )}
            </Geographies>
            {markers.map((m, i) => (
              <Marker
                key={i}
                coordinates={[
                  m.longitude ?? m.lng ?? 0,
                  m.latitude ?? m.lat ?? 0,
                ]}
                onClick={() =>
                  setMapCenter([
                    m.longitude ?? m.lng ?? 0,
                    m.latitude ?? m.lat ?? 0,
                  ])
                }
              >
                <circle r={4} fill="#ffd700" stroke="#fff" />
                <text y={-14} fontSize={10} fill="#fff">
                  {m.label}
                </text>
              </Marker>
            ))}
          </ZoomableGroup>
        </ComposableMap>
      </div>
    );
  }

  // 3D Globe
  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        position: "relative",
      }}
    >
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ width: "100%", height: "100%" }}
        arcsData={arcsData}
        arcLabel={(d) => d.label}
        arcColor={(d) => d.color}
        arcDashLength={0.4}
        arcDashGap={0.3}
        arcStroke={0.4}
        arcDashAnimateTime={2000}
        pointsData={markers}
        pointLat={(m) =>
          "latitude" in m ? m.latitude : "lat" in m ? m.lat : 0
        }
        pointLng={(m) =>
          "longitude" in m ? m.longitude : "lng" in m ? m.lng : 0
        }
        pointLabel="label"
        pointColor={() => "#FF5533"}
        pointAltitude={0.02}
        globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
      />
      <button
        onClick={() => setShow2D(true)}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 10,
        }}
      >
        2D로 보기
      </button>
    </div>
  );
}

export default ExternalNetwork;
