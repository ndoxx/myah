'use strict';

const fs = require("fs");
const path = require('path');
const express = require("express");
const cookie_parser = require('cookie-parser');
const {v4 : uuidv4} = require('uuid');

const PORT = 8090;
const DATABASE_LOCATION = 'data/db/myah.sqlite';
const AUTH_TOKEN_TTL_S = 60 * 60 * 24 * 7;
const AUTH_TOKEN_TTL_SHORT_LIVED_S = 60 * 5;
const TLS_OPTIONS = {
    key : fs.readFileSync('data/key/privatekey.pem'),
    cert : fs.readFileSync('data/key/certificate.pem')
};
const FILE_SLICE_SIZE_B = 100000;

const app = express();
const server = require('https').createServer(TLS_OPTIONS, app);
const io = require("socket.io")(server);

const AuthenticationSystem = require('./auth.js');
const PostSystem = require('./post.js');
const auth = new AuthenticationSystem(DATABASE_LOCATION, {verbose : true});
const poster = new PostSystem(DATABASE_LOCATION, {verbose : true});
const Users = new Map();
const Sockets = new Map();

const FileTransferTasks = {};
const FileTransferData = {
    user : null,
    name : null,
    type : null,
    size : 0,
    data : [],
    slice : 0,
};

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
app.use('/share', express.static(path.join(__dirname, 'share')));

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
            console.log(`User '${username} already connected.`);
            serveStatus(res, 401, 'Unauthorized access.');
            do_return = true;
        }
    });
    if(do_return)
        return;

    auth.authenticateUser(username, password).then(success => {
        if(success)
        {
            console.log(`User '${username} authenticated.`);
            // Create short-lived token by default, make it long-lived if remember set to true
            const token_ttl = (remember === 'on') ? AUTH_TOKEN_TTL_S : AUTH_TOKEN_TTL_SHORT_LIVED_S;
            const token = auth.createAuthenticationToken(username, token_ttl);

            res.cookie('username', username);
            res.cookie('auth_token', token);
            res.redirect('/chat');
        }
        else
        {
            console.log(`User '${username}' failed to authenticate.`);
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
            disconnectUser(username);
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
        console.log(`User '${username}' authenticated by token.`);
        serveChatPage(res);
    }
    else
    {
        console.log(`User '${username}' failed to authenticate.`);
        serveLoginPage(res);
    }
});

// Handle handshake using a middleware
io.use(function(socket, next) {
    try
    {
        if(handshake(socket.handshake.query, socket.id))
        {
            next();
            return;
        }
    }
    catch(err)
    {
        console.error(err.message);
    }
    next(new Error('Authentication error, handshake failed.'));
});

