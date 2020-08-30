#!/bin/sh
# npm init -y
# sudo npm install -g eslint
# npm install --save-dev jest
# npm install --save-dev webpack webpack-cli webpack-dev-server webpack-node-externals html-loader html-webpack-plugin css-loader file-loader style-loader
# npm install bcrypt better-sqlite3 jsonwebtoken uuid socket.io express cookie-parser

# Generate a private and a public RSA key for use with JWT
cd src/server
mkdir data; cd data
mkdir key; cd key
ssh-keygen -t rsa -b 4096 -m PEM -f jwtRS256.key -q -N ""
openssl rsa -in jwtRS256.key -pubout -outform PEM -out jwtRS256.key.pub

# Generate certificate for HTTPS
openssl genrsa -out privatekey.pem 1024
openssl req -new -key privatekey.pem -out certrequest.csr
openssl x509 -req -in certrequest.csr -signkey privatekey.pem -out certificate.pem