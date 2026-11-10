# ==============================================================================
# Alomar Custom Odoo Community Dockerfile
# Use this when your custom/third-party modules require external Python libraries
# ==============================================================================
ARG ODOO_VERSION=19.0
FROM odoo:${ODOO_VERSION}

USER root

# Copy and install python dependencies
COPY requirements.txt /tmp/requirements.txt
RUN if [ -s /tmp/requirements.txt ]; then \
        pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt; \
    fi

# Revert to unprivileged odoo user
USER odoo
