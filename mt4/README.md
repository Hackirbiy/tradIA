# Aurum — connexion à MetaTrader 4

## Ce qui est livré

- `AurumBridge.mq4` : source EA pour le terminal Windows, publication des cours et bougies clôturées, exécution du plan du juge, protections locales et accusé de réception.
- `mt4-relay.mjs` : relais Node.js 24+, sans dépendance, à exécuter sur **le même PC/VPS que MT4**.
- Le serveur du dashboard reçoit les données, calcule les six analyses et le juge. Il peut tourner sur ce PC ou sur un serveur HTTPS accessible depuis le PC.

**État de validation :** calculs, API et échanges de fichiers testés sur fixtures synthétiques. La compilation MQL4 et l’exécution chez le broker n’ont pas été réalisées dans le sandbox Linux. Compiler dans MetaEditor et valider sur le compte MetaQuotes-Demo avant de considérer la liaison opérationnelle.

## 1. Préparer le serveur

Dans le dépôt, Node.js 24+ : `npm ci`, puis configurer `.env` côté serveur :

```dotenv
PORT=3000
MT4_BRIDGE_TOKEN=remplacer_par_une_cle_aleatoire_d_au_moins_32_caracteres
# Facultatif : six appels IA distincts sur les indicateurs réels
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
# Facultatif : bot privé
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Générer une clé avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, la conserver localement et la copier dans le relais et le formulaire d’association. Ne pas la committer ni la partager dans une conversation.

Démarrer avec `npm run dev`, ouvrir `http://localhost:3000`. Pour un serveur distant, configurer une URL **HTTPS** accessible depuis le relais. Les routes MT4 sont protégées par la clé du pont ; celle-ci autorise aussi l’armement du juge. Les anciennes API de simulation restent locales et sans authentification : ne pas exposer l’application entière publiquement sans contrôle d’accès supplémentaire.

## 2. Installer l’EA

1. Ouvrir MT4 et se connecter au compte du broker avec son numéro, son mot de passe de trading et le serveur. Le dashboard demande ensuite le numéro et le serveur pour les associer ; il ne se connecte pas lui-même au broker et ne collecte pas son mot de passe.
2. Copier `AurumBridge.mq4` dans `MQL4/Experts`, compiler avec MetaEditor (F7). Vérifier les erreurs éventuelles avant de continuer.
3. Retirer **AI Agent v12.8** du graphique utilisé, puis attacher AurumBridge sur **XAUUSD** (suffixes broker acceptés). Ne pas faire tourner deux moteurs d’entrée sur ce compte/symbole.
4. Charger suffisamment d’historique D1/H1/M15/M5/M1/W1. Le pont demande 250 bougies clôturées ; D1 exige au moins 220 bougies.
5. `AllowEntries=false` au départ : publication et analyses possibles, exécution bloquée. Pour exécuter après vérification, passer `AllowEntries=true` et activer le bouton AutoTrading du terminal.
6. Plafonds locaux par défaut : risque 1 % par ordre, perte journalière 3 %, spread 100 points. Le plus restrictif entre ces plafonds et ceux du dashboard s’applique. L’EA ne ferme ni ne modifie les autres positions du compte.

Ce nouveau protocole est distinct de l’EA v12.8 : celui-ci exporte seulement cinq votes EMA/RSI/Bollinger et impose ses propres SL/TP. **Aucun fichier de commande v12.8 n’est alimenté par Aurum**. Les fichiers du nouveau pont sont `Aurum_status.json`, `Aurum_command.json` et `Aurum_calendar.json` dans `Terminal/Common/Files`.

## 3. Calendrier et inter-marchés

Si votre outil existant publie `news_status.json` avec `{"trading_allowed":true,"news_risk":"LOW"}`, le relais le convertit en `Aurum_calendar.json` en conservant la **date de modification réelle**. Le fichier source doit être actualisé par le fournisseur de calendrier au moins toutes les cinq minutes. `false` bloque les entrées. Une source absente ou périmée bloque aussi les entrées ; le relais ne prétend pas récupérer des annonces à lui seul.

Autre possibilité : votre fournisseur écrit atomiquement un JSON UTF-8 directement dans `Aurum_calendar.json` avec `asOf` (timestamp UTC en secondes), `blocked` (booléen) et `event` (texte facultatif). Ne pas fabriquer un calendrier « autorisé » pour contourner le filtre.

Renseigner les inputs `DxySymbol` et `Us10ySymbol` avec les noms exacts disponibles chez le broker. `Us10ySymbol` doit représenter le **rendement** US 10 ans, pas le prix d’une obligation/future. Faute de 21 bougies H1 synchronisées, l’agent inter-marchés s’abstient. Le compte MetaQuotes-Demo peut ne pas proposer ces instruments : un flux supplémentaire reste alors nécessaire.

## 4. Lancer le relais Windows

PowerShell, avec Node.js 24 installé :

```powershell
$env:AURUM_URL = 'https://votre-serveur-aurum.example'
# Si le dashboard tourne sur le même PC : http://localhost:3000
$env:MT4_COMMON_FILES = "$env:APPDATA\MetaQuotes\Terminal\Common\Files"
$secure = Read-Host 'Clé du pont Aurum' -AsSecureString
$env:MT4_BRIDGE_TOKEN = [System.Net.NetworkCredential]::new('', $secure).Password
node .\mt4-relay.mjs
```

