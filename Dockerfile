FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install && mkdir database
COPY . .
CMD ["node", "bot.js"]
