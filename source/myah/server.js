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
const MSG_USER_ASSOCIATE = 'user/associate';

const app = express();
const server = require('https').createServer(CREDENTIALS, app);
const io = require("socket.io")(server);

const AuthenticationSystem = require('./auth.js');
const auth = new AuthenticationSystem('data/db/myah.sqlite', {verbose : true});
const Users = new Map();
const Sockets = new Map();

app.use(cookie_parser());
app.use(express.json());
app.use(express.urlencoded({extended : true}));
app.use('/static', (req, res, next) => {
    // Prevent access to html pages from the static route
    if(req.url.match(/^\/.+\.html/))
        serveStatus(res, 404, 'This page does not exist.');
    else
        next();
});
app.use('/static', express.static(path.join(__dirname, 'public')));

// Routing
app.get('/', (req, res) => { serveLoginPage(res); });
app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const remember = req.body.remember;

    if(!username || !password)
    {
        console.log('username or password empty. Cannot authenticate.');
        serveStatus(res, 401, 'Authentication failed.');
        return;
    }

    // Prevent connection if user already logged in
    let do_return = false;
    Users.forEach(function(user) {
        if(user.username === username)
        {
            console.log(`User ${username} already connected.`);
            serveStatus(res, 401, 'Unauthorized access.');
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
            addUser(username);

            res.cookie('username', username);
            res.cookie('auth_token', token);
            res.redirect('/chat');
        }
        else
        {
            console.log(`User ${username} failed to authenticate.`);
            serveStatus(res, 401, 'Authentication failed.');
        }
    });
});

app.post('/logout', (req, res) => {
    const token = req.cookies['auth_token'];
    const username = req.cookies['username'];

    if(token && username)
    {
        const decoded = auth.verifyAuthenticationToken(token);
        if(decoded && decoded.logged_in_as === username)
        {
            console.log(`User '${username}' logged out.`);
            removeUserByName(username);
            serveLoginPage(res);
        }
        else
            console.error(`Tried to logout user '${username}' with invalid token.`);
    }
    else
        console.error(`Tried to logout user '${username}' with empty token.`);
});

app.get('/chat', (req, res) => {
    const token = req.cookies['auth_token'];
    const username = req.cookies['username'];

    if(!token || !username)
    {
        console.log('username or token empty. Cannot authenticate.');
        serveLoginPage(res);
        return;
    }

    const decoded = auth.verifyAuthenticationToken(token);
    if(decoded && decoded.logged_in_as === username)
    {
        console.log(`User ${username} authenticated by token.`);
        addUser(username);
        serveChatPage(res);
    }
    else
    {
        console.log(`User ${username} failed to authenticate.`);
        serveLoginPage(res);
    }
});

io.on('connection', (socket) => {
    console.log(`Handling user connection, socket ID: ${socket.id}`);

    socket.on('disconnect', () => {
        removeUserBySocketID(socket.id);
        Sockets.delete(socket.id);
    });

    socket.on(MSG_USER_ASSOCIATE, (msg) => { associateUser(msg.username, socket.id); });

    socket.on(MSG_CHAT_MESSAGE, (msg) => {
        // Set date, save to DB and broadcast
        io.emit(MSG_CHAT_MESSAGE, msg);
    });
});

server.listen(PORT, () => { console.log(`https://localhost:${PORT}`); });

function addUser(username)
{
    if(!Users.has(username))
    {
        Users.set(username, {username : username});
        console.log(`Added new user '${username}'.`);
    }
}

function removeUserBySocketID(socketid)
{
    if(Sockets.has(socketid))
    {
        const username = Sockets.get(socketid);
        Users.delete(username);
        console.log(`User ${username} disconnected.`);
    }
    else
        console.error(`Tried to disconnect unknown socket ID: ${socketid}`);
}

function removeUserByName(username)
{
    if(Users.has(username))
    {
        Users.delete(username);
        console.log(`User ${username} disconnected.`);
    }
    else
        console.error(`Tried to disconnect unknown user: ${username}`);
}

function associateUser(username, socketid)
{
    // On client-side socket reconnect due to server restart, we need
    // to add the user back
    addUser(username);
    Users.get(username).socketid = socketid;
    Sockets.set(socketid, username);
    console.log(`Associated user '${username}' to socket ID '${socketid}'`);
}

function serveStatus(res, sta, message)
{
    res.status(sta).end(`<h1>${sta}</h1> <h2>${message}</h2>`);
}

function serveLoginPage(res)
{
    res.sendFile(path.join(__dirname, 'public/login.html'));
}

function serveChatPage(res)
{
    res.sendFile(path.join(__dirname, 'public/chat.html'));
}