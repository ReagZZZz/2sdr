// Données de départ de la base (modifiables ensuite dans l'admin)
export const SEED = {
 "besoins": {
  "Restauration": {
   "montage": 3,
   "festival": 12,
   "demontage": 3
  },
  "Bar": {
   "montage": 0,
   "festival": 14,
   "demontage": 1
  },
  "Montage/Démontage": {
   "montage": 10,
   "festival": 4,
   "demontage": 10
  },
  "Accueil": {
   "montage": 0,
   "festival": 8,
   "demontage": 0
  },
  "Sécurité": {
   "montage": 0,
   "festival": 10,
   "demontage": 0
  },
  "Kids du rock": {
   "montage": 0,
   "festival": 6,
   "demontage": 0
  }
 },
 "merch": [
  {
   "id": 1,
   "article": "T-shirt staff",
   "var": "Noir · Homme",
   "taille": "M",
   "stock": 0,
   "vendu": 0,
   "staff": true,
   "seuil": 5,
   "prix": 0
  },
  {
   "id": 2,
   "article": "T-shirt 2SDR",
   "var": "Noir",
   "taille": "S",
   "stock": 0,
   "vendu": 0,
   "seuil": 4,
   "prix": 15
  },
  {
   "id": 3,
   "article": "T-shirt 2SDR",
   "var": "Noir",
   "taille": "M",
   "stock": 0,
   "vendu": 0,
   "seuil": 5,
   "prix": 15
  },
  {
   "id": 4,
   "article": "T-shirt 2SDR",
   "var": "Noir",
   "taille": "L",
   "stock": 0,
   "vendu": 0,
   "seuil": 5,
   "prix": 15
  },
  {
   "id": 5,
   "article": "T-shirt 2SDR",
   "var": "Noir",
   "taille": "XL",
   "stock": 0,
   "vendu": 0,
   "seuil": 4,
   "prix": 15
  },
  {
   "id": 6,
   "article": "T-shirt rouge",
   "var": "Rouge",
   "taille": "M",
   "stock": 0,
   "vendu": 0,
   "seuil": 4,
   "prix": 15
  },
  {
   "id": 7,
   "article": "T-shirt rouge",
   "var": "Rouge",
   "taille": "L",
   "stock": 0,
   "vendu": 0,
   "seuil": 4,
   "prix": 15
  },
  {
   "id": 8,
   "article": "Sweat à capuche",
   "var": "Noir",
   "taille": "M",
   "stock": 0,
   "vendu": 0,
   "seuil": 3,
   "prix": 35
  },
  {
   "id": 9,
   "article": "Sweat à capuche",
   "var": "Noir",
   "taille": "L",
   "stock": 0,
   "vendu": 0,
   "seuil": 3,
   "prix": 35
  },
  {
   "id": 10,
   "article": "Sweat à capuche",
   "var": "Noir",
   "taille": "XL",
   "stock": 0,
   "vendu": 0,
   "seuil": 2,
   "prix": 35
  },
  {
   "id": 11,
   "article": "Tote bag",
   "var": "Écru",
   "taille": "Unique",
   "stock": 0,
   "vendu": 0,
   "seuil": 8,
   "prix": 8
  },
  {
   "id": 12,
   "article": "Casquette",
   "var": "Noir",
   "taille": "Unique",
   "stock": 0,
   "vendu": 0,
   "seuil": 4,
   "prix": 15
  }
 ],
 "groupes": [
  {
   "id": 1,
   "nom": "[Groupe Kids du rock]",
   "type": "Kids du rock",
   "heure": "14:00",
   "duree": "45 min",
   "balances": "12:30",
   "contact": "[Nom, 06 00 00 00 00]",
   "personnes": 4,
   "repas": 4,
   "hebergement": "Non",
   "contrat": "Signé",
   "fiche": "Reçue",
   "cachet": "[À compléter]"
  },
  {
   "id": 2,
   "nom": "[Groupe local]",
   "type": "Local",
   "heure": "20:00",
   "duree": "45 min",
   "balances": "16:00",
   "contact": "[Nom, 06 00 00 00 00]",
   "personnes": 5,
   "repas": 5,
   "hebergement": "Non",
   "contrat": "Signé",
   "fiche": "Manquante",
   "cachet": "[À compléter]"
  },
  {
   "id": 3,
   "nom": "[Groupe national]",
   "type": "National",
   "heure": "21:30",
   "duree": "1 h 15",
   "balances": "17:00",
   "contact": "[Tourneur, e-mail]",
   "personnes": 7,
   "repas": 7,
   "hebergement": "Oui",
   "contrat": "À signer",
   "fiche": "Reçue",
   "cachet": "[À compléter]"
  },
  {
   "id": 4,
   "nom": "[Tête d'affiche]",
   "type": "National",
   "heure": "23:15",
   "duree": "1 h 30",
   "balances": "18:00",
   "contact": "[Tourneur, e-mail]",
   "personnes": 9,
   "repas": 9,
   "hebergement": "Oui",
   "contrat": "À signer",
   "fiche": "Manquante",
   "cachet": "[À compléter]"
  }
 ],
 "inventaire": [],
 "campagnes": [
  {
   "id": "billetterie",
   "nom": "Ouverture de la billetterie 2027",
   "quand": "Avant Noël",
   "date": "2026-12-12",
   "statut": "Brouillon",
   "objet": "La billetterie 2027 est ouverte",
   "pre": "Une place pour le 30 octobre 2027 sous le sapin ?",
   "titre": "La billetterie 2027 est ouverte",
   "texte": "Bonjour {prenom},\n\nLa prochaine édition des Saints Sauveurs du Rock aura lieu le samedi 30 octobre 2027, la nuit du passage à l'heure d'hiver, à l'Espace Culturel de Saint-Sauveur-Lendelin.\n\nLa programmation reste secrète pour l'instant, mais la billetterie est déjà ouverte. Une place pour la soirée concerts, c'est une idée de cadeau qui se glisse facilement sous le sapin.\n\nLes Kids du rock restent gratuits le samedi après-midi.",
   "bouton": "Prendre ma place",
   "lien": "https://www.2sdr.fr/#billetterie"
  },
  {
   "id": "teaser",
   "nom": "Annonce avant la programmation",
   "quand": "Juste avant la prog",
   "date": "2027-03-10",
   "statut": "Brouillon",
   "objet": "Plus qu'une semaine avant la programmation",
   "pre": "Le 17 mars, on vous dit tout.",
   "titre": "La programmation arrive le 17 mars",
   "texte": "Bonjour {prenom},\n\nOn a bouclé l'affiche de l'édition 2027. Rendez-vous le mercredi 17 mars pour découvrir les trois groupes du samedi soir : un groupe local et deux groupes nationaux.\n\nEn attendant, la playlist du festival tourne déjà, et quelques indices vont tomber sur notre page Facebook.",
   "bouton": "Écouter la playlist",
   "lien": "https://open.spotify.com/playlist/7q88BWK2xOk4ZDoBdHqQbl"
  },
  {
   "id": "prog",
   "nom": "Sortie de la programmation",
   "quand": "Le jour de la prog",
   "date": "2027-03-17",
   "statut": "Brouillon",
   "objet": "La programmation 2027 est là",
   "pre": "Trois groupes, une heure de rock en plus.",
   "titre": "Voici l'affiche 2027",
   "texte": "Bonjour {prenom},\n\nLe samedi 30 octobre 2027 à Saint-Sauveur-Lendelin, sur scène :\n\n• [Tête d'affiche]\n• [Groupe national]\n• [Groupe local]\n\nL'après-midi, les Kids du rock reviennent pour les enfants, toujours gratuits.\n\nLes places partent vite à l'annonce : ne tardez pas.",
   "bouton": "Prendre ma place",
   "lien": "https://www.2sdr.fr/#billetterie"
  },
  {
   "id": "merci",
   "nom": "Merci après le festival",
   "quand": "Après le festival",
   "date": "2027-11-02",
   "statut": "Brouillon",
   "objet": "Merci d'avoir fait vibrer Saint-Sauveur-Lendelin",
   "pre": "Les photos de la soirée sont en ligne.",
   "titre": "Merci pour cette nuit-là",
   "texte": "Bonjour {prenom},\n\nMerci d'être venu(e) aux Saints Sauveurs du Rock samedi. Grâce à vous et à nos bénévoles, l'heure en plus a été bien remplie.\n\nLes photos de la soirée sont en ligne sur notre page Facebook. Identifiez-vous, partagez, et dites-nous ce que vous avez préféré.\n\nOn se retrouve l'année prochaine, le week-end du changement d'heure. On vous prévient dès l'ouverture de la billetterie.",
   "bouton": "Voir les photos",
   "lien": "https://www.facebook.com/2SDRofficiel"
  }
 ],
 "params": {
  "date": "2027-10-30",
  "deadline": "2027-10-01",
  "verrou": false,
  "inscriptions": true,
  "billetterie": "",
  "ouverture": "19:00"
 },
 "responsabilites": [
  "Merch",
  "Grillade",
  "Bar",
  "Plateau",
  "Catering",
  "Parking",
  "Kids",
  "Élec",
  "Nettoyage"
 ],
 "budget": [
  {
   "cat": "Billetterie",
   "type": "recette",
   "prevu": 0
  },
  {
   "cat": "Bar",
   "type": "recette",
   "prevu": 0
  },
  {
   "cat": "Restauration",
   "type": "recette",
   "prevu": 0
  },
  {
   "cat": "Merch",
   "type": "recette",
   "prevu": 0
  },
  {
   "cat": "Mécénat et dons",
   "type": "recette",
   "prevu": 0
  },
  {
   "cat": "Subventions",
   "type": "recette",
   "prevu": 0
  },
  {
   "cat": "Adhésions",
   "type": "recette",
   "prevu": 0
  },
  {
   "cat": "Autre recette",
   "type": "recette",
   "prevu": 0
  },
  {
   "cat": "Artistes et cachets",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Technique (son, lumière, scène)",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Location et matériel",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Achats bar",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Achats restauration",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Merch (fabrication)",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Communication et impression",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Sécurité",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Assurances et SACEM",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Bénévoles (repas, t-shirts)",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Logistique et transport",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Frais bancaires",
   "type": "depense",
   "prevu": 0
  },
  {
   "cat": "Autre dépense",
   "type": "depense",
   "prevu": 0
  }
 ],
 "asso": {
  "nom": "Les Saints Sauveurs du Rock",
  "adresse": "Espace Culturel, Rue Chesnée, 50490 Saint-Sauveur-Lendelin",
  "objet": "Organisation du festival rock 2SDR et d'animations culturelles",
  "identifiant": "",
  "signataire": "",
  "qualite": "Trésorier(ère)"
 }
};
