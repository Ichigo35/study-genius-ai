# Study Genius AI

AI Study Companion — Application mobile Android & iOS

Je veux créer une application de révision destinée principalement aux étudiants.

L'objectif est de créer un assistant d'étude utilisant l'IA qui transforme automatiquement des cours, conversations, enregistrements audio, vidéos YouTube, textes et documents en fiches de synthèse faciles à apprendre.

L'application doit être pensée dès le départ pour fonctionner sur mobile Android et iOS, avec une architecture compatible avec une future compilation via Capacitor.

IMPORTANT :

Ne crée pas seulement une landing page.

Construis une véritable application fonctionnelle avec frontend, backend, base de données et intégration Gemini API.

L'application doit être mobile-first.

L'interface doit être extrêmement fluide sur smartphone.

Prévoir une architecture permettant de générer ensuite Android APK/AAB et iOS via Capacitor.

Ne jamais exposer la clé API Gemini côté client.

Toutes les requêtes Gemini doivent passer par une fonction backend/server-side sécurisée.

Utiliser des variables d'environnement pour la clé API.

1. CONCEPT DU PRODUIT

L'application est un "AI Study Companion".

L'étudiant peut créer un espace de cours puis fournir différentes sources :

Enregistrer directement une conversation ou un cours avec le microphone.

Importer un fichier audio.

Coller une URL YouTube.

Coller du texte.

Importer un PDF.

Importer éventuellement une image/photo de notes ou d'un tableau.

L'IA analyse ensuite le contenu et génère automatiquement :

transcription

résumé

fiche de synthèse

concepts importants

définitions

dates/chiffres importants

exemples

points à retenir

questions potentielles d'examen

flashcards

quiz

explications simplifiées

plan du cours

L'utilisateur doit ensuite pouvoir discuter avec l'IA au sujet du contenu.

Exemple :

Utilisateur :
"Explique-moi la différence entre le libéralisme et le keynésianisme dans ce cours."

L'IA doit répondre uniquement en utilisant en priorité le contenu du cours associé.

2. LANGUES

L'application doit être entièrement disponible en :

🇫🇷 Français
🇬🇧 English
🇱🇦 Lao
Thai

Prévoir une véritable internationalisation.

Toutes les interfaces doivent être traduisibles :

boutons

menus

messages

onboarding

erreurs

paramètres

notifications

écrans de génération

textes d'aide

L'utilisateur choisit sa langue lors du premier lancement.

Il doit ensuite pouvoir changer de langue dans Settings.

IMPORTANT :

La langue de l'interface et la langue du contenu étudié sont deux choses différentes.

Exemple :

Interface française + cours en anglais.

L'utilisateur doit pouvoir choisir la langue de sortie de l'IA :

même langue que la source

français

anglais

lao

3. PAGE D'ACCUEIL

Créer une interface mobile moderne et minimaliste.

Accueil :

"Que veux-tu apprendre aujourd'hui ?"

Actions principales sous forme de grandes cartes :

🎙️ Enregistrer un cours

🎧 Importer un audio

▶️ YouTube

📄 Importer un document

✍️ Coller du texte

📷 Scanner des notes

Section :

"Mes cours"

Afficher les matières/cours récemment utilisés.

Exemple :

Biologie
Droit
Économie
Histoire
Supply Chain

Chaque cours affiche :

nom

nombre de documents

dernière activité

progression de révision

4. CRÉATION D'UN COURS

Permettre de créer un "Study Space".

Exemple :

Nom :
"Économie — Microéconomie"

Description facultative.

L'utilisateur peut ensuite ajouter plusieurs sources au même cours.

Exemple :

Cours Microéconomie

├── Lecture 1.mp3
├── Lecture 2.mp3
├── YouTube — Introduction
├── Chapitre 1.pdf
├── Notes personnelles
└── YouTube — Élasticité

L'IA peut utiliser toutes ces sources pour répondre aux questions.

5. ENREGISTREMENT AUDIO

Créer une véritable interface d'enregistrement mobile.

Écran :

REC

00:00:00

Bouton central pour démarrer.

Pendant l'enregistrement :

compteur

pause

reprendre

arrêter

annuler

indicateur audio

demande d'autorisation microphone

