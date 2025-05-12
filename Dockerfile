FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install --legacy-peer-deps
RUN npm run build

ENV PORT=3003
EXPOSE 3003

CMD ["node", "dist/main.js"]
