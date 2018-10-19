FROM node:8

WORKDIR /src/subdomain-registrar
# Copy files into container
COPY . .

RUN npm i

CMD npm run fetch-to-json
