import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import API from "../api/api";

function Login() {
  const [mode, setMode] = useState("login");
  const [loginMethod, setLoginMethod] = useState("email");

  const [username, setUsername] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isEmail = loginMethod === "email";
  const isPhone = loginMethod === "phone";

  const formatName = (name) => {
    if (!name) return "Trader";

    return name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const saveLoginSession = (response) => {
    const displayName = formatName(
      response.data.user?.username ||
        response.data.user?.email?.split("@")[0] ||
        "Trader"
    );

    sessionStorage.setItem("token", response.data.access_token);
    sessionStorage.setItem("username", displayName);
    sessionStorage.setItem("email", response.data.user?.email || "");
    sessionStorage.setItem("phone", response.data.user?.phone || "");

    localStorage.removeItem("token");
    localStorage.setItem("username", displayName);
    localStorage.setItem("email", response.data.user?.email || "");
    localStorage.setItem("phone", response.data.user?.phone || "");

    window.location.href = "/dashboard";
  };

  const resetOtpState = () => {
    setOtpCode("");
    setOtpSent(false);
    setOtpVerified(false);
  };

  const resetForm = () => {
    setUsername("");
    setIdentifier("");
    setPassword("");
    resetOtpState();
  };

  const switchToLogin = () => {
    setMode("login");
    resetForm();
  };

  const switchToRegister = () => {
    setMode("register");
    resetForm();
  };

  const handleIdentifierChange = (value) => {
    setIdentifier(value);

    if (isRegister) {
      resetOtpState();
    }
  };

  const openForgotPassword = () => {
    setForgotEmail(isEmail ? identifier : "");
    setForgotOpen(true);
  };

  const sendOtp = async () => {
    try {
      if (!identifier.trim()) {
        alert(
          isEmail
            ? "Please enter your email first."
            : "Please enter your phone number first."
        );
        return;
      }

      setOtpLoading(true);

      if (isEmail) {
        await API.post("/email/send-otp", {
          email: identifier.trim(),
          purpose: "AUTH",
        });
      } else {
        await API.post("/phone/send-otp", {
          phone: identifier.trim(),
        });
      }

      setOtpSent(true);
      setOtpVerified(false);
      setOtpCode("");

      alert(
        isEmail
          ? "OTP sent successfully. Please check your email inbox."
          : "OTP sent successfully. Please check your phone."
      );
    } catch (error) {
      console.error("Send OTP failed:", error);
      alert(error?.response?.data?.detail || "Unable to send OTP.");
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    try {
      if (!identifier.trim()) {
        alert(
          isEmail
            ? "Please enter your email first."
            : "Please enter your phone number first."
        );
        return;
      }

      if (!otpCode.trim()) {
        alert("Please enter the OTP.");
        return;
      }

      setOtpLoading(true);

      let res;

      if (isEmail) {
        res = await API.post("/email/verify-otp", {
          email: identifier.trim(),
          otp_code: otpCode.trim(),
          purpose: "AUTH",
        });
      } else {
        res = await API.post("/phone/verify-otp", {
          phone: identifier.trim(),
          otp_code: otpCode.trim(),
        });
      }

      if (res.data?.verified) {
        setOtpVerified(true);

        alert(
          isEmail
            ? "Email OTP verified successfully."
            : "Phone OTP verified successfully."
        );
      } else {
        alert("OTP verification failed.");
      }
    } catch (error) {
      console.error("Verify OTP failed:", error);
      setOtpVerified(false);
      alert(error?.response?.data?.detail || "Invalid or expired OTP.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username.trim()) {
      alert("Username is required");
      return;
    }

    if (!identifier.trim()) {
      alert(isEmail ? "Email is required" : "Phone number is required");
      return;
    }

    if (!otpVerified) {
      alert(
        isEmail
          ? "Please verify your email OTP before creating account."
          : "Please verify your phone OTP before creating account."
      );
      return;
    }

    if (!password.trim()) {
      alert("Password is required");
      return;
    }

    if (password.length < 6) {
      alert("Password should be at least 6 characters");
      return;
    }

    const payload = {
      username: username.trim(),
      password,
      email: isEmail ? identifier.trim() : null,
      phone: isPhone ? identifier.trim() : null,
    };

    await API.post("/auth/register", payload);

    alert("Account created successfully. Please login now.");

    resetForm();
    setMode("login");
  };

  const handleLogin = async () => {
    if (!identifier.trim()) {
      alert(isEmail ? "Email is required" : "Phone number is required");
      return;
    }

    if (!password.trim()) {
      alert("Password is required");
      return;
    }

    const response = await API.post("/auth/login", {
      identifier: identifier.trim(),
      password,
    });

    saveLoginSession(response);
  };

  const handleForgotPassword = async () => {
    try {
      if (!forgotEmail.trim()) {
        alert("Please enter your registered email.");
        return;
      }

      setForgotLoading(true);

      const res = await API.post("/auth/forgot-password", {
        email: forgotEmail.trim(),
      });

      alert(
        res.data?.message ||
          "If this email is registered, a password reset link has been sent."
      );

      setForgotOpen(false);
      setForgotEmail("");
    } catch (error) {
      console.error("Forgot password failed:", error);
      alert(error?.response?.data?.detail || "Unable to send reset link.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleGoogleLogin = async (credentialResponse) => {
    try {
      if (!credentialResponse?.credential) {
        alert("Google login credential not received.");
        return;
      }

      setGoogleLoading(true);

      const response = await API.post("/auth/google", {
        credential: credentialResponse.credential,
      });

      alert("Google login successful.");
      saveLoginSession(response);
    } catch (error) {
      console.error("Google login failed:", error);
      alert(error?.response?.data?.detail || "Google login failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleError = () => {
    alert("Google login was cancelled or failed.");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      if (isLogin) {
        await handleLogin();
      } else {
        await handleRegister();
      }
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-pro-page">
      <div className="login-bg-orb orb-one" />
      <div className="login-bg-orb orb-two" />
      <div className="login-bg-grid" />

      {/* Floating particles */}
      <div className="login-particles">
        {[...Array(18)].map((_, i) => (
          <div
            key={i}
            className="login-particle"
            style={{
              left: `${5 + Math.random() * 90}%`,
              '--duration': `${12 + Math.random() * 18}s`,
              '--delay': `${Math.random() * 12}s`,
              '--drift': `${-30 + Math.random() * 60}px`,
            }}
          />
        ))}
      </div>

      <div className="login-pro-left">
        <div className="login-badge">📈 Professional Paper Trading Platform</div>

        <h1>Trade smarter with virtual capital before risking real money.</h1>

        <p>
          Practice strategies, study live-style markets, verify accounts during
          signup, place simulated trades, and track your complete performance in
          one premium paper trading workspace.
        </p>

        <div className="login-market-card">
          <div>
            <span>NIFTY 50</span>
            <strong>Live-style market tracking</strong>
          </div>

          <div>
            <span>Virtual Capital</span>
            <strong>₹10,00,000</strong>
          </div>
        </div>

        <div className="login-feature-grid">
          <div>
            <strong>Advanced Charts</strong>
            <span>OHLC candles with historical data.</span>
          </div>

          <div>
            <strong>Order Book</strong>
            <span>Market, limit, pending and rejected orders.</span>
          </div>
        </div>
      </div>

      <div className="login-pro-card">
        <div className="login-card-header">
          <span>Secure Access</span>

          <h2>{isLogin ? "Welcome back" : "Create your account"}</h2>

          <p>
            {isLogin
              ? "Login with Google or your email/phone and password. OTP is not required for login."
              : "Register using Google, verified email OTP, or verified phone OTP."}
          </p>
        </div>

        <div className="login-switch">
          <button
            type="button"
            className={isLogin ? "active" : ""}
            onClick={switchToLogin}
          >
            Login
          </button>

          <button
            type="button"
            className={isRegister ? "active" : ""}
            onClick={switchToRegister}
          >
            Register
          </button>
        </div>

        <div className="google-login-box">
          <p>{isLogin ? "Login with Google" : "Register with Google"}</p>

          <div
            style={{
              opacity: googleLoading ? 0.6 : 1,
              pointerEvents: googleLoading ? "none" : "auto",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <GoogleLogin
              onSuccess={handleGoogleLogin}
              onError={handleGoogleError}
              text={isLogin ? "signin_with" : "signup_with"}
              shape="pill"
              size="large"
              width="360"
            />
          </div>
        </div>

        <div className="login-divider">
          <span>
            {isLogin
              ? "or continue with password"
              : `or continue with ${isEmail ? "email OTP" : "phone OTP"}`}
          </span>
        </div>

        <div className="login-method-grid">
          <button
            type="button"
            className={isEmail ? "active" : ""}
            onClick={() => {
              setLoginMethod("email");
              setIdentifier("");
              resetOtpState();
            }}
          >
            Email
          </button>

          <button
            type="button"
            className={isPhone ? "active" : ""}
            onClick={() => {
              setLoginMethod("phone");
              setIdentifier("");
              resetOtpState();
            }}
          >
            Phone
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <label className="login-label">Username</label>

              <input
                className="login-input"
                type="text"
                placeholder="Enter username"
                value={username}
                required={isRegister}
                onChange={(e) => setUsername(e.target.value)}
              />
            </>
          )}

          <label className="login-label">
            {isEmail ? "Email Address" : "Phone Number"}
          </label>

          <input
            className="login-input"
            type={isEmail ? "email" : "tel"}
            placeholder={
              isEmail ? "Enter your email" : "Enter phone, e.g. +91XXXXXXXXXX"
            }
            value={identifier}
            required
            onChange={(e) => handleIdentifierChange(e.target.value)}
          />

          {isRegister && (
            <div className={otpVerified ? "otp-box verified" : "otp-box"}>
              <div className="otp-header">
                <div>
                  <strong>
                    {isEmail
                      ? "Email OTP Verification"
                      : "Phone OTP Verification"}
                  </strong>

                  <p>
                    {otpVerified
                      ? `${isEmail ? "Email" : "Phone"} verified successfully.`
                      : otpSent
                      ? "OTP sent. Enter the 6-digit code."
                      : `Send OTP to verify this ${
                          isEmail ? "email" : "phone number"
                        } before creating account.`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={otpLoading || otpVerified}
                >
                  {otpVerified
                    ? "Verified"
                    : otpLoading
                    ? "Sending..."
                    : "Send OTP"}
                </button>
              </div>

              {otpSent && !otpVerified && (
                <div className="otp-input-row">
                  <input
                    type="text"
                    placeholder="Enter OTP"
                    value={otpCode}
                    maxLength="6"
                    onChange={(e) => setOtpCode(e.target.value)}
                  />

                  <button
                    type="button"
                    onClick={verifyOtp}
                    disabled={otpLoading}
                  >
                    {otpLoading ? "Checking..." : "Verify"}
                  </button>
                </div>
              )}
            </div>
          )}

          <label className="login-label">Password</label>

          <input
            className="login-input"
            type="password"
            placeholder={isLogin ? "Enter your password" : "Create password"}
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
          />

          {isLogin && (
            <button
              type="button"
              className="login-forgot-link"
              onClick={openForgotPassword}
            >
              Forgot password?
            </button>
          )}

          <button type="submit" disabled={loading} className="login-main-btn">
            {loading
              ? isLogin
                ? "Logging in..."
                : "Creating account..."
              : isLogin
              ? "Login"
              : "Create Account"}
          </button>
        </form>

        <div className="login-risk-note">
          <strong>Paper trading only.</strong> All trades are simulated. No real
          money is used or transferred.
        </div>
      </div>

      {forgotOpen && (
        <div className="modal-backdrop">
          <div className="professional-modal">
            <div className="modal-header">
              <div>
                <h2>Reset Password</h2>
                <p>
                  Enter your registered email. We will send a secure password
                  reset link.
                </p>
              </div>

              <button
                className="modal-close"
                type="button"
                onClick={() => setForgotOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <label className="login-label">Registered Email</label>

              <input
                className="login-input"
                type="email"
                placeholder="Enter registered email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
              />

              <p style={{ color: "#64748b", lineHeight: "1.7", margin: 0 }}>
                The reset link will be valid for 30 minutes. If you do not see
                the email, check your spam folder.
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="warning-action"
                onClick={() => setForgotOpen(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-action"
                onClick={handleForgotPassword}
                disabled={forgotLoading}
              >
                {forgotLoading ? "Sending..." : "Send Reset Link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;