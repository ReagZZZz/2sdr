// Serveur 2SDR : API du site, de l'espace bénévole et de l'admin.
// Cloudflare Worker + base D1 (binding DB). Les pages statiques sont dans /public.
import { SEED } from "./seed.js";
import { mailNewsletter, mailSimple } from "./mails.js";

const JOURS = [
  ["2027-10-25", "montage"], ["2027-10-26", "montage"], ["2027-10-27", "montage"], ["2027-10-28", "montage"], ["2027-10-29", "montage"],
  ["2027-10-30", "festival"], ["2027-10-31", "demontage"], ["2027-11-01", "demontage"], ["2027-11-02", "demontage"],
];
const PHASE = Object.fromEntries(JOURS);
const CRENEAUX = ["M", "AM", "S"];
const REPAS = { montage: ["mfrM", "mfrS"], festival: ["festM", "festS"], demontage: ["mfrM", "mfrS"] };
const POLES = ["Restauration", "Bar", "Montage/Démontage", "Accueil", "Sécurité", "Kids du rock"];
const TAILLES = ["XS", "S", "M", "L", "XL", "XXL"];
const DOCS = ["params", "besoins", "merch", "groupes", "inventaire", "campagnes", "responsabilites", "budget", "asso"];
const ACCES = ["", "Mécènes", "Trésorerie", "Mécènes + trésorerie"];
const SESSION_JOURS = 30;
const PBKDF2_ITER = 100000;

