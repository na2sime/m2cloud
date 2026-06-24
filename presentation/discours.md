# Discours de soutenance — m2cloud / Hearth

> **Public visé : Professeur / Tech Lead.** Registre : technique, précis, assumé.
> On justifie chaque choix (X vs Y) et on insiste sur le **retour d'expérience**.
> Durée cible : ~8-10 min. Les `[…]` sont des indications de posture, à ne pas lire.

---

### Slide 1 — Titre

« Bonjour. Je vais vous présenter **m2cloud**, nom de code *Hearth* : une plateforme de discussion en temps réel, type Reddit, que j'ai construite en **microservices** et déployée sur une **infrastructure cloud réelle**, AWS, avec Kubernetes. L'objectif n'était pas de faire une démo locale, mais d'aller jusqu'au bout de la chaîne : conception, infrastructure-as-code, sécurité, CI/CD, et exploitation. »

---

### Slide 2 — Le sujet & les contraintes

« Le cahier des charges imposait quatre briques : **PostgreSQL, Redis, RabbitMQ, et Kubernetes obligatoire**, le tout en infrastructure-as-code, avec une CI/CD GitHub, dans un monorepo.

Mon parti pris a été de traiter ces contraintes non pas comme une checklist, mais comme un *vrai* système : chaque techno devait être **justifiée par un besoin applicatif réel**, pas juste cochée. C'est ce fil conducteur que je vais dérouler. »

---

### Slide 3 — Architecture globale

« Voici la vue d'ensemble. Le trafic entre par un **Network Load Balancer** AWS, géré par *ingress-nginx*, qui route selon le chemin : `/` vers le frontend, `/api` vers l'API REST, `/ws` vers le service temps réel.

Trois choses à retenir sur les flux :
- L'**API** écrit dans **PostgreSQL** via Drizzle, met en cache et gère les compteurs de votes dans **Redis**, et **publie des événements** dans RabbitMQ.
- Le **worker** consomme ces événements de façon **asynchrone** pour produire les notifications — c'est lui qui justifie RabbitMQ.
- Le **chat live** utilise **Redis en pub/sub** pour diffuser les messages entre les réplicas WebSocket : c'est ce qui permet de scaler horizontalement des connexions longues.

Côté sécurité, deux flux pointillés : les secrets viennent de Secrets Manager via IRSA, et la CI/CD s'authentifie en OIDC. J'y reviens. »

---

### Slide 4 — Découpage microservices

« Pourquoi **quatre** services, et pas un monolithe ni dix ?

La bonne raison de faire du microservice, ce n'est pas de découper pour découper — c'est d'avoir des **profils de charge différents**. Ici : l'API encaisse des **rafales HTTP** (autoscaling CPU) ; le realtime gère des **connexions longues** (on scale sur le nombre de sockets) ; le worker se dimensionne sur la **profondeur de queue**. Trois logiques de scaling incompatibles dans un même process.

Un monolithe imposerait un scaling uniforme ; six services seraient de l'over-engineering pour ce périmètre. Quatre, c'est le point d'équilibre — chaque service a une frontière nette et une responsabilité unique. »

---

### Slide 5 — Choix techniques : Compute

« Premier arbitrage : **EKS contre du serverless**.

J'ai écarté **Lambda** : les WebSockets sont des connexions longues, et j'ai un worker stateful qui consomme une queue en continu — deux patterns que le serverless orchestre mal, sans parler des cold starts.

**ECS/Fargate** aurait été acceptable, mais on perd le contrôle fin que je voulais démontrer : HPA, probes de liveness/readiness, PodDisruptionBudgets.

**EKS** donne ce contrôle, c'est portable, c'est le standard du marché. Donc Kubernetes était imposé, mais ici il est aussi *pertinent* : l'application a réellement les besoins que Kubernetes sert nativement. »

---

### Slide 6 — Choix techniques : Données & ORM

« Sur le stockage : mes données sont **fortement relationnelles** — utilisateurs, posts, commentaires, votes avec contrainte d'unicité, jointures. S3, c'est du stockage objet ; DynamoDB, du clé-valeur. Aucun des deux n'est adapté. **PostgreSQL managé via RDS** est le bon choix.

Pour l'ORM, j'ai pris **Drizzle plutôt que Prisma**. Drizzle est *TypeScript-first*, léger, le SQL reste explicite, et surtout il n'embarque **pas de moteur de requêtes binaire** comme Prisma — ce qui compte énormément quand on cherche des images Docker minimales. Les migrations sont versionnées avec Drizzle Kit.

