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

const geoUrl = "/2d_world.json";

// 임시 arcsData (실제로는 import로 교체 가능)
const arcsData = [
  { startLat: 37.5665, startLng: 126.9780, endLat: 40.7128, endLng: -74.0060, label: "Seoul to NYC", color: "#00ffff" },
  { startLat: 37.5665, startLng: 126.9780, endLat: 51.5074, endLng: -0.1278, label: "Seoul to London", color: "#ff0080" },
  { startLat: 37.5665, startLng: 126.9780, endLat: 35.6762, endLng: 139.6503, label: "Seoul to Tokyo", color: "#00ff00" },
];

function ExternalNetwork() {
  const globeRef = useRef();
  const containerRef = useRef(null);

  const [show2D, setShow2D] = useState(false);
  const [mapCenter, setMapCenter] = useState([0, 20]);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapKey, setMapKey] = useState(0);
  const [markers, setMarkers] = useState([
    { latitude: 37.5665, longitude: 126.9780, label: "Seoul" },
    { latitude: 40.7128, longitude: -74.0060, label: "New York" },
    { latitude: 51.5074, longitude: -0.1278, label: "London" },
    { latitude: 35.6762, longitude: 139.6503, label: "Tokyo" },
  ]);
  const [dimensions, setDimensions] = useState({ width: 600, height: 600 });

  // 네트워크 노드 데이터 fetch
  useEffect(() => {
    fetch("http://localhost:8000/neo4j/nodes")
      .then((res) => res.json())
      .then(setMarkers)
      .catch(() => {});
  }, []);

  //컨테이너 기준 80%로 동적 사이즈, 2D에서 중앙 정렬에 최적화
  useEffect(() => {
    function updateSize() {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const containerHeight = containerRef.current.offsetHeight;
      setDimensions({
        width: Math.floor(containerWidth * 0.8),
        height: Math.floor(containerHeight * 0.8),
      });
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

  // Globe 초기화 - 자동 회전 및 초기 POV
  useEffect(() => {
    if (!globeRef.current || show2D) return;

    const globe = globeRef.current;
    const timer = setTimeout(() => {
      if (globe && globe.pointOfView) {
        globe.pointOfView({ lat: 37.5665, lng: 126.9780, altitude: 2.5 }, 1000);
      }

      if (globe && globe.scene) {
        const scene = globe.scene();
        if (scene && scene.rotation) {
          let rotationSpeed = 0.001;
          const animate = () => {
            if (!show2D && scene) {
              scene.rotation.y += rotationSpeed;
            }
            requestAnimationFrame(animate);
          };
          animate();
        }
      }
    }, 500);

    return () => clearTimeout(timer);
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
            <g key={i}>
              <path
                d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                stroke="url(#arcGradient)"
                strokeWidth={1}
                fill="none"
                opacity={0.9}
                strokeDasharray="8,2"
                className="animated-arc"
              >
                <title>{arc.label}</title>
              </path>
              <path
                d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                stroke="#00ffff"
                strokeWidth={3}
                fill="none"
                opacity={0.15}
                filter="blur(2px)"
              />
            </g>
          );
        })}
        <defs>
          <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff0080" />
            <stop offset="50%" stopColor="#00ffff" />
            <stop offset="100%" stopColor="#ff0080" />
          </linearGradient>
        </defs>
      </g>
    );
  }

  // 공통 배경 컴포넌트 (3D 전용 장식)
  const SpaceBackground = () => (
    <>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: `
            radial-gradient(ellipse at top left, rgba(13, 0, 50, 0.8) 0%, transparent 50%),
            radial-gradient(ellipse at bottom right, rgba(50, 0, 80, 0.6) 0%, transparent 50%),
            radial-gradient(ellipse at center, #020308 0%, #000000 100%)
          `,
          zIndex: 0
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "-50%",
          left: "-50%",
          width: "200%",
          height: "200%",
          background: `
            radial-gradient(circle at 25% 25%, rgba(0, 255, 255, 0.03) 0%, transparent 25%),
            radial-gradient(circle at 75% 75%, rgba(255, 0, 128, 0.03) 0%, transparent 25%),
            radial-gradient(circle at 50% 50%, rgba(100, 0, 255, 0.02) 0%, transparent 40%)
          `,
          animation: "nebula 30s ease-in-out infinite",
          zIndex: 1
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundImage: `
            radial-gradient(2px 2px at 20px 30px, #ffffff, transparent),
            radial-gradient(2px 2px at 40px 70px, #00ffff, transparent),
            radial-gradient(1px 1px at 90px 40px, rgba(255, 255, 255, 0.8), transparent),
            radial-gradient(1px 1px at 130px 80px, rgba(0, 255, 255, 0.6), transparent),
            radial-gradient(2px 2px at 160px 30px, #ff0080, transparent),
            radial-gradient(1px 1px at 200px 90px, rgba(255, 255, 255, 0.5), transparent),
            radial-gradient(1px 1px at 250px 50px, rgba(0, 200, 255, 0.7), transparent),
            radial-gradient(2px 2px at 300px 20px, rgba(255, 0, 128, 0.6), transparent)
          `,
          backgroundRepeat: "repeat",
          backgroundSize: "350px 150px",
          animation: "twinkle 4s infinite",
          opacity: 0.8,
          zIndex: 2
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: "-100px",
          width: "100px",
          height: "2px",
          background: "linear-gradient(90deg, transparent 0%, #00ffff 50%, transparent 100%)",
          animation: "shootingStar 8s linear infinite",
          zIndex: 3
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "-100px",
          width: "80px",
          height: "1px",
          background: "linear-gradient(90deg, transparent 0%, #ff0080 50%, transparent 100%)",
          animation: "shootingStar 10s linear infinite 2s",
          zIndex: 3
        }}
      />
    </>
  );

  // ---- 2D MAP 출력 (중앙정렬) ----
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
          background: "radial-gradient(ellipse at center, #020308 0%, #000000 100%)",
          // ✅ 중앙 정렬
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <button
          onClick={() => setShow2D(false)}
          style={{
            position: "absolute",
            left: "90%",
            top: "5%",
            transform: "translate(-50%, -50%)",
            zIndex: 10,
            padding: "12px 30px",
            borderRadius: "25px",
            background: "linear-gradient(45deg, #ff0080 0%, #00ffff 100%)",
            color: "#fff",
            border: "2px solid rgba(0, 255, 255, 0.5)",
            fontWeight: "bold",
            fontSize: "1.1rem",
            boxShadow: "0 0 20px rgba(0, 255, 255, 0.3), inset 0 0 20px rgba(255, 0, 128, 0.1)",
            cursor: "pointer",
            transition: "all 0.3s ease",
            outline: "none",
            textShadow: "0 0 10px rgba(255, 255, 255, 0.8)"
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = "linear-gradient(45deg, #00ffff 0%, #ff0080 100%)";
            e.currentTarget.style.boxShadow = "0 0 30px rgba(255, 0, 128, 0.5), inset 0 0 30px rgba(0, 255, 255, 0.1)";
            e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.05)";
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = "linear-gradient(45deg, #ff0080 0%, #00ffff 100%)";
            e.currentTarget.style.boxShadow = "0 0 20px rgba(0, 255, 255, 0.3), inset 0 0 20px rgba(255, 0, 128, 0.1)";
            e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)";
          }}
        >
          🌐 3D로 보기
        </button>

        {/* 중앙에 고정된 맵 래퍼 (크기: 컨테이너의 80%) */}
        <div style={{ width: dimensions.width, height: dimensions.height }}>
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
            >
              <Geographies geography={geoUrl}>
                {({ geographies, projection }) => (
                  <>
                    {geographies.map((geo) => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill="#0a0a15"
                        stroke="#00ffff"
                        strokeWidth={0.5}
                        style={{
                          default: {
                            outline: "none",
                            filter: "drop-shadow(0 0 3px rgba(0, 255, 255, 0.3))",
                          },
                          hover: {
                            fill: "#1a1a2e",
                            outline: "none",
                            stroke: "#ff0080",
                            filter: "drop-shadow(0 0 8px rgba(255, 0, 128, 0.5))",
                          },
                        }}
                        // ✅ 두번째 코드처럼 더 자연스러운 줌: 더블클릭 시 중심 이동 + 줌 인
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          const [lng, lat] = geoCentroid(geo);
                          setMapCenter([lng, lat]);
                          setMapZoom((z) => Math.min(Number(z) * 1.5, 8));
                          setMapKey((k) => k + 1); // 강제 리렌더로 투영 재계산
                        }}
                      />
                    ))}
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
                  onClick={() => {
                    setMapCenter([
                      m.longitude ?? m.lng ?? 0,
                      m.latitude ?? m.lat ?? 0,
                    ]);
                    setMapZoom(4);
                  }}
                >
                  <circle
                    r={4}
                    fill="#ffffff"
                    stroke="#00ffff"
                    strokeWidth={1}
                    style={{
                      filter: "drop-shadow(0 0 4px rgba(0, 255, 255, 0.6))",
                      animation: "pulse 2s infinite",
                    }}
                  />
                  <text
                    y={-18}
                    fontSize={11}
                    fill="#00ffff"
                    textAnchor="middle"
                    style={{ textShadow: "0 0 10px rgba(0, 255, 255, 0.8)" }}
                  >
                    {m.label}
                  </text>
                </Marker>
              ))}
            </ZoomableGroup>
          </ComposableMap>
        </div>

        <style>{`
          @keyframes twinkle {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.9; }
          }
          @keyframes nebula {
            0%, 100% { transform: rotate(0deg) scale(1); opacity: 0.5; }
            50% { transform: rotate(180deg) scale(1.2); opacity: 0.8; }
          }
          @keyframes shootingStar {
            0% { left: -100px; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { left: calc(100% + 100px); opacity: 0; }
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.7; }
          }
          .animated-arc { animation: arcFlow 3s linear infinite; }
          @keyframes arcFlow { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -100; } }
        `}</style>
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
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SpaceBackground />

      <div style={{ position: "relative", zIndex: 5 }}>
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          enablePointerInteraction={true}

          // Arc 설정
          arcsData={arcsData}
          arcLabel={(d) => d.label}
          arcColor={(d) => d.color || ["#00ffff", "#ff0080", "#00ff00"][Math.floor(Math.random() * 3)]}
          arcDashLength={0.8}
          arcDashGap={0.2}
          arcDashAnimateTime={2000}
          arcStroke={0.5}
          arcAltitude={0.15}

          // 포인트 설정
          pointsData={markers}
          pointLat={(m) => m.latitude ?? m.lat ?? 0}
          pointLng={(m) => m.longitude ?? m.lng ?? 0}
          pointLabel="label"
          pointColor={() => '#ffffff'}
          pointAltitude={0.01}
          pointRadius={0.5}

          // 글로브 텍스처
          globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"

          // 대기 효과
          showAtmosphere={true}
          atmosphereColor="#00ffff"
          atmosphereAltitude={0.15}

          backgroundColor="rgba(0,0,0,0)"

          onGlobeReady={() => {
            if (globeRef.current) {
              globeRef.current.pointOfView({ lat: 37.5665, lng: 126.9780, altitude: 2.5 });
            }
          }}
        />
      </div>

      <button
        onClick={() => setShow2D(true)}
        style={{
          position: "absolute",
          right: "20px",
          top: "20px",
          zIndex: 10,
          padding: "12px 30px",
          borderRadius: "25px",
          background: "linear-gradient(45deg, #ff0080 0%, #00ffff 100%)",
          color: "#fff",
          border: "2px solid rgba(0, 255, 255, 0.5)",
          fontWeight: "bold",
          fontSize: "1rem",
          boxShadow: "0 0 20px rgba(0, 255, 255, 0.3), inset 0 0 20px rgba(255, 0, 128, 0.1)",
          cursor: "pointer",
          transition: "all 0.3s ease",
          outline: "none",
          textShadow: "0 0 10px rgba(255, 255, 255, 0.8)"
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = "scale(1.05)";
          e.currentTarget.style.boxShadow = "0 0 30px rgba(255, 0, 128, 0.5)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 0 20px rgba(0, 255, 255, 0.3)";
        }}
      >
        🗺️ 2D로 보기
      </button>

      <style>{`
        @keyframes twinkle { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.9; } }
        @keyframes nebula { 0%, 100% { transform: rotate(0deg) scale(1); opacity: 0.5; } 50% { transform: rotate(180deg) scale(1.2); opacity: 0.8; } }
        @keyframes shootingStar { 0% { left: -100px; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { left: calc(100% + 100px); opacity: 0; } }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.7; } }
        .animated-arc { animation: arcFlow 3s linear infinite; }
        @keyframes arcFlow { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -100; } }
      `}</style>
    </div>
  );
}

export default ExternalNetwork;
