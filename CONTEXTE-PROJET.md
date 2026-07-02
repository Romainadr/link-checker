# Link Checker — Contexte projet

Add-in Outlook (Office Add-in, MailApp) développé par EMPIRYS / CyberOne. Il analyse **en local** un mail ouvert (lecture seule) pour détecter le phishing : incohérences de liens, signaux d'usurpation, headers anti-spam, pièces jointes dangereuses, puis affiche un **score de confiance /100**. Aucune donnée n'est transmise à l'extérieur.

- **Version applicative (LC.VERSION)** : `1.2.0`
- **Version manifest** : `1.0.2.0`
- **Hébergement** : GitHub Pages `https://romainadr.github.io/link-checker/`
- **Permissions** : `ReadItem` uniquement
- **Langue** : fr-FR
- **Contrainte projet** : environnement de prod, ne rien casser.

## Architecture des fichiers

```
link-checker/
├── manifest.xml          Manifest Office Add-in (V1_0 + V1_1 imbriqués)
├── src/
│   ├── core.js           Logique d'analyse (961 lignes) — expose window.LC
│   ├── taskpane.html     UI du volet + glue Office.js (taskpane.js inline)
│   └── commands.html     FunctionFile + handler onMessageRead (inerte tant que LaunchEvent non déclaré)
├── icon-*.png            Jeu d'icônes (16→144) + 3 icônes de notif (ok/warn/danger)
└── README.md
```

Séparation nette : `core.js` ne touche jamais au DOM Outlook ni à `Office.*`. Il prend en entrée des données brutes et renvoie un résultat. `taskpane.html` et `commands.html` font la glue Office.js et le rendu.

## manifest.xml — points clés

Double bloc `VersionOverrides` imbriqué :

- **V1_0** (`DefaultMinVersion 1.3`) : Outlook classique desktop. Bouton Ribbon « Vérifier les liens », IDs non préfixés (`btn1`, `grp1`, `Icon.16`...).
- **V1_1** (`DefaultMinVersion 1.5`) : OWA / Nouvel Outlook / mobile. IDs **préfixés `lc.`** pour éviter tout conflit avec le bloc V1_0. Active `<SupportsPinning>true</SupportsPinning>` (le volet survit à la navigation entre mails) et un `MobileFormFactor`. **Attention : ne jamais remonter le DefaultMinVersion au-dessus de 1.5** — Outlook iOS/Android supporte au max Mailbox 1.5, un MinVersion supérieur empêche le chargement sur mobile (spinner infini). Les APIs 1.8 (headers MIME) sont testées au runtime dans le JS.
- Icônes de notification (`lc.Notif.Ok/Warn/Danger`) déclarées en V1_1 seulement.

`commands.html` est référencé comme `FunctionFile` mais **le handler `onMessageRead` n'est pas actif** : il faudrait un `<ExtensionPoint xsi:type="LaunchEvent">` + `<Runtime>` (Mailbox 1.10+) pour l'activer. C'est documenté en commentaire dans le fichier.

## core.js — moteur d'analyse (`window.LC`)

API publique : `LC.analyze(input)` où `input = { from, fromDisplayName, subject, bodyHtml, mimeHeaders, item }`. Renvoie `{ integrity, headers, attachments, links, score }`.

Helpers exposés : `getDomain`, `getHostname`, `isTrustedDomain`, `isTrustedHostname`, `isOrgDomain`, `isSaasPlatformDomain`, `isIpAddress`, `isSchemeSafe`, `unwrapSafeLinks`, `normalizeText`, `matchKeywords`, `looksLikeUrl`, plus `_constants`.

### Référentiels de domaines (logique de trust)

- `ORG_DOMAINS` : domaines internes Empirys (empirys.com/.lu/.eu/.fr).
- `TRUSTED_ROOT` : eTLD+1 de confiance (Microsoft, Google, SaaS business usuels, partenaires Lux, ricoh). **Pas de SaaS multi-tenant ici.**
- `SAAS_PLATFORMS` : plateformes multi-tenant (amazonaws, azurewebsites, sharepoint.com, vercel.app, github.io...) — **jamais trusted** par défaut, on signale le sous-domaine à vérifier.
- `TRUSTED_HOSTNAMES` : trust granulaire au niveau hostname qui **override** SAAS_PLATFORMS (ex. `empirys.sharepoint.com`, `login.microsoftonline.com`, `romainadr.github.io`).
- `MULTI_LEVEL_TLDS` : corrige `getDomain()` pour les SLD composés (co.uk, gov.lu, com.au...).

### Déballage des liens protégés (`unwrapSafeLinks`)

Jusqu'à **3 niveaux** de déballage (double-wrap géré), filet de sécurité : ne ressort jamais autre chose que http(s). Supporte :

