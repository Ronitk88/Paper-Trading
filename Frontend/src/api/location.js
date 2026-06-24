const CACHE_KEY = "paper_trading_country";

export async function detectCountry() {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const res = await fetch("https://ip-api.com/json/?fields=countryCode,country,currency", {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`Geolocation API error: ${res.status}`);

    const data = await res.json();
    const result = {
      code: data.countryCode || "IN",
      name: data.country || "India",
      currency: data.currency || "INR",
    };

    sessionStorage.setItem(CACHE_KEY, JSON.stringify(result));
    return result;
  } catch {
    return { code: "IN", name: "India", currency: "INR" };
  }
}
