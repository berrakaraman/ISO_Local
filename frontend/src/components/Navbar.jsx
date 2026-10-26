import React from "react";

export default function Navbar({
  currentUser,
  activeTab,
  setActiveTab,
  onLogout,
}) {
  const tabs = [
    { key: "yonetimPaneli", label: "📊 Yönetim Paneli" },
    { key: "f01Hammadde", label: "📦 Hammadde Takibi" },
    { key: "f02UretimEmri", label: "📝 Üretim Emirleri" },
    { key: "f03UretimLot", label: "⚙️ Üretim Lotları" },
    { key: "f04KarantinaRed", label: "⚠️ Karantina & Red" },
    { key: "f05KaliteKontrol", label: "🔍 Kalite Kontrol" },
    { key: "f06Sevkiyat", label: "🚚 Sevkiyat İşlemleri" },
    { key: "tanimlar", label: "📖 Sistem Tanımları" },
  ];

  return (
    <header
      style={{
        background: "#ffffff",
        boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.05)",
        borderBottom: "1px solid #e2e8f0",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Üst Bilgi Barı (Header) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "18px 32px",
          borderBottom: "1px solid #f1f5f9",
        }}
      >
        {/* Sol Logo / Başlık */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              color: "#fff",
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "800",
              fontSize: "16px",
              boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
            }}
          >
            ISO
          </div>
          <div>
            <h1
              style={{
                fontSize: "19px",
                fontWeight: "800",
                color: "#0f172a",
                margin: 0,
                letterSpacing: "-0.3px",
              }}
            >
              UNELSİS ELEKTRİK
            </h1>
            <span
              style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}
            >
              Kalite Güvence ve Akıllı Üretim Portalı 🚀
            </span>
          </div>
        </div>

        {/* Sağ Kurumsal Kullanıcı Profili (Sempatik & Dolgun) */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "#f8fafc",
              padding: "8px 16px",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "#2563eb",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "700",
                fontSize: "14px",
                boxShadow: "0 2px 5px rgba(37,99,235,0.2)",
              }}
            >
              {currentUser.name.charAt(0)}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "700",
                  color: "#0f172a",
                }}
              >
                {currentUser.name} ✨
              </span>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#2563eb",
                }}
              >
                {currentUser.role}
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            style={{
              background: "#fef2f2",
              color: "#dc2626",
              border: "1px solid #fecaca",
              padding: "10px 16px",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: "700",
              fontSize: "13px",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onMouseOver={(e) => (e.target.style.background = "#fee2e2")}
            onMouseOut={(e) => (e.target.style.background = "#fef2f2")}
          >
            👋 Güvenli Çıkış
          </button>
        </div>
      </div>

      {/* Modern Sekme Navigasyonu (Daha Dolgun ve Sempatik Butonlar) */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          padding: "14px 32px",
          background: "#f8fafc",
          overflowX: "auto",
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: isActive
                  ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                  : "#ffffff",
                color: isActive ? "#ffffff" : "#334155",
                border: isActive ? "none" : "1px solid #cbd5e1",
                padding: "10px 18px",
                borderRadius: "10px",
                cursor: "pointer",
                fontWeight: "700",
                fontSize: "13px",
                whiteSpace: "nowrap",
                boxShadow: isActive
                  ? "0 4px 12px rgba(37, 99, 235, 0.3)"
                  : "0 1px 3px rgba(0,0,0,0.02)",
                transition: "all 0.2s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
