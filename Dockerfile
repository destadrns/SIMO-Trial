FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/

RUN npm install --prefix backend --omit=dev

COPY backend ./backend

WORKDIR /app/backend

EXPOSE 7860

CMD ["npm", "start"]