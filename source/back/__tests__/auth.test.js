describe("The authentication system", () => {
    const AuthenticationSystem = require("../auth.js");
    const auth = new AuthenticationSystem(':memory:', {verbose: false});

    test("should not detect an unknown user as existing", () => {
        expect(auth.userExists('unknown_user')).toEqual(false);
    });

    test("should create a user with a name and password and be able to detect it", () => {
        return auth.createUser('test_user', 'test_password')
            .then(() => { expect(auth.userExists('test_user')).toEqual(true); });
    });

    test("should authenticate newly created user (good password given)", () => {
        return auth.authenticateUser('test_user', 'test_password')
            .then(success => { expect(success).toEqual(true); });
    });

    test("should not authenticate newly created user (wrong password given)", () => {
        return auth.authenticateUser('test_user', 'wrong_password')
            .then(success => { expect(success).toEqual(false); });
    });

    test("should not authenticate unknown user", () => {
        return auth.authenticateUser('unknown_user', 'random_password')
            .then(success => { expect(success).toEqual(false); });
    });

    test("should not create a new user if user name already exist", () => {
        auth.createUser('test_user', 'random_password')
            .then(task => { expect(task).toEqual(undefined); });
    });
});