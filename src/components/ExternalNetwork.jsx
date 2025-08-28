import React, { useRef, useState, useEffect, useMemo } from "react";
import Globe from "react-globe.gl";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { geoCentroid } from "d3-geo";
// 공유 아크 데이터 사용 (import는 최상단으로 이동)
import arcsData from "../arcs";

const geoUrl = "/2d_world.json";

function ExternalNetwork() {
  const globeRef = useRef();
  const containerRef = useRef(null);

  const [show2D, setShow2D] = useState(false);
  const [mapCenter, setMapCenter] = useState([0, 20]);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapKey, setMapKey] = useState(0);
  const [markers, setMarkers] = useState([]);
  const [dimensions, setDimensions] = useState({ width: 600, height: 600 });

  // 아크 양끝 포인트(3D에서 흰색 원으로 표시) + 기존 마커 병합
  const pointsWithArcEndpoints = useMemo(() => {
    // 모든 아크 끝점(흰색) + 아크 끝점에 연결된 마커만 유지(녹색)
    const endpoints = (arcsData || []).flatMap((a) => {
      const startLat = a.startLat ?? a.sourceLat ?? a.lat1 ?? 0;
      const startLng = a.startLng ?? a.sourceLng ?? a.lng1 ?? 0;
      const endLat = a.endLat ?? a.targetLat ?? a.lat2 ?? 0;
      const endLng = a.endLng ?? a.targetLng ?? a.lng2 ?? 0;
      return [
        { latitude: startLat, longitude: startLng, label: (a.label ? `${a.label} (start)` : `arc-start-${startLat}-${startLng}`), endpoint: true },
        { latitude: endLat, longitude: endLng, label: (a.label ? `${a.label} (end)` : `arc-end-${endLat}-${endLng}`), endpoint: true }
      ];
    });
    const endpointKey = (lat, lng) => `${Math.round(lat*100)/100},${Math.round(lng*100)/100}`;
    const endpointSet = new Set(endpoints.map(p => endpointKey(p.latitude, p.longitude)));
    const connectedMarkers = (markers || []).filter(m => endpointSet.has(endpointKey(m.latitude ?? m.lat ?? 0, m.longitude ?? m.lng ?? 0)));
    const byKey = new Map();
    [...connectedMarkers, ...endpoints].forEach((p) => { const k = `${p.label}`; if (!byKey.has(k)) byKey.set(k, p); });
    return Array.from(byKey.values());
  }, [markers, arcsData]);

  // 좌표가 유효하지 않거나 동일 지점인 아크 제거 (2D/3D 공통 사용)
  const filteredArcs = useMemo(() => {
    const isValid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat <= 90 && lat >= -90 && lng <= 180 && lng >= -180;
    return (arcsData || []).filter(a => {
      const sLat = a.startLat ?? a.sourceLat ?? a.lat1 ?? 0;
      const sLng = a.startLng ?? a.sourceLng ?? a.lng1 ?? 0;
      const eLat = a.endLat ?? a.targetLat ?? a.lat2 ?? 0;
      const eLng = a.endLng ?? a.targetLng ?? a.lng2 ?? 0;
      if (!isValid(sLat, sLng) || !isValid(eLat, eLng)) return false;
      if (Math.abs(sLat - eLat) < 1e-6 && Math.abs(sLng - eLng) < 1e-6) return false;
      return true;
    });
  }, [arcsData]);

  // 기본 15개 트래픽 노드 (북한 3 + 기타 12)
  const defaultMarkers = [
    // 북한(이상)
    { latitude: 39.0392, longitude: 125.7625, label: "North Korea - Pyongyang", abnormal: true },
    { latitude: 41.8023, longitude: 129.7959, label: "North Korea - Hamgyongbuk-do", abnormal: true },
    { latitude: 40.1000, longitude: 124.4000, label: "North Korea - Sinuiju", abnormal: true },
    // 기타(정상)
    { latitude: 37.5665, longitude: 126.9780, label: "Seoul" },
    { latitude: 35.1796, longitude: 129.0756, label: "Busan" },
    { latitude: 35.9078, longitude: 127.7669, label: "Korea - Center" },
    { latitude: 40.7128, longitude: -74.0060, label: "New York" },
    { latitude: 51.5074, longitude: -0.1278, label: "London" },
    { latitude: 48.8566, longitude: 2.3522, label: "Paris" },
    { latitude: 52.5200, longitude: 13.4050, label: "Berlin" },
    { latitude: 55.7558, longitude: 37.6173, label: "Moscow" },
    { latitude: 35.6762, longitude: 139.6503, label: "Tokyo" },
    { latitude: 31.2304, longitude: 121.4737, label: "Shanghai" },
    { latitude: 28.6139, longitude: 77.2090, label: "New Delhi" },
    { latitude: -33.8688, longitude: 151.2093, label: "Sydney" },
  ];

  // 네트워크 노드 데이터 fetch + 기본 15개 병합
  useEffect(() => {
    const mergeUnique = (base, extra) => {
      const byKey = new Map();
      [...extra, ...base].forEach((m) => {
        const key = `${m.label}`;
        if (!byKey.has(key)) byKey.set(key, m);
      });
      return Array.from(byKey.values());
    };

    fetch("http://localhost:8000/neo4j/nodes")
      .then((res) => res.json())
      .then((data) => setMarkers(mergeUnique(defaultMarkers, Array.isArray(data) ? data : [])))
      .catch(() => setMarkers(defaultMarkers));
  }, []);

  //컨테이너 기준 정사각/확장 동적 사이즈
  // - 2D: 컨테이너 전체 크기(직사각형)로 채움
  // - 3D: 컨테이너보다 더 큰 정사각(경계가 화면 밖으로 나가도록) → 사각형 경계 노출 방지
  useEffect(() => {
    function updateSize() {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const containerHeight = containerRef.current.offsetHeight;
      if (show2D) {
        setDimensions({ width: containerWidth, height: containerHeight });
      } else {
        // 지구본을 더 작게 (원래 느낌에 가깝게)
        const side3d = Math.ceil(Math.max(containerWidth, containerHeight) * 1.05);
        setDimensions({ width: side3d, height: side3d });
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
  }, [show2D]);

  // Globe 초기화 - 자동 회전 및 초기 POV + 컨트롤/카메라 보정(확대 시 클리핑 방지)
  useEffect(() => {
    if (!globeRef.current || show2D) return;

    const globe = globeRef.current;
    const timer = setTimeout(() => {
      if (globe && globe.pointOfView) {
        globe.pointOfView({ lat: 37.5665, lng: 126.9780, altitude: 3.6 }, 900);
      }

      // 컨트롤/카메라 세팅
      try {
        const controls = globe.controls?.();
        if (controls) {
          controls.enableDamping = true;
          controls.dampingFactor = 0.07;
          controls.minDistance = 120; // 더 가까이 확대 허용
          controls.maxDistance = 3000; // 멀리 축소 허용
          controls.enablePan = false; // 패닝으로 화면 밖으로 나가는 것 방지
          controls.update?.();
        }
        const camera = globe.camera?.();
        if (camera) {
          camera.near = 0.1;
          camera.far = 10000;
          camera.updateProjectionMatrix();
        }
      } catch {}

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

          // 색상 규칙: 이상(빨강)/정상(연두)
          const inferColor = () => {
            const redCandidates = ["#ff", "#b0"]; // 시작값 확인
            const first = Array.isArray(arc.color) ? String(arc.color[0]).toLowerCase() : String(arc.color || "").toLowerCase();
            const isAbnormal = redCandidates.some((p) => first.startsWith(p)) || /북한|north korea|중국|china/i.test(arc.label || "");
            return isAbnormal ? "#ff4d4d" : "#89f889";
          };
          const strokeColor = inferColor();

          return (
            <g key={i}>
              <path
                d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                stroke={strokeColor}
                strokeWidth={2}
                fill="none"
                opacity={0.9}
                strokeDasharray="8,2"
                className="animated-arc"
              >
                <title>{arc.label}</title>
              </path>
              {/* 양 끝 동그라미 */}
              <circle cx={x1} cy={y1} r={4} fill="#ffffff" opacity={0.95} />
              <circle cx={x2} cy={y2} r={4} fill="#ffffff" opacity={0.95} />
              <path
                d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                stroke={strokeColor}
                strokeWidth={4}
                fill="none"
                opacity={0.12}
                filter="blur(2px)"
              />
            </g>
          );
        })}
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
          background: "transparent",
          // 전체 채움
          display: "block",
          userSelect: "none"
        }}
      >
        <button
          onClick={() => setShow2D(false)}
          style={{
            position: "absolute",
            right: "20px",
            top: "20px",
            zIndex: 10,
            padding: "12px 30px",
            borderRadius: "25px",
            background: "linear-gradient(90deg, #a259ff 0%, #6e53de 100%)",
            color: "#fff",
            border: "2px solid #d1b7ff",
            fontWeight: "bold",
            fontSize: "1.1rem",
            boxShadow: "0 6px 20px rgba(148, 80, 255, 0.25)",
            cursor: "pointer",
            transition: "all 0.3s ease",
            outline: "none",
            textShadow: "0 0 10px rgba(255, 255, 255, 0.8)"
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = "linear-gradient(90deg, #c084fc 0%, #a259ff 100%)";
            e.currentTarget.style.boxShadow = "0 10px 24px rgba(148, 80, 255, 0.35)";
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = "linear-gradient(90deg, #a259ff 0%, #6e53de 100%)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(148, 80, 255, 0.25)";
            e.currentTarget.style.transform = "scale(1)";
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
            {/* 바다 영역 클릭 비활성화: 국가만 선택 */}
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
                          default: { outline: "none", filter: "drop-shadow(0 0 3px rgba(0, 255, 255, 0.3))", pointerEvents: "all" },
                          hover: { fill: "#1a1a2e", outline: "none", stroke: "#ff0080", filter: "drop-shadow(0 0 8px rgba(255, 0, 128, 0.5))", pointerEvents: "all" },
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
                    <ArcsOverlay arcsData={filteredArcs} projection={projection} />
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
                    fill={m.abnormal ? "#ff4d4d" : "#89f889"}
                    stroke={m.abnormal ? "#b00000" : "#4ade80"}
                    strokeWidth={1}
                    style={{
                      filter: m.abnormal ? "drop-shadow(0 0 6px rgba(255, 77, 77, 0.8))" : "drop-shadow(0 0 6px rgba(72, 255, 140, 0.8))",
                      animation: "pulse 2s infinite",
                    }}
                  />
                  <text
                    y={-18}
                    fontSize={11}
                    fill={m.abnormal ? "#ff9aa0" : "#a7f3d0"}
                    textAnchor="middle"
                    style={{ textShadow: "0 0 10px rgba(0, 255, 255, 0.8)" }}
                  >
                    {m.label}
                  </text>
                </Marker>
              ))}
            </ZoomableGroup>
        </ComposableMap>

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
        overflow: "visible", // 확대 시 캔버스가 부모를 벗어나도 잘리지 않도록
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
          arcColor={(d) => d.color || (/(북한|north korea|중국|china)/i.test(d.label || "") ? ["#ff4d4d", "#b00000"] : ["#89f889", "#4ade80"]) }
          arcDashLength={0.8}
          arcDashGap={0.2}
          arcDashAnimateTime={2000}
          arcStroke={0.5}
          arcAltitude={0.15}

          // 포인트 설정 (기존 마커 + 아크 양끝 원 표시)
          pointsData={pointsWithArcEndpoints}
          pointLat={(m) => m.latitude ?? m.lat ?? 0}
          pointLng={(m) => m.longitude ?? m.lng ?? 0}
          pointLabel="label"
          pointColor={(m) => (m.endpoint ? '#ffffff' : (m.abnormal ? '#ff4d4d' : '#89f889'))}
          pointAltitude={0.01}
          pointRadius={(m) => (m.endpoint ? 0.6 : 0.45)}

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
          background: "linear-gradient(90deg, #a259ff 0%, #6e53de 100%)",
          color: "#fff",
          border: "2px solid #d1b7ff",
          fontWeight: "bold",
          fontSize: "1rem",
          boxShadow: "0 6px 20px rgba(148, 80, 255, 0.25)",
          cursor: "pointer",
          transition: "all 0.3s ease",
          outline: "none",
          textShadow: "0 0 10px rgba(255, 255, 255, 0.8)"
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = "scale(1.05)";
          e.currentTarget.style.background = "linear-gradient(90deg, #c084fc 0%, #a259ff 100%)";
          e.currentTarget.style.boxShadow = "0 10px 24px rgba(148, 80, 255, 0.35)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.background = "linear-gradient(90deg, #a259ff 0%, #6e53de 100%)";
          e.currentTarget.style.boxShadow = "0 6px 20px rgba(148, 80, 255, 0.25)";
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