Enfin, **Redis et RabbitMQ je les ai mis dans le cluster** plutôt qu'en ElastiCache et Amazon MQ. Double bénéfice : le coût, et surtout ça me permet de **démontrer la persistance Kubernetes** — StatefulSets avec volumes EBS — qui est un point explicite de l'évaluation. »

---

### Slide 7 — Choix techniques : Packaging

« Un mot sur le packaging, parce que c'est là que se jouent les images légères.

Le monorepo pnpm me donne des **contrats typés partagés** entre les services — le schéma d'événements RabbitMQ, par exemple, est typé une seule fois et consommé par le producteur et le consommateur.

Pour le build, j'utilise **tsup** : je bundle uniquement le code du workspace, et j'externalise les dépendances npm. Puis `pnpm deploy` produit un `node_modules` de production minimal. Résultat : chaque image runtime contient un seul fichier `dist/index.js` — l'équivalent de 25 kilo-octets de code applicatif — plus le strict nécessaire. »

---

### Slide 8 — Sécurité & secrets

« C'est le point sur lequel j'ai le plus investi, parce que c'est souvent le maillon faible.

**Règle absolue : zéro secret dans le code.** Concrètement : les secrets vivent dans **AWS Secrets Manager**, et l'**External Secrets Operator** les synchronise en `Secret` Kubernetes. L'opérateur s'authentifie via **IRSA** — un rôle IAM porté par un ServiceAccount — donc **aucune clé statique** n'existe.

Pour la CI/CD, même philosophie : **OIDC GitHub**. La pipeline *assume* un rôle IAM à l'exécution avec un token éphémère. Il n'y a **aucune access key AWS stockée dans GitHub**.

Et les rôles sont *least-privilege* : le rôle CI ne peut que pousser sur ECR et décrire le cluster ; le rôle de l'ESO ne peut lire qu'**un seul** secret. Les workloads tournent via IRSA, **jamais en root** — j'ai d'ailleurs créé un utilisateur IAM dédié juste pour Terraform. »

---

### Slide 9 — Scalabilité & résilience

« Sur la scalabilité : des **HorizontalPodAutoscalers** sur l'API et le realtime, qui scalent de 2 à 6 réplicas à 70 % de CPU — alimentés par metrics-server, donc c'est réellement fonctionnel, démontrable en live.

Sur la résilience : les services sont stateless et répliqués ; j'ai des **PodDisruptionBudgets** pour garantir une disponibilité pendant les opérations ; des **topologySpreadConstraints** pour répartir les réplicas sur plusieurs nœuds — j'expliquerai pourquoi c'est crucial dans le retour d'expérience. La persistance est assurée par les volumes EBS et les backups RDS, sur des subnets multi-AZ. Et chaque service expose des probes de liveness, readiness et startup. »

---

### Slide 10 — CI/CD

« Trois pipelines. La **CI** sur chaque PR : typecheck, tests — avec un vrai Postgres en service container — et build. La **CD** sur la branche main : OIDC vers AWS, build et push des images sur ECR, puis un **Job de migration** in-cluster, puis le rollout sur EKS via Kustomize.

Un détail qui a son importance : la migration tourne **dans un Job Kubernetes**, parce que RDS est dans un subnet privé, injoignable depuis l'extérieur. Et tout est automatisé : du commit jusqu'au pod en production, sans aucune intervention manuelle. Le pipeline est vert. »

---

### Slide 11 — Transition REX

« J'en arrive à la partie qui m'a le plus appris : le **retour d'expérience**. Parce que déployer sur du cloud réel, ce n'est pas dérouler un tutoriel — c'est se heurter à des comportements spécifiques, et les diagnostiquer. »

---

### Slide 12 — REX 1 : Build & provisioning

« Quatre incidents côté build et infra, rapidement :

Un : mes services **crashaient au démarrage** — esbuild refusait les *dynamic require* de bibliothèques CommonJS comme ioredis bundlées en ESM. Solution : externaliser les deps npm, ne bundler que mon code.

Deux : la migration échouait avec `no pg_hba.conf entry … no encryption`. **RDS force le TLS** ; j'ai ajouté `sslmode=require`.

Trois : mes pods restaient **Pending** indéfiniment — EKS 1.31 ne fournit **plus** de StorageClass par défaut utilisable. J'ai créé une StorageClass **gp3** sur le driver EBS CSI.

