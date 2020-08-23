'use strict';

const fs = require("fs");
const path = require('path');
const express = require("express");

const PORT = 8090;
const CREDENTIALS = {
    key: fs.readFileSync('data/key/privatekey.pem'),
    cert: fs.readFileSync('data/key/certificate.pem'),
    requestCert: false,
    rejectUnauthorized: false
};


const app = express();
const server = require('https').createServer(CREDENTIALS, app);
const io = require("socket.io")(server);

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public/index.html')); });
app.use('/static', express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('disconnect', () => { console.log('user disconnected'); });

    socket.on('chat/message', (msg) => { io.emit('chat/message', msg); });
});

server.listen(PORT, () => {
    console.log(`https://localhost:${PORT}`);
});