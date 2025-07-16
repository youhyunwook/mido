import React, { useEffect, useState } from "react";
import Globe from "react-globe.gl";

function ExternalNetwork() {
  const [markers, setMarkers] = useState([]);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    // 마커 데이터 불러오기
    fetch("http://localhost:8000/neo4j/nodes")
      .then((res) => res.json())
      .then((data) => {
        setMarkers(data);
      })
      .catch((error) => {
        console.error("마커 데이터 불러오기 실패:", error);
      });
  }, []);

  useEffect(() => {
    // 브라우저 창 크기 변경 감지
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 레이아웃 상 외부망이 화면 절반을 차지한다고 가정
  const width = dimensions.width / 2;
  const height = dimensions.height - 72; // 예: 헤더 높이 차감

  // ✅ 기본 렌더
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Globe
        width={width}
        height={height}
        globeImageUrl="/globe_image.jpg"
        pointsData={markers}
        pointLabel="label"
        pointLat="lat"
        pointLng="lng"
        pointColor={() => "orange"}
        onPointClick={handleMarkerClick}
      />
    </div>
  );

  function handleMarkerClick(marker) {
    alert(marker.city ? `${marker.city}!` : marker.id);
  }
}

export default ExternalNetwork;
