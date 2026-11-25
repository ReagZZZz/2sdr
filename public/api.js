// Petit client de l'API 2SDR, partagé par toutes les pages
window.api = async function (chemin, { method, body } = {}) {
  let r;
  try {
    r = await fetch(chemin, {
      method: method || (body ? "POST" : "GET"),
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch (e) {
    throw Object.assign(new Error("Connexion impossible. Vérifie ton accès à internet et réessaie."), { status: 0 });
  }
  let d = {};
  try { d = await r.json(); } catch (e) {}
  if (!r.ok || d.ok === false) throw Object.assign(new Error(d.erreur || "Erreur du serveur. Réessaie dans un instant."), { status: r.status });
  return d;
};