io.on('connection', (socket) => {
    socket.broadcast.emit('user/connect', {username: Sockets.get(socket.id)});

    socket.on('disconnect', () => {
        socket.broadcast.emit('user/disconnect', {username: Sockets.get(socket.id)});
        removeUser(Sockets.get(socket.id));
        Sockets.delete(socket.id);
    });

    socket.on('chat/message', (pkt) => {
        // Set date, base64 encode, save to DB and broadcast
        pkt.timestamp = Date.now();
        const userid = Users.get(pkt.username).userid;
        const body_b64 = base64encode(pkt.payload);
        pkt.postid = poster.post(userid, pkt.timestamp, body_b64);
        io.emit('chat/message', pkt);
    });

    socket.on('chat/get', (pkt) => {
        const posts = poster.getLastPosts(pkt.last);
        // Userid to name table
        const names = new Map();
        posts.forEach(function(msg) {
            if(!names.has(msg.userid))
                names.set(msg.userid, auth.getUserName(msg.userid));
        });
        // Send base64 decoded messages back to client
        const out = {history : []};
        posts.forEach(function(msg) {
            out.history.push({
                postid : msg.id,
                username : names.get(msg.userid),
                payload : base64decode(msg.body),
                timestamp : msg.timestamp
            });
        });

        io.to(socket.id).emit('chat/history', out);
    });

    socket.on('chat/delete', (pkt) => {
        // Check that this post belongs to the user requiring its deletion
        const username = Sockets.get(socket.id);
        if(poster.checkAuthor(Users.get(username).userid, pkt.postid))
        {
            socket.broadcast.emit('chat/remove', {postid: pkt.postid});
            poster.deletePost(pkt.postid);
        }
    });

    socket.on('upload/slice', (data) => {
        if(!FileTransferTasks[data.name])
        {
            console.log(`Upload request for file: ${data.name} - ${data.type} - ${data.size}B by user '${data.user}'`);
            FileTransferTasks[data.name] = Object.assign({}, FileTransferData, data);
            FileTransferTasks[data.name].data = [];
        }

        console.log(`> Receiving slice ${FileTransferTasks[data.name].slice} of file: ${data.name}`);

        // convert the ArrayBuffer to Buffer
        data.data = Buffer.from(new Uint8Array(data.data));
        // save the data
        FileTransferTasks[data.name].data.push(data.data);
        FileTransferTasks[data.name].slice++;

        if(FileTransferTasks[data.name].slice * FILE_SLICE_SIZE_B >= FileTransferTasks[data.name].size)
        {
            console.log(`File transfer complete for: ${data.name}`);

            if(FileTransferTasks[data.name].slice * FILE_SLICE_SIZE_B >= FileTransferTasks[data.name].size)
            {
                const file_buffer = Buffer.concat(FileTransferTasks[data.name].data);
                const local_name = `${uuidv4()}-${data.name}`;

                fs.writeFile(path.join(__dirname, 'share', local_name), file_buffer, '', (err) => {
                    delete FileTransferTasks[data.name];
                    if(err)
                    {
                        console.error(`File write error for: ${local_name}`);
                        socket.emit('upload/error', {name : data.name});
                    }
                    else
                    {
                        console.log(`File saved locally as: ${local_name}`);
                        socket.emit('upload/end', {name : data.name, local : local_name});
                    }
                });
            }
        }
        else
        {
            console.log(`< Requiring slice ${FileTransferTasks[data.name].slice} of file: ${data.name}`);
            socket.emit('upload/request/slice', {name : data.name, currentSlice : FileTransferTasks[data.name].slice});
        }
    });
});

server.listen(PORT, () => { console.log(`https://localhost:${PORT}`); });

function handshake(handshake_query, socketid)
{
    const username = handshake_query.username;
    const token = handshake_query.token;

    console.log(`Beginning handshake for user '${username}'.`);
    if(token && username)
    {
        const decoded = auth.verifyAuthenticationToken(token);
        if(decoded && decoded.logged_in_as === username)
        {
            addUser(username, socketid);
            console.log(`Associated user '${username}' to socket ID '${socketid}'`);
            return true;
        }
    }

    console.error(`Failed to associate user '${username}' with token '${token}'.`);
    return false;
}

function addUser(username, socketid)
{
    if(!Users.has(username))
    {
        const userid = auth.getUserID(username);
        Users.set(username, {username : username, userid : userid, socketid : socketid});
        Sockets.set(socketid, username);
        console.log(`Added new user '${username}', userid: ${userid}.`);
    }
}

function disconnectUser(username)
{
    if(Users.has(username))
    {
        const user = Users.get(username);
        if(io.sockets.connected[user.socketid])
        {
            io.sockets.connected[user.socketid].disconnect();
            console.log(`User '${username}' disconnected.`);
        }
    }
    else
        console.error(`Tried to disconnect unknown user: ${username}`);
}

function removeUser(username)
{
    if(Users.has(username))
    {
        Users.delete(username);
        console.log(`Removed user '${username}'.`);
    }
    else
        console.error(`Tried to remove unknown user: ${username}`);
}

function serveStatus(res, sta, message) { res.status(sta).end(`<h1>${sta}</h1> <h2>${message}</h2>`); }

function serveLoginPage(res) { res.sendFile(path.join(__dirname, 'public/login.html')); }

function serveChatPage(res) { res.sendFile(path.join(__dirname, 'public/chat.html')); }

function base64encode(str) { return Buffer.from(str, 'utf8').toString('base64'); }

function base64decode(str) { return Buffer.from(str, 'base64').toString('utf8'); }
