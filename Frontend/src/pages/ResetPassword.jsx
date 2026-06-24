import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import API from "../api/api";

function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async (e) => {
    e.preventDefault();

    try {
      if (!token) {
        alert("Reset token is missing. Please use the latest email reset link.");
        return;
      }

      if (!newPassword.trim()) {
        alert("Please enter new password.");
        return;
      }

      if (newPassword.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
      }

      if (newPassword !== confirmPassword) {
        alert("Passwords do not match.");
        return;
      }

      setLoading(true);

      const res = await API.post("/auth/reset-password", {
        token,
        new_password: newPassword,
      });

      alert(
        res.data?.message ||
          "Password reset successfully. Please login with your new password."
      );

      navigate("/");
    } catch (error) {
      console.error("Password reset failed:", error);
      alert(error?.response?.data?.detail || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-pro-page">
      <div className="login-bg-orb orb-one" />
      <div className="login-bg-orb orb-two" />
      <div className="login-bg-grid" />

      <div className="login-pro-left">
        <div className="login-badge">🔐 Secure Password Reset</div>

        <h1>Set a new password for your paper trading account.</h1>

        <p>
          Enter a strong new password. After reset, you can login using your
          email or phone number with the updated password.
        </p>

        <div className="login-market-card">
          <div>
            <span>Security</span>
            <strong>30-minute reset link</strong>
          </div>

          <div>
            <span>Account Access</span>
            <strong>Password protected</strong>
          </div>
        </div>
      </div>

      <div
        className="login-pro-card"
        style={{
          maxHeight: "none",
          overflowY: "visible",
        }}
      >
        <div className="login-card-header">
          <span>Password Recovery</span>

          <h2>Reset Password</h2>

          <p>
            Create a new password for your account. This reset link can be used
            only once.
          </p>
        </div>

        {!token ? (
          <div className="login-risk-note">
            <strong>Invalid reset link.</strong> Please request a new password
            reset link from the login page.
          </div>
        ) : (
          <form onSubmit={handleResetPassword}>
            <label className="login-label">New Password</label>

            <input
              className="login-input"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />

            <label className="login-label">Confirm Password</label>

            <input
              className="login-input"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="login-main-btn"
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => navigate("/")}
          style={{
            width: "100%",
            marginTop: "16px",
            padding: "13px",
            borderRadius: "14px",
            border: "1px solid #d1d5db",
            background: "#f8fafc",
            color: "#334155",
            fontWeight: "900",
            cursor: "pointer",
          }}
        >
          Back to Login
        </button>

        <div className="login-risk-note">
          <strong>Security note:</strong> If you did not request this password
          reset, ignore the email and your password will remain unchanged.
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;