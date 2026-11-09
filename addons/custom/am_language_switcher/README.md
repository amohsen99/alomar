# 🌍 AM Language Switcher (`am_language_switcher`)

---

## 1. Overview & Role of the Module
The `am_language_switcher` module is a custom Odoo 19 addon developed by **AM Solutions (Ahmed & Mohsen)**. It adds a sleek, modern language switcher button to the backend system tray (top navbar), enabling users to instantly toggle between interface languages with seamless **RTL (Right-to-Left)** and **LTR (Left-to-Right)** layout support.

### Key Features:
* **Quick Language Toggle:** One-click language switching directly from the top navigation bar without navigating through user preferences or settings.
* **Instant Session & RTL Reload:** Uses `reload_context` to instantly update the user's interface language and direction (Arabic RTL ⟷ English LTR).
* **Automatic Active Detection:** Highlights the currently active language with a clean badge and checkmark icon.
* **Modern & Clean UI:** Features a high-contrast white Globe icon matching the navbar styling.

---

## 2. Requirements & Dependencies

### A. Python Dependencies
* Standard Odoo 19 core features (no external pip packages required).

### B. Odoo Module Dependencies
* `web` (Standard Odoo Web Client).

### C. System Compatibility
* **Odoo Version:** 19.0 Community & Enterprise.

---

## 3. How to Install

1. Navigate to the Odoo **Apps** menu (with Developer Mode active).
2. Click **Update Apps List**.
3. Search for `AM Language Switcher` or `am_language_switcher`.
4. Click **Activate** (Install).
5. Refresh the page (Ctrl + F5).
