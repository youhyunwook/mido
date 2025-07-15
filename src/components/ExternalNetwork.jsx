import React, { useEffect, useState } from "react";
import Globe from "react-globe.gl";

function ExternalNetwork() {
  const [markers, setMarkers] = useState([]);

  useEffect(() => {
    // 실제 백엔드 API 주소로 교체하세요
    fetch("http://localhost:8000/neo4j/nodes")
      .then((res) => res.json())
      .then((data) => {
        setMarkers(data); // 서버에서 반환하는 [{id, city, lat, lng, label}] 배열
      })
      .catch((error) => {
        console.error("마커 데이터 불러오기 실패:", error);
      });
  }, []);

  const handleMarkerClick = (marker) => {
    alert(marker.city ? `${marker.city}!` : marker.id);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#021027" }}>
      <Globe
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        backgroundColor="#8ba9d8ff"
        showAtmosphere={true}
        htmlElementsData={markers}
        htmlElement={(marker) => (
          <div
            style={{
              color: "red",
              fontSize: "2rem",
              cursor: "pointer",
              fontWeight: "bold"
            }}
            onClick={() => handleMarkerClick(marker)}
            title={marker.city}
          >
            {marker.label}
          </div>
        )}
      />
    </div>
  );
}

export default ExternalNetwork;
