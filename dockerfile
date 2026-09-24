FROM node:20
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
EXPOSE 5001
CMD ["npm", "start"]