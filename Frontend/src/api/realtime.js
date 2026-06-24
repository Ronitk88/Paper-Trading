const getConfiguredBase = () => {
  const raw = (
    import.meta.env.VITE_WS_BASE_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "http://127.0.0.1:8000"
  );
  return String(raw).trim().replace(/\/+$/, "");
};

export const buildRealtimeUrl = (path, params = {}) => {
  const rawBase = String(getConfiguredBase()).trim();
  const httpBase = /^wss?:\/\//i.test(rawBase)
    ? rawBase.replace(/^ws/i, "http")
    : rawBase;
  const baseUrl = new URL(httpBase, window.location.origin);
  const basePath = baseUrl.pathname.replace(/\/+$/, "");
  const cleanPath = String(path || "").replace(/^\/+/, "");

  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  baseUrl.pathname = `${basePath}/${cleanPath}`.replace(/\/{2,}/g, "/");
  baseUrl.search = "";

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      baseUrl.searchParams.set(key, String(value));
    }
  });

  return baseUrl.toString();
};

export const getSymbolKey = (exchange, symboltoken) => {
  return `${String(exchange || "").trim().toUpperCase()}:${String(
    symboltoken || ""
  ).trim()}`;
};
