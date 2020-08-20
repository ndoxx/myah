#!/bin/sh
cd source/back
npm init -y
sudo npm install -g eslint
npm install jest --save-dev
npm install bcrypt sqlite