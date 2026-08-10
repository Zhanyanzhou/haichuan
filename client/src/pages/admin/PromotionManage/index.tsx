export default function PromotionManage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 320,
      }}
    >
      <p
        style={{
          fontSize: 15,
          fontWeight: 500,
          color: "var(--admin-ink)",
          margin: 0,
        }}
      >
        推广功能规划中
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--admin-muted)",
          margin: "8px 0 0 0",
        }}
      >
        渠道管理、广告投放、流量分析等功能将在后续版本上线
      </p>
    </div>
  );
}
