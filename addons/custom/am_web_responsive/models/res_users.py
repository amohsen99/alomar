import json
from odoo import api, fields, models

class ResUsers(models.Model):
    _inherit = "res.users"

    responsive_app_order = fields.Char(
        string='Home Screen App Order',
        help='JSON list of ir.ui.menu ids, in the order the apps are shown.',
        copy=False
    )

    @api.depends("action_id")
    def _compute_redirect_home(self):
        super()._compute_redirect_home()
        for user in self.filtered(lambda u: not u.action_id):
            user.is_redirect_home = True

    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS + ['responsive_app_order']

    @api.model
    def get_responsive_app_order(self):
        raw = self.env.user.sudo().responsive_app_order
        if not raw:
            return []
        try:
            order = json.loads(raw)
        except (TypeError, ValueError):
            return []
        return [int(menu_id) for menu_id in order if str(menu_id).isdigit()]

    @api.model
    def set_responsive_app_order(self, order):
        menu_ids = [int(menu_id) for menu_id in (order or []) if str(menu_id).isdigit()]
        allowed = self.env['ir.ui.menu'].search([('id', 'in', menu_ids)]).ids
        menu_ids = [menu_id for menu_id in menu_ids if menu_id in allowed]
        self.env.user.sudo().responsive_app_order = json.dumps(menu_ids)
        return menu_ids