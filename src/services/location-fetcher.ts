/**
 * Isolated fetch helper to allow direct module mocking without overriding global fetch.
 * @param url - The target url
 * @returns The response
 */
export async function fetchGeocodingData(url: string): Promise<Response> {
  return fetch(url);
}
