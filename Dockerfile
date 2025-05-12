FROM node:18-alpine

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos
COPY . .

# Instala as dependências com npm e ignora conflitos
RUN npm install --legacy-peer-deps && npm run build

# Expõe a porta (mesma usada na variável de ambiente)
ENV PORT=3000
EXPOSE 3000

# Comando de inicialização
CMD ["node", "dist/main.js"]
