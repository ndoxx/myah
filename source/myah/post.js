'use strict';

const fs = require("fs");
const Database = require("better-sqlite3");

const SQL_CREATE_POSTS_TABLE =
`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    userid INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    body TEXT
)`;

module.exports = class PostSystem
{
    constructor(db_location, options)
    {
        if(options.verbose)
        {
            this.log = (text) => { console.log(text); };
            this.logDB = (text) => { console.log(`\x1b[36m${text}\x1b[0m`); };
            this.error = (text) => { console.error(`\x1b[31m${text}\x1b[0m`); };
        }
        else
        {
            this.log = () => {};
            this.logDB = () => {};
            this.error = () => {};
        }
        this.log("Launching post system...");
        this.initDatabase(db_location);
        this.log("done.");
    }

    initDatabase(db_location)
    {
        try
        {
            this.db = new Database(db_location, {verbose : this.logDB});
            this.db.prepare(SQL_CREATE_POSTS_TABLE).run();
        }
        catch(err)
        {
            this.error(err.message);
        }
    }

    post(userid, timestamp, body)
    {
        const SQL_INSERT_POST = `INSERT INTO posts (userid, timestamp, body) VALUES (?, ?, ?)`;
        try
        {
            const stmt = this.db.prepare(SQL_INSERT_POST);
            stmt.run(userid, timestamp, body);
        }
        catch(err)
        {
            this.error(err.message);
        }
    }

    deletePost(postid)
    {
        const SQL_DELETE_POST = `DELETE FROM posts WHERE id = ?`;
        try
        {
            const stmt = this.db.prepare(SQL_DELETE_POST);
            stmt.run(postid);
        }
        catch(err)
        {
            this.error(err.message);
        }
    }

    getLastPosts(count)
    {
        const SQL_GET_POSTS = `SELECT * FROM posts ORDER BY id DESC LIMIT ?`;
        try
        {
            const stmt = this.db.prepare(SQL_GET_POSTS);
            return stmt.all(count);
        }
        catch(err)
        {
            this.error(err.message);
        }
        return undefined;
    }

    clearPosts()
    {
        const SQL_TRUNCATE_POSTS = `DROP TABLE posts`;
        try
        {
            this.db.prepare(SQL_TRUNCATE_POSTS).run();
            this.db.prepare(SQL_CREATE_POSTS_TABLE).run();
        }
        catch(err)
        {
            this.error(err.message);
        }
    }
};