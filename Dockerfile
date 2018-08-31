FROM ubuntu:xenial


# Update apt and install wget
RUN apt-get update && apt-get install -y wget curl apt-utils git

# Install node
RUN curl -sL https://deb.nodesource.com/setup_6.x | bash -
RUN apt-get update \
    && apt-get install -y nodejs \
    && touch /tmp/blockchain_data.json \
    && touch /tmp/profile_data.json

# Project directory
WORKDIR /src/subdomain-registrar
# Copy files into container
COPY . .

RUN npm i

CMD npm run fetch-to-json
