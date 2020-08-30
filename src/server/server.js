'use strict';

// Env
// Check production / development mode
const PRODUCTION = (process.env.NODE_ENV === 'production');
// Check if PORT environment variable has been set, if not, use fallback
const PORT = (process.env.PORT || 8080);
// Check verbosity
const VERBOSE = (process.env.VERBOSITY === 'verbose');
const log__    = (VERBOSE ? (text) => { console.log(text); } : () => {});
const error__  = (VERBOSE ? (text) => { console.error(`\x1b[31m${text}\x1b[0m`); } : () => {});
const log_db__ = (VERBOSE ? (text) => { console.log(`\x1b[36m${text}\x1b[0m`); } : () => {});
// Change visible process title (as output by 'ps a')
process.title = (PRODUCTION ? 'node-myah' : 'node-myah-dev');


const fs = require("fs");
const path = require('path');
const express = require("express");
const cookie_parser = require('cookie-parser');
const {v4 : uuidv4} = require('uuid');

const DATABASE_LOCATION = 'data/db/myah.sqlite';
const AUTH_TOKEN_TTL_S = 60 * 60 * 24 * 7;
const AUTH_TOKEN_TTL_SHORT_LIVED_S = 60 * 5;
const TLS_OPTIONS = {
    key : fs.readFileSync('data/key/privatekey.pem'),
    cert : fs.readFileSync('data/key/certificate.pem')
};
const FILE_SLICE_MIN_SIZE_B = 100000;
const FILE_SLICE_MAX_SIZE_B = 1000000;

Math.clamp = (a, b, c) => { return Math.max(b,Math.min(a,c)); };

const AuthenticationSystem = require('./auth.js');
const PostSystem = require('./post.js');
const Auth = new AuthenticationSystem(DATABASE_LOCATION, {log: log__, logDB: log_db__, error: error__});
const Poster = new PostSystem(DATABASE_LOCATION, {log: log__, logDB: log_db__, error: error__});
const Users = new Map();
const Sockets = new Map();

const FileTransferTasks = {};
const FileTransferData = {
    user : null,
    name : null,
    type : null,
    size : 0,
    data : [],
    slice_size : FILE_SLICE_MIN_SIZE_B,
    slice : 0,
};

// App
const app = express();
const server = require('https').createServer(TLS_OPTIONS, app);
const io = require("socket.io")(server);

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
app.use('/static', express.static(path.join(__dirname, '../public')));
app.use('/share', express.static(path.join(__dirname, 'share')));
app.get('/', (req, res) => { serveLoginPage(res); });

app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const remember = req.body.remember;

    if(!username || !password)
    {
        log__('username or password empty. Cannot authenticate.');
        serveStatus(res, 401, 'Authentication failed.');
        return;
    }

    // Prevent connection if user already logged in
    let do_return = false;
    Users.forEach(function(user) {
        if(user.username === username)
        {
            log__(`User '${username} already connected.`);
            serveStatus(res, 401, 'Unauthorized access.');
            do_return = true;
        }
    });
    if(do_return)
        return;

    Auth.authenticateUser(username, password).then(success => {
        if(success)
        {
            log__(`User '${username} authenticated.`);
            // Create short-lived token by default, make it long-lived if remember set to true
            const token_ttl = (remember === 'on') ? AUTH_TOKEN_TTL_S : AUTH_TOKEN_TTL_SHORT_LIVED_S;
            const token = Auth.createAuthenticationToken(username, token_ttl);

            res.cookie('username', username);
            res.cookie('auth_token', token);
            res.redirect('/chat');
        }
        else
        {
            log__(`User '${username}' failed to authenticate.`);
            serveStatus(res, 401, 'Authentication failed.');
        }
    });
});

app.post('/logout', (req, res) => {
    const token = req.cookies['auth_token'];
    const username = req.cookies['username'];

    if(token && username)
    {
        const decoded = Auth.verifyAuthenticationToken(token);
        if(decoded && decoded.logged_in_as === username)
        {
            log__(`User '${username}' logged out.`);
            disconnectUser(username);
            serveLoginPage(res);
        }
        else
            error__(`Tried to logout user '${username}' with invalid token.`);
    }
    else
        error__(`Tried to logout user '${username}' with empty token.`);
});

