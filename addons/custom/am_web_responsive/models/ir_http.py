# -*- coding: utf-8 -*-
from odoo import models

class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    def session_info(self):
        result = super().session_info()
        param = (
            self.env['ir.config_parameter'].sudo().get_param('am_web_responsive.am_enable_theme')
            or self.env['ir.config_parameter'].sudo().get_param('mkt_web_responsive.mkt_enable_theme')
        )
        if param is not None and str(param).strip().lower() in ['true', '1', 't', 'yes']:
            result['am_enable_theme'] = True
            result['mkt_enable_theme'] = True
        else:
            result['am_enable_theme'] = False
            result['mkt_enable_theme'] = False
        return result
