# 2SDR — Les Saints Sauveurs du Rock

Site du festival 2SDR (samedi 30 octobre 2027, Espace Culturel, Saint-Sauveur-Lendelin), avec espace bénévole et administration.
Hébergé sur Cloudflare Workers, avec une base de données D1. Chaque push sur `main` redéploie le site.

## Pages

| Adresse | Rôle |
|---|---|
| `/` | Site public : programme, inscription bénévole, billetterie, merch, newsletter |
| `/connexion` | Connexion (bénévoles et organisateurs), mot de passe oublié |
| `/mot-de-passe` | Création ou changement de mot de passe (lien reçu par e-mail) |
| `/benevoles` | Espace bénévole : planning et repas, qui est là, textile staff, contacts du pôle |
| `/admin` | Administration : bénévoles, planning et repas, merch, groupes, newsletter, inventaire, paramètres |

## Fonctionnement

- Un bénévole s'inscrit sur le site. Un organisateur le valide dans l'admin : le bénévole reçoit un lien pour créer son mot de passe (si l'envoi d'e-mails n'est pas activé, l'admin affiche le lien à transmettre).
- Les groupes, la date, l'heure d'ouverture et le lien de billetterie saisis dans l'admin s'affichent sur le site.
- Une newsletter « programmée » part automatiquement le jour prévu, à 9 h. Chaque e-mail contient un lien de désinscription.
- Mots de passe chiffrés (PBKDF2), sessions en cookie sécurisé, limite d'essais de connexion.

## Configuration Cloudflare

Dans le Worker `2sdr` > Paramètres > Variables et secrets :

| Nom | Type | Rôle |
|---|---|---|
| `SETUP_CODE` | Secret | Code demandé pour créer le premier compte admin sur `/admin` |
| `RESEND_API_KEY` | Secret | Clé de [Resend](https://resend.com) pour envoyer les e-mails |

`SITE_URL`, `MAIL_FROM` et `MAIL_REPLY_TO` sont dans `wrangler.jsonc`. L'adresse d'envoi doit appartenir à un domaine vérifié dans Resend (par exemple `2sdr.fr`).

## Développement

```
npm install
echo "SETUP_CODE=code-local" > .dev.vars
npx wrangler dev
```

Code serveur : `src/worker.js` (API), `src/mails.js` (gabarits d'e-mails), `src/seed.js` (données de départ).

## Vidéos Rewind

Déposer les vidéos (MP4 vertical 9:16, 10 à 30 s) dans `public/videos/` avec les noms attendus dans `public/index.html` (`2sdr-2025.mp4`, etc.).
