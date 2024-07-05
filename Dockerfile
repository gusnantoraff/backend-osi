FROM node:20
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --save
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["npm", "run", "start:prod"]