Après l'arrêt :

"Analyse de votre cours..."

Étapes :

Upload audio

Transcription

Analyse Gemini

Génération des notes

Génération des éléments de révision

Afficher une progression claire.

Exemple :

✓ Audio enregistré

✓ Transcription terminée

✓ Concepts identifiés

✓ Fiche de synthèse générée

✓ Questions d'examen générées

6. TRANSCRIPTION

Conserver la transcription complète.

Afficher :

00:02:15

"Le professeur explique que..."

Utiliser des timestamps lorsque possible.

Permettre de rechercher dans la transcription.

Fonction :

🔎 Rechercher

Exemple :

recherche "inflation"

Afficher toutes les occurrences.

7. FICHE DE SYNTHÈSE

C'est le cœur de l'application.

Créer une fiche extrêmement lisible.

Structure :

Titre du cours

Résumé rapide

Une synthèse de quelques paragraphes.

⭐ Les points essentiels

Point 1

Point 2

Point 3

Point 4

📚 Concepts importants

Concept 1

Définition simple.

Concept 2

Définition simple.

🔑 À retenir

Les informations que l'étudiant doit absolument connaître.

📊 Exemples

Présenter les exemples donnés dans le cours.

⚠️ Points susceptibles de tomber à l'examen

Identifier les éléments importants susceptibles d'être évalués.

🧠 Explication simplifiée

Expliquer le cours comme si l'utilisateur débutait.

📝 Questions potentielles

Générer des questions à partir du contenu.

8. NIVEAU DE DÉTAIL

L'utilisateur doit pouvoir choisir :

⚡ Résumé rapide

📚 Standard

🧠 Détaillé

🎓 Préparation examen

Le mode "Préparation examen" doit privilégier :

concepts essentiels

définitions

dates

formules

mécanismes

relations entre concepts

questions probables

pièges

erreurs fréquentes

9. YOUTUBE

Créer une page :

"Transformer une vidéo en fiche"

Champ :

[ Coller le lien YouTube ]

Bouton :

"Analyser la vidéo"

Utiliser directement l'API Gemini lorsque possible pour les vidéos YouTube publiques.

Ne pas télécharger inutilement la vidéo côté serveur si Gemini peut traiter directement l'URL.

Gérer :

URL invalide

vidéo privée

vidéo non disponible

limite API

erreur Gemini

vidéo trop longue

Après analyse :

Vidéo

↓

Transcription

↓

Résumé

↓

Fiche de synthèse

↓

Flashcards

↓

Quiz

IMPORTANT :

Afficher clairement que les vidéos doivent être accessibles publiquement et que la disponibilité de l'analyse dépend des limites de l'API Gemini.

10. CHAT AVEC LE COURS

Chaque Study Space doit avoir un bouton :

"Demander à l'IA"

Créer une interface de chat.

L'utilisateur peut demander :

"Explique-moi ce chapitre."

"Quel est le point le plus important ?"

"Donne-moi un exemple."

"Quelles sont les 5 choses que je dois retenir ?"

"Pose-moi des questions."

"Explique cette partie comme à un débutant."

"Compare ces deux concepts."

L'IA doit utiliser le contenu du Study Space comme contexte.

Éviter autant que possible les hallucinations.

Si l'information n'est pas présente dans les sources :

"Cette information ne semble pas être présente dans ton cours."

Puis éventuellement proposer une explication générale en indiquant clairement qu'elle vient de connaissances externes.

11. FLASHCARDS

Depuis chaque cours, bouton :

"Créer des flashcards"

L'IA génère automatiquement des cartes.

Recto :

"Qu'est-ce que l'élasticité-prix ?"

Verso :

Réponse.

Fonctions :

retourner la carte

suivant

précédent

facile

moyen

difficile

revoir plus tard

Prévoir une base pour ajouter ultérieurement un système de répétition espacée.

12. QUIZ

Bouton :

"Créer un quiz"

Options :

5 questions
10 questions
20 questions

Types :

QCM

vrai/faux

réponse courte

À la fin :

Score : 8/10

Afficher :

✓ réponses correctes

✗ erreurs

Explication de chaque réponse.

Possibilité :

"Revoir uniquement mes erreurs."

13. MODE RÉVISION