app.get('/chat', (req, res) => {
    const token = req.cookies['auth_token'];
    const username = req.cookies['username'];

    if(!token || !username)
    {
        log__('username or token empty. Cannot authenticate.');
        serveLoginPage(res);
        return;
    }

    const decoded = Auth.verifyAuthenticationToken(token);
    if(decoded && decoded.logged_in_as === username)
    {
        log__(`User '${username}' authenticated by token.`);
        serveChatPage(res);
    }
    else
    {
        log__(`User '${username}' failed to authenticate.`);
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
        error__(err.message);
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
        pkt.postid = Poster.post(userid, pkt.timestamp, body_b64);
        io.emit('chat/message', pkt);
    });

    socket.on('chat/get', (pkt) => {
        const posts = Poster.getLastPosts(pkt.last);
        // Userid to name table
        const names = new Map();
        posts.forEach(function(msg) {
            if(!names.has(msg.userid))
                names.set(msg.userid, Auth.getUserName(msg.userid));
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
        if(Poster.checkAuthor(Users.get(username).userid, pkt.postid))
        {
            socket.broadcast.emit('chat/remove', {postid: pkt.postid});
            Poster.deletePost(pkt.postid);
        }
    });

    socket.on('upload/slice', (data) => {
        if(!FileTransferTasks[data.name])
        {
            log__(`Upload request for file: ${data.name} - ${data.type} - ${data.size}B by user '${data.user}'`);
            FileTransferTasks[data.name] = Object.assign({}, FileTransferData, data);
            FileTransferTasks[data.name].data = [];
            FileTransferTasks[data.name].slice_size = Math.clamp(FileTransferTasks[data.name].slice_size, FILE_SLICE_MIN_SIZE_B, FILE_SLICE_MAX_SIZE_B);
        }

        log__(`> Receiving slice ${FileTransferTasks[data.name].slice} of file: ${data.name}`);

        // convert the ArrayBuffer to Buffer
        data.data = Buffer.from(new Uint8Array(data.data));
        // save the data
        FileTransferTasks[data.name].data.push(data.data);
        FileTransferTasks[data.name].slice++;

        if(FileTransferTasks[data.name].slice * FileTransferTasks[data.name].slice_size >= FileTransferTasks[data.name].size)
        {
            log__(`File transfer complete for: ${data.name}`);

            const file_buffer = Buffer.concat(FileTransferTasks[data.name].data);
            const local_name = `${uuidv4()}-${data.name}`;

            fs.writeFile(path.join(__dirname, 'share', local_name), file_buffer, '', (err) => {
                delete FileTransferTasks[data.name];
                if(err)
                {
                    error__(`File write error for: ${local_name}`);
                    socket.emit('upload/error', {name : data.name});
                }
                else
                {
                    log__(`File saved locally as: ${local_name}`);
                    socket.emit('upload/end', {name : data.name, local : local_name});
                }
            });
        }
        else
        {
            log__(`< Requiring slice ${FileTransferTasks[data.name].slice} of file: ${data.name}`);
            socket.emit('upload/request/slice', {name : data.name, currentSlice : FileTransferTasks[data.name].slice});
        }
    });
});

server.listen(PORT, () => { log__(`https://localhost:${PORT}`); });


function handshake(handshake_query, socketid)
{
    const username = handshake_query.username;
    const token = handshake_query.token;

    log__(`Beginning handshake for user '${username}'.`);
    if(token && username)
    {
        const decoded = Auth.verifyAuthenticationToken(token);
        if(decoded && decoded.logged_in_as === username)
        {
            addUser(username, socketid);
            log__(`Associated user '${username}' to socket ID '${socketid}'`);
            return true;
        }
    }

    error__(`Failed to associate user '${username}' with token '${token}'.`);
    return false;
}

function addUser(username, socketid)
{
    if(!Users.has(username))
    {
        const userid = Auth.getUserID(username);
        Users.set(username, {username : username, userid : userid, socketid : socketid});
        Sockets.set(socketid, username);
        log__(`Added new user '${username}', userid: ${userid}.`);
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
            log__(`User '${username}' disconnected.`);
        }
    }
    else
        error__(`Tried to disconnect unknown user: ${username}`);
}

function removeUser(username)
{
    if(Users.has(username))
    {
        Users.delete(username);
        log__(`Removed user '${username}'.`);
    }
    else
        error__(`Tried to remove unknown user: ${username}`);
}

function serveStatus(res, sta, message) { res.status(sta).end(`<h1>${sta}</h1> <h2>${message}</h2>`); }

function serveLoginPage(res) { res.sendFile(path.join(__dirname, '../public/login.html')); }

function serveChatPage(res) { res.sendFile(path.join(__dirname, '../public/chat.html')); }

function base64encode(str) { return Buffer.from(str, 'utf8').toString('base64'); }

function base64decode(str) { return Buffer.from(str, 'base64').toString('utf8'); }
