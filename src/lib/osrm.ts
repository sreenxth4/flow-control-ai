import { Road, Junction } from "./types";

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

// Cache for geometry queries: "lat1,lng1;lat2,lng2" -> decoded LatLng tuples
const roadGeometryCache = new Map<string, [number, number][]>();
const pendingRequests = new Map<string, Promise<[number, number][] | null>>();

/**
 * Delay utility for rate limiting OSRM calls
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Gets real road geometry from OSRM between two coordinates.
 * Coordinates should be {lat, lng}.
 * Returns an array of [lat, lng] tuples to be used directly in Leaflet polylines.
 */
export async function getRoadGeometry(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  retryCount = 0
): Promise<[number, number][] | null> {
  const cacheKey = `${from.lat.toFixed(6)},${from.lng.toFixed(6)};${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
  
  if (roadGeometryCache.has(cacheKey)) {
    return roadGeometryCache.get(cacheKey)!;
  }

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const fetchPromise = async () => {
    // Add jitter to avoid burst 429 errors from public OSRM matching
    // Spread ~90 roads over 8 seconds to stay under rate limits
    await delay(Math.random() * 8000 + 500);

    try {
      const url = `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      
      if (response.status === 429 && retryCount < 5) {
        // Too many requests: backoff heavily and retry
        await delay(3000 * (retryCount + 1));
        return getRoadGeometry(from, to, retryCount + 1);
      }

      if (!response.ok) {
        console.warn("OSRM returned non-200 status:", response.status);
        return null; // Fallback to straight line
      }

      const data = await response.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates;
        // OSRM returns [lng, lat], Leaflet needs [lat, lng]
        const latLngs = coords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
        roadGeometryCache.set(cacheKey, latLngs);
        return latLngs;
      }
      return null;
    } catch (error) {
      console.error("OSRM fetch error:", error);
      return null;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  };

  const promise = fetchPromise();
  pendingRequests.set(cacheKey, promise);
  return promise;
}
