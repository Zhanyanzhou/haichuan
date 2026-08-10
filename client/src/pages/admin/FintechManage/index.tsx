export default function FintechManage() {
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
        金融服务规划中
      </p>
      <p
        style={{
          fontSize: 13,
          color: "var(--admin-muted)",
          margin: "8px 0 0 0",
        }}
      >
        供应链金融、保险服务等功能将在后续版本上线
      </p>
    </div>
  );
}
