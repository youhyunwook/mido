import React from "react";
import InternalNetwork from "./InternalNetwork";
import ExternalNetwork from "./ExternalNetwork";

function Dashboards() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column", // 헤더 + 본문 세로 정렬
      }}
    >
      {/* 🔼 상단 헤더 영역 */}
      <header
        style={{
          background: "#282c34",
          color: "#fff",
          padding: "16px 24px",
        }}
      >
        <h1 style={{ margin: 0 }}>네트워크 통합 대시보드</h1>
      </header>

      {/* 🔽 본문 - 좌우 반분 layout */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row", // 외부망 / 내부망 좌우로 정렬
        }}
      >
        {/* 🌐 외부망 */}
        <section
          style={{
            flex: 1,
            background: "#1e1e2f",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h2 style={{ color: "#fff", paddingLeft: 10, margin: 0 }}>
            🌐 외부망
          </h2>
          <div style={{ flex: 1 }}>
            <ExternalNetwork />
          </div>
        </section>

        {/* 🔐 내부망 */}
        <section
          style={{
            flex: 1,
            background: "#181824",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h2 style={{ color: "#fff", paddingLeft: 10, margin: 0 }}>
            🔐 내부망
          </h2>
          <div style={{ flex: 1 }}>
            <InternalNetwork />
          </div>
        </section>
      </div>
    </div>
  );
}

export default Dashboards;

