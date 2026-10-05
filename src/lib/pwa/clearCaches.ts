export async function clearAppCaches() {
  try {
    sessionStorage.removeItem("sf:session-only");
  } catch {
    // ignora
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // ignora
  }
}
