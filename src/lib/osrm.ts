/**
 * OSRM routing service with in-memory cache.
 * Fetches real road geometry from the public OSRM demo server.
 * Falls back to straight lines on failure.
 */

const geometryCache = new Map<string, [number, number][]>();
const pendingRequests = new Map<string, Promise<[number, number][]>>();

// Throttle: max 4 concurrent requests to respect OSRM public server
let activeRequests = 0;
const MAX_CONCURRENT = 4;
const queue: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(() => { activeRequests++; resolve(); }));
}

function releaseSlot() {
  activeRequests--;
  if (queue.length > 0) {
    const next = queue.shift()!;
    next();
  }
}

export async function fetchRoadGeometry(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  cacheKey: string
): Promise<[number, number][]> {
  // Return cached
  if (geometryCache.has(cacheKey)) return geometryCache.get(cacheKey)!;

  // Dedupe concurrent requests for same key
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey)!;

  const fallback: [number, number][] = [[fromLat, fromLng], [toLat, toLng]];

  const request = (async (): Promise<[number, number][]> => {
    await acquireSlot();
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OSRM ${res.status}`);
      const data = await res.json();
      const rawCoords = data?.routes?.[0]?.geometry?.coordinates;
      if (!Array.isArray(rawCoords) || rawCoords.length < 2) {
        geometryCache.set(cacheKey, fallback);
        return fallback;
      }
      const coords: [number, number][] = rawCoords.map(
        (c: [number, number]) => [c[1], c[0]]
      );
      geometryCache.set(cacheKey, coords);
      return coords;
    } catch {
      geometryCache.set(cacheKey, fallback);
      return fallback;
    } finally {
      releaseSlot();
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, request);
  return request;
}

/** Fetch geometries for all roads in parallel (throttled). Returns Map<roadId, coords>. */
export async function fetchAllRoadGeometries(
  roads: { id: string; from_junction: string; to_junction: string }[],
  junctionMap: Map<string, { lat: number; lng: number }>
): Promise<Map<string, [number, number][]>> {
  const result = new Map<string, [number, number][]>();

  await Promise.all(
    roads.map(async (road) => {
      const from = junctionMap.get(road.from_junction);
      const to = junctionMap.get(road.to_junction);
      if (!from || !to) return;
      if ([from.lat, from.lng, to.lat, to.lng].some((v) => typeof v !== "number" || isNaN(v))) return;
      const coords = await fetchRoadGeometry(from.lat, from.lng, to.lat, to.lng, road.id);
      result.set(road.id, coords);
    })
  );

  return result;
}

export function clearGeometryCache() {
  geometryCache.clear();
}
