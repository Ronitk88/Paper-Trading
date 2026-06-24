import { useState } from "react";

function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmLabel, cancelLabel, isDangerous }) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "16px",
          padding: "28px",
          maxWidth: "440px",
          width: "90%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        {title && (
          <h3
            style={{
              fontSize: "20px",
              fontWeight: "800",
              marginBottom: "12px",
              color: isDangerous ? "#dc2626" : "#111827",
            }}
          >
            {title}
          </h3>
        )}

        <p
          style={{
            color: "#475569",
            fontWeight: "700",
            lineHeight: "1.6",
            marginBottom: "24px",
          }}
        >
          {message}
        </p>

        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
          }}
        >
          <button
            className="secondary-action"
            onClick={onCancel}
            style={{
              padding: "10px 20px",
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              background: "white",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            {cancelLabel || "Cancel"}
          </button>

          <button
            className={isDangerous ? "danger-action" : "primary-action"}
            onClick={onConfirm}
            style={{
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              fontWeight: "700",
              cursor: "pointer",
              background: isDangerous ? "#dc2626" : "#2563eb",
              color: "white",
            }}
          >
            {confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;