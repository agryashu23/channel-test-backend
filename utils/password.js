const crypto = require('crypto');

exports.hashPassword = function(password) {
    var salt = crypto.randomBytes(128).toString('base64');
    var iterations = 10000;
    var hash = crypto.pbkdf2Sync(password, salt, iterations,128,'sha512');
    hash = hash.toString('hex')

    return {
        salt: salt,
        hash: hash,
        iterations: iterations
    };
}

exports.isPasswordCorrect = function (savedHash, savedSalt, savedIterations, passwordAttempt) {
    return savedHash == crypto.pbkdf2Sync(passwordAttempt, savedSalt, savedIterations,128,'sha512').toString('hex');
}