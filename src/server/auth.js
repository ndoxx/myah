'use strict';

const fs = require("fs");
const jwt = require('jsonwebtoken');
const bcrypt = require("bcrypt");
const Database = require("better-sqlite3");
const {v4 : uuidv4} = require('uuid');

const PASSWORD_HASH_SALT_ROUNDS = 10;
const PRIVATE_JWT_RSA_KEY_PATH = 'data/key/jwtRS256.key';

module.exports = class AuthenticationSystem
{
    constructor(db_location, options)
    {
        this.log   = (options.log   ? options.log   : () => {});
        this.logDB = (options.logDB ? options.logDB : () => {});
        this.error = (options.error ? options.error : () => {});
        
        this.log("Launching authentication system...");
        this.initDatabase(db_location);
        this.log("done.");
    }

    initDatabase(db_location)
    {
        try
        {
            this.db = new Database(db_location, {verbose : this.logDB});
        }
        catch(err)
        {
            this.error(err.message);
        }

        // Check that users table exists, if not, create it
        const SQL_CREATE_USERS_TABLE = `CREATE TABLE IF NOT EXISTS users (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            username VARCHAR(256) NOT NULL,
            password CHAR(60)
        )`;

        try
        {
            this.db.prepare(SQL_CREATE_USERS_TABLE).run();
        }
        catch(err)
        {
            this.error(err.message);
        }
    }

    createUser(username, password)
    {
        if(this.userExists(username))
        {
            this.error(`User ${username} already exists.`);
            return new Promise(function(resolve) { resolve(undefined); });
        }
        else
        {
            return bcrypt.hash(password, PASSWORD_HASH_SALT_ROUNDS)
                .then(hash => {
                    const SQL_CREATE_USER = `INSERT INTO users (username, password) VALUES (?, ?)`;
                    try
                    {
                        const stmt = this.db.prepare(SQL_CREATE_USER);
                        stmt.run(username, hash);
                    }
                    catch(err)
                    {
                        this.error(err.message);
                    }
                })
                .catch(err => this.error(err.message));
        }
    }

    authenticateUser(username, password)
    {
        const SQL_GET_USER_BY_NAME = `SELECT * FROM users WHERE username = ?`;
        try
        {
            const stmt = this.db.prepare(SQL_GET_USER_BY_NAME);
            const result = stmt.get(username);
            if(result === undefined)
                this.log(`Cannot authenticate unknown user: ${username}`);
            else
                return bcrypt.compare(password, result.password).catch(err => this.error(err.message));
        }
        catch(err)
        {
            this.error(err.message);
        }
        return new Promise(function(resolve) { resolve(false); });
    }

    createAuthenticationToken(username, duration_s)
    {
        if(this.userExists(username))
        {
            // Signe a JSON web token using private key
            const private_key = fs.readFileSync(PRIVATE_JWT_RSA_KEY_PATH);
            const iat = Math.floor(Date.now() / 1000);
            const expiration_date = iat + duration_s;
            const payload = {logged_in_as : username, exp : expiration_date, iat : iat};
            const token_id = uuidv4();
            const token = jwt.sign(payload, private_key, {algorithm : 'RS256', jwtid : token_id});

            // NOTE(ndx):
            // We keep JWTs stateless and don't save claims in the database
            // at the moment, because we don't support token revocation.

            return token;
        }
        else
            return undefined;
    }

    verifyAuthenticationToken(token)
    {
        const private_key = fs.readFileSync(PRIVATE_JWT_RSA_KEY_PATH);
        try
        {
            const decoded = jwt.verify(token, private_key, {algorithms : 'RS256'});
            return decoded;
        }
        catch(err)
        {
            this.error(err.message);
        }
        return undefined;
    }

    userExists(username)
    {
        const SQL_GET_USER_BY_NAME = `SELECT username FROM users WHERE username = ?`;

        try
        {
            const stmt = this.db.prepare(SQL_GET_USER_BY_NAME);
            const result = stmt.get(username);
            return (result !== undefined);
        }
        catch(err)
        {
            this.error(err.message);
        }
        return false;
    }

    getUserID(username)
    {
        const SQL_GET_USER_BY_NAME = `SELECT * FROM users WHERE username = ?`;
        
        try
        {
            const stmt = this.db.prepare(SQL_GET_USER_BY_NAME);
            const result = stmt.get(username);
            if(result)
                return result.id;
        }
        catch(err)
        {
            this.error(err.message);
        }
        return undefined;
    }

    getUserName(userid)
    {
        const SQL_GET_USER_BY_ID = `SELECT * FROM users WHERE id = ?`;
        
        try
        {
            const stmt = this.db.prepare(SQL_GET_USER_BY_ID);
            const result = stmt.get(userid);
            if(result)
                return result.username;
        }
        catch(err)
        {
            this.error(err.message);
        }
        return undefined;
    }
};
