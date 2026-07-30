# Les briefs de séance — format d'échange CAVVA → Cap CAVVA

Ce document est le **contrat**. Cap CAVVA sait déjà lire ce qui suit ; c'est
maintenant au site de le produire. Tout ce qui est décrit ici est implémenté et
vérifiable côté client ([`src/main/brief-source.js`](src/main/brief-source.js)),
y compris les refus.

Le format épouse la table `vols_aeroclub` telle qu'elle est. **Rien à changer sur
le site** : ni colonne, ni saisie, ni migration des 42 vols déjà publiés.

---

## 1. Ce que le client va chercher

| | |
|---|---|
| Collection | `<racine>/cap-cavva/briefs.json` |
| Racine | `apiBaseUrl` de la configuration — `https://cavva.sixk.me` par défaut |
| Méthode | `GET`, `Cache-Control: no-cache` |
| Délai | 10 s |

**Tous les vols en une fois.** À ~150 octets par séance, les 42 tiennent dans 8 Ko :
un index à télécharger puis un fichier par date serait de la complexité sans
contrepartie. Le client trie par date croissante lui-même.

La clé du compte accompagne la requête, dans deux en-têtes à la fois — le serveur
lit celui qui l'arrange, exactement comme `CleApi::exigerMembre()` le fait déjà
pour Tours :

```
Authorization: Bearer <clé CAVVA>
X-API-Key: <clé CAVVA>
```

Le client ne conserve **rien** : pas de cache, pas de copie locale. Le calendrier
bouge, une séance s'annule, une zone change.

### Codes de retour attendus

| Situation | Réponse | Ce que l'application affiche |
|---|---|---|
| Tout va bien | `200` | le calendrier |
| Clé absente ou inconnue | `401` / `403` | « Clé CAVVA refusée par le serveur. » |
| Rien de publié | `404` | « Aucune séance publiée pour le moment. » — pas une panne |
| Autre | tout le reste | « Serveur CAVVA injoignable. » |

---

## 2. La signature

**HMAC-SHA256**, en **hexadécimal minuscule (64 caractères)**, calculée sur les
**octets exacts** du JSON servi.

Deux façons de la livrer, et la première est meilleure :

### En en-tête — recommandé

```
X-Cap-Signature: <64 caractères hexadécimaux>
```

Le client la lit dans la **même réponse** que le JSON, et ne demande rien de plus.

C'est ce qu'il faut pour un serveur qui **compose le JSON à la volée** depuis sa
base — et c'est le cas ici, puisque la source de vérité est `vols_aeroclub`. Avec
deux requêtes séparées, un administrateur qui modifie un vol entre les deux ferait
livrer un contenu qui ne correspond plus à sa signature : le client crierait à la
falsification alors que personne n'a rien falsifié. L'en-tête supprime la fenêtre,
et fait une requête au lieu de deux.

### À côté — la façon de Tours

Si l'en-tête est absent, le client va chercher `<racine>/cap-cavva/briefs.json.sig`.
Le fichier contient la signature seule ; la forme `sha256sum`
(`<signature>  briefs.json`) est acceptée, seul le premier mot est lu.

À réserver au cas où la collection est **écrite dans un fichier** et signée au
moment de l'écriture — là, il n'y a pas de course.

> **Ne jamais re-sérialiser le JSON entre la signature et l'envoi.** Un espace
> d'écart et le client rejette tout — c'est exactement son rôle. Signer la chaîne,
> puis émettre *cette* chaîne.

### La clé

Le client dérive sa clé par `scrypt` à partir d'un **secret**, que PHP n'a pas
les moyens de reproduire. Le côté CAVVA reçoit donc la **clé dérivée**, une
bonne fois :

```bash
npm run brief:cle
```

À déposer dans `app/config/config.local.php`, jamais dans un dépôt :

```php
'cap_cavva' => ['cle_brief' => '…64 caractères hexadécimaux…'],
```

### Le secret, et où il vit

**Pas dans le dépôt.** `Cap-CAVVA` est public : un secret versionné serait
lisible par tout le monde, sans même avoir à déballer l'application, et la
signature ne vaudrait plus rien. `brief-crypto.js` le résout dans cet ordre :

1. `CAP_CAVVA_BRIEF_SECRET` — en développement, le temps d'un `npm start` ;
2. `src/main/brief-secret.js` — fichier généré, gitignoré, écrit par
   `outils/injecter-secret.js` et embarqué dans l'archive au `npm run dist`.

```bash
npm run brief:secret     # la première fois : fabrique un secret neuf
```

Aucun des deux, et l'application le **dit** (code `secret`, « cette copie n'a pas
de secret de signature ») au lieu de rejeter tous les briefs comme falsifiés —
deux diagnostics qui n'ont rien à voir.

> **À sauvegarder hors du dépôt.** Ce secret est la seule chose qui relie
> l'application au serveur. Le perdre oblige à en regénérer un *et* à remettre la
> clé dérivée dans `config.local.php` du site.

