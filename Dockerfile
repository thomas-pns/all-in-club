# All-In Club : image du serveur (jeu web + API + WebSocket)
FROM node:22-slim AS construction
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production PORT=3000 DOSSIER_DONNEES=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=construction /src/dist ./dist
LABEL org.opencontainers.image.source="https://github.com/thomas-pns/all-in-club"
LABEL org.opencontainers.image.description="All-In Club : poker Texas Hold'em entre amis"
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
