# Production Deployment Guide: AWS EC2, Coolify v4 & QubitCodes Web

This document provides a comprehensive, zero-assumption guide to setting up a production-ready **Coolify v4** instance on **Amazon Web Services (AWS EC2)** and deploying the **QubitCodes Web** project (`qubit.codes`).

---

## 1. Architecture Overview

```
                        +---------------------------------------+
                        |           Cloudflare DNS              |
                        |   qubit.codes -> AWS Elastic IP       |
                        |   coolify.qubit.codes -> Elastic IP   |
                        +-------------------+-------------------+
                                            |
                                            v
+-----------------------------------------------------------------------------------+
| AWS EC2 Instance (Ubuntu 24.04 LTS)                                               |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Traefik Reverse Proxy (Coolify Core - Ports 80 / 443)                         |  |
|  | - Automated Let's Encrypt SSL Certificates                                  |  |
|  +----------------------+-----------------------------------+------------------+  |
|                         |                                   |                     |
|                         v                                   v                     |
|  +------------------------------+             +-------------------------------+  |
|  | Coolify Control Plane        |             | QubitCodes Web Application    |  |
|  | (Port 8000 Dashboard UI)     |             | - React Router 7 SSR Node Container|  |
|  +------------------------------+             | - Managed via Nixpacks/Docker |  |
|                                               +---------------+---------------+  |
|                                                               |                   |
|                                                               v                   |
|                                               +-------------------------------+  |
|                                               | PostgreSQL Database Container |  |
|                                               | - Port 5432 (Internal Docker)  |  |
|                                               +-------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Prerequisites & Pre-Flight Checklist

Before starting, ensure you have:
- An active **AWS Account** with IAM admin permissions.
- Domain ownership of **`qubit.codes`** (with DNS hosted on Cloudflare or AWS Route 53).
- Git repository access for **`QubitCodesWeb`** (GitHub, GitLab, or Bitbucket).

---

## 3. Provisioning the AWS EC2 Instance

### Step 3.1: Create AWS Security Group
1. Open the **AWS Management Console** -> **EC2** -> **Security Groups** -> **Create Security Group**.
2. **Name:** `coolify-qubitcodes-sg`
3. **Description:** `Security Group for Coolify PaaS and QubitCodes web server`
4. Add the following **Inbound Rules**:

| Type | Protocol | Port Range | Source | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **SSH** | TCP | 22 | `Your IP / 32` (or `0.0.0.0/0`) | Remote SSH Administration |
| **HTTP** | TCP | 80 | `0.0.0.0/0`, `::/0` | Web Traffic & ACME SSL Challenges |
| **HTTPS** | TCP | 443 | `0.0.0.0/0`, `::/0` | Secure Web Traffic |
| **Custom TCP** | TCP | 8000 | `Your IP / 32` (or `0.0.0.0/0`) | Coolify Dashboard Access |
| **Custom TCP** | TCP | 6001 | `Your IP / 32` | Coolify Real-time Websockets |

5. **Outbound Rules:** Keep default (`All Traffic` allowed).

---

### Step 3.2: Launch the EC2 Instance
1. Go to **EC2** -> **Launch Instance**.
2. **Name:** `Coolify-Production-Server`
3. **AMI (Amazon Machine Image):** Select **Ubuntu Server 24.04 LTS** (64-bit x86).
4. **Instance Type:** 
   * **Minimum:** `t3.medium` (2 vCPU, 4 GB RAM)
   * **Recommended Production:** `t3.large` or `c6i.large` (2 vCPU, 8 GB RAM)
5. **Key Pair:** Select an existing key pair or create a new one (e.g., `qubit-aws-key.pem`).
6. **Network Settings:**
   * Select your VPC.
   * Assign Security Group: Choose `coolify-qubitcodes-sg`.
7. **Configure Storage:**
   * **Size:** Minimum `50 GiB` (Recommended `100 GiB`).
   * **Volume Type:** `gp3` (3000 IOPS, 125 MB/s throughput).
8. Click **Launch Instance**.

---

### Step 3.3: Allocate & Attach an AWS Elastic IP (Crucial)
Standard EC2 public IPs change on reboot. You MUST assign a static Elastic IP:
1. Go to **EC2** -> **Network & Security** -> **Elastic IPs**.
2. Click **Allocate Elastic IP address** -> Select `Amazon's pool of IPv4 addresses` -> **Allocate**.
3. Select the created Elastic IP -> **Actions** -> **Associate Elastic IP address**.
4. Select instance `Coolify-Production-Server` -> Click **Associate**.
5. *Note down your Elastic IP (e.g., `203.0.113.50`).*

---

## 4. Setting Up Domain DNS Records

Go to your DNS Manager (Cloudflare or Route 53) and create the following **A Records**:

