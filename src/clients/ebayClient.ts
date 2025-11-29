import axios from "axios";

export async function searchEbay(query: string) {
  const EBAY_TOKEN = process.env.EBAY_OAUTH_TOKEN;

  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=20`;

  try {
    const response = await axios.get(url, {
      headers: {
        "Authorization": `Bearer ${EBAY_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    return response.data;
  } catch (error:any) {
    console.error("eBay API error:", error.response?.data || error.message);
    throw new Error("Failed to fetch eBay products.");
  }
}
