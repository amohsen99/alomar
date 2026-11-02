# ==============================================================================
# Alomar Custom Odoo Community Dockerfile
# Use this when your custom/third-party modules require external Python libraries
# ==============================================================================
ARG ODOO_VERSION=18.0
FROM odoo:${ODOO_VERSION}

USER root

# Install system utilities and build dependencies if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    libpq-dev \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install python dependencies
COPY requirements.txt /tmp/requirements.txt
RUN if [ -s /tmp/requirements.txt ]; then \
        pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt; \
    fi

# Revert to unprivileged odoo user
USER odoo
