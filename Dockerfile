FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /opt/google/chrome \
  && ln -s /usr/bin/chromium /opt/google/chrome/chrome

RUN git clone --depth 1 https://github.com/goodnight000/api-anything.git /tmp/api-anything \
  && cd /tmp/api-anything \
  && npm ci --no-audit --no-fund \
  && archive=$(npm pack --silent) \
  && npm install -g "$archive" \
  && rm -rf /tmp/api-anything

WORKDIR /app
COPY . .
RUN chmod 755 /app/entrypoint.sh

ENV API_ANYTHING_HOME=/tmp/api-anything
EXPOSE 10000
CMD ["/app/entrypoint.sh"]
