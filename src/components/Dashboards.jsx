import React from "react";
import ExternalNetwork from "./ExternalNetwork";
import InternalNetwork from "./InternalNetwork";
import "../App.css";

function Dashboards() {
  return (
    <div className="dashboard-root">
      {/* 사이드 메뉴 */}
      <div className="dashboard-sidebar">
        <div className="menu-btn">☰ 메뉴</div>
      </div>

      {/* 대시보드 본문 */}
      <div className="dashboard-main">
        {/* 외부망 */}
        <section className="external-section">
          <header className="section-header">외부망</header>
          <div className="network-panel">
            <ExternalNetwork />
          </div>
        </section>
        {/* 내부망 */}
        <section className="internal-section">
          <header className="section-header">내부망</header>
          <div className="network-panel">
            <InternalNetwork />
          </div>
        </section>
        {/* 로그 패널 */}
        <aside className="log-panel">
          <h2>이벤트 로그</h2>
          <div className="log-content">
            <ul>
              <li>로그가 여기에 표시됩니다.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Dashboards;