/* ================= Base de données ================= */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS benevoles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prenom TEXT NOT NULL, nom TEXT NOT NULL DEFAULT '', email TEXT COLLATE NOCASE, tel TEXT DEFAULT '', ville TEXT DEFAULT '',
    pole TEXT DEFAULT '', poles_souhait TEXT DEFAULT '[]', dispo_souhait TEXT DEFAULT '[]', message TEXT DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'En attente', chef INTEGER NOT NULL DEFAULT 0, role TEXT DEFAULT '',
    taille TEXT DEFAULT 'M', coupe TEXT DEFAULT 'Homme', covoit INTEGER NOT NULL DEFAULT 0,
    dispo TEXT NOT NULL DEFAULT '{}', cmd TEXT, cmd_ok INTEGER NOT NULL DEFAULT 0,
    pass_hash TEXT, cree_le TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS benevoles_email ON benevoles(email) WHERE email IS NOT NULL AND email <> ''`,
  `CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, nom TEXT DEFAULT '',
    pass_hash TEXT, cree_le TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, benevole_id INTEGER, admin_id INTEGER, expire INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS jetons (token TEXT PRIMARY KEY, type TEXT NOT NULL, benevole_id INTEGER, admin_id INTEGER, expire INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, prenom TEXT DEFAULT '',
    source TEXT DEFAULT '', date TEXT NOT NULL, statut TEXT NOT NULL DEFAULT 'Abonné', jeton TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS docs (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS echecs (cle TEXT NOT NULL, t INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, resp TEXT NOT NULL, nom TEXT NOT NULL, qte REAL NOT NULL DEFAULT 0,
    unite TEXT DEFAULT '', seuil REAL NOT NULL DEFAULT 0, note TEXT DEFAULT '', maj_par TEXT DEFAULT '', maj_le TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS mecenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, lien TEXT DEFAULT '', logo TEXT, ordre INTEGER NOT NULL DEFAULT 0,
    actif INTEGER NOT NULL DEFAULT 1, maj INTEGER NOT NULL DEFAULT 0, cree_le TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS demandes_mecenat (
    id INTEGER PRIMARY KEY AUTOINCREMENT, entreprise TEXT NOT NULL, contact TEXT DEFAULT '', email TEXT NOT NULL, tel TEXT DEFAULT '',
    type TEXT DEFAULT '', montant TEXT DEFAULT '', message TEXT DEFAULT '', statut TEXT NOT NULL DEFAULT 'Nouvelle', cree_le TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, libelle TEXT NOT NULL, categorie TEXT DEFAULT '', type TEXT NOT NULL DEFAULT 'depense',
    montant REAL NOT NULL DEFAULT 0, mode TEXT DEFAULT '', piece TEXT DEFAULT '', statut TEXT NOT NULL DEFAULT 'Réglé', don_id INTEGER,
    par TEXT DEFAULT '', cree_le TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS dons (
    id INTEGER PRIMARY KEY AUTOINCREMENT, donateur TEXT NOT NULL, type_donateur TEXT NOT NULL DEFAULT 'Entreprise', adresse TEXT DEFAULT '',
    nature TEXT NOT NULL DEFAULT 'Numéraire', description TEXT DEFAULT '', montant REAL NOT NULL DEFAULT 0, date TEXT NOT NULL, mode TEXT DEFAULT '',
    recu_num TEXT, recu_date TEXT, par TEXT DEFAULT '', cree_le TEXT NOT NULL DEFAULT (datetime('now')))`,
];
// Colonnes ajoutées après la première mise en ligne
const MIGRATIONS = [`ALTER TABLE benevoles ADD COLUMN responsabilite TEXT DEFAULT ''`, `ALTER TABLE mecenes ADD COLUMN fond TEXT DEFAULT 'clair'`, `ALTER TABLE benevoles ADD COLUMN acces TEXT DEFAULT ''`];
let pret = false;
async function init(env) {
  if (pret) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  for (const m of MIGRATIONS) { try { await env.DB.prepare(m).run(); } catch (e) { /* déjà appliquée */ } }
  const ins = env.DB.prepare("INSERT OR IGNORE INTO docs (k, v) VALUES (?, ?)");
  await env.DB.batch(DOCS.map((k) => ins.bind(k, JSON.stringify(SEED[k]))));
  pret = true;
}
async function doc(env, k) {
  const r = await env.DB.prepare("SELECT v FROM docs WHERE k = ?").bind(k).first();
  return r ? JSON.parse(r.v) : structuredClone(SEED[k]);
}
async function docs(env, ks) {
  const { results } = await env.DB.prepare(`SELECT k, v FROM docs WHERE k IN (${ks.map(() => "?").join(",")})`).bind(...ks).all();
  const out = {};
  ks.forEach((k) => (out[k] = structuredClone(SEED[k])));
  results.forEach((r) => (out[r.k] = JSON.parse(r.v)));
  return out;
}

/* ================= Utilitaires ================= */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const erreur = (message, status = 400) => json({ ok: false, erreur: message }, status);
class ErreurHttp extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const echec = (m, s = 400) => { throw new ErreurHttp(m, s); };

async function corps(req) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) echec("Requête invalide.", 415);
  try { return await req.json(); } catch { echec("Requête invalide."); }
}
const txt = (v, max = 300) => String(v ?? "").trim().slice(0, max);
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const jeton = (n = 32) => {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const base = (env, req) => (env.SITE_URL || (req ? new URL(req.url).origin : "")).replace(/\/$/, "");

async function hacher(mdp, sel = crypto.getRandomValues(new Uint8Array(16))) {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(mdp), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sel, iterations: PBKDF2_ITER }, cle, 256);
  const hex = (u) => [...new Uint8Array(u)].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `pbkdf2$${PBKDF2_ITER}$${hex(sel)}$${hex(bits)}`;
}
async function verifier(mdp, stocke) {
  if (!stocke) return false;
  const [, , selHex, attendu] = stocke.split("$");
  const sel = new Uint8Array(selHex.match(/../g).map((h) => parseInt(h, 16)));
  const calc = (await hacher(mdp, sel)).split("$")[3];
  if (calc.length !== attendu.length) return false;
  let d = 0;
  for (let i = 0; i < calc.length; i++) d |= calc.charCodeAt(i) ^ attendu.charCodeAt(i);
  return d === 0;
}
const mdpOk = (m) => typeof m === "string" && m.length >= 8 && m.length <= 200;

/* ================= Sessions ================= */
function cookie(req, nom) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + nom + "=([^;]+)"));
  return m ? m[1] : null;
}
const cookieSession = (val, maxAge) => `sid=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
async function session(env, req) {
  const t = cookie(req, "sid");
  if (!t) return {};
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE token = ? AND expire > ?").bind(t, Date.now()).first();
  return s ? { token: t, bid: s.benevole_id, aid: s.admin_id } : {};
}
async function ouvrirSession(env, { bid = null, aid = null }) {
  const t = jeton();
  await env.DB.prepare("INSERT INTO sessions (token, benevole_id, admin_id, expire) VALUES (?, ?, ?, ?)")
    .bind(t, bid, aid, Date.now() + SESSION_JOURS * 864e5).run();
  return cookieSession(t, SESSION_JOURS * 86400);
}
async function benevoleConnecte(env, req) {
  const s = await session(env, req);
  if (!s.bid) echec("Connecte-toi pour accéder à ton espace.", 401);
  const b = await env.DB.prepare("SELECT * FROM benevoles WHERE id = ?").bind(s.bid).first();
  if (!b) echec("Compte introuvable.", 401);
  if (b.statut !== "Validé") echec("Ton inscription n'est pas encore validée.", 403);
  return b;
}
async function adminConnecte(env, req) {
  const s = await session(env, req);
  if (!s.aid) echec("Accès réservé à l'organisation.", 401);
  const a = await env.DB.prepare("SELECT id, email, nom FROM admins WHERE id = ?").bind(s.aid).first();
  if (!a) echec("Compte introuvable.", 401);
  return a;
}
// Limite simple contre les essais de mots de passe en série
async function freiner(env, cle, max = 10) {
  const depuis = Date.now() - 15 * 60e3;
  await env.DB.prepare("DELETE FROM echecs WHERE t < ?").bind(depuis).run();
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM echecs WHERE cle = ?").bind(cle).first();
  if (r.n >= max) echec("Trop de tentatives. Réessaie dans un quart d'heure.", 429);
}
const noterEchec = (env, cle) => env.DB.prepare("INSERT INTO echecs (cle, t) VALUES (?, ?)").bind(cle, Date.now()).run();

/* ================= E-mails (Resend) ================= */
const mailActif = (env) => !!env.RESEND_API_KEY;
async function envoyer(env, messages) {
  // messages : [{to, subject, html, headers?}] ; envoie par lots de 100
  if (!mailActif(env)) return { ok: false, raison: "Envoi d'e-mails non configuré (clé Resend absente)." };
  const from = env.MAIL_FROM || "2SDR <contact@2sdr.fr>";
  let envoyes = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const lot = messages.slice(i, i + 100).map((m) => ({ from, reply_to: env.MAIL_REPLY_TO || "contact@2sdr.fr", ...m, to: [m.to] }));
    const r = await fetch(lot.length === 1 ? "https://api.resend.com/emails" : "https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(lot.length === 1 ? lot[0] : lot),
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error("Resend", r.status, detail);
      return { ok: false, envoyes, raison: `Le service d'envoi a refusé l'e-mail (${r.status}). ${detail.slice(0, 200)}` };
    }
    envoyes += lot.length;
  }
  return { ok: true, envoyes };
}
async function mailAdmins(env, req, sujet, titre, texte, bouton, lien) {
  const { results } = await env.DB.prepare("SELECT email FROM admins").all();
  if (!results.length) return;
  await envoyer(env, results.map((a) => ({ to: a.email, subject: sujet, html: mailSimple(base(env, req), { titre, texte, bouton, lien }) })));
}

/* ================= Jetons (invitation, mot de passe) ================= */
async function creerJeton(env, req, type, { bid = null, aid = null }) {
  const t = jeton();
  const duree = type === "reset" ? 2 * 3600e3 : 14 * 864e5;
  if (bid) await env.DB.prepare("DELETE FROM jetons WHERE benevole_id = ? AND type = ?").bind(bid, type).run();
  if (aid) await env.DB.prepare("DELETE FROM jetons WHERE admin_id = ? AND type = ?").bind(aid, type).run();
  await env.DB.prepare("INSERT INTO jetons (token, type, benevole_id, admin_id, expire) VALUES (?, ?, ?, ?, ?)")
    .bind(t, type, bid, aid, Date.now() + duree).run();
  return `${base(env, req)}/mot-de-passe.html?t=${t}`;
}
async function inviterBenevole(env, req, b) {
  const lien = await creerJeton(env, req, "invite", { bid: b.id });
  let envoye = false;
  if (b.email) {
    const r = await envoyer(env, [{
      to: b.email, subject: "Ton accès à l'espace bénévole 2SDR",
      html: mailSimple(base(env, req), {
        titre: `Bienvenue dans le staff, ${b.prenom}`,
        texte: `Ta candidature comme bénévole aux Saints Sauveurs du Rock est validée${b.pole ? `, au pôle ${b.pole}` : ""}.\n\nCrée ton mot de passe pour accéder à ton espace : tu y choisiras tes créneaux et tes repas, tu commanderas ton t-shirt staff et tu retrouveras les contacts de ton équipe.\n\nCe lien est valable 14 jours.`,
        bouton: "Créer mon mot de passe", lien,
      }),
    }]);
    envoye = r.ok;
  }
  return { id: b.id, prenom: b.prenom, nom: b.nom, lien, envoye };
}

/* ================= Validation des données ================= */
function nettoyerDispo(d) {
  const out = {};
  if (!d || typeof d !== "object") return out;
  for (const [iso, v] of Object.entries(d)) {
    const ph = PHASE[iso];
    if (!ph || !v) continue;
    const cren = [...new Set((v.cren || []).filter((c) => CRENEAUX.includes(c)))];
    const repas = [...new Set((v.repas || []).filter((r) => REPAS[ph].includes(r)))];
    if (cren.length || repas.length) out[iso] = { cren, repas };
  }
  return out;
}
const CHAMPS_BENEVOLE = {
  prenom: (v) => txt(v, 80), nom: (v) => txt(v, 80), email: (v) => txt(v, 200).toLowerCase() || null, tel: (v) => txt(v, 40),
  ville: (v) => txt(v, 80), pole: (v) => (POLES.includes(v) ? v : ""), statut: (v) => (v === "Validé" ? "Validé" : "En attente"),
  chef: (v) => (v ? 1 : 0), role: (v) => txt(v, 80), taille: (v) => (TAILLES.includes(v) ? v : "M"),
  coupe: (v) => (["Homme", "Femme"].includes(v) ? v : "Homme"), covoit: (v) => (v ? 1 : 0),
  dispo: (v) => JSON.stringify(nettoyerDispo(v)),
  responsabilite: (v) => txt(v, 60),
  acces: (v) => (ACCES.includes(v) ? v : ""),
};
function versAdmin(b) {
  return {
    id: b.id, prenom: b.prenom, nom: b.nom, email: b.email || "", tel: b.tel || "", ville: b.ville || "", pole: b.pole || "",
    statut: b.statut, chef: !!b.chef, role: b.role || "", taille: b.taille, coupe: b.coupe, covoit: !!b.covoit,
    dispo: JSON.parse(b.dispo || "{}"), poles_souhait: JSON.parse(b.poles_souhait || "[]"), dispo_souhait: JSON.parse(b.dispo_souhait || "[]"),
    message: b.message || "", responsabilite: b.responsabilite || "", acces: b.acces || "", cmd: b.cmd ? JSON.parse(b.cmd) : null, cmd_ok: !!b.cmd_ok, compte: !!b.pass_hash, cree_le: b.cree_le,
  };
}

/* ================= Routes publiques ================= */
async function routePublic(env) {
  const { params, groupes, merch, asso } = await docs(env, ["params", "groupes", "merch", "asso"]);
  const { results: mec } = await env.DB.prepare("SELECT id, nom, lien, logo IS NOT NULL a_logo, maj, fond FROM mecenes WHERE actif = 1 ORDER BY ordre, id").all();
  return json({
    mecenes: mec.map((m) => ({ nom: m.nom, lien: m.lien || "", fond: m.fond === "sombre" ? "sombre" : "clair", logo: m.a_logo ? `/api/mecenes/${m.id}/logo?v=${m.maj}` : "" })),
    ok: true,
    params: { date: params.date, deadline: params.deadline, inscriptions: params.inscriptions !== false, billetterie: params.billetterie || "", ouverture: params.ouverture || "19:00",
      prix_soiree: params.prix_soiree || "", prix_surplace: params.prix_surplace || "", parking: params.parking || "", accessibilite: params.accessibilite || "" },
    merch: Object.values(merch.filter((m) => !m.staff).reduce((acc, m) => {
      const k = m.article + "|" + (m.var || "");
      (acc[k] ||= { article: m.article, var: m.var || "", tailles: [], prix: m.prix || 0 }).tailles.push(m.taille);
      acc[k].prix = Math.min(acc[k].prix || m.prix || 0, m.prix || acc[k].prix || 0);
      return acc;
    }, {})),
    asso: { nom: asso.nom, adresse: asso.adresse, identifiant: asso.identifiant },
    groupes: groupes.map((g) => ({ nom: g.nom, type: g.type, heure: g.heure, duree: g.duree })).sort((a, b) => (a.heure || "").localeCompare(b.heure || "")),
  });
}

async function routeInscription(env, req) {
  const d = await corps(req);
  const params = await doc(env, "params");
  if (params.inscriptions === false) echec("Les inscriptions bénévoles sont closes pour cette édition.", 403);
  const b = {
    prenom: txt(d.prenom, 80), nom: txt(d.nom, 80), email: txt(d.email, 200).toLowerCase(), tel: txt(d.tel, 40), ville: txt(d.ville, 80),
    taille: TAILLES.includes(d.taille) ? d.taille : "M", message: txt(d.msg, 2000),
    poles: (Array.isArray(d.poles) ? d.poles : []).filter((p) => POLES.includes(p)),
    dispos: (Array.isArray(d.dispos) ? d.dispos : []).filter((p) => ["montage", "festival", "demontage"].includes(p)),
  };
  if (!b.prenom || !b.nom) echec("Indique ton prénom et ton nom.");
  if (!emailOk(b.email)) echec("Saisis une adresse e-mail valide.");
  if (!b.tel) echec("Indique ton numéro de téléphone.");
  if (d.site) return json({ ok: true }); // champ piège anti-robots
  const existe = await env.DB.prepare("SELECT id FROM benevoles WHERE email = ?").bind(b.email).first();
  if (existe) echec("Cette adresse e-mail est déjà inscrite. Si tu as déjà un compte, connecte-toi depuis l'espace bénévole.", 409);
  await env.DB.prepare(`INSERT INTO benevoles (prenom, nom, email, tel, ville, taille, message, poles_souhait, dispo_souhait, pole)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(b.prenom, b.nom, b.email, b.tel, b.ville, b.taille, b.message, JSON.stringify(b.poles), JSON.stringify(b.dispos), b.poles[0] || "").run();
  const site = base(env, req);
  await envoyer(env, [{
    to: b.email, subject: "Ta candidature bénévole 2SDR est bien reçue",
    html: mailSimple(site, {
      titre: `Merci ${b.prenom} !`,
      texte: `Ta candidature pour être bénévole aux Saints Sauveurs du Rock est bien reçue.\n\nUn responsable va la regarder et te recontacter pour valider ton pôle. Dès que c'est fait, tu reçois un e-mail pour créer ton accès à l'espace bénévole.`,
    }),
  }]);
  await mailAdmins(env, req, `Nouvelle candidature bénévole : ${b.prenom} ${b.nom}`, "Nouvelle candidature bénévole",
    `${b.prenom} ${b.nom} (${b.ville || "ville non précisée"}) veut rejoindre l'équipe.\n\nPôles souhaités : ${b.poles.join(", ") || "aucun précisé"}.\nDisponibilités : ${b.dispos.join(", ") || "non précisées"}.${b.message ? `\n\nSon message : ${b.message}` : ""}`,
    "Valider dans l'admin", `${site}/admin.html#benevoles`);
  return json({ ok: true });
}

async function routeNewsletter(env, req) {
  const d = await corps(req);
  const email = txt(d.email, 200).toLowerCase();
  if (!emailOk(email)) echec("Saisis une adresse e-mail valide.");
  if (!d.consentement) echec("Coche la case pour confirmer ton inscription.");
  const c = await env.DB.prepare("SELECT * FROM contacts WHERE email = ?").bind(email).first();
  if (c) {
    if (c.statut !== "Abonné") await env.DB.prepare("UPDATE contacts SET statut = 'Abonné' WHERE id = ?").bind(c.id).run();
  } else {
    await env.DB.prepare("INSERT INTO contacts (email, prenom, source, date, statut, jeton) VALUES (?, ?, 'Formulaire du site', ?, 'Abonné', ?)")
      .bind(email, txt(d.prenom, 80), aujourdhui(), jeton(18)).run();
  }
  return json({ ok: true });
}

async function routeDesinscription(env, req, url) {
  const t = url.searchParams.get("t") || "";
  const c = t ? await env.DB.prepare("SELECT * FROM contacts WHERE jeton = ?").bind(t).first() : null;
  const page = (titre, texte, form = "") => new Response(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre} — 2SDR</title>
<style>body{margin:0;min-height:100svh;display:grid;place-items:center;background:#000;color:#fff;font:16px/1.5 Arial,Helvetica,sans-serif;padding:24px}main{max-width:460px}h1{font:900 2.6rem/1 Impact,'Arial Narrow',sans-serif;text-transform:uppercase;color:#E30613;margin:0 0 14px}p{color:#D9D4CC}button{font:700 1rem Arial,sans-serif;border:0;border-radius:999px;padding:14px 24px;background:#E30613;color:#fff;cursor:pointer;margin-top:10px}a{color:#fff}</style></head>
<body><main><h1>${titre}</h1><p>${texte}</p>${form}<p><a href="/">Retour au site 2SDR</a></p></main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  if (!c) return page("Lien invalide", "Ce lien de désinscription n'est pas reconnu. Écris-nous à contact@2sdr.fr et on te retire de la liste.");
  if (req.method === "POST") {
    await env.DB.prepare("UPDATE contacts SET statut = 'Désinscrit' WHERE id = ?").bind(c.id).run();
    return page("C'est fait", `L'adresse ${c.email} ne recevra plus la newsletter 2SDR.`);
  }
  if (c.statut === "Désinscrit") return page("Déjà désinscrit", `L'adresse ${c.email} ne reçoit plus la newsletter 2SDR.`);
  return page("Se désinscrire", `Tu ne recevras plus les 4 e-mails annuels du festival à l'adresse ${c.email}.`,
    `<form method="post"><button type="submit">Me désinscrire</button></form>`);
}

/* ================= Connexion et mots de passe ================= */
async function routeLogin(env, req) {
  const d = await corps(req);
  const email = txt(d.email, 200).toLowerCase();
  if (!emailOk(email) || !d.password) echec("Saisis ton e-mail et ton mot de passe.");
  await freiner(env, "login:" + email);
  const b = await env.DB.prepare("SELECT id, statut, pass_hash FROM benevoles WHERE email = ?").bind(email).first();
  const a = await env.DB.prepare("SELECT id, pass_hash FROM admins WHERE email = ?").bind(email).first();
  const bOk = b && (await verifier(d.password, b.pass_hash));
  const aOk = a && (await verifier(d.password, a.pass_hash));
  if (!bOk && !aOk) {
    await noterEchec(env, "login:" + email);
    echec("E-mail ou mot de passe incorrect.", 401);
  }
  if (bOk && !aOk && b.statut !== "Validé") echec("Ton inscription n'est pas encore validée par l'équipe.", 403);
  const c = await ouvrirSession(env, { bid: bOk && b.statut === "Validé" ? b.id : null, aid: aOk ? a.id : null });
  return json({ ok: true, benevole: !!(bOk && b.statut === "Validé"), admin: !!aOk }, 200, { "set-cookie": c });
}
async function routeLogout(env, req) {
  const s = await session(env, req);
  if (s.token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(s.token).run();
  return json({ ok: true }, 200, { "set-cookie": cookieSession("", 0) });
}
async function routeSession(env, req) {
  const s = await session(env, req);
  const n = await env.DB.prepare("SELECT COUNT(*) n FROM admins").first();
  return json({ ok: true, benevole: !!s.bid, admin: !!s.aid, installation: n.n === 0 });
}
async function routeOubli(env, req) {
  const d = await corps(req);
  const email = txt(d.email, 200).toLowerCase();
  if (!emailOk(email)) echec("Saisis une adresse e-mail valide.");
  await freiner(env, "oubli:" + email, 5);
  await noterEchec(env, "oubli:" + email);
  const b = await env.DB.prepare("SELECT id, prenom FROM benevoles WHERE email = ? AND statut = 'Validé'").bind(email).first();
  const a = await env.DB.prepare("SELECT id, nom FROM admins WHERE email = ?").bind(email).first();
  if (b || a) {
    const lien = await creerJeton(env, req, "reset", b ? { bid: b.id } : { aid: a.id });
    await envoyer(env, [{
      to: email, subject: "Nouveau mot de passe 2SDR",
      html: mailSimple(base(env, req), {
        titre: "Nouveau mot de passe",
        texte: `Bonjour${b ? " " + b.prenom : ""},\n\nTu as demandé à changer ton mot de passe 2SDR. Ce lien est valable 2 heures.\n\nSi ce n'est pas toi, ignore cet e-mail : ton mot de passe actuel reste valable.`,
        bouton: "Choisir un nouveau mot de passe", lien,
      }),
    }]);
  }
  // même réponse que l'adresse existe ou non
  return json({ ok: true, mail: mailActif(env) });
}
async function lireJeton(env, t) {
  if (!t) return null;
  return env.DB.prepare("SELECT * FROM jetons WHERE token = ? AND expire > ?").bind(t, Date.now()).first();
}
async function routeJeton(env, url) {
  const j = await lireJeton(env, url.searchParams.get("t"));
  if (!j) return erreur("Ce lien a expiré ou a déjà servi. Demande un nouveau lien depuis la page de connexion.", 404);
  const p = j.benevole_id
    ? await env.DB.prepare("SELECT prenom, email FROM benevoles WHERE id = ?").bind(j.benevole_id).first()
    : await env.DB.prepare("SELECT nom prenom, email FROM admins WHERE id = ?").bind(j.admin_id).first();
  return json({ ok: true, type: j.type, prenom: p?.prenom || "", email: p?.email || "", admin: !!j.admin_id });
}
async function routeMotDePasse(env, req) {
  const d = await corps(req);
  const j = await lireJeton(env, d.token);
  if (!j) echec("Ce lien a expiré ou a déjà servi. Demande un nouveau lien depuis la page de connexion.", 404);
  if (!mdpOk(d.password)) echec("Choisis un mot de passe d'au moins 8 caractères.");
  const h = await hacher(d.password);
  if (j.benevole_id) await env.DB.prepare("UPDATE benevoles SET pass_hash = ? WHERE id = ?").bind(h, j.benevole_id).run();
  else await env.DB.prepare("UPDATE admins SET pass_hash = ? WHERE id = ?").bind(h, j.admin_id).run();
  await env.DB.prepare("DELETE FROM jetons WHERE token = ?").bind(d.token).run();
  await env.DB.prepare("DELETE FROM sessions WHERE " + (j.benevole_id ? "benevole_id = ?" : "admin_id = ?")).bind(j.benevole_id || j.admin_id).run();
  const c = await ouvrirSession(env, { bid: j.benevole_id, aid: j.admin_id });
  return json({ ok: true, admin: !!j.admin_id }, 200, { "set-cookie": c });
}

/* ================= Espace bénévole ================= */
async function routeMoi(env, req) {
  const b = await benevoleConnecte(env, req);
  const params = await doc(env, "params");
  if (req.method === "PUT") {
    const d = await corps(req);
    const email = txt(d.email, 200).toLowerCase();
    if (!txt(d.prenom)) echec("Indique ton prénom.");
    if (!emailOk(email)) echec("Saisis une adresse e-mail valide.");
    const pris = await env.DB.prepare("SELECT id FROM benevoles WHERE email = ? AND id <> ?").bind(email, b.id).first();
    if (pris) echec("Cette adresse e-mail est déjà utilisée par un autre bénévole.", 409);
    await env.DB.prepare("UPDATE benevoles SET prenom = ?, email = ?, tel = ?, ville = ?, covoit = ? WHERE id = ?")
      .bind(txt(d.prenom, 80), email, txt(d.tel, 40), txt(d.ville, 80), d.covoit ? 1 : 0, b.id).run();
    return json({ ok: true });
  }
  return json({
    ok: true,
    moi: { id: b.id, prenom: b.prenom, nom: b.nom, email: b.email, tel: b.tel, ville: b.ville, pole: b.pole, chef: !!b.chef, role: b.role, covoit: !!b.covoit, taille: b.taille, coupe: b.coupe, responsabilite: b.responsabilite || "", acces: b.acces || "" },
    config: { deadline: params.deadline, verrouille: !!params.verrou, date: params.date },
    planning: JSON.parse(b.dispo || "{}"), cmd: b.cmd ? JSON.parse(b.cmd) : null, cmd_ok: !!b.cmd_ok,
  });
}
async function routePlanning(env, req) {
  const b = await benevoleConnecte(env, req);
  const params = await doc(env, "params");
  if (params.verrou) echec("Le planning est verrouillé. Contacte ton chef d'équipe pour un changement.", 423);
  const d = await corps(req);
  const dispo = nettoyerDispo(d.planning);
  await env.DB.prepare("UPDATE benevoles SET dispo = ? WHERE id = ?").bind(JSON.stringify(dispo), b.id).run();
  return json({ ok: true, planning: dispo });
}
async function routeCommande(env, req) {
  const b = await benevoleConnecte(env, req);
  const params = await doc(env, "params");
  if (params.verrou) echec("Les commandes sont closes. Contacte ton chef d'équipe pour un changement.", 423);
  const d = await corps(req);
  const cmd = {};
  for (const [k, o] of Object.entries(d.cmd || {})) {
    if (!["tee", "hoodie", "cap"].includes(k) || !o) continue;
    cmd[k] = { q: Math.max(0, Math.min(5, +o.q || 0)), t: txt(o.t, 10), coupe: o.coupe ? txt(o.coupe, 20) : null, c: Math.max(0, Math.min(5, +o.c || 0)) };
  }
  await env.DB.prepare("UPDATE benevoles SET cmd = ?, cmd_ok = ? WHERE id = ?").bind(JSON.stringify(cmd), d.ok ? 1 : 0, b.id).run();
  if (d.ok && !b.cmd_ok && b.email) {
    const noms = { tee: "T-shirt staff", hoodie: "Sweat à capuche", cap: "Casquette" };
    const lignes = Object.entries(cmd).filter(([, o]) => o.q > 0).map(([k, o]) => `• ${o.q} × ${noms[k]} (${[o.coupe, o.t].filter(Boolean).join(", ")})`).join("\n");
    await envoyer(env, [{
      to: b.email, subject: "Ta commande de textile staff 2SDR",
      html: mailSimple(base(env, req), { titre: "Commande enregistrée", texte: `Merci ${b.prenom}, ta commande est enregistrée :\n\n${lignes}\n\nRetrait au stand bénévoles dès le lundi du montage. Le t-shirt staff est offert, le reste se règle sur place.` }),
    }]);
  }
  return json({ ok: true });
}
async function routePresences(env, req) {
  const b = await benevoleConnecte(env, req);
  const { results } = await env.DB.prepare("SELECT id, prenom, nom, pole, ville, covoit, chef, dispo FROM benevoles WHERE statut = 'Validé' AND id <> ?").bind(b.id).all();
  return json({
    ok: true,
    benevoles: results.map((r) => {
      const d = JSON.parse(r.dispo || "{}"), dispo = {};
      for (const [iso, v] of Object.entries(d)) if (PHASE[iso] !== "festival" && v.cren?.length) dispo[iso] = v.cren;
      return { id: r.id, prenom: r.prenom, nom: r.nom, pole: r.pole, ville: r.ville, covoit: !!r.covoit, chef: !!r.chef, dispo };
    }),
  });
}
async function routePole(env, req) {
  const b = await benevoleConnecte(env, req);
  const { results } = await env.DB.prepare("SELECT id, prenom, nom, ville, tel, email, chef, role FROM benevoles WHERE statut = 'Validé' AND pole = ? AND id <> ? ORDER BY chef DESC, prenom").bind(b.pole, b.id).all();
  return json({ ok: true, pole: b.pole, membres: results.map((r) => ({ ...r, chef: !!r.chef, role: r.role || (r.chef ? "Chef d'équipe" : "") })) });
}

/* ================= Stocks des responsables ================= */
const nombre = (v, def = 0) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : def; };
async function responsable(env, req) {
  const s = await session(env, req);
  if (s.aid && new URL(req.url).searchParams.get("resp")) return { resp: txt(new URL(req.url).searchParams.get("resp"), 60), qui: "Admin" };
  const b = await benevoleConnecte(env, req);
  if (!b.responsabilite) echec("Cette page est réservée aux responsables.", 403);
  return { resp: b.responsabilite, qui: `${b.prenom} ${b.nom}`.trim() };
}
async function routeStocks(env, req, id, sous) {
  const { resp, qui } = await responsable(env, req);
  const m = req.method;
  // Le responsable merch gère directement le stock merch de l'admin
  if (resp === "Merch") {
    const merch = await doc(env, "merch");
    if (m === "GET") return json({ ok: true, resp, merch: true, articles: merch });
    if (m === "PUT" && id) {
      const a = merch.find((x) => x.id === id);
      if (!a) echec("Article introuvable.", 404);
      const d = await corps(req);
      if (d.stock !== undefined) a.stock = nombre(d.stock);
      if (d.vendu !== undefined) a.vendu = nombre(d.vendu);
      await env.DB.prepare("INSERT INTO docs (k, v) VALUES ('merch', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(merch)).run();
      return json({ ok: true, article: a });
    }
    echec("Action impossible sur le merch.", 405);
  }
  if (m === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM stocks WHERE resp = ? ORDER BY nom COLLATE NOCASE").bind(resp).all();
    return json({ ok: true, resp, merch: false, articles: results });
  }
  if (m === "POST" && !id) {
    const d = await corps(req);
    if (!txt(d.nom)) echec("Indique le nom de l'article.");
    const r = await env.DB.prepare("INSERT INTO stocks (resp, nom, qte, unite, seuil, note, maj_par) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(resp, txt(d.nom, 100), nombre(d.qte), txt(d.unite, 20), nombre(d.seuil), txt(d.note, 300), qui).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  const a = id ? await env.DB.prepare("SELECT * FROM stocks WHERE id = ? AND resp = ?").bind(id, resp).first() : null;
  if (!a) echec("Article introuvable.", 404);
  if (m === "DELETE") { await env.DB.prepare("DELETE FROM stocks WHERE id = ?").bind(id).run(); return json({ ok: true }); }
  if (m === "PUT") {
    const d = await corps(req), f = {};
    if (d.nom !== undefined) { if (!txt(d.nom)) echec("Indique le nom de l'article."); f.nom = txt(d.nom, 100); }
    if (d.qte !== undefined) f.qte = nombre(d.qte);
    if (d.delta !== undefined) f.qte = Math.max(0, Math.round((a.qte + Number(d.delta || 0)) * 100) / 100);
    if (d.unite !== undefined) f.unite = txt(d.unite, 20);
    if (d.seuil !== undefined) f.seuil = nombre(d.seuil);
    if (d.note !== undefined) f.note = txt(d.note, 300);
    f.maj_par = qui;
    await env.DB.prepare(`UPDATE stocks SET ${Object.keys(f).map((c) => c + " = ?").join(", ")}, maj_le = datetime('now') WHERE id = ?`).bind(...Object.values(f), id).run();
    return json({ ok: true, article: await env.DB.prepare("SELECT * FROM stocks WHERE id = ?").bind(id).first() });
  }
  echec("Action inconnue.", 405);
}

/* ================= Droits de gestion (admins + bénévoles habilités) ================= */
async function gestionnaire(env, req, droit) {
  const s = await session(env, req);
  if (s.aid) { const a = await env.DB.prepare("SELECT nom, email FROM admins WHERE id = ?").bind(s.aid).first(); if (a) return { qui: a.nom || a.email, admin: true }; }
  if (!s.bid) echec("Connecte-toi pour accéder à cette page.", 401);
  const b = await env.DB.prepare("SELECT * FROM benevoles WHERE id = ?").bind(s.bid).first();
  if (!b || b.statut !== "Validé" || !(b.acces || "").toLowerCase().includes(droit)) echec("Cette page est réservée aux personnes habilitées par l'organisation.", 403);
  return { qui: `${b.prenom} ${b.nom}`.trim(), admin: false };
}

/* ================= Mécénat ================= */
async function routeDemandeMecenat(env, req) {
  const d = await corps(req);
  if (d.site) return json({ ok: true });
  const v = { entreprise: txt(d.entreprise, 120), contact: txt(d.contact, 120), email: txt(d.email, 200).toLowerCase(), tel: txt(d.tel, 40),
    type: txt(d.type, 120), montant: txt(d.montant, 60), message: txt(d.message, 3000) };
  if (!v.entreprise) echec("Indique le nom de ton entreprise ou de ta structure.");
  if (!emailOk(v.email)) echec("Saisis une adresse e-mail valide.");
  await freiner(env, "mecenat:" + (req.headers.get("cf-connecting-ip") || "?"), 6);
  await noterEchec(env, "mecenat:" + (req.headers.get("cf-connecting-ip") || "?"));
  await env.DB.prepare("INSERT INTO demandes_mecenat (entreprise, contact, email, tel, type, montant, message) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(v.entreprise, v.contact, v.email, v.tel, v.type, v.montant, v.message).run();
  const site = base(env, req);
  await envoyer(env, [{ to: v.email, subject: "Votre proposition de mécénat pour 2SDR",
    html: mailSimple(site, { titre: "Merci pour votre soutien", texte: `Bonjour${v.contact ? " " + v.contact : ""},\n\nNous avons bien reçu la proposition de ${v.entreprise} pour soutenir les Saints Sauveurs du Rock. Un membre de l'équipe vous recontacte très vite pour en parler.\n\nÀ bientôt,\nL'équipe 2SDR` }) }]);
  await mailAdmins(env, req, `Nouvelle demande de mécénat : ${v.entreprise}`, "Nouvelle demande de mécénat",
    `${v.entreprise}${v.contact ? ` (${v.contact})` : ""} propose de soutenir le festival.\n\nType de soutien : ${v.type || "non précisé"}\nMontant ou valeur indicative : ${v.montant || "non précisé"}\nE-mail : ${v.email}${v.tel ? `\nTéléphone : ${v.tel}` : ""}${v.message ? `\n\nMessage : ${v.message}` : ""}`,
    "Voir dans l'admin", `${site}/admin.html#mecenes`);
  return json({ ok: true });
}
async function routeLogo(env, id) {
  const m = await env.DB.prepare("SELECT logo FROM mecenes WHERE id = ?").bind(id).first();
  const r = m?.logo && m.logo.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!r) return new Response("Logo introuvable", { status: 404 });
  const bin = Uint8Array.from(atob(r[2]), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { "content-type": r[1], "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
}
function logoValide(l) {
  if (l == null || l === "") return null;
  if (typeof l !== "string" || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(l)) echec("Logo invalide : utilise une image PNG, JPG ou WebP.");
  if (l.length > 700000) echec("Logo trop lourd (500 Ko maximum).");
  return l;
}
async function routeGestionMecenes(env, req) {
  const g = await gestionnaire(env, req, "mécènes");
  const { results: mecenes } = await env.DB.prepare("SELECT id, nom, lien, logo IS NOT NULL a_logo, ordre, actif, maj, fond FROM mecenes ORDER BY ordre, id").all();
  const { results: demandes } = await env.DB.prepare("SELECT * FROM demandes_mecenat ORDER BY id DESC").all();
  return json({ ok: true, qui: g.qui, admin: g.admin, mecenes: mecenes.map((m) => ({ ...m, actif: !!m.actif, logo: m.a_logo ? `/api/mecenes/${m.id}/logo?v=${m.maj}` : "" })), demandes });
}
async function routeAdminMecenes(env, req, id) {
  await gestionnaire(env, req, "mécènes");
  const m = req.method;
  if (m === "POST" && !id) {
    const d = await corps(req);
    if (!txt(d.nom)) echec("Indique le nom du mécène.");
    const lien = txt(d.lien, 300);
    if (lien && !/^https?:\/\//.test(lien)) echec("Le lien doit commencer par https://");
    const n = await env.DB.prepare("SELECT COALESCE(MAX(ordre), 0) + 1 o FROM mecenes").first();
    const r = await env.DB.prepare("INSERT INTO mecenes (nom, lien, logo, ordre, maj, fond) VALUES (?, ?, ?, ?, ?, ?)").bind(txt(d.nom, 120), lien, logoValide(d.logo), n.o, Date.now(), d.fond === "sombre" ? "sombre" : "clair").run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if (!id) echec("Mécène introuvable.", 404);
  if (m === "DELETE") { await env.DB.prepare("DELETE FROM mecenes WHERE id = ?").bind(id).run(); return json({ ok: true }); }
  if (m === "PUT") {
    const d = await corps(req), f = {};
    if (d.nom !== undefined) { if (!txt(d.nom)) echec("Indique le nom du mécène."); f.nom = txt(d.nom, 120); }
    if (d.lien !== undefined) { const l = txt(d.lien, 300); if (l && !/^https?:\/\//.test(l)) echec("Le lien doit commencer par https://"); f.lien = l; }
    if (d.logo !== undefined) f.logo = logoValide(d.logo);
    if (d.actif !== undefined) f.actif = d.actif ? 1 : 0;
    if (d.fond !== undefined) f.fond = d.fond === "sombre" ? "sombre" : "clair";
    if (d.ordre !== undefined) f.ordre = Math.round(Number(d.ordre) || 0);
    f.maj = Date.now();
    await env.DB.prepare(`UPDATE mecenes SET ${Object.keys(f).map((c) => c + " = ?").join(", ")} WHERE id = ?`).bind(...Object.values(f), id).run();
    return json({ ok: true });
  }
  echec("Action inconnue.", 405);
}
async function routeAdminDemande(env, req, id) {
  await gestionnaire(env, req, "mécènes");
  const d = await corps(req);
  if (req.method === "DELETE" || d.supprimer) { await env.DB.prepare("DELETE FROM demandes_mecenat WHERE id = ?").bind(id).run(); return json({ ok: true }); }
  const st = ["Nouvelle", "Contactée", "Acceptée", "Refusée"].includes(d.statut) ? d.statut : "Nouvelle";
  await env.DB.prepare("UPDATE demandes_mecenat SET statut = ? WHERE id = ?").bind(st, id).run();
  return json({ ok: true });
}

/* ================= Trésorerie ================= */
const euros = (v) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : 0; };
const dateIso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : aujourdhui());
async function routeTresorerie(env, req, url) {
  const g = await gestionnaire(env, req, "trésorerie");
  const p = url.pathname.replace(/\/+$/, ""), m = req.method;
  let r;
  if (p === "/api/tresorerie" && m === "GET") {
    const { results: operations } = await env.DB.prepare("SELECT * FROM operations ORDER BY date DESC, id DESC").all();
    const { results: dons } = await env.DB.prepare("SELECT * FROM dons ORDER BY date DESC, id DESC").all();
    const D = await docs(env, ["budget", "asso", "merch"]);
    const merchCA = D.merch.filter((x) => !x.staff).reduce((s, x) => s + (x.vendu || 0) * (x.prix || 0), 0);
    return json({ ok: true, qui: g.qui, admin: g.admin, operations, dons, budget: D.budget, asso: D.asso, merchCA });
  }
  if (p === "/api/tresorerie/budget" && m === "PUT") {
    const d = await corps(req);
    const b = (Array.isArray(d.budget) ? d.budget : []).filter((x) => txt(x.cat)).map((x) => ({ cat: txt(x.cat, 80), type: x.type === "recette" ? "recette" : "depense", prevu: euros(x.prevu) }));
    await env.DB.prepare("INSERT INTO docs (k, v) VALUES ('budget', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(b)).run();
    return json({ ok: true });
  }
  if (p === "/api/tresorerie/asso" && m === "PUT") {
    const d = await corps(req);
    const a = { nom: txt(d.nom, 150), adresse: txt(d.adresse, 300), objet: txt(d.objet, 400), identifiant: txt(d.identifiant, 80), signataire: txt(d.signataire, 120), qualite: txt(d.qualite, 80) };
    await env.DB.prepare("INSERT INTO docs (k, v) VALUES ('asso', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(a)).run();
    return json({ ok: true });
  }
  const champsOp = (d) => {
    if (!txt(d.libelle)) echec("Indique le libellé de l'opération.");
    const montant = euros(d.montant);
    if (!montant) echec("Indique un montant supérieur à zéro.");
    return [dateIso(d.date), txt(d.libelle, 200), txt(d.categorie, 80), d.type === "recette" ? "recette" : "depense", montant, txt(d.mode, 40), txt(d.piece, 120), d.statut === "À régler" ? "À régler" : "Réglé"];
  };
  if (p === "/api/tresorerie/operations" && m === "POST") {
    const d = await corps(req);
    const res = await env.DB.prepare("INSERT INTO operations (date, libelle, categorie, type, montant, mode, piece, statut, par) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(...champsOp(d), g.qui).run();
    return json({ ok: true, id: res.meta.last_row_id });
  }
  if ((r = p.match(/^\/api\/tresorerie\/operations\/(\d+)$/))) {
    if (m === "DELETE") { await env.DB.prepare("DELETE FROM operations WHERE id = ?").bind(+r[1]).run(); return json({ ok: true }); }
    if (m === "PUT") {
      const d = await corps(req);
      await env.DB.prepare("UPDATE operations SET date = ?, libelle = ?, categorie = ?, type = ?, montant = ?, mode = ?, piece = ?, statut = ?, par = ? WHERE id = ?").bind(...champsOp(d), g.qui, +r[1]).run();
      return json({ ok: true });
    }
  }
  const champsDon = (d) => {
    if (!txt(d.donateur)) echec("Indique le nom du donateur.");
    const montant = euros(d.montant);
    if (!montant) echec("Indique le montant du don ou la valeur du don en nature.");
    return [txt(d.donateur, 150), d.type_donateur === "Particulier" ? "Particulier" : "Entreprise", txt(d.adresse, 300),
      ["Numéraire", "En nature", "Compétences"].includes(d.nature) ? d.nature : "Numéraire", txt(d.description, 300), montant, dateIso(d.date), txt(d.mode, 40)];
  };
  if (p === "/api/tresorerie/dons" && m === "POST") {
    const d = await corps(req);
    const v = champsDon(d);
    const res = await env.DB.prepare("INSERT INTO dons (donateur, type_donateur, adresse, nature, description, montant, date, mode, par) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(...v, g.qui).run();
    const id = res.meta.last_row_id;
    if (d.recette && v[3] === "Numéraire")
      await env.DB.prepare("INSERT INTO operations (date, libelle, categorie, type, montant, mode, statut, don_id, par) VALUES (?, ?, 'Mécénat et dons', 'recette', ?, ?, 'Réglé', ?, ?)")
        .bind(v[6], `Don de ${v[0]}`, v[5], v[7], id, g.qui).run();
    return json({ ok: true, id });
  }
  if ((r = p.match(/^\/api\/tresorerie\/dons\/(\d+)(\/recu)?$/))) {
    const id = +r[1];
    const don = await env.DB.prepare("SELECT * FROM dons WHERE id = ?").bind(id).first();
    if (!don) echec("Don introuvable.", 404);
    if (r[2] && m === "POST") {
      if (don.recu_num) return json({ ok: true, recu_num: don.recu_num });
      const annee = don.date.slice(0, 4);
      const n = await env.DB.prepare("SELECT COUNT(*) n FROM dons WHERE recu_num LIKE ?").bind(annee + "-%").first();
      const num = `${annee}-${String(n.n + 1).padStart(3, "0")}`;
      await env.DB.prepare("UPDATE dons SET recu_num = ?, recu_date = ? WHERE id = ?").bind(num, aujourdhui(), id).run();
      return json({ ok: true, recu_num: num });
    }
    if (m === "DELETE") {
      if (don.recu_num) echec("Ce don a déjà un reçu fiscal numéroté : il ne peut plus être supprimé.", 409);
      await env.DB.batch([env.DB.prepare("DELETE FROM operations WHERE don_id = ?").bind(id), env.DB.prepare("DELETE FROM dons WHERE id = ?").bind(id)]);
      return json({ ok: true });
    }
    if (m === "PUT") {
      const d = await corps(req);
      const v = champsDon(d);
      if (don.recu_num && (v[0] !== don.donateur || v[5] !== don.montant || v[3] !== don.nature)) echec("Le reçu fiscal est déjà émis : le donateur, la nature et le montant ne peuvent plus changer.", 409);
      await env.DB.prepare("UPDATE dons SET donateur = ?, type_donateur = ?, adresse = ?, nature = ?, description = ?, montant = ?, date = ?, mode = ?, par = ? WHERE id = ?").bind(...v, g.qui, id).run();
      return json({ ok: true });
    }
  }
  echec("Adresse inconnue.", 404);
}

/* ================= Admin ================= */
async function routeInstallation(env, req) {
  const n = await env.DB.prepare("SELECT COUNT(*) n FROM admins").first();
  if (n.n > 0) echec("L'administration est déjà installée. Connecte-toi.", 409);
  if (!env.SETUP_CODE) echec("Le code d'installation n'est pas encore défini dans Cloudflare (variable SETUP_CODE).", 503);
  const d = await corps(req);
  await freiner(env, "setup", 8);
  if (txt(d.code, 200) !== env.SETUP_CODE) { await noterEchec(env, "setup"); echec("Code d'installation incorrect.", 403); }
  const email = txt(d.email, 200).toLowerCase();
  if (!emailOk(email)) echec("Saisis une adresse e-mail valide.");
  if (!mdpOk(d.password)) echec("Choisis un mot de passe d'au moins 8 caractères.");
  const r = await env.DB.prepare("INSERT INTO admins (email, nom, pass_hash) VALUES (?, ?, ?)").bind(email, txt(d.nom, 80), await hacher(d.password)).run();
  const c = await ouvrirSession(env, { aid: r.meta.last_row_id });
  return json({ ok: true }, 200, { "set-cookie": c });
}
async function etatAdmin(env) {
  const D = await docs(env, DOCS);
  const { results: bs } = await env.DB.prepare("SELECT * FROM benevoles ORDER BY id").all();
  const { results: cs } = await env.DB.prepare("SELECT id, email, prenom, source, date, statut FROM contacts ORDER BY id DESC").all();
  const { results: admins } = await env.DB.prepare("SELECT id, email, nom, pass_hash IS NOT NULL compte FROM admins ORDER BY id").all();
  const { results: mecenes } = await env.DB.prepare("SELECT id, nom, lien, logo IS NOT NULL a_logo, ordre, actif, maj, fond FROM mecenes ORDER BY ordre, id").all();
  const { results: demandes } = await env.DB.prepare("SELECT * FROM demandes_mecenat ORDER BY id DESC").all();
  const { results: stocks } = await env.DB.prepare("SELECT * FROM stocks ORDER BY resp, nom COLLATE NOCASE").all();
  return {
    benevoles: bs.map(versAdmin), besoins: D.besoins, merch: D.merch, groupes: D.groupes, inventaire: D.inventaire, params: D.params,
    newsletter: { contacts: cs, campagnes: D.campagnes }, responsabilites: D.responsabilites,
    mecenes: mecenes.map((m) => ({ ...m, actif: !!m.actif, logo: m.a_logo ? `/api/mecenes/${m.id}/logo?v=${m.maj}` : "" })), demandes, stocks,
    meta: { mail: mailActif(env), admins: admins.map((a) => ({ ...a, compte: !!a.compte })) },
  };
}
async function routeSync(env, req) {
  await adminConnecte(env, req);
  const d = await corps(req);
  const st = [], idmap = { benevoles: {}, contacts: {} }, invitations = [], refus = [];
  // Documents (paramètres, besoins, merch, groupes, inventaire, campagnes)
  for (const [k, v] of Object.entries(d.docs || {})) {
    if (!DOCS.includes(k) || v == null) continue;
    st.push(env.DB.prepare("INSERT INTO docs (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, JSON.stringify(v)));
  }
  if (st.length) await env.DB.batch(st);
  // Bénévoles
  const B = d.benevoles || {};
  for (const id of B.del || []) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE benevole_id = ?").bind(id),
      env.DB.prepare("DELETE FROM jetons WHERE benevole_id = ?").bind(id),
      env.DB.prepare("DELETE FROM benevoles WHERE id = ?").bind(id),
    ]);
  }
  for (const u of B.upsert || []) {
    const f = {};
    for (const [k, v] of Object.entries(u.fields || {})) if (CHAMPS_BENEVOLE[k]) f[k] = CHAMPS_BENEVOLE[k](v);
    if (f.email && !emailOk(f.email)) { refus.push(`E-mail invalide pour ${f.prenom || "un bénévole"}`); delete f.email; }
    let avant = u.nouveau ? null : await env.DB.prepare("SELECT * FROM benevoles WHERE id = ?").bind(u.id).first();
    try {
      if (!avant) {
        if (!f.prenom) continue;
        const cols = Object.keys(f);
        const r = await env.DB.prepare(`INSERT INTO benevoles (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...cols.map((c) => f[c])).run();
        if (u.id !== r.meta.last_row_id) idmap.benevoles[u.id] = r.meta.last_row_id;
        avant = { statut: "En attente" };
        u.id = r.meta.last_row_id;
      } else if (Object.keys(f).length) {
        await env.DB.prepare(`UPDATE benevoles SET ${Object.keys(f).map((c) => c + " = ?").join(", ")} WHERE id = ?`).bind(...Object.values(f), u.id).run();
      }
    } catch (e) {
      refus.push(/UNIQUE/.test(String(e)) ? `L'e-mail ${f.email} est déjà utilisé par un autre bénévole.` : `Enregistrement impossible pour ${f.prenom || "un bénévole"}.`);
      continue;
    }
    if (f.statut === "Validé" && avant.statut !== "Validé") {
      const b = await env.DB.prepare("SELECT * FROM benevoles WHERE id = ?").bind(u.id).first();
      if (b && !b.pass_hash) invitations.push(await inviterBenevole(env, req, b));
    }
  }
  // Contacts newsletter
  const C = d.contacts || {};
  if (C.del?.length) await env.DB.batch(C.del.map((id) => env.DB.prepare("DELETE FROM contacts WHERE id = ?").bind(id)));
  for (const u of C.upsert || []) {
    const f = u.fields || {};
    const email = f.email !== undefined ? txt(f.email, 200).toLowerCase() : undefined;
    if (email !== undefined && !emailOk(email)) { refus.push(`E-mail invalide : ${f.email}`); continue; }
    try {
      if (u.nouveau) {
        const r = await env.DB.prepare("INSERT INTO contacts (email, prenom, source, date, statut, jeton) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(email, txt(f.prenom, 80), txt(f.source, 80), txt(f.date, 10) || aujourdhui(), f.statut === "Désinscrit" ? "Désinscrit" : "Abonné", jeton(18)).run();
        if (u.id !== r.meta.last_row_id) idmap.contacts[u.id] = r.meta.last_row_id;
      } else {
        const g = {};
        if (email !== undefined) g.email = email;
        if (f.prenom !== undefined) g.prenom = txt(f.prenom, 80);
        if (f.source !== undefined) g.source = txt(f.source, 80);
        if (f.statut !== undefined) g.statut = f.statut === "Désinscrit" ? "Désinscrit" : "Abonné";
        if (Object.keys(g).length) await env.DB.prepare(`UPDATE contacts SET ${Object.keys(g).map((c) => c + " = ?").join(", ")} WHERE id = ?`).bind(...Object.values(g), u.id).run();
      }
    } catch (e) {
      refus.push(/UNIQUE/.test(String(e)) ? `${email} est déjà dans les contacts.` : `Contact ${email} non enregistré.`);
    }
  }
  return json({ ok: true, idmap, invitations, refus, mail: mailActif(env) });
}
async function routeInvitation(env, req, id) {
  await adminConnecte(env, req);
  const b = await env.DB.prepare("SELECT * FROM benevoles WHERE id = ?").bind(id).first();
  if (!b) echec("Bénévole introuvable.", 404);
  if (b.statut !== "Validé") echec("Valide d'abord ce bénévole.");
  return json({ ok: true, invitation: await inviterBenevole(env, req, b), mail: mailActif(env) });
}
async function routeAdmins(env, req) {
  const moi = await adminConnecte(env, req);
  const d = await corps(req);
  if (d.supprimer) {
    if (+d.supprimer === moi.id) echec("Tu ne peux pas supprimer ton propre accès.");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE admin_id = ?").bind(d.supprimer),
      env.DB.prepare("DELETE FROM jetons WHERE admin_id = ?").bind(d.supprimer),
      env.DB.prepare("DELETE FROM admins WHERE id = ?").bind(d.supprimer),
    ]);
    return json({ ok: true });
  }
  const email = txt(d.email, 200).toLowerCase();
  if (!emailOk(email)) echec("Saisis une adresse e-mail valide.");
  let a = await env.DB.prepare("SELECT * FROM admins WHERE email = ?").bind(email).first();
  if (!a) {
    const r = await env.DB.prepare("INSERT INTO admins (email, nom) VALUES (?, ?)").bind(email, txt(d.nom, 80)).run();
    a = { id: r.meta.last_row_id, email, nom: txt(d.nom, 80) };
  }
  const lien = await creerJeton(env, req, "invite", { aid: a.id });
  const r = await envoyer(env, [{
    to: email, subject: "Ton accès à l'administration 2SDR",
    html: mailSimple(base(env, req), { titre: "Accès à l'admin 2SDR", texte: `${moi.nom || moi.email} t'a donné accès à l'administration du festival (bénévoles, planning, merch, groupes, newsletter).\n\nCrée ton mot de passe avec ce lien, valable 14 jours.`, bouton: "Créer mon mot de passe", lien }),
  }]);
  return json({ ok: true, lien, envoye: r.ok });
}
async function envoyerCampagne(env, req, id, test) {
  const camps = await doc(env, "campagnes");
  const c = camps.find((x) => x.id === id);
  if (!c) echec("Campagne introuvable.", 404);
  const site = base(env, req);
  if (test) {
    const to = txt(test, 200).toLowerCase();
    if (!emailOk(to)) echec("Saisis une adresse e-mail de test valide.");
    const r = await envoyer(env, [{ to, subject: "[Test] " + c.objet, html: mailNewsletter(site, c, "Camille", "#") }]);
    if (!r.ok) echec(r.raison, 502);
    return { envoyes: 1 };
  }
  const { results } = await env.DB.prepare("SELECT email, prenom, jeton FROM contacts WHERE statut = 'Abonné'").all();
  if (!results.length) echec("Aucun abonné à qui envoyer cette campagne.");
  const msgs = results.map((x) => {
    const desinscr = `${site}/api/desinscription?t=${x.jeton}`;
    return { to: x.email, subject: c.objet, html: mailNewsletter(site, c, x.prenom, desinscr),
      headers: { "List-Unsubscribe": `<${desinscr}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
  });
  const r = await envoyer(env, msgs);
  if (!r.ok && !r.envoyes) echec(r.raison, 502);
  c.statut = "Envoyée"; c.envoyes = r.envoyes; c.date = aujourdhui();
  await env.DB.prepare("UPDATE docs SET v = ? WHERE k = 'campagnes'").bind(JSON.stringify(camps)).run();
  return { envoyes: r.envoyes, partiel: !r.ok, raison: r.raison };
}
async function routeCampagne(env, req, id, action) {
  await adminConnecte(env, req);
  const d = await corps(req);
  const r = await envoyerCampagne(env, req, id, action === "test" ? d.email || "" : null);
  return json({ ok: true, ...r });
}

/* ================= Aiguillage ================= */
async function api(req, env, url) {
  const p = url.pathname.replace(/\/+$/, ""), m = req.method;
  if (p === "/api/desinscription") return routeDesinscription(env, req, url);
  if (p === "/api/public" && m === "GET") return routePublic(env);
  if (p === "/api/inscription" && m === "POST") return routeInscription(env, req);
  if (p === "/api/newsletter" && m === "POST") return routeNewsletter(env, req);
  if (p === "/api/login" && m === "POST") return routeLogin(env, req);
  if (p === "/api/logout" && m === "POST") return routeLogout(env, req);
  if (p === "/api/session" && m === "GET") return routeSession(env, req);
  if (p === "/api/mot-de-passe-oublie" && m === "POST") return routeOubli(env, req);
  if (p === "/api/jeton" && m === "GET") return routeJeton(env, url);
  if (p === "/api/mot-de-passe" && m === "POST") return routeMotDePasse(env, req);
  if (p === "/api/moi" && (m === "GET" || m === "PUT")) return routeMoi(env, req);
  if (p === "/api/moi/planning" && m === "PUT") return routePlanning(env, req);
  if (p === "/api/moi/commande" && m === "PUT") return routeCommande(env, req);
  if (p === "/api/presences" && m === "GET") return routePresences(env, req);
  if (p === "/api/pole" && m === "GET") return routePole(env, req);
  if (p === "/api/admin/installation" && m === "POST") return routeInstallation(env, req);
  if (p === "/api/admin/etat" && m === "GET") { await adminConnecte(env, req); return json({ ok: true, ...(await etatAdmin(env)) }); }
  if (p === "/api/admin/sync" && m === "POST") return routeSync(env, req);
  if (p === "/api/admin/admins" && m === "POST") return routeAdmins(env, req);
  if (p === "/api/mecenat" && m === "POST") return routeDemandeMecenat(env, req);
  if (p === "/api/gestion/mecenes" && m === "GET") return routeGestionMecenes(env, req);
  if (p.startsWith("/api/tresorerie")) return routeTresorerie(env, req, url);
  let r;
  if ((r = p.match(/^\/api\/mecenes\/(\d+)\/logo$/)) && m === "GET") return routeLogo(env, +r[1]);
  if (p === "/api/stocks") return routeStocks(env, req, null);
  if ((r = p.match(/^\/api\/stocks\/(\d+)$/))) return routeStocks(env, req, +r[1]);
  if (p === "/api/admin/mecenes") return routeAdminMecenes(env, req, null);
  if ((r = p.match(/^\/api\/admin\/mecenes\/(\d+)$/))) return routeAdminMecenes(env, req, +r[1]);
  if ((r = p.match(/^\/api\/admin\/demandes\/(\d+)$/)) && m === "POST") return routeAdminDemande(env, req, +r[1]);
  if ((r = p.match(/^\/api\/admin\/benevoles\/(\d+)\/invitation$/)) && m === "POST") return routeInvitation(env, req, +r[1]);
  if ((r = p.match(/^\/api\/admin\/campagnes\/([\w-]+)\/(test|envoyer)$/)) && m === "POST") return routeCampagne(env, req, r[1], r[2]);
  return erreur("Adresse inconnue.", 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      await init(env);
      return await api(req, env, url);
    } catch (e) {
      if (e instanceof ErreurHttp) return erreur(e.message, e.status);
      console.error(e);
      return erreur("Erreur du serveur. Réessaie dans un instant.", 500);
    }
  },
  // Tous les matins : envoie les campagnes programmées dont la date est arrivée
  async scheduled(evt, env, ctx) {
    await init(env);
    const camps = await doc(env, "campagnes");
    for (const c of camps.filter((x) => x.statut === "Programmée" && x.date <= aujourdhui())) {
      try { await envoyerCampagne(env, null, c.id, null); } catch (e) { console.error("Campagne", c.id, e.message); }
    }
  },
};
