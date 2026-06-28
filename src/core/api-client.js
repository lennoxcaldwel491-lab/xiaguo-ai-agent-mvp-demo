export function createApiClient(baseUrl = "") {
  async function request(path, options = {}) {
    try {
      const { headers = {}, ...requestOptions } = options;
      const response = await fetch(`${baseUrl}${path}`, {
        ...requestOptions,
        headers: { "Content-Type": "application/json", ...headers }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn(`API request failed: ${path}`, error);
      return null;
    }
  }

  return {
    request,
    post(path, payload) {
      return request(path, { method: "POST", body: JSON.stringify(payload) });
    },
    patch(path, payload) {
      return request(path, { method: "PATCH", body: JSON.stringify(payload) });
    }
  };
}
