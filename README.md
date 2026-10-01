# Wind Forcast Lake

Webapp mobile pour le vent, les webcams et les prévisions sur les lacs de Neuchâtel et Morat.

**Adresse après activation de GitHub Pages :** https://samvyy.github.io/wind-forcast-lake/

## Activer le site (une seule fois)

1. Dans ce dépôt, ouvrir **Settings → Pages**.
2. Sous **Build and deployment → Source**, choisir **GitHub Actions**.
3. Ouvrir **Actions → Update wind and publish → Run workflow → Run workflow**.

Le site sera disponible après le déploiement. Le connecteur utilisé pour déposer le code ne peut pas modifier les réglages Pages.

Si l’écriture des données échoue : **Settings → Actions → General → Workflow permissions → Read and write permissions**, puis relancer le workflow. Aucune clé API ni secret personnel n’est nécessaire.

## Utilisation

- Sept spots : Morat, Avenches, Cudrefin, Portalban, Estavayer-le-Lac, Yvonand et Saint-Blaise.
- Tableau de sélection des spots avec vent et rafales, station principale, heure du relevé et signalement des données anciennes.
- Mesures d’anémomètres, datées, avec distance à la station et indication des données anciennes.
- Widget officiel Windguru GFS sur sept jours et lien vers les autres modèles / graphes Windguru.
- Graphe complémentaire de cinq modèles via Open-Meteo : ICON-CH1, AROME, ICON, GFS et IFS. Le curseur donne le vent et la direction heure par heure. Les modèles régionaux s’arrêtent à leur horizon réel.
- Webcams dans la page lorsque l’intégration est disponible, ou lien vers le fournisseur pour Estavayer et Yvonand.
- Choix du spot et des unités conservé sur l’appareil.
- Ajout à l’écran d’accueil : sur iPhone, ouvrir dans Safari, puis **Partager → Sur l’écran d’accueil**.

## Sources et limites

| Source | Utilisation | Référence |
|---|---|---|
| Windguru | Widget officiel GFS et accès multi-modèle | IDs : Morat/Avenches 13673, Cudrefin 97565, Portalban 57000, Estavayer 20622, Yvonand 56998, Saint-Blaise 57022 |
| Holfuy / CVN | Moyenne et rafale 15 min ; station sur la jetée à Neuchâtel | https://www.cvn.ch/services/meteo/ · station 1020 |
| Holfuy / GMR Avenches | Moyenne et rafale 15 min ; station terrestre d’aéromodélisme | https://holfuy.com/fr/weather/929 |
| YvBeach | Moyenne 10 min, rafale maximale 1 h | https://www.yvbeach.com/yvmeteo.htm |
| SOCOOP / CVE Estavayer | Vent et rafales de la station du port, fichier public `data.json` ; unités en nœuds vérifiées | https://meteo.cvestavayer.ch/ |
| Open-Meteo | Modèles indépendants de Windguru, en nœuds | https://open-meteo.com/en/docs |
| Roundshot / offices du tourisme | Panoramas mis à jour par le fournisseur | URLs et crédits dans `data/spots.json` |
| Portalban Tourisme / Commune Delley-Portalban | Images port et plage | https://www.portalbantourisme.com/webcam/ |

Les stations ne sont pas toutes sur la plage choisie. La distance est calculée à vol d’oiseau ; celle de YvBeach est approximative. Aucune précision locale maximale n’est revendiquée. Avenches utilise le point Windguru Murtensee (signalé dans l’interface), tandis que les graphes Open-Meteo utilisent les coordonnées de la plage.

Le widget Windguru n’est pas une API de réutilisation des données brutes. L’app ne récupère pas les données PRO et ne présente pas les données Open-Meteo comme venant de Windguru. Les comparaisons utilisent IFS 0,25°, pas IFS-HRES 9 km. Les séries ICON seamless ne sont pas une résolution constante. Les unités, moyennes et fenêtres de rafales sont précisées.

Les mesures ne sont pas fusionnées en une moyenne : des stations ayant des expositions différentes ne sont pas interchangeables. Il n’y a pas de classement automatique « navigable ».

## Actualisation

Le workflow collecte les mesures environ toutes les **5 minutes**, conserve un historique de **72 heures**, rafraîchit les prévisions toutes les **3 heures**, puis publie le site. Le planning GitHub Actions peut être retardé ; les dates des sources sont toujours affichées. Le widget Holfuy peut être consulté directement dans « Historique & stations en direct » pour un relevé plus récent. Le bouton d’actualisation vérifie la dernière collecte dans le dépôt public et recharge les webcams et widgets ; il ne déclenche pas une mesure sur les stations.

Le premier historique contient seulement le premier relevé : il se remplit avec les collectes. En cas d’échec, les données antérieures et leur date sont conservées. Le service worker conserve les fichiers et les données déjà consultées pour un accès hors ligne ; les webcams et widgets nécessitent Internet.

GitHub désactive normalement les workflows planifiés des dépôts publics après une période prolongée sans activité (voir documentation GitHub). Vérifier l’onglet Actions si les données deviennent anciennes. Réactiver le workflow si nécessaire.

Le code ne comporte aucun suivi publicitaire ; les lecteurs intégrés peuvent appliquer les conditions et cookies de leurs fournisseurs. Les données météo et images restent soumises aux licences et conditions des fournisseurs. L’API gratuite Open-Meteo est destinée à un usage non commercial ; prévoir une offre adaptée si l’usage change.

## Développement local

Python 3.12 suffit, aucune dépendance Python ou étape npm.

```sh
python scripts/collect.py
python -m http.server 8080
```

Ouvrir http://localhost:8080. Le collecteur et les parsers sont dans `scripts/collect.py`, les spots dans `data/spots.json`, l’interface dans `index.html`, `styles.css`, `app.js`.

Vérifier les fichiers JSON, les horodatages, les unités et les erreurs de source après modification d’un parser. Les sources publiques peuvent évoluer : si leur format change, le collecteur signale l’échec au lieu d’inventer une valeur.

Le bouton Actualiser vérifie également la dernière collecte directement dans le dépôt public, sans attendre sa propagation sur Pages. L’heure de vérification est distincte de celle des relevés. GitHub peut retarder les collectes programmées. Les seuils de couleur sont appliqués à chaque valeur : bleu dès 12 nd, vert dès 17 nd, également en affichage km/h.
