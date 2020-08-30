describe("The post system", () => {
    const PostSystem = require("../post.js");
    const poster = new PostSystem(':memory:', {verbose : false});

    test("should add a post when asked to", () => {
        poster.post(1, Date.now(), 'Plip');
        const last_post = poster.getLastPosts(1)[0];
        expect(last_post.id).toEqual(1);
        expect(last_post.body).toEqual('Plip');
    });

    test("should be able to retrieve the last posts in ascending order", () => {
        poster.post(1, Date.now(), 'Plop');
        poster.post(1, Date.now(), 'Plup');
        const last_posts = poster.getLastPosts(10);
        expect(last_posts.length).toEqual(3);
        expect(last_posts[0].body).toEqual('Plip');
    });

    test("should delete a post when asked to", () => {
        poster.deletePost(1);
        const last_posts = poster.getLastPosts(10);
        expect(last_posts.length).toEqual(2);
        expect(last_posts[1].body).toEqual('Plup');
    });

    test("should be able to delete all posts", () => {
        poster.clearPosts();
        const last_posts = poster.getLastPosts(10);
        expect(last_posts.length).toEqual(0);
    });
});