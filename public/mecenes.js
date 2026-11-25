// Bandeau défilant des mécènes (accueil et page mécénat)
// Usage : window.bandeauMecenes(element, listeDeMecenes)
window.bandeauMecenes = function (el, liste) {
  if (!el) return;
  const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const tuile = (m, cache) => {
    const contenu = m.logo
      ? `<img src="${esc(m.logo)}" alt="${cache ? "" : esc(m.nom)}" loading="lazy" decoding="async">`
      : `<span class="mec-nom-seul">${esc(m.nom)}</span>`;
    const att = cache ? ' aria-hidden="true" tabindex="-1"' : "";
    const cl = "mec" + (m.fond === "sombre" ? " sombre" : "") + (m.logo ? "" : " sans-logo");
    return m.lien
      ? `<a class="${cl}" href="${esc(m.lien)}" target="_blank" rel="noopener"${att}>${contenu}<span class="mec-nom">${esc(m.nom)}</span></a>`
      : `<div class="${cl}"${cache ? ' aria-hidden="true"' : ""}>${contenu}<span class="mec-nom">${esc(m.nom)}</span></div>`;
  };
  if (!liste || !liste.length) {
    el.innerHTML = `<div class="mec-vide"><b>Votre logo ici</b><span>Le festival cherche ses premiers mécènes.</span><a class="btn btn-rouge" href="mecenat.html">Devenir mécène</a></div>`;
    el.classList.add("vide");
    return;
  }
  // On répète la liste pour remplir la largeur, puis on la double pour une boucle sans à-coup
  let base = [...liste];
  while (base.length < 8) base = base.concat(liste);
  const visibles = base.map((m, i) => tuile(m, i >= liste.length)).join("");
  const copies = base.map((m) => tuile(m, true)).join("");
  el.innerHTML = `<div class="mec-piste" style="--duree:${Math.max(24, base.length * 4)}s">${visibles}${copies}</div>`;
};
