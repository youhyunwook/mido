import React, { useEffect, useRef, useState, useCallback } from "react";
import Globe from "react-globe.gl";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup
} from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import arcsData from "../arcs.js";
const geoUrl = "/2d_world.json";

function ExternalNetwork() {
  const globeRef = useRef();
  const [markers, setMarkers] = useState([]);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  const [show2D, setShow2D] = useState(false);
  const [mapCenter, setMapCenter] = useState([126.37]);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapKey, setMapKey] = useState(0);
  const [lastDblClick, setLastDblClick] = useState(0);

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
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const width = dimensions.width / 2;
  const height = dimensions.height - 72;

  // zoomDistance 기반 2D/3D 자동 전환
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

  const handleGoto3D = () => {
    setShow2D(false);
  };

  // 2D 지도 마커 클릭 시 중심 이동+확대
  const handleMarkerClick = (coordinates) => {
    setMapCenter(coordinates);
    setMapZoom((z) => Math.min(z * 1.5, 10));
    setMapKey((prev) => prev + 1);
  };

  // 국가 더블클릭 시 해당 국가로 zoom in & center 이동 (debounce, 최대 zoom 제한, 버블링 방지)
  const handleCountryDoubleClick = useCallback(
    (geo, event) => {
      event.stopPropagation && event.stopPropagation();
      const now = Date.now();
      if (now - lastDblClick < 400) return;
      setLastDblClick(now);
      const [lng, lat] = geoCentroid(geo);
      setMapCenter([lng, lat]);
      setMapZoom((z) => Math.min(Number(z) * 1.5, 8));
      setMapKey((prev) => prev + 1);
    },
    [lastDblClick]
  );

  // 2D 아크 라인(곡선) 렌더링 (SVG Path 활용)
  function CustomArcs({ arcsData, projection }) {
    return (
      <>
        {arcsData.map((arc, idx) => {
          const [startX, startY] = projection([arc.startLng, arc.startLat]);
          const [endX, endY] = projection([arc.endLng, arc.endLat]);
          // control point를 위로 이동하여 globe 느낌의 곡선 구현
          const curveAmount = -40;
          const cx = (startX + endX) / 2;
          const cy = (startY + endY) / 2 + curveAmount;
          return (
            <path
              key={idx}
              d={`M${startX},${startY} Q${cx},${cy} ${endX},${endY}`}
              stroke={arc.color ? arc.color[0] : "#888"}
              strokeWidth={2}
              fill="none"
              opacity={0.7}
              strokeDasharray="6,2"
            />
          );
        })}
      </>
    );
  }

  if (show2D) {
    return (
      <div style={{ width, height, background: "#181830" }}>
        <button
          onClick={handleGoto3D}
          style={{ position: "absolute", zIndex: '10%', left: "41%", top: "6.6%"}}
        >
          3D Globe로 보기
        </button>
        <ComposableMap
          key={mapKey}
          width={width}
          height={height}
          projection="geoMercator"
          style={{ background: "#252540" }}
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
                      fill="#272744"
                      stroke="#777"
                      onDoubleClick={(e) => handleCountryDoubleClick(geo, e)}
                      style={{
                        default: { outline: "none" },
                        hover: { fill: "#006ca9", outline: "none" }
                      }}
                    />
                  ))}
                  <CustomArcs arcsData={arcsData} projection={projection} />
                </>
              )}
            </Geographies>
            {markers.map((marker) => (
              <Marker
                key={marker.id || marker.label || marker.lng || marker.longitude}
                // 필드명이 longitude/latitude 혹은 lng/lat 모두 대응
                coordinates={[
                  marker.longitude ?? marker.lng,
                  marker.latitude ?? marker.lat
                ]}
                onClick={() =>
                  handleMarkerClick([
                    marker.longitude ?? marker.lng,
                    marker.latitude ?? marker.lat
                  ])
                }
              >
                <circle r={4} fill="#ffd700" stroke="#fff" />
                <text y={-14} fontSize={10} fill="#fff">
                  {marker.label}
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
    <div style={{ width, height }}>
      <Globe
        ref={globeRef}
        width={width}
        height={height}
        arcsData={arcsData}
        arcLabel={d => d.label}
        arcColor={d => d.color}
        arcDashLength={0.4}
        arcDashGap={0.3}
        arcStroke={0.2}
        arcDashAnimateTime={4000}
        pointsData={markers}
        pointLat={markers.length && "latitude" in markers[0] ? "latitude" : "lat"}
        pointLng={markers.length && "longitude" in markers[0] ? "longitude" : "lng"}
        pointLabel="label"
        pointColor={() => "#FF5533"}
        pointAltitude={0.02}
        globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
      />
      <button
        onClick={() => setShow2D(true)}
        style={{ position: "absolute", zIndex: '10%', left: "44%", top: "6.6%"}}
      >
        2D로 보기
      </button>
    </div>
  );
}

export default ExternalNetwork;