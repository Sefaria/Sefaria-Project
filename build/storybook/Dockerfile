FROM node:20.19.0-bullseye

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --include=dev

COPY . .

EXPOSE 6006

ENV NODE_ENV=development \
    STORYBOOK_PORT=6006 \
    STORYBOOK_HOST=0.0.0.0

CMD ["npm", "run", "storybook", "--", "--host", "0.0.0.0", "--port", "6006", "--no-open"]
