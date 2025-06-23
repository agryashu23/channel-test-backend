require("dotenv").config();
const jwt = require("jsonwebtoken");

function VerifyUser(req, res, next) {
  const authToken = req.headers["auth-token"];
  // const authToken = req.cookies['token'];
  if (authToken == null) {
    return res.status(401).json({ auth: false, message: "Access-denied" });
  }

  try {
    const verified = jwt.verify(authToken, process.env.AUTH_SECRET);
    res.locals.verified_user_id = verified._id;
    res.locals.verified_name = verified.name;
    res.locals.verified_email = verified.email;
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid-token" });
  }
}

module.exports = VerifyUser;
