const whitelist = [
  "http://localhost:3001",
  "https://channels.social",
  "https://chips.org.in",
  "https://channelsbychips.site",
  "https://api.channels.social",
];

const regexWhitelist = [
  /^https:\/\/.*\.channels\.social$/,
  /^https:\/\/.*\.chips\.org\.in$/,
];

const allowedHeaders = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "Accept",
  "Origin",
  "X-CSRF-Token",
  "auth-token",
];

const corsOptionsDelegate = function (req, callback) {
  const origin = req.header("Origin");
  const method = req.method;
  const path = req.path;

  const requestedMethod = req.header("Access-Control-Request-Method");

  if (!origin) {
    return callback(null, { origin: false });
  }

  if (method === "GET" || (method === "OPTIONS" && requestedMethod === "GET")) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ["GET", "OPTIONS"],
      allowedHeaders,
      maxAge: 86400,
    });
  }

  const publicPostRoutes = ["/api/verify/api/key", "/verify/api/key"];

  if (
    whitelist.includes(origin) ||
    regexWhitelist.some((regex) => regex.test(origin))
  ) {
    return callback(null, {
      origin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders,
      maxAge: 86400,
    });
  }

  if (
    (method === "POST" ||
      (method === "OPTIONS" && requestedMethod === "POST")) &&
      publicPostRoutes.some((route) => path.startsWith(route))
  ) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ["POST", "OPTIONS"],
      allowedHeaders,
      maxAge: 86400,
    });
  }

  

  return callback(new Error(`Not allowed by CORS for origin ${origin} with method ${method} and path ${path}`));
};

module.exports = {
  corsOptionsDelegate,
};
