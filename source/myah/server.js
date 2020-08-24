'use strict';

const fs = require("fs");
const path = require('path');
const express = require("express");
const cookie_parser = require('cookie-parser');

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
const Users = [];

app.use(cookie_parser());
app.use(express.json());
app.use(express.urlencoded({extended : true}));
app.use('/static', (req, res, next) => {
    // Prevent access to chat page from the static route
    if(req.url.match(/chat\.html/))
        res.status(403).end('403 Forbidden');
    else
        next();
});
app.use('/static', express.static(path.join(__dirname, 'public')));

// Routing
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public/login.html')); });
app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const remember = req.body.remember;

    if(!username || !password)
    {
        console.log('username or password empty. Cannot authenticate.');
        res.status(401).send({error : 'username and password fields are both required.'});
        return;
    }

    // Prevent connection if user already logged in
    let do_return = false;
    Users.filter(function(user) {
        if(user.username === username)
        {
            console.log(`User ${username} already connected.`);
            res.status(401).send({error : 'User already connected.'});
            do_return = true;
        }
    });
    if(do_return)
        return;

    auth.authenticateUser(username, password).then(success => {
        if(success)
        {
            console.log(`User ${username} authenticated.`);
            // Create short-lived token by default, make it long-lived if remember set to true
            const token_ttl = (remember === 'on') ? AUTH_TOKEN_TTL_S : AUTH_TOKEN_TTL_SHORT_LIVED_S;
            const token = auth.createAuthenticationToken(username, token_ttl);
            Users.push({username : username});

            res.cookie('username', username);
            res.cookie('auth_token', token);
            res.redirect('/chat');
        }
        else
        {
            console.log(`User ${username} failed to authenticate.`);
            res.status(401).send({error : 'User failed to authenticate.'});
        }
    });
});

app.get('/chat', (req, res) => {
    const token = req.cookies['auth_token'];
    const username = req.cookies['username'];

    if(!token || !username)
    {
        console.log('username or token empty. Cannot authenticate.');
        res.status(401).send({error : 'username and token fields are both required.'});
        return;
    }

    const decoded = auth.verifyAuthenticationToken(token);
    if(decoded && decoded.logged_in_as === username)
    {
        console.log(`User ${username} authenticated by token.`);
        res.sendFile(path.join(__dirname, 'public/chat.html'));
    }
    else
    {
        console.log(`User ${username} failed to authenticate.`);
        res.status(401).send({error : 'User failed to authenticate.'});
    }
});

io.on('connection', (socket) => {
    console.log(`Handling user connection, socket ID: ${socket.id}`);

    socket.on('disconnect', () => { console.log('user disconnected'); });

    socket.on(MSG_CHAT_MESSAGE, (msg) => { io.emit(MSG_CHAT_MESSAGE, msg); });
});

server.listen(PORT, () => { console.log(`https://localhost:${PORT}`); });