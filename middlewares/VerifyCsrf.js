const csrf = require("csrf");
const tokens = new csrf();

const csrfMiddleware = (req, res, next) => {
  next();
  // if (req.method === "GET") {
  //   return next();
  // }
  // if (req.method === "POST") {
  //   return next();
  // }

  // try {
  //   const csrfSecret = req.cookies.csrfSecret;
  //   const csrfToken = req.headers["x-csrf-token"];
  //   if (!csrfSecret || !csrfToken) {
  //     return res.status(403).json({ error: "CSRF token missing or invalid" });
  //   }
  //   if (!tokens.verify(csrfSecret, csrfToken)) {
  //     return res.status(403).json({ error: "Invalid CSRF token" });
  //   }
  //   next();
  // } catch (error) {
  //   console.error("Error in CSRF middleware:", error);
  //   res.status(403).json({ error: "CSRF validation failed" });
  // }
};

module.exports = csrfMiddleware;
