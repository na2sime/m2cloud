# Discours de soutenance — m2cloud / Hearth

> **Public : Professeur / Tech Lead.** Registre technique, précis, assumé.
> On justifie chaque choix (X vs Y) et on insiste sur le **retour d'expérience**.
> Aligné sur le deck `index.html` (16 slides). Durée ~9-10 min. `[…]` = indications, à ne pas lire.

---

### 1 — Cover

« Bonjour. Je présente **m2cloud**, nom de code *Hearth* : une plateforme de discussion temps réel, type Reddit, construite en **microservices** et déployée sur une **infrastructure cloud réelle** — AWS, avec Kubernetes. L'objectif n'était pas une démo locale, mais d'aller au bout de la chaîne : conception, infrastructure-as-code, sécurité, CI/CD, et exploitation. »

---

### 2 — Le brief

« Le cahier des charges imposait quatre briques : **PostgreSQL, Redis, RabbitMQ, et Kubernetes obligatoire**, en infrastructure-as-code, avec une CI/CD GitHub, dans un monorepo.

Mon parti pris : ne pas traiter ça comme une checklist, mais comme un *vrai système*. Chaque techno devait être **justifiée par un besoin applicatif**, pas juste cochée. C'est le fil que je déroule. »

---

### 3 — Architecture globale

« La vue d'ensemble. Le trafic entre par un **Network Load Balancer**, géré par *ingress-nginx*, qui route par chemin : `/` vers le front, `/api` vers l'API REST, `/ws` vers le temps réel.

Trois flux à retenir :
- L'**API** écrit dans Postgres via Drizzle, met en cache et gère les votes dans **Redis**, et **publie des événements** dans RabbitMQ.
- Le **worker** consomme ces événements en **asynchrone** pour les notifications — c'est lui qui justifie RabbitMQ.
- Le **chat live** utilise **Redis en pub/sub** pour diffuser les messages entre réplicas WebSocket : c'est ce qui permet de scaler des connexions longues.

[pointer le diagramme] Les secrets arrivent par IRSA, la CI/CD par OIDC — j'y reviens. »

---

### 4 — Pourquoi 4 services

« Pourquoi quatre, et pas un monolithe ni dix ?

La bonne raison du microservice, ce n'est pas de découper pour découper — c'est d'avoir des **profils de charge différents**. L'API encaisse des **rafales HTTP**, on l'autoscale sur le CPU. Le realtime gère des **connexions longues**. Le worker se dimensionne sur la **profondeur de queue**. Trois logiques de scaling incompatibles dans un même process.

Un monolithe imposerait un scaling uniforme ; six services seraient de l'over-engineering. Quatre, c'est l'équilibre — chaque service a une frontière nette. »

---

### 5 — Compute : pourquoi EKS

« Premier arbitrage : **EKS contre du serverless**.

J'écarte **Lambda** : WebSockets longues + worker stateful s'orchestrent mal, sans parler des cold starts. **ECS/Fargate** serait acceptable, mais on perd le contrôle fin que je voulais : HPA, probes, PodDisruptionBudgets. **EKS** donne ce contrôle, c'est portable, c'est le standard.

Donc Kubernetes était imposé, mais ici il est aussi *pertinent* : l'app a réellement les besoins que K8s sert nativement. »

---

### 6 — Données : relationnel assumé

« Sur le stockage : mes données sont **fortement relationnelles** — users, posts, commentaires, votes avec contrainte d'unicité, jointures. S3 c'est de l'objet, DynamoDB du clé-valeur : inadaptés. **PostgreSQL via RDS** est le bon choix.

Pour l'ORM, **Drizzle plutôt que Prisma** : *TypeScript-first*, léger, le SQL reste explicite, et surtout **pas de moteur binaire embarqué** comme Prisma — décisif pour des images Docker minimales. Migrations versionnées avec Drizzle Kit.

