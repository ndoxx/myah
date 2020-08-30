'use strict';

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
        this.log   = (options.log   ? options.log   : () => {});
        this.logDB = (options.logDB ? options.logDB : () => {});
        this.error = (options.error ? options.error : () => {});

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
        const SQL_GET_LAST_ID = `SELECT last_insert_rowid() as id`;
        try
        {
            this.db.prepare(SQL_INSERT_POST).run(userid, timestamp, body);
            return this.db.prepare(SQL_GET_LAST_ID).get().id;
        }
        catch(err)
        {
            this.error(err.message);
            return 0;
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
        const SQL_GET_POSTS = `SELECT * FROM posts ORDER BY id LIMIT ?`;
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

    checkAuthor(userid, postid)
    {
        const SQL_GET_POST_BY_ID = `SELECT userid FROM posts WHERE id = ?`;
        try
        {
            return (this.db.prepare(SQL_GET_POST_BY_ID).get(postid).userid === userid);
        }
        catch(err)
        {
            this.error(err.message);
        }
        return false;
    }
};