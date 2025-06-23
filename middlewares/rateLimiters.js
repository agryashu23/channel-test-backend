const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 1500, 
    message: 'Too many requests from this IP, please try again after 15 minutes'
});

const authLimiter = rateLimit({
    windowMs: 30 * 60 * 1000, 
    max: 50, 
    message: 'Too many authentication attempts, please try again after an hour'
});

const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: 'Too many OTP requests, please try again after 10 minutes'
});

const usernameLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 100, 
    message: 'Too many username check requests, please try again after 15 minutes'
});

const whatsappLimiter = rateLimit({
    windowMs: 30 * 60 * 1000, 
    max: 10,
    message: 'Too many WhatsApp verification attempts, please try again after an hour'
});

module.exports = {
    globalLimiter,
    authLimiter,
    otpLimiter,
    usernameLimiter,
    whatsappLimiter
}; 