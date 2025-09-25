import React, { useState } from "react";
import "../App.css";

function DashboardMenu({ onMenuSelect }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuClick = (view) => {
    onMenuSelect(view);
    setMenuOpen(false); // 메뉴 선택 후 닫기
  };

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
          <button className="menu-btn" onClick={() => handleMenuClick('Default')}>메뉴1</button>
          <button className="menu-btn" onClick={() => handleMenuClick('메뉴2')}>메뉴2</button>
          <button className="menu-btn" onClick={() => handleMenuClick('메뉴3')}>메뉴3</button>
        </div>
      )}
    </aside>
  );
}

export default DashboardMenu;