| Type | Name / Host | Target / Value | Proxy Status (Cloudflare) |
| :--- | :--- | :--- | :--- |
| **A** | `qubit.codes` | `YOUR_ELASTIC_IP` | DNS Only (Disabled during setup) |
| **A** | `www.qubit.codes` | `YOUR_ELASTIC_IP` | DNS Only (Disabled during setup) |
| **A** | `coolify.qubit.codes` | `YOUR_ELASTIC_IP` | DNS Only (Disabled during setup) |

*(Note: Turn off Cloudflare Proxying (Orange Cloud) during initial Coolify setup to allow Let's Encrypt HTTP-01 SSL verification).*

---

## 5. Installing Coolify v4 on AWS EC2

### Step 5.1: Connect to Server via SSH
Open your local terminal and connect to your EC2 instance:
```bash
ssh -i /path/to/qubit-aws-key.pem ubuntu@YOUR_ELASTIC_IP
```

### Step 5.2: Update System Packages
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ufw
```

### Step 5.3: Execute Coolify One-Line Installer
Run the official Coolify v4 automated installation script:
```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

*The installation takes ~2-3 minutes. It automatically installs Docker, Docker Compose, Traefik reverse proxy, and bootstraps Coolify containers.*

When complete, the terminal displays:
```text
Coolify is ready to use!
Navigate to http://YOUR_ELASTIC_IP:8000 to complete onboard setup.
```

---

## 6. Coolify Initial Configuration & Domain Setup

1. Open your browser and navigate to `http://YOUR_ELASTIC_IP:8000`.
2. **Create Root Administrator Account:**
   * Enter your name, primary email address, and strong password.
3. **Configure Instance FQDN:**
   * Go to **Settings** -> **Instance** -> **Instance Domain / FQDN**.
   * Enter: `https://coolify.qubit.codes`
   * Click **Save**.
4. Coolify will automatically request a SSL certificate for your dashboard. You can now access your panel at `https://coolify.qubit.codes`.

---

## 7. Provisioning PostgreSQL Database in Coolify

QubitCodes Web requires a PostgreSQL database as specified in `package.json` (`drizzle-orm` + `pg`).

1. In Coolify Dashboard, click **Project** -> Select **Default** (or create `QubitCodes`).
2. Click **+ Add Resource** -> Choose **Database**.
3. Select **PostgreSQL**.
4. Configure database settings:
   * **Name:** `qubitcodes-postgres`
   * **Database Name:** `qubitcodes_db`
   * **User:** `postgres`
   * **Password:** *(Generate a strong secure password)*
5. Click **Set up Database** -> **Start Database**.
6. Note down the **Internal Connection String**:
   ```text
   postgres://postgres:<PASSWORD>@qubitcodes-postgres:5432/qubitcodes_db
   ```

---

## 8. Deploying QubitCodes Web Application

### Step 8.1: Connect GitHub / Git Provider
1. Go to **Keys & Tokens** -> **Git Source**.
2. Connect your GitHub account via GitHub App or Personal Access Token.

---

### Step 8.2: Add Web Application Resource
1. Inside your project, click **+ Add Resource** -> **Public/Private Repository**.
2. Select repository: `QubitCodesWeb`.
3. Branch: `main` (or `master`).
4. Select **Build Pack**: Coolify will auto-detect Node.js / React Router 7.

---

### Step 8.3: Configure Build & Start Commands
Under **Configuration** -> **General**:

* **Domains / FQDN:** `https://qubit.codes, https://www.qubit.codes`
* **Install Command:** `npm ci`
* **Build Command:** `npm run build`
* **Start Command:** `npm run start` *(Runs `react-router-serve build/server/index.js` as defined in your package.json)*
* **Port Exposed:** `3000` *(Default React Router Serve port)*

---

### Step 8.4: Configure Environment Variables
Go to **Environment Variables** tab and paste your production variables matching `.env.example`:

```env
# Application Config
APP_URL="https://qubit.codes"
APP_PORT=3000
APP_ENV="production"
ENABLE_AUDIT_LOG="true"

# Auth Config
JWT_SECRET="YOUR_SUPER_SECRET_JWT_KEY_PROD"

# Database Credentials
DB_HOST="qubitcodes-postgres"
DB_PORT=5432
DB_USER="postgres"
DB_PASSWORD="YOUR_GENERATED_POSTGRES_PASSWORD"
DB_NAME="qubitcodes_db"

# AWS S3 Credentials
AWS_S3_ACCESS_KEY_ID="YOUR_AWS_S3_ACCESS_KEY"
AWS_S3_SECRET_ACCESS_KEY="YOUR_AWS_S3_SECRET"
AWS_S3_REGION="us-east-1"
AWS_S3_BUCKET="qubitcodes-storage-prod"

# Firebase Credentials
FIREBASE_PROJECT_ID="qubitcodes-prod-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk@..."
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# MSG91 Credentials
MSG91_AUTH_KEY="YOUR_MSG91_AUTH_KEY"
MSG91_SENDER_ID="QBCDES"
MSG91_TEMPLATE_ID="YOUR_MSG91_TEMPLATE_ID"
```

---

## 9. Database Migration & Seeding
To run Drizzle ORM migrations against the production database:

1. Click on the **Deployments** tab in Coolify.
2. Under **Post-deployment Commands** (or run via SSH / Coolify Web Terminal inside the app container):
   ```bash
   npx drizzle-kit migrate
   npx tsx src/db/seeders/db_format_seeder.ts
   ```

---

## 10. Execute Initial Deployment
1. Click **Deploy** at the top right of the application panel.
2. Watch the live build logs:
   * Coolify pulls the Git code.
   * Runs `npm ci`.
   * Runs `npm run build` (vite / react-router build).
   * Spins up the Node.js production server.
   * Traefik automatically issues Let's Encrypt SSL certificates for `qubit.codes`.

---

## 11. Verification & Maintenance Playbook

### Step 11.1: Verification Commands
Execute these commands via SSH on the server to verify operational status:

```bash
# 1. Check all running Docker containers
docker ps

# 2. View QubitCodes Web live application logs
docker logs -f --tail 100 <qubitcodes_container_id>

# 3. Test HTTP & SSL Status
curl -I https://qubit.codes
```

### Step 11.2: Automatic Redeployments on Git Push
1. In Coolify, go to your Application -> **Webhooks**.
2. Copy the **Deploy Webhook URL**.
3. Go to GitHub Repo -> **Settings** -> **Webhooks** -> **Add Webhook**.
4. Paste the URL, set content type to `application/json`, and trigger on **Push events**.

---

## 12. Metered Storage Billing Architecture for Tenants

If you want to bill your tenants based on the **actual disk storage they consume** (pay-as-you-go storage), follow this implementation:

### Approach A: Persistent Docker Volume Measurement (Local Disks)
Coolify mounts persistent volumes on the host filesystem under `/var/lib/docker/volumes/` or `/data/coolify/services/`.

1. **Host Storage Inspection Script:** Add a nightly cron job on your EC2 host:
   ```bash
   #!/bin/bash
   # /usr/local/bin/measure_tenant_storage.sh

   echo "Measuring tenant storage..."
   for dir in /var/lib/docker/volumes/*/
   do
       # Get directory size in MB
       size_mb=$(du -sm "$dir" | cut -f1)
       volume_name=$(basename "$dir")
       
       # Send payload to your central billing API (e.g. QubitCodesWeb API endpoint)
       curl -X POST https://qubit.codes/api/v1/billing/record-storage \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer YOUR_INTERNAL_SYSTEM_TOKEN" \
            -d "{\"volume\":\"$volume_name\", \"size_mb\": $size_mb}"
   done
   ```

2. **Stripe Usage-Based Metered Billing Integration:**
   When your API receives the storage size in MB/GB, push it to Stripe's Usage Record API:
   ```typescript
   // Example inside a Controller or Cron worker
   import Stripe from 'stripe';
   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

   export async function recordTenantStorageUsage(subscriptionItemId: string, storageInGB: number) {
       await stripe.subscriptionItems.createUsageRecord(
           subscriptionItemId,
           {
               quantity: storageInGB,
               timestamp: Math.floor(Date.now() / 1000),
               action: 'set', // Replaces previous reported usage with current total
           }
       );
   }
   ```

### Approach B: Central S3 Object Storage Metering (Cloud Uploads)
If tenants upload files or media assets to a central S3 bucket:
1. Provide each tenant an isolated bucket prefix (e.g., `s3://qubitcodes-tenant-storage/tenant_123/`).
2. Query AWS S3 metrics daily via CloudWatch API or ListObjects V2 to retrieve exact total bytes stored per prefix, and push the usage quantity to Stripe.

---

## 13. Developer Troubleshooting Matrix

| Issue / Symptom | Probable Cause | Resolution |
| :--- | :--- | :--- |
| **502 Bad Gateway on `qubit.codes`** | Node SSR app failed to start or exposed wrong port. | Check app logs: `docker logs <container_id>`. Verify port matches `3000` in Coolify config. |
| **Database Connection Refused** | DB Host incorrect or container not on same network. | Ensure `DB_HOST` is set to container name (`qubitcodes-postgres`) and both resources belong to same project network. |
| **SSL Certificate Error (NET::ERR_CERT_COMMON_NAME_INVALID)** | DNS not fully propagated or Cloudflare proxy interference. | Ensure Cloudflare Proxy is set to **DNS Only** during SSL issuance. Re-trigger deployment in Coolify. |
| **Build Out of Memory (OOM)** | EC2 instance running out of RAM during Vite build. | Add a 2GB Swap file to Ubuntu server: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`. |

---

> **Document Version:** 1.1.0  
> **Target Stack:** React Router 7 / Next.js SSR + Drizzle ORM + PostgreSQL + Tailwind v4 + Stripe Metered Billing  
> **Author:** Antigravity AI Engine
