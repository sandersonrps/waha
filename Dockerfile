FROM node:18-alpine

# Define o diretório da aplicação
WORKDIR /app

# Copia os arquivos do projeto
COPY . .

# Instala as dependências (ignora conflitos de peer)
RUN npm install --legacy-peer-deps

# Compila o TypeScript para JavaScript
RUN npm run build

# Define a porta usada
ENV PORT=3003
EXPOSE 3003

# Comando para iniciar a aplicação
CMD ["node", "dist/main.js"]