Et **Redis et RabbitMQ in-cluster** plutôt que managés : coût, et surtout ça démontre la **persistance Kubernetes** — StatefulSets et volumes EBS — un point explicite de l'évaluation. »

---

### 7 — Infrastructure as Code

« Toute l'infra est en **Terraform**, avec l'état distant dans S3 et un verrou DynamoDB — donc reproductible, pas de state local. Un seul `apply` provisionne **88 ressources** : VPC, EKS, RDS, ECR, Secrets Manager, et tous les rôles IAM.

[montrer le snippet] J'utilise les modules communautaires officiels — ici le module EKS, avec des nœuds **spot** pour le coût et l'**IRSA** activé. Pourquoi Terraform plutôt que CloudFormation : c'est multi-cloud, l'écosystème de modules est mûr, et le cycle `plan`/`apply` est explicite. »

---

### 8 — Zéro secret, zéro root

« C'est le point sur lequel j'ai le plus investi. **Règle absolue : zéro secret dans le code.**

[pointer le diagramme] Les secrets vivent dans **Secrets Manager** ; l'**External Secrets Operator** les synchronise en `Secret` Kubernetes, en s'authentifiant par **IRSA** — un rôle IAM porté par un ServiceAccount. **Aucune clé statique.**

Même philosophie pour la CI/CD : **OIDC GitHub**. La pipeline *assume* un rôle IAM avec un token éphémère — **aucune access key stockée**. Et les rôles sont *least-privilege* : la CI ne peut que pousser sur ECR ; l'ESO ne lit qu'**un seul** secret. Les workloads tournent via IRSA, **jamais en root** — j'ai même un utilisateur IAM dédié juste pour Terraform. »

---

### 9 — Scalabilité & résilience

« Scalabilité : des **HorizontalPodAutoscalers** sur l'API et le realtime, de 2 à 6 réplicas à 70 % de CPU, alimentés par metrics-server — c'est réellement fonctionnel, démontrable en live.

Résilience : des **PodDisruptionBudgets**, des **topologySpreadConstraints** pour répartir les réplicas sur plusieurs nœuds — j'explique pourquoi c'est crucial juste après. La persistance par volumes EBS et backups RDS, sur du multi-AZ. Et des probes de liveness, readiness et startup sur chaque service. »

---

### 10 — CI/CD : du commit au pod

« Trois pipelines. La **CI** sur chaque PR : typecheck, tests avec un vrai Postgres en service, build. La **CD** sur main : OIDC vers AWS, build et push sur ECR, un **Job de migration** in-cluster — parce que RDS est privé, injoignable de l'extérieur — puis le rollout via Kustomize.

Tout est automatisé : du commit jusqu'au pod en production, sans intervention. Le pipeline est vert.

[Transition démo, optionnelle] *À ce stade je peux basculer sur la démo live : inscription, room, post, vote, chat temps réel.* »

---

### 11 — Les vraies galères (transition)

« J'en arrive à la partie qui m'a le plus appris : le **retour d'expérience**. Parce que déployer sur du cloud réel, ce n'est pas dérouler un tutoriel — c'est se heurter à des comportements spécifiques, et savoir les diagnostiquer. »

---

### 12 — REX · build & provisioning

« Quatre incidents, rapidement.

Un : mes services **crashaient au démarrage** — esbuild refusait les *dynamic require* de bibliothèques CommonJS bundlées en ESM. Solution : externaliser les deps npm.

Deux : la migration échouait, `no pg_hba.conf … no encryption` — **RDS force le TLS**. J'ai ajouté `sslmode=require`.

Trois : mes pods restaient **Pending** — EKS 1.31 ne fournit **plus** de StorageClass par défaut. J'ai créé une StorageClass **gp3** sur le driver EBS CSI.

Quatre : RabbitMQ en **ImagePullBackOff** — Bitnami a retiré le tag du registry public en 2025. Bascule sur l'image officielle dans un StatefulSet que je contrôle. »

---