Créer un écran :

"Réviser"

L'application affiche les cours nécessitant une révision.

Exemple :

Biologie
🔴 12 cartes à revoir

Économie
🟡 8 cartes

Histoire
🟢 3 cartes

Prévoir une architecture permettant ensuite d'intégrer une répétition espacée.

14. IMPORT DE DOCUMENTS

Permettre :

PDF
TXT
DOCX si supporté
images

Pour les PDF :

extraire le texte

envoyer le contenu pertinent à Gemini

générer une fiche

conserver le document original

Pour les images :

Utiliser les capacités multimodales de Gemini pour comprendre :

texte

tableaux

schémas

graphiques

équations lorsque possible

15. SCAN DE NOTES

Ajouter :

"Scanner mes notes"

Utiliser l'appareil photo.

L'utilisateur photographie :

tableau

feuille

notes manuscrites

schéma

Gemini analyse l'image et transforme son contenu en notes structurées.

16. GEMINI API

Utiliser Gemini API.

La clé doit être stockée uniquement côté serveur.

Variable :

GEMINI_API_KEY

Ne jamais écrire la clé dans le frontend.

Créer une architecture permettant de changer facilement de modèle Gemini ultérieurement.

Créer un service :

geminiService

avec des fonctions séparées :

transcribeAudio()

analyzeVideo()

summarizeContent()

generateStudyNotes()

generateFlashcards()

generateQuiz()

answerQuestion()

analyzeImage()

Utiliser des réponses structurées JSON lorsque cela est pertinent afin de rendre les résultats fiables et facilement affichables dans l'interface.

Prévoir une gestion robuste :

timeout

rate limit

API error

contenu trop long

réponse invalide

JSON invalide

retry contrôlé

17. LIMITATION DE L'API GRATUITE

L'application doit être conçue avec le principe :

"Free Gemini API first"

Ne jamais supposer que l'API est illimitée.

Créer un système de quota côté application.

Exemple :

Utilisateur gratuit :

nombre limité d'analyses par jour

nombre limité de minutes audio

nombre limité de vidéos

nombre limité de générations de quiz

Afficher :

"Il vous reste 23 minutes d'analyse aujourd'hui."

Ces limites doivent être configurables depuis le backend.

Ne pas hardcoder les quotas dans plusieurs endroits du frontend.

18. BASE DE DONNÉES

Créer une base de données structurée.

Tables principales :

users

study_spaces

sources

transcripts

study_notes

flashcards

quizzes

quiz_questions

quiz_attempts

chat_messages

study_sessions

user_settings

usage_limits

Chaque source doit être liée à un Study Space.

Conserver :

titre

type

langue

date

durée

statut de traitement

source originale

résultat de l'analyse

19. AUTHENTIFICATION

Prévoir :

Email/password

Google Sign-In

Apple Sign-In pour iOS lorsque l'architecture finale le permettra

Chaque utilisateur ne doit accéder qu'à ses propres données.

Utiliser des règles de sécurité côté base de données.

20. DESIGN

Le design doit ressembler à une application éducative premium moderne.

Inspiration fonctionnelle :

StudyFetch

NotebookLM

Knowt

Quizlet

applications modernes de prise de notes AI

Ne pas copier leur design.

Créer une identité visuelle originale.

Style :

très propre

moderne

étudiant

minimaliste

beaucoup d'espace

excellente lisibilité

cartes arrondies

navigation simple

animations légères

Mobile-first.

21. NAVIGATION MOBILE

Bottom navigation :

🏠 Accueil

📚 Mes cours

🧠 Réviser

➕ Ajouter

👤 Profil

Le bouton "+" doit être très accessible.

22. PROFIL / SETTINGS

Permettre :

langue de l'interface

langue préférée pour les réponses AI

niveau d'étude

préférence de résumé

notifications

compte

confidentialité

suppression du compte

Niveau :

Collège
Lycée
Université
Master
Professionnel

23. CONFIDENTIALITÉ

L'application traite potentiellement des conversations privées et des cours.

Créer :

politique de confidentialité

suppression des données

suppression d'un cours

suppression d'un enregistrement

suppression du compte

Ne jamais afficher publiquement les transcriptions.

Prévoir une option :

