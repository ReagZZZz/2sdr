# 2SDR — Les Saints Sauveurs du Rock

Maquettes de la refonte web du festival 2SDR (samedi 30 octobre 2027, Espace Culturel, Saint-Sauveur-Lendelin).

| Fichier | Page |
|---|---|
| `index.html` | Site visiteur 2sdr.fr (programme, Rewind, bénévoles, billetterie, merch, infos, newsletter) |
| `connexion.html` | Connexion à l'espace bénévole (démo, à brancher sur `login.php`) |
| `benevoles.html` | Espace bénévole : planning, qui est là, merch, mon pôle |
| `admin.html` | Administration : bénévoles, planning et repas, merch et stock, groupes, newsletter, inventaire |

Pages statiques, sans dépendance : il suffit d'ouvrir `index.html`. Les données sont des exemples, à brancher sur le back-end PHP/MySQL existant (endpoints suggérés dans la charte du projet).

## Mise en ligne avec GitHub Pages

Settings → Pages → Source : « Deploy from a branch », branche `main`, dossier `/ (root)`.

## Vidéos Rewind

Déposer les vidéos (MP4 vertical 9:16, 10 à 30 s) dans un dossier `videos/` à la racine, avec les noms attendus dans `index.html` (`2sdr-2025.mp4`, etc.).
