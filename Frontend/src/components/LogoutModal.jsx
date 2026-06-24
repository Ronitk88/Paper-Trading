function LogoutModal({ open, onClose, onLogoutNow, onStayLoggedIn }) {
  if (!open) return null;

  const now = new Date();
  const defaultUntil = new Date(now.getTime() + 60 * 60 * 1000);

  const formatInputDate = (date) => {
    const pad = (value) => String(value).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const handleStayLoggedIn = () => {
    const input = document.getElementById("logout-until-time");
    const selectedTime = input?.value;

    if (!selectedTime) {
      alert("Please select logout time.");
      return;
    }

    const selectedTimestamp = new Date(selectedTime).getTime();

    if (selectedTimestamp <= Date.now()) {
      alert("Please select a future time.");
      return;
    }

    onStayLoggedIn(selectedTimestamp);
  };

  return (
    <div className="modal-backdrop">
      <div className="professional-modal">
        <div className="modal-header">
          <div>
            <h2>Logout Confirmation</h2>
            <p>
              Choose whether you want to logout now or stay logged in until a
              specific time.
            </p>
          </div>

          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="info-row">
            <span className="info-label">Current Time</span>
            <span className="info-value">
              {now.toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </span>
          </div>

          <label style={labelStyle}>Stay logged in until</label>

          <input
            id="logout-until-time"
            type="datetime-local"
            defaultValue={formatInputDate(defaultUntil)}
            style={inputStyle}
          />

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e5e7eb",
              borderRadius: "14px",
              padding: "14px",
              color: "#475569",
              lineHeight: "1.6",
              fontWeight: "700",
              marginTop: "14px",
            }}
          >
            If you choose to stay logged in, the session will automatically
            expire after the selected time.
          </div>
        </div>

        <div className="modal-actions">
          <button className="danger-action" onClick={onLogoutNow}>
            Logout Now
          </button>

          <button className="primary-action" onClick={handleStayLoggedIn}>
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontWeight: "800",
  color: "#334155",
  marginBottom: "8px",
};

const inputStyle = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: "15px",
};

export default LogoutModal;