"Supprimer automatiquement les fichiers audio après transcription."

24. ÉTAT DES TRAITEMENTS

Les analyses peuvent prendre du temps.

Créer un système de statut :

pending

processing

completed

failed

L'interface doit afficher :

"Analyse en cours..."

avec une progression visuelle.

Ne jamais laisser l'utilisateur avec un écran bloqué.

Si l'utilisateur quitte l'application, le traitement doit pouvoir continuer côté serveur lorsque techniquement possible.

25. ERREURS

Créer de vrais messages d'erreur compréhensibles.

Exemples :

"Impossible d'analyser cette vidéo."

"Cette vidéo YouTube n'est pas accessible."

"Le fichier audio est trop volumineux."

"Le service AI est temporairement indisponible."

"Tu as atteint ta limite quotidienne."

Toujours proposer une action :

Réessayer
Modifier la source
Plus tard

26. ARCHITECTURE

Construire une architecture propre et maintenable.

Séparer clairement :

Frontend
Backend
Database
AI services
Storage

Ne jamais mélanger les clés API avec le frontend.

Préparer le projet pour :

Web
Android via Capacitor
iOS via Capacitor

Éviter les dépendances qui ne fonctionneraient que dans un navigateur si une alternative mobile existe.

Pour les fonctionnalités natives :

microphone

caméra

stockage

partage

notifications

prévoir des abstractions compatibles Capacitor.

27. PERFORMANCE

L'application doit être rapide.

Éviter de charger tout le contenu d'un cours énorme en une seule fois.

Pagination et chargement progressif.

Optimiser les appels Gemini.

Ne pas refaire une analyse AI si le résultat existe déjà.

Mettre en cache les résultats lorsque pertinent.

28. IMPORTANT — ARCHITECTURE POUR L'APP MOBILE

Même si Lovable ne produit pas directement le binaire Android/iOS final, préparer le projet pour être exporté vers GitHub puis encapsulé avec Capacitor.

Prévoir :

responsive mobile

safe areas iOS

navigation tactile

microphone

caméra

fichiers

partage

permissions

stockage local approprié

Le résultat doit pouvoir être transformé ensuite en :

Android APK/AAB

et

iOS IPA via Xcode.

29. MVP

Ne cherche pas à tout développer immédiatement.

Construire d'abord un MVP réellement fonctionnel avec :

Authentification

Création d'un Study Space

Enregistrement audio

Import audio

YouTube URL

Analyse Gemini

Transcription

Fiche de synthèse

Chat avec le cours

Flashcards

Quiz

Français / anglais / lao

Sauvegarde des cours

Quotas Gemini

Interface mobile-first

Puis préparer l'architecture pour les fonctionnalités suivantes :

PDF

OCR

répétition espacée

notifications

partage

synchronisation

statistiques

mode examen

AI tutor avancé

30. CRITÈRE DE QUALITÉ

Le résultat final ne doit pas être un simple "AI wrapper".

Je veux une véritable application d'étude.

Le workflow principal doit être extrêmement simple :

SOURCE

↓

Analyse AI

↓

Fiche de synthèse

↓

Comprendre

↓

Réviser

↓

Tester ses connaissances

L'expérience utilisateur doit donner l'impression que l'étudiant possède un assistant personnel qui transforme automatiquement ses cours en matériel de révision.

31. PREMIÈRE ÉTAPE

Avant de développer toutes les fonctionnalités, construis d'abord :

architecture du projet

base de données

authentification

design system

navigation mobile

écran d'accueil

création de Study Space

intégration Gemini backend

premier workflow YouTube → analyse → fiche de synthèse

Une fois ce workflow fonctionnel, continuer avec l'enregistrement audio, puis les flashcards et les quiz.

Ne simule aucune fonctionnalité avec de fausses données lorsque la fonctionnalité peut être réellement implémentée.

À la fin de chaque étape, vérifier que l'application fonctionne réellement avant de passer à la suivante.

La clé Gemini est fournie comme secret côté serveur (`GEMINI_API_KEY`, jamais commitée). A aucun moment l'app doit utiliser les credits Lovable, c'est interdit, tout doit passer par la clé API Gemini.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/70de0f75-1026-43b3-ba55-80d18ccfcbfc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
