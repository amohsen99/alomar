# -*- coding: utf-8 -*-
{
    "name": "Alomar Base Customization",
    "summary": "Core company configurations and custom logic for Alomar Company",
    "description": """
        Alomar Base Module
        ==================
        This module serves as the primary base for customizations specific to Alomar Company:
        - Company branding and defaults
        - Centralized business rules
        - Foundation for other Alomar sub-modules
    """,
    "version": "19.0.1.0.0",
    "category": "Customizations",
    "author": "Alomar Company",
    "website": "https://alomar.com",
    "license": "LGPL-3",
    "depends": [
        "base",
        "mail",
    ],
    "data": [
        "views/res_company_views.xml",
    ],
    "installable": True,
    "application": False,
    "auto_install": False,
}
