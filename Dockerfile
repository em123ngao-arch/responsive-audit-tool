# Base image có sẵn Puppeteer và Chromium dependencies trên Linux
FROM ghcr.io/puppeteer/puppeteer:22.6.0

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