Quatre : RabbitMQ en **ImagePullBackOff** — Bitnami a retiré le tag du registry public en 2025. J'ai basculé sur l'image officielle dans un StatefulSet que je contrôle. »

---

### Slide 13 — REX 2 : Le bug réseau

« Mais l'incident le plus instructif est réseau. **L'API répondait, mais le frontend renvoyait un 504** dans le navigateur.

La démarche, c'est de **ne pas deviner** :
- D'abord je vérifie : pods Ready, endpoints présents, et un test *interne* au cluster — `web` répond en 8 millisecondes. Donc le pod va bien.
- Ensuite les logs de l'ingress : *upstream timed out* en se connectant aux pods web.
- Puis je construis une **matrice de joignabilité** : depuis l'ingress, je teste chaque pod. Verdict : le gateway sur le port 3000 répond, le web sur le port 80 **non** — et ça, sur les deux nœuds.

Donc ce n'est pas un nœud, c'est le **port**. Le **security group des nœuds EKS n'autorise le trafic cross-node que sur les ports 1025 à 65535**. Mon web écoute sur le **80**, en dehors de la plage — bloqué. Et mon smoke test ne testait que `/api`, jamais `/` : le bug était invisible. J'ai ajouté la règle de security group, réparti les pods, et ajouté le test du `/`. »

---

### Slide 14 — Ce que j'en retiens

« Quatre leçons de ce projet :

Le **"ça marche en local" ne suffit pas** — RDS, EKS, les registries ont chacun des comportements propres au cloud qu'on ne voit qu'en y allant.

On **débugge par isolation**, pas à l'intuition : interne contre externe, la matrice de joignabilité m'a donné la réponse en une commande.

Il faut **tester ce qu'on déploie réellement** — un smoke partiel donne une fausse confiance.

Et chaque incident, je l'ai **corrigé dans l'IaC ou le repo**, jamais en patch manuel : chaque problème est devenu une ligne de code versionnée et un test. C'est ça, rendre une infra reproductible. »

---

### Slide 15 — Démo

« Je vous propose une démonstration : [ouvrir l'URL] inscription, création d'une room, un post, un vote, et le chat en direct. [montrer le repo] les commits, les trois workflows verts, le dossier infra. Et en live : `kubectl get pods, hpa, pvc` — les réplicas, l'autoscaling, et les volumes persistants. »

---

### Slide 16 — Bilan & ouverture

« En bilan : une architecture microservices justifiée, une infrastructure entièrement codée, une sécurité sans secret ni root, une CI/CD verte, et surtout une application **réellement déployée et exploitée** sur du cloud.

Si je devais industrialiser : je passerais à l'**AWS Load Balancer Controller** en mode IP-target pour supprimer la classe de bugs réseau que j'ai rencontrée ; **KEDA** pour scaler le worker sur la profondeur de queue ; **Prometheus/Grafana** — mes endpoints `/metrics` sont déjà prêts ; et du **GitOps avec ArgoCD** plus **Karpenter** pour l'autoscaling des nœuds.

Merci, je suis à vous pour vos questions. »

---

## Anticipation de questions (prof / tech lead)

- **« Pourquoi pas un service mesh ? »** → Périmètre : pas de mTLS interne ni de routage complexe nécessaire ici ; ce serait de la complexité sans bénéfice. Istio/Linkerd serait la prochaine étape si on multipliait les services.
- **« Comment tu gères les migrations de schéma en zero-downtime ? »** → Aujourd'hui un Job avant le rollout. Pour du zero-downtime strict : migrations *expand/contract* (rétro-compatibles), en deux déploiements.
- **« Pourquoi Spot pour les nœuds ? »** → Coût (projet éphémère), et ça force à penser la résilience aux interruptions — PDB + topologySpread. En prod je mixerais Spot + On-Demand.
- **« Le secret RabbitMQ, il est où ? »** → Dans Secrets Manager, synchronisé par ESO, jamais dans le chart ni le repo. Même chaîne que la DB.
- **« Drizzle en prod, c'est mûr ? »** → Oui pour ce périmètre ; SQL explicite = pas de magie cachée. Pour des besoins de génération de client multi-langage, Prisma reprendrait l'avantage.
- **« Combien ça coûte ? »** → Quelques dollars/jour (EKS control plane + nœuds spot t3.small + RDS micro), détruit via `terraform destroy` après la démo.
