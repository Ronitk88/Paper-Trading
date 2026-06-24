import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
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
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #fee2e2, #fecaca)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              color: "#dc2626",
              fontWeight: "900",
            }}
          >
            !
          </div>
          <h1 style={{ color: "#0f172a", margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#64748b", maxWidth: "400px", textAlign: "center" }}>
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = "/dashboard";
            }}
            className="primary-action"
            style={{
              padding: "12px 28px",
              border: "none",
              borderRadius: "12px",
              color: "white",
              fontWeight: "800",
              cursor: "pointer",
              fontSize: "15px",
            }}
          >
            Go to Dashboard
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
