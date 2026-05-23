// Secure WebSocket proxy to AISStream.io. The browser connects here; this
// function holds the API key and relays Position / static-data messages.
//
// Client connects to: wss://<project-ref>.functions.supabase.co/ais-proxy
// No client-side API key required.

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";

// Default bounding box (Turkish Straits + Marmara). The client may override
// by sending a JSON message after connect: { BoundingBoxes: [[[lat,lng],[lat,lng]]] }
const DEFAULT_BBOX = [[[40.0, 26.0], [41.7, 30.3]]];
const DEFAULT_FILTERS = ["PositionReport", "ShipStaticData"];

Deno.serve((req) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const apiKey = Deno.env.get("AISSTREAM_API_KEY");
  if (!apiKey) {
    return new Response("AISSTREAM_API_KEY not configured", { status: 500 });
  }

  const { socket: client, response } = Deno.upgradeWebSocket(req);

  let upstream: WebSocket | null = null;
  let clientOpen = false;
  let upstreamOpen = false;
  let subscription: {
    BoundingBoxes: number[][][];
    FilterMessageTypes: string[];
  } = {
    BoundingBoxes: DEFAULT_BBOX,
    FilterMessageTypes: DEFAULT_FILTERS,
  };

  const sendSubscription = () => {
    if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
    upstream.send(
      JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: subscription.BoundingBoxes,
        FilterMessageTypes: subscription.FilterMessageTypes,
      }),
    );
  };

  const openUpstream = () => {
    upstream = new WebSocket(AISSTREAM_URL);

    upstream.onopen = () => {
      upstreamOpen = true;
      sendSubscription();
    };

    upstream.onmessage = (ev) => {
      if (clientOpen && client.readyState === WebSocket.OPEN) {
        // Pass through verbatim — API key is never in upstream payloads.
        client.send(ev.data);
      }
    };

    upstream.onerror = (err) => {
      console.error("[ais-proxy] upstream error", err);
    };

    upstream.onclose = (ev) => {
      upstreamOpen = false;
      if (clientOpen && client.readyState === WebSocket.OPEN) {
        client.close(1011, `upstream closed: ${ev.code}`);
      }
    };
  };

  client.onopen = () => {
    clientOpen = true;
    openUpstream();
  };

  client.onmessage = (ev) => {
    // Allow client to override the bounding box / filters. We REJECT any
    // client-supplied APIKey field to keep the secret server-side.
    try {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      if (msg && typeof msg === "object") {
        if (Array.isArray(msg.BoundingBoxes)) {
          subscription.BoundingBoxes = msg.BoundingBoxes;
        }
        if (Array.isArray(msg.FilterMessageTypes)) {
          subscription.FilterMessageTypes = msg.FilterMessageTypes;
        }
        if (upstreamOpen) sendSubscription();
      }
    } catch {
      // ignore non-JSON pings
    }
  };

  client.onclose = () => {
    clientOpen = false;
    if (upstream && upstream.readyState === WebSocket.OPEN) {
      upstream.close();
    }
  };

  client.onerror = (err) => {
    console.error("[ais-proxy] client error", err);
  };

  return response;
});
