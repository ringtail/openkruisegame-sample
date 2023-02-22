FROM node:14
ADD . /app
WORKDIR /app

CMD ["node","index.js"]