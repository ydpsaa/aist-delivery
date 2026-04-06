/**
 * Google Places API Proxy
 *
 * Routes Places API calls through the server to avoid browser CORS restrictions.
 * The API key is kept server-side — never exposed to the web client.
 *
 * Routes:
 *   GET /api/places/autocomplete  — text search → place suggestions
 *   GET /api/places/details       — place_id → lat/lng + address
 *   GET /api/places/geocode       — latlng → address (reverse geocode)
 *   GET /api/places/static        — redirect to Static Maps image URL
 */

import { Router } from "express";

const router = Router();

const MAPS_KEY = process.env["GOOGLE_MAPS_SERVER_KEY"]
  || process.env["EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"]
  || "";

function noKey(res: any) {
  res.status(503).json({ error: "Google Maps API key not configured on server" });
}

// GET /api/places/autocomplete?input=...&sessiontoken=...&lang=cs
router.get("/autocomplete", async (req, res) => {
  if (!MAPS_KEY) return noKey(res);

  const { input, sessiontoken, lang = "cs", country = "cz" } = req.query as Record<string, string>;
  if (!input || input.trim().length < 2) return res.json({ predictions: [], status: "ZERO_RESULTS" });

  try {
    const params = new URLSearchParams({
      input: input.trim(),
      key: MAPS_KEY,
      language: lang,
      components: `country:${country}`,
      types: "address|establishment|geocode",
      location: "50.0755,14.4378",
      radius: "50000",
    });
    if (sessiontoken) params.set("sessiontoken", sessiontoken);

    const resp = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
    const data = await resp.json() as Record<string, unknown>;
    res.json(data);
  } catch (err) {
    console.error("[Places proxy] autocomplete error:", err);
    res.status(500).json({ error: "Places API error", status: "ERROR" });
  }
});

// GET /api/places/details?place_id=...&sessiontoken=...&lang=cs
router.get("/details", async (req, res) => {
  if (!MAPS_KEY) return noKey(res);

  const { place_id, sessiontoken, lang = "cs" } = req.query as Record<string, string>;
  if (!place_id) return res.status(400).json({ error: "place_id required" });

  try {
    const params = new URLSearchParams({
      place_id,
      fields: "geometry,formatted_address,name,address_components",
      key: MAPS_KEY,
      language: lang,
    });
    if (sessiontoken) params.set("sessiontoken", sessiontoken);

    const resp = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
    const data = await resp.json() as Record<string, unknown>;
    res.json(data);
  } catch (err) {
    console.error("[Places proxy] details error:", err);
    res.status(500).json({ error: "Places API error" });
  }
});

// GET /api/places/geocode?latlng=50.07,14.43&lang=cs
router.get("/geocode", async (req, res) => {
  if (!MAPS_KEY) return noKey(res);

  const { latlng, lang = "cs" } = req.query as Record<string, string>;
  if (!latlng) return res.status(400).json({ error: "latlng required" });

  try {
    const params = new URLSearchParams({ latlng, key: MAPS_KEY, language: lang });
    const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    const data = await resp.json() as Record<string, unknown>;
    res.json(data);
  } catch (err) {
    console.error("[Places proxy] geocode error:", err);
    res.status(500).json({ error: "Geocode API error" });
  }
});

// GET /api/places/static-url?lat=...&lng=...&zoom=14&w=800&h=400
// Returns a signed Static Maps URL (no redirect — let client render the image)
router.get("/static-url", (req, res) => {
  if (!MAPS_KEY) return noKey(res);

  const {
    lat = "50.0755", lng = "14.4378",
    zoom = "14", w = "800", h = "400",
    markers = "",
  } = req.query as Record<string, string>;

  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom,
    size: `${w}x${h}`,
    scale: "2",
    key: MAPS_KEY,
    style: "element:geometry|color:0xf5f5f5",
    maptype: "roadmap",
  });

  if (markers) params.set("markers", markers);

  res.json({ url: `https://maps.googleapis.com/maps/api/staticmap?${params}` });
});

// GET /api/places/static-image — server-proxied Static Maps image
// Params: same as /static-url but also accepts marker[] array
// Returns: image/png binary (proxied from Google — hides API key from browser)
router.get("/static-image", async (req, res) => {
  if (!MAPS_KEY) {
    res.status(503).send("Maps key not configured");
    return;
  }

  const q = req.query as Record<string, string | string[]>;
  const lat    = (q["lat"]  as string) || "50.0755";
  const lng    = (q["lng"]  as string) || "14.4378";
  const zoom   = (q["zoom"] as string) || "14";
  const w      = (q["w"]    as string) || "800";
  const h      = (q["h"]    as string) || "400";

  const parts: string[] = [
    `center=${encodeURIComponent(`${lat},${lng}`)}`,
    `zoom=${zoom}`,
    `size=${w}x${h}`,
    `scale=2`,
    `maptype=roadmap`,
    `key=${encodeURIComponent(MAPS_KEY)}`,
    `style=${encodeURIComponent("feature:poi|visibility:off")}`,
    `style=${encodeURIComponent("feature:transit|visibility:off")}`,
    `style=${encodeURIComponent("feature:water|element:geometry|color:0xd5e8f3")}`,
    `style=${encodeURIComponent("feature:landscape|element:geometry|color:0xf5f5f5")}`,
  ];

  // Support repeated marker[] or single marker param
  const markerList = Array.isArray(q["markers"]) ? q["markers"] : q["markers"] ? [q["markers"]] : [];
  markerList.forEach((m: string) => parts.push(`markers=${encodeURIComponent(m)}`));

  const url = `https://maps.googleapis.com/maps/api/staticmap?${parts.join("&")}`;

  try {
    const imgRes = await fetch(url);
    if (!imgRes.ok) {
      res.status(imgRes.status).send("Static Maps API error");
      return;
    }
    const contentType = imgRes.headers.get("content-type") || "image/png";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    const buf = Buffer.from(await imgRes.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error("[Places proxy] static-image error:", err);
    res.status(500).send("Static Maps proxy error");
  }
});

export default router;
