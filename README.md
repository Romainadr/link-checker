# Link Checker

Add-in Outlook anti-phishing développé par **EMPIRYS / CyberOne**. Il analyse en local le mail ouvert (liens, expéditeur, headers EOP, pièces jointes) et affiche un score de confiance sur 100. Aucune donnée du mail ne quitte le poste.

- Version applicative : voir `LC.VERSION` dans `src/core.js`
- Clients supportés : Outlook classique, nouvel Outlook, Outlook Web, Outlook iOS/Android
- Permission : `ReadItem` uniquement
- Hébergement : GitHub Pages (code unique, un manifest par tenant client)

## Structure

| Chemin | Rôle |
| --- | --- |
| `src/core.js` | Moteur d'analyse, sans dépendance à Office.js (`window.LC`) |
| `src/taskpane.html` | Volet Outlook : UI et glue Office.js |
| `src/commands.html` | FunctionFile du manifest |
| `manifest.xml` | Manifest de référence (tenant Empirys) |
| `clients/<slug>.json` | Config additive par tenant client |
| `tools/New-ClientManifest.ps1` | Génère `dist/manifest-<slug>.xml` pour un client |

## Documentation

- `DEPLOIEMENT.md` : onboarding d'un client (génération du manifest, publication de la config, `New-App`)
- `CONTEXTE-PROJET.md` : architecture, logique de détection, scoring, contraintes

## Règles

- Environnement de **production** : tout `git push` sur `main` est servi immédiatement à tous les tenants. Tester avant de pousser.
- Ne jamais remonter `DefaultMinVersion` au-dessus de 1.5 dans le bloc `VersionOverrides` mobile (Outlook iOS/Android).
- Usage interne Empirys, tous droits réservés.
