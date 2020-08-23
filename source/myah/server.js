'use strict';

const fs = require("fs");
const path = require('path');
const express = require("express");

const PORT = 8090;
const AUTH_TOKEN_TTL_S = 60 * 60 * 24 * 7;
const AUTH_TOKEN_TTL_SHORT_LIVED_S = 60 * 5;
const CREDENTIALS = {
    key : fs.readFileSync('data/key/privatekey.pem'),
    cert : fs.readFileSync('data/key/certificate.pem'),
    requestCert : false,
    rejectUnauthorized : false
};

const MSG_CHAT_MESSAGE = 'chat/message';

const app = express();
const server = require('https').createServer(CREDENTIALS, app);
const io = require("socket.io")(server);

const AuthenticationSystem = require('./auth.js');
const auth = new AuthenticationSystem('data/db/myah.sqlite', {verbose : true});

app.use(express.json());
app.use(express.urlencoded({extended : true}));
app.use('/static', express.static(path.join(__dirname, 'public')));

// Routing
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public/login.html')); });
app.post('/auth', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const remember = req.body.remember;

    console.log(req.body);

    auth.authenticateUser(username, password).then(success => {
        // Create short-lived token by default, make it long-lived if remember set to true
        const token_ttl = (remember === 'on') ? AUTH_TOKEN_TTL_S : AUTH_TOKEN_TTL_SHORT_LIVED_S;
        const token = auth.createAuthenticationToken(username, token_ttl);

        res.json({success : success, token : token});
        res.end();
    });
});

io.on('connection', (socket) => {
    console.log(`Handling user connection, socket ID: ${socket.id}`);

    socket.on('disconnect', () => { console.log('user disconnected'); });

    socket.on(MSG_CHAT_MESSAGE, (msg) => { io.emit(MSG_CHAT_MESSAGE, msg); });
});

server.listen(PORT, () => { console.log(`https://localhost:${PORT}`); });