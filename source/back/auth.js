'use strict';

const bcrypt = require("bcrypt");
const Database = require("better-sqlite3");
const PASSWORD_HASH_SALT_ROUNDS = 10;

module.exports = class AuthenticationSystem
{
    constructor(db_location, options)
    {
        if(options.verbose)
        {
            this.log   = (text) => { console.log(text); };
            this.error = (text) => { console.error(text); };
        }
        else
        {
            this.log   = () => { };
            this.error = () => { };
        }
        this.log("Launching authentication server...");
        this.initDatabase(db_location);
        this.log("done.");
    }

    initDatabase(db_location)
    {
        try {
            this.db = new Database(db_location, { verbose: this.log });
        } catch(err) {
            this.error(err.message);
        }

        // Check that users table exists, if not, create it
        const SQL_CREATE_USER_TABLE = 
        `CREATE TABLE IF NOT EXISTS users (
            userid INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            username VARCHAR(256) NOT NULL,
            password CHAR(60)
        )`;

        try {
            this.db.prepare(SQL_CREATE_USER_TABLE).run();
        } catch(err) {
            this.error(err.message);
        }
    }

    createUser(user_name, password)
    {
        if(this.userExists(user_name))
        {
            this.error(`User ${user_name} already exists.`);
            return new Promise(function(resolve) { resolve(undefined); });
        }
        else
        {
            return bcrypt.hash(password, PASSWORD_HASH_SALT_ROUNDS)
                .then(hash => {
                    const SQL_CREATE_USER = `INSERT INTO users (username, password) VALUES (?, ?)`;
                    try {
                        const stmt = this.db.prepare(SQL_CREATE_USER);
                        stmt.run(user_name, hash);
                    } catch(err) {
                        this.error(err.message);
                    }
                })
                .catch(err => this.error(err.message));
        }
    }

    authenticateUser(user_name, password)
    {
        const SQL_GET_USER_BY_NAME = `SELECT * FROM users WHERE username = ?`;
        try {
            const stmt = this.db.prepare(SQL_GET_USER_BY_NAME);
            const result = stmt.get(user_name);
            if(result === undefined)
                this.log(`Cannot authenticate unknown user: ${user_name}`);
            else
                return bcrypt.compare(password, result.password).catch(err => this.error(err.message));
        } catch(err) {
            this.error(err.message);
        }
        return new Promise(function(resolve) { resolve(false); });
    }

    userExists(user_name)
    {
        const SQL_GET_USER_BY_NAME = `SELECT username FROM users WHERE username = ?`;

        try {
            const stmt = this.db.prepare(SQL_GET_USER_BY_NAME);
            const result = stmt.get(user_name);
            return (result !== undefined);
        } catch(err) {
            this.error(err.message);
        }
        return false;
    }
};