**Limite assumée** : le secret voyage dans le binaire, parce que l'application
doit pouvoir vérifier seule. Cela empêche un serveur détourné (fichier `hosts`,
proxy, point d'accès public) d'annoncer d'autres zones actives ; cela ne protège
pas de quelqu'un qui déballerait l'archive `asar`. C'est la même doctrine que
`data-crypto.js` dans Tours — à ceci près qu'ici le secret ne se lit pas sur
GitHub.

---

## 3. Le contenu

```json
{
  "format": 1,
  "genere": "2026-07-30T14:05:00+02:00",
  "briefs": [
    {
      "id": "7",
      "date": "2026-10-07",
      "typeVol": "VFR",
      "rayonNm": 60,
      "icaoArrivee": "LFFN",
      "zones": ["R45 S2 LANGRES"],
      "notes": null,
      "fichier": null
    }
  ]
}
```

Le jeu d'essai versionné — la copie des 42 vols réels — est dans
[`outils/briefs-exemple.json`](outils/briefs-exemple.json).

### Racine

| Champ | Type | Obligatoire | Rôle |
|---|---|---|---|
| `format` | entier | **oui** | `1`. Un numéro **supérieur** fait refuser la collection : « ces briefs demandent une version plus récente de Cap CAVVA ». Un numéro inférieur est accepté. |
| `genere` | chaîne | non | Horodatage de publication. Informatif. |
| `briefs` | tableau | **oui** | Peut être vide (`[]`) — mais doit être présent. |

### Un brief — colonne par colonne

| Champ JSON | Colonne | Type | Obligatoire | Notes |
|---|---|---|---|---|
| `id` | `id` | chaîne ou entier | non | Non affiché. Utile aux journaux. |
| `date` | `date_vol` | chaîne | **oui** | `AAAA-MM-JJ`, et une vraie date — même exigence que `VolValidateur::dateValide()`. Un format autre fait refuser la collection, avec le rang fautif. |
| `typeVol` | `type_vol` | chaîne | non | Affiché **tel quel**. Le site le borne à trois valeurs, mais sa colonne est un `VARCHAR` précisément pour qu'un quatrième type n'oblige à rien : le client ne referme pas ce qui a été laissé ouvert. |
| `rayonNm` | `rayon_depart` | entier | non | Milles nautiques. Tracé en cercle ambre pointillé **autour de l'aérodrome d'arrivée**. |
| `icaoArrivee` | `icao_arrivee` | chaîne | non | Code OACI. Le brief ne porte **aucune coordonnée** : l'application retrouve le terrain dans sa base MSFS. |
| `zones` | `zones_actives` | tableau de chaînes | non | Le contenu du champ JSON, tel quel. Voir §4. |
| `notes` | `notes` | chaîne | non | Texte libre, sauts de ligne conservés. |
| `fichier` | `fichier_nom_origine` | chaîne | non | Nom de l'archive jointe, **à titre indicatif** : son téléchargement passe par `/vols/{id}/fichier`, donc par une session web, pas par la clé d'API. |

`null` et l'absence du champ sont équivalents partout.

---

## 4. Les zones actives — texte libre, et c'est très bien

`zones_actives` est un tableau JSON de 0 à 4 chaînes saisies à la main. Sur les
42 vols publiés, on y trouve :

```
"R 144 A"            "R45 S2 LANGRES"     "R590A MENDE SUD"
"R46 F3"             "R152 ALSACE"        "R3204A PILAT ONDE"
"R46A R46B R46C"     "R46D"               "NON"
```

**Le client se débrouille.** Il n'y a rien à normaliser côté site, et surtout
rien à migrer. Le rapprochement se fait dans
[`src/renderer/js/features/brief-zones.js`](src/renderer/js/features/brief-zones.js) :

1. **Normalisation des deux côtés** — majuscules, accents retirés, tout ce qui
   n'est ni lettre ni chiffre supprimé.
2. **Comparaison à l'identique** contre trois formes indexées par zone du SIA :
   `Type+Nom` (`R45S2`), `Type+Nom+NomUsuel` (`R45S2LANGRES`), `Nom+NomUsuel`.
3. **Un seul repli, strict** : si la chaîne entière échoue, elle est découpée sur
   les espaces, et n'est acceptée que si **tous** les morceaux se rapprochent.
   C'est ce qui résout `R46A R46B R46C` sans casser `R 144 A`, dont les espaces
   font partie du nom.

Pas de rapprochement approximatif, pas de préfixe, pas de distance d'édition : un
« à peu près » sur une zone réglementée ne vaut rien. C'est aussi ce qui évite
qu'un `NON` aille se rapprocher d'un `CTL|NO`.

**Mentions reconnues comme « aucune zone »** — jamais cherchées, jamais affichées
comme des échecs :

```
NON · AUCUNE · AUCUN · SANS OBJET · RAS · NÉANT · RIEN · NA
```

**Résultat sur la donnée réelle : 18 saisies de zones, 18 rapprochées, 0 inconnue.**

Une saisie non reconnue n'est pas une erreur bloquante : elle s'affiche **telle
quelle**, en ambre, avec la mention qu'aucune zone du cycle chargé n'y correspond.
L'application ne sait pas de quelle zone il s'agit ; le pilote, lui, saura
probablement la lire. Le décompte le dit (« 3 zones actives, et 1 saisie non
reconnue »).

> **Une saisie, plusieurs polygones.** Un espace du SIA peut être découpé en
> plusieurs parties et volumes. Une seule saisie les désigne tous : ils sont mis
> en évidence ensemble, et le panneau indique le nombre de parties.

---

## 5. Ce que le client refuse, et sous quel nom

Chaque échec porte un code, parce que « clé refusée », « hors ligne » et « rien de
publié » ne se corrigent pas de la même manière.

| Code | Cause | Message affiché |
|---|---|---|
| `nokey` | aucune clé enregistrée dans l'application | « Aucune clé CAVVA enregistrée » + bouton vers la saisie |
| `secret` | dépôt cloné sans `brief-secret.js` ni `CAP_CAVVA_BRIEF_SECRET` | « Cette copie de l'application n'a pas de secret de signature » |
| `unauthorized` | `401` / `403` | « Clé CAVVA refusée par le serveur. » + bouton vers la saisie |
| `absent` | `404` | « Aucune séance publiée pour le moment. » |
| `network` | injoignable, délai dépassé, autre code HTTP | « Serveur CAVVA injoignable. » |
| `signature` | signature absente, mal formée, ou ne correspondant pas | « Signature des briefs invalide : le contenu a été rejeté. » |
| `content` | JSON illisible, `date` hors format, `format` trop récent | « Briefs illisibles. » + le détail exact |

La signature est vérifiée **avant** tout `JSON.parse` : un contenu non signé n'est
jamais interprété.

---

## 6. Le côté CAVVA

`ToursCavvaController` est le modèle exact. Deux différences : la source est la
base et non un fichier, et la signature part en en-tête.

### La route

```php
// public/index.php, à côté de la route /tours-cavva
$routeur->get('/cap-cavva/briefs.json', [CapCavvaController::class, 'briefs']);
```

### Le contrôleur

```php
final class CapCavvaController
{
    public static function briefs(): never
    {
        CleApi::exigerMembre();

        $briefs = array_map(static fn (array $v): array => [
            'id'          => (string) $v['id'],
            'date'        => $v['date_vol'],
            'typeVol'     => $v['type_vol'],
            'rayonNm'     => (int) $v['rayon_depart'],
            'icaoArrivee' => $v['icao_arrivee'],
            'zones'       => VolAeroclub::zones($v['zones_actives']),
            'notes'       => $v['notes'],
            'fichier'     => $v['fichier_nom_origine'] ?? null,
        ], VolAeroclub::tous());

        $corps = json_encode(
            ['format' => 1, 'genere' => date('c'), 'briefs' => $briefs],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        );

        // Un espace ou un avertissement PHP émis avant les en-têtes corromprait
        // le corps — et la signature ne correspondrait plus.
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        header('Content-Type: application/json; charset=utf-8');
        header('Content-Length: ' . (string) strlen($corps));
        header('X-Cap-Signature: ' . hash_hmac(
            'sha256',
            $corps,
            hex2bin((string) Config::get('cap_cavva.cle_brief')),
        ));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store, private');

        echo $corps;
        exit;
    }
}
```

`VolAeroclub::tous()` et `VolAeroclub::zones()` existent déjà et font exactement
ce qu'il faut. `$corps` sert à la fois à signer et à émettre — c'est la seule
chose qui compte.

> **Déploiement.** Comme pour `tours-cavva/`, un vrai dossier `cap-cavva/` dans la
> racine web serait servi tel quel par Apache, sans passer par `index.php` — et
> les briefs seraient publics. Ce dossier ne doit pas exister dans `public/`.

---

## 7. Éprouver le client avant d'écrire le PHP

Un serveur de laboratoire sert les 42 vols, signés pour de bon, et sait jouer les
cas qui fâchent :

```bash
npm run brief:essai -- --cas=ok
```

| `--cas=` | Ce qu'il provoque |
|---|---|
| `ok` | collection valide, signature dans `briefs.json.sig` |
| `entete` | signature dans `X-Cap-Signature`, aucun `.sig` publié — **le mode recommandé** |
| `falsifie` | contenu modifié après signature → doit être **refusé** |
| `absent` | `404` |
| `refuse` | `401` |
| `malforme` | une `date` au format `17/02/2027` → le rang fautif doit être nommé |
| `futur` | `format: 2` → doit être refusé |

Puis, dans un autre terminal :

```bash
CAVVA_BASE_URL=http://127.0.0.1:8787 npm start
```

`CAVVA_BASE_URL` prime sur la configuration. La signature reste vérifiée dans tous
les cas : un serveur d'essai ne peut pas injecter d'autres zones actives.

Pour signer une collection à la main :

```bash
npm run brief:signer -- outils/briefs-exemple.json
```