- Microsoft SafeLinks (`safelinks.protection.outlook.com`, `safelink.emails.azure.net`)
- Proofpoint v2 (`-`→`%`, `_`→`/`) et v3 (`/v3/__url__;`)
- Mimecast / mimecastprotect, Barracuda (`linkprotect.cudasvc.com`), Symantec (`clicktime.symantec.com`), Google (`/url?q=`)

### Détections sur les liens (`analyzeLinks`)

IP brute en URL, mismatch texte-affiché/destination, lien sans texte vers domaine non répertorié, raccourcisseurs d'URL (`URL_SHORTENERS`), TLD suspects (`SUSPECT_TLDS` : xyz, top, zip, mov, tk...), hébergement multi-tenant, mots-clés sensibles + usurpation de marque (`checkSuspiciousDomain`), **entropie de domaine** (DGA/jetables : ratio consonnes/voyelles, excès de chiffres, tirets multiples), **homoglyphes / punycode IDN** (`checkHomoglyphs`).

### Headers anti-spam EOP (`analyzeHeaders`)

Parse les headers MIME (via `getAllInternetHeadersAsync`, Mailbox 1.8+) : **SCL**, **BCL**, **CAT** (catégorie EOP : PHSH/HPHSH/MALW/SPM...), **Authentication-Results** (SPF/DKIM/DMARC), **Reply-To vs From** (ignore les hosts Exchange internes type `*.prod.outlook.com`). Si indispo (mail interne/non-M365), renvoie un `warn` neutre.

### Pièces jointes (`analyzeAttachments`)

Double extension (ex. `facture.pdf.exe`), extensions dangereuses (`DANGEROUS_EXTENSIONS`, à jour 2024-2026 : settingcontent-ms, appinstaller, xll...), macros Office (`MACRO_EXTENSIONS`), archives, noms génériques (`GENERIC_ATTACHMENT_NAMES` : invoice, dhl, scan...).

### Intégrité (`checkIntegrity`)

Expéditeur (interne/trusted/suspect), sujet et corps via listes de mots-clés FR/EN (HIGH/LOW) avec normalisation d'accents et logique de **signal croisé** (les LOW ne déclenchent que si un autre signal est présent), domaines de destination, **display name spoofing**, ratio texte/HTML (mail 100% image), cohérence expéditeur/liens.

### Scoring (`computeScore`)

Part de 100 et soustrait par check selon gravité. Pénalités fortes : EOP PHSH (-30), double extension (-30), SCL fail / sender fail / ext dangereuse / body fail / display-spoof (-25). Mismatch liens : -15 le 1er puis -10 (cap -40). Liens suspects : -10 (cap -30). Résultat borné [0,100].

Seuils d'affichage (bannière + notif) : >90 confiance élevée, 75-90 correcte, 50-74 vigilance, 25-49 risque élevé, <25 risque critique.

## UI (taskpane.html)

Charte Empirys/CyberOne (rouge `#C8102E`), dark mode supporté. Sections : score, intégrité, headers, pièces jointes, liens (triés mismatch d'abord). Garde anti-runs concurrents (`runToken`). Gère le **pinning** via `ItemChanged` (ré-analyse au changement de mail). Notifications mailbox via `notificationMessages.replaceAsync` avec icône bouclier selon score (V1_1) ou fallback `Icon.16` (V1_0).

## État git actuel

Branche avec modifs **non commitées** : `manifest.xml`, `src/core.js`, `src/taskpane.html`. Derniers commits : `modif css3`, `modif manifest`, `mdofi core`, `revue de lalgo`. Historique antérieur : ajout déballage double SafeLinks + reply-to + liens cliquables, whitelist Mimecast/Barracuda/Ricoh, TLD suspects, check pièces jointes, scoring.

## Multi-tenant (v1.2.0)

L'add-in se déploie dans plusieurs tenants clients avec le même hébergement GitHub Pages, branding Empirys conservé. Deux mécanismes : **auto-org** (le domaine de la boîte de l'utilisateur devient domaine interne au runtime, via `LC.configure`) et **config statique** `clients/<slug>.json` chargée par `?client=<slug>` (additive uniquement, timeout 3 s, non bloquante). Génération des manifests clients (GUID unique persisté dans le JSON client) : `tools/New-ClientManifest.ps1 -Client <slug>` → `dist/manifest-<slug>.xml`. Procédure complète : `DEPLOIEMENT.md`.

Le taskpane embarque aussi depuis v1.2.0 : watchdog 20 s anti-spinner-infini, fallback `CoercionType.Text` si le HTML n'est pas renvoyé, try/catch autour de l'analyse avec bannière d'erreur, retry d'icône de notification (`lc.Notif.*` → `Icon.16`).

## Points d'attention / pistes

- `commands.html` (`onMessageRead`) n'est pas activé : LaunchEvent absent du manifest → analyse auto à l'ouverture impossible en l'état.
- Trust statique en dur dans `core.js` : toute évolution de whitelist = redéploiement GitHub Pages.
- Headers EOP indisponibles hors M365 / Mailbox < 1.8 → dégradation propre mais perte de signal.