### 13 — L'enquête : un 504 (slide clé)

« Mais l'incident le plus instructif est réseau. **L'API répondait, mais le frontend renvoyait un 504** dans le navigateur — alors que tout marchait en local.

La démarche, c'est de **ne pas deviner** :
- D'abord je vérifie : pods Ready, et un test *interne* au cluster — le web répond en 8 millisecondes. Le pod va bien.
- Les logs de l'ingress : *upstream timed out*.
- Puis je construis une **matrice de joignabilité** : depuis l'ingress, le gateway sur le port 3000 répond, le web sur le port 80 **non** — et ça, sur les deux nœuds.

Donc ce n'est pas un nœud, c'est le **port**. [pointer le diagramme] Le **security group des nœuds EKS n'autorise le cross-node que sur 1025-65535**. Mon web écoute sur le 80, hors plage — bloqué. Et mon smoke ne testait que `/api` : invisible. J'ajoute la règle de SG, je répartis les pods, et le smoke teste désormais aussi le `/`. »

---

### 14 — Ce que j'en retiens

« Quatre leçons :

Le **"ça marche en local" ne suffit pas** — RDS, EKS, les registries ont des comportements propres au cloud qu'on ne voit qu'en y allant.

On **débugge par isolation**, pas à l'intuition : la matrice de joignabilité m'a donné la réponse en une commande.

Il faut **tester ce qu'on déploie réellement** — un smoke partiel donne une fausse confiance.

Et chaque incident, je l'ai **corrigé dans l'IaC ou le repo**, jamais en patch manuel : chaque problème est devenu une ligne de code versionnée et un test. C'est ça, rendre une infra reproductible. »

---

### 15 — Bilan & pistes

« En bilan : une architecture justifiée, une infra entièrement codée, une sécurité sans secret ni root, une CI/CD verte, et une application **réellement déployée et exploitée** sur du cloud.

Pour industrialiser : l'**AWS Load Balancer Controller** en mode IP-target, qui supprime la classe de bugs réseau que j'ai rencontrée ; **KEDA** pour scaler le worker sur la profondeur de queue ; **Prometheus/Grafana** — mes endpoints `/metrics` sont déjà prêts ; et du **GitOps avec ArgoCD** plus **Karpenter** pour l'autoscaling des nœuds. »

---

### 16 — Merci

« Voilà. L'application est en ligne, la CI/CD est verte, et le code est public. Merci — je suis à vous pour vos questions. »

---

## Anticipation de questions (prof / tech lead)

- **« Pourquoi pas un service mesh ? »** → Périmètre : pas de mTLS interne ni de routage complexe nécessaire. Ce serait de la complexité sans bénéfice ; Istio/Linkerd serait la prochaine étape si on multipliait les services.
- **« Migrations zero-downtime ? »** → Aujourd'hui un Job avant le rollout. Pour du zero-downtime strict : migrations *expand/contract* rétro-compatibles, en deux déploiements.
- **« Pourquoi des nœuds Spot ? »** → Coût (projet éphémère), et ça force à penser la résilience aux interruptions — PDB + topologySpread. En prod : mix Spot + On-Demand.
- **« Le secret RabbitMQ, il est où ? »** → Dans Secrets Manager, synchronisé par ESO, jamais dans le chart ni le repo. Même chaîne que la DB.
- **« Drizzle en prod, c'est mûr ? »** → Oui pour ce périmètre ; SQL explicite, pas de magie. Pour de la génération de client multi-langage, Prisma reprendrait l'avantage.
- **« Comment tu garantis qu'aucun secret n'est commité ? »** → `.env` gitignoré, seul `.env.example` versionné ; les secrets réels n'existent qu'en Secrets Manager. Un scan type gitleaks en CI serait le durcissement suivant.
- **« Combien ça coûte ? »** → Quelques dollars/jour (control plane EKS + nœuds spot t3.small + RDS micro), détruit via `terraform destroy` après la démo.
