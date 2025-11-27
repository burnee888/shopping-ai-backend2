import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import OpenAI from "openai";

dotenv.config();

// ---------- Helper functions ----------
function addAmazonAffiliate(rawUrl: string) {
  const tag = process.env.AMAZON_TAG;
  if (!tag || typeof rawUrl !== "string") return rawUrl;

  const separator = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${separator}tag=${tag}`;
}

function addEbayAffiliate(rawUrl: string) {
  const campid = process.env.EPN_CAMPAIGN_ID;
  const customId = process.env.EPN_CUSTOM_ID;

  if (!campid) return rawUrl; // simple safety

  const separator = rawUrl.includes("?") ? "&" : "?";
  return `${rawUrl}${separator}campid=${campid}&customid=${customId}&mkcid=1&mkrid=711-53200-19255-0`;
}

// ---------- OpenAI client ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------- Express app setup ----------
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  res.send("Shopping AI Backend is running!");
});

// ==========================
// 1. Health / test routes
// ==========================
app.get("/ping", (req, res) => {
  res.json({ message: "pong" });
});

app.get("/api/test", (req, res) => {
  res.json({ message: "API is working!" });
});

// ==========================
// 2. Amazon full raw search
// ==========================
app.get("/api/search/amazon", async (req, res) => {
  try {
    const query = req.query.query as string;

    if (!query) {
      return res.status(400).json({ error: "Missing query" });
    }

    const apiKey = process.env.SCRAPER_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "SCRAPER_API_KEY missing in .env" });
    }

    const url = `https://api.scraperapi.com/structured/amazon/search?api_key=${apiKey}&query=${encodeURIComponent(
      query
    )}`;

    const response = await axios.get(url);

    return res.json({
      success: true,
      query,
      data: response.data,
    });
  } catch (error: any) {
    console.error("Amazon API Error:", error.message);
    return res.status(500).json({ error: "Amazon API request failed" });
  }
});

// ==========================
// 3. Walmart simple search
// ==========================
app.get("/api/search/walmart-simple", async (req, res) => {
  try {
    const query = req.query.query as string;
    const apiKey = process.env.SCRAPER_API_KEY;
    const base = process.env.WALMART_STRUCTURED_URL;

    if (!query) {
      return res.status(400).json({ error: "Missing query" });
    }

    if (!apiKey || !base) {
      return res.status(500).json({
        error: "WALMART_STRUCTURED_URL or SCRAPER_API_KEY missing in .env",
      });
    }

    const url = `${base}?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
    const response = await axios.get(url);
    const raw = response.data;

    const items = (raw.items || []) as any[];

    const products = items.map((item) => ({
      id: item.id,
      title: item.name,
      brand: item.brand,
      image: item.image,
      url: item.url,
      seller: item.seller,
      availability: item.availability,
      price: typeof item.price === "number" ? item.price : null,
      priceCurrency: item.price_currency || "$",
      stars: item.rating?.average_rating ?? null,
      reviewCount: item.rating?.number_of_reviews ?? 0,
    }));

    return res.json({
      source: "walmart",
      query,
      total: products.length,
      products,
    });
  } catch (err: any) {
    console.error("Walmart simple API error:", err.message);
    return res.status(500).json({ error: "Walmart simple API failed" });
  }
});

// ==========================
// 4. Combined search (Amazon + Walmart)
// ==========================
app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.query as string;
    const apiKey = process.env.SCRAPER_API_KEY;
    const walmartBase = process.env.WALMART_STRUCTURED_URL;

    if (!query) {
      return res.status(400).json({ error: "Missing query" });
    }

    if (!apiKey || !walmartBase) {
      return res.status(500).json({
        error: "SCRAPER_API_KEY or WALMART_STRUCTURED_URL missing in .env",
      });
    }

    const amazonUrl = `https://api.scraperapi.com/structured/amazon/search?api_key=${apiKey}&query=${encodeURIComponent(
      query
    )}`;
    const walmartUrl = `${walmartBase}?api_key=${apiKey}&query=${encodeURIComponent(
      query
    )}`;

    const [amazonRes, walmartRes] = await Promise.all([
      axios.get(amazonUrl),
      axios.get(walmartUrl),
    ]);

    const amazonItems = (amazonRes.data.results || []) as any[];
    const amazonProducts = amazonItems.map((item) => ({
      source: "amazon",
      id: item.asin,
      title: item.title,
      url: addAmazonAffiliate(item.url),
      image: item.image,
      price: item.price?.value ?? null,
      priceCurrency: item.price?.currency ?? "$",
      stars: item.rating ?? null,
      reviewCount: item.reviews_count ?? 0,
    }));

    const walItems = (walmartRes.data.items || []) as any[];
    const walmartProducts = walItems.map((item) => ({
      source: "walmart",
      id: item.id,
      title: item.name,
      url: item.url,
      image: item.image,
      price: typeof item.price === "number" ? item.price : null,
      priceCurrency: item.price_currency || "$",
      stars: item.rating?.average_rating ?? null,
      reviewCount: item.rating?.number_of_reviews ?? 0,
      seller: item.seller,
      availability: item.availability,
    }));

    const all = [...amazonProducts, ...walmartProducts];

    return res.json({
      query,
      total: all.length,
      products: all,
      bySource: {
        amazon: amazonProducts.length,
        walmart: walmartProducts.length,
      },
    });
  } catch (err: any) {
    console.error("Combined /api/search error:", err.message || err);
    return res.status(500).json({ error: "Combined search failed" });
  }
});

// ==========================
// START SERVER (only once!)
// ==========================
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
