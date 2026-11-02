# Alomar Company - Odoo Community Docker Setup

Best-practice Docker Compose architecture for **Alomar Company** Odoo Community, designed specifically to operate seamlessly on a server hosting multiple Odoo instances without port or network conflicts.

---

## 1. Project Directory Structure

```text
/opt/alomar/
├── .env.example              # Template for environment variables and secrets
├── .env                      # Active environment configuration (git-ignored)
├── .gitignore                # Git ignore rules for Odoo & Docker
├── docker-compose.yml        # Multi-service isolated container orchestration
├── Dockerfile                # Custom build image (for extra Python/system dependencies)
├── requirements.txt          # Python dependencies for custom addons
├── config/
│   └── odoo.conf             # Production-tuned Odoo configuration file
├── addons/
│   ├── custom/               # In-house custom modules for Alomar
│   │   └── alomar_base/      # Starter module with company fields & logic
│   └── third_party/          # External Community / OCA / vendor modules
├── nginx/
│   └── alomar.conf.template  # Host Nginx reverse proxy template with SSL & WebSocket
└── scripts/
    ├── backup.sh             # Automated database & filestore backup with 7-day retention
    ├── restore.sh            # Safe database & filestore restoration script
    ├── update_module.sh      # CLI shortcut to upgrade/install specific Odoo modules
    └── logs.sh               # Live log viewer helper
```

---

## 2. Multi-Instance Server Isolation Strategy

When running multiple Odoo installations on the same physical or virtual server, the following isolation rules are strictly applied:

| Isolation Factor | Standard Default | Alomar Instance Configuration | Rationale |
| :--- | :--- | :--- | :--- |
| **Project Prefix** | `odoo` | `COMPOSE_PROJECT_NAME=alomar` | Namespaces all containers, volumes, and networks as `alomar-*` to prevent Docker collisions. |
| **HTTP Web Port** | `8069` | `HOST_ODOO_PORT=8029` | Avoids collision with existing instances (e.g. instance 1 using `8019`). |
| **Chat / WebSocket** | `8072` | `HOST_CHAT_PORT=8032` | Avoids collision with existing instance occupying host port `8072`. |
| **PostgreSQL Port** | `5432` | **Not exposed to host** | Odoo connects to PostgreSQL via Docker internal network (`alomar_internal`). Prevents conflict with host or other DB containers on `5432`/`5433`. |
| **Docker Network** | `bridge` | `alomar_internal_network` | Fully isolated private network. No cross-container traffic or name hijacking. |
| **Database Filtering** | `.*` (All) | `dbfilter = ^alomar.*$` | Ensures this instance only accesses and displays databases prefixed with `alomar_`. |
| **Filestore & DB Data**| Anonymous | `alomar_filestore_data`, `alomar_db_data` | Persistent named volumes with project namespace. |

---

## 3. Quick Start Guide

### Step 1: Review & Configure `.env`
Inspect and customize the configuration:
```bash
cd /opt/alomar
# Review settings (ports, passwords, Odoo version)
nano .env
```

### Step 2: Launch the Services
Start the PostgreSQL database and Odoo application in detached mode:
```bash
docker compose up -d
```

Verify containers are running:
```bash
docker compose ps
```
You should see:
- `alomar-db` (healthy)
- `alomar-web` (running, mapped to ports `8029` and `8032`)

### Step 3: Access Odoo & Create the Database
Open your browser and navigate to:
```
http://<YOUR_SERVER_IP>:8029
```
- Master Password: Use the value configured in `ODOO_ADMIN_PASSWORD` (in `.env` / `odoo.conf`).
- Database Name: Name it starting with `alomar` (e.g. `alomar_prod` or `alomar_main`) to comply with `dbfilter`.

---

## 4. Managing Addons

The addons directory is separated into two categories for clean Git and lifecycle management:

### 1. `addons/custom/`
Store in-house custom modules specifically developed for Alomar here.
- A starter module [`alomar_base`](file:///opt/alomar/addons/custom/alomar_base) is pre-configured.

### 2. `addons/third_party/`
Store third-party modules, OCA addons, or external projects here.
- For example, to include a project like `thmar_dani` / `thamar_printing_dyeing`:
  ```bash
  # Copy external addon directory into third_party:
  cp -r /home/mohsen/Documents/projects/thmar_dani/thamar_printing_dyeing /opt/alomar/addons/third_party/
  ```

### Adding Python Dependencies
If an addon requires external Python packages:
1. Add the package names to [`requirements.txt`](file:///opt/alomar/requirements.txt).
2. In [`docker-compose.yml`](file:///opt/alomar/docker-compose.yml), uncomment the `build:` block under `web` and comment out `image: odoo:...`.
3. Rebuild and restart:
   ```bash
   docker compose up -d --build
   ```

---

## 5. Reverse Proxy Setup (Nginx)

On a multi-instance server, Nginx on the host terminates SSL and routes domains to each instance's mapped port.

1. Copy the provided template to Nginx:
   ```bash
   sudo cp /opt/alomar/nginx/alomar.conf.template /etc/nginx/sites-available/alomar.conf
   ```
2. Replace `alomar.yourdomain.com` with your actual domain name:
   ```bash
   sudo nano /etc/nginx/sites-available/alomar.conf
   ```
3. Enable the site and obtain a free SSL certificate via Certbot:
   ```bash
   sudo ln -s /etc/nginx/sites-available/alomar.conf /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   sudo certbot --nginx -d alomar.yourdomain.com
   ```

---

## 6. Management Scripts & Automation

Utility scripts are available in [`scripts/`](file:///opt/alomar/scripts):

- **Live Logs:**
  ```bash
  ./scripts/logs.sh web
  ```

- **Update / Install a Module via CLI:**
  ```bash
  ./scripts/update_module.sh alomar_base alomar_prod
  ```

- **Run Automated Backup (PostgreSQL Dump + Filestore):**
  ```bash
  ./scripts/backup.sh alomar_prod
  ```
  *Backups are saved to `/opt/alomar/backups/`. Backups older than 7 days are automatically pruned.*

- **Restore Database & Filestore:**
  ```bash
  ./scripts/restore.sh backups/alomar_prod_YYYYMMDD_HHMMSS.dump alomar_prod backups/alomar_prod_filestore_YYYYMMDD_HHMMSS.tar.gz
  ```

---

## 7. Production Hardening Checklist

When ready for full production:
1. [ ] Change `admin_passwd` in [`config/odoo.conf`](file:///opt/alomar/config/odoo.conf) and `.env`.
2. [ ] Change `POSTGRES_PASSWORD` in `.env` and [`config/odoo.conf`](file:///opt/alomar/config/odoo.conf).
3. [ ] Set `list_db = False` in [`config/odoo.conf`](file:///opt/alomar/config/odoo.conf) after initial database creation.
4. [ ] Verify host firewall (UFW) only allows ports `80`, `443`, and SSH, keeping internal container ports `8029` and `8032` bound to `127.0.0.1` behind Nginx.
# alomar
