import React from "react";

export function TableWrapper({ title, children }) {
  return (
    <div>
      <div
        style={{
          background: "#1e293b",
          color: "#fff",
          padding: "16px 24px",
          fontSize: "16px",
          fontWeight: "bold",
        }}
      >
        {title}
      </div>
      <div style={{ overflowX: "auto" }}>{children}</div>
    </div>
  );
}

export const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  textAlign: "left",
};
export const thRowStyle = {
  background: "#f1f5f9",
  borderBottom: "2px solid #cbd5e1",
};
export const thStyle = {
  padding: "12px 16px",
  fontSize: "12px",
  fontWeight: "700",
  color: "#334155",
  textTransform: "uppercase",
};
export const trStyle = { borderBottom: "1px solid #e2e8f0" };
export const tdStyle = {
  padding: "12px 16px",
  fontSize: "13px",
  color: "#0f172a",
};
export const deleteBtnStyle = {
  background: "#fee2e2",
  color: "#dc2626",
  border: "none",
  padding: "6px 12px",
  borderRadius: "4px",
  cursor: "pointer",
  fontWeight: "bold",
  fontSize: "12px",
};

export const badgeStyle = (status) => {
  const isOk = [
    "Açık",
    "Uygun",
    "Planlandı",
    "Serbest Bırakıldı",
    "Kabul",
  ].includes(status);
  return {
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "bold",
    background: isOk ? "#dcfce7" : "#fee2e2",
    color: isOk ? "#16a34a" : "#dc2626",
  };
};