Le chemin de Common/Files déjà fourni dans la conversation correspond à ce dossier. Laisser tourner le terminal, le relais et le serveur. La clé ne s’affiche pas dans les logs du relais. Ctrl+C arrête le relais. Après un changement de clé serveur, redémarrer le relais avec la nouvelle clé.

## 5. Associer puis armer

Dans **MetaTrader 4** sur le dashboard, saisir le numéro du compte, le nom exact du serveur et la clé du pont. Une seule identité est autorisée par `DATA_DIR`, pour empêcher de mélanger les comptes. Attendre le badge connecté, vérifier le type de compte **Démo broker / Compte réel**, les quotes et les six analyses. Puis cliquer **Armer l’exécution automatique**.

Le serveur analyse chaque nouvelle bougie M1 clôturée. Le juge a un poids égal par agent : seuil minimal inclus de **75 %**, donc **5 votes / 6**. Quatre votes = 66,7 %, donc HOLD. Un agent manquant garde sa place dans le dénominateur et vote HOLD. Sans clé OpenAI, les mêmes conditions sont évaluées par règles techniques, avec un libellé explicite ; avec une clé, six appels séparés peuvent confirmer ou s’abstenir, jamais outrepasser une condition manquante.

L’ordre comporte son sens, ses lots, son SL et son TP : SL de base = **1,5 × ATR M5**, élargi si nécessaire pour respecter le stop minimum du broker et le spread ; TP selon le R:R réglé. Lots arrondis vers le bas au pas broker, jamais remontés au lot minimum si cela dépasse le budget. Une seule exposition XAUUSD à la fois, y compris positions manuelles et ordres en attente. Spread absolu et relatif, calendrier, données fraîches et dérive du prix sont vérifiés avant l’exécution. Les frais et gaps peuvent faire dépasser le risque estimé.

Le circuit breaker bloque les nouvelles entrées dès la perte limite sur equity. La base est la première equity observée du jour UTC, persistée pour le jour ; elle n’est pas ajustée aux dépôts/retraits. La perte n’est pas garantie plafonnée : positions existantes et SL/TP restent chez le broker. L’EA possède aussi son propre contrôle journalier tant qu’il tourne. Après redémarrage du serveur, le juge reste désarmé jusqu’à nouvel armement explicite.

## 6. Confirmation et reprise après incident

- `pending` signifie transmis/à transmettre, **pas exécuté**. Seul `executed` accompagné de l’ACK MT4 confirme l’ouverture.
- Une commande expire après 8 secondes. Serveur, relais et EA empêchent le rejeu via des identifiants persistés ; la persistance intervient avant l’exécution. Cela privilégie l’absence de doublon : un arrêt au mauvais instant peut perdre une commande.
- Sans ACK, le statut devient `uncertain` et toute nouvelle entrée est bloquée. Le serveur ne retente jamais l’ordre automatiquement. Vérifier le ticket/commentaire Aurum dans MT4 et le journal de l’EA, puis utiliser la réconciliation explicite du dashboard. Réarmer ensuite si nécessaire.
- Le même consensus directionnel ne redéclenche pas après TP/SL tant qu’une analyse HOLD ou un changement de sens n’a pas réinitialisé le signal.
- Le coupe-circuit ou désarmement bloque les nouvelles livraisons ; une commande déjà reçue par le terminal peut être en cours. Le dashboard affiche les confirmations ultérieures.
- Le relais suppose un seul serveur et un seul EA Aurum pour ce compte. Ne pas effacer les checkpoints ou variables globales MT4 pour rejouer un ordre.

## Telegram

Configurer le token de BotFather et votre **chat privé** côté serveur, puis envoyer `/start` au bot. `/statut` expose le compte associé et la fraîcheur du flux ; `/juge` donne le dernier verdict et son exécution ; `/stop` déclenche le coupe-circuit des entrées MT4. Aucun ordre BUY/SELL ni armement n’est accepté sur Telegram. Tous les autres utilisateurs et groupes sont ignorés. La livraison Telegram réelle reste à vérifier avec votre bot.

## Définitions des analyses

- D1 : EMA 50/200, pivots confirmés à deux bougies de chaque côté, BOS/CHoCH, derniers hauts/bas D1/W1, calendrier frais.
- H1 : FVG à trois bougies non complètement comblé ; order block = dernière bougie opposée précédant la cassure des huit bougies précédentes, invalidé par clôture au-delà ; VWAP pondérée par volumes ticks, session UTC, ATR14.
- M15 : sweep des 16 bougies précédentes, structure, profil de session en 24 classes de prix et aire de valeur 70 % (approximation à partir des ticks, pas volume échangé centralisé).
- M5 : EMA9/21, momentum sur trois bougies, stochastique %K14 hors extrêmes 20/80, ATR14 de Wilder.
- M1 : micro-cassure des cinq bougies précédentes, volume ≥ 1,5 fois la moyenne des 20 bougies, filtre de spread.
- COR : corrélations de rendements H1 avec DXY et taux US, confirmation contraire à leur momentum sur trois bougies.

Les méthodes SMC sont des définitions opérationnelles, pas des détections universelles. Les conversions des temps historiques utilisent le décalage courant du serveur broker vers UTC ; un historique traversant un changement d’heure peut nécessiter une correction spécifique au broker pour les sessions et corrélations.
