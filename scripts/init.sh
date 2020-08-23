#!/bin/sh
cd source/back
npm init -y
sudo npm install -g eslint
npm install jest --save-dev
npm install bcrypt better-sqlite3 jsonwebtoken uuid socket.io express

# Generate a private and a public RSA key for use with JWT
mkdir data; cd data
mkdir key; cd key
ssh-keygen -t rsa -b 4096 -m PEM -f jwtRS256.key -q -N ""
openssl rsa -in jwtRS256.key -pubout -outform PEM -out jwtRS256.key.pub

# Generate certificate for HTTPS
openssl genrsa -out privatekey.pem 1024
openssl req -new -key privatekey.pem -out certrequest.csr
openssl x509 -req -in certrequest.csr -signkey privatekey.pem -out certificate.pem