# The Queen

Messagerie privée pour deux personnes : textos, vocaux, photos, vidéos, appels vocaux et vidéo, notifications.
Tout est chiffré sur le téléphone avant de partir. Le serveur ne voit que du code illisible.

## Sécurité
- Chiffrement de bout en bout : P-256 (ECDH + ECDSA), HKDF-SHA-256, AES-256-GCM (Web Crypto du téléphone).
- Une clé neuve pour chaque message. Clés de réception changées tous les 7 jours, oubliées après 30 jours.
- Chaque message est signé : impossible de se faire passer pour l'autre.
- Code de sécurité de 60 chiffres à comparer une fois, côte à côte. Si une clé change, l'appli bloque jusqu'à vérification.
- Le serveur efface chaque message et chaque vidéo dès réception. L'historique reste sur les téléphones, chiffré par le code secret (PBKDF2, 600 000 tours).
- Seules les 2 adresses de la table `membres` peuvent créer un compte (blocage dans la base).
- Notifications : jamais de texte. Le type (Photo, Vidéo, Vocal) est chiffré entre vos deux téléphones.
- Appels : en direct entre les deux téléphones (WebRTC, DTLS-SRTP). L'invitation et l'empreinte de chiffrement voyagent dans des messages chiffrés et signés, donc pas d'homme du milieu possible, même via le relais.
- Aucune ressource externe (pas de polices Google, pas de pisteur). Règles de sécurité strictes dans `index.html`.

Limite à connaître : c'est une appli web. Son code est servi par GitHub Pages. Protégez vos comptes GitHub et Supabase avec la validation en deux étapes.

## Mise en route (une seule fois)
1. **Supabase** : nouveau projet `the-queen`. SQL Editor › New query › coller `supabase/schema.sql`.
   À la dernière ligne, mettre vos deux adresses e-mail et enlever `--`. Run.
2. **Authentication › Sign In / Providers › Email** : garder « Confirm email ». Mot de passe minimum : 8.
3. **Authentication › URL Configuration** : Site URL et Redirect URLs = `https://k2kimmorka60-stack.github.io/The-Queen/`
4. **Edge Functions** › Deploy a new function › Via Editor › nom `notifier` › coller `supabase/functions/notifier/index.ts` › Deploy.
5. **Edge Functions › Secrets** : `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` (valeurs données à part, jamais dans le dépôt).
6. **Appels** : compte gratuit Cloudflare › Realtime › TURN Server › Create. Copier « Turn Token ID » et « API Token ».
   Edge Functions › nouvelle fonction `turn` (coller `supabase/functions/turn/index.ts`), puis secrets `CF_TURN_KEY_ID` et `CF_TURN_API_TOKEN`.
   Sans ce relais, les appels marchent seulement quand les deux réseaux le permettent.
7. Mettre la Project URL et la clé `anon public` dans `config.js`.
8. **GitHub** : dépôt `The-Queen`, Settings › Pages › main / root.

## Installer
- iPhone (iOS 16.4 ou plus) : Safari › Partager › Sur l'écran d'accueil. Ouvrir depuis l'icône, puis activer les notifications.
- Android : Chrome › ⋮ › Installer l'application.

## Mise à jour
Changer `VERSION` dans `sw.js` à chaque mise à jour pour que les téléphones prennent la nouvelle version.
