import React from "react";
import ExternalNetwork from "./ExternalNetwork";
import InternalNetwork from "./InternalNetwork";
import DashboardMenu from "./DashboardMenu";
import "../App.css";

function Dashboards() {
  return (
    <div className="dashboard-layout">
      {/* 왼쪽: 메인 메뉴 토글 컴포넌트 */}
      <DashboardMenu />

      {/* 중앙: 메인+서브 겹치는 컨테이너 */}
      <div className="dashboard-main-container">
        <main className="dashboard-main">
          <ExternalNetwork />
        </main>
        <section className="dashboard-sub-overlay">
          <InternalNetwork />
        </section>
      </div>

      {/* 오른쪽: 로그 영역 */}
      <section className="dashboard-log">
        <div style={{ fontWeight: "bold", marginBottom: "12px" }}>이벤트 로그</div>

        {/* ✅ 정상 패킷 로그 */}
        <div className="packet-log normal">
          <div>[정상] 2025-07-18 14:55:12</div>
          <div>
            192.168.1.21:53412 → 10.0.0.15:80 (TCP)<br />
            패킷 정상 흐름 감지.
          </div>
        </div>

        {/* ✅ 이상 패킷 로그 */}
        <div className="packet-log abnormal">
          <div>[이상] 2025-07-22 14:55:23</div>
          <div>
            192.168.1.21:46211 → 123.123.222.1:3389 (TCP)<br />
            포트스캔 의심 트래픽 탐지!
          </div>
        </div>
      </section>
    </div>
  );
}

export default Dashboards;
