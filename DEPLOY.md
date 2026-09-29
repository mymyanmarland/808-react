# DEPLOY — 808 React → VPS

Target: port **3015**, subdomain e.g. `react.kmnapps.xyz` (pick the name with the user).

## 1. Copy to VPS

```bash
rsync -avz --exclude node_modules --exclude data.sqlite \
  ~/workspace/808-react/ root@vps:/opt/apps/808-react/
ssh root@vps "cd /opt/apps/808-react && npm install --omit=dev && node seed.js"
```

## 2. PM2

Add to `/opt/apps/ecosystem.config.js`:

```js
{
  name: '808-react',
  cwd: '/opt/apps/808-react',
  script: 'server.js',
  env: { PORT: 3015 },
},
```

Then: `pm2 update && pm2 save`

## 3. UFW + nginx + SSL

```bash
ufw allow 3015/tcp
```

Add an nginx server block for the chosen subdomain proxying to
`http://127.0.0.1:3015`, then:

```bash
certbot --nginx -d react.kmnapps.xyz
```

## Notes

- `data.sqlite` holds users + progress; back it up before reseeding
  (`node seed.js` wipes curriculum tables only — progress references steps by id,
  so reseeding orphans old progress rows; acceptable for MVP).
- The JSX playground loads React/Babel from unpkg CDN — the VPS needs no extra deps.
