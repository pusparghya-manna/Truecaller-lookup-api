FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /opt/google/chrome \
  && ln -s /usr/bin/chromium /opt/google/chrome/chrome

RUN git clone --depth 1 https://github.com/goodnight000/api-anything.git /opt/api-anything \
  && cd /opt/api-anything \
  && npm ci --no-audit --no-fund \
  && npm run build \
  && test -s /opt/api-anything/dist/cli.js

WORKDIR /app
COPY . .
RUN chmod 755 /app/entrypoint.sh

ENV API_ANYTHING_HOME=/tmp/api-anything
ENV API_ANYTHING_CLI=/opt/api-anything/dist/cli.js
ENV API_ANYTHING_CWD=/opt/api-anything
EXPOSE 10000
CMD ["/app/entrypoint.sh"]
