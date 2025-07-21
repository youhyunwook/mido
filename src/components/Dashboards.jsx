import React from "react";
import ExternalNetwork from "./ExternalNetwork";
import InternalNetwork from "./InternalNetwork";
import "../App.css";

function Dashboards() {
  return (
    <div className="dashboard-layout">
      {/* 왼쪽: 메인 메뉴 */}
      <aside className="dashboard-menu">
        <button>≡</button>
        <button>메뉴2</button>
        <button>메뉴3</button>
      </aside>

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
        <div>이벤트 로그</div>
        {/* 로그 내용 */}
      </section>
    </div>
  );
}

export default Dashboards;
