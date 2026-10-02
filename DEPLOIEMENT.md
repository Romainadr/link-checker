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

Prérequis : PowerShell 5.1+, module `ExchangeOnlineManagement` v3, git avec accès push au repo, rôle **Exchange Administrator** sur le tenant du client (GDAP suffit).

```powershell
cd C:\link-checker
git pull
.\tools\New-ClientManifest.ps1 -Client acme
```

Puis :

1. Compléter `clients/acme.json` : domaines mail du client, `acme.sharepoint.com`, `acme-my.sharepoint.com`, partenaires éventuels.
2. Publier la config : `git add clients/acme.json && git commit -m "client acme" && git push` (GitHub Pages sert le JSON en ~1 min).
3. Vérifier que `https://romainadr.github.io/link-checker/clients/acme.json` répond bien en HTTPS.
4. Déployer le manifest dans le tenant client via Exchange Online (méthode retenue le 2026-10-01, ne **pas** utiliser Applications intégrées en plus : doublons) :

   ```powershell
   Connect-ExchangeOnline -UserPrincipalName <vous>@empirys.com -DelegatedOrganization acme.onmicrosoft.com
   Get-App -OrganizationApp | Where-Object DisplayName -like '*Link*'   # doit être vide
   New-App -OrganizationApp -FileData ([System.IO.File]::ReadAllBytes('C:\link-checker\dist\manifest-acme.xml')) -ProvidedTo Everyone -DefaultStateForUser Enabled
   Disconnect-ExchangeOnline -Confirm:$false
   ```

   L'app n'apparaît pas dans le centre d'admin M365 (visible uniquement via `Get-App -OrganizationApp`) : noter la date et l'AppId dans la fiche client.
5. Propagation : souvent quelques heures, prévoir jusqu'à 24 h.

## Vérifications post-déploiement

Sur un mail de test dans le tenant client : expéditeur interne du client → « Domaine interne (client.com) » en pass, lien vers `acme.sharepoint.com` → pas de signalement multi-tenant, footer → version courante (`LC.VERSION` dans `src/core.js`), test sur Outlook mobile → résultat affiché (pas de spinner infini).

## Mise à jour

Le code (`src/`, `clients/`) se met à jour par simple `git push` : effet immédiat pour tous les tenants, aucun manifest à retoucher. Un changement de manifest (bouton, icônes, URLs, requirement sets) impose d'incrémenter `<Version>`, de régénérer les manifests clients (`New-ClientManifest.ps1`, le GUID est conservé via `manifestId` dans le JSON client) et de re-téléverser dans chaque tenant concerné.

## Risques / rollback

Un `git push` défectueux impacte tous les tenants d'un coup : tester en local avant de pousser, et garder un commit stable identifié pour `git revert`. Rollback côté tenant : `Remove-App -OrganizationApp -Identity <AppId>` (AppId via `Get-App -OrganizationApp`), effet en quelques heures. Le GUID par client isole chaque déploiement : retirer un client n'affecte pas les autres.

## Contraintes de conformité

L'analyse reste 100 % locale. La seule requête réseau ajoutée est le GET du JSON de config statique sur le GitHub Pages Empirys (même origine que l'add-in, aucune donnée du mail transmise). À mentionner si un client fait une revue sécurité.
