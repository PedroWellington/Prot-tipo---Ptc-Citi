# shortcut: imagem única com devDependencies (o seed usa tsx); separe em stages ao ir para produção real
FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
# O schema vem antes do npm ci: o postinstall roda prisma generate
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npx next start -H 0.0.0.0"]
