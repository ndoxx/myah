#!/bin/sh
cd source/back
npm init -y
sudo npm install -g eslint
npm install jest --save-dev
npm install bcrypt better-sqlite3 jsonwebtoken

# Generate a private and a public RSA key for use with JWT
mkdir data
ssh-keygen -t rsa -b 4096 -m PEM -f data/jwtRS256.key -q -N ""
openssl rsa -in data/jwtRS256.key -pubout -outform PEM -out data/jwtRS256.key.pub