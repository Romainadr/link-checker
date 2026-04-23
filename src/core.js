/* ===================================================================
   Link Checker — core.js
   Logique partagee entre taskpane.html (UI) et commands.html (event).
   Expose window.LC.
   =================================================================== */
(function () {
  'use strict';

  /* ================================================================
     CONSTANTES
     ================================================================ */

  var ORG_DOMAINS = new Set(['empirys.com', 'empirys.lu', 'empirys.eu', 'empirys.fr']);

  /* Domaines "registrables" (eTLD+1) consideres comme trusted.
     PAS de SaaS multi-tenant ici — utiliser SAAS_PLATFORMS + TRUSTED_HOSTNAMES. */
  var TRUSTED_ROOT = new Set([
    // Empirys
    'empirys.com', 'empirys.lu', 'empirys.eu', 'empirys.fr',
    // Microsoft / Office
    'microsoft.com', 'office.com', 'outlook.com', 'live.com', 'office365.com',
    'teams.microsoft.com', 'aka.ms',
    // Google / Apple / Meta / X
    'google.com', 'gmail.com', 'apple.com', 'icloud.com', 'youtube.com',
    'linkedin.com', 'github.com', 'gitlab.com', 'twitter.com', 'x.com',
    'facebook.com', 'instagram.com', 'whatsapp.com',
    // SaaS business usuels (domaines controles par l'editeur)
    'odoo.com', 'docusign.com', 'dropbox.com', 'adobe.com', 'notion.so',
    'airtable.com', 'asana.com', 'trello.com', 'canva.com', 'figma.com',
    'jira.com', 'monday.com', 'shopify.com', 'zoom.us', 'slack.com',
    'netflix.com', 'spotify.com', 'paypal.com',
    // Luxembourg / partenaires
    'made-in-luxembourg.com', 'made-in-luxembourg.lu', 'restez-mieux.fr',
    'ricoh.com', 'ricoh.lu'
  ]);

  /* Plateformes SaaS multi-tenant : n'importe qui y publie un sous-domaine.
     Ne JAMAIS considerer comme trusted sans match explicite dans TRUSTED_HOSTNAMES. */
  var SAAS_PLATFORMS = new Set([
    'amazonaws.com', 'cloudfront.net',
    'windows.net', 'azurewebsites.net', 'azure.com', 'azure.net',
    'sharepoint.com',
    'github.io', 'gitlab.io', 'pages.dev',
    'netlify.app', 'vercel.app', 'web.app', 'firebaseapp.com',
    'herokuapp.com', 'cloudflare.com', 'workers.dev'
  ]);

  /* Trust granulaire au niveau hostname (sur-ride SAAS_PLATFORMS). */
  var TRUSTED_HOSTNAMES = new Set([
    'empirys.sharepoint.com', 'empirys-my.sharepoint.com',
    'login.microsoftonline.com', 'login.live.com',
    'accounts.google.com',
    'romainadr.github.io'
  ]);

  /* TLDs composes — corrige getDomain() pour .co.uk, .gov.lu, .com.au, ... */
  var MULTI_LEVEL_TLDS = new Set([
    'co.uk', 'co.jp', 'co.kr', 'co.nz', 'co.in', 'co.il', 'co.za',
    'com.au', 'com.br', 'com.mx', 'com.ar', 'com.tr', 'com.cn',
    'gov.uk', 'gov.lu', 'gov.fr', 'ac.uk',
    'org.uk', 'net.au', 'org.au'
  ]);

  var SUSPICIOUS_KEYWORDS = [
    'bank', 'banque', 'paypal', 'secure', 'security', 'login',
    'signin', 'account', 'verify', 'update', 'confirm', 'alert',
    'suspend', 'locked', 'urgent', 'password', 'credential',
    'wallet', 'crypto', 'invoice', 'payment', 'billing',
    'support-', '-support', 'helpdesk', 'service-client'
  ];

  var BRAND_NAMES = [
    'microsoft', 'google', 'apple', 'amazon', 'paypal', 'netflix',
    'facebook', 'instagram', 'whatsapp', 'linkedin', 'twitter',
    'dropbox', 'adobe', 'oracle', 'salesforce', 'docusign',
    'stripe', 'shopify', 'zoom', 'slack', 'outlook', 'office365',
    'onedrive', 'sharepoint', 'teams'
  ];

  var SUBJECT_HIGH = [
    'urgent', 'immediate', 'action requise', 'action required',
    'suspend', 'bloqu', 'locked', 'desactiv', 'disabled',
    'mot de passe', 'password',
    'derniere chance', 'last chance',
    'acces non autorise', 'unauthorized access',
    'vous avez gagne', 'felicitations vous', 'congratulations you'
  ];

  var SUBJECT_LOW = [
    'verif', 'confirm', 'securite', 'security', 'alerte', 'alert',
    'facture', 'invoice', 'paiement', 'payment',
    'compte', 'account', 'mise a jour', 'update',
    'remboursement', 'refund', 'renouvel', 'limite', 'limited',
    'expir'
  ];

  var BODY_HIGH = [
    'cliquez ici immediatement', 'click here immediately',
    'votre compte sera suspend', 'votre compte sera desactiv',
    'votre compte sera ferm', 'votre compte sera bloqu',
    'your account will be suspend', 'your account will be terminat',
    'your account will be clos', 'your account will be lock',
    'verifiez votre identite', 'verify your identity',
    'confirmer vos informations', 'confirm your information',
    'mot de passe expire', 'password expired',
    'acces non autorise', 'unauthorized access',
    'activite suspecte', 'suspicious activity',
    'ouvrir la piece jointe', 'open the attachment',
    'repondez immediatement', 'respond immediately',
    'action immediate requise', 'immediate action required',
    'sous peine de', 'failure to comply'
  ];

  var BODY_LOW = [
    'dans les 24', 'within 24', 'dans les 48', 'within 48',
    'cliquez sur le lien', 'click the link',
    'telecharger le document', 'download the document',
    'mettre a jour vos informations', 'update your information',
    'connectez-vous', 'log in to your account'
  ];

  var URL_SHORTENERS = new Set([
    'bit.ly', 'tinyurl.com', 't.co', 'ow.ly', 'goo.gl',
    'is.gd', 'buff.ly', 'adf.ly', 'bl.ink', 'lnkd.in',
    'shorturl.at', 'rb.gy', 'cutt.ly', 'v.gd', 'qr.ae',
    'tiny.cc', 'soo.gd', 'short.io', 'rebrand.ly', 'yourls.org',
    'dub.sh', 'clck.ru', 'mcaf.ee', 'su.pr', 'u.to',
    'shrtco.de', 'hyperurl.co', 'urlz.fr', 'lc.cx'
  ]);

  var SUSPECT_TLDS = new Set([
    'xyz', 'top', 'buzz', 'click', 'link', 'surf', 'rest',
    'icu', 'cam', 'monster', 'cyou', 'cfd', 'sbs', 'quest',
    'beauty', 'hair', 'makeup', 'skin', 'boats', 'stream',
    'gdn', 'bid', 'trade', 'win', 'review', 'racing',
    'party', 'science', 'work', 'cricket', 'date', 'faith',
    'loan', 'download', 'accountant', 'christmas', 'zip', 'mov',
    'tk', 'ml', 'ga', 'cf', 'gq'
  ]);

  var DANGEROUS_EXTENSIONS = new Set([
    'exe', 'scr', 'bat', 'cmd', 'com', 'pif', 'vbs', 'vbe',
    'js', 'jse', 'wsf', 'wsh', 'ps1', 'psm1',
    'msi', 'msp', 'hta', 'cpl', 'inf', 'reg',
    'iso', 'img', 'vhd', 'vhdx',
    'lnk', 'url', 'iqy', 'slk',
    'dll', 'ocx', 'sys', 'drv',
    /* Ajouts 2024-2026 */
    'msc', 'xll', 'appref-ms', 'appinstaller', 'jnlp',
    'chm', 'scf', 'mht', 'mhtml', 'wll', 'application',
    'diagcab', 'diagcfg', 'settingcontent-ms'
  ]);

  var MACRO_EXTENSIONS = new Set([
    'docm', 'xlsm', 'pptm', 'dotm', 'xltm', 'potm',
    'xlam', 'ppam', 'sldm'
  ]);

  var ARCHIVE_EXTENSIONS = new Set([
    'zip', 'rar', '7z', 'tar', 'gz', 'cab', 'arj', 'ace'
  ]);

  var GENERIC_ATTACHMENT_NAMES = new Set([
    'document', 'fichier', 'file', 'invoice', 'facture',
    'scan', 'copie', 'copy', 'payment', 'paiement',
    'order', 'commande', 'receipt', 'recu', 'img', 'photo',
    'dhl', 'fedex', 'ups', 'delivery', 'livraison'
  ]);

  /* ================================================================
     HELPERS
     ================================================================ */

  function getHostname(raw) {
    try {
      var s = String(raw).trim();
      if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
      return new URL(s).hostname.toLowerCase().replace(/^www\./, '');
    } catch (e) { return ''; }
  }

  /* eTLD+1 correct, gere SLDs composes (co.uk, gov.lu, ...). */
  function getDomain(raw) {
    var host = getHostname(raw);
    if (!host) return '';
    var parts = host.split('.');
    if (parts.length < 2) return host;
    var last2 = parts.slice(-2).join('.');
    if (parts.length >= 3 && MULTI_LEVEL_TLDS.has(last2)) {
      return parts.slice(-3).join('.');
    }
    return last2;
  }

  function getDomainFromEmail(email) {
    if (!email) return '';
    var parts = String(email).split('@');
    if (parts.length < 2) return '';
    return getDomain(parts[1]);
  }

  function getTld(hostname) {
    if (!hostname) return '';
    var p = hostname.split('.');
    return p.length >= 2 ? p[p.length - 1] : '';
  }

  function isOrgDomain(domain) { return ORG_DOMAINS.has(domain); }

  function isSaasPlatformDomain(domain) { return SAAS_PLATFORMS.has(domain); }

  function isTrustedHostname(hostname) { return !!hostname && TRUSTED_HOSTNAMES.has(hostname); }

  /* Entree : hostname OU eTLD+1.
     Refuse systematiquement les SaaS multi-tenant sauf override via TRUSTED_HOSTNAMES. */
  function isTrustedDomain(input) {
    if (!input) return false;
    if (TRUSTED_HOSTNAMES.has(input)) return true;
    var reg = getDomain(input);
    if (!reg) return false;
    if (SAAS_PLATFORMS.has(reg)) return false;
    return TRUSTED_ROOT.has(reg);
  }

  function isSchemeSafe(url) { return /^https?:\/\//i.test(url); }

  function isUrlShortener(hostname) { return URL_SHORTENERS.has(hostname); }

  /* ================================================================
     UNWRAP (SafeLinks, Proofpoint, Mimecast, Barracuda, Symantec, Google)
     ================================================================ */

  function unwrapProofpoint(href) {
    try {
      var u = new URL(href);
      var path = u.pathname;
      /* v2 : /v2/url?u=<encoded> ; Proofpoint remplace '-' par '%' et '_' par '/' */
      if (path.indexOf('/v2/url') === 0) {
        var q = u.searchParams.get('u');
        if (q) {
          var decoded = q.replace(/-/g, '%').replace(/_/g, '/');
          try { return decodeURIComponent(decoded); } catch (e) { return q; }
        }
      }
      /* v3 : /v3/__<url>__;<base64>! — on extrait l'URL brute entre __...__ */
      var v3 = /\/v3\/__(.+?)__;/.exec(path + u.search);
      if (v3) {
        try { return decodeURIComponent(v3[1]); } catch (e) { return v3[1]; }
      }
    } catch (e) {}
    return null;
  }

  function unwrapSafeLinks(href) {
    var current = String(href);
    for (var d = 0; d < 3; d++) {
      var next = null;
      try {
        var u = new URL(current);
        var h = u.hostname.toLowerCase();

        if (h === 'safelinks.protection.outlook.com' || h.endsWith('.safelinks.protection.outlook.com')) {
          next = u.searchParams.get('url');
        } else if (h.endsWith('safelink.emails.azure.net') || h.indexOf('safelinks.') === 0) {
          next = u.searchParams.get('destination') || u.searchParams.get('url');
        } else if (h === 'google.com' || h === 'www.google.com') {
          if (u.pathname === '/url') next = u.searchParams.get('q') || u.searchParams.get('url');
        } else if (h.endsWith('urldefense.proofpoint.com') || h.endsWith('urldefense.com')) {
          next = unwrapProofpoint(current);
        } else if (/\.mimecast(protect)?\.com$/.test(h) || h.endsWith('mailanyone.net')) {
          next = u.searchParams.get('domain') || u.searchParams.get('dest') || u.searchParams.get('url');
        } else if (h.endsWith('linkprotect.cudasvc.com')) {
          next = u.searchParams.get('a');
        } else if (h.endsWith('clicktime.symantec.com')) {
          next = u.searchParams.get('u');
        }
      } catch (e) { break; }
      if (!next || next === current) break;
      current = next;
    }
    /* Filet de securite : on ne ressort jamais avec autre chose que http(s) */
    return isSchemeSafe(current) ? current : href;
  }

  /* ================================================================
     TEXT MATCHING
     ================================================================ */

  function normalizeText(t) {
    if (!t) return '';
    try {
      return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/\s+/g, ' ');
    } catch (e) {
      return String(t).toLowerCase()
        .replace(/[eéèêë]/g, 'e').replace(/[aàâä]/g, 'a')
        .replace(/[iîï]/g, 'i').replace(/[oôö]/g, 'o')
        .replace(/[uùûü]/g, 'u').replace(/[cç]/g, 'c')
        .replace(/\s+/g, ' ');
    }
  }

  var _kwCache = new Map();
  function buildKeywordRegex(keywords) {
    var key = keywords.join('|');
    if (_kwCache.has(key)) return _kwCache.get(key);
    var escaped = keywords.map(function (k) {
      return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    /* bornes custom : pas d'alphanum avant ni apres le match */
    var re = new RegExp('(?:^|[^a-z0-9])(' + escaped.join('|') + ')(?=[^a-z0-9]|$)', 'gi');
    _kwCache.set(key, re);
    return re;
  }

  function matchKeywords(normText, keywords) {
    var re = buildKeywordRegex(keywords);
    re.lastIndex = 0;
    var hits = new Set(), m;
    while ((m = re.exec(normText)) !== null) hits.add(m[1].toLowerCase());
    return Array.from(hits);
  }

  /* Plus stricte que l'ancienne : exige une TLD alphabetique finale. */
  function looksLikeUrl(t) {
    t = String(t).trim();
    if (/^https?:\/\//i.test(t)) return true;
    return /^[a-z][a-z0-9\-]*(?:\.[a-z0-9\-]+)*\.[a-z]{2,}$/i.test(t);
  }

  /* ================================================================
     DOMAINE SUSPECT
     ================================================================ */

  function checkSuspiciousDomain(domain) {
    if (!domain || isTrustedDomain(domain)) return null;
    var lower = domain.toLowerCase();
    var reasons = [];

    for (var i = 0; i < SUSPICIOUS_KEYWORDS.length; i++) {
      if (lower.indexOf(SUSPICIOUS_KEYWORDS[i]) !== -1) {
        reasons.push('Mot-cle sensible "' + SUSPICIOUS_KEYWORDS[i] + '" dans le domaine');
        break;
      }
    }

    var base = lower.split('.')[0];
    for (var j = 0; j < BRAND_NAMES.length; j++) {
      var brand = BRAND_NAMES[j];
      if (base.indexOf(brand) !== -1 && base !== brand) {
        reasons.push('Possible usurpation de marque "' + brand + '"');
        break;
      }
    }

    return reasons.length > 0 ? reasons : null;
  }

  /* ================================================================
     PARSING MAIL (single pass DOM)
     ================================================================ */

  function parseBody(html) {
    try {
      var doc = new DOMParser().parseFromString(html || '', 'text/html');
      return { doc: doc, text: doc.body ? doc.body.textContent : '' };
    } catch (e) { return { doc: null, text: '' }; }
  }

  function extractLinks(doc) {
    if (!doc) return [];
    var anchors = doc.querySelectorAll('a[href]');
    var out = [];
    for (var i = 0; i < anchors.length; i++) {
      var rawHref = (anchors[i].getAttribute('href') || '').trim();
      if (!rawHref || /^(mailto:|tel:|#|javascript:|data:|vbscript:)/i.test(rawHref)) continue;
      var text = (anchors[i].textContent || '').replace(/\s+/g, ' ').trim();
      out.push({ rawHref: rawHref, text: text });
    }
    return out;
  }

  function analyzeLinks(rawLinks) {
    var results = [];
    for (var i = 0; i < rawLinks.length; i++) {
      var rawHref = rawLinks[i].rawHref;
      var text = rawLinks[i].text;

      var href = unwrapSafeLinks(rawHref);
      if (!isSchemeSafe(href)) continue;
      var isSafeLinks = (href !== rawHref);

      var hrefHostname = getHostname(href);
      var hrefDomain = getDomain(href);
      if (!hrefDomain) continue;

      var trusted = isTrustedHostname(hrefHostname) || isTrustedDomain(hrefDomain);

      var mismatch = false, suspicious = false, reason = '';
      var warnings = [];

      var textIsEmail = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(text);
      if (!textIsEmail && !trusted && looksLikeUrl(text)) {
        var textDomain = getDomain(text);
        if (textDomain && textDomain !== hrefDomain) {
          mismatch = true;
          reason = 'Le texte affiche "' + textDomain + '" mais le lien pointe vers "' + hrefDomain + '"';
        }
      }

      if (!text && !trusted) {
        suspicious = true;
        warnings.push('Lien sans texte visible vers un domaine non-repertorie');
      }

      if (isUrlShortener(hrefHostname)) {
        suspicious = true;
        warnings.push('Lien raccourci (' + hrefHostname + ') masquant la destination reelle');
      }

      var tld = getTld(hrefHostname);
      if (tld && SUSPECT_TLDS.has(tld) && !trusted) {
        suspicious = true;
        warnings.push('TLD suspect ".' + tld + '" frequemment utilise dans le phishing');
      }

      /* SaaS multi-tenant : signaler le sous-domaine a verifier. */
      if (SAAS_PLATFORMS.has(hrefDomain) && !isTrustedHostname(hrefHostname)) {
        suspicious = true;
        warnings.push('Heberge sur plateforme multi-tenant (' + hrefDomain + '), verifier le sous-domaine : ' + hrefHostname);
      }

      var suspReasons = checkSuspiciousDomain(hrefDomain);
      if (suspReasons && !trusted) {
        suspicious = true;
        for (var r = 0; r < suspReasons.length; r++) {
          if (warnings.indexOf(suspReasons[r]) === -1) warnings.push(suspReasons[r]);
        }
      }

      if (!mismatch && warnings.length > 0) reason = warnings.join(' | ');

      results.push({
        text: text || '(vide)',
        href: href,
        rawHref: rawHref,
        hrefDomain: hrefDomain,
        hrefHostname: hrefHostname,
        mismatch: mismatch || suspicious,
        isMismatch: mismatch,
        isSuspicious: suspicious,
        reason: reason,
        warnings: warnings,
        safelinks: isSafeLinks,
        trusted: trusted
      });
    }
    return results;
  }

  /* ================================================================
     HEADERS (EOP)
     ================================================================ */

  function unfoldHeaders(raw) {
    return String(raw || '').replace(/\r?\n[ \t]+/g, ' ');
  }

  function matchHeader(unfolded, name) {
    var re = new RegExp('^' + name + ':\\s*([^\\r\\n]+)', 'im');
    var m = unfolded.match(re);
    return m ? m[1].trim() : null;
  }

  function extractAuthResult(authStr, method) {
    var re = new RegExp(method + '=([a-z]+)', 'i');
    var m = authStr.match(re);
    return m ? m[1].toLowerCase() : null;
  }

  function analyzeHeaders(raw) {
    var checks = [];
    if (!raw) {
      return [{ id: 'headers', label: 'Headers anti-spam', status: 'warn',
        detail: 'Headers MIME indisponibles (client non supporte ou mail local)' }];
    }
    var u = unfoldHeaders(raw);

    /* SCL */
    var scl = null;
    var sclLine = matchHeader(u, 'X-MS-Exchange-Organization-SCL');
    if (sclLine) scl = parseInt(sclLine, 10);
    if (scl === null || isNaN(scl)) {
      var antispam = matchHeader(u, 'X-Forefront-Antispam-Report');
      if (antispam) {
        var mm = antispam.match(/SCL:(-?\d+)/i);
        if (mm) scl = parseInt(mm[1], 10);
      }
    }
    if (scl !== null && !isNaN(scl)) {
      if (scl <= 0) checks.push({ id: 'scl', label: 'SCL (Spam Confidence)', status: 'pass', detail: 'SCL = ' + scl + ' — Message de confiance (bypass anti-spam ou interne)' });
      else if (scl <= 3) checks.push({ id: 'scl', label: 'SCL (Spam Confidence)', status: 'pass', detail: 'SCL = ' + scl + ' — Niveau de spam faible' });
      else if (scl <= 5) checks.push({ id: 'scl', label: 'SCL (Spam Confidence)', status: 'warn', detail: 'SCL = ' + scl + ' — Niveau de spam modere, prudence' });
      else checks.push({ id: 'scl', label: 'SCL (Spam Confidence)', status: 'fail', detail: 'SCL = ' + scl + ' — Niveau de spam eleve, message tres suspect' });
    }

    /* BCL */
    var antispamLine = matchHeader(u, 'X-Forefront-Antispam-Report') || u;
    var bclMatch = antispamLine.match(/BCL:(\d+)/i);
    if (bclMatch) {
      var bcl = parseInt(bclMatch[1], 10);
      if (bcl <= 3) checks.push({ id: 'bcl', label: 'BCL (Bulk / Masse)', status: 'pass', detail: 'BCL = ' + bcl + ' — Expediteur avec peu de plaintes' });
      else if (bcl <= 6) checks.push({ id: 'bcl', label: 'BCL (Bulk / Masse)', status: 'warn', detail: 'BCL = ' + bcl + ' — Envois en masse (taux de plaintes modere)' });
      else checks.push({ id: 'bcl', label: 'BCL (Bulk / Masse)', status: 'fail', detail: 'BCL = ' + bcl + ' — Fort taux de plaintes, probable spam' });
    }

    /* CAT (EOP category) */
    var catMatch = antispamLine.match(/CAT:([A-Z]+)/i);
    if (catMatch) {
      var cat = catMatch[1].toUpperCase();
      var catLabels = {
        'NONE':  { status: 'pass', text: 'Aucune menace detectee par EOP' },
        'SPM':   { status: 'warn', text: 'Classe comme spam par EOP' },
        'HSPM':  { status: 'fail', text: 'Classe comme spam haute confiance par EOP' },
        'PHSH':  { status: 'fail', text: 'Classe comme PHISHING par EOP', id: 'eop-phsh' },
        'HPHSH': { status: 'fail', text: 'Classe comme phishing haute confiance par EOP' },
        'MALW':  { status: 'fail', text: 'MALWARE detecte par EOP' },
        'BULK':  { status: 'warn', text: 'Classe comme envoi de masse (bulk) par EOP' },
        'GIMP':  { status: 'pass', text: 'Source autorisee (Mailbox Intelligence)' },
        'SAP':   { status: 'pass', text: 'Politique anti-spam approuvee' },
        'OSPM':  { status: 'warn', text: 'Spam sortant detecte' }
      };
      var info = catLabels[cat] || { status: 'warn', text: 'Categorie EOP : ' + cat };
      checks.push({ id: info.id || 'eop-cat', label: 'Categorie EOP', status: info.status, detail: info.text });
    }

    /* Authentication-Results */
    var authLine = matchHeader(u, 'Authentication-Results');
    if (authLine) {
      var spf = extractAuthResult(authLine, 'spf');
      var dkim = extractAuthResult(authLine, 'dkim');
      var dmarc = extractAuthResult(authLine, 'dmarc');
      var parts = [], fails = 0, passes = 0;
      if (spf)   { parts.push('SPF=' + spf);   if (spf === 'pass') passes++; else if (spf === 'fail' || spf === 'softfail') fails++; }
      if (dkim)  { parts.push('DKIM=' + dkim); if (dkim === 'pass') passes++; else if (dkim === 'fail') fails++; }
      if (dmarc) { parts.push('DMARC=' + dmarc); if (dmarc === 'pass') passes++; else if (dmarc === 'fail') fails++; }
      if (parts.length) {
        var status = 'pass', msg = parts.join(', ');
        if (fails >= 2) { status = 'fail'; msg += ' — Authentification defaillante, usurpation probable'; }
        else if (fails >= 1) { status = 'warn'; msg += ' — Echec partiel d\'authentification'; }
        else if (passes >= 2) { msg += ' — Authentification valide'; }
        checks.push({ id: 'auth', label: 'Authentification (SPF/DKIM/DMARC)', status: status, detail: msg });
      }
    }

    /* Reply-To vs From */
    var EMAIL_RE = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/;
    var EXCHANGE_INTERNAL_RE = /\.(prod\.exchangelabs\.com|protection\.outlook\.com|outlook\.office365\.com|namprd\d+\.prod\.outlook\.com|eurprd\d+\.prod\.outlook\.com)$/i;
    var rtLine = matchHeader(u, 'Reply-To');
    var frLine = matchHeader(u, 'From');
    if (rtLine && frLine) {
      var rtM = rtLine.match(EMAIL_RE);
      var frM = frLine.match(EMAIL_RE);
      if (rtM && frM) {
        var rt = rtM[1].toLowerCase();
        var fr = frM[1].toLowerCase();
        var rtHost = (rt.split('@')[1] || '').toLowerCase();
        if (rt !== fr && !EXCHANGE_INTERNAL_RE.test(rtHost)) {
          var rtReg = getDomainFromEmail(rt);
          var frReg = getDomainFromEmail(fr);
          if (rtReg !== frReg) {
            checks.push({ id: 'reply-to', label: 'Reply-To divergent', status: 'fail',
              detail: 'From: ' + fr + ' mais Reply-To: ' + rt + ' — domaines differents, usurpation probable' });
          }
          /* meme domaine : signal trop faible, pas de check genere */
        }
      }
    }

    if (checks.length === 0) {
      checks.push({ id: 'headers', label: 'Headers anti-spam', status: 'warn',
        detail: 'Aucun header anti-spam EOP detecte (mail interne ou non-M365)' });
    }
    return checks;
  }

  /* ================================================================
     PIECES JOINTES
     ================================================================ */

  function analyzeAttachments(item) {
    var attachments = (item && item.attachments) ? item.attachments : [];
    if (attachments.length === 0) {
      return [{ id: 'attach', label: 'Pieces jointes', status: 'pass', detail: 'Aucune piece jointe' }];
    }
    var dangerous = [], macro = [], archive = [], dbl = [], generic = [];
    for (var i = 0; i < attachments.length; i++) {
      var att = attachments[i];
      var name = (att.name || '').toLowerCase();
      var parts = name.split('.');

      if (parts.length >= 3) {
        var lastExt = parts[parts.length - 1];
        if (DANGEROUS_EXTENSIONS.has(lastExt)) { dbl.push(att.name); continue; }
      }
      var ext = parts.length >= 2 ? parts[parts.length - 1] : '';
      if (DANGEROUS_EXTENSIONS.has(ext)) dangerous.push(att.name);
      else if (MACRO_EXTENSIONS.has(ext)) macro.push(att.name);
      else if (ARCHIVE_EXTENSIONS.has(ext)) archive.push(att.name);

      var base = parts.slice(0, -1).join('.').replace(/[\d_\-\s]/g, '');
      if (GENERIC_ATTACHMENT_NAMES.has(base)) generic.push(att.name);
    }

    var checks = [];
    if (dbl.length)       checks.push({ id: 'attach-double',  label: 'Double extension detectee', status: 'fail', detail: 'Fichier(s) avec double extension (usurpation) : ' + dbl.join(', ') });
    if (dangerous.length) checks.push({ id: 'attach-danger',  label: 'Extension dangereuse',      status: 'fail', detail: 'Fichier(s) executable(s) ou script(s) : ' + dangerous.join(', ') });
    if (macro.length)     checks.push({ id: 'attach-macro',   label: 'Fichier avec macros',       status: 'warn', detail: 'Document(s) Office avec macros : ' + macro.join(', ') });
    if (archive.length)   checks.push({ id: 'attach-archive', label: 'Archive compressee',        status: 'warn', detail: 'Archive(s) pouvant masquer du contenu malveillant : ' + archive.join(', ') });
    if (generic.length)   checks.push({ id: 'attach-generic', label: 'Nom generique',             status: 'warn', detail: 'Nom(s) generique(s) souvent utilise(s) en phishing : ' + generic.join(', ') });
    if (checks.length === 0) {
      checks.push({ id: 'attach', label: 'Pieces jointes', status: 'pass',
        detail: attachments.length + ' piece(s) jointe(s), aucune anomalie detectee' });
    }
    return checks;
  }

  /* ================================================================
     INTEGRITE MAIL
     ================================================================ */

  function checkIntegrity(senderEmail, subject, bodyText, links, hasSuspectLinks, headerChecks) {
    var checks = [];
    var senderDomain = getDomainFromEmail(senderEmail);

    /* 1. Expediteur */
    if (isOrgDomain(senderDomain)) {
      checks.push({ id: 'sender', label: 'Expediteur', status: 'pass',
        detail: 'Domaine interne (' + senderDomain + ')' });
    } else {
      var senderSusp = senderDomain ? checkSuspiciousDomain(senderDomain) : null;
      if (senderSusp) {
        checks.push({ id: 'sender', label: 'Expediteur', status: 'fail',
          detail: 'Expediteur externe suspect : ' + (senderEmail || 'inconnu') + ' — ' + senderSusp.join(', ') });
      } else if (isTrustedDomain(senderDomain)) {
        checks.push({ id: 'sender', label: 'Expediteur', status: 'pass',
          detail: 'Expediteur externe de confiance (' + senderDomain + ')' });
      } else {
        checks.push({ id: 'sender', label: 'Expediteur', status: 'warn',
          detail: 'Expediteur externe : ' + (senderEmail || 'inconnu') });
      }
    }

    /* Signal croise */
    var hasOther = (checks[0].status !== 'pass')
      || hasSuspectLinks
      || headerChecks.some(function (h) { return h.status === 'fail' || h.status === 'warn'; });

    /* 2. Sujet */
    var subjectNorm = normalizeText(subject);
    var subjectHi = matchKeywords(subjectNorm, SUBJECT_HIGH);
    var subjectLo = matchKeywords(subjectNorm, SUBJECT_LOW);
    if (subjectHi.length) {
      checks.push({ id: 'subject', label: 'Sujet du mail', status: 'warn', detail: 'Mot(s)-cle(s) suspect(s) : ' + subjectHi.join(', ') });
    } else if (subjectLo.length && hasOther) {
      checks.push({ id: 'subject', label: 'Sujet du mail', status: 'warn', detail: 'Mot(s)-cle(s) contextuellement suspect(s) : ' + subjectLo.join(', ') });
    } else if (subjectLo.length) {
      checks.push({ id: 'subject', label: 'Sujet du mail', status: 'pass', detail: 'Mots-cles courants detectes (' + subjectLo.join(', ') + ') mais aucun autre signal' });
    } else {
      checks.push({ id: 'subject', label: 'Sujet du mail', status: 'pass', detail: 'Aucun mot-cle de phishing detecte dans le sujet' });
    }

    /* 3. Corps */
    var bodyNorm = normalizeText(bodyText);
    var bodyHi = matchKeywords(bodyNorm, BODY_HIGH);
    var bodyLo = matchKeywords(bodyNorm, BODY_LOW);
    if (bodyHi.length >= 2) {
      checks.push({ id: 'body', label: 'Contenu du mail', status: 'fail', detail: 'Formulations de phishing : ' + bodyHi.join(' | ') });
    } else if (bodyHi.length === 1) {
      checks.push({ id: 'body', label: 'Contenu du mail', status: 'warn', detail: 'Formulation suspecte : ' + bodyHi[0] });
    } else if (bodyLo.length && (hasOther || subjectHi.length)) {
      checks.push({ id: 'body', label: 'Contenu du mail', status: 'warn', detail: 'Formulations contextuellement suspectes : ' + bodyLo.join(' | ') });
    } else if (bodyLo.length) {
      checks.push({ id: 'body', label: 'Contenu du mail', status: 'pass', detail: 'Formulations courantes detectees mais aucun autre signal' });
    } else {
      checks.push({ id: 'body', label: 'Contenu du mail', status: 'pass', detail: 'Aucune formulation de phishing detectee' });
    }

    /* 4. Domaines de destination */
    var linkDomains = [];
    for (var i = 0; i < links.length; i++) {
      var d = links[i].hrefDomain;
      if (d && linkDomains.indexOf(d) === -1) linkDomains.push(d);
    }
    var suspectDest = linkDomains.filter(function (d) {
      return !isTrustedDomain(d) && !isOrgDomain(d) && checkSuspiciousDomain(d);
    });
    var unknownDest = linkDomains.filter(function (d) {
      return !isTrustedDomain(d) && !isOrgDomain(d) && !checkSuspiciousDomain(d);
    });
    if (suspectDest.length) {
      checks.push({ id: 'ext-domains', label: 'Domaines de destination', status: 'fail', detail: suspectDest.length + ' domaine(s) suspect(s) : ' + suspectDest.join(', ') });
    } else if (unknownDest.length > 3) {
      checks.push({ id: 'ext-domains', label: 'Domaines de destination', status: 'warn', detail: unknownDest.length + ' domaines externes non-repertories : ' + unknownDest.join(', ') });
    } else {
      checks.push({ id: 'ext-domains', label: 'Domaines de destination', status: 'pass', detail: 'Aucun domaine suspect detecte dans les liens' });
    }

    return checks;
  }

  /* ================================================================
     SCORE
     ================================================================ */

  function computeScore(allChecks, links) {
    var score = 100;
    for (var i = 0; i < allChecks.length; i++) {
      var c = allChecks[i];
      switch (c.id) {
        case 'sender':         if (c.status === 'fail') score -= 25; else if (c.status === 'warn') score -= 10; break;
        case 'scl':            if (c.status === 'fail') score -= 25; else if (c.status === 'warn') score -= 10; break;
        case 'bcl':            if (c.status === 'fail') score -= 15; else if (c.status === 'warn') score -= 5;  break;
        case 'eop-cat':        if (c.status === 'fail') score -= 30; else if (c.status === 'warn') score -= 10; break;
        case 'eop-phsh':       if (c.status === 'fail') score -= 20; break;
        case 'auth':           if (c.status === 'fail') score -= 20; else if (c.status === 'warn') score -= 10; break;
        case 'reply-to':       if (c.status === 'fail') score -= 20; break;
        case 'attach-double':  if (c.status === 'fail') score -= 30; break;
        case 'attach-danger':  if (c.status === 'fail') score -= 25; break;
        case 'attach-macro':   if (c.status === 'warn') score -= 10; break;
        case 'attach-archive': if (c.status === 'warn') score -= 5;  break;
        case 'attach-generic': if (c.status === 'warn') score -= 5;  break;
        case 'subject':        if (c.status === 'warn') score -= 5;  break;
        case 'body':           if (c.status === 'fail') score -= 25; else if (c.status === 'warn') score -= 10; break;
        case 'ext-domains':    if (c.status === 'fail') score -= 25; else if (c.status === 'warn') score -= 5;  break;
      }
    }
    var mmCount = 0, mmPen = 0, suspPen = 0;
    for (var j = 0; j < links.length; j++) {
      if (links[j].isMismatch) { mmCount++; mmPen += (mmCount === 1) ? 15 : 10; }
      else if (links[j].isSuspicious) suspPen += 10;
    }
    score -= Math.min(40, mmPen);
    score -= Math.min(30, suspPen);
    return Math.max(0, Math.min(100, score));
  }

  /* ================================================================
     API PUBLIQUE
     ================================================================ */

  function analyze(input) {
    /* input: { from, subject, bodyHtml, mimeHeaders, item } */
    var body = parseBody(input.bodyHtml || '');
    var rawLinks = extractLinks(body.doc);
    var links = analyzeLinks(rawLinks);
    var hasSuspect = links.some(function (l) { return l.mismatch; });

    var headers = analyzeHeaders(input.mimeHeaders);
    var attachments = analyzeAttachments(input.item);
    var integrity = checkIntegrity(input.from, input.subject, body.text, links, hasSuspect, headers);

    var allChecks = integrity.concat(headers).concat(attachments);
    var score = computeScore(allChecks, links);
    return { integrity: integrity, headers: headers, attachments: attachments, links: links, score: score };
  }

  window.LC = {
    VERSION: '1.1.0',
    analyze: analyze,
    getDomain: getDomain,
    getHostname: getHostname,
    isTrustedDomain: isTrustedDomain,
    isTrustedHostname: isTrustedHostname,
    isOrgDomain: isOrgDomain,
    isSaasPlatformDomain: isSaasPlatformDomain,
    isSchemeSafe: isSchemeSafe,
    unwrapSafeLinks: unwrapSafeLinks,
    normalizeText: normalizeText,
    matchKeywords: matchKeywords,
    looksLikeUrl: looksLikeUrl,
    _constants: {
      ORG_DOMAINS: ORG_DOMAINS,
      TRUSTED_ROOT: TRUSTED_ROOT,
      SAAS_PLATFORMS: SAAS_PLATFORMS,
      TRUSTED_HOSTNAMES: TRUSTED_HOSTNAMES,
      MULTI_LEVEL_TLDS: MULTI_LEVEL_TLDS,
      SUSPECT_TLDS: SUSPECT_TLDS,
      URL_SHORTENERS: URL_SHORTENERS,
      DANGEROUS_EXTENSIONS: DANGEROUS_EXTENSIONS
    }
  };
})();
