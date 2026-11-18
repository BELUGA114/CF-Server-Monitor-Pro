export const checkAuth = (req, apiSecret) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return false;
  const [scheme, encoded] = authHeader.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = atob(encoded);
  const [username, password] = decoded.split(':');
  return username === 'admin' && password === apiSecret;
};

export const authResponse = (realmTitle) => new Response('Unauthorized', {
    status: 401, headers: { 'WWW-Authenticate': `Basic realm="${realmTitle}"` }
});
