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
import "../App.css";

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

  // ResizeObserver로 부모 크기 추적 (반응형)
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

  // 3D → 2D 전환
  useEffect(() => {
    if (!globeRef.current || show2D) return;
    const controls = globeRef.current.controls();
    const checkZoom = () => {
      if (controls.object.position.length() < 110 && !show2D) setShow2D(true);
    };
    controls.addEventListener("change", checkZoom);
    return () => controls.removeEventListener("change", checkZoom);
  }, [show2D]);

  // 2D → 3D 돌아갈 때 위치·zoom 초기화
  useEffect(() => {
    if (!show2D && globeRef.current) {
      setMapCenter([0, 20]);
      setMapZoom(1);
      setMapKey((k) => k + 1);
      globeRef.current.pointOfView({ altitude: 2 }, 1000);
    }
  }, [show2D]);

  // --- 2D Arc 곡선 SVG Overlay ---
  function ArcsOverlay({ arcsData, projection }) {
    if (!projection) return null;
    return (
      <g>
        {arcsData.map((arc, i) => {
          const startLng = arc.startLng ?? arc.sourceLng ?? arc.longitude1 ?? arc.lng1 ?? 0;
          const startLat = arc.startLat ?? arc.sourceLat ?? arc.latitude1 ?? arc.lat1 ?? 0;
          const endLng = arc.endLng ?? arc.targetLng ?? arc.longitude2 ?? arc.lng2 ?? 0;
          const endLat = arc.endLat ?? arc.targetLat ?? arc.latitude2 ?? arc.lat2 ?? 0;
          const [x1, y1] = projection([startLng, startLat]);
          const [x2, y2] = projection([endLng, endLat]);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2 - Math.max(Math.abs(y2 - y1), Math.abs(x2 - x1)) * 0.3;
          return (
            <path
              key={i}
              d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
              stroke={arc.color ? (Array.isArray(arc.color) ? arc.color[0] : arc.color) : "#ff5533"}
              strokeWidth={1}
              fill="none"
              opacity={0.5}
              strokeDasharray="7,4"
            >
              <title>{arc.label}</title>
            </path>
          );
        })}
      </g>
    );
  }

  // ---- 2D MAP 출력 ----
  if (show2D) {
    return (
      <div
        ref={containerRef}
        className="dashboard-main"
        style={{
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
          position: "relative",
          background: "#181830",
        }}
      >
        {/* -- 다시 3D로 이동 버튼 -- */}
        <button
        onClick={() => setShow2D(false)}
        style={{
          position: "absolute",
          left: "90%",
          top: "5%",
          transform: "translate(-50%, -50%)",
          zIndex: 10,
          padding: "10px 28px",
          borderRadius: "24px",
          background: "linear-gradient(90deg, #a259ff 0%, #6e53de 100%)",
          color: "#fff",
          border: "2px solid #d1b7ff",
          fontWeight: "bold",
          fontSize: "1.13rem",
          boxShadow: "0 0 0 4px rgba(162,89,255,0.15), 0 4px 16px rgba(132, 80, 255, 0.13)",
          cursor: "pointer",
          transition: "background 0.2s, box-shadow 0.2s, border-color 0.2s, transform 0.08s",
          outline: "none"
        }}
        onMouseOver={e => {
          e.currentTarget.style.background = "linear-gradient(90deg, #c084fc 0%, #a259ff 100%)";
          e.currentTarget.style.boxShadow = "0 0 0 7px rgba(196, 132, 252, 0.19), 0 6px 24px rgba(148, 80, 255, 0.25)";
          e.currentTarget.style.borderColor = "#b385fd";
        }}
        onMouseOut={e => {
          e.currentTarget.style.background = "linear-gradient(90deg, #a259ff 0%, #6e53de 100%)";
          e.currentTarget.style.boxShadow = "0 0 0 4px rgba(162,89,255,0.15), 0 4px 16px rgba(132, 80, 255, 0.13)";
          e.currentTarget.style.borderColor = "#d1b7ff";
        }}
      >
        🌐 3D로 보기
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
                  {/* -- 2D 아크 곡선 연결 -- */}
                  <ArcsOverlay arcsData={arcsData} projection={projection} />
                </>
              )}
            </Geographies>
            {/* -- 마커 렌더링 -- */}
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

  // ---- 3D GLOBE 출력 ----
  return (
    <div
      ref={containerRef}
      className="dashboard-main"
      style={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        position: "relative",
        background: "#181830",
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
      {/* -- 2D로 보기 버튼 -- */}
      <button
        onClick={() => setShow2D(true)}
        style={{
          position: "absolute",
          left: "90%",
          top: "5%",
          transform: "translate(-50%, -50%)",
          zIndex: 10,
          padding: "10px 28px",
          borderRadius: "24px",
          background: "linear-gradient(90deg, #a259ff 0%, #6e53de 100%)",
          color: "#fff",
          border: "2px solid #d1b7ff",
          fontWeight: "bold",
          fontSize: "1.13rem",
          boxShadow: "0 0 0 4px rgba(162,89,255,0.15), 0 4px 16px rgba(132, 80, 255, 0.13)",
          cursor: "pointer",
          transition: "background 0.2s, box-shadow 0.2s, border-color 0.2s, transform 0.08s",
          outline: "none"
        }}
        onMouseOver={e => {
          e.currentTarget.style.background = "linear-gradient(90deg, #c084fc 0%, #a259ff 100%)";
          e.currentTarget.style.boxShadow = "0 0 0 7px rgba(196, 132, 252, 0.19), 0 6px 24px rgba(148, 80, 255, 0.25)";
          e.currentTarget.style.borderColor = "#b385fd";
        }}
        onMouseOut={e => {
          e.currentTarget.style.background = "linear-gradient(90deg, #a259ff 0%, #6e53de 100%)";
          e.currentTarget.style.boxShadow = "0 0 0 4px rgba(162,89,255,0.15), 0 4px 16px rgba(132, 80, 255, 0.13)";
          e.currentTarget.style.borderColor = "#d1b7ff";
        }}
      >
        🌐 2D로 보기
      </button>

      {/* -- 오버레이 패널 (3D에서도 유지) -- */}
      <div className="dashboard-sub-overlay">
        <h3 style={{ color: "#fff" }}>📡 오버레이 패널</h3>
        <p style={{ color: "#ccc" }}>
          이 영역엔 로그, 그래프 또는 추적 데이터를 표시할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

export default ExternalNetwork;
