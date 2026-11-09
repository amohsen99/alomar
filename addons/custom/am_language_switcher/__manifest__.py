# -*- coding: utf-8 -*-
{
    'name': 'AM Language Switcher',
    'author': 'AM Solutions (Ahmed & Mohsen)',
    'maintainer': 'AM Solutions',
    'category': 'Tools',
    'version': '19.0.1.0.0',
    'summary': 'AM Quick Language Switcher in System Tray (RTL & LTR) for Odoo 19',
    'description': """
AM Language Switcher
====================
The AM Language Switcher app adds a quick language selector to the Odoo backend system tray, enabling users to seamlessly switch between multiple languages (such as Arabic & English) with a single click and automatic RTL/LTR layout adjustment.

Key Features:
-------------
* Quick language switcher directly in the system tray.
* Automatic RTL (Right-to-Left) and LTR (Left-to-Right) layout reload.
* High-contrast white Globe icon and active language badge.
* Supports all active installed languages in Odoo 19.
    """,
    'depends': ['web'],
    'assets': {
        'web.assets_backend': [
            'am_language_switcher/static/src/**/*',
        ],
    },
    'images': ['static/description/icon.png'],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
