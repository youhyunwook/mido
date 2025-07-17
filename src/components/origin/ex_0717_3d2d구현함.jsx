import React, { useEffect, useRef, useState } from "react";
import Globe from "react-globe.gl";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
// geoCentroid import 삭제

const geoUrl = "/2d_world.json";

function ExternalNetwork() {
  const globeRef = useRef();
  const [markers, setMarkers] = useState([]);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [show2D, setShow2D] = useState(false);
  const [mapCenter, setMapCenter] = useState([0, 20]);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapKey, setMapKey] = useState(0);

  // A↔B 데이터 송수신 아크 예시 (서울-도쿄)
  const arcsData = [
    {
      startLat: 37.567,
      startLng: 126.978,
      endLat: 35.689,
      endLng: 139.691,
      color: ["#00ffae", "#ff0066"],
      label: "서울→도쿄 데이터 송신"
    },
    {
      startLat: 35.689,
      startLng: 139.691,
      endLat: 37.567,
      endLng: 126.978,
      color: ["#ff0066", "#00ffae"],
      label: "도쿄→서울 데이터 응답"
    }
  ];

  // 마커 데이터 fetch
  useEffect(() => {
    fetch("http://localhost:8000/neo4j/nodes")
      .then((res) => res.json())
      .then((data) => setMarkers(data))
      .catch((error) => {
        console.error("마커 데이터 불러오기 실패:", error);
      });
  }, []);

  // 창 크기 반영
  useEffect(() => {
    const handleResize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const width = dimensions.width / 2;
  const height = dimensions.height - 72;

  // zoomDistance 기반 2D/3D 반복 자동 전환
  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    function checkZoom() {
      const zoomDistance = controls.object.position.length();
      if (zoomDistance < 110 && !show2D) {
        setShow2D(true);
      }
    }
    controls.addEventListener("change", checkZoom);
    return () => controls.removeEventListener("change", checkZoom);
  }, [globeRef, show2D]);

  // 3D 복귀 시 2D 초기화
  useEffect(() => {
    if (!show2D) {
      setMapCenter([0, 20]);
      setMapZoom(1);
      setMapKey((prev) => prev + 1);
      if (globeRef.current) {
        globeRef.current.pointOfView({ altitude: 2 }, 1000);
      }
    }
  }, [show2D]);

  // 3D로 복귀(버튼)
  const handleGoto3D = () => {
    setShow2D(false);
  };

  // 2D 지도 마커 클릭 시 중심 이동+확대
  const handleMarkerClick = (coordinates) => {
    setMapCenter(coordinates);
    setMapZoom((z) => Math.min(z * 1.5, 10));
    setMapKey((prev) => prev + 1);
  };

  // 국가 더블클릭 시 해당 국가로 zoom in & center 이동
  const handleCountryDoubleClick = (geo) => {
    // d3-geo 패키지의 geoCentroid 함수는 이 함수 내에서 import 처리 (코드 중복방지)
    // 패키지 import 구문은 함수 내부용 동적 import로 대체  
    import("d3-geo").then(({ geoCentroid }) => {
      const [lng, lat] = geoCentroid(geo); // 국가 중심좌표 계산 ([경도, 위도])
      setMapCenter([lng, lat]);
      setMapZoom(z => Math.min(z * 1.5, 10));
      setMapKey(prev => prev + 1);
    });
  };

  if (show2D) {
    return (
      <div style={{ width, height, background: "#fff" }}>
        <ComposableMap
          key={mapKey}
          projection="geoMercator"
          width={width}
          height={height}
        >
          <ZoomableGroup
            center={mapCenter}
            zoom={mapZoom}
            onMoveEnd={({ center, zoom }) => {
              setMapCenter(center);
              setMapZoom(zoom);
            }}
          >
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    stroke="#B0BFC6"
                    strokeWidth={0.7}
                    style={{
                      default: { fill: "#D6F0FA", stroke: "#000000ff" },
                      hover: { fill: "#4EA7C4", stroke: "#000000ff" },
                      pressed: { fill: "#0E7FCB", stroke: "#000000ff"}
                    }}
                    onDoubleClick={() => handleCountryDoubleClick(geo)}
                  />
                ))
              }
            </Geographies>
            {markers.map((marker, i) => (
              <Marker
                key={i}
                coordinates={[marker.longitude, marker.latitude]}
                onClick={() =>
                  handleMarkerClick([marker.longitude, marker.latitude])
                }
              >
                <circle r={4} fill="#F53" />
                <text textAnchor="middle" y={-10} style={{ fontSize: 10 }}>
                  {marker.label}
                </text>
              </Marker>
            ))}
          </ZoomableGroup>
        </ComposableMap>
        <button onClick={handleGoto3D}>3D Globe로 보기</button>
      </div>
    );
  }

  // 3D Globe (아크 시각화 포함)
  return (
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      arcsData={arcsData}
      arcStartLat="startLat"
      arcStartLng="startLng"
      arcEndLat="endLat"
      arcEndLng="endLng"
      arcColor="color"
      arcDashLength={0.4}
      arcDashGap={0.1}
      arcDashAnimateTime={1200}
      arcLabel="label"
      pointsData={markers}
      pointLat="latitude"
      pointLng="longitude"
      pointLabel="label"
      pointColor={() => "#FF5533"}
      pointAltitude={0.02}
      globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
    />
  );
}

export default ExternalNetwork;
