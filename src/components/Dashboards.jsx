import React, { useState } from "react";
import ExternalNetwork from "./ExternalNetwork";
import InternalNetwork from "./InternalNetwork";
import DashboardMenu from "./DashboardMenu";
import NetworkTopology from "./network_topology.jsx";
import TestPage from "./TestPage.jsx";
import Cyber3Layer from "./cyber_3layer.jsx";

import "../App.css";

function Dashboards() {
  const [activeView, setActiveView] = useState('Default');
  const [inspectorContent, setInspectorContent] = useState(null);
  const [showTestPage, setShowTestPage] = useState(false);

  const handleMenuSelect = (view) => {
    setActiveView(view);
    setShowTestPage(false); 
    if (view !== '메뉴2' && view !== '메뉴3') {
      setInspectorContent(null);
    }
  };

  const renderActiveView = () => {
    if (showTestPage) {
      return <TestPage />;
    }
    switch (activeView) {
      case '메뉴2':
        return <NetworkTopology onInspectorChange={setInspectorContent} onTestPageRequest={() => setShowTestPage(true)} />;
      case '메뉴3':
        return <Cyber3Layer onNodeSelect={setInspectorContent} />;
      case 'Default':
      default:
        return (
          <>
            <main className="dashboard-main">
              <ExternalNetwork />
            </main>
            <section className="dashboard-sub-overlay">
              <InternalNetwork />
            </section>
          </>
        );
    }
  };

  return (
    <div className="dashboard-layout">
      <DashboardMenu onMenuSelect={handleMenuSelect} />

      <div className="dashboard-main-container">
        {renderActiveView()}
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
        
        {/* Node Info 가여기에 렌더링*/}
        {inspectorContent}
      </section>
    </div>
  );
}

export default Dashboards;
