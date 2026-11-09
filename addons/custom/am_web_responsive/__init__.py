from . import models

def _post_init_hook(env):
    users = env['res.users'].search([('action_id', '=', False)])
    users.write({'is_redirect_home': True})
