# AM Web Responsive Extension (`am_web_responsive`)

---

## 1. Overview & Role of the Module
The `am_web_responsive` module is a utility extension designed to enhance the Odoo 19 client interface. It extends the OCA **`web_responsive`** app launcher to provide drag-and-drop customization and optimizes landing page redirection.

### Key Features:
* **Drag & Drop App Sorting:** Allows users to rearrange application icons directly on the main responsive home screen via dragging and dropping. Each user's preferred layout sequence is persistently stored in the database.
* **Automatic Home Dashboard Redirect:** Configures Odoo to route users directly to the responsive home app launcher dashboard upon login or page refresh, bypassing the default "Discuss" application.
* **Post-Initialization Auto-update:** Features a `post_init_hook` that automatically configures all existing database users to utilize the home screen redirect upon installation.
* **Seamless Owl Integration:** Patches standard Odoo client navbar components and OCA AppsMenu widgets using the standard Odoo Owl `useSortable` hook to handle DOM drag-and-drop events and execute saving RPC calls.

---

## 2. Requirements & Dependencies

### A. Python Library Dependencies
This module uses Odoo core features and standard JSON serialization.
* **No external pip packages required.**

### B. Odoo Module Dependencies
This is an extension module. It requires the following modules to be installed in the database:
1. `base` (Odoo Core)
2. `web` (Web Client Core)
3. **`web_responsive`** (OCA Responsive Apps Menu - **Must be installed prior to this module**)

### C. Compatibility
* **Odoo Version:** 19.0 Community & Enterprise.

---

## 3. How to Deploy & Install

1. **Verify Prerequisites:**
   Ensure the OCA **`web_responsive`** module is present in your addons directory (`addons/third_party/web_responsive`) and installed in your Odoo database.

2. **Addons Path:**
   Ensure `addons/custom` is listed in your `odoo.conf` file:
   ```ini
   addons_path = /mnt/extra-addons/custom,/mnt/extra-addons/third_party,/usr/lib/python3/dist-packages/odoo/addons
   ```

3. **Update & Install:**
   * Log into Odoo with Administrator credentials.
   * Activate **Developer Mode** (Settings ──> General Settings ──> Activate Developer Mode).
   * Navigate to the **Apps** menu.
   * Click **Update Apps List**.
   * Search for `AM Web Responsive Extension` or `am_web_responsive`.
   * Click **Activate** (Install).
   * *Note: Refresh your browser (Ctrl + F5) after installation to load the updated JS/XML bundles.*
