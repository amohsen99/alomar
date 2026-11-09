# -*- coding: utf-8 -*-
from odoo import api, fields, models

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    am_mobile_apps_grid = fields.Boolean(
        string="Enterprise Mobile Apps Grid",
        help="Display home screen apps in an Enterprise-style 4-column icon grid on mobile devices.",
        config_parameter="am_web_responsive.am_mobile_apps_grid",
        default=True,
    )
    am_mobile_settings_dropdown = fields.Boolean(
        string="Mobile Settings Dropdown Navigation",
        help="Display General Settings navigation as a compact dropdown on mobile devices.",
        config_parameter="am_web_responsive.am_mobile_settings_dropdown",
        default=True,
    )
    am_enable_theme = fields.Boolean(
        string="AM Theme & Styling",
        config_parameter="am_web_responsive.am_enable_theme",
    )
    is_am_theme_installed = fields.Boolean(
        string="Is AM Theme Installed",
    )
    am_mobile_sidebar_enhancements = fields.Boolean(
        string="Enhanced Mobile Navigation Drawer",
        help="Enable hierarchical category tree and 'All Apps' quick button in mobile drawer.",
        config_parameter="am_web_responsive.am_mobile_sidebar_enhancements",
        default=True,
    )
