# Discours de soutenance — m2cloud / Hearth

> **Public : Professeur / Tech Lead** · registre technique, précis.
> Aligné sur `index.html` (13 slides). **Cible : 10 min max** — le minutage par slide tient dans l'enveloppe (~9 min de parole + marge).
> `[…]` = indications, à ne pas lire.

---

### 1 — Cover · *0:20*

« Bonjour. **m2cloud**, nom de code *Hearth* : une plateforme de discussion temps réel, en microservices, déployée sur AWS EKS. L'objectif : aller au bout de la chaîne — conception, infrastructure-as-code, sécurité, CI/CD, exploitation. »

---

### 2 — Le brief · *0:30*

« Le cahier des charges imposait quatre briques : **Postgres, Redis, RabbitMQ, et Kubernetes**, en IaC, avec CI/CD GitHub, en monorepo. Mon parti pris : ne pas les cocher comme une checklist, mais **justifier chacune par un besoin applicatif réel**. C'est le fil de ma présentation. »

---

### 3 — Architecture · *1:00*

« La vue d'ensemble. Le trafic entre par un **Network Load Balancer** géré par ingress-nginx, qui route par chemin : `/` vers le front, `/api` vers l'API, `/ws` vers le temps réel.

Trois flux clés : l'**API** écrit dans Postgres, cache dans Redis, et **publie des events** dans RabbitMQ. Le **worker** les consomme en asynchrone pour les notifications. Et le **chat live** passe par **Redis pub/sub** pour diffuser entre réplicas WebSocket. »

---

### 4 — Pourquoi 4 services · *0:45*

« Pourquoi quatre, et pas un monolithe ? La vraie raison du microservice, c'est d'avoir des **profils de charge différents** : l'API encaisse des rafales HTTP, le realtime des connexions longues, le worker se dimensionne sur la profondeur de queue. Trois logiques de scaling incompatibles dans un seul process. »

---

### 5 — Choix techniques · *1:10*

« Deux arbitrages structurants.

**Compute** : j'écarte Lambda — WebSockets longues et worker stateful s'orchestrent mal. ECS/Fargate serait correct, mais je perds le contrôle fin : HPA, probes. **EKS** me donne ce contrôle, et c'est portable.

**Données** : elles sont **relationnelles** — unicité, jointures —, donc RDS Postgres, pas S3 ni DynamoDB. Et **Drizzle plutôt que Prisma** : léger, SQL explicite, et surtout **pas de binaire embarqué** — décisif pour des images minimales. Redis et RabbitMQ je les mets in-cluster : coût, et ça démontre la persistance K8s. »

---

### 6 — Infrastructure as Code · *0:45*

« Toute l'infra est en **Terraform**, état distant dans S3 avec verrou DynamoDB. Un seul `apply` provisionne **88 ressources** : VPC, EKS, RDS, ECR, Secrets Manager, IAM. [montrer le snippet] Modules officiels, nœuds spot pour le coût, IRSA activé. Terraform pour le multi-cloud et le cycle `plan`/`apply` explicite. »

---

### 7 — Sécurité · *1:00*

« Le point sur lequel j'ai le plus investi : **zéro secret dans le code**. [pointer le diagramme] Les secrets vivent dans **Secrets Manager** ; l'**External Secrets Operator** les synchronise dans Kubernetes via **IRSA** — un rôle IAM porté par un ServiceAccount, **aucune clé statique**. Même chose pour la CI/CD : **OIDC GitHub**, la pipeline assume un rôle avec un token éphémère. Rôles least-privilege, et **jamais root** pour les workloads. »

---

### 8 — Scalabilité & résilience · *0:40*

« Scalabilité : des **HPA** sur l'API et le realtime, de 2 à 6 réplicas, alimentés par metrics-server — réellement fonctionnel. Résilience : PodDisruptionBudgets, réplicas répartis sur plusieurs nœuds, persistance par volumes EBS et backups RDS, et des probes partout. »

---

### 9 — CI/CD · *0:50*

« Trois pipelines. La CI teste sur chaque PR avec un vrai Postgres. La CD, sur main : OIDC vers AWS, build et push sur ECR, un **Job de migration** in-cluster — RDS est privé —, puis le rollout. Du commit au pod, sans intervention.

[*optionnel, si le temps : basculer 30 s sur la démo live*] »

---

### 10 — REX · build & provisioning · *0:50*

« La partie qui m'a le plus appris. Quatre incidents, vite : les services crashaient au boot — esbuild et les `dynamic require` des libs CommonJS. La migration échouait — **RDS force le TLS**. Les pods restaient Pending — EKS 1.31 sans StorageClass par défaut. Et RabbitMQ en ImagePullBackOff — Bitnami a retiré le tag. À chaque fois : une cause précise au cloud, une correction dans le repo. »

---

### 11 — L'enquête : le 504 · *1:10*

« Le plus instructif. **L'API répondait, mais le front renvoyait un 504** — alors que tout marchait en local. Je ne devine pas : test interne, le web répond en 8 ms, le pod va bien. Logs ingress : *upstream timed out*. Puis je construis une **matrice de joignabilité** : le gateway sur 3000 répond, le web sur 80 non — sur les deux nœuds.

Donc c'est le **port**. [pointer] Le security group des nœuds n'autorise le cross-node que sur **1025-65535** ; le web écoute sur 80, hors plage. Et mon smoke ne testait que `/api` : invisible. Fix : règle SG, et le smoke teste désormais le `/`. »

---

### 12 — Ce que j'en retiens · *0:35*

« Quatre leçons : le « ça marche en local » ne suffit pas ; on débugge par isolation, pas à l'intuition ; on teste ce qu'on déploie vraiment ; et chaque incident devient une ligne d'IaC versionnée — jamais un patch manuel. »

---

### 13 — Bilan & merci · *0:25*

« En bilan : une archi justifiée, une infra entièrement codée, une sécurité sans secret ni root, une CI/CD verte, et une app réellement déployée. Les pistes d'industrialisation sont identifiées — LB Controller, KEDA, Prometheus, GitOps. Merci, je suis à vous pour vos questions. »

---

## Anticipation de questions

- **Pourquoi pas un service mesh ?** → Pas de besoin de mTLS interne ni de routage complexe ; ce serait de la complexité sans bénéfice. Prochaine étape si on multiplie les services.
- **Migrations zero-downtime ?** → Aujourd'hui un Job avant rollout. Pour du strict : migrations expand/contract en deux déploiements.
- **Pourquoi des nœuds Spot ?** → Coût, et ça force à penser la résilience aux interruptions (PDB + spread). En prod : mix Spot + On-Demand.
- **Le secret RabbitMQ est où ?** → Secrets Manager, synchronisé par ESO. Jamais dans le chart ni le repo.
- **Drizzle en prod, mûr ?** → Oui pour ce périmètre ; SQL explicite, pas de magie. Pour de la génération multi-langage, Prisma reprend l'avantage.
- **Comment garantir l'absence de secret commité ?** → `.env` gitignoré, seul `.env.example` versionné. Durcissement suivant : un scan gitleaks en CI.
- **Combien ça coûte ?** → Quelques dollars/jour (control plane + nœuds spot + RDS micro), détruit via `terraform destroy` après la démo.
