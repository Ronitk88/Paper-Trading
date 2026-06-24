import { useNavigate } from "react-router-dom";

function NotFound() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f8fafc, #eef4ff)",
        padding: "40px",
        gap: "12px",
      }}
    >
      <div
        style={{
          fontSize: "64px",
          fontWeight: "900",
          background: "linear-gradient(135deg, #2563eb, #4f46e5)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          lineHeight: 1,
        }}
      >
        404
      </div>
      <h1 style={{ color: "#0f172a", margin: 0 }}>Page Not Found</h1>
      <p style={{ color: "#64748b", textAlign: "center", maxWidth: "380px" }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <button
        onClick={() => navigate("/dashboard")}
        className="primary-action"
        style={{
          padding: "12px 28px",
          border: "none",
          borderRadius: "12px",
          color: "white",
          fontWeight: "800",
          cursor: "pointer",
          fontSize: "15px",
          marginTop: "8px",
        }}
      >
        Go to Dashboard
      </button>
    </div>
  );
}

export default NotFound;
