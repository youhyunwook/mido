import React from "react";
import InternalNetwork from "./InternalNetwork";
import ExternalNetwork from "./ExternalNetwork"; // ✅ 외부망 불러오기
// 1
function Dashboards() {
  return (
    <div
      className="dashboard-container"
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* 상단 헤더 */}
      <header
        style={{
          background: "#282c34",
          color: "#fff",
          padding: "16px 24px"
        }}
      >
        <h1 style={{ margin: 0 }}>네트워크 통합 대시보드</h1>
      </header>

      {/* 본문 - 사이드바 + 두 네트워크 */}
      <div style={{ flex: 0.5, display: "flex" }}>
        {/* 좌측 정보 패널 */}
        <aside
          style={{
            width: 220,
            background: "#222",
            color: "#fff",
            padding: "16px"
          }}
        >
          <h3>🧩 현황</h3>
          <div style={{ marginBottom: 10 }}>총 노드 수: 60</div>
          <div>알림 수: 0</div>
          <div>비정상 활동: 없음</div>
        </aside>

        {/* 중앙: 외부망 */}
        <section style={{ flex: 0.5, background: "#1e1e2f" }}>
          <h2 style={{ color: "#fff", paddingLeft: 10 }}>🌐 외부망</h2>
          <div style={{ width: "100%", height: "90%" }}>
            <ExternalNetwork />
          </div>
        </section>

        {/* 우측: 내부망 */}
        <section style={{ flex: 1, background: "#181824" }}>
          <h2 style={{ color: "#fff", paddingLeft: 10 }}>🔐 내부망</h2>
          <div style={{ width: "100%", height: "90%" }}>
            <InternalNetwork />
          </div>
        </section>
      </div>
    </div>
  );
}

export default Dashboards;
