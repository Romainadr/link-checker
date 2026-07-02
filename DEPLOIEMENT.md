# Link Checker — Déploiement multi-tenant

Un seul hébergement (GitHub Pages Empirys) sert tous les clients. Chaque tenant client reçoit son propre manifest (GUID unique + config dédiée), le branding reste Empirys/CyberOne partout.

## Architecture multi-tenant

```
GitHub Pages (romainadr.github.io/link-checker)   ← code unique, maintenu par Empirys
├── src/taskpane.html?client=<slug>               ← le manifest de chaque client pointe ici
├── clients/<slug>.json                           ← référentiels propres au client (additifs)
└── manifest.xml                                  ← référence, tenant Empirys

Tenant client A ── manifest-a.xml (GUID A) ──┐
Tenant client B ── manifest-b.xml (GUID B) ──┼──► même code, config par ?client=
Tenant Empirys ─── manifest.xml ─────────────┘
```

Deux mécanismes de personnalisation, sans redéploiement de code :

1. **Auto-org (aucune config requise)** : au runtime, le domaine de la boîte de l'utilisateur (`userProfile.emailAddress`) est ajouté aux domaines internes/de confiance. Un déploiement sans fichier client fonctionne donc déjà correctement.
2. **Config statique `clients/<slug>.json`** : domaines secondaires du client, partenaires, hostnames SharePoint (`client.sharepoint.com`). Chargée par le taskpane via `?client=<slug>`, timeout 3 s, jamais bloquante. Les listes sont additives, une config ne peut pas dégrader la détection.

## Onboarder un nouveau client

Prérequis : PowerShell 5+, droits d'admin global (ou Exchange admin) dans le tenant du client.

```powershell
cd link-checker
.\tools\New-ClientManifest.ps1 -Client acme
```

Puis :

1. Compléter `clients/acme.json` : domaines mail du client, `acme.sharepoint.com`, `acme-my.sharepoint.com`, partenaires éventuels.
2. Publier la config : `git add clients/acme.json dist/ && git commit -m "client acme" && git push` (GitHub Pages sert le JSON en ~1 min).
3. Vérifier que `https://romainadr.github.io/link-checker/clients/acme.json` répond bien en HTTPS.
4. Déployer le manifest dans le tenant client : **Microsoft 365 admin center → Paramètres → Applications intégrées → Charger des applications personnalisées → Application Office → Charger le manifest** (`dist/manifest-acme.xml`), puis affecter les utilisateurs/groupes.
5. Propagation : jusqu'à 24 h officiellement, souvent moins. Tester sur un pilote avant affectation large.

## Vérifications post-déploiement

Sur un mail de test dans le tenant client : expéditeur interne du client → « Domaine interne (client.com) » en pass, lien vers `acme.sharepoint.com` → pas de signalement multi-tenant, footer → v1.2.0, test sur Outlook mobile → résultat affiché (pas de spinner infini).

## Mise à jour

Le code (`src/`, `clients/`) se met à jour par simple `git push` : effet immédiat pour tous les tenants, aucun manifest à retoucher. Un changement de manifest (bouton, icônes, URLs, requirement sets) impose d'incrémenter `<Version>`, de régénérer les manifests clients (`New-ClientManifest.ps1`, le GUID est conservé via `manifestId` dans le JSON client) et de re-téléverser dans chaque tenant concerné.

## Risques / rollback

Un `git push` défectueux impacte tous les tenants d'un coup : tester en local avant de pousser, et garder un commit stable identifié pour `git revert`. Rollback côté tenant : Applications intégrées → l'application → Supprimer (ou retirer l'affectation), effet en quelques heures. Le GUID par client isole chaque déploiement : retirer un client n'affecte pas les autres.

## Contraintes de conformité

L'analyse reste 100 % locale. La seule requête réseau ajoutée est le GET du JSON de config statique sur le GitHub Pages Empirys (même origine que l'add-in, aucune donnée du mail transmise). À mentionner si un client fait une revue sécurité.
