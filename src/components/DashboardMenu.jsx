import React, { useState } from "react";
import "../App.css";

function DashboardMenu() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside className="dashboard-menu">
      {/* ≡ 버튼 */}
      <button
        className="menu-btn main"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="icon">≡</span>
      </button>

      {/* 드롭다운 메뉴 */}
      {menuOpen && (
        <div className="menu-dropdown">
          <button className="menu-btn">메뉴1</button>
          <button className="menu-btn">메뉴2</button>
          <button className="menu-btn">메뉴3</button>
        </div>
      )}
    </aside>
  );
}

export default DashboardMenu;
