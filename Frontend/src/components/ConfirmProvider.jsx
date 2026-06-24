import { createContext, useCallback, useContext, useState } from "react";

const ConfirmContext = createContext(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);

  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }

  return ctx;
}

function ConfirmProvider({ children }) {
  const [state, setState] = useState({
    isOpen: false,
    title: "",
    message: "",
    resolve: null,
    isDangerous: false,
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
  });

  const showConfirm = useCallback(
    (message, options = {}) => {
      return new Promise((resolve) => {
        setState({
          isOpen: true,
          title: options.title || "Confirm",
          message,
          resolve,
          isDangerous: options.isDangerous ?? false,
          confirmLabel: options.confirmLabel || "Confirm",
          cancelLabel: options.cancelLabel || "Cancel",
        });
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (state.resolve) {
      state.resolve(true);
    }

    setState((prev) => ({ ...prev, isOpen: false }));
  }, [state]);

  const handleCancel = useCallback(() => {
    if (state.resolve) {
      state.resolve(false);
    }

    setState((prev) => ({ ...prev, isOpen: false }));
  }, [state]);

  return (
    <ConfirmContext.Provider value={{ showConfirm }}>
      {children}

      {state.isOpen && (
        <div
          className="modal-overlay"
          onClick={handleCancel}
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
            {state.title && (
              <h3
                style={{
                  fontSize: "20px",
                  fontWeight: "800",
                  marginBottom: "12px",
                  color: state.isDangerous ? "#dc2626" : "#111827",
                }}
              >
                {state.title}
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
              {state.message}
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
                onClick={handleCancel}
                style={{
                  padding: "10px 20px",
                  borderRadius: "10px",
                  border: "1px solid #d1d5db",
                  background: "white",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                {state.cancelLabel}
              </button>

              <button
                className={state.isDangerous ? "danger-action" : "primary-action"}
                onClick={handleConfirm}
                style={{
                  padding: "10px 20px",
                  borderRadius: "10px",
                  border: "none",
                  fontWeight: "700",
                  cursor: "pointer",
                  background: state.isDangerous ? "#dc2626" : "#2563eb",
                  color: "white",
                }}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export default ConfirmProvider;