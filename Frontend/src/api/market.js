import api from "./api";

export const getLTP = async (
  exchange,
  tradingsymbol,
  symboltoken
) => {
  const res = await api.get("/market/ltp", {
    params: {
      exchange,
      tradingsymbol,
      symboltoken,
    },
  });

  return res.data;
};