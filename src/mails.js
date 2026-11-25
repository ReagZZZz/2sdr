// Gabarits d'e-mails 2SDR (tableaux HTML compatibles avec les messageries)
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const paragraphes = (t) =>
  esc(t).split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#1a1a1a">${p.replace(/\n/g, "<br>")}</p>`).join("");

function cadre(site, { titre, pre = "", corps, pied }) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titre)}</title></head>
<body style="margin:0;padding:0;background:#e9e6e1">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9e6e1"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#000000;padding:24px 32px" align="left">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
  <td><img src="${site}/logo-2sdr.png" width="56" alt="2SDR" style="display:block;border:0;height:auto"></td>
  <td align="right" style="font:bold 13px Arial,Helvetica,sans-serif;color:#9A958E;letter-spacing:1px">LES SAINTS SAUVEURS DU ROCK</td></tr></table>
</td></tr>
<tr><td style="background:#E30613;padding:28px 32px">
  <h1 style="margin:0;font:900 34px/1 Impact,'Arial Narrow',Arial,sans-serif;color:#ffffff;text-transform:uppercase">${esc(titre)}</h1>
</td></tr>
<tr><td style="padding:32px">${corps}</td></tr>
<tr><td style="background:#000000;padding:22px 32px;font:13px/1.6 Arial,Helvetica,sans-serif;color:#9A958E">${pied}</td></tr>
</table></td></tr></table></body></html>`;
}
const bouton = (txt, lien) => (txt && lien ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0"><tr><td style="background:#E30613;border-radius:999px">
  <a href="${esc(lien)}" style="display:inline-block;padding:15px 30px;font:bold 16px Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none">${esc(txt)}</a></td></tr></table>
  <p style="margin:14px 0 0;font:12px/1.5 Arial,Helvetica,sans-serif;color:#6b665f">Si le bouton ne marche pas, copie ce lien dans ton navigateur :<br><span style="word-break:break-all">${esc(lien)}</span></p>` : "");

// E-mail transactionnel (inscription, accès, mot de passe, commande)
export function mailSimple(site, { titre, texte, bouton: b, lien }) {
  return cadre(site, {
    titre, pre: texte.split("\n")[0],
    corps: paragraphes(texte) + bouton(b, lien),
    pied: `<b style="color:#ffffff">2SDR, Les Saints Sauveurs du Rock</b><br>Espace Culturel, Rue Chesnée, 50490 Saint-Sauveur-Lendelin<br>Une question ? Réponds à cet e-mail ou écris à <a href="mailto:contact@2sdr.fr" style="color:#ffffff">contact@2sdr.fr</a>`,
  });
}

// Newsletter (les 4 campagnes de l'année)
export function mailNewsletter(site, c, prenom, lienDesinscription) {
  return cadre(site, {
    titre: c.titre, pre: c.pre,
    corps: paragraphes(String(c.texte || "").replace(/\{prenom\}/g, prenom || "")).replace(/Bonjour ,/g, "Bonjour,") + (c.bouton && c.lien ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0"><tr><td style="background:#E30613;border-radius:999px">
  <a href="${esc(c.lien)}" style="display:inline-block;padding:15px 30px;font:bold 16px Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none">${esc(c.bouton)}</a></td></tr></table>` : ""),
    pied: `<b style="color:#ffffff">Les Saints Sauveurs du Rock</b> · Espace Culturel, Rue Chesnée, 50490 Saint-Sauveur-Lendelin<br>
  <a href="https://www.facebook.com/2SDRofficiel" style="color:#ffffff">Facebook</a> · <a href="https://open.spotify.com/playlist/7q88BWK2xOk4ZDoBdHqQbl" style="color:#ffffff">Playlist Spotify</a> · <a href="mailto:contact@2sdr.fr" style="color:#ffffff">contact@2sdr.fr</a><br><br>
  Tu reçois cet e-mail car tu as pris une place ou tu t'es inscrit(e) à la newsletter 2SDR.
  <a href="${esc(lienDesinscription)}" style="color:#ffffff">Se désinscrire</a>`,
  });
}
